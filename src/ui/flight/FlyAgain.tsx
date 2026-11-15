// "Fly again" buttons (FR-10.6) for the debrief: one click restores the design that flew.
// Same events by default, so the next flight only differs by what the player changes.
import { useTranslation } from 'react-i18next'
import { useFlightStore } from './flightStore'
import type { GameData } from '../../engine/types'

export function FlyAgain({ data }: { data: GameData }) {
  const { t } = useTranslation()
  const lastFlight = useFlightStore((s) => s.lastFlight)
  const flyAgain = useFlightStore((s) => s.flyAgain)
  if (!lastFlight) return null

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-[10px] text-metal-light">{t('flight.flyAgainHelp')}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => flyAgain(data)}
          className="pixel-button bg-ok! px-4 py-3 text-xs text-outline!"
          aria-describedby="fly-again-same"
        >
          ▶ {t('flight.flyAgain')}
        </button>
        <button
          type="button"
          onClick={() => flyAgain(data, { newEvents: true })}
          className="pixel-button px-4 py-3 text-[10px]"
          aria-describedby="fly-again-new"
        >
          {t('flight.flyAgainNew')}
        </button>
      </div>
      <p id="fly-again-same" className="sr-only">
        {t('flight.sameEvents')}
      </p>
      <p id="fly-again-new" className="sr-only">
        {t('flight.newEvents')}
      </p>
    </div>
  )
}
