/**
 * sso-saml.js
 *
 * SAML 2.0 Service Provider implementation using only node:crypto.
 * Builds AuthnRequests, verifies SAML Responses with XML signature
 * validation (RSA-SHA256), and extracts assertions.
 */
import { createVerify, randomUUID } from "node:crypto";

// ── XML Helpers ──────────────────────────────────────────────────────────────

/**
 * Minimal XML escaping for attribute values and text content.
 */
function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Extract the text content of the first occurrence of a tag.
 * Handles both prefixed (saml:NameID) and unprefixed tags.
 */
function extractTagContent(xml, localName) {
  // Try with common prefixes first, then unprefixed
  const prefixes = ["saml:", "saml2:", ""];
  for (const prefix of prefixes) {
    const open = `<${prefix}${localName}`;
    const closeTag = `</${prefix}${localName}>`;
    const startIdx = xml.indexOf(open);
    if (startIdx === -1) continue;
    const afterOpen = xml.indexOf(">", startIdx + open.length);
    if (afterOpen === -1) continue;
    // Check for self-closing tag
    if (xml[afterOpen - 1] === "/") return "";
    const closeIdx = xml.indexOf(closeTag, afterOpen + 1);
    if (closeIdx === -1) continue;
    return xml.slice(afterOpen + 1, closeIdx).trim();
  }
  return undefined;
}

/**
 * Extract an XML attribute value from the first occurrence of a tag.
 */
function extractTagAttribute(xml, localName, attrName) {
  const prefixes = ["saml:", "saml2:", "samlp:", "saml2p:", ""];
  for (const prefix of prefixes) {
    const open = `<${prefix}${localName}`;
    const startIdx = xml.indexOf(open);
    if (startIdx === -1) continue;
    const closeAngle = xml.indexOf(">", startIdx);
    if (closeAngle === -1) continue;
    const tagContent = xml.slice(startIdx, closeAngle + 1);
    const attrPattern = new RegExp(`${attrName}\\s*=\\s*"([^"]*)"`, "i");
    const match = tagContent.match(attrPattern);
    if (match) return match[1];
  }
  return undefined;
}

/**
 * Extract all Attribute elements from a SAML assertion.
 * Returns a map of Name -> Value(s).
 */
function extractAttributes(xml) {
  const attributes = {};
  const attrRegex = /<(?:saml:|saml2:)?Attribute\s+[^>]*Name\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/(?:saml:|saml2:)?Attribute>/gi;
  let match;
  while ((match = attrRegex.exec(xml)) !== null) {
    const name = match[1];
    const body = match[2];
    const values = [];
    const valueRegex = /<(?:saml:|saml2:)?AttributeValue[^>]*>([\s\S]*?)<\/(?:saml:|saml2:)?AttributeValue>/gi;
    let valMatch;
    while ((valMatch = valueRegex.exec(body)) !== null) {
      values.push(valMatch[1].trim());
    }
    attributes[name] = values.length === 1 ? values[0] : values;
  }
  return attributes;
}

/**
 * Extract the SignatureValue and signed content from a SAML XML document.
 * Returns { signatureValue, signedInfo, digestValue, referenceUri } or null.
 */
function extractSignatureComponents(xml) {
  // Extract the entire Signature block
  const sigBlockRegex = /<(?:ds:|dsig:)?Signature[^>]*>([\s\S]*?)<\/(?:ds:|dsig:)?Signature>/i;
  const sigMatch = xml.match(sigBlockRegex);
  if (!sigMatch) return null;

  const sigBlock = sigMatch[0];

  // Extract SignedInfo (with its namespace context for verification)
  const signedInfoRegex = /<(?:ds:|dsig:)?SignedInfo[^>]*>([\s\S]*?)<\/(?:ds:|dsig:)?SignedInfo>/i;
  const signedInfoMatch = sigBlock.match(signedInfoRegex);
  if (!signedInfoMatch) return null;
  const signedInfoRaw = signedInfoMatch[0];

  // Extract SignatureValue
  const sigValueRegex = /<(?:ds:|dsig:)?SignatureValue[^>]*>([\s\S]*?)<\/(?:ds:|dsig:)?SignatureValue>/i;
  const sigValueMatch = sigBlock.match(sigValueRegex);
  if (!sigValueMatch) return null;
  const signatureValue = sigValueMatch[1].replace(/\s+/g, "");

  // Extract DigestValue
  const digestValueRegex = /<(?:ds:|dsig:)?DigestValue[^>]*>([\s\S]*?)<\/(?:ds:|dsig:)?DigestValue>/i;
  const digestValueMatch = sigBlock.match(digestValueRegex);
  const digestValue = digestValueMatch ? digestValueMatch[1].replace(/\s+/g, "") : "";

  // Extract Reference URI
  const referenceRegex = /<(?:ds:|dsig:)?Reference\s+[^>]*URI\s*=\s*"([^"]*)"[^>]*/i;
  const refMatch = sigBlock.match(referenceRegex);
  const referenceUri = refMatch ? refMatch[1] : "";

  return {
    signatureValue,
    signedInfo: signedInfoRaw,
    digestValue,
    referenceUri,
    signatureBlock: sigMatch[0],
  };
}

