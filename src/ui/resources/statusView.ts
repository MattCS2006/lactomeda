// How a resource status looks (FR-6.2): colour + icon + text, never colour alone (NFR-05).
// The status itself comes from the engine (makeBudget: green ≥ 20% margin, amber 0–20%, red over).
import type { ResourceBudget } from '../../engine/types'

export type StatusOrPending = ResourceBudget['status'] | 'pending'

export interface StatusLook {
  icon: string
  /** i18n key under resources.status */
  textKey: string
  /** Tailwind classes (palette tokens) for the badge and the cell's side border. */
  badge: string
  border: string
}

export const STATUS_LOOK: Record<StatusOrPending, StatusLook> = {
  green: { icon: '✓', textKey: 'resources.status.green', badge: 'bg-ok text-outline', border: 'border-ok' },
  amber: { icon: '▲', textKey: 'resources.status.amber', badge: 'bg-warning text-outline', border: 'border-warning' },
  red: { icon: '✕', textKey: 'resources.status.red', badge: 'bg-alarm text-white', border: 'border-alarm' },
  pending: {
    icon: '…',
    textKey: 'resources.status.pending',
    badge: 'bg-outline text-metal-light',
    border: 'border-metal',
  },
}

export function lookFor(status: ResourceBudget['status'] | null): StatusLook {
  return STATUS_LOOK[status ?? 'pending']
}
