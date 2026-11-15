// Typed entry point for the data catalog. Edit the JSON files, not this one.
import type {
  BusClass,
  Component,
  GameData,
  GroundNetwork,
  Instrument,
  LaunchFailureMode,
  Launcher,
  MissionEvent,
  Orbit,
  Scenario,
  WavelengthRule,
} from '../engine/types'
import busClasses from './busClasses.json'
import components from './components.json'
import escalationEvents from './escalationEvents.json'
import events from './events.json'
import failureEvents from './failureEvents.json'
import groundNetworks from './groundNetworks.json'
import instruments from './instruments.json'
import launchFailures from './launchFailures.json'
import launchers from './launchers.json'
import orbits from './orbits.json'
import scenarios from './scenarios.json'
import wavelengthRules from './wavelengthRules.json'

export const gameData: GameData = {
  busClasses: busClasses as BusClass[],
  components: components as Component[],
  instruments: instruments as Instrument[],
  orbits: orbits as Orbit[],
  launchers: launchers as Launcher[],
  groundNetworks: groundNetworks as GroundNetwork[],
  scenarios: scenarios as Scenario[],
  // FR-7.4 random events, FR-3.5 failure alarms, then the FR-13.4 events that only appear when an alarm is ignored
  events: [...(events as MissionEvent[]), ...(failureEvents as MissionEvent[]), ...(escalationEvents as MissionEvent[])],
  wavelengthRules: wavelengthRules as WavelengthRule[],
  launchFailures: launchFailures as LaunchFailureMode[],
}