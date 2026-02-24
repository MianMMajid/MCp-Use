function safePreview(value: unknown, maxChars = 1400): string {
  if (typeof value === "string") {
    return value.length <= maxChars ? value : `${value.slice(0, maxChars - 3)}...`;
  }
  try {
    const json = JSON.stringify(value);
    if (!json) {
      return "";
    }
    return json.length <= maxChars ? json : `${json.slice(0, maxChars - 3)}...`;
  } catch {
    return String(value ?? "");
  }
}

export function extractTextFromMcpResult(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (!result || typeof result !== "object") {
    return safePreview(result);
  }

  const raw = result as Record<string, unknown>;
  if (typeof raw.text === "string" && raw.text.trim()) {
    return raw.text;
  }

  const content = Array.isArray(raw.content) ? raw.content : [];
  const contentText = content
    .map((entry) => {
      if (typeof entry === "string") {
        return entry;
      }
      if (!entry || typeof entry !== "object") {
        return "";
      }
      const block = entry as Record<string, unknown>;
      if (typeof block.text === "string") {
        return block.text;
      }
      if (typeof block.content === "string") {
        return block.content;
      }
      if (typeof block.arguments === "string") {
        return block.arguments;
      }
      return "";
    })
    .filter((value) => value.trim().length > 0)
    .join("\n\n")
    .trim();
  if (contentText) {
    return contentText;
  }

  return safePreview(result);
}
