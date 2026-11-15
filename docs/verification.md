# Martian Map verification
Verification date: 2026-11-08 (Asia/Taipei).

Data: one 2048 m square centered at 18.467158 N, 77.52 E; optical and stereo terrain from MRO HiRISE plus Mars Odyssey THEMIS. Bundled archive works without upstream science services. Height bytes and asset hashes verified by the package verifier. Runtime height checksum validation rejects corruption. Native/output scales and coordinate controls are recorded in the manifests and alignment-check.md. Absolute cartographic accuracy and thermal co-registration are not independently surveyed.

Checks: unit suite, Chromium browser suite, ESLint, TypeScript and static production build. Browser suite exercises layer state, selection versus inclusion, waypoint edits, return leg/export, blocked upstream access, missing/corrupted heights, missing image, WebGL failure, interior no-data rejection, keyboard controls, focus return, reduced motion, route pixels over imagery, and desktop/narrow layouts. See final command results below.

Visual QA: desktop 1440x1000 and mobile 390x844 screenshots in docs/screenshots. Readable controls, no horizontal overflow, north-up mobile terrain. Initial line depth-order issue was reproduced with a real-pixel test and corrected by rendering route strokes in the ordered transparent pass. Large northeast crater, southwest crater, and western bright crater correspond between overview and terrain. This is a processing-alignment check, not external accuracy validation.

Performance: production app at 1280x800 in headless Chrome on Windows, ANGLE / NVIDIA GeForce RTX 3080 Direct3D11. Measured local transfer 2,683,797 bytes (~2.7 MB), 66,049 terrain vertices, largest texture 2048x2048, capped DPR 1.5. During an orbit drag: 121 animation frame samples, mean 16.65 ms, median 16.70 ms, p95 16.80 ms (~60 rAF fps). This measures browser animation cadence on this GPU; integrated-GPU performance is unverified. Frame loop uses demand mode while idle; no perpetual animation. Screenshots are evidence of rendered terrain, not a GPU benchmark.

Environment: workstation antivirus injects a Kaspersky script into local pages. External-dependency test blocks it and excludes that known workstation origin from app dependency assertions. No application science service requests occurred. Expected asset/WebGL failure tests intentionally create corresponding browser errors; normal flow checks no uncaught page errors.

Dependency audit: production dependencies report zero vulnerabilities. npm audit reports eight moderate development-only transitive findings through eslint-config-next/typescript-eslint/minimatch; suggested automatic fix downgrades the framework lint config to a different major. No forced downgrade applied. These do not ship in the static site.

Limits: archival acquisition dates remain unknown where unverified; thermal STAC has reversed dates. Coarse thermal brightness is not temperature. Route lines are straight and require manual obstacle review. Time model is illustrative and baseline loop exceeds the default allowance, supporting a stop/route tradeoff demonstration. Small hazards and actual astronaut mobility are unresolved. No hosting publication performed.

Final task checks: 21 TypeScript unit tests, 11 Chromium browser tests, one Python verifier test; ESLint and TypeScript clean; Next.js static production export succeeds. Normal browser flow has zero uncaught page errors. Package verifier confirms seven assets and three categories from two missions. Additional review corrections, if any, are recorded below.

Independent final review found three Important issues. All were reproduced before correction: (1) huge finite coordinates reached subdivision before bounds rejection; (2) tiny finite speeds/large dwell overflowed duration and serialized nulls; (3) damaged mission anchors bypassed the loader. Fixes reject endpoints before sampling, reject nonfinite derived totals while preserving prior state, and verify mission.json checksums plus anchor/stop structure before rendering. Four added unit regressions went RED→GREEN; the browser regression confirms damaged mission JSON shows overview/retry without an uncaught page error. No Critical or Minor findings remained from the one-pass review.

## Cross-platform deployment regression (2026-11-08)
Vercel/Linux reproduced a mission checksum failure because the original hash described Windows CRLF bytes while Git stored LF bytes. The fix pins runtime JSON to LF with .gitattributes, writes generated JSON as UTF-8/LF before hashing, and updates the mission digest to match the actual Git asset. Strict runtime checksum validation remains enabled. A positive Linux-checkout loader regression and deterministic JSON writer regression both failed before the fix and pass afterward. Updated checks: 22 TypeScript unit tests, 11 browser tests, 2 Python tests, complete package verification, lint, typecheck, and static build pass. Live Vercel deployment was not inspected; validation used the same normalized asset bytes and production export locally.


## Jezero terrain scanner

The 4 m display grid contains 263,169 measured-height samples from the HiRISE crop. The 8 m analysis and fallback grid covers the same 2,048 m extent. The 4 m binary is 1,052,676 bytes. Verified all ten checksums in the static export and LF manifest bytes.

Inspected grayscale relief, wire mesh, point mode, and the slope and thermal layers in Chromium. Thermal boundaries are discrete in the north-up view. Verified that relief scaling and view changes leave an edited route's metrics intact, that top-down accepts touch pan, and that missing detail and optical assets leave the map usable. Elevation legend endpoints come from the displayed grid. Mesh inspection lines follow full-detail samples.

A 1440 × 1000 production preview on Windows with an RTX 3080 measured about 60 rAF frames per second during orbit. Initial transfer was under 4 MB on that machine. The result measures browser frame cadence on the available GPU. Integrated GPU performance was not measured.

