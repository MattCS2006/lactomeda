// Phase 6 · Design Review · CML 4 (FR-6.9, FR-14.4 UI). Shows the engine's review like a NASA Mission Design Lab
// study (one verdict per resource and per discipline, plus the equipment list) and the Launch button, which starts
// the mission controller. Red designs go back to the design screens or, above Cadet, launch with accepted risk.
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { designReview, launchDecision, type Finding } from '../../engine/rules/review'
import { startMission } from '../../game/missionController'
import { useMissionStore } from '../store/missionStore'
import { translateLabel } from '../scenarios/scenarioView'
import {
  VERDICT_LOOK,
  decisionLabel,
  equipmentTotals,
  fixStep,
  fmt,
  showRiskCheckbox,
  visibleFindings,
} from './reviewView'
import type { GameData } from '../../engine/types'

export function LaunchStep({ data }: { data: GameData }) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const goTo = useMissionStore((s) => s.goTo)
  const [riskAccepted, setRiskAccepted] = useState(false)
  const review = useMemo(() => (design ? designReview(design, data) : null), [design, data])
  if (!design || !review) return null

  const decision = launchDecision(review, riskAccepted)
  const overall = VERDICT_LOOK[review.overallVerdict]
  const totals = equipmentTotals(review)
  const findingText = (f: Finding) =>
    t(`issues.${f.code}`, {
      defaultValue: f.message,
      subsystem: f.subsystem ? t(`subsystem.${f.subsystem}.name`) : '',
    })

  return (
    <section aria-labelledby="review-heading" className="mx-auto max-w-6xl">
      <p className="text-[10px] uppercase text-shine">{t('phase.design')}</p>
      <h2 id="review-heading" className="mt-2 text-base">
        {t('review.heading')}
      </h2>
      <p className="mt-2 text-[10px] leading-relaxed text-metal-light">{t('review.intro')}</p>

      {/* Overall verdict */}
      <div
        className={`pixel-panel mt-4 flex flex-wrap items-center justify-between gap-3 border-l-8! p-4 ${overall.border}`}
      >
        <p className={`text-sm ${overall.text}`}>
          <span aria-hidden="true">{overall.icon} </span>
          {t(`review.verdict.${review.overallVerdict}`)}
        </p>
        <p className="text-[10px] text-metal-light">{t(`review.overall.${review.overallVerdict}`)}</p>
      </div>

      {/* Resources */}
      <h3 className="mt-6 text-xs">{t('review.resourcesHeading')}</h3>
      <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {review.resources.map((r) => {
          const look = VERDICT_LOOK[r.verdict]
          return (
            <li key={r.resource} className={`border-2 bg-outline/40 p-2 text-[10px] ${look.border}`}>
              <p className="uppercase text-metal-light">{t(`resource.${r.resource}`)}</p>
              <p className={look.text}>
                <span aria-hidden="true">{look.icon} </span>
                {t(`review.verdict.${r.verdict}`)}
              </p>
              <p>{t('review.margin', { value: fmt(r.budget.margin * 100) })}</p>
            </li>
          )
        })}
      </ul>

      {/* Disciplines (MDL) */}
      <h3 className="mt-6 text-xs">{t('review.disciplinesHeading')}</h3>
      <ul className="mt-2 grid gap-2 md:grid-cols-3">
        {review.disciplines.map((d) => {
          const look = VERDICT_LOOK[d.verdict]
          return (
            <li
              key={d.discipline}
              className={`flex flex-col gap-2 border-2 bg-outline/40 p-3 text-[10px] ${look.border}`}
            >
              <p className="flex items-center justify-between gap-2">
                <span className="text-xs">{t(`review.discipline.${d.discipline}`)}</span>
                <span className={look.text}>
                  <span aria-hidden="true">{look.icon} </span>
                  {t(`review.verdict.${d.verdict}`)}
                </span>
              </p>
              <ul className="space-y-1 leading-relaxed">
                {visibleFindings(d.findings).map((f, i) => (
                  <li key={`${f.code}-${i}`} className="flex flex-col gap-1">
                    <span className={f.severity === 'ok' ? 'text-metal-light' : ''}>{findingText(f)}</span>
                    {f.severity !== 'ok' && (
                      <button
                        type="button"
                        onClick={() => goTo(fixStep(f, d.discipline))}
                        className="self-start text-info underline hover:text-shine"
                      >
                        {t('review.fix', { phase: t(`phase.${fixStep(f, d.discipline)}`) })}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>

      {/* Equipment list (MDL master equipment list) */}
      <details className="pixel-panel mt-6 p-3 text-[10px]">
        <summary className="cursor-pointer text-xs">
          {t('review.equipmentHeading', { count: review.equipment.length })}
        </summary>
        <table className="mt-3 w-full text-left">
          <thead className="text-metal-light">
            <tr>
              <th className="py-1 pr-2">{t('review.col.item')}</th>
              <th className="py-1 pr-2 text-right">{t('review.col.mass')}</th>
              <th className="py-1 pr-2 text-right">{t('review.col.power')}</th>
              <th className="py-1 text-right">{t('review.col.cost')}</th>
            </tr>
          </thead>
          <tbody>
            {review.equipment.map((item, i) => (
              <tr key={`${item.kind}-${item.id}-${i}`} className="border-t border-metal">
                <td className="py-1 pr-2">
                  {item.name}
                  {item.redundant ? ` ${t('review.redundant')}` : ''}
                </td>
                <td className="py-1 pr-2 text-right">{item.massKg === undefined ? '—' : fmt(item.massKg)}</td>
                <td className="py-1 pr-2 text-right">{item.powerW === undefined ? '—' : fmt(item.powerW)}</td>
                <td className="py-1 text-right">{fmt(item.costM)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-metal-light text-shine">
              <td className="py-1 pr-2">{t('review.total')}</td>
              <td className="py-1 pr-2 text-right">{fmt(totals.massKg)}</td>
              <td className="py-1 pr-2 text-right">{fmt(totals.powerW)}</td>
              <td className="py-1 text-right">{fmt(totals.costM)}</td>
            </tr>
          </tbody>
        </table>
      </details>

      {/* Launch */}
      <div className="pixel-panel mt-6 flex flex-col gap-3 p-4">
        {showRiskCheckbox(review) && (
          <label className="flex items-start gap-2 text-[10px] leading-relaxed">
            <input
              type="checkbox"
              checked={riskAccepted}
              onChange={(e) => setRiskAccepted(e.target.checked)}
              className="mt-0.5"
            />
            <span>{t('review.acceptRisk')}</span>
          </label>
        )}
        <p id="launch-reason" className={`text-[10px] ${decision.allowed ? 'text-ok' : 'text-warning'}`}>
          <span aria-hidden="true">{decision.allowed ? '✓ ' : '▲ '}</span>
          {translateLabel(t, decisionLabel(decision))}
        </p>
        <div className="flex justify-between gap-3">
          <button type="button" onClick={() => goTo('orbit')} className="pixel-button px-4 py-3 text-[10px]">
            ◀ {t('common.back')}
          </button>
          <button
            type="button"
            disabled={!decision.allowed}
            aria-describedby="launch-reason"
            onClick={() => startMission(design, data)}
            className="font-pixel border-2 border-outline bg-ok px-6 py-3 text-sm text-outline shadow-[inset_-3px_-3px_0_var(--color-teal)] hover:bg-ok-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shine disabled:cursor-not-allowed disabled:bg-metal disabled:text-metal-dark disabled:shadow-none"
          >
            {t('review.launch')} ▲
          </button>
        </div>
      </div>
    </section>
  )
}
