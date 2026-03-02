const GITHUB_REPO = "omar2001ramadan/Mayple";
const CACHE_TTL_MS = 10 * 60 * 1000;

let cached = null;
let cachedAt = 0;

async function fetchLatestRelease() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const headers = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    { headers, next: { revalidate: 0 } },
  );

  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status}`);
  }

  const release = await res.json();
  const assets = release.assets || [];

  const find = (pattern) =>
    assets.find((a) => pattern.test(a.name))?.browser_download_url ?? null;

  const data = {
    version: release.tag_name,
    published: release.published_at,
    mac_arm64: find(/maple-desktop-.*-mac-arm64\.dmg$/i),
    mac_x64: find(/maple-desktop-.*-mac-x64\.dmg$/i),
    win_x64: find(/maple-desktop-.*-win-x64\.exe$/i),
    releases_url: release.html_url,
  };

  // Use whichever macOS build exists as the default mac URL
  data.mac = data.mac_arm64 || data.mac_x64 || null;
  data.win = data.win_x64 || null;

  cached = data;
  cachedAt = now;
  return data;
}

export async function GET() {
  try {
    const data = await fetchLatestRelease();
    return Response.json(data, {
      headers: { "Cache-Control": "public, max-age=600" },
    });
  } catch (err) {
    return Response.json(
      { error: "Failed to fetch latest release", detail: err.message },
      { status: 502 },
    );
  }
}
