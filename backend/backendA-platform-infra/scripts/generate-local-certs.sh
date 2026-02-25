#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || (cd "${SCRIPT_DIR}/../../.." && pwd))"

CERT_DIR="${MAPLE_CERT_DIR:-${ROOT_DIR}/backend/backendA-platform-infra/certs}"
CA_KEY="${CERT_DIR}/ca.key"
CA_CRT="${CERT_DIR}/ca.crt"
TLS_KEY="${CERT_DIR}/tls.key"
TLS_CSR="${CERT_DIR}/tls.csr"
TLS_CRT="${CERT_DIR}/tls.crt"
TLS_SRL="${CERT_DIR}/ca.srl"
TLS_EXT="${CERT_DIR}/tls-ext.cnf"

mkdir -p "${CERT_DIR}"

if [ "${MAPLE_FORCE_CERT_REGEN:-0}" = "1" ]; then
  rm -f "${CA_KEY}" "${CA_CRT}" "${TLS_KEY}" "${TLS_CSR}" "${TLS_CRT}" "${TLS_SRL}" "${TLS_EXT}"
fi

if [ ! -f "${CA_KEY}" ] || [ ! -f "${CA_CRT}" ]; then
  openssl req -x509 -newkey rsa:4096 -nodes \
    -keyout "${CA_KEY}" \
    -out "${CA_CRT}" \
    -days 3650 \
    -subj "/CN=Maple Local Dev CA"
fi

if [ ! -f "${TLS_KEY}" ] || [ ! -f "${TLS_CRT}" ]; then
  cat >"${TLS_EXT}" <<'EOT'
subjectAltName = @alt_names
extendedKeyUsage = serverAuth, clientAuth
keyUsage = digitalSignature, keyEncipherment

[alt_names]
DNS.1 = localhost
DNS.2 = *.maple.svc.cluster.local
DNS.3 = gateway-api.maple.svc.cluster.local
DNS.4 = admin-console-api.maple.svc.cluster.local
DNS.5 = context-wall.maple.svc.cluster.local
DNS.6 = model-router.maple.svc.cluster.local
DNS.7 = mcp-proxy.maple.svc.cluster.local
DNS.8 = cyber-proxy.maple.svc.cluster.local
DNS.9 = tool-runner.maple.svc.cluster.local
DNS.10 = audit-writer.maple.svc.cluster.local
DNS.11 = secrets-broker.maple.svc.cluster.local
DNS.12 = postgres.maple.svc.cluster.local
IP.1 = 127.0.0.1
EOT

  openssl req -newkey rsa:4096 -nodes \
    -keyout "${TLS_KEY}" \
    -out "${TLS_CSR}" \
    -subj "/CN=localhost"

  openssl x509 -req \
    -in "${TLS_CSR}" \
    -CA "${CA_CRT}" \
    -CAkey "${CA_KEY}" \
    -CAcreateserial \
    -out "${TLS_CRT}" \
    -days 825 \
    -extfile "${TLS_EXT}"

  rm -f "${TLS_CSR}" "${TLS_EXT}"
fi

chmod 600 "${CA_KEY}" "${TLS_KEY}"
chmod 644 "${CA_CRT}" "${TLS_CRT}"

echo "Generated local cert bundle in ${CERT_DIR}:"
echo "  CA:   ${CA_CRT}"
echo "  Cert: ${TLS_CRT}"
echo "  Key:  ${TLS_KEY}"