/**
 * Normalize the SignedInfo element for verification by injecting the
 * relevant namespace declarations. Canonical XML (exc-c14n) requires
 * inclusive namespaces from ancestor elements.
 */
function canonicalizeSignedInfo(signedInfoRaw, fullXml) {
  // If the SignedInfo already declares the ds namespace, use as-is
  if (/xmlns:ds=/.test(signedInfoRaw) || /xmlns:dsig=/.test(signedInfoRaw)) {
    return signedInfoRaw;
  }
  // Find the ds namespace declaration from the parent Signature element
  const nsRegex = /xmlns:(ds|dsig)\s*=\s*"(http:\/\/www\.w3\.org\/2000\/09\/xmldsig#)"/i;
  const nsMatch = fullXml.match(nsRegex);
  if (nsMatch) {
    const prefix = nsMatch[1];
    const nsDecl = `xmlns:${prefix}="${nsMatch[2]}"`;
    // Inject namespace into the SignedInfo opening tag
    return signedInfoRaw.replace(
      /^<((?:ds:|dsig:)?SignedInfo)/,
      `<$1 ${nsDecl}`
    );
  }
  // If using default namespace (no prefix), inject standard ds namespace
  return signedInfoRaw.replace(
    /^<(SignedInfo)/,
    `<$1 xmlns="http://www.w3.org/2000/09/xmldsig#"`
  );
}

// ── XML Signature Verification ───────────────────────────────────────────────

/**
 * Verify an RSA-SHA256 XML signature using the IdP's public certificate.
 *
 * @param {string} xml - The full SAML Response XML
 * @param {string} certificate - PEM-encoded X.509 certificate from the IdP
 * @returns {{ valid: boolean, error?: string }}
 */
export function verifyXmlSignature(xml, certificate) {
  try {
    const components = extractSignatureComponents(xml);
    if (!components) {
      return { valid: false, error: "No XML signature found in document." };
    }

    // Normalize certificate to PEM format
    const pemCert = normalizeCertificateToPem(certificate);

    // Canonicalize the SignedInfo for verification
    const canonicalized = canonicalizeSignedInfo(components.signedInfo, xml);

    // Verify the signature over the SignedInfo
    const verifier = createVerify("RSA-SHA256");
    verifier.update(canonicalized, "utf8");
    const signatureBuffer = Buffer.from(components.signatureValue, "base64");
    const valid = verifier.verify(pemCert, signatureBuffer);

    if (!valid) {
      return { valid: false, error: "RSA-SHA256 signature verification failed." };
    }

    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: `Signature verification error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Normalize a certificate string to proper PEM format.
 * Accepts raw base64, PEM with headers, or multiline certificates.
 */
function normalizeCertificateToPem(cert) {
  if (!cert) throw new Error("Certificate is required for SAML signature verification.");

  let cleaned = String(cert).trim();

  // Strip PEM headers if present
  cleaned = cleaned
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");

  if (!cleaned) {
    throw new Error("Certificate is empty after normalization.");
  }

  // Re-wrap in PEM format with 64-char lines
  const lines = cleaned.match(/.{1,64}/g) || [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Build a SAML 2.0 AuthnRequest XML document.
 *
 * @param {{ entityId: string, acsUrl: string, destination: string }} params
 * @returns {string} AuthnRequest XML
 */
export function buildAuthnRequest({ entityId, acsUrl, destination }) {
  if (!entityId) throw new Error("entityId is required for SAML AuthnRequest.");
  if (!acsUrl) throw new Error("acsUrl is required for SAML AuthnRequest.");
  if (!destination) throw new Error("destination is required for SAML AuthnRequest.");

  const id = `_${randomUUID().replace(/-/g, "")}`;
  const issueInstant = new Date().toISOString();

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<samlp:AuthnRequest`,
    `  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"`,
    `  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"`,
    `  ID="${xmlEscape(id)}"`,
    `  Version="2.0"`,
    `  IssueInstant="${xmlEscape(issueInstant)}"`,
    `  Destination="${xmlEscape(destination)}"`,
    `  AssertionConsumerServiceURL="${xmlEscape(acsUrl)}"`,
    `  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"`,
    `  IsPassive="false">`,
    `  <saml:Issuer>${xmlEscape(entityId)}</saml:Issuer>`,
    `  <samlp:NameIDPolicy`,
    `    Format="urn:oasis:names:tc:SAML:2.0:nameid-format:emailAddress"`,
    `    AllowCreate="true" />`,
    `</samlp:AuthnRequest>`,
  ].join("\n");
}

