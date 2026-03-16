#!/usr/bin/env node

import { CLI_SURFACE_MANIFEST } from "./surface-manifest.js";
import {
  Command,
  applyExtraHeaders,
  assertOkResponse,
  commandOptionValue,
  flattenOptionsArray,
  httpRequest,
  httpSse,
  loadProfiles,
  mergeBodyOptions,
  mergeQueryOptions,
  maybeParseJson,
  openBrowser,
  originForBase,
  persistBrowserFlowCookie,
  printOutput,
  resolveProfile,
  saveProfiles,
  writeOutputFile,
} from "./runtime.js";

function optionKey(definition) {
  if (definition.key) {
    return definition.key;
  }
  const flags = String(definition.flags || "");
  const longFlag = flags
    .split(/[ ,|]+/)
    .find((part) => part.startsWith("--"));
  const raw = longFlag ? longFlag.slice(2).split(/[ <[]/, 1)[0] : "";
  return raw.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

function createCommandTree(root) {
  const index = new Map([["", root]]);
  for (const spec of CLI_SURFACE_MANIFEST) {
    let parent = root;
    for (const segment of spec.commandPath.slice(0, -1)) {
      const key = [...spec.commandPath.slice(0, spec.commandPath.indexOf(segment) + 1)].join(" ");
      if (!index.has(key)) {
        const command = new Command(segment);
        parent.addCommand(command);
        index.set(key, command);
      }
      parent = index.get(key);
    }
    const leaf = new Command(spec.commandPath.at(-1));
    leaf.description(spec.description || spec.id);
    for (const definition of spec.args || []) {
      leaf.argument(`<${definition.name}>`, definition.description || definition.name);
    }
    for (const definition of spec.options || []) {
      leaf.option(definition.flags, definition.description || "");
    }
    addCommonOptions(leaf, spec);
    leaf.action(async (...values) => {
      const command = values.at(-1);
      const positional = values.slice(0, -1);
      await executeManifestCommand(spec, positional, command.optsWithGlobals?.() || command.opts());
    });
    parent.addCommand(leaf);
  }
}

function addCommonOptions(command, spec) {
  command
    .option("--json", "Print stable JSON output")
    .option("--out <file>", "Write raw output to a file")
    .option("--profile <name>", "Override the active CLI profile")
    .option("--data <json>", "Merge an inline JSON object into the request body")
    .option("--body-file <path>", "Merge a JSON body file into the request body")
    .option("--body-patch <key=value>", "Patch an individual body field", collectValue, [])
    .option("--query <key=value>", "Add an arbitrary query parameter", collectValue, [])
    .option("--header <key=value>", "Add an arbitrary request header", collectValue, []);
  if (spec.kind === "eventStream" || spec.id === "chat.stream") {
    command.option("--follow", "Follow an event stream");
  }
}

function collectValue(value, previous = []) {
  return [...flattenOptionsArray(previous), value];
}

function buildPath(spec, positional) {
  const byName = new Map();
  for (let idx = 0; idx < (spec.args || []).length; idx += 1) {
    byName.set(spec.args[idx].name, positional[idx]);
  }
  let path = spec.path || "";
  for (const definition of spec.args || []) {
    if (definition.pathParam) {
      path = path.replace(`:${definition.name}`, encodeURIComponent(String(byName.get(definition.name) || "")));
    }
  }
  return { path, args: byName };
}

function buildBody(spec, positional, options) {
  const body = {
    ...(spec.bodyStatic || {}),
    ...mergeBodyOptions(options),
  };
  const argumentValues = new Map();
  for (let idx = 0; idx < (spec.args || []).length; idx += 1) {
    argumentValues.set(spec.args[idx].name, positional[idx]);
  }
  for (const definition of spec.options || []) {
    const key = optionKey(definition);
    const value = commandOptionValue(options[key]);
    if (value !== undefined && spec.bodyKeys?.includes(key)) {
      body[key] = value;
    }
  }
  for (const definition of spec.args || []) {
    if (!definition.pathParam && argumentValues.get(definition.name) !== undefined) {
      body[definition.name] = argumentValues.get(definition.name);
    }
  }
  if (typeof spec.bodyBuilder === "function") {
    Object.assign(body, spec.bodyBuilder({ positional, options, body: { ...body } }) || {});
  }
  return body;
}

function buildQuery(spec, options) {
  const query = mergeQueryOptions(options);
  for (const definition of spec.options || []) {
    const key = optionKey(definition);
    if (!spec.queryKeys?.includes(key)) {
      continue;
    }
    const value = commandOptionValue(options[key]);
    if (value !== undefined) {
      query.set(key, String(value));
    }
  }
  return query;
}

function requestHeadersFromOptions(options) {
  return applyExtraHeaders({}, options);
}

async function executeManifestCommand(spec, positional, options) {
  const { name: profileName, profile } = resolveProfile(options.profile);
  if (spec.kind === "browserFlow") {
    await executeBrowserFlow(spec, profileName, profile, positional, options);
    return;
  }
  if (spec.kind === "integrationConnect") {
    await executeIntegrationConnect(spec, profileName, profile, positional, options);
    return;
  }
  if (spec.kind === "eventStream") {
    await executeEventStream(spec, profileName, profile, positional, options);
    return;
  }
  await executeRequest(spec, profileName, profile, positional, options);
}

async function executeRequest(spec, profileName, profile, positional, options) {
  const { path } = buildPath(spec, positional);
  const query = buildQuery(spec, options);
  const requestPath = `${path}${query.size ? `?${query.toString()}` : ""}`;
  const body = buildBody(spec, positional, options);
  const method = String(spec.method || "GET").toUpperCase();
  const response = await httpRequest({
    profileName,
    profile,
    baseOrigin: originForBase(profile, spec.base),
    method,
    path: requestPath,
    body:
      method === "GET" || method === "HEAD"
        ? undefined
        : Object.keys(body).length > 0 || spec.bodyStatic
          ? body
          : undefined,
    headers: requestHeadersFromOptions(options),
    admin: spec.base === "admin",
  });
  assertOkResponse(response, { label: spec.id });
  const payload = maybeParseJson(response.text) ?? response.text;
  if (options.out) {
    writeOutputFile(
      options.out,
      typeof payload === "string" ? payload : `${JSON.stringify(payload, null, 2)}\n`
    );
    printOutput({ ok: true, file: options.out }, { json: options.json });
    return;
  }
  printOutput(payload, { json: options.json });
}

async function executeEventStream(spec, profileName, profile, positional, options) {
  const { path } = buildPath(spec, positional);
  const query = buildQuery(spec, options);
  const requestPath = `${path}${query.size ? `?${query.toString()}` : ""}`;
  const body = buildBody(spec, positional, options);
  const method = String(spec.method || "GET").toUpperCase();
  const events = [];
  await httpSse({
    profileName,
    profile,
    baseOrigin: originForBase(profile, spec.base),
    method,
    path: requestPath,
    body:
      method === "GET" || method === "HEAD"
        ? undefined
        : Object.keys(body).length > 0 || spec.bodyStatic
          ? body
          : undefined,
    headers: requestHeadersFromOptions(options),
    admin: spec.base === "admin",
    onEvent: (event) => {
      if (options.follow || spec.id === "chat.stream") {
        if (options.json) {
          process.stdout.write(`${JSON.stringify(event)}\n`);
          return;
        }
        process.stdout.write(`${event.event}: ${event.data}\n`);
        return;
      }
      events.push(event);
    },
  });
  if (!options.follow && spec.id !== "chat.stream") {
    printOutput(events, { json: options.json });
  }
}

async function executeBrowserFlow(spec, profileName, profile, positional, options) {
  const startResponse = await httpRequest({
    profileName,
    profile,
    baseOrigin: originForBase(profile, spec.base),
    method: spec.startMethod || "POST",
    path: spec.startPath,
    body: {},
    headers: requestHeadersFromOptions(options),
    admin: spec.base === "admin",
  });
  assertOkResponse(startResponse, { label: spec.id });
  const startPayload = maybeParseJson(startResponse.text) || {};
  const browserUrl = startPayload.browserUrl;
  const pollUrl = startPayload.pollUrl || spec.statusPath.replace(":flowId", encodeURIComponent(String(startPayload.flowId || "")));
  if (!browserUrl || !pollUrl) {
    throw new Error(`CLI browser flow start response is incomplete for ${spec.id}.`);
  }
  const opened = await openBrowser(browserUrl);
  if (!opened) {
    process.stderr.write(`Open this URL in your browser: ${browserUrl}\n`);
  }
  const result = await pollBrowserFlow({
    profileName,
    profile,
    base: spec.base,
    path: pollUrl,
    timeoutSeconds: Number.parseInt(String(options.wait || 180), 10),
  });
  if (result.sessionCookie) {
    persistBrowserFlowCookie(profileName, originForBase(profile, spec.base), result.sessionCookie);
  }
  printOutput(result, { json: options.json });
}

async function executeIntegrationConnect(spec, profileName, profile, positional, options) {
  const provider = String(positional[0] || "").trim();
  if (!provider) {
    throw new Error("provider is required");
  }
  if (options.browser) {
    const startResponse = await httpRequest({
      profileName,
      profile,
      baseOrigin: originForBase(profile, spec.base),
      method: "POST",
      path: `/api/integrations/${encodeURIComponent(provider)}/oauth/cli/start`,
      body: {},
      headers: requestHeadersFromOptions(options),
      admin: spec.base === "admin",
    });
    assertOkResponse(startResponse, { label: spec.id });
    const startPayload = maybeParseJson(startResponse.text) || {};
    const browserUrl = startPayload.browserUrl;
    const pollUrl =
      startPayload.pollUrl ||
      `/api/integrations/${encodeURIComponent(provider)}/oauth/cli/${encodeURIComponent(String(startPayload.flowId || ""))}`;
    if (!browserUrl || !pollUrl) {
      throw new Error("Integration browser flow start response is incomplete.");
    }
    const opened = await openBrowser(browserUrl);
    if (!opened) {
      process.stderr.write(`Open this URL in your browser: ${browserUrl}\n`);
    }
    const result = await pollBrowserFlow({
      profileName,
      profile,
      base: spec.base,
      path: pollUrl,
      timeoutSeconds: Number.parseInt(String(options.wait || 180), 10),
    });
    printOutput(result, { json: options.json });
    return;
  }

  const body = buildBody(
    {
      ...spec,
      path: `/api/integrations/${encodeURIComponent(provider)}/connect`,
    },
    [],
    options
  );
  const response = await httpRequest({
    profileName,
    profile,
    baseOrigin: originForBase(profile, spec.base),
    method: "POST",
    path: `/api/integrations/${encodeURIComponent(provider)}/connect`,
    body,
    headers: requestHeadersFromOptions(options),
    admin: spec.base === "admin",
  });
  assertOkResponse(response, { label: spec.id });
  printOutput(maybeParseJson(response.text) ?? response.text, { json: options.json });
}

async function pollBrowserFlow({ profileName, profile, base, path, timeoutSeconds }) {
  const deadline = Date.now() + Math.max(5, timeoutSeconds) * 1000;
  while (Date.now() < deadline) {
    const response = await httpRequest({
      profileName,
      profile,
      baseOrigin: originForBase(profile, base),
      method: "GET",
      path,
    });
    assertOkResponse(response, { label: "browser-flow poll" });
    const payload = maybeParseJson(response.text) || {};
    if (payload.status === "completed") {
      return payload;
    }
    if (payload.status === "failed" || payload.status === "expired") {
      throw new Error(payload.error || `Browser flow ${payload.status}.`);
    }
    await sleep(1500);
  }
  throw new Error("Browser flow timed out.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createConfigCommands(root) {
  const config = root.command("config").description("Manage CLI profiles and local state");
  const profiles = config.command("profiles").description("List configured profiles");
  profiles.option("--json", "Print stable JSON output").action((options) => {
    const store = loadProfiles();
    const items = Object.entries(store.profiles || {}).map(([name, profile]) => ({
      name,
      current: name === store.current,
      gatewayOrigin: profile.gatewayOrigin,
      adminOrigin: profile.adminOrigin,
      insecure: Boolean(profile.insecure),
    }));
    printOutput(items, { json: options.json });
  });

  config
    .command("show [name]")
    .description("Show a profile")
    .option("--json", "Print stable JSON output")
    .action((name, options) => {
      const { name: resolvedName, profile } = resolveProfile(name);
      printOutput({ name: resolvedName, ...profile }, { json: options.json });
    });

  config
    .command("use <name>")
    .description("Select the active profile")
    .action((name) => {
      const store = loadProfiles();
      if (!store.profiles[name]) {
        throw new Error(`Unknown profile: ${name}`);
      }
      store.current = name;
      saveProfiles(store);
      printOutput(`Active profile: ${name}`);
    });

  config
    .command("set <profile> <key> <value>")
    .description("Set a profile key")
    .action((profileName, key, value) => {
      const store = loadProfiles();
      if (!store.profiles[profileName]) {
        store.profiles[profileName] = {};
      }
      store.profiles[profileName][key] = normalizeProfileValue(value);
      saveProfiles(store);
      printOutput({ ok: true, profile: profileName, key, value: store.profiles[profileName][key] });
    });

  config
    .command("remove <name>")
    .description("Remove a saved profile")
    .action((name) => {
      const store = loadProfiles();
      if (name === "default") {
        throw new Error("The default profile cannot be removed.");
      }
      delete store.profiles[name];
      if (store.current === name) {
        store.current = "default";
      }
      saveProfiles(store);
      printOutput({ ok: true, removed: name });
    });
}

function normalizeProfileValue(value) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return value;
}

const program = new Command();
program
  .name("maple")
  .description("User-facing Maple CLI for gateway and admin backend functions")
  .showHelpAfterError();

createConfigCommands(program);
createCommandTree(program);

program.parseAsync(process.argv).catch((error) => {
  const payload = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    details: error?.response ? maybeParseJson(error.response.text) || error.response.text : undefined,
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = 1;
});
