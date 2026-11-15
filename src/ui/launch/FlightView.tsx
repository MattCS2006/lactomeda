// What the player sees while the mission controller runs (phase 'flight'; the launch animation covers 'launch'): the
// ship interior (Dev 3) with the flight controls: mission day, speed (pause / 1× / 2× / 10×, FR-7.2) and abort.
// Alarms are answered at their station (FR-13.5): walk there and press E to open the decision pop-up.
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { stationsForDesign } from '../../game/shipLayout'
import { PhaserGame } from '../../game/PhaserGame'
import { bridge, type SimSnapshot } from '../../game/bridge'
import { getMissionController, stopMission, type Speed } from '../../game/missionController'
import { useFlightStore } from '../flight/flightStore'
import { DecisionPopup } from './DecisionPopup'
import { FlightHud } from './FlightHud'
import { playAlarm, unlockAudio, useSoundStore } from '../sound/alarmSound'
import { alarmsAtStation, answerStation } from './decisionView'
import { SPEEDS, alarmSecondsLeft } from './reviewView'
import type { GameData, Station } from '../../engine/types'

export function FlightView({ data }: { data: GameData }) {
  const { t } = useTranslation()
  const phase = useFlightStore((s) => s.phase)
  const flown = useFlightStore((s) => s.lastFlight?.design ?? null)
  const [state, setState] = useState<SimSnapshot | null>(null)

  // FR-13.5 — the station the player just used (E key / click in the ship)
  const [atStation, setAtStation] = useState<Station | null>(null)
  const [speed, setSpeedState] = useState<Speed>(() => getMissionController()?.getSpeed() ?? 1)

  // Follow the controller: live state on every tick; a new launch starts from a clean slate at 1×
  useEffect(() => {
    const offTick = bridge.on('simTick', ({ state: next }) => setState(next))
    const offStation = bridge.on('stationInteract', ({ station }) => setAtStation(station))
    // FR-13.4 — every new alarm plays the alarm sound (unless muted)
    const offAlarm = bridge.on('alarmStart', () => playAlarm())
    const offPhase = bridge.on('phaseChanged', ({ phase: next }) => {
      if (next !== 'launch') return
      setState(null)
      setSpeedState(1)
    })
    return () => {
      offTick()
      offStation()
      offAlarm()
      offPhase()
    }
  }, [])

  const muted = useSoundStore((s) => s.muted)
  const toggleSound = () => {
    unlockAudio()
    useSoundStore.getState().setMuted(!muted)
  }

  const setSpeed = (next: Speed) => {
    getMissionController()?.setSpeed(next)
    setSpeedState(next)
  }
  const abort = () => {
    stopMission()
    useFlightStore.getState().setPhase('design')
  }

  const shipStations = flown ? stationsForDesign(flown, data) : []
  const popupAlarm =
    atStation && state ? (alarmsAtStation(state.activeEvents, atStation, shipStations)[0] ?? null) : null

  // The launch animation (LaunchOverlay, FR-9.3) covers the 'launch' phase
  if (phase === 'launch') return null

  return (
    <section aria-label={t('flightView.heading')} className="mx-auto max-w-6xl">
      {/* FR-13.11 — flight HUD: mission day, time speed and the live mission state, always visible */}
      <section aria-label={t('hud.heading')} className="pixel-panel mb-4 p-3 text-[10px]">
        {state && flown ? (
          <FlightHud state={state} design={flown} data={data}>
            <div className="flex flex-wrap items-center gap-2">
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
              <button
                type="button"
                aria-pressed={!muted}
                onClick={toggleSound}
                className="pixel-button px-3 py-2 text-[10px]"
              >
                {muted ? t('flightView.soundOff') : t('flightView.soundOn')}
              </button>
              <button type="button" onClick={abort} className="pixel-button px-3 py-2 text-[10px] text-warning!">
                {t('flightView.abort')}
              </button>
            </div>
          </FlightHud>
        ) : (
          <p className="text-metal-light">{t('hud.waiting')}</p>
        )}
      </section>

      {/* Where each alarm is answered; the options open at that station (FR-13.5) */}
      {state && state.activeEvents.length > 0 && (
        <ul aria-live="assertive" className="mb-4 space-y-2">
          {state.activeEvents.map((alarm) => (
            <li
              key={alarm.event.id}
              className="pixel-panel flex flex-wrap justify-between gap-2 border-alarm! p-3 text-[10px]"
            >
              <span className="text-xs text-alarm">
                <span aria-hidden="true">▲ </span>
                {alarm.event.title}
              </span>
              <span>
                {t('flightView.goTo', { station: t(`station.${answerStation(alarm, shipStations)}`) })} ·{' '}
                {t('flightView.secondsLeft', { s: alarmSecondsLeft(alarm, state.tick) })}
              </span>
            </li>
          ))}
        </ul>
      )}

      {popupAlarm && state && flown && (
        <DecisionPopup alarm={popupAlarm} state={state} design={flown} data={data} onClose={() => setAtStation(null)} />
      )}

      <PhaserGame />
    </section>
  )
}
