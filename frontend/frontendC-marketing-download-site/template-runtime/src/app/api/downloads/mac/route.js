const FALLBACK_URL = "https://github.com/omar2001ramadan/Mayple/releases";

export async function GET(request) {
  try {
    const origin = new URL(request.url).origin;
    const res = await fetch(`${origin}/api/downloads/latest`);
    if (!res.ok) throw new Error("upstream error");
    const data = await res.json();
    const url = data.mac || FALLBACK_URL;
    return Response.redirect(url, 302);
  } catch {
    return Response.redirect(FALLBACK_URL, 302);
  }
}
