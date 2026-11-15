// Phase 4 — Payload (CML 3): pick the science instruments (FR-4.1).
// Each card shows what the instrument costs the spacecraft and what science it brings.
// Incompatible instruments are disabled with the reason (FR-4.2).
import { useTranslation } from 'react-i18next'
import type { GameData } from '../../engine/types'
import { useMissionStore } from '../store/missionStore'
import { incompatibilities } from './compatibility'
import {
  copiesOf,
  formatNumber,
  nextCopy,
  payloadTotals,
  slotInfo,
  toInstrumentCard,
  type InstrumentCard,
  type NextCopy,
} from './payloadView'
import { InfoTip } from '../tooltip/InfoTip'

interface Props {
  data: GameData
}

export function PayloadStep({ data }: Props) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const toggle = useMissionStore((s) => s.toggleInstrument)
  const addCopy = useMissionStore((s) => s.addInstrument)
  const removeCopy = useMissionStore((s) => s.removeInstrument)
  const goTo = useMissionStore((s) => s.goTo)
  const scenario = data.scenarios.find((s) => s.id === design?.scenarioId)
  if (!design || !scenario) return null

  // Compatible instruments first, keeping catalog order inside each group
  const rows = data.instruments
    .map((i) => ({
      card: toInstrumentCard(i, scenario),
      reasons: incompatibilities(i, scenario, design, data).map((r) => t(r.label.key, r.label.values ?? {})),
    }))
    .sort((a, b) => Number(a.reasons.length > 0) - Number(b.reasons.length > 0))
  const compatibleCount = rows.filter((r) => r.reasons.length === 0).length
  const totals = payloadTotals(design, data)
  const slots = slotInfo(design, data)

  return (
    <section aria-labelledby="payload-heading" className="mx-auto max-w-6xl">
      <p className="text-[10px] uppercase text-shine">{t('phase.payload')}</p>
      <h2 id="payload-heading" className="mt-2 text-base">
        {t('payload.heading')}
      </h2>
      <p className="mt-3 max-w-3xl text-xs text-metal-light">{t('payload.intro')}</p>

      {/* Running totals of the selection */}
      <div
        aria-live="polite"
        className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-2 border-metal bg-screen p-3 text-[10px]"
      >
        <span className="text-warning">
          {slots.max === null
            ? t('payload.selectedCount', { count: totals.count })
            : t('payload.slots', { used: slots.used, max: slots.max })}
        </span>
        <Total label={t('payload.stat.mass')} value={t('units.kg', { value: formatNumber(totals.massKg) })} />
        <Total label={t('payload.stat.power')} value={t('units.watts', { value: formatNumber(totals.powerW) })} />
        <Total label={t('payload.stat.cost')} value={t('units.moneyM', { value: formatNumber(totals.costM) })} />
        <Total
          label={t('payload.stat.data')}
          value={t('units.mbPerDay', { value: formatNumber(totals.dataMbPerDay) })}
        />
        <Total label={t('payload.stat.science')} value={formatNumber(totals.science)} />
      </div>
      {slots.max === null && <p className="mt-2 text-[10px] text-metal-light">{t('payload.noBus')}</p>}
      <p className="mt-2 text-[10px] text-shine">
        {t('payload.compatibleCount', { count: compatibleCount, total: rows.length })}
      </p>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ card, reasons }) => {
          const selected = design.instrumentIds.includes(card.id)
          const disabledReasons = selected
            ? []
            : reasons.length > 0
              ? reasons
              : slots.full
                ? [t('payload.slotsFull')]
                : []
          return (
            <li key={card.id}>
              <InstrumentCardView
                card={card}
                selected={selected}
                disabledReasons={disabledReasons}
                incompatibleSelected={selected && reasons.length > 0 ? reasons : []}
                copies={copiesOf(design, card.id)}
                next={nextCopy(design, card.id, data)}
                addCopyBlockedReason={reasons.length > 0 ? reasons[0] : slots.full ? t('payload.slotsFull') : null}
                onToggle={() => toggle(card.id, data)}
                onAddCopy={() => addCopy(card.id, data)}
                onRemoveCopy={() => removeCopy(card.id)}
              />
            </li>
          )
        })}
      </ul>

      <div className="mt-6 flex justify-between gap-3">
        <button type="button" onClick={() => goTo('bus')} className="pixel-button px-4 py-3 text-[10px]">
          ◀ {t('common.back')}
        </button>
        <button
          type="button"
          onClick={() => goTo('orbit')}
          className="font-pixel border-2 border-outline bg-ok px-5 py-3 text-xs text-outline shadow-[inset_-3px_-3px_0_var(--color-teal)] hover:bg-ok-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shine"
        >
          {t('payload.confirm')} ▶
        </button>
      </div>
    </section>
  )
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-metal-light">{label}: </span>
      <span className="text-white">{value}</span>
    </span>
  )
}

interface CardProps {
  card: InstrumentCard
  selected: boolean
  /** Why it can't be added (incompatible, or no free bus slot). Empty = can be added. */
  disabledReasons: string[]
  /** Already selected but no longer compatible (e.g. orbit changed): warn, still removable. */
  incompatibleSelected: string[]
  /** Copies on board (FR-4.3). */
  copies: number
  /** What one more copy would add. */
  next: NextCopy
  /** Why another copy can't be added (no free slot, incompatible); null = it can. */
  addCopyBlockedReason: string | null
  onToggle: () => void
  onAddCopy: () => void
  onRemoveCopy: () => void
}

