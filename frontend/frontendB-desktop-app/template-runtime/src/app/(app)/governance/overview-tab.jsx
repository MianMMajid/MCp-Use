'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/badge'
import { Divider } from '@/components/divider'
import { Subheading } from '@/components/heading'
import { StatCard } from '@/components/stat-card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { SkeletonCard } from '@/components/skeleton'
import { loadJson } from '@/lib/api'
import { formatDate, statusColor } from '@/lib/format'

export default function OverviewTab() {
  const [stats, setStats] = useState(null)
  const [auditEvents, setAuditEvents] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [approvals, firewallState, slo, capabilities, escalation, compliance] = await Promise.all([
          loadJson('/api/openclaw/modifier/approvals').catch(() => null),
          loadJson('/api/firewall/state').catch(() => null),
          loadJson('/api/observability/orchestrations/slo').catch(() => null),
          loadJson('/api/openclaw/modifier/capabilities').catch(() => null),
          loadJson('/api/operations/orchestrations/escalation').catch(() => null),
          loadJson('/api/operations/orchestrations/compliance/summary').catch(() => null),
        ])
        if (cancelled) return

        const pendingApprovals = Array.isArray(approvals)
          ? approvals.filter((a) => a.status === 'pending').length
          : Array.isArray(approvals?.approvals)
            ? approvals.approvals.filter((a) => a.status === 'pending').length
            : approvals?.pendingCount ?? 0

        setStats({
          pendingApprovals,
          firewallStatus: firewallState?.ok ? 'Active' : firewallState?.status || 'Unknown',
          sloHealth: slo?.health ?? slo?.score ?? '--',
          policyVersion: capabilities?.version ?? capabilities?.policyVersion ?? '--',
          openEscalations: escalation?.openCount ?? (Array.isArray(escalation) ? escalation.length : 0),
          complianceScore: compliance?.score ?? compliance?.complianceScore ?? '--',
        })

        // Fetch recent audit events
        const auditData = await loadJson('/api/observability/orchestrations/audit-log?limit=10').catch(() => null)
        if (!cancelled) {
          const events = Array.isArray(auditData) ? auditData
            : Array.isArray(auditData?.events) ? auditData.events
            : Array.isArray(auditData?.log) ? auditData.log
            : []
          setAuditEvents(events.slice(0, 10))
        }
      } catch {
        // Stats may partially load
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SkeletonCard /><SkeletonCard /><SkeletonCard />
        <SkeletonCard /><SkeletonCard /><SkeletonCard />
      </div>
    )
  }

  return (
    <div className="mt-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Pending Approvals" value={stats?.pendingApprovals ?? '--'} />
        <StatCard title="Firewall Status" value={stats?.firewallStatus ?? '--'} />
        <StatCard title="SLO Health" value={stats?.sloHealth ?? '--'} />
        <StatCard title="Policy Version" value={stats?.policyVersion ?? '--'} />
        <StatCard title="Open Escalations" value={stats?.openEscalations ?? '--'} />
        <StatCard title="Compliance Score" value={stats?.complianceScore ?? '--'} />
      </div>

      {auditEvents.length > 0 && (
        <>
          <Divider className="my-8" />
          <Subheading>Recent Audit Events</Subheading>
          <Table className="mt-4 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
            <TableHead>
              <TableRow>
                <TableHeader>Timestamp</TableHeader>
                <TableHeader>Action</TableHeader>
                <TableHeader>Actor</TableHeader>
                <TableHeader>Details</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {auditEvents.map((evt, idx) => (
                <TableRow key={evt.id || idx}>
                  <TableCell className="text-zinc-500">{formatDate(evt.timestamp || evt.createdAt || evt.at)}</TableCell>
                  <TableCell>
                    <Badge color={statusColor(evt.action || evt.type)}>{evt.action || evt.type || 'event'}</Badge>
                  </TableCell>
                  <TableCell>{evt.actor || evt.user || '--'}</TableCell>
                  <TableCell className="max-w-xs truncate text-zinc-500">{evt.details || evt.message || evt.description || '--'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  )
}
