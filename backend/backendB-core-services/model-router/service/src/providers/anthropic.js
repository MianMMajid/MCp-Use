import { mapleLog } from "@maple/common";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
/**
 * Convert our unified ChatMessage array into the Anthropic Messages API format.
 * Anthropic uses a top-level `system` parameter instead of a system role message,
 * so we extract system messages and pass them separately.
 */
function toAnthropicPayload(messages, options) {
    const systemParts = [];
    const apiMessages = [];
    for (const m of messages) {
        if (m.role === "system") {
            systemParts.push(m.content);
        }
        else {
            // Anthropic only accepts "user" and "assistant" roles in the messages array.
            // Map "tool" to "user" as a workaround.
            const role = m.role === "tool" ? "user" : m.role;
            apiMessages.push({ role, content: m.content });
        }
    }
    // Anthropic requires the conversation to start with a user message.
    // If the first message is not from the user, prepend a synthetic one.
    if (apiMessages.length === 0 || apiMessages[0].role !== "user") {
        apiMessages.unshift({ role: "user", content: "Hello." });
    }
    return {
        system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
        messages: apiMessages,
    };
}
export async function generateAnthropic(apiKey, options) {
    const controller = new AbortController();
    const timeout = options.timeoutMs ?? 15_000;
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const { system, messages } = toAnthropicPayload(options.messages, options);
        const body = {
            model: options.model,
            messages,
            max_tokens: options.maxTokens ?? 4096,
        };
        if (system)
            body.system = system;
        if (options.temperature != null)
            body.temperature = options.temperature;
        if (options.tools && options.tools.length > 0) {
            body.tools = options.tools.map((t) => ({
                name: t.function.name,
                description: t.function.description ?? "",
                input_schema: t.function.parameters ?? { type: "object", properties: {} },
            }));
        }
        const res = await fetch(ANTHROPIC_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": ANTHROPIC_VERSION,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            throw new Error(`Anthropic API error ${res.status}: ${errBody}`);
        }
        const json = await res.json();
        // Anthropic returns content as an array of content blocks
        const textContent = (json.content ?? [])
            .filter((block) => block.type === "text")
            .map((block) => block.text)
            .join("");
        const toolCalls = (json.content ?? [])
            .filter((block) => block.type === "tool_use")
            .map((block) => ({
            id: block.id ?? "",
            type: "function",
            function: { name: block.name ?? "", arguments: JSON.stringify(block.input ?? {}) },
        }));
        return {
            content: textContent,
            finishReason: json.stop_reason === "end_turn" ? "stop" : (json.stop_reason ?? "stop"),
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            usage: {
                promptTokens: json.usage?.input_tokens ?? 0,
                completionTokens: json.usage?.output_tokens ?? 0,
                totalTokens: (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0),
            },
            model: json.model ?? options.model,
        };
    }
    finally {
        clearTimeout(timer);
    }
}
export async function* streamAnthropic(apiKey, options) {
    const controller = new AbortController();
    const timeout = options.timeoutMs ?? 30_000;
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        const { system, messages } = toAnthropicPayload(options.messages, options);
        const body = {
            model: options.model,
            messages,
            max_tokens: options.maxTokens ?? 4096,
            stream: true,
        };
        if (system)
            body.system = system;
        if (options.temperature != null)
            body.temperature = options.temperature;
        const res = await fetch(ANTHROPIC_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": ANTHROPIC_VERSION,
            },
            body: JSON.stringify(body),
            signal: controller.signal,
        });
        if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            throw new Error(`Anthropic streaming error ${res.status}: ${errBody}`);
        }
        if (!res.body) {
            throw new Error("Anthropic returned no response body for stream");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let inputTokens = 0;
        let outputTokens = 0;
        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith("data: "))
                        continue;
                    const data = trimmed.slice(6);
                    try {
                        const parsed = JSON.parse(data);
                        switch (parsed.type) {
                            case "message_start": {
                                const usage = parsed.message?.usage;
                                if (usage) {
                                    inputTokens = usage.input_tokens ?? 0;
                                }
                                break;
                            }
                            case "content_block_delta": {
                                const text = parsed.delta?.text ?? "";
                                if (text) {
                                    yield { delta: text, finishReason: "" };
                                }
                                break;
                            }
                            case "message_delta": {
                                const stopReason = parsed.delta?.stop_reason;
                                const usage = parsed.usage;
                                if (usage) {
                                    outputTokens = usage.output_tokens ?? 0;
                                }
                                const finishReason = stopReason === "end_turn" ? "stop" : (stopReason ?? "");
                                yield {
                                    delta: "",
                                    finishReason,
                                    usage: {
                                        promptTokens: inputTokens,
                                        completionTokens: outputTokens,
                                        totalTokens: inputTokens + outputTokens,
                                    },
                                };
                                break;
                            }
                            case "message_stop":
                                return;
                            case "ping":
                            case "content_block_start":
                            case "content_block_stop":
                                // No-op for these event types
                                break;
                            default:
                                break;
                        }
                    }
                    catch {
                        mapleLog("warn", "anthropic_stream_parse_error", { line: trimmed });
                    }
                }
            }
        }
        finally {
            reader.releaseLock();
        }
    }
    finally {
        clearTimeout(timer);
    }
}
//# sourceMappingURL=anthropic.js.map