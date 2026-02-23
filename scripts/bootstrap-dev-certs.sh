#!/bin/sh
set -eu

CERT_DIR="${CERT_DIR:-/certs}"
mkdir -p "$CERT_DIR"

CA_KEY="$CERT_DIR/ca.key"
CA_CERT="$CERT_DIR/ca.crt"
TLS_KEY="$CERT_DIR/tls.key"
TLS_CSR="$CERT_DIR/tls.csr"
TLS_CERT="$CERT_DIR/tls.crt"
OPENSSL_CFG="$CERT_DIR/openssl-maple.cnf"

if [ -f "$CA_CERT" ] && [ -f "$TLS_CERT" ] && [ -f "$TLS_KEY" ] && [ -f "$CERT_DIR/client-ca.crt" ] && [ -f "$CERT_DIR/internal-ca.crt" ]; then
  echo "[cert-bootstrap] Existing dev TLS cert material found in $CERT_DIR."
  exit 0
fi

if ! command -v openssl >/dev/null 2>&1; then
  apk add --no-cache openssl >/dev/null
fi

cat > "$OPENSSL_CFG" <<'EOF'
[req]
default_bits = 2048
distinguished_name = dn
req_extensions = req_ext
prompt = no

[dn]
CN = maple-dev.internal
O = Maple Dev

[req_ext]
subjectAltName = @alt_names
extendedKeyUsage = serverAuth,clientAuth
keyUsage = digitalSignature,keyEncipherment

[alt_names]
DNS.1 = localhost
DNS.2 = gateway-api
DNS.3 = context-wall
DNS.4 = model-router
DNS.5 = mcp-proxy
DNS.6 = secrets-broker
DNS.7 = tool-runner
DNS.8 = cyber-proxy
DNS.9 = audit-writer
DNS.10 = admin-console
DNS.11 = maple-edge
DNS.12 = otel-collector
IP.1 = 127.0.0.1
EOF

echo "[cert-bootstrap] Generating local Maple CA + mTLS leaf certs..."
openssl genrsa -out "$CA_KEY" 4096 >/dev/null 2>&1
openssl req -x509 -new -nodes -key "$CA_KEY" -sha256 -days 3650 \
  -subj "/CN=Maple Dev Local CA/O=Maple Dev" \
  -out "$CA_CERT" >/dev/null 2>&1

openssl genrsa -out "$TLS_KEY" 2048 >/dev/null 2>&1
openssl req -new -key "$TLS_KEY" -out "$TLS_CSR" -config "$OPENSSL_CFG" >/dev/null 2>&1
openssl x509 -req -in "$TLS_CSR" -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
  -out "$TLS_CERT" -days 825 -sha256 -extensions req_ext -extfile "$OPENSSL_CFG" >/dev/null 2>&1

cp "$CA_CERT" "$CERT_DIR/client-ca.crt"
cp "$CA_CERT" "$CERT_DIR/internal-ca.crt"

chmod 600 "$CA_KEY" "$TLS_KEY"
chmod 644 "$CA_CERT" "$TLS_CERT" "$CERT_DIR/client-ca.crt" "$CERT_DIR/internal-ca.crt"

rm -f "$TLS_CSR" "$CERT_DIR/ca.srl" "$OPENSSL_CFG"
echo "[cert-bootstrap] Dev TLS certificates are ready."
