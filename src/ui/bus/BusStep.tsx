// Phase 3 — Spacecraft Bus (CML 3, space segment): bus size class (FR-3.1) and one part per
// subsystem (FR-3.2), each showing mass, power, cost, reliability and TRL. The ship preview
// (Dev 3, SCRUM-92) grows as parts are picked.
import { useTranslation } from 'react-i18next'
import type { GameData, Subsystem } from '../../engine/types'
import { ShipPreview } from '../../game/ShipPreview'
import { translateLabel, type Label } from '../scenarios/scenarioView'
import { useMissionStore } from '../store/missionStore'
import { SUBSYSTEMS, busComplete, busIssues, partOptions, toBusCard, type BusCard, type PartCard } from './busView'
import { InfoTip } from '../tooltip/InfoTip'

interface Props {
  data: GameData
}

const CARD =
  'flex h-full w-full flex-col border-2 p-3 text-left shadow-[0_0_0_2px_var(--color-outline)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-shine'
const cardState = (selected: boolean) =>
  selected ? 'border-ok bg-screen' : 'border-metal-light bg-metal-dark hover:border-shine'

export function BusStep({ data }: Props) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const selectBus = useMissionStore((s) => s.selectBus)
  const selectPart = useMissionStore((s) => s.selectPart)
  const goTo = useMissionStore((s) => s.goTo)
  if (!design) return null

  const label = (l: Label) => translateLabel(t, l)
  const chosen = SUBSYSTEMS.filter((s) => design.componentIds[s] !== undefined).length
  const issues = busIssues(design, data).filter((i) => i.code !== 'MISSING_SUBSYSTEM')
  const complete = busComplete(design)

  return (
    <section aria-labelledby="bus-heading" className="mx-auto max-w-6xl">
      <p className="text-[10px] uppercase text-shine">{t('phase.bus')}</p>
      <h2 id="bus-heading" className="mt-2 text-base">
        {t('bus.heading')}
      </h2>
      <p className="mt-3 max-w-3xl text-xs text-metal-light">{t('bus.intro')}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div>
          {/* 1. Bus size (FR-3.1) */}
          <h3 id="bus-size-heading" className="text-xs">
            {t('bus.sizeHeading')}
          </h3>
          <div
            role="radiogroup"
            aria-labelledby="bus-size-heading"
            className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            {data.busClasses.map(toBusCard).map((card) => (
              <BusCardView
                key={card.id}
                card={card}
                selected={design.busClassId === card.id}
                onSelect={() => selectBus(card.id, data)}
                label={label}
              />
            ))}
          </div>

          {/* 2. One part per subsystem (FR-3.2) */}
          <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xs">{t('bus.partsHeading')}</h3>
            <p className="text-[10px] text-metal-light">
              {t('bus.progress', { done: chosen, total: SUBSYSTEMS.length })}
            </p>
          </div>
          <div className="mt-3 space-y-6">
            {SUBSYSTEMS.map((subsystem) => (
              <SubsystemRow
                key={subsystem}
                subsystem={subsystem}
                parts={partOptions(subsystem, design, data)}
                selectedId={design.componentIds[subsystem]}
                onSelect={(id) => selectPart(subsystem, id, data)}
                label={label}
              />
            ))}
          </div>
        </div>

        {/* Ship preview + engineering checks, kept in view while scrolling */}
        <aside className="lg:sticky lg:top-40 lg:self-start">
          <div className="pixel-panel p-3">
            <p className="text-[10px] uppercase text-metal-light">{t('bus.preview')}</p>
            <div className="mt-2 flex justify-center">
              <ShipPreview width={300} height={190} />
            </div>
          </div>
          <div className="pixel-panel mt-4 p-3" aria-live="polite">
            <p className="text-[10px] uppercase text-metal-light">{t('bus.issuesHeading')}</p>
            {issues.length === 0 ? (
              <p className="mt-2 text-[10px] text-ok">✓ {t('bus.noIssues')}</p>
            ) : (
              <ul className="mt-2 space-y-2 text-[10px]">
                {issues.map((issue, i) => (
                  <li
                    key={`${issue.code}-${i}`}
                    className={issue.severity === 'error' ? 'text-orange' : 'text-warning'}
                  >
                    {issue.severity === 'error' ? '✕' : '▲'} {label(issue.label)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {!complete && <p className="mt-6 text-right text-[10px] text-warning">▲ {t('bus.confirmNeeds')}</p>}
      <div className="mt-6 flex justify-between gap-3">
        <button type="button" onClick={() => goTo('requirements')} className="pixel-button px-4 py-3 text-[10px]">
          ◀ {t('common.back')}
        </button>
        <button
          type="button"
          disabled={!complete}
          onClick={() => goTo('payload')}
          className="border-2 border-outline bg-ok px-5 py-3 text-xs text-outline shadow-[inset_-3px_-3px_0_var(--color-teal)] hover:bg-ok-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shine disabled:cursor-not-allowed disabled:bg-metal disabled:text-metal-dark disabled:shadow-none"
        >
          {t('bus.confirm')} ▶
        </button>
      </div>
    </section>
  )
}

function Badge({ selected }: { selected: boolean }) {
  const { t } = useTranslation()
  return (
    <span
      className={`shrink-0 border px-2 py-1 text-[8px] uppercase ${
        selected ? 'border-ok text-ok' : 'border-metal text-metal-light'
      }`}
    >
      {selected ? `✓ ${t('scenario.selected')}` : t('scenario.select')}
    </span>
  )
}

function Stat({ term, value, title }: { term: string; value: string; title?: string }) {
  return (
    <div title={title}>
      <dt className="text-[10px] uppercase text-metal-light">{term}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-2">
      <dt className="uppercase text-metal-light">{term}</dt>
      <dd>{value}</dd>
    </div>
  )
}

function BusCardView({
  card,
  selected,
  onSelect,
  label,
}: {
  card: BusCard
  selected: boolean
  onSelect: () => void
  label: (l: Label) => string
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`${CARD} ${cardState(selected)}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-[10px] leading-relaxed">
          {card.name}
          <InfoTip id={card.id} />
        </span>
        <Badge selected={selected} />
      </span>
      {/* One row per stat: narrow cards can't fit two long labels side by side */}
      <dl className="mt-3 space-y-1 text-[10px]">
        <Row term={t('bus.stat.maxMass')} value={label(card.maxMass)} />
        <Row term={t('bus.stat.cost')} value={label(card.cost)} />
        <Row term={t('bus.stat.instrumentSlots')} value={String(card.instrumentSlots)} />
        <Row term={t('bus.stat.componentSlots')} value={String(card.componentSlots)} />
      </dl>
    </button>
  )
}

function SubsystemRow({
  subsystem,
  parts,
  selectedId,
  onSelect,
  label,
}: {
  subsystem: Subsystem
  parts: PartCard[]
  selectedId: string | undefined
  onSelect: (id: string) => void
  label: (l: Label) => string
}) {
  const { t } = useTranslation()
  const headingId = `subsystem-${subsystem}`
  return (
    <div>
      <h4 id={headingId} className="flex flex-wrap items-baseline gap-x-3 text-[10px]">
        <span className={selectedId ? 'text-ok' : 'text-white'}>
          {selectedId ? '✓' : '○'} {t(`subsystem.${subsystem}.name`)}
        </span>
        <span className="text-metal-light">{t(`subsystem.${subsystem}.what`)}</span>
      </h4>
      <div role="radiogroup" aria-labelledby={headingId} className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {parts.map((part) => {
          const selected = selectedId === part.id
          return (
            <button
              key={part.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(part.id)}
              className={`${CARD} ${cardState(selected)}`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-[10px] leading-relaxed">
                  {part.name}
                  <InfoTip id={part.id} />
                  {part.advanced && <span className="ml-2 text-shine">★ {t('bus.advanced')}</span>}
                </span>
                <Badge selected={selected} />
              </span>
              {part.special && <span className="mt-2 text-[10px] text-shine">{label(part.special)}</span>}
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
                <Stat term={t('bus.stat.mass')} value={label(part.mass)} />
                <Stat term={t('bus.stat.power')} value={label(part.power)} />
                <Stat term={t('bus.stat.cost')} value={label(part.cost)} />
                <Stat
                  term={t('bus.stat.reliability')}
                  value={t('bus.reliabilityValue', { value: part.reliabilityPct })}
                />
                <Stat term={t('bus.stat.trl')} value={String(part.trl)} title={t('bus.trlHelp')} />
              </dl>
            </button>
          )
        })}
      </div>
    </div>
  )
}
