// Stand-in shown when the bridge announces the debrief, until the debrief screen (E10) lands:
// the result of the last flight and the "Fly again" buttons. The real debrief can reuse <FlyAgain />.
import { useTranslation } from 'react-i18next'
import { translateLabel } from '../scenarios/scenarioView'
import { FlyAgain } from './FlyAgain'
import { useFlightStore } from './flightStore'
import { resultLabel, starsIcon } from './resultView'
import type { GameData } from '../../engine/types'

export function MissionOver({ data }: { data: GameData }) {
  const { t } = useTranslation()
  const result = useFlightStore((s) => s.lastFlight?.result ?? null)
  return (
    <section aria-labelledby="mission-over" className="pixel-panel mx-auto max-w-xl p-6 text-center">
      <h2 id="mission-over" className="text-sm text-shine">
        {t('flight.missionOver')}
      </h2>
      {result && (
        <p className="mt-4 text-xs">
          <span aria-hidden="true" className="text-sm text-warning">
            {starsIcon(result.stars)}{' '}
          </span>
          {translateLabel(t, resultLabel(result))}
        </p>
      )}
      <div className="mt-6">
        <FlyAgain data={data} />
      </div>
    </section>
  )
}
