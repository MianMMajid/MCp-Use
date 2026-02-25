#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const rootDir = path.resolve(scriptDir, "../../..");
const stubsRoot = path.resolve(
  rootDir,
  "backend/backendB-core-services/shared/packages/maple-proto-ts/dist",
);
const contractsRoot = path.resolve(rootDir, "backend/backendB-core-services/contracts/proto");
const runtimeProtoRoots = [
  path.resolve(rootDir, "backend/proto"),
  path.resolve(rootDir, "backend/backendB-core-services/proto"),
  path.resolve(rootDir, "backend/backendB-core-services/admin-console-api/proto"),
];

function toPosix(input) {
  return input.split(path.sep).join(path.posix.sep);
}

async function walk(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(full)));
      continue;
    }
    if (!entry.name.endsWith("_pb.d.ts")) continue;
    out.push(full);
  }
  return out;
}

function parseImportProtoPaths(text, protoPath) {
  const importRegex = /^import type .* from "([^\"]+)";$/gm;
  const imports = [];
  for (const match of text.matchAll(importRegex)) {
    const raw = match[1];
    if (!raw.endsWith("_pb")) continue;
    imports.push(`${raw.slice(0, -3)}.proto`);
  }
  return [...new Set(imports)];
}

function parseEnums(lines) {
  const enums = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/@generated from enum ([^\s]+)/);
    if (!m) continue;

    let enumName = "";
    while (i < lines.length && !enumName) {
      i += 1;
      const nameMatch = lines[i]?.match(/^export declare enum ([A-Za-z0-9_]+) \{/);
      if (nameMatch) enumName = nameMatch[1];
    }

    const values = [];
    while (i < lines.length) {
      const valueMatch = lines[i].match(/@generated from enum value: ([A-Z0-9_]+) = (-?[0-9]+);/);
      if (valueMatch) {
        values.push({ name: valueMatch[1], number: Number.parseInt(valueMatch[2], 10) });
      }
      if (lines[i].trim() === "}") break;
      i += 1;
    }

    if (enumName && values.length > 0) {
      enums.push({ name: enumName, values });
    }
  }
  return enums;
}

function parseMessages(lines) {
  const messages = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/@generated from message ([^\s]+)/);
    if (!m) continue;

    let messageName = "";
    let declarationLine = "";
    while (i < lines.length && !messageName) {
      i += 1;
      const nameMatch = lines[i]?.match(/^export type ([A-Za-z0-9_]+) = Message/);
      if (nameMatch) {
        messageName = nameMatch[1];
        declarationLine = lines[i] ?? "";
      }
    }

    const fields = [];
    if (declarationLine.includes("& {};")) {
      messages.push({ name: messageName, fields });
      continue;
    }

    while (i < lines.length) {
      const fieldMatch = lines[i].match(/@generated from field: (.+);/);
      if (fieldMatch) {
        fields.push(`${fieldMatch[1]};`);
      }
      if (lines[i].trim() === "};") break;
      i += 1;
    }

    if (messageName) {
      messages.push({ name: messageName, fields });
    }
  }
  return messages;
}

function parseServices(lines) {
  const services = [];
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(/@generated from service ([^\s]+)/);
    if (!m) continue;

    let serviceName = "";
    while (i < lines.length && !serviceName) {
      i += 1;
      const nameMatch = lines[i]?.match(/^export declare const ([A-Za-z0-9_]+): GenService<\{/);
      if (nameMatch) serviceName = nameMatch[1];
    }

    const methods = [];
    let currentMethod = null;

    while (i < lines.length) {
      const rpcMatch = lines[i].match(/@generated from rpc [^\s]+\.([A-Za-z0-9_]+)$/);
      if (rpcMatch) {
        currentMethod = {
          name: rpcMatch[1],
          methodKind: "unary",
          input: "",
          output: "",
        };
      }

      if (currentMethod) {
        const kindMatch = lines[i].match(/methodKind: "([a-z_]+)";/);
        if (kindMatch) currentMethod.methodKind = kindMatch[1];

        const inputMatch = lines[i].match(/input: typeof ([A-Za-z0-9_]+)Schema;/);
        if (inputMatch) currentMethod.input = inputMatch[1];

        const outputMatch = lines[i].match(/output: typeof ([A-Za-z0-9_]+)Schema;/);
        if (outputMatch) currentMethod.output = outputMatch[1];

        if (
          lines[i].trim() === "};" &&
          currentMethod.input &&
          currentMethod.output
        ) {
          methods.push(currentMethod);
          currentMethod = null;
        }
      }

      if (lines[i].trim() === "}>;") break;
      i += 1;
    }

    if (serviceName && methods.length > 0) {
      services.push({ name: serviceName, methods });
    }
  }
  return services;
}

