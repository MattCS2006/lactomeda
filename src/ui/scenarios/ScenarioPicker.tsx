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
      <p className="text-[10px] uppercase text-[#73eff7]">{t('phase.brief')}</p>
      <h2 id="scenario-heading" className="mt-2 text-base leading-relaxed text-[#f4f4f4]">
        {t('scenario.heading')}
      </h2>
      <p className="mt-3 max-w-3xl text-[10px] text-[#94b0c2]">{t('scenario.intro')}</p>

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
          className="border-2 border-[#1a1c2c] bg-[#38b764] px-5 py-3 text-xs text-[#1a1c2c] shadow-[inset_-3px_-3px_0_#257179] hover:bg-[#a7f070] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73eff7] disabled:cursor-not-allowed disabled:bg-[#566c86] disabled:text-[#333c57] disabled:shadow-none"
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
      className={`flex h-full flex-col border-2 bg-[#333c57] p-4 text-left shadow-[0_0_0_2px_#1a1c2c] transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#73eff7] ${
        selected ? 'border-[#38b764] bg-[#29366f]' : 'border-[#94b0c2] hover:bg-[#3b4566]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs leading-relaxed text-[#f4f4f4]">{card.name}</h3>
        {/* Selection shown with text + icon, not colour alone (NFR-05) */}
        <span
          className={`shrink-0 border px-2 py-1 text-[8px] uppercase ${
            selected ? 'border-[#38b764] text-[#38b764]' : 'border-[#566c86] text-[#94b0c2]'
          }`}
        >
          {selected ? `✓ ${t('scenario.selected')}` : t('scenario.select')}
        </span>
      </div>
      <p className="mt-3 text-[10px] text-[#94b0c2]">{card.briefing}</p>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-[10px]">
        <Stat term={t('scenario.destination')} value={t(`destination.${card.destination}`)} />
        <Stat term={t('scenario.budget')} value={label(card.budget)} />
        <Stat term={t('scenario.deadline')} value={label(card.deadline)} />
        <Stat term={t('scenario.duration')} value={label(card.duration)} />
        <Stat term={t('scenario.difficulty')} value={t(`difficulty.${card.difficulty}`)} />
        <Stat term={t('scenario.orbits')} value={card.orbitNames.join(' · ')} />
      </dl>

      <div className="mt-4 border-t-2 border-[#1a1c2c] pt-3">
        <p className="text-[8px] uppercase text-[#ffcd75]">{t('scenario.objectives')}</p>
        <ul className="mt-2 space-y-2 text-[10px] text-[#f4f4f4]">
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
      <dt className="mb-1 text-[8px] uppercase text-[#94b0c2]">{term}</dt>
      <dd className="text-[#f4f4f4]">{value}</dd>
    </div>
  )
}
