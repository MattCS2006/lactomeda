// FR-10.3 end-of-mission explanation: why the mission worked or failed, in plain language for 13-17 year olds.
// Pure and deterministic: built only from the design, the final state and the catalog. Nothing is mutated.
// Text is English (the engine's fallback); numbers go in `value` / `unit` so the UI can show them too.
//
// Points are sorted by importance, so the first three are what the debrief shows:
//   a mission with a problem: the biggest problem (bad), one tip for it, then what went well (good), then the rest;
//   a clean mission: what went well first.
import { TASK_LOG_DONE } from '../constants'
import type { Explanation, ExplanationPoint, GameData, MissionDesign, ResourceKey, SimState, Subsystem } from '../types'
import { dataBudget } from './data'
import { launchOutcome } from './launchOutcome'
import { evaluateObjectives } from './objectives'
import { RESOURCE_KEYS, estimateBudgets } from './resources'
import { score } from './score'

interface Problem {
  weight: number // importance, higher first
  bad: ExplanationPoint
  tip: ExplanationPoint
}

const round1 = (n: number): number => Math.round(n * 10) / 10
const num = (n: number): string => String(round1(n))

const RESOURCE_NAME: Record<ResourceKey, string> = {
  mass: 'weight',
  power: 'power',
  budget: 'money',
  data: 'data',
  comms: 'radio time',
  time: 'mission time',
}
const RESOURCE_TIP: Record<ResourceKey, string> = {
  mass: 'Pick lighter parts or fewer instruments, or a bigger bus.',
  power: 'Add bigger solar panels or a bigger battery, or use fewer power-hungry instruments.',
  budget: 'Pick cheaper parts, a cheaper rocket or a cheaper ground network.',
  data: 'Pick a faster radio or a bigger computer, so less data is lost.',
  comms: 'Pick a ground network with more contact time, or an orbit it can see more often.',
  time: 'Pick more reliable parts, add a backup, or carry more fuel.',
}
const SUBSYSTEM_NAME: Record<Subsystem, string> = {
  structure: 'structure',
  power: 'power system',
  battery: 'battery',
  computer: 'computer',
  attitude: 'pointing system',
  propulsion: 'engine',
  thermal: 'heat control',
  comms: 'radio',
}

function lostSubsystem(state: SimState): Subsystem | undefined {
  const entry = [...state.log].reverse().find((l) => l.kind === 'failure' && l.text.startsWith('Critical failure'))
  const match = entry?.text.match(/the (\w+) subsystem/)
  return match ? (match[1] as Subsystem) : undefined
}

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1)

