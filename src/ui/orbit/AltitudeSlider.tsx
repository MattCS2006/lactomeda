// Altitude slider for LEO/SSO (FR-5.3), shown under the orbit cards when a LEO or SSO orbit is
// chosen. Every value comes from the engine; arrows compare with the orbit's normal altitude.
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { GameData } from '../../engine/types'
import { formatNumber } from '../payload/payloadView'
import { useMissionStore } from '../store/missionStore'
import { InfoTip } from '../tooltip/InfoTip'
import { altitudeEffects, altitudeRange, daysLabel } from './altitudeView'

interface Props {
  data: GameData
}

export function AltitudeSlider({ data }: Props) {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const setAltitude = useMissionStore((s) => s.setAltitude)
  const orbit = data.orbits.find((o) => o.id === design?.orbitId)
  const range = altitudeRange(orbit)
  const fx = useMemo(() => (design && range ? altitudeEffects(design, data) : null), [design, data, range])
  if (!design || !orbit || !range || !fx) return null

  const days = (n: number | null) => {
    const l = daysLabel(n ?? Infinity)
    return t(l.key, l.values ?? {})
  }
  const changed = fx.altitudeKm !== fx.nominalKm

  return (
    <section aria-labelledby="altitude-heading" className="pixel-panel mt-8 p-4">
      <h3 id="altitude-heading" className="text-xs">
        {t('altitude.heading')} · {orbit.name}
      </h3>
      <p className="mt-2 max-w-3xl text-[10px] text-metal-light">{t('altitude.intro')}</p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label htmlFor="altitude-input" className="text-[10px] uppercase text-metal-light">
          {t('altitude.label')}
        </label>
        <span className="text-[10px] text-metal-light">{t('altitude.value', { value: range.min })}</span>
        <input
          id="altitude-input"
          type="range"
          min={range.min}
          max={range.max}
          step={range.step}
          value={fx.altitudeKm}
          aria-valuetext={t('altitude.value', { value: fx.altitudeKm })}
          onChange={(e) => setAltitude(Number(e.target.value), data)}
          className="min-w-48 flex-1 accent-shine"
        />
        <span className="text-[10px] text-metal-light">{t('altitude.value', { value: range.max })}</span>
        <output htmlFor="altitude-input" className="text-xs text-shine">
          {t('altitude.value', { value: fx.altitudeKm })}
        </output>
        {changed && (
          <button
            type="button"
            onClick={() => setAltitude(fx.nominalKm, data)}
            className="pixel-button px-3 py-2 text-[10px]"
          >
            {t('altitude.reset', { value: fx.nominalKm })}
          </button>
        )}
      </div>

      <dl aria-live="polite" className="mt-4 grid gap-4 text-[10px] sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="uppercase text-metal-light">{t('altitude.period')}</dt>
          <dd>{t('orbit.units.min', { value: formatNumber(Math.round(fx.periodMin * 10) / 10) })}</dd>
        </div>
        <div>
          <dt className="uppercase text-metal-light">{t('altitude.resolution')}</dt>
          {fx.resolutions.length === 0 ? (
            <dd className="text-metal-light">{t('altitude.noImager')}</dd>
          ) : (
            fx.resolutions.map((r) => (
              <dd key={r.id}>
                {t('altitude.resolutionValue', { name: r.name, value: formatNumber(Math.round(r.metres * 10) / 10) })}
                {changed && (
                  <span className={`block ${r.metres < r.nominalMetres ? 'text-ok' : 'text-warning'}`}>
                    {t(r.metres < r.nominalMetres ? 'altitude.sharper' : 'altitude.blurrier', { value: fx.nominalKm })}
                  </span>
                )}
              </dd>
            ))
          )}
        </div>
        <div>
          <dt className="uppercase text-metal-light">{t('altitude.decay')}</dt>
          <dd>
            {days(fx.decayDays)}
            {changed && fx.decayDays !== null && fx.nominalDecayDays !== null && (
              <span className={`block ${fx.decayDays < fx.nominalDecayDays ? 'text-warning' : 'text-ok'}`}>
                {t(fx.decayDays < fx.nominalDecayDays ? 'altitude.sooner' : 'altitude.later', { value: fx.nominalKm })}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="uppercase text-metal-light">
            {t('altitude.lifetime')}
            <InfoTip id="time" />
          </dt>
          <dd>
            {days(fx.lifetimeDays)}
            <span className="block text-metal-light">{t(`altitude.limitedBy.${fx.limitedBy}`)}</span>
          </dd>
        </div>
      </dl>
    </section>
  )
}
