import { useEffect, useState } from 'react'
import '@fontsource/press-start-2p' // pixel font for titles and HUD (docs/ART.md §7, SIL OFL)
import { useTranslation } from 'react-i18next'
import { gameData } from './data'
import { PhaserGame } from './game/PhaserGame'
import { bridge } from './game/bridge'
import './i18n'
import { OrbitStep } from './ui/orbit/OrbitStep'
import { MaturityMeter } from './ui/maturity/MaturityMeter'
import { SegmentTabs } from './ui/segments/SegmentTabs'
import { PayloadStep } from './ui/payload/PayloadStep'
import { RequirementsStep } from './ui/requirements/RequirementsStep'
import { ResourceBar } from './ui/resources/ResourceBar'
import { ScenarioPicker } from './ui/scenarios/ScenarioPicker'
import { useMissionStore } from './ui/store/missionStore'

export default function App() {
  const { t } = useTranslation()
  const step = useMissionStore((s) => s.step)
  const design = useMissionStore((s) => s.design)
  const goTo = useMissionStore((s) => s.goTo)
  const scenario = gameData.scenarios.find((s) => s.id === design?.scenarioId)

  return (
    <main className="min-h-screen bg-outline p-6 font-pixel text-xs leading-relaxed text-white">
      <header className="mb-6 text-center">
        <h1 className="text-lg sm:text-xl">{t('app.title')}</h1>
        <p className="mt-2 text-[10px] text-metal-light">{t('app.tagline')}</p>
      </header>

      {/* FR-6.1 — visible on every design screen once a scenario is chosen */}
      <ResourceBar data={gameData} />
      {/* FR-14.3 — JPL Concept Maturity Levels */}
      <MaturityMeter data={gameData} />
      {/* FR-14.5 — the four NASA mission segments organise the navigation */}
      <SegmentTabs />

      {step === 'brief' || !scenario ? (
        <ScenarioPicker data={gameData} />
      ) : step === 'requirements' ? (
        <RequirementsStep data={gameData} />
      ) : step === 'payload' ? (
        <PayloadStep data={gameData} />
      ) : step === 'orbit' ? (
        <OrbitStep data={gameData} />
      ) : (
        <>
          <div className="mx-auto mb-4 flex max-w-4xl items-center justify-between">
            <p className="text-xs">{t('scenario.current', { name: scenario.name })}</p>
            <button type="button" onClick={() => goTo('brief')} className="pixel-button px-3 py-2 text-[10px]">
              ◀ {t('scenario.change')}
            </button>
          </div>
          {/* Placeholder until the design screens land: keeps the ship preview from SCRUM-27 */}
          <ShipPlaceholder />
        </>
      )}
    </main>
  )
}

function ShipPlaceholder() {
  const { t } = useTranslation()
  const [lastStation, setLastStation] = useState<string | null>(null)
  useEffect(() => bridge.on('stationInteract', ({ station }) => setLastStation(station)), [])
  return (
    <>
      <p className="mb-4 text-center text-[10px] text-metal-light">{t('placeholder.hint')}</p>
      <PhaserGame />
      <p className="mt-4 text-center">
        {lastStation ? t('placeholder.station', { station: lastStation }) : t('placeholder.noStation')}
      </p>
    </>
  )
}
