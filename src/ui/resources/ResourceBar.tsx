// Persistent resource bar (FR-6.1): Mass, Power, Budget, Data, Comms, Time, on every design
// screen, each with used / available and margin %. Updates on any edit of the design.
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameData } from '../../engine/types'
import { useMissionStore } from '../store/missionStore'
import { resourceCells, type ResourceCell } from './resourceBarView'

interface Props {
  data: GameData
}

export function ResourceBar({ data }: Props) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const cells = useMemo(() => (design ? resourceCells(design, data) : []), [design, data])
  if (!design) return null

  return (
    <section aria-label={t('resources.heading')} className="pixel-panel sticky top-0 z-10 mx-auto mb-6 max-w-6xl p-3">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cells.map((cell) => (
          <ResourceCellView key={cell.key} cell={cell} />
        ))}
      </ul>
    </section>
  )
}

function ResourceCellView({ cell }: { cell: ResourceCell }) {
  const { t } = useTranslation()
  const name = t(`resource.${cell.key}`)
  const pending = cell.available === null
  return (
    <li
      className="flex flex-col gap-1 text-[10px]"
      aria-label={
        pending
          ? t('resources.ariaPending', {
              name,
              used: cell.used,
              needs: cell.needs.map((n) => t(`resources.need.${n}`)).join(', '),
            })
          : t('resources.aria', { name, used: cell.used, available: cell.available, margin: cell.marginPct })
      }
    >
      <span className="uppercase text-metal-light">{name}</span>
      <span className="whitespace-nowrap">
        {cell.used}
        <span className="text-metal-light"> / </span>
        {pending ? <span className="text-metal-light">—</span> : cell.available}
      </span>
      {pending ? (
        <span className="text-metal-light">
          {t('resources.needs')}: {cell.needs.map((n) => t(`resources.need.${n}`)).join(' · ')}
        </span>
      ) : (
        <span>
          {t('resources.margin')}: {cell.marginPct}%
        </span>
      )}
    </li>
  )
}
