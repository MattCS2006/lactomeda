// Concept maturity meter (FR-14.3): JPL Concept Maturity Levels 1–4. Each level fills as its
// phase is completed; the current phase is marked "You are here". Icon + text, not colour alone.
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameData } from '../../engine/types'
import { useMissionStore } from '../store/missionStore'
import { STEP_CML, maturity, type CmlStatus } from './maturity'

interface Props {
  data: GameData
}

export function MaturityMeter({ data }: Props) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const step = useMissionStore((s) => s.step)
  const furthest = useMissionStore((s) => s.furthest)
  const m = useMemo(() => maturity(design, furthest, data), [design, furthest, data])
  if (!design) return null

  const current = STEP_CML[step]
  const reachedText =
    m.reached === 0 ? t('cml.reachedNone') : t('cml.reached', { level: m.reached, name: t(`cml.name.${m.reached}`) })

  return (
    <section aria-labelledby="cml-heading" className="pixel-panel mx-auto mb-6 max-w-6xl p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cml-heading" className="text-[10px] uppercase text-metal-light" title={t('cml.help')}>
          {t('cml.heading')}
          <span className="ml-2 font-sans normal-case">({t('sources.items.cml.name')})</span>
        </h2>
        <p className="text-[10px] text-shine">{reachedText}</p>
      </div>
      <ol
        role="meter"
        aria-labelledby="cml-heading"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={m.reached}
        aria-valuetext={reachedText}
        className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        {m.levels.map((level) => (
          <CmlSegment key={level.level} status={level} isCurrent={level.level === current} />
        ))}
      </ol>
    </section>
  )
}

function CmlSegment({ status, isCurrent }: { status: CmlStatus; isCurrent: boolean }) {
  const { t } = useTranslation()
  const doneCount = status.items.filter((i) => i.done).length
  const total = status.items.length
  const state = status.done ? 'done' : isCurrent ? 'now' : 'next'
  const icon = { done: '✓', now: '▶', next: '○' }[state]
  const colour = { done: 'text-ok', now: 'text-shine', next: 'text-metal-light' }[state]
  return (
    <li className={`border-2 p-2 text-[10px] ${isCurrent ? 'border-shine' : 'border-metal'}`}>
      {/* Fill shows the share of this level that is done */}
      <span aria-hidden className="block h-2 border border-outline bg-outline">
        <span
          className={`block h-full ${status.done ? 'bg-ok' : 'bg-shine'}`}
          style={{ width: `${(doneCount / total) * 100}%` }}
        />
      </span>
      <span className="mt-2 flex items-baseline justify-between gap-2">
        <span>{t('cml.level', { level: status.level })}</span>
        <span className={colour}>
          {icon} {t(`cml.state.${state}`)}
        </span>
      </span>
      <span className="mt-1 block text-metal-light">{t(`cml.name.${status.level}`)}</span>
      {total > 1 && (
        <ul className="mt-2 space-y-1">
          {status.items.map((i) => (
            <li key={i.item} className={i.done ? 'text-ok' : 'text-metal-light'}>
              {i.done ? '✓' : '○'} {t(`cml.item.${i.item}`)}
            </li>
          ))}
          <li className="text-metal-light">{t('cml.progress', { done: doneCount, total })}</li>
        </ul>
      )}
    </li>
  )
}
