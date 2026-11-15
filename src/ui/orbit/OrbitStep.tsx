// Phase 5 — Orbit & Launch (CML 3): orbit catalog (FR-5.1), launcher catalog (FR-5.4)
// and ground station network (FR-5.6).
import { useTranslation } from 'react-i18next'
import type { GameData } from '../../engine/types'
import { translateLabel, type Label } from '../scenarios/scenarioView'
import { useMissionStore } from '../store/missionStore'
import { SegmentReport } from '../segments/SegmentReport'
import { AltitudeSlider } from './AltitudeSlider'
import { GroundSection } from './GroundSection'
import { LauncherSection } from './LauncherSection'
import { instrumentsLostAt, toOrbitCard, type OrbitCard } from './orbitView'
import { InfoTip } from '../tooltip/InfoTip'

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
  const cards = data.orbits.map((o) => toOrbitCard(o, scenario)).sort((a, b) => Number(!a.allowed) - Number(!b.allowed))
  const label = (l: Label) => translateLabel(t, l)

  return (
    <section aria-labelledby="orbit-heading" className="mx-auto max-w-6xl">
      <p className="text-[10px] uppercase text-shine">{t('phase.orbit')}</p>
      <h2 id="orbit-heading" className="mt-2 text-base">
        {t('orbit.heading')}
      </h2>
      <p className="mt-3 max-w-3xl text-xs text-metal-light">{t('orbit.intro')}</p>

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

      {/* FR-5.3 — altitude for LEO/SSO */}
      <AltitudeSlider data={data} />

      <LauncherSection data={data} />

      <GroundSection data={data} />

      <SegmentReport data={data} />

      {(!design.orbitId || !design.launcherId || !design.groundNetworkId) && (
        <p className="mt-6 text-right text-[10px] text-warning">▲ {t('orbit.confirmNeeds')}</p>
      )}

      <div className="mt-6 flex justify-between gap-3">
        <button type="button" onClick={() => goTo('payload')} className="pixel-button px-4 py-3 text-[10px]">
          ◀ {t('common.back')}
        </button>
        <button
          type="button"
          disabled={!design.orbitId || !design.launcherId || !design.groundNetworkId}
          onClick={() => goTo('design')}
          className="border-2 border-outline bg-ok px-5 py-3 text-xs text-outline shadow-[inset_-3px_-3px_0_var(--color-teal)] hover:bg-ok-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shine disabled:cursor-not-allowed disabled:bg-metal disabled:text-metal-dark disabled:shadow-none"
        >
          {t('orbit.confirm')} ▶
        </button>
      </div>
    </section>
  )
}

const RADIATION_ICON: Record<OrbitCard['radiation'], string> = { low: '✓', medium: '▲', high: '▲▲' }
const RADIATION_COLOUR: Record<OrbitCard['radiation'], string> = {
  low: 'text-ok',
  medium: 'text-warning',
  high: 'text-orange',
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
  const notes = disabled
    ? [t('orbit.notAllowed')]
    : lost.length > 0
      ? [t('orbit.instrumentsLost', { names: lost.join(' · ') })]
      : []
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      aria-describedby={notes.length > 0 ? reasonId : undefined}
      title={disabled ? t('orbit.notAllowed') : undefined}
      onClick={disabled ? undefined : onSelect}
      className={`flex h-full w-full flex-col border-2 p-4 text-left shadow-[0_0_0_2px_var(--color-outline)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-shine ${
        selected
          ? 'border-ok bg-screen'
          : disabled
            ? 'cursor-not-allowed border-metal bg-outline text-metal-light'
            : 'border-metal-light bg-metal-dark hover:border-shine'
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-xs leading-relaxed">
          {card.name}
          <InfoTip id={card.id} />
        </span>
        <span
          className={`shrink-0 border px-2 py-1 text-[8px] uppercase ${
            selected ? 'border-ok text-ok' : 'border-metal text-metal-light'
          }`}
        >
          {selected
            ? `✓ ${t('scenario.selected')}`
            : disabled
              ? `✕ ${t('payload.incompatible.title')}`
              : t('scenario.select')}
        </span>
      </span>

      {/* Plain-language card (FR-5.1) */}
      <span className="mt-3 block text-[10px] leading-relaxed">
        <span className="text-ok">✓ {t('orbit.goodFor')}: </span>
        <span className={disabled ? '' : 'text-white'}>{t(`${card.textKey}.goodFor`)}</span>
      </span>
      <span className="mt-2 block text-[10px] leading-relaxed">
        <span className="text-warning">▲ {t('orbit.tradeoff')}: </span>
        <span className={disabled ? '' : 'text-white'}>{t(`${card.textKey}.tradeoff`)}</span>
      </span>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-[10px]">
        <Stat term={t('orbit.stat.altitude')} value={label(card.altitude)} />
        <Stat term={t('orbit.stat.period')} value={label(card.period)} />
        <Stat term={t('orbit.stat.eclipse')} value={label(card.eclipse)} />
        <Stat term={t('orbit.stat.contact')} value={label(card.contact)} />
        <div>
          <dt className="mb-1 text-[10px] uppercase text-metal-light">{t('orbit.stat.radiation')}</dt>
          <dd className={RADIATION_COLOUR[card.radiation]}>
            {RADIATION_ICON[card.radiation]} {t(`orbit.radiation.${card.radiation}`)}
          </dd>
        </div>
        {card.fromGmat && (
          <div>
            <dt className="mb-1 text-[10px] uppercase text-metal-light">{t('orbit.stat.source')}</dt>
            <dd className="text-shine">{t('orbit.gmat')}</dd>
          </div>
        )}
      </dl>

      {notes.length > 0 && (
        <span
          id={reasonId}
          className="mt-4 block border-t-2 border-outline pt-3 text-[10px] leading-relaxed text-warning"
        >
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
      <dt className="mb-1 text-[10px] uppercase text-metal-light">{term}</dt>
      <dd>{value}</dd>
    </div>
  )
}
