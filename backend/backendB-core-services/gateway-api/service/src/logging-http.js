export async function requestBodyPreview(raw) {
    const contentType = String(raw.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("application/json")) {
        return undefined;
    }
    try {
        const payload = (await raw.clone().json());
        return payload;
    }
    catch {
        return "[unparseable-json]";
    }
}
//# sourceMappingURL=logging-http.js.map