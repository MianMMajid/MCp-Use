import { mapleLog } from "@maple/common";
import { config } from "./config.js";
function normalizeToolInputSchema(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return undefined;
    }
    return raw;
}
export class DownstreamRegistry {
    apps = new Map();
    /**
     * Parse MAPLE_DOWNSTREAM_APPS env var (format: "id1=url1,id2=url2")
     * and register each app in the registry.
     */
    loadFromEnv() {
        const raw = config.mapleDownstreamApps;
        if (!raw || raw.trim().length === 0) {
            mapleLog("info", "downstream_load_env_skip", { reason: "MAPLE_DOWNSTREAM_APPS is empty" });
            return;
        }
        const trimmed = raw.trim();
        if (trimmed.startsWith("[")) {
            try {
                const parsed = JSON.parse(trimmed);
                if (!Array.isArray(parsed)) {
                    throw new Error("Expected JSON array");
                }
                for (const entry of parsed) {
                    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
                        continue;
                    }
                    const record = entry;
                    const appId = String(record.id ?? "").trim();
                    const url = String(record.mcpUrl ?? record.url ?? "").trim();
                    if (!appId || !url) {
                        continue;
                    }
                    const name = String(record.name ?? appId).trim() || appId;
                    const enabled = record.enabled === false ? false : true;
                    const tools = Array.isArray(record.tools)
                        ? record.tools
                            .filter((tool) => tool && typeof tool === "object" && !Array.isArray(tool))
                            .map((tool) => {
                            const t = tool;
                            return {
                                name: String(t.name ?? "").trim(),
                                description: String(t.description ?? "").trim(),
                                inputSchema: normalizeToolInputSchema(t.inputSchema ?? t.input_schema ?? t.schema),
                            };
                        })
                            .filter((tool) => tool.name.length > 0)
                        : [];
                    this.register({
                        appId,
                        name,
                        url,
                        transport: "streamable-http",
                        enabled,
                        status: enabled ? "connected" : "disconnected",
                        tools,
                    });
                }
                mapleLog("info", "downstream_load_env_done", { source: "json", count: this.apps.size, appIds: [...this.apps.keys()] });
                return;
            }
            catch (err) {
                mapleLog("warn", "downstream_load_env_json_parse_failed", { error: err.message });
            }
        }
        const entries = raw.split(",").map((e) => e.trim()).filter((e) => e.length > 0);
        for (const entry of entries) {
            const eqIndex = entry.indexOf("=");
            if (eqIndex === -1) {
                mapleLog("warn", "downstream_load_env_invalid_entry", { entry, reason: "missing '=' separator" });
                continue;
            }
            const id = entry.slice(0, eqIndex).trim();
            const url = entry.slice(eqIndex + 1).trim();
            if (!id) {
                mapleLog("warn", "downstream_load_env_invalid_entry", { entry, reason: "empty app id" });
                continue;
            }
            if (!url) {
                mapleLog("warn", "downstream_load_env_invalid_entry", { entry, reason: "empty url" });
                continue;
            }
            this.register({
                appId: id,
                name: id,
                url,
                transport: "streamable-http",
                enabled: true,
                status: "connected",
                tools: [],
            });
        }
        mapleLog("info", "downstream_load_env_done", { source: "legacy", count: this.apps.size, appIds: [...this.apps.keys()] });
    }
    register(app) {
        this.apps.set(app.appId, app);
        mapleLog("info", "downstream_registered", { appId: app.appId, name: app.name, url: app.url });
    }
    get(appId) {
        return this.apps.get(appId);
    }
    list(includeDisabled = false) {
        const all = [...this.apps.values()];
        return includeDisabled ? all : all.filter((a) => a.enabled);
    }
    getToolsForApp(appId) {
        return this.apps.get(appId)?.tools ?? [];
    }
    setToolsForApp(appId, tools) {
        const app = this.apps.get(appId);
        if (!app)
            return;
        app.tools = tools
            .map((tool) => ({
            name: String(tool?.name ?? "").trim(),
            description: String(tool?.description ?? "").trim(),
            inputSchema: normalizeToolInputSchema(tool?.inputSchema),
        }))
            .filter((tool) => tool.name.length > 0);
        this.apps.set(appId, app);
    }
    getAllTools() {
        const tools = [];
        for (const app of this.apps.values()) {
            if (!app.enabled)
                continue;
            for (const tool of app.tools) {
                tools.push({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, appId: app.appId });
            }
        }
        return tools;
    }
}
//# sourceMappingURL=downstream-registry.js.map