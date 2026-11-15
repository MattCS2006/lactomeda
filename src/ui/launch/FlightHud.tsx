// Flight HUD (FR-13.11, SCRUM-129): always visible above the ship during flight. Mission day, time speed, and the
// live mission state (FR-7.3) with bars and icon + colour + text levels, updated on every simulated day.
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { translateLabel } from '../scenarios/scenarioView'
import { hudCells, hudDay, hudHealth, type HudLevel } from './hudView'
import type { SimSnapshot } from '../../game/bridge'
import type { GameData, MissionDesign } from '../../engine/types'

const LOOK: Record<HudLevel, { icon: string; text: string; bar: string; border: string }> = {
  ok: { icon: '✓', text: 'text-ok', bar: 'bg-ok', border: 'border-ok' },
  warning: { icon: '!', text: 'text-warning', bar: 'bg-warning', border: 'border-warning' },
  alarm: { icon: '×', text: 'text-alarm', bar: 'bg-alarm', border: 'border-alarm' },
}

export function FlightHud({
  state,
  design,
  data,
  children,
}: {
  state: SimSnapshot
  design: MissionDesign
  data: GameData
  /** The time controls (speed, abort), shown on the day row. */
  children?: ReactNode
}) {
  const { t } = useTranslation()
  const { day, total } = hudDay(state, design, data)
  const cells = hudCells(state, design, data)
  const health = hudHealth(state)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="shrink-0 text-xs">{t('hud.day', { day, total })}</p>
        <div
          role="progressbar"
          aria-label={t('hud.missionProgress')}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(day, total)}
          className="h-2 min-w-24 flex-1 border border-metal-light bg-outline"
        >
          <div className="h-full bg-info" style={{ width: `${total ? Math.min(100, (day / total) * 100) : 0}%` }} />
        </div>
        {children}
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {cells.map((cell) => {
          const look = LOOK[cell.level]
          return (
            <li key={cell.id} className={`flex flex-col gap-1 border-l-4 pl-2 ${look.border}`}>
              <span className="flex items-center justify-between gap-1">
                <span className="uppercase text-metal-light">{t(`hud.label.${cell.id}`)}</span>
                <span className={look.text}>
                  <span aria-hidden="true">{look.icon} </span>
                  <span className="sr-only">{t(`hud.level.${cell.level}`)}</span>
                </span>
              </span>
              <span>{translateLabel(t, cell.value)}</span>
              {cell.fraction !== null && (
                <span aria-hidden="true" className="h-1.5 w-full bg-outline">
                  <span className={`block h-full ${look.bar}`} style={{ width: `${cell.fraction * 100}%` }} />
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {health.length > 0 && (
        <ul aria-label={t('hud.label.health')} className="flex flex-wrap gap-1">
          {health.map((h) => {
            const look = LOOK[h.level]
            return (
              <li key={h.subsystem} className={`border px-1 ${look.border} ${look.text}`}>
                <span aria-hidden="true">{look.icon} </span>
                {t(`subsystem.${h.subsystem}.name`)} {Math.round(h.health * 100)}%
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
