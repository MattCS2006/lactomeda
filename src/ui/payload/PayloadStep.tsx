// Phase 4 — Payload (CML 3): pick the science instruments (FR-4.1).
// Each card shows what the instrument costs the spacecraft and what science it brings.
import { useTranslation } from 'react-i18next'
import type { GameData } from '../../engine/types'
import { useMissionStore } from '../store/missionStore'
import { formatNumber, payloadTotals, slotInfo, toInstrumentCard, type InstrumentCard } from './payloadView'

interface Props {
  data: GameData
}

export function PayloadStep({ data }: Props) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const toggle = useMissionStore((s) => s.toggleInstrument)
  const goTo = useMissionStore((s) => s.goTo)
  const scenario = data.scenarios.find((s) => s.id === design?.scenarioId)
  if (!design || !scenario) return null

  const cards = data.instruments.map((i) => toInstrumentCard(i, scenario))
  const totals = payloadTotals(design, data)
  const slots = slotInfo(design, data)

  return (
    <section aria-labelledby="payload-heading" className="mx-auto max-w-6xl">
      <p className="text-[10px] uppercase text-[#73eff7]">{t('phase.payload')}</p>
      <h2 id="payload-heading" className="mt-2 text-base">
        {t('payload.heading')}
      </h2>
      <p className="mt-3 max-w-3xl text-[10px] text-[#94b0c2]">{t('payload.intro')}</p>

      {/* Running totals of the selection */}
      <div
        aria-live="polite"
        className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-2 border-[#566c86] bg-[#29366f] p-3 text-[10px]"
      >
        <span className="text-[#ffcd75]">
          {slots.max === null
            ? t('payload.selectedCount', { count: totals.count })
            : t('payload.slots', { used: slots.used, max: slots.max })}
        </span>
        <Total label={t('payload.stat.mass')} value={`${formatNumber(totals.massKg)} kg`} />
        <Total label={t('payload.stat.power')} value={`${formatNumber(totals.powerW)} W`} />
        <Total label={t('payload.stat.cost')} value={`$${formatNumber(totals.costM)}M`} />
        <Total label={t('payload.stat.data')} value={`${formatNumber(totals.dataMbPerDay)} Mb/day`} />
        <Total label={t('payload.stat.science')} value={formatNumber(totals.science)} />
      </div>
      {slots.max === null && <p className="mt-2 text-[8px] text-[#94b0c2]">{t('payload.noBus')}</p>}

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => {
          const selected = design.instrumentIds.includes(card.id)
          const blocked = !selected && slots.full
          return (
            <li key={card.id}>
              <InstrumentCardView card={card} selected={selected} blocked={blocked} onToggle={() => toggle(card.id, data)} />
            </li>
          )
        })}
      </ul>

      <div className="mt-6 flex justify-between gap-3">
        <button
          type="button"
          onClick={() => goTo('requirements')}
          className="border-2 border-[#94b0c2] bg-[#333c57] px-4 py-3 text-[10px] hover:bg-[#566c86] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73eff7]"
        >
          ◀ {t('common.back')}
        </button>
        <button
          type="button"
          onClick={() => goTo('design')}
          className="border-2 border-[#1a1c2c] bg-[#38b764] px-5 py-3 text-xs text-[#1a1c2c] shadow-[inset_-3px_-3px_0_#257179] hover:bg-[#a7f070] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#73eff7]"
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
      <span className="text-[#94b0c2]">{label}: </span>
      <span className="text-[#f4f4f4]">{value}</span>
    </span>
  )
}

interface CardProps {
  card: InstrumentCard
  selected: boolean
  /** Bus has no free slot (only when a bus class is chosen). */
  blocked: boolean
  onToggle: () => void
}

function InstrumentCardView({ card, selected, blocked, onToggle }: CardProps) {
  const { t } = useTranslation()
  const reasonId = `${card.id}-reason`
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-disabled={blocked}
      aria-describedby={blocked ? reasonId : undefined}
      title={blocked ? t('payload.slotsFull') : undefined}
      onClick={blocked ? undefined : onToggle}
      className={`flex h-full w-full flex-col border-2 p-4 text-left shadow-[0_0_0_2px_#1a1c2c] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#73eff7] ${
        selected
          ? 'border-[#38b764] bg-[#29366f]'
          : blocked
            ? 'cursor-not-allowed border-[#566c86] bg-[#333c57] opacity-60'
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
          {selected ? `✓ ${t('payload.added')}` : t('payload.add')}
        </span>
      </span>

      <dl className="mt-4 grid grid-cols-3 gap-x-2 gap-y-3 text-[10px]">
        <Stat term={t('payload.stat.mass')} value={`${formatNumber(card.massKg)} kg`} />
        <Stat term={t('payload.stat.power')} value={`${formatNumber(card.powerW)} W`} />
        <Stat term={t('payload.stat.cost')} value={`$${formatNumber(card.costM)}M`} />
        <Stat term={t('payload.stat.data')} value={`${formatNumber(card.dataMbPerDay)} Mb/d`} />
        <div className="col-span-2">
          <dt className="mb-1 text-[8px] uppercase text-[#94b0c2]">{t('payload.stat.science')}</dt>
          <dd className="flex items-center gap-2">
            <span className="text-[#f4f4f4]">{card.science}</span>
            <span aria-hidden className="h-2 flex-1 border border-[#1a1c2c] bg-[#1a1c2c]">
              <span className="block h-full bg-[#a7f070]" style={{ width: `${Math.min(100, card.science)}%` }} />
            </span>
          </dd>
        </div>
      </dl>

      <span className="mt-4 block border-t-2 border-[#1a1c2c] pt-3 text-[8px]">
        {card.helps.length > 0 ? (
          <span className="text-[#38b764]">✓ {t('payload.helps', { objectives: card.helps.join(' · ') })}</span>
        ) : (
          <span className="text-[#94b0c2]">{t('payload.helpsNone')}</span>
        )}
      </span>
      {blocked && (
        <span id={reasonId} className="mt-2 block text-[8px] text-[#ffcd75]">
          ▲ {t('payload.slotsFull')}
        </span>
      )}
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
