# References

This file lists everything external used in Lactomeda, as NASA Space Apps requires. The in-game
**NASA Sources** screen shows the same challenge resources. `src/ui/sources/sources.test.ts` checks that
every link on that screen is also listed here.

## 1. NASA and partner resources (challenge Resources tab)

| Resource | Used for | Link |
| --- | --- | --- |
| Design and Develop Science Missions (NASA) | The four mission segments (launch, space, ground, user) organise the design tabs and the report | https://ntrs.nasa.gov/citations/20250002492 |
| General Mission Analysis Tool (GMAT), NASA Goddard | LEO 500 km orbit data in `gmat/` (period, eclipse, ground contacts) | https://etd.gsfc.nasa.gov/capabilities/capabilities-listing/general-mission-analysis-tool-gmat/ |
| Concept Maturity Levels (NASA JPL) | Design phases CML 1–4 and the maturity meter | https://ntrs.nasa.gov/citations/20150007816 |
| Mission Design Lab (MDL), NASA Goddard | Design review by discipline, equipment list, ship stations | https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab |
| NASA Mission Viz | Linked from the NASA Sources screen; inspired the launch and orbit visuals | https://nasa.github.io/mission-viz/ |
| A Learning Game About Telescopes (NASA Webb) | Wavelength → instrument compatibility rules | https://science.nasa.gov/mission/webb/game-build-it-yourself/ |
| CubeSat 101 (NASA CubeSat Launch Initiative) | Student CubeSat scenario, CubeSat unit sizes, CSLI launcher, ground segment | https://www.nasa.gov/wp-content/uploads/2017/03/nasa_csli_cubesat_101_508.pdf |
| Visualize a Space Mission Using VR (Space Apps 2023) | Concept → trajectory → timeline structure of the launch timeline and flight HUD | https://www.spaceappschallenge.org/2023/challenges/visualize-a-space-mission-using-virtual-reality/ |
| Digital Games and Activities (Canadian Space Agency, CSA) | Model for kid-friendly explanations | https://www.asc-csa.gc.ca/eng/youth-educators/digital-games-and-activities.asp |

## 2. Data catalog sources (`ref` fields in `src/data/*.json`)

Every object in the catalog has a `ref` field. The sources are grouped below by topic, without
duplicates. Values marked *estimate* or *verify (NFR-09)* in the JSON are game estimates based on the
source. *Game balance values* (costs, slots, budgets, deadlines) were tuned for play.

The game shows players a short list per category (`src/data/curated.json`). The full catalog, and every
source below, stays in the data files. The new team-made files have no external source and no `ref` field:
- `presets.json`: starter spacecraft;
- `stationTasks.json`: optional station tasks;
- `partFits.json`: which parts fit which bus;
- `curated.json`: the short lists.

**Project specification**
- Lactomeda ERS (team analysis document) §2, §7.2–7.4, FR-3.1, FR-5.6, FR-10.4, FR-13.1 and FR-14.6:
  scenarios, launcher tiers, orbit list, starter instruments, bus classes and ground network types.

**Spacecraft bus and components**
- NASA Ames, *State-of-the-Art of Small Spacecraft Technology*: chapters on structures, power, command
  and data handling, communications, guidance, navigation and control, propulsion, and thermal control.
  Also used for CubeSat magnetometer values.
- Wertz & Larson, *Space Mission Analysis and Design* (SMAD): larger spacecraft structures, power, ADCS,
  C&DH, propulsion and thermal.
- NASA MMRTG fact sheet: radioisotope generator, about 110 W and 45 kg.
- NASA JPL, *DSN Telecommunications Link Design Handbook* (810-005): deep-space high-gain antenna.
- NASA CubeSat 101: 1U = 10 cm cube (~1 L), up to ~2 kg per U.
- NASA SmallSat definition: upper limit of 180 kg.
- James Webb Space Telescope: mass of about 6,200 kg, used to size the large bus.

**Instruments (imaging geometry)**
- Landsat 8/9 OLI (NASA/USGS): 30 m resolution, 185 km swath at 705 km (multispectral imager).
- VIIRS on Suomi NPP / NOAA-20 (NASA/NOAA): 375 m I-band at 830 km, ~3,000 km swath (thermal-IR fire
  detection).
