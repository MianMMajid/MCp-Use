export class ApprovalQueue {
    pending = new Map();
    waiters = new Map();
    resolved = new Map();
    watchers = new Set();
    // Cap resolved cache to prevent unbounded memory growth.
    maxResolvedSize = 1000;
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
            try {
                watcher(approval);
            } catch {
                // Watcher threw — remove it to prevent future errors.
                this.watchers.delete(watcher);
            }
        }
    }
    resolve(traceId, stepIndex, action, reason, approverId) {
        const k = this.key(traceId, stepIndex);
        // Atomic check: only resolve if still pending or has an active waiter.
        // Once resolved, subsequent calls are rejected to prevent double-resolution.
        const isPending = this.pending.has(k);
        const hasWaiter = this.waiters.has(k);
        if (!isPending && !hasWaiter)
            return null;
        // Delete from pending first to prevent re-entry.
        this.pending.delete(k);
        const result = { action, reason, approverId, resolvedAt: new Date().toISOString() };
        const waiter = this.waiters.get(k);
        if (waiter) {
            clearTimeout(waiter.timer);
            this.waiters.delete(k);
            waiter.resolve(result);
        }
        else {
            // Evict oldest entries if resolved cache is full.
            if (this.resolved.size >= this.maxResolvedSize) {
                const oldestKey = this.resolved.keys().next().value;
                this.resolved.delete(oldestKey);
            }
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
            // If a waiter already exists for this key (shouldn't happen, but defend),
            // clear the old timer before replacing.
            const existing = this.waiters.get(k);
            if (existing) {
                clearTimeout(existing.timer);
            }
            this.waiters.set(k, { resolve, timer });
        });
    }
    watch(callback) {
        this.watchers.add(callback);
        // Send existing pending items
        for (const item of this.pending.values()) {
            try {
                callback(item);
            } catch {
                this.watchers.delete(callback);
                return () => {};
            }
        }
        return () => this.watchers.delete(callback);
    }
    getPending() {
        return [...this.pending.values()];
    }
}
//# sourceMappingURL=approval-queue.js.map
