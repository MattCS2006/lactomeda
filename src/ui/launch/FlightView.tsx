// What the player sees while the mission controller runs (phases 'launch' and 'flight'): a liftoff panel, then the
// ship interior (Dev 3) with the flight controls: mission day, speed (pause / 1× / 2× / 10×, FR-7.2) and abort.
// Until the station pop-up (FR-13.5, Dev 3) lands, active alarms are listed here so the player can answer them.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { availableOptions } from '../../engine/rules/redundancy'
import { PhaserGame } from '../../game/PhaserGame'
import { bridge, type SimSnapshot } from '../../game/bridge'
import { getMissionController, stopMission, type Speed } from '../../game/missionController'
import { useFlightStore } from '../flight/flightStore'
import { SPEEDS, alarmSecondsLeft } from './reviewView'
import type { GameData } from '../../engine/types'

export function FlightView({ data }: { data: GameData }) {
  const { t } = useTranslation()
  const phase = useFlightStore((s) => s.phase)
  const flown = useFlightStore((s) => s.lastFlight?.design ?? null)
  const [state, setState] = useState<SimSnapshot | null>(null)

  const [speed, setSpeedState] = useState<Speed>(() => getMissionController()?.getSpeed() ?? 1)

  // Follow the controller: live state on every tick; a new launch starts from a clean slate at 1×
  useEffect(() => {
    const offTick = bridge.on('simTick', ({ state: next }) => setState(next))
    const offPhase = bridge.on('phaseChanged', ({ phase: next }) => {
      if (next !== 'launch') return
      setState(null)
      setSpeedState(1)
    })
    return () => {
      offTick()
      offPhase()
    }
  }, [])

  const setSpeed = (next: Speed) => {
    getMissionController()?.setSpeed(next)
    setSpeedState(next)
  }
  const abort = () => {
    stopMission()
    useFlightStore.getState().setPhase('design')
  }

  if (phase === 'launch') {
    const launcher = data.launchers.find((l) => l.id === flown?.launcherId)
    return (
      <section aria-live="polite" className="pixel-panel mx-auto max-w-xl p-6 text-center">
        <p className="text-sm text-shine">{t('flightView.liftoff')}</p>
        <p className="mt-3 text-[10px] text-metal-light">
          {t('flightView.liftoffHint', { launcher: launcher?.name ?? '' })}
        </p>
      </section>
    )
  }

  return (
    <section aria-label={t('flightView.heading')} className="mx-auto max-w-6xl">
      <div className="pixel-panel mb-4 flex flex-wrap items-center justify-between gap-3 p-3 text-[10px]">
        <p aria-live="polite">{t('flightView.day', { day: state?.day ?? 0 })}</p>
        <div role="group" aria-label={t('flightView.speed')} className="flex gap-2">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              className={`pixel-button px-3 py-2 text-[10px] ${speed === s ? 'border-shine! bg-screen!' : ''}`}
            >
              {s === 0 ? t('flightView.pause') : t('flightView.times', { n: s })}
            </button>
          ))}
        </div>
        <button type="button" onClick={abort} className="pixel-button px-3 py-2 text-[10px] text-warning!">
          {t('flightView.abort')}
        </button>
      </div>

      {state && state.activeEvents.length > 0 && flown && (
        <ul aria-live="assertive" className="mb-4 space-y-2">
          {state.activeEvents.map(({ event, deadlineTick }) => (
            <li key={event.id} className="pixel-panel border-alarm! p-3 text-[10px]">
              <p className="flex flex-wrap justify-between gap-2">
                <span className="text-xs text-alarm">
                  <span aria-hidden="true">▲ </span>
                  {event.title}
                </span>
                <span>
                  {t('flightView.alarmAt', { station: event.station })} ·{' '}
                  {t('flightView.secondsLeft', { s: alarmSecondsLeft({ deadlineTick }, state.tick) })}
                </span>
              </p>
              <p className="mt-1 text-metal-light">{event.description}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {availableOptions(event, flown, data, state).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    title={option.why}
                    onClick={() => bridge.emit('eventResolved', { eventId: event.id, optionId: option.id })}
                    className="pixel-button px-3 py-2 text-left text-[10px]"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <PhaserGame />
    </section>
  )
}
