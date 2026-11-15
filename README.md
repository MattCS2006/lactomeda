# Lactomeda — Mission Control

**NASA Space Apps Challenge 2026 · Challenge: *Space Mission Design Game***

Lactomeda is a pixel-art game that teaches students aged 13–17 how real space missions are designed.
You plan a NASA-style mission step by step: pick a goal, set science targets, build the spacecraft,
choose instruments, an orbit, a rocket and ground stations. Every choice uses up mass, power, budget,
data, comms or time. Then you launch, walk the corridors of the ship you built, and keep it alive by
answering emergencies at its stations. The debrief tells you how the mission went. Then you can fly again
with one change. The design steps follow real NASA practice: JPL Concept Maturity Levels, a Goddard
Mission Design Lab–style review, and orbit data computed with NASA GMAT.

## ▶ Play now

**https://lactomeda.vercel.app** — runs in the browser, nothing to install. Available in **English and Spanish**:
switch with the language selector on the start screen.

1. **Pick a mission**: *Student CubeSat*, *Wildfire Watch* or *Space Telescope*. Then choose a difficulty.
   Press **Start with a working spacecraft** to begin from a ready design, or build from scratch.
2. **Set your targets.** Choose how ambitious each objective is: *threshold*, *baseline* or *goal*. On
   *Cadet*, you can just use the recommended targets.
3. **Build the spacecraft.** Choose the bus and its parts, the instruments, the orbit, the rocket and the
   ground stations. Keep the resource bar green.
4. **Pass the design review and launch.** Fix the red findings, then press *Launch*.
5. **Fly the mission.** Walk the ship with the arrow keys or WASD. When a station flashes red, walk to it
   and press **E** to decide what to do. At the end, read the debrief to see your score and why, then
   press *Fly again*.

## Features

**Design phase** (React screens, in CML order)
- **Scenario**: three missions, each with its own objectives, budget, deadline and end users.
- **Targets**: each objective has *threshold / baseline / goal* levels. The engine checks your design
  against them using resolution, revisit time, data per day and lifetime.
- **Bus**: a 3U CubeSat, a SmallSat (ESPA class) or a large spacecraft. You pick parts for 8 subsystems:
  structure, power, battery, computer, attitude, propulsion, thermal and comms. Critical parts can be made
  redundant.
- **Payload**: 6 instruments, including the visible camera, a CubeSat magnetometer, a multispectral imager,
  a thermal-IR camera, a spectrometer and space telescope optics. The wavelength your objective needs decides
  which instruments fit. Parts that don't fit are disabled and the game says why. A mission with no
  instrument cannot launch.
- **Orbit**: 4 orbits (LEO, SSO, GEO, Sun–Earth L2), with an altitude slider. Changing the altitude trades
  image sharpness against orbit decay and mission lifetime.
- **Launcher**: 4 options:
  - the NASA CubeSat Launch Initiative, a free launch for selected student CubeSats;
  - a CubeSat deployer slot;
  - a rideshare slot;
  - a medium launcher.
- **Ground stations**: 3 networks (university station, commercial network, NASA Near Space Network). Each
  has a different contact time, reach and yearly cost.
- **Short choice lists**: the game shows a curated short list in each category (`src/data/curated.json`)
  so that students aren't overwhelmed. The full catalog stays in the data files.
- **Live resource bar**: shows weight, power, budget, data, radio and time. Green means a margin of 20 %
  or more, amber means tight, red means over.
- **Mission segments**: the design is organised into launch, space, ground and user segments.
- **Concept maturity meter**: goes from JPL CML 1 to CML 4.
- **Design review**: like a Mission Design Lab study, with one finding per discipline, an equipment list
  and cost, and a GO / NO-GO decision.

**Student mode**
- **Starter spacecraft**: one working design per mission (`src/data/presets.json`), built only from Cadet
  parts and offered after you pick a mission. A test checks that each one has no red budget and meets every objective at least at threshold.
- **Recommended targets** (Cadet): one button sets every objective to *baseline*.
- **Auto-picked background parts**: on Cadet, the structure, thermal, computer and attitude parts are chosen
  for you, to fit your bus. The player focuses on power, battery, propulsion and comms. The auto-picked
  parts can still be changed under *Advanced parts*.
