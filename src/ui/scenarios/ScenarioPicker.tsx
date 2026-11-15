// Phase 1 — Mission Brief (CML 1): pick a scenario (FR-2.1).
// Cards follow docs/ART.md: dark metal panel, light-metal border, dark outline.
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { presetFor } from '../../data'
import type { GameData } from '../../engine/types'
import { DifficultyPicker } from '../difficulty/DifficultyPicker'
import { useMissionStore } from '../store/missionStore'
import { toScenarioCard, translateLabel, type Label, type ScenarioCard } from './scenarioView'

interface Props {
  data: GameData
}

export function ScenarioPicker({ data }: Props) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const selectScenario = useMissionStore((s) => s.selectScenario)
  const goTo = useMissionStore((s) => s.goTo)
  const loadPreset = useMissionStore((s) => s.loadPreset)
  const cards = useMemo(() => data.scenarios.map((s) => toScenarioCard(s, data)), [data])
  const label = (l: Label) => translateLabel(t, l)

  return (
    <section aria-labelledby="scenario-heading" className="mx-auto max-w-6xl">
      <p className="text-[10px] uppercase text-shine">{t('phase.brief')}</p>
      <h2 id="scenario-heading" className="mt-2 text-base leading-relaxed text-white">
        {t('scenario.heading')}
      </h2>
      <p className="mt-3 max-w-3xl text-xs text-metal-light">{t('scenario.intro')}</p>

      <div role="radiogroup" aria-labelledby="scenario-heading" className="mt-6 grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <ScenarioCardView
            key={card.id}
            card={card}
            selected={design?.scenarioId === card.id}
            onSelect={() => selectScenario(card.id, data)}
            label={label}
          />
        ))}
      </div>

      {/* FR-2.2 — difficulty, once a mission is picked */}
      <DifficultyPicker data={data} recommended={cards.find((c) => c.id === design?.scenarioId)?.difficulty} />

      {design && presetFor(design.scenarioId) ? (
        // Student mode: start from the scenario's working starter spacecraft, or build it part by part
        <div className="pixel-panel mt-6 p-4">
          <p className="text-[10px] uppercase text-shine">{t('student.preset.heading')}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => loadPreset(data)}
              className="font-pixel border-2 border-outline bg-ok px-6 py-4 text-sm text-outline shadow-[inset_-3px_-3px_0_var(--color-teal)] hover:bg-ok-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shine"
            >
              🚀 {t('student.preset.button')} ▶
            </button>
            <button type="button" onClick={() => goTo('requirements')} className="pixel-button px-4 py-3 text-[10px]">
              {t('student.preset.scratch')}
            </button>
          </div>
          <p className="mt-3 text-[10px] text-metal-light">{t('student.preset.hint')}</p>
        </div>
      ) : (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            disabled={!design}
            onClick={() => goTo('requirements')}
            className="font-pixel border-2 border-outline bg-ok px-5 py-3 text-xs text-outline shadow-[inset_-3px_-3px_0_var(--color-teal)] hover:bg-ok-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shine disabled:cursor-not-allowed disabled:bg-metal disabled:text-metal-dark disabled:shadow-none"
          >
            {t('scenario.start')} ▶
          </button>
        </div>
      )}
    </section>
  )
}

interface CardProps {
  card: ScenarioCard
  selected: boolean
  onSelect: () => void
  label: (l: Label) => string
}

function ScenarioCardView({ card, selected, onSelect, label }: CardProps) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex h-full flex-col border-2 bg-metal-dark p-4 text-left shadow-[0_0_0_2px_var(--color-outline)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-shine ${
        selected ? 'border-ok bg-screen' : 'border-metal-light hover:border-shine'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs leading-relaxed text-white">{card.name}</h3>
        {/* Selection shown with text + icon, not colour alone (NFR-05) */}
        <span
          className={`shrink-0 border px-2 py-1 text-[10px] uppercase ${
            selected ? 'border-ok text-ok' : 'border-metal text-metal-light'
          }`}
        >
          {selected ? `✓ ${t('scenario.selected')}` : t('scenario.select')}
        </span>
      </div>
      <p className="mt-3 text-[10px] text-metal-light">{card.briefing}</p>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-[10px]">
        <Stat term={t('scenario.destination')} value={t(`destination.${card.destination}`)} />
        <Stat term={t('scenario.budget')} value={label(card.budget)} />
        <Stat term={t('scenario.deadline')} value={label(card.deadline)} />
        <Stat term={t('scenario.duration')} value={label(card.duration)} />
        <Stat term={t('scenario.difficulty')} value={t(`difficulty.${card.difficulty}`)} />
        <Stat term={t('scenario.orbits')} value={card.orbitNames.join(' · ')} />
      </dl>

      <div className="mt-4 border-t-2 border-outline pt-3">
        <p className="text-[10px] uppercase text-warning">{t('scenario.objectives')}</p>
        <ul className="mt-2 space-y-2 text-[10px] text-white">
          {card.objectives.map((o) => (
            <li key={o}>▸ {o}</li>
          ))}
        </ul>
      </div>
    </button>
  )
}

function Stat({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="mb-1 text-[10px] uppercase text-metal-light">{term}</dt>
      <dd className="text-white">{value}</dd>
    </div>
  )
}
