import assert from "node:assert/strict";
import test from "node:test";

import { CredentialStore } from "../src/credential-store.js";

test("credential store mints, lists, and revokes credentials", () => {
  const store = new CredentialStore();

  try {
    const cred = store.mint("web_search", "toolhub", ["execute", "domain:example.com"], 60, "tester");
    assert.equal(typeof cred.credentialId, "string");
    assert.equal(typeof cred.token, "string");
    assert.equal(cred.status, "active");

    const loaded = store.get(cred.credentialId);
    assert.equal(loaded?.credentialId, cred.credentialId);

    const active = store.listActive("toolhub", "web_search");
    assert.equal(active.length, 1);
    assert.equal(active[0].credentialId, cred.credentialId);

    const revoked = store.revoke(cred.credentialId);
    assert.equal(revoked, true);

    const afterRevoke = store.listActive("toolhub", "web_search");
    assert.equal(afterRevoke.length, 0);
  } finally {
    store.destroy();
  }
});
