// FR-13.5 — the decision pop-up opened at a ship station (E key / click): the problem in plain language, the 2–3
// options with their cost and consequence as resource chips and one sentence of why, and the time left. Choosing
// sends `eventResolved` to the mission controller.
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { availableOptions } from '../../engine/rules/redundancy'
import { bridge, type SimSnapshot } from '../../game/bridge'
import { translateLabel } from '../scenarios/scenarioView'
import { effectChips } from './decisionView'
import { alarmSecondsLeft } from './reviewView'
import type { ActiveEvent, GameData, MissionDesign } from '../../engine/types'

interface Props {
  alarm: ActiveEvent
  state: SimSnapshot
  design: MissionDesign
  data: GameData
  onClose: () => void
}

export function DecisionPopup({ alarm, state, design, data, onClose }: Props) {
  const { t } = useTranslation()
  const firstRef = useRef<HTMLButtonElement>(null)
  const { event } = alarm
  const options = availableOptions(event, design, data, state)
  const secondsLeft = alarmSecondsLeft(alarm, state.tick)

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const choose = (optionId: string) => {
    bridge.emit('eventResolved', { eventId: event.id, optionId })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-outline/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-heading"
        aria-describedby="decision-problem"
        className="pixel-panel max-h-full w-full max-w-2xl overflow-y-auto border-alarm! p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="flex flex-wrap justify-between gap-2 text-[10px]">
          <span className="uppercase text-metal-light">
            {t('decision.station', { station: t(`station.${event.station}`) })}
          </span>
          <span aria-live="polite" className={secondsLeft <= 10 ? 'text-alarm' : 'text-warning'}>
            {t('decision.timeLeft', { s: secondsLeft })}
          </span>
        </p>
        <h2 id="decision-heading" className="mt-2 text-base text-alarm">
          <span aria-hidden="true">▲ </span>
          {event.title}
        </h2>
        <p id="decision-problem" className="mt-2 text-[10px] leading-relaxed">
          {event.description}
        </p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {options.map((option, i) => {
            const chips = effectChips(option.effects)
            const isDefault = option.id === event.defaultOptionId
            return (
              <li key={option.id}>
                <button
                  ref={i === 0 ? firstRef : undefined}
                  type="button"
                  onClick={() => choose(option.id)}
                  className="pixel-button flex h-full w-full flex-col items-start gap-2 p-3 text-left"
                >
                  <span className="text-xs text-shine">{option.label}</span>
                  <span className="flex flex-wrap gap-1">
                    {chips.length === 0 ? (
                      <span className="border border-metal-light px-1 text-[10px] text-metal-light">
                        {t('decision.noEffect')}
                      </span>
                    ) : (
                      chips.map((c) => (
                        <span
                          key={c.key}
                          className={`border px-1 text-[10px] ${c.good ? 'border-ok text-ok' : 'border-alarm text-alarm'}`}
                        >
                          <span aria-hidden="true">{c.good ? '▲ ' : '▼ '}</span>
                          {translateLabel(t, c.label)}
                        </span>
                      ))
                    )}
                  </span>
                  <span className="text-[10px] leading-relaxed text-metal-light">{option.why}</span>
                  {isDefault && <span className="text-[10px] text-warning">{t('decision.default')}</span>}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="pixel-button px-3 py-2 text-[10px]">
            {t('decision.later')}
          </button>
        </div>
      </div>
    </div>
  )
}
