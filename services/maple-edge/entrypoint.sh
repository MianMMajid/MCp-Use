#!/bin/sh
set -eu

if [ -z "${OIDC_JWKS_URI:-}" ]; then
  echo "[maple-edge] OIDC_JWKS_URI is required" >&2
  exit 1
fi

if [ -z "${OIDC_ISSUER:-}" ]; then
  echo "[maple-edge] OIDC_ISSUER is required" >&2
  exit 1
fi

if [ -z "${OIDC_AUDIENCE:-}" ]; then
  echo "[maple-edge] OIDC_AUDIENCE is required" >&2
  exit 1
fi

if [ -z "${MAPLE_OIDC_JWKS_HOST:-}" ]; then
  MAPLE_OIDC_JWKS_HOST="$(printf '%s' "$OIDC_JWKS_URI" | sed -E 's#^[a-zA-Z]+://([^/:]+).*#\1#')"
  export MAPLE_OIDC_JWKS_HOST
fi

if [ -z "${MAPLE_OTEL_COLLECTOR_HOST:-}" ]; then
  MAPLE_OTEL_COLLECTOR_HOST="otel-collector"
  export MAPLE_OTEL_COLLECTOR_HOST
fi

for cert in /etc/envoy/certs/tls.crt /etc/envoy/certs/tls.key /etc/envoy/certs/client-ca.crt /etc/envoy/certs/internal-ca.crt; do
  if [ ! -f "$cert" ]; then
    echo "[maple-edge] required certificate file missing: $cert" >&2
    exit 1
  fi
done

escape_sed() {
  printf '%s' "$1" | sed -e 's/[&|]/\\&/g'
}

OIDC_JWKS_URI_ESCAPED="$(escape_sed "$OIDC_JWKS_URI")"
MAPLE_OIDC_JWKS_HOST_ESCAPED="$(escape_sed "$MAPLE_OIDC_JWKS_HOST")"
OIDC_ISSUER_ESCAPED="$(escape_sed "$OIDC_ISSUER")"
OIDC_AUDIENCE_ESCAPED="$(escape_sed "$OIDC_AUDIENCE")"
MAPLE_OTEL_COLLECTOR_HOST_ESCAPED="$(escape_sed "$MAPLE_OTEL_COLLECTOR_HOST")"

sed \
  -e "s|__OIDC_JWKS_URI__|$OIDC_JWKS_URI_ESCAPED|g" \
  -e "s|__MAPLE_OIDC_JWKS_HOST__|$MAPLE_OIDC_JWKS_HOST_ESCAPED|g" \
  -e "s|__OIDC_ISSUER__|$OIDC_ISSUER_ESCAPED|g" \
  -e "s|__OIDC_AUDIENCE__|$OIDC_AUDIENCE_ESCAPED|g" \
  -e "s|__MAPLE_OTEL_COLLECTOR_HOST__|$MAPLE_OTEL_COLLECTOR_HOST_ESCAPED|g" \
  /etc/envoy/envoy.yaml.tmpl > /tmp/envoy.yaml

exec envoy -c /tmp/envoy.yaml
