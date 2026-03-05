#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-${SCRIPT_DIR}/certs}"
DAYS="${MAPLE_NF_TLS_DAYS:-825}"

CA_KEY="${OUT_DIR}/ca.key"
CA_CRT="${OUT_DIR}/ca.crt"
TLS_KEY="${OUT_DIR}/tls.key"
TLS_CSR="${OUT_DIR}/tls.csr"
TLS_CRT="${OUT_DIR}/tls.crt"
TLS_EXT="${OUT_DIR}/tls-ext.cnf"

mkdir -p "${OUT_DIR}"

openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout "${CA_KEY}" \
  -out "${CA_CRT}" \
  -days 3650 \
  -subj "/CN=Maple Northflank Local CA"

cat >"${TLS_EXT}" <<'EOT'
subjectAltName = @alt_names
extendedKeyUsage = serverAuth, clientAuth
keyUsage = digitalSignature, keyEncipherment

[alt_names]
DNS.1 = localhost
DNS.2 = gateway-api
DNS.3 = context-wall
DNS.4 = mcp-proxy
DNS.5 = cyber-proxy
DNS.6 = audit-writer
DNS.7 = openclaw-bridge
DNS.8 = openclaw-gateway
EOT

openssl req -newkey rsa:4096 -nodes \
  -keyout "${TLS_KEY}" \
  -out "${TLS_CSR}" \
  -subj "/CN=gateway-api"

openssl x509 -req \
  -in "${TLS_CSR}" \
  -CA "${CA_CRT}" \
  -CAkey "${CA_KEY}" \
  -CAcreateserial \
  -out "${TLS_CRT}" \
  -days "${DAYS}" \
  -extfile "${TLS_EXT}"

rm -f "${TLS_CSR}" "${TLS_EXT}" "${OUT_DIR}/ca.srl"
chmod 600 "${CA_KEY}" "${TLS_KEY}"
chmod 644 "${CA_CRT}" "${TLS_CRT}"

echo "Generated Northflank TLS bundle:"
echo "  CA:   ${CA_CRT}"
echo "  Cert: ${TLS_CRT}"
echo "  Key:  ${TLS_KEY}"
