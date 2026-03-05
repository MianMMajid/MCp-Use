import { resolveDownloadState, getReleasesPageUrl } from '../_lib'

export async function GET() {
  try {
    const state = await resolveDownloadState()
    const data = {
      source: state.source,
      version: state.version,
      published: state.published,
      mac_arm64: state.mac_arm64,
      mac_x64: state.mac_x64,
      win_x64: state.win_x64,
      releases_url: getReleasesPageUrl(state),
      mac: state.mac,
      win: state.win,
    }
    return Response.json(data, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    })
  } catch (err) {
    return Response.json(
      { error: 'Failed to resolve desktop downloads', detail: err.message },
      { status: 502 },
    )
  }
}
