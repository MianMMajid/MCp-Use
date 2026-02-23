import { mapleLog } from "@maple/common";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface GenerateOptions {
  model: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  tools?: ToolDefinition[];
}

export interface GenerateResult {
  content: string;
  finishReason: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  model: string;
  toolCalls?: ToolCall[];
}

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";

export async function generateOpenAI(
  apiKey: string,
  options: GenerateOptions,
): Promise<GenerateResult> {
  const controller = new AbortController();
  const timeout = options.timeoutMs ?? 15_000;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const body: Record<string, unknown> = {
      model: options.model,
      messages: options.messages.map((m) => {
        const msg: Record<string, unknown> = { role: m.role, content: m.content };
        if (m.name) msg.name = m.name;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        return msg;
      }),
    };
    if (options.maxTokens != null) body.max_tokens = options.maxTokens;
    if (options.temperature != null) body.temperature = options.temperature;
    if (options.tools && options.tools.length > 0) body.tools = options.tools;

    const res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`OpenAI API error ${res.status}: ${errBody}`);
    }

    const json = await res.json() as any;
    const choice = json.choices?.[0];
    if (!choice) {
      throw new Error("OpenAI returned no choices");
    }

    const toolCalls: ToolCall[] = (choice.message?.tool_calls ?? []).map((tc: any) => ({
      id: tc.id ?? "",
      type: "function" as const,
      function: { name: tc.function?.name ?? "", arguments: tc.function?.arguments ?? "{}" },
    }));

    return {
      content: choice.message?.content ?? "",
      finishReason: choice.finish_reason ?? "stop",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        totalTokens: json.usage?.total_tokens ?? 0,
      },
      model: json.model ?? options.model,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function* streamOpenAI(
  apiKey: string,
  options: GenerateOptions,
): AsyncGenerator<{ delta: string; finishReason: string; usage?: GenerateResult["usage"] }> {
  const controller = new AbortController();
  const timeout = options.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const body: Record<string, unknown> = {
      model: options.model,
      messages: options.messages.map((m) => {
        const msg: Record<string, unknown> = { role: m.role, content: m.content };
        if (m.name) msg.name = m.name;
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
        return msg;
      }),
      stream: true,
      stream_options: { include_usage: true },
    };
    if (options.maxTokens != null) body.max_tokens = options.maxTokens;
    if (options.temperature != null) body.temperature = options.temperature;

    const res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`OpenAI streaming error ${res.status}: ${errBody}`);
    }

    if (!res.body) {
      throw new Error("OpenAI returned no response body for stream");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last partial line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") return;

          try {
            const parsed = JSON.parse(data) as any;
            const choice = parsed.choices?.[0];
            const delta = choice?.delta?.content ?? "";
            const finishReason = choice?.finish_reason ?? "";
            const usage = parsed.usage
              ? {
                  promptTokens: parsed.usage.prompt_tokens ?? 0,
                  completionTokens: parsed.usage.completion_tokens ?? 0,
                  totalTokens: parsed.usage.total_tokens ?? 0,
                }
              : undefined;

            if (delta || finishReason || usage) {
              yield { delta, finishReason, usage };
            }
          } catch {
            // Ignore malformed SSE lines
            mapleLog("warn", "openai_stream_parse_error", { line: trimmed });
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  } finally {
    clearTimeout(timer);
  }
}
