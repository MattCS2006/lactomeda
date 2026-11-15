// Mission segment tabs (FR-14.5): Launch, Space, Ground, User organise the design navigation.
// Each tab shows whether its segment is done (icon + text) and jumps to its screen/section.
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMissionStore } from '../store/missionStore'
import { SEGMENTS, SEGMENT_TARGET, segmentDone, segmentOfStep, type Segment } from './segments'

export function SegmentTabs() {
  const { t } = useTranslation()
  const design = useMissionStore((s) => s.design)
  const step = useMissionStore((s) => s.step)
  const furthest = useMissionStore((s) => s.furthest)
  const goTo = useMissionStore((s) => s.goTo)
  // Launch and Ground share the Phase 5 screen with the orbit: remember which tab was used
  const [picked, setPicked] = useState<Segment | null>(null)
  if (!design) return null

  const active = picked && SEGMENT_TARGET[picked].step === step ? picked : segmentOfStep(step)

  const open = (segment: Segment) => {
    const target = SEGMENT_TARGET[segment]
    setPicked(segment)
    goTo(target.step)
    // Wait for the screen to render, then scroll to the segment's section (or the top)
    requestAnimationFrame(() => {
      const el = target.anchor ? document.getElementById(target.anchor) : null
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      else window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  return (
    <nav aria-label={t('segments.heading')} title={t('segments.help')} className="mx-auto mb-6 max-w-6xl">
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SEGMENTS.map((segment) => {
          const done = segmentDone(segment, design, furthest)
          const isActive = segment === active
          return (
            <li key={segment}>
              <button
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => open(segment)}
                className={`pixel-button flex w-full items-center justify-between gap-2 px-3 py-2 text-[10px] ${
                  isActive ? 'border-shine! bg-screen!' : ''
                }`}
              >
                <span>{t(`segments.name.${segment}`)}</span>
                <span className={done ? 'text-ok' : 'text-metal-light'}>
                  {done ? `✓ ${t('segments.tabDone')}` : `○ ${t('segments.tabTodo')}`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
