// Launch animation (FR-9.3, SCRUM-94): plays when the mission controller announces 'launch'. It shows the engine's
// launch outcome (FR-7.1) — countdown, liftoff, max Q, stage and fairing separation, upper-stage burn, spacecraft
// separation and orbit insertion, or the anomaly where the launch failed, with its cause and lesson. ≤ 20 s and
// skippable. The flight clock waits (speed 0) until the animation ends, so no mission time is lost.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { launchOutcome, type LaunchOutcome } from '../../engine/rules/launchOutcome'
import { bridge } from '../../game/bridge'
import { getMissionController } from '../../game/missionController'
import { useMissionStore } from '../store/missionStore'
import { LAUNCH_H, LAUNCH_W, drawLaunch } from './launchArt'
import { countdownAt, launchScript, stepAt, type LaunchScript } from './launchTimeline'
import type { GameData } from '../../engine/types'

interface Playing {
  script: LaunchScript
  outcome: LaunchOutcome | null
  launcher: string
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

export function LaunchOverlay({ data }: { data: GameData }) {
  const { t } = useTranslation()
  const [playing, setPlaying] = useState<Playing | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const canvas = useRef<HTMLCanvasElement>(null)
  const skipRef = useRef<HTMLButtonElement>(null)
  const playingRef = useRef(false)

  // Start on every launch, from the design that is flying
  useEffect(
    () =>
      bridge.on('phaseChanged', ({ phase }) => {
        if (phase === 'launch') {
          const design = useMissionStore.getState().design
          if (!design) return
          const outcome = launchOutcome(design, data)
          const launcher = data.launchers.find((l) => l.id === design.launcherId)?.name ?? ''
          setElapsed(0)
          playingRef.current = true
          setPlaying({ script: launchScript(outcome), outcome, launcher })
        } else if (phase === 'flight' && playingRef.current) {
          // Hold the flight clock while the animation plays
          getMissionController()?.setSpeed(0)
        }
      }),
    [data],
  )

  const finish = useCallback(() => {
    playingRef.current = false
    setPlaying(null)
    const c = getMissionController()
    if (c?.getState()?.status === 'running') c.setSpeed(1)
  }, [])

  // Animation loop
  useEffect(() => {
    if (!playing) return
    const ctx = canvas.current?.getContext('2d')
    const reduced = prefersReducedMotion()
    const t0 = performance.now()
    let raf = 0
    const frame = (now: number) => {
      const t = (now - t0) / 1000
      if (ctx) drawLaunch(ctx, playing.script, Math.min(t, playing.script.total), reduced)
      setElapsed(t)
      if (t >= playing.script.total) finish()
      else raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    skipRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
    }
  }, [playing, finish])

  if (!playing) return null
  const { step } = stepAt(playing.script, elapsed)
  const count = countdownAt(elapsed)
  const caption =
    step.segment === 'countdown' && count !== null
      ? t('launchAnim.countdown', { n: count })
      : t(`launchAnim.segment.${step.segment}`)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-outline/90 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-anim-heading"
        className="pixel-panel flex w-full max-w-3xl flex-col gap-3 p-4"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="launch-anim-heading" className="text-sm">
            {t('launchAnim.heading', { launcher: playing.launcher })}
          </h2>
          <button ref={skipRef} type="button" onClick={finish} className="pixel-button px-3 py-2 text-[10px]">
            {t('launchAnim.skip')}
          </button>
        </div>
        <canvas
          ref={canvas}
          width={LAUNCH_W}
          height={LAUNCH_H}
          aria-hidden="true"
          className="w-full border-2 border-metal-light [image-rendering:pixelated]"
        />
        <p
          aria-live="polite"
          className={`text-center text-sm ${step.segment === 'anomaly' ? 'text-alarm' : 'text-shine'}`}
        >
          {caption}
        </p>
        {step.segment === 'anomaly' && playing.outcome && (
          <div className="space-y-1 text-[10px] leading-relaxed">
            {playing.outcome.cause && <p>{playing.outcome.cause}</p>}
            {playing.outcome.lessons.map((lesson) => (
              <p key={lesson} className="text-metal-light">
                {t('launchAnim.lesson', { lesson })}
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
