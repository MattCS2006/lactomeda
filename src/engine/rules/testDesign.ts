// Shared fixture for the engine rule tests: a valid 3U CubeSat design in LEO.
import type { MissionDesign } from '../types'

export const cubesatDesign = (over: Partial<MissionDesign> = {}): MissionDesign => ({
  scenarioId: 'student-cubesat', difficulty: 'cadet', requirementLevels: {}, busClassId: 'cubesat-3u',
  componentIds: {
    structure: 'str-3u', power: 'pwr-body', battery: 'bat-40', computer: 'obc-cubesat',
    attitude: 'adcs-cubesat', propulsion: 'prop-none', thermal: 'thm-passive', comms: 'com-uhf',
  },
  redundant: [], propellantKg: 0, instrumentIds: [], dutyCycle: {},
  orbitId: 'leo', launcherId: 'lv-csli', groundNetworkId: 'gn-university', seed: 'x', ...over,
})
