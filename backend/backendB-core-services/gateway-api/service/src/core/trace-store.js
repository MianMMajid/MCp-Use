import { randomUUID } from "node:crypto";
import { parsePositiveInt, parsePositiveMs } from "./trace-store-config.js";
import { loadPersistedTracesIntoIndex, persistTrace, removePersistedTrace, } from "./trace-store-persistence.js";
import { pruneTraceStore } from "./trace-store-prune.js";
const PRUNE_DEBOUNCE_MS = 5000;
export class TraceStore {
    traces = new Map();
    sessionIndex = new Map();
    ownerIndex = new Map(); // keyFingerprint → Set<traceId>
    maxTraces;
    maxTracesPerSession;
    ttlMs;
    persistence;
    _pruneTimer = null;
    constructor(options = {}, env = process.env) {
        this.maxTraces = options.maxTraces ?? parsePositiveInt(env.MAPLE_MAX_TRACES, 2000);
        this.maxTracesPerSession =
            options.maxTracesPerSession ?? parsePositiveInt(env.MAPLE_MAX_TRACES_PER_SESSION, 250);
        this.ttlMs = options.ttlMs ?? parsePositiveMs(env.MAPLE_TRACE_TTL_MS, 1000 * 60 * 60 * 24);
        this.persistence = options.persistence;
    }
    async init() {
        await loadPersistedTracesIntoIndex({
            persistence: this.persistence,
            traces: this.traces,
            sessionIndex: this.sessionIndex,
        });
        this.pruneStoreImmediate();
    }
    createTrace(base, ownerKeyFingerprint) {
        const now = new Date().toISOString();
        const trace = {
            ...base,
            id: randomUUID(),
            ownerKeyFingerprint: ownerKeyFingerprint ?? base.ownerKeyFingerprint,
            startedAt: now,
            updatedAt: now,
        };
        this.upsertTrace(trace, ownerKeyFingerprint);
        return trace;
    }
    upsertTrace(trace, ownerKeyFingerprint) {
        if (ownerKeyFingerprint) {
            if (trace.ownerKeyFingerprint && trace.ownerKeyFingerprint !== ownerKeyFingerprint) {
                throw new Error("Trace ownership mismatch.");
            }
            trace.ownerKeyFingerprint = ownerKeyFingerprint;
        }
        trace.updatedAt = new Date().toISOString();
        this.traces.set(trace.id, trace);
        const bySession = this.sessionIndex.get(trace.sessionId) ?? [];
        if (!bySession.includes(trace.id)) {
            bySession.push(trace.id);
            this.sessionIndex.set(trace.sessionId, bySession);
        }
        if (trace.ownerKeyFingerprint) {
            let owned = this.ownerIndex.get(trace.ownerKeyFingerprint);
            if (!owned) {
                owned = new Set();
                this.ownerIndex.set(trace.ownerKeyFingerprint, owned);
            }
            owned.add(trace.id);
        }
        persistTrace(this.persistence, trace);
        this.pruneStore();
        return trace;
    }
    getTrace(traceId, ownerKeyFingerprint) {
        const trace = this.traces.get(traceId);
        if (!trace) {
            return undefined;
        }
        if (!this.matchesOwner(trace, ownerKeyFingerprint)) {
            return undefined;
        }
        return trace;
    }
    getLatestTraceBySession(sessionId, ownerKeyFingerprint) {
        const traceIds = this.sessionIndex.get(sessionId);
        if (!traceIds || traceIds.length === 0) {
            return undefined;
        }
        return traceIds
            .map((traceId) => this.traces.get(traceId))
            .filter((trace) => {
            if (!trace) {
                return false;
            }
            return this.matchesOwner(trace, ownerKeyFingerprint);
        })
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    }
    listTraces(limit = 20, sessionId, ownerKeyFingerprint) {
        const pool = sessionId
            ? (this.sessionIndex.get(sessionId) ?? [])
                .map((traceId) => this.traces.get(traceId))
                .filter((trace) => trace && this.matchesOwner(trace, ownerKeyFingerprint))
            : [...this.traces.values()]
                .filter((trace) => this.matchesOwner(trace, ownerKeyFingerprint));
        return pool
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
            .slice(0, limit);
    }
    listSessionIds(ownerKeyFingerprint) {
        if (!ownerKeyFingerprint) {
            return [...this.sessionIndex.keys()];
        }
        const ownedTraceIds = this.ownerIndex.get(ownerKeyFingerprint);
        if (!ownedTraceIds || ownedTraceIds.size === 0) {
            return [];
        }
        const sessionIds = new Set();
        for (const traceId of ownedTraceIds) {
            const trace = this.traces.get(traceId);
            if (trace) sessionIds.add(trace.sessionId);
        }
        return [...sessionIds];
    }
    appendSteps(traceId, steps, ownerKeyFingerprint) {
        const trace = this.getTrace(traceId, ownerKeyFingerprint);
        if (!trace) {
            return undefined;
        }
        const nextIndexStart = trace.steps.length;
        const normalized = steps.map((step, offset) => ({
            ...step,
            index: nextIndexStart + offset,
        }));
        trace.steps.push(...normalized);
        return this.upsertTrace(trace, ownerKeyFingerprint);
    }
    setGuardAction(traceId, stepIndex, action, reason, ownerKeyFingerprint) {
        const trace = this.getTrace(traceId, ownerKeyFingerprint);
        if (!trace) {
            return undefined;
        }
        const step = trace.steps[stepIndex];
        if (!step) {
            return undefined;
        }
        step.guardStatus = action;
        step.metadata = {
            ...(step.metadata ?? {}),
            guardReason: reason,
            guardUpdatedAt: new Date().toISOString(),
        };
        if (action === "block") {
            trace.status = "quarantined";
        }
        else if (action === "allow") {
            const hasBlockedStep = trace.steps.some((candidate) => candidate.guardStatus === "block");
            if (!hasBlockedStep) {
                trace.status = "active";
            }
        }
        return this.upsertTrace(trace, ownerKeyFingerprint);
    }
    deleteTrace(traceId, ownerKeyFingerprint) {
        const trace = this.getTrace(traceId, ownerKeyFingerprint);
        if (!trace) {
            return false;
        }
        this.removeTrace(trace.id);
        return true;
    }
    matchesOwner(trace, ownerKeyFingerprint) {
        if (!ownerKeyFingerprint) {
            return true;
        }
        return trace.ownerKeyFingerprint === ownerKeyFingerprint;
    }
    pruneStore() {
        if (this._pruneTimer) return;
        this._pruneTimer = setTimeout(() => {
            this._pruneTimer = null;
            pruneTraceStore({
                traces: this.traces,
                sessionIndex: this.sessionIndex,
                maxTraces: this.maxTraces,
                maxTracesPerSession: this.maxTracesPerSession,
                ttlMs: this.ttlMs,
                removeTrace: (traceId) => this.removeTrace(traceId),
            });
        }, PRUNE_DEBOUNCE_MS);
        if (this._pruneTimer.unref) this._pruneTimer.unref();
    }
    pruneStoreImmediate() {
        if (this._pruneTimer) {
            clearTimeout(this._pruneTimer);
            this._pruneTimer = null;
        }
        pruneTraceStore({
            traces: this.traces,
            sessionIndex: this.sessionIndex,
            maxTraces: this.maxTraces,
            maxTracesPerSession: this.maxTracesPerSession,
            ttlMs: this.ttlMs,
            removeTrace: (traceId) => this.removeTrace(traceId),
        });
    }
    removeTrace(traceId) {
        const trace = this.traces.get(traceId);
        if (!trace) {
            return;
        }
        this.traces.delete(traceId);
        const bySession = this.sessionIndex.get(trace.sessionId) ?? [];
        const next = bySession.filter((id) => id !== traceId);
        if (next.length > 0) {
            this.sessionIndex.set(trace.sessionId, next);
        }
        else {
            this.sessionIndex.delete(trace.sessionId);
        }
        if (trace.ownerKeyFingerprint) {
            const owned = this.ownerIndex.get(trace.ownerKeyFingerprint);
            if (owned) {
                owned.delete(traceId);
                if (owned.size === 0) this.ownerIndex.delete(trace.ownerKeyFingerprint);
            }
        }
        removePersistedTrace(this.persistence, traceId);
    }
}
//# sourceMappingURL=trace-store.js.map