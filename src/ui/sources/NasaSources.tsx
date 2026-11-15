// "NASA Sources" dialog (FR-14.1): the nine challenge resources, how the game uses each one,
// where players see it, and a link to the original. Opened from the landing menu and the header.
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { NASA_SOURCES, sourceKeys } from './sourcesView'

export function NasaSources({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-outline/80 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sources-heading"
        aria-describedby="sources-intro"
        className="pixel-panel flex max-h-full w-full max-w-4xl flex-col p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="sources-heading" className="text-base">
            {t('sources.heading')}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="pixel-button shrink-0 px-3 py-2 text-[10px]"
          >
            {t('sources.close')}
          </button>
        </div>
        <p id="sources-intro" className="mt-3 text-[10px] leading-relaxed text-metal-light">
          {t('sources.intro', { count: NASA_SOURCES.length })}
        </p>

        <ol className="mt-4 grid gap-3 overflow-y-auto pr-1 md:grid-cols-2">
          {NASA_SOURCES.map((source, i) => {
            const keys = sourceKeys(source.id)
            return (
              <li key={source.id} className="flex flex-col gap-2 border-2 border-metal bg-outline/40 p-3 text-[10px]">
                <p className="flex items-start justify-between gap-2">
                  <span className="text-xs text-shine">
                    {i + 1}. {t(keys.name)}
                  </span>
                  <span className="shrink-0 border border-info px-1 text-info">{source.agency}</span>
                </p>
                <p className="leading-relaxed">
                  <span className="uppercase text-metal-light">{t('sources.use')}: </span>
                  {t(keys.use)}
                </p>
                <p className="leading-relaxed">
                  <span className="uppercase text-metal-light">{t('sources.where')}: </span>
                  {t(keys.where)} <span className="text-metal-light">({source.req})</span>
                </p>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto break-all text-info underline hover:text-shine focus-visible:outline-2 focus-visible:outline-shine"
                >
                  {t('sources.open')}
                  <span className="sr-only"> {t('sources.newTab')}</span>
                </a>
              </li>
            )
          })}
        </ol>

        <p className="mt-4 text-[10px] leading-relaxed text-metal-light">{t('sources.alsoFromNasa')}</p>
      </div>
    </div>
  )
}
