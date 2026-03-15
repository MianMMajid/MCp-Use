import { Badge } from '@/components/badge'

const RISK_TIERS = {
  low: { color: 'green', label: 'Low' },
  medium: { color: 'yellow', label: 'Medium' },
  high: { color: 'orange', label: 'High' },
  critical: { color: 'red', label: 'Critical' },
}

export function RiskBadge({ tier, className }) {
  const config = RISK_TIERS[tier] ?? RISK_TIERS.medium
  return (
    <Badge color={config.color} className={className}>
      {config.label}
    </Badge>
  )
}

export function riskLabel(score) {
  if (score == null) return 'unknown'
  if (score < 0.3) return 'low'
  if (score < 0.6) return 'medium'
  if (score < 0.8) return 'high'
  return 'critical'
}