- **Readable text**: in the whole game, body text uses a readable system font. The pixel font is kept for
  titles and main buttons.

**Launch and flight phase** (Phaser 4)
- **Pixel-art launch animation**: countdown, Max Q, stage and fairing separation, then orbit insertion.
  Sometimes there is a launch anomaly, with a lesson from a real NASA mishap.
- **A walkable ship generated from your design**: one room and console per subsystem you installed. The
  size of the bus decides how big the ship is. The flight map fills the screen without scrolling.
- **Emergencies at stations**: 15 flight events and 7 failure events. Alarms flash the room and show
  markers at the edge of the screen. An optional alarm sound plays. If you ignore an alarm, it can turn
  into a worse event (7 escalation events).
- **Optional station tasks**: 7 calm tasks, one per station. Examples: take a science photo, calibrate the
  antenna, check the battery. Doing a task earns a reward; skipping it costs nothing.
- **Decisions with costs**: each option shows what it costs in budget, power, data, health or risk.
  Examples: *repair it*, *switch to the backup*, *safe mode*.
- **Flight HUD**: mission day, progress, resource levels and part health. You can play at 1×, 2× or 10×,
  or pause.

**Debrief and fly again**
- **Score out of 1000** with its five parts, each shown as a bar: science collected, mission goals, room to
  spare in your budgets, parts that kept working, and alarms answered in time. Plus the stars and the
  outcome.
- **The 3 most important things**: what went well, what went wrong and a tip for next time. The engine
  writes these from your design and your flight (`src/engine/rules/explain.ts`).
- **Why the launch failed**: after a failed launch, the debrief shows what happened and what engineers
  learned from it.
- **Fly again** restores your last design and lists what changed since the last flight. You can replay the
  same emergencies or get new ones.

**Team mode**
- **Rooms**: create a room and share its 6-letter code. Up to 4 players can join, using Supabase realtime
  presence.
- **Roles**: each player picks a role: Mission Director, Spacecraft Engineer, Payload Scientist or Flight
  Ops & Comms. With fewer players, roles are merged. A team banner shows who does what.

**Difficulty**: *Cadet*, *Engineer* or *Flight Director*. Harder levels unlock advanced parts but bring
more emergencies and tighter margins. On harder levels you can launch by accepting a risk.

**Languages**: the interface is in English and Spanish (`src/i18n/en.json`, `src/i18n/es.json`). A test
checks that both files have the same keys and placeholders. The choice is remembered.

A **NASA Sources** screen in the game lists every challenge resource and where it is used.

## How we use NASA resources

