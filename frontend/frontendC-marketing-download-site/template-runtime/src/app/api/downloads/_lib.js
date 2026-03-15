import path from 'node:path'
import { readdir } from 'node:fs/promises'

const DESKTOP_RELEASE_REPO =
  process.env.MAPLE_DESKTOP_RELEASE_REPO || 'MianMMajid/MCp-Use'
const CACHE_TTL_MS = 60 * 1000

const MAC_ARM64_RE = /maple-desktop-(.+?)-(?:mac|darwin)-arm64\.dmg$/i
const MAC_X64_RE = /maple-desktop-(.+?)-(?:mac|darwin)-x64\.dmg$/i
const WIN_X64_RE = /maple-desktop-(.+?)-(?:win|windows)-x64\.exe$/i

const LOCAL_DIST_CANDIDATES = [
  path.resolve(process.cwd(), '../../frontendB-desktop-app/installers/dist'),
  path.resolve(process.cwd(), '../frontendB-desktop-app/installers/dist'),
  path.resolve(process.cwd(), 'frontend/frontendB-desktop-app/installers/dist'),
  path.resolve(process.cwd(), 'frontendB-desktop-app/installers/dist'),
]

let cachedState = null
let cachedAt = 0

function pickNewest(items) {
  if (!items.length) return null
  return items.sort((a, b) =>
    b.version.localeCompare(a.version, undefined, { numeric: true }),
  )[0]
}

async function findLocalAssets() {
  for (const dir of LOCAL_DIST_CANDIDATES) {
    let names
    try {
      names = await readdir(dir)
    } catch {
      continue
    }

    const toMatches = (regex) =>
      names
        .map((name) => {
          const match = name.match(regex)
          if (!match) return null
          return {
            name,
            version: match[1],
            filePath: path.join(dir, name),
          }
        })
        .filter(Boolean)

    const macArm = pickNewest(toMatches(MAC_ARM64_RE))
    const macX64 = pickNewest(toMatches(MAC_X64_RE))
    const winX64 = pickNewest(toMatches(WIN_X64_RE))

    if (!macArm && !macX64 && !winX64) {
      continue
    }

    const version = macArm?.version || macX64?.version || winX64?.version || null
    return {
      source: 'local',
      version,
      published: null,
      releases_url: null,
      mac_arm64: macArm ? '/api/downloads/mac' : null,
      mac_x64: macX64 ? '/api/downloads/mac' : null,
      win_x64: winX64 ? '/api/downloads/win' : null,
      mac: (macArm || macX64) ? '/api/downloads/mac' : null,
      win: winX64 ? '/api/downloads/win' : null,
      local: {
        mac_arm64: macArm?.filePath ?? null,
        mac_x64: macX64?.filePath ?? null,
        win_x64: winX64?.filePath ?? null,
      },
    }
  }

  return null
}

async function fetchRemoteDesktopRelease() {
  const headers = { Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  const res = await fetch(
    `https://api.github.com/repos/${DESKTOP_RELEASE_REPO}/releases?per_page=30`,
    { headers, next: { revalidate: 0 } },
  )

  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status}`)
  }

  const releases = await res.json()
  const release = releases.find((candidate) => {
    const names = (candidate.assets || []).map((a) => a.name)
    return names.some((name) => MAC_ARM64_RE.test(name) || MAC_X64_RE.test(name) || WIN_X64_RE.test(name))
  })

  if (!release) {
    return null
  }

  const assets = release.assets || []
  const findUrl = (regex) =>
    assets.find((asset) => regex.test(asset.name))?.browser_download_url ?? null

  const macArm64 = findUrl(MAC_ARM64_RE)
  const macX64 = findUrl(MAC_X64_RE)
  const winX64 = findUrl(WIN_X64_RE)

  return {
    source: 'github',
    version: release.tag_name,
    published: release.published_at,
    releases_url: release.html_url,
    mac_arm64: macArm64,
    mac_x64: macX64,
    win_x64: winX64,
    mac: macArm64 || macX64 || null,
    win: winX64 || null,
    local: {
      mac_arm64: null,
      mac_x64: null,
      win_x64: null,
    },
  }
}

function mergeStates(localState, remoteState) {
  if (!localState && !remoteState) {
    return {
      source: 'none',
      version: null,
      published: null,
      releases_url: `https://github.com/${DESKTOP_RELEASE_REPO}/releases`,
      mac_arm64: null,
      mac_x64: null,
      win_x64: null,
      mac: null,
      win: null,
      local: {
        mac_arm64: null,
        mac_x64: null,
        win_x64: null,
      },
      unavailable: true,
      message: 'No desktop installers found. Check the releases page for manual downloads.',
    }
  }

  if (!localState) return remoteState
  if (!remoteState) return localState

  return {
    source: 'hybrid',
    version: localState.version || remoteState.version,
    published: remoteState.published,
    releases_url: remoteState.releases_url,
    mac_arm64: localState.mac_arm64 || remoteState.mac_arm64,
    mac_x64: localState.mac_x64 || remoteState.mac_x64,
    win_x64: localState.win_x64 || remoteState.win_x64,
    mac: localState.mac || remoteState.mac,
    win: localState.win || remoteState.win,
    local: {
      mac_arm64: localState.local.mac_arm64,
      mac_x64: localState.local.mac_x64,
      win_x64: localState.local.win_x64,
    },
  }
}

export async function resolveDownloadState() {
  const now = Date.now()
  if (cachedState && now - cachedAt < CACHE_TTL_MS) {
    return cachedState
  }

  const localState = await findLocalAssets()
  let remoteState = null

  try {
    remoteState = await fetchRemoteDesktopRelease()
  } catch {
    remoteState = null
  }

  const state = mergeStates(localState, remoteState)
  cachedState = state
  cachedAt = now
  return state
}

export function getReleasesPageUrl(state) {
  return state?.releases_url || `https://github.com/${DESKTOP_RELEASE_REPO}/releases`
}

