'use client'

import { useEffect, useState, useCallback } from 'react'
import { loadJson } from '@/lib/api'
import { SkeletonCard } from '@/components/Skeleton'

export default function TenantScope() {
  const [tenantScope, setTenantScope] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try { setTenantScope(await loadJson('/api/openclaw/modifier/ops/tenant-scope')) }
    catch { /* non-critical */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return (
    <section id="tenant-scope" className="mt-10">
      <h2 className="text-lg font-semibold text-zinc-950 dark:text-white">Tenant Scope</h2>

      {loading && !tenantScope ? (
        <div className="mt-4"><SkeletonCard /></div>
      ) : tenantScope ? (
        <div className="mt-4 rounded-2xl border border-zinc-950/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {tenantScope.tenantId && (
              <div>
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Tenant ID</span>
                <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">{tenantScope.tenantId}</p>
              </div>
            )}
            {tenantScope.orgId && (
              <div>
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Org ID</span>
                <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">{tenantScope.orgId}</p>
              </div>
            )}
            {tenantScope.scope && (
              <div>
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Scope</span>
                <p className="mt-1 text-sm font-medium text-zinc-950 dark:text-white">{tenantScope.scope}</p>
              </div>
            )}
          </div>
          {!tenantScope.tenantId && !tenantScope.orgId && !tenantScope.scope && (
            <pre className="whitespace-pre-wrap break-words text-xs text-zinc-700 dark:text-zinc-300">{JSON.stringify(tenantScope, null, 2)}</pre>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-zinc-950/5 bg-white p-8 text-center dark:border-white/5 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Tenant scope not available.</p>
        </div>
      )}
    </section>
  )
}
