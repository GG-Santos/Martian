# Astronaut Guild · Mars field planner

A local, four-person scientific exploration prototype built on the existing Martian Map. It combines one observed Jezero sector with an illustrative Mars destination atlas, room-based crew coordination, proposed science quests, and explicitly simulated planning hazards. It is a **mission-planning demonstration**, not operational astronaut safety software.

## Run

Use Node.js 22.16 or newer with npm. The server uses Node's TypeScript type stripping and runs Next.js and a WebSocket room service in one process.

```powershell
npm ci
npm run db:push
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). For a production build on the same machine:

```powershell
npm run build
npm start
```

This application now requires its Node server. The previous static export is no longer a supported way to run multiplayer sessions. Set `DATABASE_URL` in the ignored `.env` file to a MongoDB database, then run `npm run db:push` to apply the Prisma schema. Crew proposals on the Quest Board are stored in MongoDB and appear in the shared catalog; the app has no account system or proposal ownership controls, so submissions are visible to every visitor. Live room state remains local in `.data/rooms.json` during `npm run dev`; that directory is gitignored. Keep the process running while crews are active.

## Deploy on Vercel

Vercel serves crew sockets through the Next.js Function at `/api/sync`; the local custom server accepts that same path for development. The Function stores shared room state in Upstash Redis and uses Redis Pub/Sub to deliver snapshots to sockets connected to other Function instances.

1. Add or link an Upstash Redis database through the Vercel Marketplace integration. Set its TCP connection URL as `REDIS_URL` for both the **Preview** and **Production** environments. The local `.env` file is ignored by Git and does not configure Vercel. Keep the value server-side; do not use a `NEXT_PUBLIC_` variable.
2. Set `DATABASE_URL` to the MongoDB connection string for both **Preview** and **Production**. Keep it server-side and do not use a `NEXT_PUBLIC_` variable. Deployments use the Prisma schema in `prisma/schema.prisma` for the shared Quest Board catalog.
3. Confirm **Fluid Compute** is enabled in the Vercel project's Function settings, then redeploy so the settings and environment variables apply.
4. Use the deployed `/crew` page to connect. The WebSocket route is `/api/sync`; a 404 there means the deployment does not include the route. Check the deployment's Function logs for Redis connection or configuration errors.

The route is configured for a maximum duration of 300 seconds. Vercel can close a socket at the Function duration limit, so the browser reconnects with its saved room token. Redis keys are separated by Vercel environment (`preview` versus `production`); rooms are not shared between those environments. For local deployment-like work, use the current Vercel CLI's `vercel dev` where WebSocket upgrades are available. The regular `npm run dev` custom server continues to use local JSON persistence.

## Explore

1. **Mission Command (`/`)** pairs a three-location NASA orbital image carousel and sourced place facts with the [NASA Space Apps Interplanetary Survival Guide challenge](https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/). Jezero has a bundled observed local sector; Gale Crater and Melas Chasma show [real NASA image previews](public/images/locations/SOURCES.md) while their field maps remain simulations.
2. **Explore Map (`/explore`)** fills the screen with an orbitable 3D Mars globe. Its 47 points include the three mission regions and 44 additional IAU-named places from the USGS Gazetteer. Selecting a point centers it and opens a sourced fact panel; mission planning from the atlas is marked coming soon. [Viking imagery, MOLA global relief, and J2000 catalog stars](public/images/locations/SOURCES.md) provide planetary context, not local route-safety maps.
3. **Crew (`/crew`)** is entered from Mission Command and creates or joins a six-character room code. One to four astronauts can choose simple original 3D characters, names, optional roles, and equipment. The waiting lobby shows teammate avatars and readiness. The host chooses a location and hypothetical base; everyone present marks ready before launch. Changing mission, base, or equipment resets affected readiness.
4. **Scanner (`/scanner`)** is the field workspace. Launching an expedition from `/crew` opens it with that room's team, base, selected mission point, active tasks, and deterministic simulated hazards. Terrain, reviewed hazards, and crew-seeded scenario hazards remain separately labeled. The route shown for a launched crew is an illustrative terrain- and hazard-weighted candidate that returns to base; it is not certified navigation.
5. **Quest Board (`/board`)** previews proposed objectives on a sector map. Crew members can click or use the keyboard to place a map pin while drafting a scientific task with a hypothesis, equipment, hazards, observations, and completion criteria. Publish, accept, start, complete, cancel, or fail a quest; published tasks appear in the scanner field workspace.

See the [site map](docs/site-map.md) for the screen relationships and [visual UX audit](docs/ux-audit-2026-11-11.md) for the screen-by-screen review.

Open the crew room in separate browser tabs or profiles on the same computer to try real synchronization. Each tab stores its reconnect token for that tab's session. Duplicating a tab can copy that token; use a fresh tab for a distinct astronaut. The server binds to loopback by default; hosting for other devices requires an explicit host setting and appropriate network protection.

## Data and safety interpretation

The bundled Jezero sector is 2.048 km wide. MRO HiRISE provides the optical image and 8 m stereo elevation grid; Mars Odyssey THEMIS provides coarse regional daytime infrared brightness. Those are three distinct observation types: optical, topographic, and thermal. The three bundled science stops, base choices, and field routes are hypothetical. Gale and Melas Chasma field sectors, their terrain, zones, and routes are procedural simulations; they are not derived from local NASA observations.

The zone overlay derives broad slope classes from the elevation grid: at most 10° is a lower mapped slope, above 10° to 15° is caution, and above 15° is hazard. Missing elevation remains **unknown**. Scenario hazards can increase a zone's caution but are labeled as simulation. A lower mapped slope is not a verified safe EVA site: rocks smaller than the grid, soil bearing strength, radiation, and current weather are unresolved. Select a zone to inspect its classification and supporting factors. The map's optical, slope/topographic, and thermal controls remain available separately from zone labels.

The scanner has registered observed terrain for Jezero. Gale and Melas Chasma crew sectors are illustrative; when one is selected, the scanner identifies the location mismatch, keeps the crew's local pins and seeded hazards visible, and withholds Jezero slope zones and route candidates until matching terrain data are registered.

Crew separation uses a connected crew network with a 50 m default radius and 3 m warning hysteresis. It does not require every pair to remain within range. Live position changes are constrained server-side to 2 m/s and the 2,048 m sector; movement consumes the individual astronaut's synchronized percentage-point oxygen and stamina budgets. These numbers and equipment effects are illustrative, not suit telemetry. The scanner's wind, visibility, radiation index, and dust front are manually triggered scenarios, not live readings. Dust changes route hazards; radiation highlights a review warning but route estimates do **not** calculate radiation dose. Route suggestions include a return to base and reject options that exceed the most restricted crew member's resources or equipment. They cannot certify a route as safe.

Live room access has no account identity and uses room tokens. Crew proposals are stored in a shared MongoDB catalog without ownership controls; do not include private information in a proposal. Share room codes only with the intended crew. NASA observations are archival; this app does not provide live radiation or weather measurements.

Source products, URLs, transforms, and hashes are in [the bundled manifest](public/data/jezero/manifest.json). See [data preparation](docs/data-preparation.md), the [site map](docs/site-map.md), and the [visual UX audit](docs/ux-audit-2026-11-11.md).

## Verify

```powershell
npm test
npm run test:e2e
npm run lint
npm run typecheck
npm run build
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r scripts/requirements.txt
.venv\Scripts\python.exe -m unittest scripts/test_prepare_mars_data.py
.venv\Scripts\python.exe scripts/prepare_mars_data.py --verify-only
```

The browser suite uses installed Google Chrome. The bundled NASA data can be inspected offline; the repository's optional Python data scripts are only needed when preparing or validating those source assets.

Credits: NASA/JPL-Caltech/UArizona/USGS (HiRISE), NASA/USGS/ASU (THEMIS), NASA/JPL-Caltech/ASU/MSSS (regional panorama).
