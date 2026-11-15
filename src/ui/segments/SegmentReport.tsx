// Mission report by segment (FR-14.5): one section each for Launch, Space, Ground and User.
// Shown at the end of Phase 5; the printable mission report (FR-10.5) can reuse it.
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameData } from '../../engine/types'
import { translateLabel } from '../scenarios/scenarioView'
import { useMissionStore } from '../store/missionStore'
import { SEGMENTS, segmentDone, segmentReport } from './segments'

interface Props {
  data: GameData
}

export function SegmentReport({ data }: Props) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const furthest = useMissionStore((s) => s.furthest)
  const report = useMemo(() => (design ? segmentReport(design, data) : null), [design, data])
  if (!design || !report) return null

  return (
    <section aria-labelledby="report-heading" className="mt-10">
      <h2 id="report-heading" className="text-base">
        {t('segments.summary')}
      </h2>
      <p className="mt-3 max-w-3xl text-xs text-metal-light">{t('segments.summaryIntro')}</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {SEGMENTS.map((segment) => {
          const done = segmentDone(segment, design, furthest)
          return (
            <section key={segment} aria-labelledby={`report-${segment}`} className="pixel-panel p-4">
              <h3 id={`report-${segment}`} className="flex items-baseline justify-between gap-2 text-xs">
                <span>{t(`segments.name.${segment}`)}</span>
                <span className={`text-[10px] ${done ? 'text-ok' : 'text-metal-light'}`}>
                  {done ? `✓ ${t('segments.tabDone')}` : `○ ${t('segments.tabTodo')}`}
                </span>
              </h3>
              <dl className="mt-3 space-y-2 text-[10px]">
                {report[segment].map((line, i) => (
                  <div key={`${line.label}-${i}`}>
                    <dt className="uppercase text-metal-light">{t(line.label)}</dt>
                    <dd className={line.value.key === 'segments.notChosen' ? 'text-metal-light' : ''}>
                      {translateLabel(t, line.value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )
        })}
      </div>
    </section>
  )
}
