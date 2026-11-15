// Start-screen language switch: English / Español. The choice is remembered (src/i18n/language.ts).
import { useTranslation } from 'react-i18next'
import { setLanguage } from '../../i18n'
import { LANGUAGES, isLanguage } from '../../i18n/language'

export function LanguageSelector() {
  const { t, i18n } = useTranslation()
  const current = isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en'

  return (
    <div role="group" aria-label={t('languageSelector.label')} className="absolute top-0 right-0 z-20 flex items-center gap-2">
      <span className="text-[10px] text-metal-light">{t('languageSelector.label')}</span>
      {LANGUAGES.map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          aria-pressed={current === lang}
          onClick={() => void setLanguage(lang)}
          className={`pixel-button px-2 py-1 text-[10px] ${current === lang ? 'border-shine! bg-screen!' : ''}`}
        >
          {t(`languageSelector.${lang}`)}
        </button>
      ))}
    </div>
  )
}
