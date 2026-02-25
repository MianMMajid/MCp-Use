export function ensureToolAllowed(app, toolName) {
    const allowlist = app.toolAllowlist;
    if (!allowlist || allowlist.length === 0) {
        return;
    }
    if (!allowlist.includes(toolName)) {
        throw new Error(`Tool "${toolName}" is not allowlisted for downstream app "${app.id}".`);
    }
}
//# sourceMappingURL=downstream-proxy-utils-policy.js.map