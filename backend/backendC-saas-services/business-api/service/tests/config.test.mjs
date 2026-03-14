import assert from "node:assert/strict";
import test from "node:test";

import {
  billingEnabled,
  businessApiHost,
  businessApiPort,
  businessApiTlsCaPath,
  businessApiTlsCertPath,
  businessApiTlsKeyPath,
  serviceName,
} from "../src/config.js";

test("business-api config exposes service defaults", () => {
  assert.equal(serviceName, "business-api");
  assert.equal(typeof businessApiHost, "string");
  assert.equal(typeof businessApiPort, "number");
  assert.equal(businessApiPort > 0, true);
  assert.equal(typeof businessApiTlsCertPath, "string");
  assert.equal(typeof businessApiTlsKeyPath, "string");
  assert.equal(typeof businessApiTlsCaPath, "string");
  assert.equal(typeof billingEnabled, "boolean");
});
