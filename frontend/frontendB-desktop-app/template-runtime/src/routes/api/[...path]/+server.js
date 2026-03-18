import { env } from '$env/dynamic/private';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

function sanitizePath(raw) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(raw ?? ''));
  } catch {
    return null;
  }
  const segments = decoded.split('/').filter(Boolean);
  if (segments.some((s) => s === '..' || s === '.' || s.includes('\0'))) {
    return null;
  }
  return segments.join('/');
}

function backendBase() {
  return env.MAYPLE_BACKEND_URL || env.BACKEND_URL || env.MAPLE_GATEWAY_ORIGIN || 'http://127.0.0.1:3000';
}

async function proxy(request, path) {
  const safePath = sanitizePath(path);
  if (safePath === null) {
    return new Response(
      JSON.stringify({ error: 'Invalid path' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    );
  }
  const target = new URL(`/api/${safePath}`, backendBase());
  const inUrl = new URL(request.url);
  target.search = inUrl.search;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', inUrl.host);

  let response;
  try {
    response = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        message: 'Backend API unavailable',
        target: safePath,
        details: message,
      }),
      {
        status: 503,
        headers: { 'content-type': 'application/json' },
      },
    );
  }

  // Node's fetch auto-decompresses gzip/br responses but keeps the
  // content-encoding header.  Forwarding that header causes browsers to
  // try to decompress already-decompressed data → "cannot decode raw data".
  const proxiedHeaders = new Headers(response.headers);
  proxiedHeaders.delete('content-encoding');
  proxiedHeaders.delete('content-length');
  proxiedHeaders.delete('transfer-encoding');

  return new Response(response.body, {
    status: response.status,
    headers: proxiedHeaders,
  });
}

const handlers = Object.fromEntries(
  METHODS.map((method) => [method, async ({ request, params }) => proxy(request, params.path)]),
);

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
export const OPTIONS = handlers.OPTIONS;
