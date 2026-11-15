// One explicit reference design per scenario, built only from catalog ids. Shared by the data and engine tests:
// each must leave every one of the 6 resources out of the red (FR-6.1), so the scenario is provably winnable.
import type { MissionDesign } from '../engine/types'

const reference = (d: Partial<MissionDesign> & Pick<MissionDesign, 'scenarioId' | 'busClassId' | 'componentIds' | 'instrumentIds' | 'orbitId' | 'launcherId' | 'groundNetworkId'>): MissionDesign => ({
  difficulty: 'cadet', requirementLevels: {}, redundant: [], propellantKg: 0, dutyCycle: {}, seed: 'reference', ...d,
})
export const REFERENCE_DESIGNS: MissionDesign[] = [
  // Student CubeSat: 3U bus, camera + CubeSat magnetometer, SSO via the 3U deployer, university ground station.
  reference({
    scenarioId: 'student-cubesat', busClassId: 'cubesat-3u',
    componentIds: { structure: 'str-3u', power: 'pwr-deploy', battery: 'bat-40', computer: 'obc-cubesat', attitude: 'adcs-mag', propulsion: 'prop-none', thermal: 'thm-passive', comms: 'com-sband' },
    instrumentIds: ['inst-visible-cam', 'inst-magnetometer-cubesat'],
    orbitId: 'sso', launcherId: 'lv-cubesat', groundNetworkId: 'gn-university',
  }),
  // Wildfire EO: SmallSat in SSO with a wide-swath thermal IR camera (VIIRS-like, finds fires ~daily)
  // and a multispectral imager (Landsat-like, maps burn scars at ~30 m), SSO rideshare.
  reference({
    scenarioId: 'wildfire-eo', busClassId: 'smallsat',
    componentIds: { structure: 'str-smallsat', power: 'pwr-array-small', battery: 'bat-1k', computer: 'obc-radtol', attitude: 'adcs-smallsat', propulsion: 'prop-none', thermal: 'thm-heaters', comms: 'com-xband' },
    instrumentIds: ['inst-multispectral', 'inst-thermal-ir'],
    orbitId: 'sso', launcherId: 'lv-rideshare', groundNetworkId: 'gn-university',
  }),
  // Space Telescope: Large bus at L2, space telescope (deepSky + exoplanetSpectra), cryo thermal, deep-space antenna, NASA Near Space Network (reaches L2).
  reference({
    scenarioId: 'space-telescope', difficulty: 'engineer', busClassId: 'large',
    componentIds: { structure: 'str-large', power: 'pwr-array-large', battery: 'bat-10k', computer: 'obc-radhard', attitude: 'adcs-fine', propulsion: 'prop-mono', thermal: 'thm-cryo', comms: 'com-hga' },
    instrumentIds: ['inst-telescope'], propellantKg: 90, // 83.6 kg pays the 60 m/s insertion and 4 m/s per year of station-keeping over 5 years, with a small reserve
    orbitId: 'l2', launcherId: 'lv-medium', groundNetworkId: 'gn-nen',
  }),
]
