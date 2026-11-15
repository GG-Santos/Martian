# Mission Command orbital previews

The carousel uses archived orbital imagery for all three destinations. CSS places each image in the same responsive frame and crops to fill it. Gale's supplied image is a landscape view centered on the crater's layered central mound.

| Destination | File | Source | Credit | Scope |
| --- | --- | --- | --- | --- |
| Jezero Crater | `../../data/jezero/overview.webp` | [Bundled Jezero manifest](../../data/jezero/manifest.json) | NASA/JPL-Caltech/UArizona | Observed local sector with bundled optical and elevation data |
| Gale Crater | `gale-orbital.jpg` | [Provided Space.com CDN image](https://cdn.mos.cms.futurecdn.net/Q8BFB6mpQiS9QMDivXcbDL.jpg) | Original credit not present in supplied image URL | Archived orbital view; field terrain, zones, and routes in this app are simulated |
| Melas Chasma | `melas-orbital.jpg` | [NASA Photojournal PIA08109](https://science.nasa.gov/photojournal/melas-materials/) | NASA/JPL/Malin Space Science Systems | Archived Mars Global Surveyor image; field terrain, zones, and routes in this app are simulated |

The Gale and Melas images are visual previews. They are not registered to the app's 2,048 m simulated field grids and must not be used to infer route safety.

The Explore globe uses the [NASA/JPL-Caltech Viking global image texture](https://science.nasa.gov/3d-resources/mars/) (`mars-viking-global.jpg`, 1440 × 720) and the [NASA Scientific Visualization Studio MOLA elevation map](https://svs.gsfc.nasa.gov/4436/) (`mars-mola-topography.jpg`, 1024 × 512). Both are cylindrical maps for globe display. The texture is for planetary orientation; its named-place pins do not imply local hazard coverage.

Forty-four additional atlas points are selected from the [IAU/USGS Gazetteer Mars nomenclature center-point KML](https://planetarynames.wr.usgs.gov/GIS_Downloads), which supplies planetocentric latitude and east longitude. The compact derived catalog is `src/features/locations/mars-pois.json`; `scripts/build-mars-pois.mjs` records the selection and extraction process. Each point links to its individual Gazetteer feature entry. These coordinates mark named-feature centers, not safe landing locations or precise feature boundaries.

The globe mesh is displaced using NASA PDS [MOLA MEG004 global topography](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html), product `megt90n000cb.img` (SignedMSB2 meters; 4 samples per degree; 1440 × 720). `scripts/build-mola-height.mjs` converts the grid to `mars-mola-height.png`. Relief is visually exaggerated about 14× on the globe so it is visible at screen scale; it is not a local EVA terrain model. The polar cells in this low-resolution global grid include interpolation where observations are absent.

The Explore sky uses 5,041 stars of apparent magnitude 6 or brighter from the [HYG v4.1 catalog](https://github.com/astronexus/HYG-Database/blob/main/hyg/README.md), filtered by `scripts/build-sky-catalog.mjs` from its J2000 right ascension and declination. The derived `src/features/locations/sky-catalog.json` is provided under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) with attribution to Astronexus / David Nash. Constellation connectors are a small, conventional set made from named HYG stars; the [IAU defines boundaries, not a single line figure](https://www.iau.org/IAU/Astronomy-FAQs/Constellations.aspx). Sky placement is fixed to J2000 relative coordinates and is not a live Mars sky ephemeris.

NASA has published [HiRISE digital terrain models for Gale Crater](https://hirise.lpl.arizona.edu/dtm/dtm.php?ID=PSP_010573_1755). They are not yet registered to this project's 2,048 m local field grid, so Gale route and zone assessments remain simulated. The archived Gale image is an orientation preview rather than a route layer.
