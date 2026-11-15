// Phase 5 — Orbit & Launch (CML 3). First section: the orbit catalog (FR-5.1).
// Launcher (FR-5.4) and ground stations (FR-5.6) are added to this screen next.
import { useTranslation } from 'react-i18next'
import type { GameData } from '../../engine/types'
import type { Label } from '../scenarios/scenarioView'
import { useMissionStore } from '../store/missionStore'
import { instrumentsLostAt, toOrbitCard, type OrbitCard } from './orbitView'

interface Props {
  data: GameData
}

export function OrbitStep({ data }: Props) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const selectOrbit = useMissionStore((s) => s.selectOrbit)
  const goTo = useMissionStore((s) => s.goTo)
  const scenario = data.scenarios.find((s) => s.id === design?.scenarioId)
  if (!design || !scenario) return null

  // Orbits this mission may fly first, catalog order inside each group
  const cards = data.orbits
    .map((o) => toOrbitCard(o, scenario))
    .sort((a, b) => Number(!a.allowed) - Number(!b.allowed))
  const label = (l: Label) => t(l.key, l.values ?? {})

  return (
    <section aria-labelledby="orbit-heading" className="mx-auto max-w-6xl">
      <p className="text-[10px] uppercase text-[#73eff7]">{t('phase.orbit')}</p>
      <h2 id="orbit-heading" className="mt-2 text-base">
        {t('orbit.heading')}
      </h2>
      <p className="mt-3 max-w-3xl text-[10px] text-[#94b0c2]">{t('orbit.intro')}</p>

      <div role="radiogroup" aria-labelledby="orbit-heading" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <OrbitCardView
            key={card.id}
            card={card}
            selected={design.orbitId === card.id}
            lost={card.allowed ? instrumentsLostAt(card.id, design, data) : []}
            onSelect={() => selectOrbit(card.id, data)}
            label={label}
          />
        ))}
      </div>

      <div className="mt-6 flex justify-between gap-3">
        <button
          type="button"
          onClick={() => goTo('payload')}
          className="border-2 border-[#94b0c2] bg-[#333c57] px-4 py-3 text-[10px] hover:bg-[#566c86] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73eff7]"
        >
          ◀ {t('common.back')}
        </button>
        <button
          type="button"
          disabled={!design.orbitId}
          onClick={() => goTo('design')}
          className="border-2 border-[#1a1c2c] bg-[#38b764] px-5 py-3 text-xs text-[#1a1c2c] shadow-[inset_-3px_-3px_0_#257179] hover:bg-[#a7f070] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73eff7] disabled:cursor-not-allowed disabled:bg-[#566c86] disabled:text-[#333c57] disabled:shadow-none"
        >
          {t('orbit.confirm')} ▶
        </button>
      </div>
    </section>
  )
}

const RADIATION_ICON: Record<OrbitCard['radiation'], string> = { low: '✓', medium: '▲', high: '▲▲' }
const RADIATION_COLOUR: Record<OrbitCard['radiation'], string> = {
  low: 'text-[#38b764]',
  medium: 'text-[#ffcd75]',
  high: 'text-[#ef7d57]',
}

interface CardProps {
  card: OrbitCard
  selected: boolean
  /** Names of selected instruments that would not work from here. */
  lost: string[]
  onSelect: () => void
  label: (l: Label) => string
}

function OrbitCardView({ card, selected, lost, onSelect, label }: CardProps) {
  const { t } = useTranslation()
  const reasonId = `${card.id}-reason`
  const disabled = !card.allowed
  const notes = disabled ? [t('orbit.notAllowed')] : lost.length > 0 ? [t('orbit.instrumentsLost', { names: lost.join(' · ') })] : []
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      aria-describedby={notes.length > 0 ? reasonId : undefined}
      title={disabled ? t('orbit.notAllowed') : undefined}
      onClick={disabled ? undefined : onSelect}
      className={`flex h-full w-full flex-col border-2 p-4 text-left shadow-[0_0_0_2px_#1a1c2c] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#73eff7] ${
        selected
          ? 'border-[#38b764] bg-[#29366f]'
          : disabled
            ? 'cursor-not-allowed border-[#566c86] bg-[#1a1c2c] text-[#94b0c2]'
            : 'border-[#94b0c2] bg-[#333c57] hover:bg-[#3b4566]'
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-xs leading-relaxed">{card.name}</span>
        <span
          className={`shrink-0 border px-2 py-1 text-[8px] uppercase ${
            selected ? 'border-[#38b764] text-[#38b764]' : 'border-[#566c86] text-[#94b0c2]'
          }`}
        >
          {selected ? `✓ ${t('scenario.selected')}` : disabled ? `✕ ${t('payload.incompatible.title')}` : t('scenario.select')}
        </span>
      </span>

      {/* Plain-language card (FR-5.1) */}
      <span className="mt-3 block text-[10px] leading-relaxed">
        <span className="text-[#38b764]">✓ {t('orbit.goodFor')}: </span>
        <span className={disabled ? '' : 'text-[#f4f4f4]'}>{t(`${card.textKey}.goodFor`)}</span>
      </span>
      <span className="mt-2 block text-[10px] leading-relaxed">
        <span className="text-[#ffcd75]">▲ {t('orbit.tradeoff')}: </span>
        <span className={disabled ? '' : 'text-[#f4f4f4]'}>{t(`${card.textKey}.tradeoff`)}</span>
      </span>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-[10px]">
        <Stat term={t('orbit.stat.altitude')} value={label(card.altitude)} />
        <Stat term={t('orbit.stat.period')} value={label(card.period)} />
        <Stat term={t('orbit.stat.eclipse')} value={label(card.eclipse)} />
        <Stat term={t('orbit.stat.contact')} value={label(card.contact)} />
        <div>
          <dt className="mb-1 text-[8px] uppercase text-[#94b0c2]">{t('orbit.stat.radiation')}</dt>
          <dd className={RADIATION_COLOUR[card.radiation]}>
            {RADIATION_ICON[card.radiation]} {t(`orbit.radiation.${card.radiation}`)}
          </dd>
        </div>
        {card.fromGmat && (
          <div>
            <dt className="mb-1 text-[8px] uppercase text-[#94b0c2]">{t('orbit.stat.source')}</dt>
            <dd className="text-[#73eff7]">{t('orbit.gmat')}</dd>
          </div>
        )}
      </dl>

      {notes.length > 0 && (
        <span id={reasonId} className="mt-4 block border-t-2 border-[#1a1c2c] pt-3 text-[8px] leading-relaxed text-[#ffcd75]">
          {notes.map((n) => (
            <span key={n} className="block">
              ▲ {n}
            </span>
          ))}
        </span>
      )}
    </button>
  )
}

function Stat({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt className="mb-1 text-[8px] uppercase text-[#94b0c2]">{term}</dt>
      <dd>{value}</dd>
    </div>
  )
}
