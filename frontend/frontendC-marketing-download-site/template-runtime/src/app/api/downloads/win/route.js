import path from 'node:path'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { resolveDownloadState, getReleasesPageUrl } from '../_lib'

export const runtime = 'nodejs'

function isExternalUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

async function streamFile(filePath) {
  const fileName = path.basename(filePath)
  const fileStats = await stat(filePath)
  const stream = createReadStream(filePath)

  return new Response(Readable.toWeb(stream), {
    headers: {
      'Content-Type': 'application/vnd.microsoft.portable-executable',
      'Content-Length': String(fileStats.size),
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET() {
  try {
    const state = await resolveDownloadState()

    if (state.local.win_x64) {
      try {
        return await streamFile(state.local.win_x64)
      } catch {
        // Fall through to remote fallback if local artifact disappears.
      }
    }

    if (isExternalUrl(state.win)) {
      return Response.redirect(state.win, 302)
    }

    return Response.redirect(getReleasesPageUrl(state), 302)
  } catch {
    return Response.redirect(
      'https://github.com/MianMMajid/MCp-Use/releases',
      302,
    )
  }
}
