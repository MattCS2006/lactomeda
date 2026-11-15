import { useState } from 'react'
import '@fontsource/press-start-2p' // pixel font for titles and HUD (docs/ART.md §7, SIL OFL)
import { useTranslation } from 'react-i18next'
import { gameData } from './data'
import './i18n'
import { OrbitStep } from './ui/orbit/OrbitStep'
import { BusStep } from './ui/bus/BusStep'
import { Landing } from './ui/landing/Landing'
import { MaturityMeter } from './ui/maturity/MaturityMeter'
import { SegmentTabs } from './ui/segments/SegmentTabs'
import { PayloadStep } from './ui/payload/PayloadStep'
import { RequirementsStep } from './ui/requirements/RequirementsStep'
import { ResourceBar } from './ui/resources/ResourceBar'
import { ScenarioPicker } from './ui/scenarios/ScenarioPicker'
import { useMissionStore } from './ui/store/missionStore'
import { ChangesSinceFlight } from './ui/flight/ChangesSinceFlight'
import { MissionOver } from './ui/flight/MissionOver'
import { useFlightStore } from './ui/flight/flightStore'
import { useFlightRecorder } from './ui/flight/useFlightRecorder'
import { stopMission } from './game/missionController'
import { NasaSources } from './ui/sources/NasaSources'
import { FlightView } from './ui/launch/FlightView'
import { LaunchStep } from './ui/launch/LaunchStep'
import { TeamBanner } from './ui/rooms/TeamBanner'
import { LaunchOverlay } from './ui/launch/LaunchOverlay'

export default function App() {
  const { t } = useTranslation()
  const step = useMissionStore((s) => s.step)
  const design = useMissionStore((s) => s.design)
  const screen = useMissionStore((s) => s.screen)
  const openLanding = useMissionStore((s) => s.openLanding)
  const scenario = gameData.scenarios.find((s) => s.id === design?.scenarioId)
  const phase = useFlightStore((s) => s.phase)
  const flying = phase === 'launch' || phase === 'flight'
  const [sources, setSources] = useState(false)
  // FR-10.6 — keeps a copy of each design that flies, for "Fly again"
  useFlightRecorder()

  // FR-1.1 — the game opens on the landing menu
  if (screen === 'landing') {
    return (
      <main className="min-h-screen bg-outline p-6 text-xs leading-relaxed text-white">
        <Landing data={gameData} />
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-outline p-6 text-xs leading-relaxed text-white">
      <header className="relative mb-6 text-center">
        <button
          type="button"
          onClick={() => {
            // Leaving to the menu ends any mission in progress
            if (phase !== 'design') {
              stopMission()
              useFlightStore.getState().setPhase('design')
            }
            openLanding()
          }}
          className="pixel-button absolute left-0 top-0 px-3 py-2 text-[10px]"
        >
          ◀ {t('landing.menu')}
        </button>
        {/* FR-14.1 — NASA Sources, reachable from every design screen */}
        <button
          type="button"
          onClick={() => setSources(true)}
          className="pixel-button absolute right-0 top-0 px-3 py-2 text-[10px]"
        >
          {t('sources.button')}
        </button>
        <h1 className="text-lg sm:text-xl">{t('app.title')}</h1>
        <p className="mt-2 text-[10px] text-metal-light">{t('app.tagline')}</p>
      </header>

      {/* FR-8.2 — team room and this player's roles */}
      <TeamBanner />
      {/* Design screens only: the flight has its own controls */}
      {!flying && (
        <>
          {/* FR-6.1 — visible on every design screen once a scenario is chosen */}
          <ResourceBar data={gameData} />
          {/* FR-14.3 — JPL Concept Maturity Levels */}
          <MaturityMeter data={gameData} />
          {/* FR-14.5 — the four NASA mission segments organise the navigation */}
          <SegmentTabs />
          {/* FR-10.6 — what changed since the last flight */}
          {phase !== 'debrief' && <ChangesSinceFlight data={gameData} />}
        </>
      )}

      {flying ? (
        <FlightView data={gameData} />
      ) : phase === 'debrief' ? (
        <MissionOver data={gameData} />
      ) : step === 'brief' || !scenario ? (
        <ScenarioPicker data={gameData} />
      ) : step === 'requirements' ? (
        <RequirementsStep data={gameData} />
      ) : step === 'bus' ? (
        <BusStep data={gameData} />
      ) : step === 'payload' ? (
        <PayloadStep data={gameData} />
      ) : step === 'orbit' ? (
        <OrbitStep data={gameData} />
      ) : (
        // Phase 6 · Design Review · CML 4 (FR-6.9, FR-14.4): review the design and launch
        <LaunchStep data={gameData} />
      )}
      {sources && <NasaSources onClose={() => setSources(false)} />}
      {/* FR-9.3 — launch animation, above everything (it also covers a failed launch's debrief until it ends) */}
      <LaunchOverlay data={gameData} />
    </main>
  )
}