Final checks passed with 27 TypeScript unit tests, 3 Python tests, 16 Chromium browser tests, ESLint, and the Next.js production export with TypeScript checking.


## Jezero expedition upgrade — November 8, 2026

Production export checks passed with 33 TypeScript unit tests, 5 Python tests, 22 Chromium browser tests, ESLint and TypeScript. The four focused expedition tests also passed after adding a touch-pan assertion. Detail seam tests compare fractional edge positions at 1×, 3× and 5×, preserve native interior heights and reject stale A/B requests. Loader tests reject bad hashes and out-of-bounds descriptors. All 14 asset hashes passed against both out/data/jezero and an LF checkout extracted from Git.

The independent review identified one interaction defect. Selecting a waypoint while inspecting enabled Move mode without clearing Inspect, so clicks updated the probe instead of moving the waypoint. A browser regression reproduced it before correction and passed afterward. The fix clears Inspect in the marker-selection path. No other Important or Critical issues were reported.

Walk-through verified on the static export

1. Select A from the journal or map. The camera frames the site in the current view and the caption identifies its 1 m detail tile.
2. Enable Inspect and select exposed terrain. Coordinates, Mars 2000 elevation, 8 m slope and THEMIS DN appear without changing the route. Route editing exits Inspect mode, including when selecting an existing waypoint.
3. Select B and remove it from the route. Distance and dwell change, the quest marker remains selectable, and its return field reads “Not on planned route.” Reviewing or logging an observation changes local journal progress independently.
4. Reload. Notes and review progress survive, while itinerary membership returns to the preset. Reset journal leaves the route intact.
5. Read the sol 119 MEDA card, inspect exact sample times/product links, and compare the registered regional rover traverse with the playable patch. Missing wind readings stay unavailable.
6. Corrupt A's tile and abort the evidence asset. The overview, route controls and embedded fullscreen fallback remain usable. Check touch panning, probe selection and archive content at 390 × 844.

Visual inspection covered desktop overview, focused relief, north-up optical/slope overlays, journal fields, archived table/inset and the mobile inspector. Updated desktop/mobile captures are under docs/screenshots.

Performance observation used Windows, Chrome 128.0.6613.138, ANGLE Direct3D11 on NVIDIA RTX 3080, at 1600 × 1000. Resource Timing recorded 3,442,951 transferred resource bytes for the cold overview and 4,495,927 after opening A, excluding the main document. Only A's 1,052,676-byte detail asset was requested. The render structure permits zero or one active fine tile, and sequential A/B selection retained one. During an orbit drag, 60 rAF samples had a 16.7 ms median and 16.9 ms 95th percentile. These are browser frame-cadence observations on this machine; lower-end devices were not benchmarked. Application data requests remain local. The machine's antivirus injected a separate Kaspersky resource, which is outside the app's code.

The branch and local production preview are prepared. This verification does not claim a hosted deployment.


## Simulated crew, hazard map and science atlas — November 8, 2026

Verified 43 TypeScript unit tests, 5 Python tests, ESLint, TypeScript and the production static build. The 26-browser-test regression suite covers the existing scanner/expedition and four new crew/hazard flows. New checks cover timeline boundary/dwell behavior, six-second buddy delay, reverse itineraries, deterministic seeking, zero-duration routes, bounded crew display anchors, articulated boot contact math, reduced-motion static articulation, exact hazard intersections including boundary and near misses, disjoint slope regions and independently verified evidence assets.

Browser flows exercise play/pause, seeking, note preservation during route resets, all eight science categories, crew follow canceled by manual navigation, marker selection exiting Inspect, dust warnings, unavailable scenario/atlas/image data, embedded fullscreen, and 390 × 844 touch controls. Existing Physical, terrain detail, route export and saved journal checks remain in the full suite. A marker regression caught the missing pointer-event override in the new HTML portal labels. The independent final review found fixed-height close-up camera focus and a frozen avatar when enlarged display offsets left the terrain at valid edge coordinates. Focus/follow now sample active surface height and relative camera offsets, while enlarged display anchors are bounded. Specific regressions cover those corrections.

Inspected the desktop crew, hazard detail, chemistry evidence and mobile map. New controls use the incumbent graphite/white visual world with team and hazard accents. Figure feet use two-segment articulation and terrain contacts. Playback freezes the gait when paused. Reduced motion retains static articulation while simulated coordinates can advance. Objective symbols are smaller and labels are raised to keep suited figures visible at science stops.

Production assets passed all 20 SHA-256 checks in both out/data/jezero and an LF asset checkout extracted from Git. On Windows with Chrome 128.0.6613.138 and the NVIDIA RTX 3080/ANGLE setup, a 1600 × 1000 cold overview transferred 3,502,228 application resource bytes, excluding the document. Opening A and the chemistry image increased that sample to 4,715,854 bytes. Only A's detail tile was requested in this walkthrough. During 60× playback, 60 rAF samples had a 16.7 ms median and 16.8 ms 95th percentile. No uncaught page errors appeared in the walkthrough. The mobile document width remained 390 px. These are observations on the available test machine.

Paused rendering was checked by counting WebGL draw calls. A settled 350 ms paused window issued zero draws, playback issued 2,904 draws over the next sample, and a settled 350 ms window after Pause again issued zero draws. The complete final browser suite passed 26 tests after the camera, boundary-anchor, pointer-event and symbol-legibility corrections.