function rpcSignature(method) {
  const inputPrefix =
    method.methodKind === "client_streaming" || method.methodKind === "bidi_streaming"
      ? "stream "
      : "";
  const outputPrefix =
    method.methodKind === "server_streaming" || method.methodKind === "bidi_streaming"
      ? "stream "
      : "";
  return `  rpc ${method.name} (${inputPrefix}${method.input}) returns (${outputPrefix}${method.output});`;
}

function renderProto({ protoPath, imports, enums, messages, services }) {
  const packageName = path.posix.dirname(protoPath).split("/").join(".");
  const lines = [];
  lines.push('syntax = "proto3";');
  lines.push("");
  lines.push(`package ${packageName};`);
  if (imports.length > 0) {
    lines.push("");
    for (const imp of imports) {
      lines.push(`import \"${imp}\";`);
    }
  }

  for (const e of enums) {
    lines.push("");
    lines.push(`enum ${e.name} {`);
    for (const value of e.values) {
      lines.push(`  ${value.name} = ${value.number};`);
    }
    lines.push("}");
  }

  for (const msg of messages) {
    lines.push("");
    lines.push(`message ${msg.name} {`);
    for (const field of msg.fields) {
      lines.push(`  ${field}`);
    }
    lines.push("}");
  }

  for (const service of services) {
    lines.push("");
    lines.push(`service ${service.name} {`);
    for (const method of service.methods) {
      lines.push(rpcSignature(method));
    }
    lines.push("}");
  }

  lines.push("");
  return `${lines.join("\n")}`;
}

async function cleanTree(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

async function main() {
  const files = await walk(path.resolve(stubsRoot, "maple"));
  if (files.length === 0) {
    throw new Error(`No *_pb.d.ts files found under ${stubsRoot}`);
  }

  await cleanTree(contractsRoot);
  for (const runtimeRoot of runtimeProtoRoots) {
    await cleanTree(runtimeRoot);
  }

  let generatedCount = 0;

  for (const file of files) {
    const text = await fs.readFile(file, "utf8");
    const lines = text.split(/\r?\n/);
    const descMatch = text.match(/Describes the file ([^\s]+)\./);
    if (!descMatch) continue;

    const protoPath = descMatch[1];
    const imports = parseImportProtoPaths(text, protoPath);
    const enums = parseEnums(lines);
    const messages = parseMessages(lines);
    const services = parseServices(lines);

    const output = renderProto({ protoPath, imports, enums, messages, services });

    const contractsFile = path.resolve(contractsRoot, toPosix(protoPath));
    await fs.mkdir(path.dirname(contractsFile), { recursive: true });
    await fs.writeFile(contractsFile, output, "utf8");
    for (const runtimeRoot of runtimeProtoRoots) {
      const runtimeFile = path.resolve(runtimeRoot, toPosix(protoPath));
      await fs.mkdir(path.dirname(runtimeFile), { recursive: true });
      await fs.writeFile(runtimeFile, output, "utf8");
    }

    generatedCount += 1;
  }

  console.log(`Generated ${generatedCount} proto files.`);
  console.log(`Contracts: ${path.relative(rootDir, contractsRoot)}`);
  for (const runtimeRoot of runtimeProtoRoots) {
    console.log(`Runtime:   ${path.relative(rootDir, runtimeRoot)}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
