// Shown on the design screens after a flight (FR-10.6): what changed since that flight,
// so the player can "change one thing and re-fly" and see the effect in the next debrief.
import { useTranslation } from 'react-i18next'
import { translateLabel } from '../scenarios/scenarioView'
import { useMissionStore } from '../store/missionStore'
import { designChanges } from './flightRecord'
import { useFlightStore } from './flightStore'
import { resultLabel, starsIcon } from './resultView'
import type { GameData } from '../../engine/types'

export function ChangesSinceFlight({ data }: { data: GameData }) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const lastFlight = useFlightStore((s) => s.lastFlight)
  if (!design || !lastFlight || lastFlight.design.scenarioId !== design.scenarioId) return null

  const changes = designChanges(lastFlight.design, design, data)
  const result = lastFlight.result
  return (
    <section aria-label={t('flight.sinceHeading')} className="pixel-panel mx-auto mb-6 max-w-6xl p-3 text-[10px]">
      <p className="flex flex-wrap items-center justify-between gap-2">
        <span className="uppercase text-shine">{t('flight.sinceHeading')}</span>
        {result && (
          <span>
            <span aria-hidden="true" className="text-sm text-warning">
              {starsIcon(result.stars)}{' '}
            </span>
            {translateLabel(t, resultLabel(result))}
          </span>
        )}
      </p>
      {changes.length === 0 ? (
        <p className="mt-2 text-metal-light">{t('flight.noChanges')}</p>
      ) : (
        <>
          <p className="mt-2 text-metal-light">{t('flight.changeCount', { count: changes.length })}</p>
          <ul className="mt-1 list-inside list-disc">
            {changes.map((c, i) => (
              <li key={i}>{translateLabel(t, c)}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