| Challenge resource | Where it is in the game |
| --- | --- |
| [Design and Develop Science Missions](https://ntrs.nasa.gov/citations/20250002492) | The four mission segments (launch, space, ground, user) organise the design tabs and the mission report. The user segment says who uses your data, for example firefighters for Wildfire Watch. |
| [GMAT — General Mission Analysis Tool](https://etd.gsfc.nasa.gov/capabilities/capabilities-listing/general-mission-analysis-tool-gmat/) | `gmat/leo500.script` was run in GMAT R2025a. It gives period, eclipse time and passes over a ground station in San José, Costa Rica. Those values feed the LEO orbit and its power and comms budgets. The orbit card says *"Computed with NASA GMAT"*. |
| [Concept Maturity Levels (JPL)](https://ntrs.nasa.gov/citations/20150007816) | The design phases are CML 1–4: *Overarching idea → Initial feasibility → Trade space → Point design*. A maturity meter rises as you progress. |
| [Mission Design Lab (NASA Goddard)](https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab) | The design review has one finding per discipline, plus an equipment list, cost and a GO / NO-GO decision. The same disciplines are the rooms of your ship. |
| [CubeSat 101 (NASA CubeSat Launch Initiative)](https://www.nasa.gov/wp-content/uploads/2017/03/nasa_csli_cubesat_101_508.pdf) | It gives the *Student CubeSat* scenario and its starter spacecraft, the 1U = 10 cm / ~2 kg-per-U bus sizes, the university ground station and the **NASA CSLI launcher**. The CSLI launch is free for selected educational CubeSats. |
| [A Learning Game About Telescopes](https://science.nasa.gov/mission/webb/game-build-it-yourself/) | Wavelength rules (`src/data/wavelengthRules.json`): your objective decides the wavelength, and the wavelength decides which instruments fit. This drives the payload screen and the Space Telescope mission. |
| [NASA Mission Viz](https://nasa.github.io/mission-viz/) | Linked from the NASA Sources screen as a way to explore real mission trajectories. It inspired the launch and orbit visuals. |
| [Visualize a Space Mission Using VR (Space Apps 2023)](https://www.spaceappschallenge.org/2023/challenges/visualize-a-space-mission-using-virtual-reality/) | Its concept → trajectory → timeline structure shapes the launch timeline and the flight HUD (mission day and progress). |
| [CSA Digital Games and Activities](https://www.asc-csa.gc.ca/eng/youth-educators/digital-games-and-activities.asp) | Partner agency resource. It is our model for short, kid-friendly explanations in tooltips and on the NASA Sources screen. |

Launch anomalies use lessons from NASA mishap investigation summaries: OCO, Glory and SpaceX CRS-7.

## Real science inside

- **Imaging geometry is checked against real satellites.** In the tests, the multispectral imager at
  705 km gives about **30 m resolution and a ~185 km swath**, like Landsat 8/9 OLI, with a revisit of
  about 14–16 days from SSO.
- **Fire detection is based on VIIRS**, the active-fire sensor on Suomi NPP and NOAA-20 (375 m I-band,
  ~3,000 km swath). The wide-swath thermal camera finds fires about once a day from SSO.
- **A GMAT LEO run.** The settings were 500 km, 51.6°, a 7-day run from 2027-01-01 and a San José, Costa
  Rica ground station at 10° minimum elevation. The results were a 94.6 min period, about 35 min of
  eclipse per orbit and 3.1 passes per day (18.2 min of contact).
- **Engineering budgets** follow standard formulas:
  - the power budget includes eclipse, solar or RTG degradation, distance to the Sun and battery depth of
    discharge;
  - the link budget is data rate × contact time × distance factor;
  - there are also mass, Δv and propellant, cost, data volume and lifetime from orbit decay and radiation.
- Part values come from NASA's *State-of-the-Art of Small Spacecraft Technology*, SMAD, the NASA MMRTG
  fact sheet, launcher user guides and the DSN handbook. Each catalog entry has a `ref` field; see
  [REFERENCES.md](REFERENCES.md).

## Tech stack

React 19 · TypeScript (strict) · Vite · Phaser 4 (`pixelArt: true`) · Zustand · Tailwind CSS v4 ·
i18next (English and Spanish) · seedrandom (deterministic simulation) · Supabase JS (team rooms) · Vitest · oxlint ·
deployed on Vercel.

All game content (parts, instruments, orbits, launchers, events) is in `src/data/*.json`, not in code.
The simulation engine (`src/engine/`) is made of pure, deterministic functions with unit tests.

## Run it locally

You need Node.js 22 LTS and Git.

```bash
git clone https://github.com/MattCS2006/lactomeda.git
cd lactomeda
npm install
npm run dev      # open the printed localhost URL
npm test         # run the test suite
npm run build    # type-check and production build
```

Team rooms need Supabase keys in a `.env` file. Without them, *Play Solo* works and the room buttons
show *Offline*. Full laptop setup is in [docs/SETUP.md](docs/SETUP.md).

## Team

| Name | Role | Area |
| --- | --- | --- |
| Jason Vargas | Simulation & Science | Simulation engine, data catalog, GMAT |
| Celeste Escobar | Design UI & Platform | Design screens, i18n, launch and debrief UI, CI and deploy |
| Matthew Cordero | Pixel Art & Game | Pixel art, Phaser ship and flight scene, multiplayer rooms |

## Licences of assets

- Tileset: "Sci-fi Interior tiles" by Buch (OpenGameArt), **CC0**.
- Astronauts, consoles and spacecraft exterior sprites: original. The team made them with
  `tools/sprites/make-sprites.mjs`.
- Palette: Sweetie 16 by GrafxKid, credited as a courtesy.
- Fonts: Press Start 2P by CodeMan38, **SIL Open Font License**, for titles. Body text uses the device's
  own system font, so no font file is shipped for it.
- Sound: the alarm tone is made in the browser with the Web Audio API. There are no audio files.

Full list of sources, libraries and AI use: [REFERENCES.md](REFERENCES.md).