function InstrumentCardView({
  card,
  selected,
  disabledReasons,
  incompatibleSelected,
  copies,
  next,
  addCopyBlockedReason,
  onToggle,
  onAddCopy,
  onRemoveCopy,
}: CardProps) {
  const { t } = useTranslation()
  const reasonId = `${card.id}-reason`
  const blocked = disabledReasons.length > 0
  const shownReasons = blocked ? disabledReasons : incompatibleSelected
  const nextId = `${card.id}-next`
  return (
    <div
      className={`flex h-full w-full flex-col border-2 shadow-[0_0_0_2px_var(--color-outline)] ${
        selected
          ? incompatibleSelected.length > 0
            ? 'border-warning bg-screen'
            : 'border-ok bg-screen'
          : blocked
            ? 'cursor-not-allowed border-metal bg-outline text-metal-light'
            : 'border-metal-light bg-metal-dark hover:border-shine'
      }`}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-disabled={blocked}
        aria-describedby={shownReasons.length > 0 ? reasonId : undefined}
        title={shownReasons.length > 0 ? shownReasons.join('\n') : undefined}
        onClick={blocked ? undefined : onToggle}
        className={`flex flex-1 flex-col p-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-shine ${
          blocked ? 'cursor-not-allowed' : ''
        }`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="text-xs leading-relaxed">
            {card.name}
            <InfoTip id={card.id} />
          </span>
          <span
            className={`shrink-0 border px-2 py-1 text-[10px] uppercase ${
              selected ? 'border-ok text-ok' : 'border-metal text-metal-light'
            }`}
          >
            {selected
              ? `✓ ${t('payload.added')}${copies > 1 ? ` ×${copies}` : ''}`
              : blocked
                ? `✕ ${t('payload.incompatible.title')}`
                : t('payload.add')}
          </span>
        </span>

        <dl className="mt-4 grid grid-cols-3 gap-x-2 gap-y-3 text-[10px]">
          <Stat term={t('payload.stat.mass')} value={t('units.kg', { value: formatNumber(card.massKg) })} />
          <Stat term={t('payload.stat.power')} value={t('units.watts', { value: formatNumber(card.powerW) })} />
          <Stat term={t('payload.stat.cost')} value={t('units.moneyM', { value: formatNumber(card.costM) })} />
          <Stat
            term={t('payload.stat.data')}
            value={t('units.mbPerDayShort', { value: formatNumber(card.dataMbPerDay) })}
          />
          <div className="col-span-2">
            <dt className="mb-1 text-[10px] uppercase text-metal-light">{t('payload.stat.science')}</dt>
            <dd className="flex items-center gap-2">
              <span className="text-white">{card.science}</span>
              <span aria-hidden className="h-2 flex-1 border border-outline bg-outline">
                <span className="block h-full bg-ok-light" style={{ width: `${Math.min(100, card.science)}%` }} />
              </span>
            </dd>
          </div>
        </dl>

        <span className="mt-4 block border-t-2 border-outline pt-3 text-[10px]">
          {card.helps.length > 0 ? (
            <span className="text-ok">✓ {t('payload.helps', { objectives: card.helps.join(' · ') })}</span>
          ) : shownReasons.length === 0 ? (
            <span className="text-metal-light">{t('payload.helpsNone')}</span>
          ) : null}
        </span>
        {shownReasons.length > 0 && (
          <span id={reasonId} className="block space-y-1 text-[10px] leading-relaxed text-warning">
            {incompatibleSelected.length > 0 && <span className="block">▲ {t('payload.incompatible.warning')}</span>}
            {shownReasons.map((r) => (
              <span key={r} className="block">
                ▲ {r}
              </span>
            ))}
          </span>
        )}
      </button>

      {/* FR-4.3 — extra copies give less science (engine marginalScience) */}
      {selected && (
        <div className="border-t-2 border-outline px-4 pb-4 pt-3">
          <p id={nextId} className="text-[10px] leading-relaxed text-shine">
            {t('payload.marginal', { count: next.have, value: formatNumber(next.value), pct: next.pct })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              aria-describedby={nextId}
              aria-disabled={addCopyBlockedReason !== null}
              title={addCopyBlockedReason ?? undefined}
              onClick={addCopyBlockedReason !== null ? undefined : onAddCopy}
              className={`border-2 px-3 py-2 text-[10px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shine ${
                addCopyBlockedReason !== null
                  ? 'cursor-not-allowed border-metal text-metal-light'
                  : 'border-ok bg-outline text-ok hover:bg-teal'
              }`}
            >
              + {t('payload.addAnother')}
            </button>
            {copies > 1 && (
              <button
                type="button"
                onClick={onRemoveCopy}
                className="border-2 border-metal-light bg-outline px-3 py-2 text-[10px] hover:bg-metal-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shine"
              >
                − {t('payload.removeOne')}
              </button>
            )}
          </div>
          {addCopyBlockedReason !== null && (
            <p className="mt-2 text-[10px] leading-relaxed text-warning">▲ {addCopyBlockedReason}</p>
          )}
        </div>
      )}
    </div>
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
