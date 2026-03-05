import path from 'node:path'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { resolveDownloadState, getReleasesPageUrl } from '../_lib'

export const runtime = 'nodejs'

function isExternalUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

function pickLocalMacFile(state, userAgent) {
  const agent = (userAgent || '').toLowerCase()
  const prefersArm = agent.includes('arm') || agent.includes('apple')
  if (prefersArm) {
    return state.local.mac_arm64 || state.local.mac_x64 || null
  }
  return state.local.mac_x64 || state.local.mac_arm64 || null
}

async function streamFile(filePath) {
  const fileName = path.basename(filePath)
  const fileStats = await stat(filePath)
  const stream = createReadStream(filePath)

  return new Response(Readable.toWeb(stream), {
    headers: {
      'Content-Type': 'application/x-apple-diskimage',
      'Content-Length': String(fileStats.size),
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export async function GET(request) {
  try {
    const state = await resolveDownloadState()
    const userAgent = request.headers.get('user-agent') || ''
    const localPath = pickLocalMacFile(state, userAgent)
    if (localPath) {
      try {
        return await streamFile(localPath)
      } catch {
        // Fall through to remote fallback if local artifact disappears.
      }
    }

    if (isExternalUrl(state.mac)) {
      return Response.redirect(state.mac, 302)
    }

    return Response.redirect(getReleasesPageUrl(state), 302)
  } catch {
    return Response.redirect(
      'https://github.com/MianMMajid/MCp-Use/releases',
      302,
    )
  }
}