export function explain(design: MissionDesign, state: SimState | null, data: GameData): Explanation {
  const scenario = data.scenarios.find((s) => s.id === design.scenarioId)
  const budgets = estimateBudgets(design, data)
  const problems: Problem[] = []
  const goods: { weight: number; point: ExplanationPoint }[] = []

  const problem = (weight: number, bad: Omit<ExplanationPoint, 'kind'>, tip: Omit<ExplanationPoint, 'kind'>): void => {
    problems.push({ weight, bad: { kind: 'bad', ...bad }, tip: { kind: 'tip', ...tip } })
  }
  const good = (weight: number, point: Omit<ExplanationPoint, 'kind'>): void => {
    goods.push({ weight, point: { kind: 'good', ...point } })
  }

  // ── How it ended ─────────────────────────────────────────────────────
  const launcher = data.launchers.find((l) => l.id === design.launcherId)
  if (state?.endReason === 'launchFailure') {
    const outcome = launchOutcome(design, data)
    const cause = outcome?.cause ?? (launcher ? `The ${launcher.name} did not reach orbit.` : 'No rocket was chosen.')
    const chance = launcher ? round1((1 - launcher.reliability) * 100) : undefined
    problem(
      100,
      {
        text: `The launch failed. ${cause}`,
        decision: launcher ? `launcher: ${launcher.name}` : undefined,
        value: chance,
        unit: chance === undefined ? undefined : '% chance of failure',
      },
      { text: outcome?.lessons[0] ?? 'Pick a more reliable rocket. It usually costs more, but it fails less often.' },
    )
  } else if (state?.endReason === 'criticalFailure') {
    const subsystem = lostSubsystem(state)
    const name = subsystem ? SUBSYSTEM_NAME[subsystem] : 'a vital system'
    const hasBackup = subsystem !== undefined && design.redundant.includes(subsystem)
    problem(
      100,
      {
        text: `The ${name} broke and was not fixed in time, so the mission ended on day ${state.day}.`,
        subsystem,
        value: state.day,
        unit: 'days',
      },
      {
        text: hasBackup
          ? 'Answer alarms at their station before the timer runs out. Your backup was already used.'
          : `Add a backup for the ${name}. A backup takes over by itself, and you can also repair the part at its station.`,
        subsystem,
      },
    )
  } else if (state?.endReason === 'budgetExhausted') {
    problem(
      100,
      {
        text: `You ran out of money: ${num(state.spentM)} M spent, but the budget was ${num(scenario?.budgetM ?? 0)} M.`,
        resource: 'budget',
        value: round1(state.spentM),
        unit: '$M',
      },
      { text: 'Pick cheaper parts or a cheaper rocket. Ground stations also cost money every year.', resource: 'budget' },
    )
  } else if (state && scenario && state.endReason === 'lifetimeReached' && state.day < scenario.durationDays) {
    problem(
      95,
      {
        text: `The orbit sank back to Earth after ${state.day} days. The mission needed ${scenario.durationDays}.`,
        value: state.day,
        unit: 'days',
      },
      { text: 'Carry more fuel to hold the orbit, or fly a little higher where there is less air.', subsystem: 'propulsion' },
    )
  } else if (state?.status === 'success') {
    good(60, { text: `Your spacecraft lasted the whole mission: ${state.day} days.`, value: state.day, unit: 'days' })
  }

  // ── Objectives ───────────────────────────────────────────────────────
  const launched = state?.endReason !== 'launchFailure'
  if (launched) {
    const objectives = evaluateObjectives(design, data)
    const label = (id: string): string => scenario?.objectives.find((o) => o.id === id)?.label ?? id
    const missed = objectives.filter((r) => !r.met)
    missed.forEach((r, i) => {
      problem(
        80 - i,
        {
          text:
            r.levelAchieved === null
              ? `Goal missed: "${label(r.objectiveId)}". Your design did not reach even the minimum.`
              : `Goal missed: "${label(r.objectiveId)}". You reached the ${r.levelAchieved} level, but you chose ${r.chosenLevel}.`,
          decision: `target: ${r.chosenLevel}`,
          value: r.value === undefined ? undefined : round1(r.value),
          unit: r.unit,
        },
        { text: `Pick an instrument or an orbit that helps with "${label(r.objectiveId)}", or choose an easier target.` },
      )
    })
    const met = objectives.length - missed.length
    if (met > 0) good(50, { text: `You met ${met} of ${objectives.length} mission goals.`, value: met, unit: `of ${objectives.length} goals` })
  }

  // ── Data and budgets ─────────────────────────────────────────────────
  const budget = dataBudget(design, data)
  if (launched && budget.lostPercent > 0) {
    problem(
      70,
      {
        text: `${num(budget.lostPercent)}% of your data was lost because the storage filled up.`,
        resource: 'data',
        value: round1(budget.lostPercent),
        unit: '%',
      },
      { text: RESOURCE_TIP.data, resource: 'data' },
    )
  }
  const reds = RESOURCE_KEYS.filter((k) => budgets[k].status === 'red')
  for (const key of reds) {
    problem(
      60,
      {
        text: `You used too much ${RESOURCE_NAME[key]}: ${Math.round(budgets[key].used)} used, ${Math.round(budgets[key].available)} available.`,
        resource: key,
        value: Math.round(budgets[key].used),
        unit: 'used',
      },
      { text: RESOURCE_TIP[key], resource: key },
    )
  }
  if (reds.length === 0) good(30, { text: 'Every budget stayed out of the red: weight, power, money, data, radio and time.' })

  // ── Alarms and tasks ─────────────────────────────────────────────────
  if (state) {
    const rang = state.log.filter((l) => l.kind === 'event').length
    const answered = Math.min(rang, state.log.filter((l) => l.kind === 'decision').length)
    if (rang > 0 && answered / rang >= 0.6) {
      good(40, { text: `You answered ${answered} of ${rang} alarms before time ran out.`, value: answered, unit: `of ${rang} alarms` })
    } else if (rang > 0) {
      problem(
        65,
        { text: `You answered only ${answered} of ${rang} alarms in time.`, value: answered, unit: `of ${rang} alarms` },
        { text: 'When an alarm rings, walk to its station right away and press E. A backup also helps.' },
      )
    }
    const tasksDone = state.log.filter((l) => l.kind === 'info' && l.text.startsWith(TASK_LOG_DONE)).length
    if (tasksDone > 0) {
      good(35, {
        text: `You finished ${tasksDone} optional ${tasksDone === 1 ? 'task' : 'tasks'} at the stations.`,
        value: tasksDone,
        unit: tasksDone === 1 ? 'task' : 'tasks',
      })
    }
  }

  // ── Put it together ──────────────────────────────────────────────────
  problems.sort((a, b) => b.weight - a.weight)
  goods.sort((a, b) => b.weight - a.weight)
  const goodPoints = goods.map((g) => g.point)
  const top = problems[0]
  const rest = problems.slice(1).map((p) => p.bad)
  // A problem mission leads with its problem and its tip; a clean one with what went well
  const points: ExplanationPoint[] = top ? [top.bad, top.tip, ...goodPoints.slice(0, 1), ...rest, ...goodPoints.slice(1)] : goodPoints
  if (points.length === 0) points.push({ kind: 'tip', text: 'Fly again and change one thing to see what it does.' })

  let summary: string
  if (!state) summary = 'This is how your design looks before it flies.'
  else if (!top) summary = `Great flight! Your mission worked and scored ${score(state, design, data).total} out of 1000.`
  else if (state.status === 'success') summary = `Your spacecraft survived, but ${lowerFirst(top.bad.text)}`
  else summary = top.bad.text
  return { summary, points }
}
