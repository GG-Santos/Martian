# Astronaut Guild visual decisions

## Direction
Dark graphite and near-white grid surfaces frame a map-first Jezero mission console. The guild theme appears in crew formation and scientific quests rather than decoration. Real orbital imagery carries the visual weight; generated UI studies informed layout but are not shipped as decorative assets.

## Type and layout
Barlow Condensed provides compact display headings, DM Sans provides controls and reading, and tabular numerals support measurements. Mission Command, Crew, Astronaut Map, and Quest Board have separate routes. The scanner follows a three-stage Marswalk: plan, simulate, then review results. A mission brief sits beside a surface map with one integrated science atlas. Mobile places the map above the planning controls. The primary SVG map works without WebGL and keeps routes, hazards, and crew in the same coordinate system as the local NASA imagery.

## Interaction and evidence
shadcn components provide form, button, badge, and related primitives styled to the dark system. Hazard symbols are inspectable and distinguish observed terrain from scenario events. Warnings use text and map indicators alongside color. Room objectives and route preferences are shared; rehearsal playback and results remain local. See the [site map](docs/site-map.md) for screen relationships.

## Marswalk rehearsal
Optical, thermal, elevation and slope are local surface views. Atmospheric, spectral, geophysical, radiation and chemical products retain their archival coverage in separate reference views. Names appear on marker hover; hazard icons reflect their type. Shared room objectives and route preferences feed a local rehearsal; custom return detours, field-kit confirmations and run results remain local to the current scanner view. Each run freezes its route, spends resources on walking and fieldwork, and requires a return with a 20% reserve for success. The simulation is educational and uses disclosed illustrative rates.

## Science representations
Slope uses the verified 8 m quarter-degree raster, with a matching 0/10/15/30-degree color scale, transparent no-data cells and pointer samples from the displayed grid. Atmospheric observations use the packaged MEDA time bins with selectable temperature, pressure and wind charts; missing observations break the trace. Spectral, geophysical, radiation and chemical views preserve their original NASA figures, source units, axes and scale bars in zoomable viewers. Their coverage remains regional, historical or target-scale; image colors are not converted into invented numerical measurements or local map overlays. Each source image has independent loading, verification, retry and zoom state.
