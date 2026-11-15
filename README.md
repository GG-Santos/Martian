# Astronaut Guild: Martian Map

Astronaut Guild is a Marswalk planning and rehearsal tool set in a **2.048 km-wide sector of Jezero crater**. A crew uses NASA imagery and science data to choose an objective, plan a route from its habitat and back, and see how terrain, fieldwork, and simulated hazards affect the resources available for the return.

This project addresses the 2026 NASA Space Apps challenge to combine data from multiple missions into a local map that helps future explorers navigate and conduct science on Mars. [Interplanetary Survival Guide: Martian Map](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/)

## How it addresses the challenge

| Challenge goal | What the project delivers |
| --- | --- |
| Combine several NASA data types at a useful scale | HiRISE optical imagery and stereo elevation from Mars Reconnaissance Orbiter share a local map with infrared brightness from Mars Odyssey's THEMIS instrument. Derived slope shows where changes in terrain may affect travel. |
| Help astronauts plan a round trip | Compare an efficient route with a lower exposure option, add science stops, and place return detours on the map. Each route links the habitat, the planned stops, and the return leg. |
| Make time for science on the surface | Each mission sets a hypothesis, equipment needs, expected observations, and completion criteria. The rehearsal budgets time for fieldwork as well as walking. |
| Account for mobility and resources | Slope and simulated dust can slow travel. Walking and fieldwork use oxygen and battery. The rehearsal succeeds when the crew finishes every planned stop and returns with at least 20% of both resources. |
| Show what to improve | The debrief records distance, time, completed stops, remaining resources, and the outcome. A downloadable JSON field report includes the modeled activities so users can review the run and revise the plan. |

## Try an expedition

1. Open **Mission Command** (`/`) to explore Mars on the globe, then select **Build your crew**.
2. In **Crew** (`/crew`), select a published mission, choose a habitat and crew size, and customize your astronaut. A room supports one to five members. Use capacity one for a solo run, share the room code with teammates, or let the captain fill open slots with crew bots.
3. **Launch expedition** opens **Scanner** (`/scanner`). In **Plan**, switch science views, compare routes, add optional stops or return detours, and confirm the field kit. Check the predicted return resources before starting.
4. In **Simulate**, follow the crew across Jezero's 3D terrain as it walks the route, works at science stops, and returns to the habitat. Orbit the terrain, switch to top down, or use the 2D map. Pause, change playback speed, or end the rehearsal. The outcome distinguishes a successful return, a reserve breach, resource exhaustion, and an aborted run.
5. In **Results**, review the run, download the field report, or return to planning. To propose your own science task, use the **Quest Board** (`/board`).

## NASA data in the Science Atlas

| View | Source and coverage |
| --- | --- |
| **Optical** | MRO HiRISE orbital imagery registered to the local Jezero map. |
| **Topographic and slope** | HiRISE stereo elevation and an 8 m analysis grid. Slope uses the verified quarter-degree raster. The map shows readings in degrees and leaves cells with no data transparent. |
| **Thermal** | Mars Odyssey THEMIS infrared brightness displayed as relative digital numbers (DN). The local view resamples the coarser source data. |
| **Atmospheric** | Perseverance MEDA Sol 119 temperature, pressure, and wind samples by local mean solar time. Missing observations remain gaps in the charts. |
| **Spectral** | Regional Jezero mineral indicators from MRO CRISM and CTX. [NASA mineral map](https://science.nasa.gov/resource/jezero-crater-minerals/) |
| **Geophysical** | Perseverance's Artuby traverse and RIMFAX radargram with the published axes and annotations. [NASA/JPL traverse and radargram](https://www.jpl.nasa.gov/images/pia25025-perseverances-traverse-seen-from-above-and-below/) |
| **Radiation** | Curiosity RAD's historical absorbed dose rate at Gale crater. [NASA radiation record](https://science.nasa.gov/resource/radiation-measurements-on-mars/) |
| **Chemical** | Perseverance PIXL's element map of the Dourbes rock target at millimetre scale. [NASA/JPL Dourbes figure](https://www.jpl.nasa.gov/images/pia25041-pixls-view-of-dourbes/) |

The local surface map works without WebGL. Reference figures retain their published scale bars, axes, and legends in a viewer with zoom and pan. The data manifest records source products, coordinate transforms, and asset checksums. [Jezero manifest](public/data/jezero/manifest.json) · [Science atlas records](public/data/jezero/science-atlas.json) · [MEDA and rover evidence](public/data/jezero/expedition-evidence.json) · [Data preparation](docs/data-preparation.md)

### Scope and limitations

Jezero is the registered local planning area. Weather and radiation records describe past observations at their source locations. Regional and rock-scale products provide scientific context at their published scales. Terrain resolution limits which obstacles can be seen, and the app leaves missing data unknown.

The habitat, mission stops, scenario hazards, and resource rates are illustrative. The 20% return reserve is a rule for the educational rehearsal. Operational EVA planning would require independent terrain validation, current conditions, and calibrated mobility and suit models.

The repository also includes CRISM and PIXL staging adapters, scientific QA scripts, and reproducible export builders. Quantitative staging products require separate approval and registration before use in the live atlas. [Scientific data contract](docs/scientific-data-contract.md) · [Analysis workflow](analysis/README.md)

## Run locally

Use Node.js 22.18 or newer and npm.

```powershell
npm ci
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). To save crew-authored mission proposals, copy `.env.example` to `.env` if you do not already have one, set `DATABASE_URL` to your MongoDB connection string, and run `npm run db:push`. Restart the dev server after changing the environment. Bundled missions remain available when MongoDB is unavailable. [Environment template](.env.example) · [Prisma schema](prisma/schema.prisma)

The Next.js app uses Prisma and Zod for the shared mission catalog. Published proposals are visible to all visitors. WebSockets synchronize room rosters, readiness, and shared plan selections. The local Node server binds to loopback and stores rooms in `.data/rooms.json`. Use fresh tabs or browser profiles for distinct crew members. Return detours, field-kit confirmations, rehearsal playback, and results stay in the current scanner view.

For a local production build, run `npm run build` followed by `npm start`. The Vercel-targeted WebSocket handler at `/api/sync` uses Redis for room persistence and Pub/Sub. On a deployment that supports WebSocket upgrades, configure `REDIS_URL` with a Redis TCP connection URL and `DATABASE_URL` with a MongoDB connection string as server-side variables. The route declares a 300-second maximum duration, and the browser reconnects with its session token when the connection closes. [Hosted room handler](src/app/api/sync/route.ts)

## Development checks

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

The browser suite runs with `npm run test:e2e` and uses installed Google Chrome. To verify the bundled terrain separately, install the Python dependencies and run `python scripts/prepare_mars_data.py --verify-only`. [Python dependencies](scripts/requirements.txt)

## Credits and license

NASA, JPL-Caltech, and the instrument and processing teams credited in each product provide the observational data and imagery. Product credits and usage terms are recorded in the source metadata. Application code is distributed under the Apache License 2.0. [License](LICENSE)
