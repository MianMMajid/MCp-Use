import type { TraceStep, GuardAction } from "@maple/types";

interface PendingApproval {
  traceId: string;
  stepIndex: number;
  step: TraceStep;
  requestedAt: string;
}

interface ApprovalResult {
  action: GuardAction;
  reason: string;
  approverId: string;
  resolvedAt: string;
}

export class ApprovalQueue {
  private pending = new Map<string, PendingApproval>();
  private waiters = new Map<string, {
    resolve: (result: ApprovalResult | null) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private resolved = new Map<string, ApprovalResult>();
  private watchers = new Set<(event: PendingApproval) => void>();

  private key(traceId: string, stepIndex: number): string {
    return `${traceId}:${stepIndex}`;
  }

  enqueue(traceId: string, stepIndex: number, step: TraceStep): void {
    const approval: PendingApproval = {
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

  resolve(traceId: string, stepIndex: number, action: GuardAction, reason: string, approverId: string): ApprovalResult | null {
    const k = this.key(traceId, stepIndex);
    if (!this.pending.has(k) && !this.waiters.has(k)) return null;
    this.pending.delete(k);
    const result = { action, reason, approverId, resolvedAt: new Date().toISOString() };
    const waiter = this.waiters.get(k);
    if (waiter) {
      clearTimeout(waiter.timer);
      this.waiters.delete(k);
      waiter.resolve(result);
    } else {
      this.resolved.set(k, result);
    }
    return result;
  }

  waitForResolution(traceId: string, stepIndex: number, timeoutMs: number): Promise<ApprovalResult | null> {
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

  watch(callback: (event: PendingApproval) => void): () => void {
    this.watchers.add(callback);
    // Send existing pending items
    for (const item of this.pending.values()) {
      callback(item);
    }
    return () => this.watchers.delete(callback);
  }

  getPending(): PendingApproval[] {
    return [...this.pending.values()];
  }
}
