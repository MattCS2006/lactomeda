// Phase 1 — Mission Brief (CML 1): pick a scenario (FR-2.1).
// Cards follow docs/ART.md: dark metal panel, light-metal border, dark outline.
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameData } from '../../engine/types'
import { useMissionStore } from '../store/missionStore'
import { toScenarioCard, type Label, type ScenarioCard } from './scenarioView'

interface Props {
  data: Pick<GameData, 'scenarios' | 'orbits'>
}

export function ScenarioPicker({ data }: Props) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const selectScenario = useMissionStore((s) => s.selectScenario)
  const goTo = useMissionStore((s) => s.goTo)
  const cards = useMemo(() => data.scenarios.map((s) => toScenarioCard(s, data)), [data])
  const label = (l: Label) => t(l.key, l.values ?? {})

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

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          disabled={!design}
          onClick={() => goTo('requirements')}
          className="border-2 border-outline bg-ok px-5 py-3 text-xs text-outline shadow-[inset_-3px_-3px_0_var(--color-teal)] hover:bg-ok-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shine disabled:cursor-not-allowed disabled:bg-metal disabled:text-metal-dark disabled:shadow-none"
        >
          {t('scenario.start')} ▶
        </button>
      </div>
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
          className={`shrink-0 border px-2 py-1 text-[8px] uppercase ${
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
