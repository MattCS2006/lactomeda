// The debrief (phase 'debrief'): score out of 1000 with its 5 parts, stars and outcome, what happened, the top 3
// reasons (went well / went wrong / try this) and, after a failed launch, its cause and lesson. Then "Fly again".
// Body text uses the readable font; the pixel font stays on the headings.
import { useTranslation } from 'react-i18next'
import { translateLabel } from '../scenarios/scenarioView'
import { FlyAgain } from './FlyAgain'
import { useDebriefStore } from './debriefStore'
import { POINT_ICON, launchFailure, scoreRows, topPoints } from './debriefView'
import { useFlightStore } from './flightStore'
import { resultLabel, starsIcon } from './resultView'
import type { GameData } from '../../engine/types'

const POINT_LOOK = {
  good: 'border-ok text-ok',
  bad: 'border-alarm text-alarm',
  tip: 'border-warning text-warning',
} as const

export function MissionOver({ data }: { data: GameData }) {
  const { t } = useTranslation()
  const result = useFlightStore((s) => s.lastFlight?.result ?? null)
  const design = useFlightStore((s) => s.lastFlight?.design ?? null)
  const debrief = useDebriefStore((s) => s.debrief)
  const failure = debrief ? launchFailure(design, data, debrief.score) : null

  return (
    <section aria-labelledby="mission-over" className="pixel-panel mx-auto max-w-3xl p-6 font-sans text-sm">
      <h2 id="mission-over" className="text-center text-sm text-shine">
        {t('flight.missionOver')}
      </h2>

      {result && (
        <p className="mt-4 text-center">
          <span aria-hidden="true" className="text-base text-warning">
            {starsIcon(result.stars)}{' '}
          </span>
          {translateLabel(t, resultLabel(result))}
        </p>
      )}

      {debrief && (
        <>
          <p className="mt-4 text-center text-base leading-relaxed">{debrief.explanation.summary}</p>

          <h3 className="mt-6 text-xs text-shine">{t('demoFixes.debrief.scoreHeading')}</h3>
          <ul className="mt-3 space-y-2">
            {scoreRows(debrief.score).map((row) => (
              <li key={row.part}>
                <div className="flex justify-between gap-3">
                  <span>{t(`demoFixes.debrief.part.${row.part}`)}</span>
                  <span className="tabular-nums">{t('demoFixes.debrief.points', { points: row.points, max: row.max })}</span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={row.max}
                  aria-valuenow={row.points}
                  aria-label={t(`demoFixes.debrief.part.${row.part}`)}
                  className="mt-1 h-2 border border-metal-light bg-outline"
                >
                  <div className="h-full bg-ok" style={{ width: `${Math.round(row.fraction * 100)}%` }} />
                </div>
              </li>
            ))}
          </ul>

          {failure && (
            <div className="mt-6 border-2 border-alarm p-3">
              <h3 className="text-xs text-alarm">{t('demoFixes.debrief.launchHeading')}</h3>
              {failure.cause && (
                <p className="mt-2 leading-relaxed">
                  <span className="text-metal-light">{t('demoFixes.debrief.cause')} </span>
                  {failure.cause}
                </p>
              )}
              {failure.lessons[0] && (
                <p className="mt-2 leading-relaxed">
                  <span className="text-metal-light">{t('demoFixes.debrief.lesson')} </span>
                  {failure.lessons[0]}
                </p>
              )}
            </div>
          )}

          <h3 className="mt-6 text-xs text-shine">{t('demoFixes.debrief.pointsHeading')}</h3>
          <ul className="mt-3 space-y-3">
            {topPoints(debrief.explanation).map((point, i) => (
              <li key={i} className={`flex gap-3 border-l-4 pl-3 leading-relaxed ${POINT_LOOK[point.kind]}`}>
                <span aria-hidden="true">{POINT_ICON[point.kind]}</span>
                <span className="text-white">
                  <span className="sr-only">{t(`demoFixes.debrief.kind.${point.kind}`)}: </span>
                  {point.text}
                  {point.value !== undefined && point.unit && (
                    <span className="ml-2 tabular-nums text-metal-light">
                      ({point.value} {point.unit})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-6 text-center">
        <FlyAgain data={data} />
      </div>
    </section>
  )
}
