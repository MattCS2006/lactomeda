// "What is this?" tooltip (FR-1.3): a small "?" next to a resource, part, instrument, orbit,
// launcher or ground network. The plain-language text (≤ 40 words) shows on hover of the card
// it sits in, and is also inside the card as screen-reader text, so it is read on keyboard focus.
// Cards are buttons, so this adds no extra button inside them.
import { useTranslation } from 'react-i18next'
import { tooltipKey } from './tooltips'

export function InfoTip({ id }: { id: string }) {
  const { t } = useTranslation()
  const text = t(tooltipKey(id))
  return (
    <span className="group/tip relative ml-2 inline-block align-middle normal-case">
      <span
        aria-hidden
        title={text}
        className="inline-flex h-5 w-5 cursor-help items-center justify-center border border-shine text-[10px] leading-none text-shine"
      >
        ?
      </span>
      <span
        aria-hidden
        className="pixel-panel pointer-events-none absolute left-0 top-6 z-30 hidden w-64 p-2 text-left text-[10px] leading-relaxed tracking-normal group-hover/tip:block"
      >
        {text}
      </span>
      <span className="sr-only">
        {t('tooltip.label')}: {text}
      </span>
    </span>
  )
}
