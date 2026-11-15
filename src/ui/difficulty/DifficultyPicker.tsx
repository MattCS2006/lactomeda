// Difficulty selection (FR-2.2): Cadet, Engineer, Flight Director, each listing what it changes.
import { useTranslation } from 'react-i18next'
import type { Difficulty, GameData } from '../../engine/types'
import { useMissionStore } from '../store/missionStore'
import { DIFFICULTIES, effectsOf } from './difficultyView'

interface Props {
  data: GameData
  /** The scenario's recommended difficulty, marked with a badge. */
  recommended?: Difficulty
}

export function DifficultyPicker({ data, recommended }: Props) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const setDifficulty = useMissionStore((s) => s.setDifficulty)
  if (!design) return null

  return (
    <section aria-labelledby="difficulty-heading" className="mt-8">
      <h3 id="difficulty-heading" className="text-xs">
        {t('difficultyPicker.heading')}
      </h3>
      <p className="mt-2 max-w-3xl text-[10px] text-metal-light">{t('difficultyPicker.intro')}</p>
      <div role="radiogroup" aria-labelledby="difficulty-heading" className="mt-4 grid gap-4 md:grid-cols-3">
        {DIFFICULTIES.map((d) => {
          const selected = design.difficulty === d
          const e = effectsOf(d)
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setDifficulty(d, data)}
              className={`flex h-full flex-col border-2 p-4 text-left shadow-[0_0_0_2px_var(--color-outline)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-shine ${
                selected ? 'border-ok bg-screen' : 'border-metal-light bg-metal-dark hover:border-shine'
              }`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-xs">{t(`difficulty.${d}`)}</span>
                <span
                  className={`shrink-0 border px-2 py-1 text-[8px] uppercase ${
                    selected ? 'border-ok text-ok' : 'border-metal text-metal-light'
                  }`}
                >
                  {selected ? `✓ ${t('scenario.selected')}` : t('scenario.select')}
                </span>
              </span>
              {recommended === d && (
                <span className="mt-2 text-[10px] text-shine">★ {t('difficultyPicker.recommended')}</span>
              )}
              <span className="mt-2 text-[10px] text-metal-light">{t(`difficultyPicker.who.${d}`)}</span>
              <ul className="mt-3 space-y-1 text-[10px]">
                <li>
                  {e.advancedParts ? '✓' : '○'}{' '}
                  {t(e.advancedParts ? 'difficultyPicker.partsAll' : 'difficultyPicker.partsSimple')}
                </li>
                <li>▲ {t('difficultyPicker.events', { value: e.eventFactor })}</li>
                <li>▲ {t('difficultyPicker.massMargin', { value: e.massMarginPct })}</li>
                <li>
                  {e.canAcceptRisk ? '✓' : '○'}{' '}
                  {t(e.canAcceptRisk ? 'difficultyPicker.riskYes' : 'difficultyPicker.riskNo')}
                </li>
                <li>
                  {e.hints ? '✓' : '○'} {t(e.hints ? 'difficultyPicker.hintsOn' : 'difficultyPicker.hintsOff')}
                </li>
              </ul>
            </button>
          )
        })}
      </div>
    </section>
  )
}
