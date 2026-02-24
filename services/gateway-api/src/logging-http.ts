export async function requestBodyPreview(raw: Request): Promise<unknown> {
  const contentType = String(raw.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return undefined;
  }
  try {
    const payload = (await raw.clone().json()) as unknown;
    return payload;
  } catch {
    return "[unparseable-json]";
  }
}
