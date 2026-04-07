import type { AuditResult, BehindBehavior } from './types.js'

const PADDING = 2

function pad(str: string, len: number): string {
  return str.padEnd(len)
}

function colWidth(header: string, values: (string | null | undefined)[]): number {
  const max = values.reduce((m, v) => Math.max(m, (v ?? '—').length), header.length)
  return max + PADDING
}

export interface TableWidths {
  name: number
  declared: number
  target: number
  /** 0 when the installed column is hidden (no lockfile). */
  installed: number
  latest: number
  gap: number
  status: number
}

export function statusLabel(r: AuditResult, behindBehavior: BehindBehavior): string {
  let label: string
  if (r.status === 'pin')
    label = '↓ will pin back'
  else if (r.status === 'ok')
    label = '✓ ok'
  else if (r.status === 'behind' && behindBehavior === 'report')
    label = '↑ safe to upgrade'
  else if (r.status === 'behind')
    label = '✓ ok'
  else
    label = '✗ unresolved'
  if (r.specifierMismatch)
    label += `  ⚠ declared ${r.declaredSpecifier}`
  return label
}

/**
 * Compute column widths from a set of rows.
 * Pass all rows (e.g. across all workspace packages) so widths stay aligned.
 */
export function computeWidths(rows: AuditResult[], behindBehavior: BehindBehavior): TableWidths {
  const hasInstalled = rows.some(r => r.installed !== null)
  const labels = rows.map(r => statusLabel(r, behindBehavior))
  return {
    name: colWidth('package', rows.map(r => r.name)),
    declared: colWidth('declared', rows.map(r => r.declared)),
    target: colWidth('→ target', rows.map(r => r.target)),
    installed: hasInstalled ? colWidth('installed', rows.map(r => r.installed)) : 0,
    latest: colWidth('latest', rows.map(r => r.latest)),
    gap: colWidth('gap', rows.map(r => r.versionsFromLatest !== null ? String(r.versionsFromLatest) : null)),
    status: 'status'.length + Math.max(0, ...labels.map(s => s.length - 'status'.length)),
  }
}

export function renderHeader(widths: TableWidths): { header: string, divider: string } {
  const hasInstalled = widths.installed > 0
  const header = `${pad('package', widths.name)
  }${pad('declared', widths.declared)
  }${pad('→ target', widths.target)
  }${hasInstalled ? pad('installed', widths.installed) : ''
  }${pad('latest', widths.latest)
  }${pad('gap', widths.gap)
  }status`
  const divider = '─'.repeat(widths.name + widths.declared + widths.target + widths.installed + widths.latest + widths.gap + widths.status)
  return { header, divider }
}

export function renderRows(rows: AuditResult[], widths: TableWidths, behindBehavior: BehindBehavior): string[] {
  const hasInstalled = widths.installed > 0
  return rows.map(r =>
    pad(r.name, widths.name)
    + pad(r.declared, widths.declared)
    + pad(r.target ?? '—', widths.target)
    + (hasInstalled ? pad(r.installed ?? '—', widths.installed) : '')
    + pad(r.latest ?? '—', widths.latest)
    + pad(r.versionsFromLatest !== null ? String(r.versionsFromLatest) : '—', widths.gap)
    + statusLabel(r, behindBehavior),
  )
}
