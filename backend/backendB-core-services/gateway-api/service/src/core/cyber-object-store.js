import { mkdir, writeFile, stat, rename, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  cyberObjectStoreBaseUrl,
  cyberObjectStoreMode,
  cyberObjectStorePrefix,
  cyberObjectStoreStorageDir,
  cyberObjectStoreToken,
} from "../config.js";

function normalizeBuffer(content) {
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof Uint8Array) return Buffer.from(content);
  if (typeof content === "string") return Buffer.from(content, "utf8");
  return Buffer.from(JSON.stringify(content ?? null, null, 2));
}

function objectKeyForEvidence(evidence) {
  const safeFilename = String(evidence.filename || "artifact").replace(/[^a-zA-Z0-9._-]+/g, "_");
  const parts = [
    cyberObjectStorePrefix,
    evidence.tenantId || "tenant",
    evidence.orgId || "org",
    evidence.incidentId || "incident",
    `${evidence.sha256 || evidence.evidenceId}-${safeFilename}`,
  ].filter(Boolean);
  return parts.join("/");
}

async function putFilesystemObject(key, content, contentType) {
  const storagePath = join(cyberObjectStoreStorageDir, key);
  await mkdir(dirname(storagePath), { recursive: true });
  await writeFile(storagePath, normalizeBuffer(content));
  return {
    objectRef: `file://${storagePath}`,
    storagePath,
    metadata: {
      provider: "filesystem",
      contentType,
    },
  };
}

async function putHttpObject(key, content, contentType) {
  const baseUrl = String(cyberObjectStoreBaseUrl ?? "").replace(/\/+$/g, "");
  const token = String(cyberObjectStoreToken ?? "").trim();
  if (!baseUrl) {
    throw new Error("Remote cyber object store base URL is not configured.");
  }
  const targetUrl = `${baseUrl}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const response = await fetch(targetUrl, {
    method: "PUT",
    headers: {
      "content-type": contentType || "application/octet-stream",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: normalizeBuffer(content),
  });
  if (!response.ok) {
    throw new Error(`Remote object store write failed: ${response.status}`);
  }
  return {
    objectRef: targetUrl,
    storagePath: "",
    metadata: {
      provider: "http",
      contentType,
    },
  };
}

async function readFilesystemObject(objectRef) {
  const storagePath = String(objectRef).replace(/^file:\/\//, "");
  return readFile(storagePath);
}

async function readHttpObject(objectRef) {
  const token = String(cyberObjectStoreToken ?? "").trim();
  const response = await fetch(objectRef, {
    method: "GET",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`Remote object store read failed: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function markFilesystemSuffix(key, suffix) {
  const path = join(cyberObjectStoreStorageDir, key);
  try {
    await stat(path);
  } catch {
    return false;
  }
  await rename(path, `${path}.${suffix}`).catch(() => {});
  return true;
}

async function postRemoteMutation(key, action) {
  const baseUrl = String(cyberObjectStoreBaseUrl ?? "").replace(/\/+$/g, "");
  const token = String(cyberObjectStoreToken ?? "").trim();
  if (!baseUrl) return false;
  const targetUrl = `${baseUrl}/${key.split("/").map(encodeURIComponent).join("/")}/${action}`;
  const response = await fetch(targetUrl, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }).catch(() => null);
  return Boolean(response?.ok);
}

export function getCyberObjectStore() {
  return {
    mode: cyberObjectStoreMode,
    async putImmutableObject({ evidence, content, contentType }) {
      const key = objectKeyForEvidence(evidence);
      if (cyberObjectStoreMode === "http") {
        return putHttpObject(key, content, contentType);
      }
      return putFilesystemObject(key, content, contentType);
    },
    async readImmutableObject(objectRef) {
      if (String(objectRef).startsWith("file://")) {
        return readFilesystemObject(objectRef);
      }
      return readHttpObject(objectRef);
    },
    async markHeld(objectRef) {
      if (!objectRef) return false;
      const key = String(objectRef).startsWith("file://")
        ? String(objectRef).replace(`file://${cyberObjectStoreStorageDir}/`, "")
        : new URL(String(objectRef)).pathname.replace(/^\//, "");
      if (cyberObjectStoreMode === "http") {
        return postRemoteMutation(key, "hold");
      }
      return markFilesystemSuffix(key, "hold");
    },
    async markArchived(objectRef) {
      if (!objectRef) return false;
      const key = String(objectRef).startsWith("file://")
        ? String(objectRef).replace(`file://${cyberObjectStoreStorageDir}/`, "")
        : new URL(String(objectRef)).pathname.replace(/^\//, "");
      if (cyberObjectStoreMode === "http") {
        return postRemoteMutation(key, "archive");
      }
      return markFilesystemSuffix(key, "archived");
    },
  };
}
