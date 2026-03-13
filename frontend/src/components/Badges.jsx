export const RISK_COLORS = {
  LOW:      { bg: '#14532d', text: '#86efac', border: '#16a34a', dot: '#22c55e' },
  MEDIUM:   { bg: '#713f12', text: '#fde68a', border: '#ca8a04', dot: '#eab308' },
  HIGH:     { bg: '#7c2d12', text: '#fdba74', border: '#c2410c', dot: '#f97316' },
  CRITICAL: { bg: '#7f1d1d', text: '#fca5a5', border: '#b91c1c', dot: '#ef4444' },
}

export const TYPE_COLORS = {
  civilian_aircraft: '#3b82f6',
  aircraft:          '#3b82f6',
  drone:             '#a855f7',
  bird:              '#22c55e',
  military:          '#ef4444',
  helicopter:        '#f59e0b',
  cargo:             '#06b6d4',
  unknown:           '#9ca3af',
}

export const TYPE_ICONS = {
  civilian_aircraft: '✈',
  aircraft:          '✈',
  drone:             '⬡',
  bird:              '◆',
  military:          '★',
  helicopter:        '⊕',
  cargo:             '▣',
  unknown:           '?',
}

export function resolveType(obj) {
  const t = (obj.object_type || '').toLowerCase()
  if (t.includes('civilian') || t.includes('aircraft')) return 'civilian_aircraft'
  if (t.includes('drone'))      return 'drone'
  if (t.includes('bird'))       return 'bird'
  if (t.includes('military'))   return 'military'
  if (t.includes('helicopter') || t.includes('heli')) return 'helicopter'
  if (t.includes('cargo'))      return 'cargo'
  return 'unknown'
}

export function RiskBadge({ level }) {
  const c = RISK_COLORS[level] || RISK_COLORS.LOW
  return (
    <span
      className={`badge ${level === 'CRITICAL' ? 'animate-pulse-fast' : ''}`}
      style={{
        background: c.bg,
        color: c.text,
        border: `1px solid ${c.border}`,
      }}
    >
      {level}
    </span>
  )
}

export function TypeBadge({ type }) {
  const color = TYPE_COLORS[type] || '#9ca3af'
  const icon  = TYPE_ICONS[type]  || '?'
  return (
    <span
      className="badge"
      style={{
        background: `${color}1a`,
        color,
        border: `1px solid ${color}44`,
      }}
    >
      {icon} {type?.replace('civilian_', '').replace(/_/g, ' ').toUpperCase()}
    </span>
  )
}
