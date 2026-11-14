# Lactomeda — Mission Control (NASA Space Apps 2026)

Pixel-art space mission design game. Players design a mission (React screens), then
fly it inside a walkable pixel-art ship (Phaser), answering pop-up emergencies at stations.
Full spec (ERS): see the project doc "Lactomeda — Space Mission Design Game: Analysis, Plan & ERS".

## Team and folder ownership
Three devs, each running Claude Code on their own laptop. Stay in your folders.

| Dev | Role | Owns |
| --- | --- | --- |
| Dev 1 | Simulation & Science | `src/engine/`, `src/data/`, `gmat/` |
| Dev 2 | Design UI & Platform | `src/ui/`, `src/i18n/`, `src/App.tsx`, CI, deploy |
| Dev 3 | Pixel Art & Game | `src/game/`, `src/net/`, `public/assets/` |

Shared contracts — change only after telling the other two:
- `src/engine/types.ts` (MissionDesign, Budgets, MissionEvent…)
- `src/game/bridge.ts` (events between Phaser and React)

## Commands
- `npm run dev` — local dev server
- `npm test` — Vitest (engine tests must pass before pushing)
- `npm run build` — type-check and build

## Rules
- TypeScript strict. No `any` in shared contracts.
- Engine functions are pure and deterministic (use the seeded RNG, never `Math.random`).
- All game content (components, instruments, orbits, events) lives in `src/data/*.json`, not in code.
- All UI text goes through i18next (`src/i18n/`); no hard-coded strings in components.
- Phaser runs with `pixelArt: true`; sprites on a 16 px or 32 px grid, integer scaling only.
- Every external asset, library or dataset gets a line in `REFERENCES.md` (Space Apps requires it).
- NASA resources must be visibly used — see section 9 of the ERS. Credit them in `REFERENCES.md`.

## Git workflow
- Branch per Jira issue: `LAC-<number>-short-name` (e.g. `LAC-42-battery-event`).
- Commit messages start with the issue key: `LAC-42 add battery failure event`.
- Small PRs into `main`; rebase on `main` before pushing; another dev approves.
- Never force-push `main`.
