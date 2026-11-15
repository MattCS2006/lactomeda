# Space Apps 2026 — project page text (ready to paste)

Challenge: **Space Mission Design Game**

---

## Project name

**Lactomeda — Mission Control**

## High-level summary

Lactomeda is a browser pixel-art game in which students aged 13–17 design a NASA-style space mission and
then fly it. Players pick a mission and set its science targets. They build the spacecraft and choose
instruments, an orbit, a rocket and ground stations, trading off mass, power, budget, data, comms and
time. Then they walk inside the ship they built and keep it alive through emergencies. The design steps
follow real NASA practice: JPL Concept Maturity Levels, a Goddard Mission Design Lab–style review and
orbit data computed with NASA GMAT.

## Project description

### What it does
Lactomeda turns the mission design process into a game with two halves. The game is available in English
and Spanish.

1. **Design**
   - The player chooses one of three missions: *Student CubeSat*, *Wildfire Watch* or *Space Telescope*.
     Then they choose a difficulty: *Cadet*, *Engineer* or *Flight Director*.
   - Beginners can start from a working starter spacecraft. On *Cadet* they can also use recommended
     targets and let the game pick the background parts (structure, thermal, computer, attitude) for
     their bus.
   - Each objective has *threshold*, *baseline* and *goal* levels, and the player picks one for each.
   - The player builds the spacecraft from a short, curated list:
     - a 3U CubeSat, a SmallSat or a large bus, with parts for 8 subsystems;
     - 6 instruments;
     - 4 orbits with an altitude slider;
     - 4 launchers, including the free NASA CubeSat Launch Initiative;
     - 3 ground networks.
   - A live resource bar shows the margin of each of the six resources: green, amber or red.
   - A concept maturity meter rises from CML 1 to CML 4.
   - The phase ends with a design review modelled on a Mission Design Lab study. It gives one finding per
     discipline, an equipment list and cost, and a GO / NO-GO launch decision. A mission with no instrument
     cannot launch.
2. **Flight**
   - A pixel-art launch animation shows the real launch phases: countdown, Max Q, stage and fairing
     separation, then orbit insertion. A launch can fail, and then the game shows a lesson from a real
     NASA mishap.
   - In orbit, the player walks a ship generated from their design, with one room and console per
     subsystem.
   - Emergencies flash at the stations. The player walks to the station and chooses an option, such as
     repair, switch to the backup or safe mode. Each option shows its cost.
   - Ignored alarms can turn into worse events.
   - Optional station tasks earn extra rewards, and skipping them costs nothing.
   - A flight HUD shows the mission day, progress, resources and part health.
3. **Debrief**
   - The score out of 1000 is split into five bars: science, mission goals, room to spare, parts that kept
     working and alarms answered in time.
   - The stars and the outcome are shown.
   - *The 3 most important things* gives what went well, what went wrong and a tip for next time.
   - After a failed launch, the debrief shows the cause and the lesson engineers learned.
   - *Fly again* restores the design, shows what changed and lets the player replay the same emergencies
     or get new ones.

Team mode lets up to 4 players join a room with a 6-letter code and take mission roles: Mission
Director, Spacecraft Engineer, Payload Scientist and Flight Ops & Comms. With fewer players, roles are
merged.

### How it works
- It is a web app made with React and TypeScript, with a Phaser pixel-art scene for the ship and flight.
- The simulation engine is made of pure, deterministic functions, so the same seed always gives the same
  flight. The engine covers mass, power (with eclipse and degradation), link budget, data, cost, Δv and
  propellant, lifetime, objectives, launch outcome, the emergency deck and the end-of-mission explanation.
  It is covered by unit tests.
- All game content is stored in JSON files, and each catalog entry has a `ref` field that names its source.
- All interface text goes through i18next. There are English and Spanish files, and a test checks that both
  have the same keys and placeholders.
