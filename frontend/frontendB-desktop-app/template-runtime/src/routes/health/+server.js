export function GET() {
  return new Response(JSON.stringify({ ok: true, service: 'frontendB-sveltekit' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
