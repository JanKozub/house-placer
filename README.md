# House Placer: Ambrozja 17 on plot 664/2

A web app for previewing a house on a real building plot before it is built. It renders the
**Ambrozja 17 (BSA2409)** single-storey house in Three.js on parcel **664/2, Zakliczyn (gm. Siepraw)**,
using the real terrain and the real sun position, and lets you place it on the plot.

**Live:** https://jankozub.github.io/house-placer/ (UI in Polish; deployed from `main` by GitHub Actions)

## Features

**3D preview**
- Parametric house model built from the floor plan: walls with window and door openings, two 30° gable wings meeting at a common ridge with valleys, eaves and gable overhangs, gutters, chimneys, terrace, porch/carport and interior partitions.
- Real terrain from the GUGiK NMT 1 m model, with a building platform carved in and 1:2 embankments.
- Satellite imagery (Esri World Imagery) draped on the terrain, and roads from OpenStreetMap painted as asphalt, gravel or paved surfaces and labelled in the plan view.
- Sun computed for the plot's latitude and longitude at any date and time, in Polish local time (CET/CEST), corrected for PUWG 1992 grid convergence.
- Analytic HDR sky, soft shadows, GTAO ambient occlusion, and interior and wall lights at night.
- **Photo mode**: progressive path tracing with `three-gpu-pathtracer`, exported as a PNG.
- Editable finish colours: plaster, roof, frames, wood and plinth.

**Placement**
- Top-down plan over the plot boundary, with neighbouring plots taken from ULDK.
- Move, rotate (with 15° snapping) and mirror the house.
- Live **setback checks (WT §12)**: at least 4 m from the boundary for walls with windows, at least 3 m for blank walls, measured in front of each wall.
- Optional MPZP building line.
- Floor level (±0.00) control with an automatic balanced cut/fill setting, cut and fill volumes, and a terrain profile.
- Drawing tools for driveway, paths, patio, flower beds, gravel, trees and shrubs, and a fence along chosen boundaries (gaps are left at driveways).
- State persists in `localStorage` and can be exported or imported as JSON.

## Run

```bash
npm install
npm run dev        # http://localhost:5199
npm test           # geometry / setback / earthwork / sun unit tests
```

Site data is already in `public/site/`. To refresh it:

```bash
npm run fetch-site    # parcel + neighbours (ULDK), DEM (NMT WCS), then imagery + roads
npm run fetch-map     # only satellite imagery (Esri, GUGiK fallback) + OSM roads (Overpass)
```

If no imagery is available, the ground falls back to a synthetic field texture.

## Data and accuracy

- The house is described in `src/house/ambrozja17.ts`, taken from the project's dimensioned
  ground-floor plan and section. That covers the wall positions, both 9.05 m wings and every
  opening: O37s 180×150, OBD17 180×235, FIX1/2/3, Oind1 270×150, O31 90×150, the Dz1/Dz2 doors
  and the Hörmann 450×225 garage door. It also covers the levels: ground −0.62, terrace
  −0.02/−0.17/−0.32, opening heads +2.35, ring beam +2.76, eave soffit +2.73 with a 1.00 m
  overhang, ridge +6.32 and chimney +6.70. Interior partitions are approximate (they are only
  seen through the glass).
- Imagery: Powered by Esri (Esri, Maxar, Earthstar Geographics, GIS User Community). Roads © OpenStreetMap contributors (ODbL). Parcel geometry and terrain © GUGiK (geoportal.gov.pl). Distances and setbacks are indicative.
  They are not a substitute for a surveyor's site plan (mapa do celów projektowych) or for the
  local zoning plan (MPZP/WZ).
- `docs/` holds the project drawings (ground-floor plan and section). They are © Domy w Stylu, and their copyright notice applies.
