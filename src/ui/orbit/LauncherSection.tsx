// Launcher catalog (FR-5.4), second section of Phase 5 · Orbit & Launch.
import { useTranslation } from 'react-i18next'
import type { GameData } from '../../engine/types'
import { formatNumber } from '../payload/payloadView'
import { translateLabel, type Label } from '../scenarios/scenarioView'
import { useMissionStore } from '../store/missionStore'
import { launchersFor, toLauncherCard, type LauncherCard } from './launcherView'
import { InfoTip } from '../tooltip/InfoTip'

interface Props {
  data: GameData
}

export function LauncherSection({ data }: Props) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const selectLauncher = useMissionStore((s) => s.selectLauncher)
  if (!design) return null

  const cards = launchersFor(design.scenarioId, data)
    .map((l) => toLauncherCard(l, design, data))
    .sort((a, b) => Number(a.reasons.length > 0) - Number(b.reasons.length > 0))
  const label = (l: Label) => translateLabel(t, l)

  return (
    <section aria-labelledby="launcher-heading" className="mt-10">
      <h2 id="launcher-heading" className="text-base">
        {t('launcher.heading')}
      </h2>
      <p className="mt-3 max-w-3xl text-xs text-metal-light">{t('launcher.intro')}</p>
      {!design.orbitId && <p className="mt-2 text-[10px] text-warning">▲ {t('launcher.pickOrbitFirst')}</p>}

      <div
        role="radiogroup"
        aria-labelledby="launcher-heading"
        className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {cards.map((card) => (
          <LauncherCardView
            key={card.id}
            card={card}
            selected={design.launcherId === card.id}
            onSelect={() => selectLauncher(card.id, data)}
            label={label}
          />
        ))}
      </div>
    </section>
  )
}

interface CardProps {
  card: LauncherCard
  selected: boolean
  onSelect: () => void
  label: (l: Label) => string
}

function LauncherCardView({ card, selected, onSelect, label }: CardProps) {
  const { t } = useTranslation()
  const reasonId = `${card.id}-reason`
  const reasons = card.reasons.map(label)
  const disabled = reasons.length > 0
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

      <span className="mt-4 block text-[10px] uppercase text-metal-light">{t('launcher.capacity')}</span>
      <ul className="mt-1 space-y-1 text-[10px]">
        {card.capacities.map((c) => (
          <li key={c.regime} className={`flex justify-between gap-2 ${c.current ? 'text-shine' : ''}`}>
            <span>
              {c.current ? '▶ ' : ''}
              {t(`launcher.regime.${c.regime}`)}
              {c.current ? ` (${t('launcher.yourOrbit')})` : ''}
            </span>
            <span className="whitespace-nowrap">{t('units.kg', { value: formatNumber(c.kg) })}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-[10px]">
        <div>
          <dt className="mb-1 text-[10px] uppercase text-metal-light">{t('launcher.cost')}</dt>
          <dd>{label(card.cost)}</dd>
        </div>
        <div>
          <dt className="mb-1 text-[10px] uppercase text-metal-light">{t('launcher.reliability')}</dt>
          <dd>{t('launcher.reliabilityValue', { value: card.reliabilityPct, fail: card.failurePct })}</dd>
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
