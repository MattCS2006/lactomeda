// One explicit reference design per scenario, built only from catalog ids. Shared by the data and engine tests:
// each must leave every one of the 6 resources out of the red (FR-6.1), so the scenario is provably winnable.
import type { MissionDesign } from '../engine/types'
import { presets } from './index'

const reference = (d: Partial<MissionDesign> & Pick<MissionDesign, 'scenarioId' | 'busClassId' | 'componentIds' | 'instrumentIds' | 'orbitId' | 'launcherId' | 'groundNetworkId'>): MissionDesign => ({
  difficulty: 'cadet', requirementLevels: {}, redundant: [], propellantKg: 0, dutyCycle: {}, seed: 'reference', ...d,
})
// The two Cadet references are the starter spacecraft (presets.json) themselves, so the presets and the engine
// tests can never drift apart. The telescope reference stays an Engineer design that uses advanced parts
// (fine pointing, cryocooler), so the engine tests keep covering them; its Cadet preset swaps those out.
const preset = (scenarioId: string): MissionDesign => {
  const p = presets.find((d) => d.scenarioId === scenarioId)
  if (!p) throw new Error(`No preset for ${scenarioId}`)
  return reference(p)
}
export const REFERENCE_DESIGNS: MissionDesign[] = [
  // Student CubeSat: 3U bus, camera + CubeSat magnetometer, SSO via the 3U deployer, university ground station.
  preset('student-cubesat'),
  // Wildfire EO: SmallSat in SSO with a wide-swath thermal IR camera (VIIRS-like, finds fires ~daily)
  // and a multispectral imager (Landsat-like, maps burn scars at ~30 m), SSO rideshare.
  preset('wildfire-eo'),
  // Space Telescope: Large bus at L2, space telescope (deepSky + exoplanetSpectra), cryo thermal, deep-space antenna, NASA Near Space Network (reaches L2).
  reference({
    scenarioId: 'space-telescope', difficulty: 'engineer', busClassId: 'large',
    componentIds: { structure: 'str-large', power: 'pwr-array-large', battery: 'bat-10k', computer: 'obc-radhard', attitude: 'adcs-fine', propulsion: 'prop-mono', thermal: 'thm-cryo', comms: 'com-hga' },
    instrumentIds: ['inst-telescope'], propellantKg: 90, // 83.6 kg pays the 60 m/s insertion and 4 m/s per year of station-keeping over 5 years, with a small reserve
    orbitId: 'l2', launcherId: 'lv-medium', groundNetworkId: 'gn-nen',
  }),
]
