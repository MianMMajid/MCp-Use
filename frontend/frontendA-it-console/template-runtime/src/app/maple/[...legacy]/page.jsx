import { redirect } from 'next/navigation'

import { buildWorkspaceHref, resolveWorkspaceState } from '@/lib/maple-workspace/workspace-state'

function toSearchParamsObject(searchParams) {
  const params = new URLSearchParams()
  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, entry))
      return
    }
    if (typeof value === 'string') {
      params.set(key, value)
    }
  })
  return params
}

export default function MapleLegacyRoutePage({ params, searchParams }) {
  const legacyPath = `/maple/${(params?.legacy ?? []).join('/')}`
  const parsedSearchParams = toSearchParamsObject(searchParams)
  const workspaceState = resolveWorkspaceState({
    pathname: legacyPath,
    searchParams: parsedSearchParams,
  })
  redirect(
    buildWorkspaceHref({
      category: workspaceState.category,
      view: workspaceState.view,
      routePath: workspaceState.routePath,
      executionId: workspaceState.executionId,
      sessionId: workspaceState.sessionId,
    }),
  )
}