- Sentinel-1 IW mode (ESA/Copernicus): ~10 m resolution, ~250 km swath (synthetic aperture radar).
- AMSR2-class microwave radiometer (JAXA GCOM-W): ~10 km footprint, wide swath.
- ICESat-2 ATLAS (NASA): ~13 m footprint at 500 km (laser altimeter).
- JWST / Hubble diffraction limit, ~0.1 arcsec (space telescope).
- Typical CubeSat imager, ~30 m at 500 km (visible camera).

**Orbits**
- NASA GMAT R2025a, `gmat/leo500.script`, with results in `gmat/output/leo500.json`. The run covered
  7 days from 2027-01-01 at 51.6° inclination, with a San José, Costa Rica ground station at 10°
  minimum elevation. It gave 3.1 passes per day, an average pass of 5.8 min and 35.3 min maximum eclipse
  per orbit.
- The other orbits use analytic estimates: `T = 2π √(a³/μ)` and worst-case eclipse
  `f = asin(R / (R + h)) / π`.
  - Earth: μ = 398,600 km³/s², R = 6,378 km.
  - Moon: μ = 4,903, R = 1,737 km.
  - Mars: μ = 42,828, R = 3,390 km.
  - Molniya: 500 × 40,000 km, 12 h.
  - Sun–Earth L2 halo: period of about 6 months.

**Launchers**
- NASA CubeSat Launch Initiative (CubeSat 101): free launches for selected educational CubeSats, up to
  12U / ~24 kg.
- Rocket Lab, *Electron Payload User's Guide*: small launcher capacity to SSO.
- SpaceX, *Falcon Payload User's Guide*: medium launcher capacity to SSO, GTO, TLI and escape.
- NASA Space Launch System (SLS) Block 1 fact sheet: super-heavy launcher capacity to TLI.

**Ground networks**
- NASA Near Space Network overview: coverage to about 2 million km.
- NASA Deep Space Network (DSN) overview.
- NASA CubeSat 101: ground segment for student CubeSats.

**Launch failures (lessons in the launch animation)**
- NASA mishap investigation summaries: Orbiting Carbon Observatory (OCO) and Glory (fairing separation).
- NASA/SpaceX CRS-7 mishap summary (2015): failed strut.
- Game summary of common launch failure causes: engine shutdown, stage separation, upper-stage underperformance and spacecraft separation.

## 3. Art, fonts, palette and audio

| Asset | Author | Licence | Link / file |
| --- | --- | --- | --- |
| "Sci-fi Interior tiles" (floors, walls, doors) | Buch, OpenGameArt | CC0 1.0 | https://opengameart.org/content/sci-fi-interior-tiles → `public/assets/tilesets/scifitiles-sheet.png` |
| Astronauts, station consoles, spacecraft exterior sprites | Lactomeda team (generated by `tools/sprites/make-sprites.mjs`) | Original work | `public/assets/sprites/` |
| Sweetie 16 palette | GrafxKid | Colour list, credited as a courtesy | https://lospec.com/palette-list/sweetie-16 |
| Press Start 2P font (titles and headings) | CodeMan38 (via `@fontsource/press-start-2p`) | SIL Open Font License 1.1 | https://fonts.google.com/specimen/Press+Start+2P |
| Body text font | The device's own system font (`system-ui`, Segoe UI, Roboto, Arial…) | — (not shipped) | `src/index.css` |
| Alarm tone | Synthesised in the browser with the Web Audio API | — (no audio files) | `src/ui/sound/alarmSound.ts` |

## 4. Libraries

| Library | Licence | Use |
| --- | --- | --- |
| React, React DOM | MIT | UI |
| Phaser | MIT | Pixel-art ship and flight scene |
| Vite, @vitejs/plugin-react | MIT | Dev server and build |
| TypeScript | Apache-2.0 | Language |
| Zustand | MIT | State and saved progress |
| Tailwind CSS (@tailwindcss/vite) | MIT | Styling |
| i18next, react-i18next | MIT | All UI text, in English and Spanish |
| seedrandom | MIT | Deterministic, seeded simulation |
| @supabase/supabase-js | MIT | Team rooms (realtime presence) |
| @fontsource/press-start-2p | MIT (package) / OFL (font) | Font |
| Vitest | MIT | Tests |
| oxlint | MIT | Linting |
| Prettier | MIT | Formatting |
| pngjs | MIT | Sprite generator |

Hosting: Vercel. Multiplayer backend: Supabase.

## 5. Use of AI

The team used **Claude (Anthropic)** and **Claude Code** as coding and writing assistants. They helped
write code, tests and documentation. All game design decisions, scientific choices and code reviews
were made by the team. Every change went through a pull request that a team member reviewed and merged.
