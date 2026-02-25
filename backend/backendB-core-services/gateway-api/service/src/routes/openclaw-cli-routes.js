import { requireApiKeyResponse } from "../auth.js";
import { asBoolean, asString, readJsonBody } from "../helpers.js";
import { mapleLog } from "../logging.js";
import { database, server } from "../state.js";
import {
  buildOpenClawCliCommandArgs,
  listOpenClawCliTools,
  normalizeOpenClawCliTool,
  runOpenClawCliTool,
} from "../core/openclaw-cli-runtime.js";

function parseTimeoutSeconds(rawValue) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return 60;
  }
  return Math.max(5, Math.min(parsed, 300));
}

function parseMaxBufferMb(rawValue) {
  const parsed = Number.parseInt(String(rawValue ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return 8;
  }
  return Math.max(1, Math.min(parsed, 32));
}

function parseArgs(rawValue) {
  if (rawValue == null) {
    return [];
  }
  if (!Array.isArray(rawValue)) {
    throw new Error("args must be an array of strings.");
  }
  return rawValue.map((entry) => String(entry));
}

async function runCliCommandResponse(c, options) {
  try {
    const result = await runOpenClawCliTool(options);
    const status = result.ok ? 200 : 502;
    return c.json(
      {
        ok: result.ok,
        tool: result.tool,
        command: result.command,
        args: result.args,
        timeoutSeconds: result.timeoutSeconds,
        exitCode: result.exitCode,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
        parsedJson: result.parsedJson,
        error: result.error ?? "",
      },
      status
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    mapleLog("warn", "api.openclaw.cli.invalid_request", { error: message });
    return c.json(
      {
        ok: false,
        error: message,
      },
      400
    );
  }
}

function registerToolRoutes(tool) {
  const basePath = `/api/openclaw/cli/${tool}`;

  server.app.get(`${basePath}/help`, async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    return runCliCommandResponse(c, {
      tool,
      help: true,
      dev: asBoolean(c.req.query("dev"), false),
      profile: asString(c.req.query("profile")),
      noColor: asBoolean(c.req.query("noColor"), false),
      timeoutSeconds: parseTimeoutSeconds(c.req.query("timeoutSeconds")),
      maxBufferMb: parseMaxBufferMb(c.req.query("maxBufferMb")),
      json: asBoolean(c.req.query("json"), false),
      parseJson: asBoolean(c.req.query("parseJson"), false),
    });
  });

  server.app.post(`${basePath}/exec`, async (c) => {
    const unauthorized = await requireApiKeyResponse(c, database);
    if (unauthorized) {
      return unauthorized;
    }
    const body = await readJsonBody(c);
    return runCliCommandResponse(c, {
      tool,
      args: parseArgs(body.args),
      dev: asBoolean(body.dev, false),
      profile: asString(body.profile),
      noColor: asBoolean(body.noColor, false),
      json: asBoolean(body.json, false),
      plain: asBoolean(body.plain, false),
      parseJson: asBoolean(body.parseJson, false),
      stdin: asString(body.stdin) ?? "",
      timeoutSeconds: parseTimeoutSeconds(body.timeoutSeconds),
      maxBufferMb: parseMaxBufferMb(body.maxBufferMb),
    });
  });
}

server.app.get("/api/openclaw/cli/tools", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const tools = listOpenClawCliTools();
  return c.json({
    ok: true,
    count: tools.length,
    tools,
  });
});

server.app.post("/api/openclaw/cli/exec", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const body = await readJsonBody(c);
  const tool = normalizeOpenClawCliTool(body.tool);
  if (!tool) {
    return c.json(
      {
        ok: false,
        error: "tool is required.",
      },
      400
    );
  }
  return runCliCommandResponse(c, {
    tool,
    args: parseArgs(body.args),
    dev: asBoolean(body.dev, false),
    profile: asString(body.profile),
    noColor: asBoolean(body.noColor, false),
    json: asBoolean(body.json, false),
    plain: asBoolean(body.plain, false),
    parseJson: asBoolean(body.parseJson, false),
    stdin: asString(body.stdin) ?? "",
    timeoutSeconds: parseTimeoutSeconds(body.timeoutSeconds),
    maxBufferMb: parseMaxBufferMb(body.maxBufferMb),
  });
});

for (const entry of listOpenClawCliTools()) {
  registerToolRoutes(entry.tool);
}

server.app.get("/api/openclaw/cli/:tool/help", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const tool = normalizeOpenClawCliTool(c.req.param("tool"));
  if (!tool) {
    return c.json(
      {
        ok: false,
        error: "Invalid tool.",
      },
      400
    );
  }
  return runCliCommandResponse(c, {
    tool,
    help: true,
    dev: asBoolean(c.req.query("dev"), false),
    profile: asString(c.req.query("profile")),
    noColor: asBoolean(c.req.query("noColor"), false),
    timeoutSeconds: parseTimeoutSeconds(c.req.query("timeoutSeconds")),
    maxBufferMb: parseMaxBufferMb(c.req.query("maxBufferMb")),
    json: asBoolean(c.req.query("json"), false),
    parseJson: asBoolean(c.req.query("parseJson"), false),
  });
});

server.app.post("/api/openclaw/cli/:tool/exec", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const tool = normalizeOpenClawCliTool(c.req.param("tool"));
  if (!tool) {
    return c.json(
      {
        ok: false,
        error: "Invalid tool.",
      },
      400
    );
  }
  const body = await readJsonBody(c);
  return runCliCommandResponse(c, {
    tool,
    args: parseArgs(body.args),
    dev: asBoolean(body.dev, false),
    profile: asString(body.profile),
    noColor: asBoolean(body.noColor, false),
    json: asBoolean(body.json, false),
    plain: asBoolean(body.plain, false),
    parseJson: asBoolean(body.parseJson, false),
    stdin: asString(body.stdin) ?? "",
    timeoutSeconds: parseTimeoutSeconds(body.timeoutSeconds),
    maxBufferMb: parseMaxBufferMb(body.maxBufferMb),
  });
});

server.app.get("/api/openclaw/cli/catalog", async (c) => {
  const unauthorized = await requireApiKeyResponse(c, database);
  if (unauthorized) {
    return unauthorized;
  }
  const tools = listOpenClawCliTools();
  return c.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    tools: tools.map((tool) => {
      const exampleArgs = buildOpenClawCliCommandArgs({
        tool: tool.tool,
        help: true,
      });
      return {
        ...tool,
        api: {
          help: `/api/openclaw/cli/${tool.tool}/help`,
          exec: `/api/openclaw/cli/${tool.tool}/exec`,
        },
        sampleCommand: ["openclaw", ...exampleArgs].join(" "),
      };
    }),
  });
});
