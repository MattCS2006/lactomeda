// Typed entry point for the data catalog. Edit the JSON files, not this one.
import type {
  BusClass,
  Component,
  GameData,
  GroundNetwork,
  Instrument,
  Launcher,
  Orbit,
  Scenario,
} from '../engine/types'
import busClasses from './busClasses.json'
import components from './components.json'
import groundNetworks from './groundNetworks.json'
import instruments from './instruments.json'
import launchers from './launchers.json'
import orbits from './orbits.json'
import scenarios from './scenarios.json'

export const gameData: GameData = {
  busClasses: busClasses as BusClass[],
  components: components as Component[],
  instruments: instruments as Instrument[],
  orbits: orbits as Orbit[],
  launchers: launchers as Launcher[],
  groundNetworks: groundNetworks as GroundNetwork[],
  scenarios: scenarios as Scenario[],
  events: [], // filled by the events task
}