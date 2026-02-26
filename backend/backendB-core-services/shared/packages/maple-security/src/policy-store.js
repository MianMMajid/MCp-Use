/**
 * PolicyStore — Hot-reloadable external policy rules
 *
 * Reads policy rules from a JSON file specified by MAPLE_POLICY_FILE env var.
 * Supports fs.watch-based hot-reload and manual reload via RPC.
 */
import { readFile, access } from "node:fs/promises";
import { watch } from "node:fs";
export class PolicyStore {
    filePath;
    compiledRules = [];
    watcher = null;
    reloadCallbacks = [];
    debounceTimer = null;
    constructor() {
        this.filePath = process.env.MAPLE_POLICY_FILE?.trim() || undefined;
    }
    /**
     * Load policy file and start file watcher.
     */
    async initialize() {
        if (!this.filePath)
            return;
        try {
            await access(this.filePath);
        }
        catch {
            // File doesn't exist yet, that's OK — will be picked up on reload
            return;
        }
        await this.loadFromDisk();
        this.startWatcher();
    }
    /**
     * Re-read and recompile the policy file.
     */
    async reload() {
        if (!this.filePath) {
            return { success: true, ruleCount: 0, error: "No MAPLE_POLICY_FILE configured" };
        }
        try {
            await this.loadFromDisk();
            const result = { success: true, ruleCount: this.compiledRules.length };
            this.notifyReload(result);
            return result;
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            const result = { success: false, ruleCount: this.compiledRules.length, error };
            this.notifyReload(result);
            return result;
        }
    }
    /**
     * Get currently compiled external rules.
     */
    getExternalRules() {
        return this.compiledRules;
    }
    /**
     * Subscribe to reload events.
     */
    onReload(callback) {
        this.reloadCallbacks.push(callback);
    }
    /**
     * Stop the file watcher and clean up.
     */
    destroy() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.reloadCallbacks = [];
    }
    // ── Internal ────────────────────────────────────────────────────────────────
    async loadFromDisk() {
        if (!this.filePath)
            return;
        const raw = await readFile(this.filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (!parsed.rules || !Array.isArray(parsed.rules)) {
            throw new Error("Policy file must contain a 'rules' array");
        }
        const compiled = [];
        for (const spec of parsed.rules) {
            if (spec.enabled === false)
                continue;
            compiled.push(compileRule(spec));
        }
        // Sort by priority (lower = earlier), default priority is 100
        compiled.sort((a, b) => {
            const pa = (parsed.rules.find((r) => r.name === a.name)?.priority ?? 100);
            const pb = (parsed.rules.find((r) => r.name === b.name)?.priority ?? 100);
            return pa - pb;
        });
        this.compiledRules = compiled;
    }
    startWatcher() {
        if (!this.filePath)
            return;
        try {
            this.watcher = watch(this.filePath, () => {
                // Debounce rapid file changes
                if (this.debounceTimer)
                    clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    this.reload().catch(() => {
                        // Errors already handled in reload()
                    });
                }, 500);
            });
        }
        catch {
            // File watching not available on this platform — reload only via RPC
        }
    }
    notifyReload(result) {
        for (const cb of this.reloadCallbacks) {
            try {
                cb(result);
            }
            catch {
                // Callback errors are silently ignored
            }
        }
    }
}
/**
 * Compile a PolicyRuleSpec (JSON-safe) into a FirewallRule (with RegExp).
 */
function compileRule(spec) {
    return {
        name: spec.name,
        action: spec.action,
        severity: spec.severity,
        message: spec.message,
        recommendation: spec.recommendation,
        match: {
            stepTypes: spec.match.stepTypes,
            toolGlob: spec.match.toolGlob,
            anyValueRegex: spec.match.anyValueRegex
                ? new RegExp(spec.match.anyValueRegex, "i")
                : undefined,
            secrets: spec.match.secrets,
            payloadBytesExceeds: spec.match.payloadBytesExceeds,
        },
    };
}
//# sourceMappingURL=policy-store.js.map