- Team rooms use Supabase realtime presence.
- The game runs in any modern browser with nothing to install. It is deployed on Vercel.

### Benefits
- Students learn by doing that every engineering choice has a cost. For example, a sharper camera means
  more data, which needs more contact time and more power.
- The steps, words and review format are the ones NASA teams use, so the game also introduces real
  mission design vocabulary.
- The game uses real numbers: imaging geometry is checked against Landsat 8/9 and VIIRS, and the LEO
  orbit values come from a NASA GMAT run.
- The game is built for beginners: starter spacecraft, recommended targets, short choice lists, readable
  text and a Spanish version.
- Failure is part of learning: the debrief explains the score and gives a tip. *Fly again* then invites
  students to change one thing and try again.

### What we hope to achieve
We want students who have never seen a mission design study to come away understanding how missions
are planned, why trade-offs matter, and how the people on a mission team work together. We also hope it
makes them want to take part in real student CubeSat programmes such as NASA's CubeSat Launch
Initiative.

## Use of NASA data and resources

- **Design and Develop Science Missions**: the four mission segments (launch, space, ground, user)
  organise the design tabs and the mission report.
- **GMAT**: we wrote `gmat/leo500.script` and ran it in GMAT R2025a. It covered 7 days, 500 km altitude,
  51.6° inclination and a ground station in San José, Costa Rica. It gave a 94.6 min period, about 35 min
  of eclipse per orbit and 3.1 passes per day. Those values feed the LEO orbit and its power and comms
  budgets, and the orbit card says *"Computed with NASA GMAT"*.
- **JPL Concept Maturity Levels**: the design phases are CML 1–4, shown on a maturity meter.
- **Goddard Mission Design Lab**: the design review gives one finding per discipline, an equipment list,
  cost and a GO / NO-GO decision. The ship's rooms are the same disciplines.
- **CubeSat 101 / NASA CSLI**: it gives the Student CubeSat scenario and its starter spacecraft, the
  CubeSat unit sizes and masses, the university ground station and the free CSLI launch option.
- **A Learning Game About Telescopes**: the wavelength rules decide which instruments fit each objective.
- **NASA Mission Viz**: linked in the game's NASA Sources screen; it inspired the launch and orbit visuals.
- **Visualize a Space Mission Using VR (Space Apps 2023)**: its concept → trajectory → timeline structure
  shapes the launch timeline and the flight HUD.
- **Other NASA data**: the multispectral imager matches Landsat 8/9 OLI (30 m, 185 km swath), and the
  fire-detection camera is modelled on VIIRS (Suomi NPP / NOAA-20). Part values come from NASA's *State-of-the-Art of Small Spacecraft Technology*, the MMRTG
  fact sheet, the DSN Link Design Handbook and the SLS fact sheet. Launch lessons come from the NASA
  mishap summaries for OCO, Glory and CRS-7.
- An in-game **NASA Sources** screen lists every challenge resource, what it does in the game and where
  to see it.

## Space agency partner resources

- **Canadian Space Agency — Digital Games and Activities**: our model for short, kid-friendly
  explanations in tooltips and on the NASA Sources screen.

## Tools and languages

TypeScript, React 19, Vite, Phaser 4, Zustand, Tailwind CSS, i18next (English and Spanish), seedrandom, Supabase, Vitest,
oxlint, NASA GMAT R2025a, Python (GMAT output parser), Node.js (sprite generator), Git and GitHub, Jira,
Vercel.

## Use of AI

The team used **Claude (Anthropic)** and **Claude Code** as coding and writing assistants. They helped
write code, tests and documentation. All game design decisions, scientific choices and code reviews
were made by the team, and every change was reviewed by a team member before merging.

## Links

- Live game: https://lactomeda.vercel.app
- Repository: https://github.com/MattCS2006/lactomeda
- Demo video: VIDEO_LINK_HERE
- Sources and licences: https://github.com/MattCS2006/lactomeda/blob/main/REFERENCES.md
