export function toGuardActionEnum(raw) {
    const normalized = raw.trim().toLowerCase();
    if (normalized === "allow")
        return "GUARD_ACTION_ALLOW";
    if (normalized === "block" || normalized === "deny" || normalized === "reject")
        return "GUARD_ACTION_BLOCK";
    return "GUARD_ACTION_PENDING";
}
export function fromGuardActionEnum(raw) {
    const value = String(raw || "");
    if (value === "GUARD_ACTION_ALLOW")
        return "allow";
    if (value === "GUARD_ACTION_BLOCK")
        return "block";
    return "pending";
}
export function approvalEventToApi(event) {
    return {
        traceId: String(event?.traceId || ""),
        stepIndex: Number(event?.stepIndex || 0),
        requestedAt: String(event?.requestedAt || ""),
        step: event?.step ?? null,
        pendingDecision: event?.pendingDecision ?? null,
    };
}
//# sourceMappingURL=hitl-routes-common.js.map