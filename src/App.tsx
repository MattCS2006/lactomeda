import { useEffect, useState } from 'react'
import '@fontsource/press-start-2p' // pixel font for titles and HUD (docs/ART.md §7, SIL OFL)
import { useTranslation } from 'react-i18next'
import { gameData } from './data'
import { PhaserGame } from './game/PhaserGame'
import { bridge } from './game/bridge'
import './i18n'
import { PayloadStep } from './ui/payload/PayloadStep'
import { RequirementsStep } from './ui/requirements/RequirementsStep'
import { ScenarioPicker } from './ui/scenarios/ScenarioPicker'
import { useMissionStore } from './ui/store/missionStore'

export default function App() {
  const { t } = useTranslation()
  const step = useMissionStore((s) => s.step)
  const design = useMissionStore((s) => s.design)
  const goTo = useMissionStore((s) => s.goTo)
  const scenario = gameData.scenarios.find((s) => s.id === design?.scenarioId)

  return (
    <main className="min-h-screen bg-[#1a1c2c] p-6 font-['Press_Start_2P'] text-[11px] leading-relaxed text-[#f4f4f4]">
      <header className="mb-6 text-center">
        <h1 className="text-lg sm:text-xl">{t('app.title')}</h1>
        <p className="mt-2 text-[10px] text-[#94b0c2]">{t('app.tagline')}</p>
      </header>

      {step === 'brief' || !scenario ? (
        <ScenarioPicker data={gameData} />
      ) : step === 'requirements' ? (
        <RequirementsStep data={gameData} />
      ) : step === 'payload' ? (
        <PayloadStep data={gameData} />
      ) : (
        <>
          <div className="mx-auto mb-4 flex max-w-4xl items-center justify-between">
            <p className="text-xs">{t('scenario.current', { name: scenario.name })}</p>
            <button
              type="button"
              onClick={() => goTo('brief')}
              className="border-2 border-[#94b0c2] bg-[#333c57] px-3 py-2 text-[10px] hover:bg-[#566c86]"
            >
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
      <p className="mb-4 text-center text-[10px] text-[#94b0c2]">{t('placeholder.hint')}</p>
      <PhaserGame />
      <p className="mt-4 text-center">
        {lastStation ? t('placeholder.station', { station: lastStation }) : t('placeholder.noStation')}
      </p>
    </>
  )
}
