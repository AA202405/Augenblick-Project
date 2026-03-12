export const RISK_COLORS = {
  LOW:      { bg: '#166534', text: '#86efac', border: '#15803d' },
  MEDIUM:   { bg: '#854d0e', text: '#fde68a', border: '#a16207' },
  HIGH:     { bg: '#7c2d12', text: '#fdba74', border: '#c2410c' },
  CRITICAL: { bg: '#7f1d1d', text: '#fca5a5', border: '#b91c1c' },
}

export const TYPE_COLORS = {
  aircraft: '#3b82f6',
  drone:    '#a855f7',
  bird:     '#22c55e',
  unknown:  '#f59e0b',
}

export function RiskBadge({ level }) {
  const c = RISK_COLORS[level] || RISK_COLORS.LOW
  return (
    <span
      className={`badge ${level === 'CRITICAL' ? 'animate-pulse-fast' : ''}`}
      style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {level}
    </span>
  )
}

export function TypeBadge({ type }) {
  const color = TYPE_COLORS[type] || '#9ca3af'
  return (
    <span className="badge" style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}55` }}>
      {type?.toUpperCase()}
    </span>
  )
}
