import { env } from '$env/dynamic/private';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

function backendBase() {
  return env.MAYPLE_BACKEND_URL || env.BACKEND_URL || 'http://localhost:8000';
}

async function proxy(request, path) {
  const target = new URL(`/api/${path}`, backendBase());
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
        target: target.toString(),
        details: message,
      }),
      {
        status: 503,
        headers: { 'content-type': 'application/json' },
      },
    );
  }

  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
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
