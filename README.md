# House Placer: house projects on plot 664/2

A web app for previewing a house on a real building plot before it is built. It renders a
single-storey house project in Three.js on parcel **664/2, Zakliczyn (gm. Siepraw)**, using the
real terrain and the real sun position, and lets you place it on the plot.

Two projects are included; pick one from the dropdown in the header:
- **Ambrozja 17 (BSA2409)**, Domy w Stylu: two 30° gable wings and a carport.
- **Dom Grela (TE-DE 12.2025)**, TE-DE Sp. z o.o.: hipped 30° roofs, covered terrace, recessed entrance and a double garage.

Each project keeps its own placement and floor level. The garden, trees, fence and building line belong to the plot, so all projects share them.

The UI is in Polish. Deployed on Netlify (`netlify.toml`: `npm run build` → `dist`).

## Features

**3D preview**
- Parametric house model built from the floor plan: walls with window and door openings, a roof made of hip/gable volumes (faces, ridges and valleys are computed), boxed eaves, gutters, chimneys, terrace, porches and interior partitions.
- Real terrain from the GUGiK NMT 1 m model, with a building platform carved in and 1:2 embankments.
- **Views from the house** ("Widok z domu"): eye-height look-around from the window facing the valley, the terrace, living room, kitchen and bedroom, over an 8 km landscape (8 m grid, GUGiK DSM where available, otherwise DTM with OpenStreetMap forests raised to canopy height) and a 30 km horizon ring, with earth curvature and distance haze. The valley direction is detected from the terrain, and a link opens Google Street View at the nearest road.
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
npm run fetch-landscape  # only the 8 km / 30 km landscape rings (DSM/DTM + imagery)
```

If no imagery is available, the ground falls back to a synthetic field texture.

## Adding a house project

1. Write a `HouseDef` (see `src/house/types.ts`) in `src/house/<id>.ts`. Use the project's dimension chains for the outline, walls and openings, and the section for levels. Give the roof as one or more rectangular `hip` or `gable` volumes with their eave-edge height, plus explicit trim lists: soffits, fascia, gutters, downpipes and gable triangles.
2. Add it to `HOUSE_LIST` in `src/house/projects.ts`.
   A project can have separate buildings (a detached garage): list them in `annexes`, each a full `HouseDef` in its own plan coordinates with a `defaultAt` spot in the house's plan. Every annex gets its own placement, platform and floor level, is dragged and rotated on its own in the plan view (the "Dom | Garaż" switch picks which one the inputs and Q/E act on), and is included in the setback, corner and gap checks.
   Houses with a usable attic or a richer façade can also use: `Opening.level` (the storey an opening serves, e.g. attic windows; sets the eye height of views) and `Opening.shape: 'gable'` (glazing that follows the roof slopes), openings above the wall top inside that wall's gable, `upperFloor` (attic slab with voids), `upperRooms`, `roofWindows`, `facadeZones` (dark render band / wood cladding, cut around openings; colour "Tynk – pas ciemny") and `extras` (boxes for pergolas, canopies, posts).
3. Run `npm test`. The generic checks run on every project: outline and walls agree, openings fit their walls, roof faces tile the roof outline without steps, and the ridge height matches the section.

## Extra buildings

Extra buildings on the plot (sheds, garages) are added in the placement tab, under "Budynki dodatkowe". They belong to the plot, not to a house project, so they stay where you put them when you switch houses. Each one is placed, rotated and levelled like the house: drag it on the plan, or pick it in the "Przesuwany budynek" switch. It gets its own setback rows, corner labels (W1, W2…) and a distance-to-house line. The catalog lives in `src/house/outbuildings.ts`: each entry is a full `HouseDef`. Sides marked `open: true` (a wiata on posts) build no wall but still count in setbacks.

## Data and accuracy

- Ambrozja 17 is described in `src/house/ambrozja17.ts`, taken from the project's dimensioned
  ground-floor plan and section. That covers the wall positions, both 9.05 m wings and every
  opening: O37s 180×150, OBD17 180×235, FIX1/2/3, Oind1 270×150, O31 90×150, the Dz1/Dz2 doors
  and the Hörmann 450×225 garage door. It also covers the levels: ground −0.62, terrace
  −0.02/−0.17/−0.32, opening heads +2.35, ring beam +2.76, eave soffit +2.73 with a 1.00 m
  overhang, ridge +6.32 and chimney +6.70. Interior partitions are approximate (they are only
  seen through the glass).
- Ambrozja 17 (garaż wolnostojący), in `src/house/ambrozja17-detached.ts`, is derived from the same drawings. The bedroom wing ends at the living wing's front line (Y = 15.65), so the front is one straight wall. The carport is dropped, and the front gable overhangs 1.00 m over the entrance so its verge meets the living-wing eave. The garage is room 1/17 on its own: 6.45 × 7.90 m with 45 cm walls (5.55 × 7.00 m inside), the Hörmann 450×225 door and a 30° gable roof, with its floor 0.27 m below the house floor in the drawings, so the eaves line up on level ground. Its side door is an assumption, since the drawings have none.
- Dom w Arganiach 2 (G2E, ARCHON+) is described in `src/house/argania2.ts`, transcribed from the dimensioned interactive plans, section and elevations on archon.pl. It covers:
  - The L-shaped plan 14.30 × 12.45 m (7.40 + 6.90, 8.70 + 3.75) with the double garage projecting 3.75 m.
  - Window and door sizes from the plan labels (330/230, 110/230, 220/230, 320/230, 250/140, 90/140, entrance 150/210, garage door 500/225).
  - The attic: 160/220 and 80/140 gable windows, the 560/280 glazed gable over the garage, three 78/140 roof windows and the slab at +3.06 with the void over the living room.
  - Levels: ground −0.32, ceiling 2.68, knee wall 1.25, a 38° roof with the ridge at +7.98.

  Read off the elevations or assumed: the 0.80 m overhangs, the attic window sills, the glazed gable's sill (+3.20), chimney positions, the pergola and entrance-canopy heights, and the extent of the dark render and wood cladding. Interior partitions are approximate. The project card PDF is not in `docs/`: archon.pl only emails it after a form with personal data and consents.
- The extra building "Wiata + magazyn + garaż" comes from the user's own plan and section A-A. It is 12.11 × 7.10 m: wiata 4.50, magazyn 3.51, garaż 4.10, with 24 cm walls. Walls stand at +2.80, the roof is 30° with the ridge at +5.40, and the chimney is 0.50 above the ridge. Those three values only fit if the roof surface at the wall face is +3.35, so the eave box closes the gap above the walls. Assumed: the east window (190/80 at +1.40), the overhangs, and the beam, shutter and oven sizes.
- Dom Grela is described in `src/house/grela.ts`, taken from the TE-DE drawing set: ground-floor plan, section A-A and roof plan. It covers:
  - Main block 15.81 × 12.58 m and garage wing 6.69 × 10.98 m.
  - Covered terrace 6.56 × 2.86 with post S-1, and the entrance recessed 0.80 m.
  - Openings: 150/150 windows, HS 400/235, FIX 280/235, the 130+240/145 kitchen corner window, door 100/210 + 40/210 sidelight, and the 500/235 garage door.
  - Levels: ground −0.32, soffit +2.77, eave +3.07 with a 0.80 m overhang, ridge +7.16.
  - Two hipped roofs; the garage roof (ridge ≈ +6.70) meets the main roof's east hip with valleys.

  The set has no elevations. Window heights come from the plan's width/height labels and sill heights; heads are at +2.35 and the garage floor is assumed at −0.15. The corner window is modelled with a 45 cm corner pier. Interior partitions are approximate.
- Imagery: Powered by Esri (Esri, Maxar, Earthstar Geographics, GIS User Community). Roads © OpenStreetMap contributors (ODbL). Parcel geometry and terrain © GUGiK (geoportal.gov.pl). Distances and setbacks are indicative.
  They are not a substitute for a surveyor's site plan (mapa do celów projektowych) or for the
  local zoning plan (MPZP/WZ).
- `docs/` holds the project drawings. The Ambrozja 17 plan and section are © Domy w Stylu. `Biłgoraj Andersena Grela rysunki.pdf` is © TE-DE Sp. z o.o. Their copyright notices apply.
