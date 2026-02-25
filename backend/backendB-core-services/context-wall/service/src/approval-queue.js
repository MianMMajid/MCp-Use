export class ApprovalQueue {
    pending = new Map();
    waiters = new Map();
    resolved = new Map();
    watchers = new Set();
    key(traceId, stepIndex) {
        return `${traceId}:${stepIndex}`;
    }
    enqueue(traceId, stepIndex, step) {
        const approval = {
            traceId,
            stepIndex,
            step,
            requestedAt: new Date().toISOString(),
        };
        this.pending.set(this.key(traceId, stepIndex), approval);
        for (const watcher of this.watchers) {
            watcher(approval);
        }
    }
    resolve(traceId, stepIndex, action, reason, approverId) {
        const k = this.key(traceId, stepIndex);
        if (!this.pending.has(k) && !this.waiters.has(k))
            return null;
        this.pending.delete(k);
        const result = { action, reason, approverId, resolvedAt: new Date().toISOString() };
        const waiter = this.waiters.get(k);
        if (waiter) {
            clearTimeout(waiter.timer);
            this.waiters.delete(k);
            waiter.resolve(result);
        }
        else {
            this.resolved.set(k, result);
        }
        return result;
    }
    waitForResolution(traceId, stepIndex, timeoutMs) {
        const k = this.key(traceId, stepIndex);
        const resolved = this.resolved.get(k);
        if (resolved) {
            this.resolved.delete(k);
            return Promise.resolve(resolved);
        }
        if (!this.pending.has(k)) {
            return Promise.resolve(null);
        }
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.waiters.delete(k);
                this.pending.delete(k);
                resolve(null);
            }, Math.max(1000, timeoutMs));
            this.waiters.set(k, { resolve, timer });
        });
    }
    watch(callback) {
        this.watchers.add(callback);
        // Send existing pending items
        for (const item of this.pending.values()) {
            callback(item);
        }
        return () => this.watchers.delete(callback);
    }
    getPending() {
        return [...this.pending.values()];
    }
}
//# sourceMappingURL=approval-queue.js.map