/**
 * Parse and verify a base64-encoded SAML Response.
 *
 * @param {string} samlResponse - Base64 encoded SAML Response
 * @param {string} certificate - PEM or raw base64 X.509 certificate from IdP
 * @returns {{ nameId: string, attributes: Record<string, string|string[]>, sessionNotOnOrAfter?: string }}
 * @throws {Error} if signature is invalid or response cannot be parsed
 */
export function parseAndVerifySamlResponse(samlResponse, certificate) {
  if (!samlResponse) throw new Error("SAML Response is required.");
  if (!certificate) throw new Error("IdP certificate is required.");

  // Decode base64 SAML Response
  const xml = Buffer.from(samlResponse, "base64").toString("utf8");

  // Verify status is Success
  const statusCode = extractTagAttribute(xml, "StatusCode", "Value");
  if (statusCode && !statusCode.endsWith(":Success")) {
    throw new Error(`SAML Response status is not Success: ${statusCode}`);
  }

  // Verify XML signature
  const sigResult = verifyXmlSignature(xml, certificate);
  if (!sigResult.valid) {
    throw new Error(`SAML signature validation failed: ${sigResult.error}`);
  }

  // Check conditions (NotBefore / NotOnOrAfter on the Conditions element)
  const notBefore = extractTagAttribute(xml, "Conditions", "NotBefore");
  const notOnOrAfter = extractTagAttribute(xml, "Conditions", "NotOnOrAfter");
  const now = Date.now();

  if (notBefore) {
    const nbTime = new Date(notBefore).getTime();
    // Allow 2 minute clock skew
    if (Number.isFinite(nbTime) && now < nbTime - 120_000) {
      throw new Error("SAML assertion is not yet valid (NotBefore condition).");
    }
  }
  if (notOnOrAfter) {
    const noaTime = new Date(notOnOrAfter).getTime();
    // Allow 2 minute clock skew
    if (Number.isFinite(noaTime) && now > noaTime + 120_000) {
      throw new Error("SAML assertion has expired (NotOnOrAfter condition).");
    }
  }

  // Extract NameID
  const nameId = extractTagContent(xml, "NameID");
  if (!nameId) {
    throw new Error("SAML assertion does not contain a NameID.");
  }

  // Extract attributes
  const attributes = extractAttributes(xml);

  // Extract session expiry from AuthnStatement
  const sessionNotOnOrAfter = extractTagAttribute(xml, "AuthnStatement", "SessionNotOnOrAfter") || undefined;

  return {
    nameId,
    attributes,
    sessionNotOnOrAfter,
  };
}

/**
 * Build SAML Service Provider metadata XML.
 *
 * @param {{ entityId: string, acsUrl: string }} params
 * @returns {string} SP Metadata XML
 */
export function buildSpMetadata({ entityId, acsUrl }) {
  if (!entityId) throw new Error("entityId is required for SP metadata.");
  if (!acsUrl) throw new Error("acsUrl is required for SP metadata.");

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<md:EntityDescriptor`,
    `  xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"`,
    `  entityID="${xmlEscape(entityId)}">`,
    `  <md:SPSSODescriptor`,
    `    AuthnRequestsSigned="false"`,
    `    WantAssertionsSigned="true"`,
    `    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">`,
    `    <md:NameIDFormat>urn:oasis:names:tc:SAML:2.0:nameid-format:emailAddress</md:NameIDFormat>`,
    `    <md:AssertionConsumerService`,
    `      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"`,
    `      Location="${xmlEscape(acsUrl)}"`,
    `      index="0"`,
    `      isDefault="true" />`,
    `  </md:SPSSODescriptor>`,
    `</md:EntityDescriptor>`,
  ].join("\n");
}
