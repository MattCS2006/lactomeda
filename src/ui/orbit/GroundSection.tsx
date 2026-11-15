// Ground station network (FR-5.6), third section of Phase 5 · Orbit & Launch.
import { useTranslation } from 'react-i18next'
import type { GameData } from '../../engine/types'
import { formatNumber } from '../payload/payloadView'
import { translateLabel, type Label } from '../scenarios/scenarioView'
import { useMissionStore } from '../store/missionStore'
import { toGroundCard, type GroundCard } from './groundView'
import { InfoTip } from '../tooltip/InfoTip'

interface Props {
  data: GameData
}

export function GroundSection({ data }: Props) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const selectGroundNetwork = useMissionStore((s) => s.selectGroundNetwork)
  if (!design) return null

  const cards = data.groundNetworks
    .map((g) => toGroundCard(g, design, data))
    .sort((a, b) => Number(a.reasons.length > 0) - Number(b.reasons.length > 0))
  const label = (l: Label) => translateLabel(t, l)

  return (
    <section aria-labelledby="ground-heading" className="mt-10">
      <h2 id="ground-heading" className="text-base">
        {t('ground.heading')}
      </h2>
      <p className="mt-3 max-w-3xl text-xs text-metal-light">{t('ground.intro')}</p>

      <div role="radiogroup" aria-labelledby="ground-heading" className="mt-6 grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <GroundCardView
            key={card.id}
            card={card}
            selected={design.groundNetworkId === card.id}
            onSelect={() => selectGroundNetwork(card.id, data)}
            label={label}
          />
        ))}
      </div>
    </section>
  )
}

interface CardProps {
  card: GroundCard
  selected: boolean
  onSelect: () => void
  label: (l: Label) => string
}

function GroundCardView({ card, selected, onSelect, label }: CardProps) {
  const { t } = useTranslation()
  const reasonId = `${card.id}-reason`
  const reasons = card.reasons.map(label)
  const disabled = reasons.length > 0
  // An unreachable network gives no contact at all
  const contact = disabled
    ? '—'
    : card.contactMinPerDay === null
      ? t('ground.pickOrbit')
      : card.contactMinPerDay >= 1440
        ? t('ground.allDay')
        : t('ground.contactValue', { value: formatNumber(Math.round(card.contactMinPerDay)) })
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled}
      aria-describedby={disabled ? reasonId : undefined}
      title={disabled ? reasons.join('\n') : undefined}
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
          className={`shrink-0 border px-2 py-1 text-[10px] uppercase ${
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
      <span className="mt-3 block text-[10px] leading-relaxed">{t(card.textKey)}</span>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-[10px]">
        <div className="col-span-2">
          <dt className="mb-1 text-[10px] uppercase text-metal-light">{t('ground.contact')}</dt>
          <dd className={disabled || card.contactMinPerDay === null ? 'text-metal-light' : 'text-shine'}>
            {contact}
            {!disabled && card.baseContactMinPerDay !== null && card.contactMultiplier !== 1 && (
              <span className="text-metal-light">
                {' '}
                ·{' '}
                {t('ground.times', {
                  value: card.contactMultiplier,
                  base: formatNumber(Math.round(card.baseContactMinPerDay)),
                })}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-[10px] uppercase text-metal-light">{t('ground.costYear')}</dt>
          <dd>{label(card.costPerYear)}</dd>
        </div>
        <div>
          <dt className="mb-1 text-[10px] uppercase text-metal-light">{t('ground.costMission')}</dt>
          <dd>{t('ground.costMissionValue', { cost: label(card.missionCost), years: card.missionYears })}</dd>
        </div>
        <div className="col-span-2">
          <dt className="mb-1 text-[10px] uppercase text-metal-light">{t('ground.reach')}</dt>
          <dd>{label(card.reach)}</dd>
        </div>
      </dl>

      {disabled && (
        <span
          id={reasonId}
          className="mt-4 block border-t-2 border-outline pt-3 text-[10px] leading-relaxed text-warning"
        >
          {reasons.map((r) => (
            <span key={r} className="block">
              ▲ {r}
            </span>
          ))}
        </span>
      )}
    </button>
  )
}
