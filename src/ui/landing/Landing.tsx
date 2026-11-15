// Landing screen (FR-1.1): Play Solo, Create Team Room, Join Room, Sandbox, How to Play — all
// visible without scrolling at 1366×768, pixel-art style (docs/ART.md). Modes that are not built
// yet are shown disabled with a reason. A saved mission can be continued.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameData } from '../../engine/types'
import { useMissionStore } from '../store/missionStore'
import { NasaSources } from '../sources/NasaSources'
import { HOW_TO_PLAY_STEPS, MENU_ENTRIES, isAvailable, type MenuEntry } from './landingView'

interface Props {
  data: Pick<GameData, 'scenarios'>
}

export function Landing({ data }: Props) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const step = useMissionStore((s) => s.step)
  const openDesign = useMissionStore((s) => s.openDesign)
  const goTo = useMissionStore((s) => s.goTo)
  const [howTo, setHowTo] = useState(false)
  const [sources, setSources] = useState(false)
  const saved = design ? data.scenarios.find((s) => s.id === design.scenarioId) : undefined

  const choose = (entry: MenuEntry) => {
    if (entry === 'solo') {
      goTo('brief')
      openDesign()
    } else if (entry === 'howToPlay') {
      setHowTo(true)
    }
  }

  return (
    <div className="relative flex min-h-[calc(100vh-3rem)] flex-col items-center justify-center overflow-hidden">
      <Starfield />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        {/* Logo */}
        <h1 className="text-center text-3xl tracking-wider text-white [text-shadow:4px_4px_0_var(--color-visor),8px_8px_0_var(--color-outline)] sm:text-4xl">
          {t('landing.logo')}
        </h1>
        <p className="mt-4 text-sm uppercase tracking-widest text-shine">{t('landing.subtitle')}</p>
        <p className="mt-3 text-center text-[10px] text-metal-light">{t('landing.tagline')}</p>

        <nav aria-label={t('landing.menuLabel')} className="mt-8 w-full">
          <ul className="space-y-3">
            {saved && (
              <li>
                <button
                  type="button"
                  onClick={openDesign}
                  className="flex w-full flex-col items-start gap-1 border-2 border-outline bg-ok px-4 py-3 text-left text-outline shadow-[inset_-3px_-3px_0_var(--color-teal),0_0_0_2px_var(--color-outline)] hover:bg-ok-light focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shine"
                >
                  <span className="text-xs">▶ {t('landing.continue')}</span>
                  <span className="text-[10px]">
                    {t('landing.continueHint', { name: saved.name, phase: t(`phase.${step}`) })}
                  </span>
                </button>
              </li>
            )}
            {MENU_ENTRIES.map((entry) => (
              <li key={entry}>
                <MenuButton entry={entry} primary={entry === 'solo' && !saved} onChoose={() => choose(entry)} />
              </li>
            ))}
          </ul>
        </nav>

        {/* FR-14.1 — the NASA resources behind the game */}
        <button
          type="button"
          onClick={() => setSources(true)}
          aria-describedby="landing-sources-hint"
          className="pixel-button mt-4 flex w-full flex-col items-start gap-1 px-4 py-2 text-left"
        >
          <span className="text-[10px] text-shine">{t('landing.sources')}</span>
          <span id="landing-sources-hint" className="text-[10px] text-metal-light">
            {t('landing.sourcesHint')}
          </span>
        </button>

        <p className="mt-8 text-[10px] text-metal-light">{t('landing.footer')}</p>
      </div>

      {howTo && <HowToPlay onClose={() => setHowTo(false)} />}
      {sources && <NasaSources onClose={() => setSources(false)} />}
    </div>
  )
}

function MenuButton({ entry, primary, onChoose }: { entry: MenuEntry; primary: boolean; onChoose: () => void }) {
  const { t } = useTranslation()
  const available = isAvailable(entry)
  const hintId = `landing-${entry}-hint`
  return (
    <button
      type="button"
      aria-disabled={!available}
      aria-describedby={hintId}
      title={available ? undefined : t('landing.soonReason')}
      onClick={available ? onChoose : undefined}
      className={`pixel-button flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${
        primary ? 'border-shine! bg-screen!' : ''
      } ${available ? '' : 'cursor-not-allowed! text-metal-light!'}`}
    >
      <span className="flex flex-col gap-1">
        <span className="text-xs">
          {primary ? '▶ ' : ''}
          {t(`landing.entry.${entry}`)}
        </span>
        <span id={hintId} className="text-[10px] text-metal-light">
          {available ? t(`landing.hint.${entry}`) : `${t(`landing.hint.${entry}`)} ${t('landing.soonReason')}`}
        </span>
      </span>
      {!available && (
        <span className="shrink-0 border px-2 py-1 text-[8px] uppercase border-warning text-warning">
          {t('landing.soon')}
        </span>
      )}
    </button>
  )
}

/** "How to play" dialog: five short steps. Esc or the button closes it. */
function HowToPlay({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-outline/80 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="howto-heading"
        className="pixel-panel max-h-full w-full max-w-xl overflow-y-auto p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="howto-heading" className="text-base">
          {t('landing.howTo.heading')}
        </h2>
        <ol className="mt-4 space-y-3 text-[10px] leading-relaxed">
          {HOW_TO_PLAY_STEPS.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span className="text-shine">{i + 1}.</span>
              <span>{t(`landing.howTo.${s}`)}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex justify-end">
          <button ref={closeRef} type="button" onClick={onClose} className="pixel-button px-4 py-2 text-[10px]">
            {t('landing.howTo.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Decorative pixel stars in palette colours (pure CSS, no image). */
function Starfield() {
  const stars = Array.from({ length: 60 }, (_, i) => {
    // deterministic pseudo-random positions so the sky is the same on every load
    const x = (i * 37 + 11) % 100
    const y = (i * 53 + 7) % 100
    const colour =
      i % 7 === 0 ? 'var(--color-shine)' : i % 5 === 0 ? 'var(--color-warning)' : 'var(--color-metal-light)'
    const size = i % 9 === 0 ? 4 : 2
    return { x, y, colour, size }
  })
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute block"
          style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.size, height: s.size, background: s.colour }}
        />
      ))}
    </div>
  )
}
