# Astronaut Guild visual decisions

## Direction
Dark graphite and near-white grid surfaces frame a map-first Jezero mission console. The guild theme appears in crew formation and scientific quests rather than decoration. Real orbital imagery carries the visual weight; generated UI studies informed layout but are not shipped as decorative assets.

## Type and layout
Barlow Condensed provides compact display headings, DM Sans provides controls and reading, and tabular numerals support measurements. Mission Command, Crew, Astronaut Map, and Quest Board have separate routes. The map keeps a narrow data-view rail and a focused contextual panel; its playback and elevation profile stay in a collapsible tray. Mobile places a compact horizontal control strip directly above the top-down map.

## Interaction and evidence
shadcn components provide form, button, badge, and related primitives styled to the dark system. Zone labels are subtle and inspectable; their legend discloses slope-based and simulated status. Warnings use text and map indicators, not color alone. Live room resources and quest status are synchronized, while the original solo route analysis and science atlas remain accessible. See the [site map](docs/site-map.md) for screen relationships.
