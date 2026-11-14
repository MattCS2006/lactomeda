// Phase 2 — Requirements (CML 2): turn the objective into measurable targets (FR-2.3),
// showing the score multiplier and how much stricter each level is before confirming (FR-2.4).
import { useTranslation } from 'react-i18next'
import type { GameData, Objective, RequirementLevel } from '../../engine/types'
import { useMissionStore } from '../store/missionStore'
import {
  LEVEL_SCORE_MULTIPLIER,
  formatMultiplier,
  pressuredResources,
  resourcesFor,
  scorePotential,
  tighteningVsBaseline,
} from './levelEffects'
import { LEVELS, targetFor } from './requirementsView'

interface Props {
  data: Pick<GameData, 'scenarios'>
}

export function RequirementsStep({ data }: Props) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const setLevel = useMissionStore((s) => s.setRequirementLevel)
  const goTo = useMissionStore((s) => s.goTo)
  const scenario = data.scenarios.find((s) => s.id === design?.scenarioId)
  if (!design || !scenario) return null

  const potential = scorePotential(design.requirementLevels)
  const pressured = pressuredResources(scenario.objectives, design.requirementLevels)

  return (
    <section aria-labelledby="req-heading" className="mx-auto max-w-5xl">
      <p className="text-[10px] uppercase text-[#73eff7]">{t('phase.requirements')}</p>
      <h2 id="req-heading" className="mt-2 text-base">
        {t('requirements.heading')}
      </h2>
      <p className="mt-3 max-w-3xl text-[10px] text-[#94b0c2]">{t('requirements.intro', { name: scenario.name })}</p>

      <dl className="mt-4 grid gap-2 border-2 border-[#566c86] bg-[#29366f] p-3 text-[10px] sm:grid-cols-3">
        {LEVELS.map((level) => (
          <div key={level}>
            <dt className="text-[#ffcd75]">
              {t(`requirements.level.${level}`)}{' '}
              <span className="text-[#73eff7]">
                {t('requirements.scoreMultiplier', { value: formatMultiplier(LEVEL_SCORE_MULTIPLIER[level]) })}
              </span>
            </dt>
            <dd className="mt-1 text-[#94b0c2]">{t(`requirements.levelHelp.${level}`)}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-6 space-y-4">
        {scenario.objectives.map((objective) => (
          <RequirementRow
            key={objective.id}
            objective={objective}
            level={design.requirementLevels[objective.id] ?? 'baseline'}
            onChange={(level) => setLevel(objective.id, level)}
          />
        ))}
      </ul>

      {/* FR-2.4 — summary visible before confirming; updates live */}
      <div
        aria-live="polite"
        className="mt-6 grid gap-3 border-2 border-[#94b0c2] bg-[#333c57] p-4 shadow-[0_0_0_2px_#1a1c2c] sm:grid-cols-2"
      >
        <div>
          <p className="text-[8px] uppercase text-[#94b0c2]">{t('requirements.potential')}</p>
          <p className="mt-1 text-base text-[#73eff7]">×{formatMultiplier(potential)}</p>
          <p className="mt-1 text-[8px] text-[#94b0c2]">{t('requirements.potentialHelp')}</p>
        </div>
        <div>
          <p className="text-[8px] uppercase text-[#94b0c2]">{t('requirements.pressure')}</p>
          {pressured.length > 0 ? (
            <p className="mt-1 text-xs text-[#ffcd75]">▲ {pressured.map((r) => t(`resource.${r}`)).join(' · ')}</p>
          ) : (
            <p className="mt-1 text-[10px] text-[#38b764]">✓ {t('requirements.pressureNone')}</p>
          )}
        </div>
      </div>

      <div className="mt-6 flex justify-between gap-3">
        <button
          type="button"
          onClick={() => goTo('brief')}
          className="border-2 border-[#94b0c2] bg-[#333c57] px-4 py-3 text-[10px] hover:bg-[#566c86] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73eff7]"
        >
          ◀ {t('common.back')}
        </button>
        <button
          type="button"
          onClick={() => goTo('payload')}
          className="border-2 border-[#1a1c2c] bg-[#38b764] px-5 py-3 text-xs text-[#1a1c2c] shadow-[inset_-3px_-3px_0_#257179] hover:bg-[#a7f070] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73eff7]"
        >
          {t('requirements.confirm')} ▶
        </button>
      </div>
    </section>
  )
}

interface RowProps {
  objective: Objective
  level: RequirementLevel
  onChange: (level: RequirementLevel) => void
}

function RequirementRow({ objective, level, onChange }: RowProps) {
  const { t } = useTranslation()
  const groupId = `req-${objective.id}`
  const tightening = tighteningVsBaseline(objective, level)
  const resources = resourcesFor(objective.metric)
  return (
    <li className="border-2 border-[#94b0c2] bg-[#333c57] p-4 shadow-[0_0_0_2px_#1a1c2c]">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={groupId} className="text-xs">
          {objective.label}
        </h3>
        <span className="text-[8px] uppercase text-[#94b0c2]">
          {t(`metric.${objective.metric}`, { defaultValue: objective.metric })}
        </span>
      </div>
      <div role="radiogroup" aria-labelledby={groupId} className="mt-3 grid gap-2 sm:grid-cols-3">
        {LEVELS.map((l) => {
          const selected = l === level
          const target = targetFor(objective, l)
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(l)}
              className={`border-2 p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73eff7] ${
                selected ? 'border-[#38b764] bg-[#29366f]' : 'border-[#566c86] bg-[#1a1c2c] hover:bg-[#29366f]'
              }`}
            >
              <span className="flex items-center justify-between gap-2 text-[8px] uppercase">
                <span className={selected ? 'text-[#38b764]' : 'text-[#94b0c2]'}>
                  {selected ? '✓ ' : ''}
                  {t(`requirements.level.${l}`)}
                </span>
                <span className="text-[#73eff7] normal-case">
                  {t('requirements.scoreMultiplier', { value: formatMultiplier(LEVEL_SCORE_MULTIPLIER[l]) })}
                </span>
              </span>
              <span className="mt-2 block text-xs text-[#f4f4f4]">{t(target.key, target.values)}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[8px] text-[#94b0c2]">
        <span
          className={
            tightening.direction === 'stricter'
              ? 'text-[#ffcd75]'
              : tightening.direction === 'easier'
                ? 'text-[#73eff7]'
                : 'text-[#94b0c2]'
          }
        >
          {tightening.direction === 'stricter' ? '▲ ' : tightening.direction === 'easier' ? '▼ ' : '= '}
          {t(`requirements.vsBaseline.${tightening.direction}`, { factor: tightening.factor })}
        </span>
        {resources.length > 0 && (
          <span>
            {t('requirements.pushesOn')}: {resources.map((r) => t(`resource.${r}`)).join(' · ')}
          </span>
        )}
      </p>
    </li>
  )
}
