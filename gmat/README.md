# GMAT orbit data (Dev 1)

One GMAT script per orbit in the game catalog. Each script propagates the orbit for 1 day
and reports period, eclipse duration and contact time with the game's ground stations.

Output goes to `gmat/output/*.csv`, then `npm run gmat:import` (to be written) converts it into
`src/data/orbits.json`.

Orbits to model: LEO 500 km, SSO 700 km, GEO, Molniya, Sun–Earth L2, lunar 100 km.
