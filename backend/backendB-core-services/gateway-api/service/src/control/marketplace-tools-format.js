export function namespaceMarketplaceToolName(appId, toolName) {
    return `${appId}::${toolName}`;
}
export function parseMarketplaceToolName(value) {
    const separatorIndex = value.indexOf("::");
    if (separatorIndex <= 0) {
        return undefined;
    }
    const appId = value.slice(0, separatorIndex).trim();
    const toolName = value.slice(separatorIndex + 2).trim();
    if (!appId || !toolName) {
        return undefined;
    }
    return {
        appId,
        toolName,
    };
}
export function localToolResult(payload) {
    let textPayload = "";
    try {
        textPayload = JSON.stringify(payload, null, 2);
    }
    catch {
        textPayload = String(payload ?? "");
    }
    return {
        content: [
            {
                type: "text",
                text: textPayload,
            },
        ],
        structuredContent: payload,
    };
}
//# sourceMappingURL=marketplace-tools-format.js.map