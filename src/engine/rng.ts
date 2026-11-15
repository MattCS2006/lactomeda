// Seeded random numbers (FR-7.8). Pure: the same seed and counter always give the same value, and there is no
// module-level state. The counter is stored in SimState.rng: draw number n is seedrandom(`${seed}:${n}`)().
import seedrandom from 'seedrandom'

/** One uniform draw in [0, 1) for this seed and counter, and the counter to use next. */
export function draw(seed: string, counter: number): { value: number; counter: number } {
  return { value: seedrandom(`${seed}:${counter}`)(), counter: counter + 1 }
}

/** One integer draw in [0, maxExclusive). Returns 0 if maxExclusive is not positive. */
export function drawInt(seed: string, counter: number, maxExclusive: number): { value: number; counter: number } {
  const { value, counter: next } = draw(seed, counter)
  return { value: maxExclusive > 0 ? Math.floor(value * maxExclusive) : 0, counter: next }
}
