// "NASA Sources" (FR-14.1): every resource from the challenge's Resources tab (ERS §9), with its link
// and where the game uses it. Texts live in en.json under sources.items.<id>. Pure, unit-tested.

export type SourceId =
  | 'scienceMissions'
  | 'gmat'
  | 'cml'
  | 'mdl'
  | 'missionViz'
  | 'telescopeGame'
  | 'cubesat101'
  | 'vrChallenge'
  | 'csaGames'

export interface NasaSource {
  id: SourceId
  /** Who publishes it (shown as a tag). */
  agency: 'NASA' | 'NASA GSFC' | 'NASA JPL' | 'NASA Space Apps' | 'CSA'
  url: string
  /** Requirement that puts it in the game (ERS §9). */
  req: string
}

/** The nine resources of ERS §9, in the order of that table. */
export const NASA_SOURCES: readonly NasaSource[] = [
  { id: 'scienceMissions', agency: 'NASA', url: 'https://ntrs.nasa.gov/citations/20250002492', req: 'FR-14.5' },
  {
    id: 'gmat',
    agency: 'NASA GSFC',
    url: 'https://etd.gsfc.nasa.gov/capabilities/capabilities-listing/general-mission-analysis-tool-gmat/',
    req: 'FR-14.2',
  },
  { id: 'cml', agency: 'NASA JPL', url: 'https://ntrs.nasa.gov/citations/20150007816', req: 'FR-14.3' },
  {
    id: 'mdl',
    agency: 'NASA GSFC',
    url: 'https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab',
    req: 'FR-14.4',
  },
  { id: 'missionViz', agency: 'NASA', url: 'https://nasa.github.io/mission-viz/', req: 'FR-14.7' },
  {
    id: 'telescopeGame',
    agency: 'NASA',
    url: 'https://science.nasa.gov/mission/webb/game-build-it-yourself/',
    req: 'FR-14.8',
  },
  {
    id: 'cubesat101',
    agency: 'NASA',
    url: 'https://www.nasa.gov/wp-content/uploads/2017/03/nasa_csli_cubesat_101_508.pdf',
    req: 'FR-14.6',
  },
  {
    id: 'vrChallenge',
    agency: 'NASA Space Apps',
    url: 'https://www.spaceappschallenge.org/2023/challenges/visualize-a-space-mission-using-virtual-reality/',
    req: 'FR-13.11',
  },
  {
    id: 'csaGames',
    agency: 'CSA',
    url: 'https://www.asc-csa.gc.ca/eng/youth-educators/digital-games-and-activities.asp',
    req: 'FR-1.3',
  },
]

/** Translation keys of one source's texts. */
export function sourceKeys(id: SourceId) {
  const base = `sources.items.${id}`
  return { name: `${base}.name`, use: `${base}.use`, where: `${base}.where` } as const
}
