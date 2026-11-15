# Astronaut Guild

## Platform
Local Next.js web application for desktop Chromium and narrow-screen top-down use. A Node server hosts the app, WebSocket rooms, and JSON room persistence.

## Product truth
Astronaut Guild extends the original Martian Map Jezero field planner. Crews of up to four can choose a hypothetical base, launch together, post scientific quests, share positions, and compare illustrative resource-aware routes. The NASA optical, topographic, and thermal observations remain available for field context. This is an educational mission-planning prototype, not operational astronaut navigation or certified safety assessment.

## Constraints
Observed terrain and source provenance must remain distinct from simulated bases, hazards, resources, and route costs. Unknown terrain remains unknown. NASA data is archival; there is no live weather, radiation, suit telemetry, or account system. Crew proposals are saved in a shared MongoDB catalog and are visible across crews without ownership controls. The room service binds to loopback by default. See [DESIGN.md](DESIGN.md) and [README.md](README.md).
