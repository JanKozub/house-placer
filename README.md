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
   A split-level house (garage on a lower floor) can also use: `WallEdge.base` (a wall that reaches below ±0.00, so its openings can too), `lowerGround` (ground beside the house that lies lower than the building platform, optionally falling away as a drive, with a `hardEdge` where it steps down vertically), `platform` and `apron` (their outlines when the defaults don't fit). See `src/house/argania2-low.ts`. A project that starts somewhere else than the PZT house can have its own start position (`PROJECT_START`), ground (`GROUND_DESIGN`) and forecourt, gates and cars (`PROJECT_LAYOUT`), all in `src/site/sitePlan.ts`.
3. Run `npm test`. The generic checks run on every project: outline and walls agree, openings fit their walls, roof faces tile the roof outline without steps, and the ridge height matches the section.

## Default position (PZT)

New visitors start on the compromise variant of Dom w Arganiach 2 (see below), with the garden described under "Garden". Returning visitors are switched to it once, and each project keeps the position they gave it.

Dom w Arganiach 2 itself is placed as in the land-development plan "PZT koncepcja" (2026-11-10), with ±0.00 = 357.00 m a.s.l. "Ustaw wg PZT" in the placement tab puts the house back. The position in `src/site/sitePlan.ts` was measured from the drawing. The map's plot outline was fitted to the GUGiK parcel, agreeing to 5–10 cm. Then the house's outer walls were fitted to the drawn walls. The back-left corner comes out 10.87 m from the south-west boundary, as labelled on the map.

The garden and the ground at the house are 5 cm below that floor (356.95, `design.level` in `public/site/survey.json`), so the house and the entrance are on one level, with no plinth and no entrance step (the catalogue has the ground at −0.32). The PZT prints no ground levels of its own, only ±0.00, so this level is good to about ±0.3 m.

The edges follow the slopes the PZT draws (`slopes` in the same file). They are wedges, wide where they are high and tapering to nothing where the designed ground meets the surveyed ground, and their tick marks show the fall:
- a cut along the road side and the west half of the north-west side, about 0.85 m at the west corner
- an embankment along the south-east and north-east sides, from nothing at the south corner to about 1.4 m at the east corner, and from there fading out to nothing by the gate

So the plot is not a flat table. The back and the sides are level, and the front falls to the surveyed ground at the north corner, where the gate is. The map's own heights there are 356.5 in front of the garage, 356.0–356.1 by the gate and 355.9 at the corner, and the national LiDAR model agrees with the map's 58 spot heights to 8 cm. The forecourt (`design.ramps`) is level in front of the garage door and the entrance, then falls about 1.1 m to the gate, roughly 12%. The lawn beside it falls with it, with no bank along the curb, as the PZT draws none. Nothing is built up outside the plot. Earthworks come to about 220 m³ of cut and 330 m³ of fill.

## Lowered-garage variant and the access road

"Dom w Arganiach 2 (garaż niżej)" is the same house with the garage floor 1.50 m below the house floor (`src/house/argania2-low.ts`). The house floor sits at the level of the road behind it (357.80), the garage at 356.30, and nine steps lead up to the entrance. So that the two solutions compare like for like, its ground follows the same rules as the PZT ground (`GROUND_DESIGN` in `src/site/sitePlan.ts`): the garden and the ground at the house 5 cm below the floor, slopes shaped as the PZT draws them (highest at the east corner, running out to nothing by the gate), and a drive that is level in front of the garage door and then falls to the surveyed ground at the gate, with no step and nothing built up outside the plot. Both start at the PZT position, and "Ustaw wg PZT" puts either one back there. The variant differs only in what it is about: the floor level, the lowered garage with its stairs and retaining walls, and slopes that start 2 m inside the fence. Its levels, steps and retaining walls are assumptions, not an architect's design.

Like for like: on the PZT the drive falls 1.04 m from the garage (357.00) to the gate, roughly 12%. In the variant it is level for 2.4 m and then falls 0.37 m, about 5%. With the garage only 1.00 m below the floor (356.80) the variant's drive came out at 11%, hardly gentler, which is why it is 1.50 m. The price is nine steps to the entrance, retaining walls up to 1.5 m beside the forecourt, and about 780 m³ of fill for the raised garden, against about 220 m³ of cut and 330 m³ of fill on the PZT.

Every project shows the planned access road to the gate: gravel, along the outside of the north-east boundary and on past the north corner to the asphalt road (`accessRoads` in `src/site/sitePlan.ts`). It is not on the PZT or in OpenStreetMap, so it stays visible when the OpenStreetMap roads are switched off. It lies on the ground as surveyed.

## Compromise variant

"Dom w Arganiach 2 (kompromis)" sits half-way between the two (`argania2Mid` in `src/house/argania2-low.ts`, built by the same code as the lowered-garage variant). It answers four objections at once: the house too close to the north-west neighbour, the garden cut below the road, the tall embankment at the east corner, and a garage 1.5 m below the entrance.

- Floor at 357.40, which is 0.40 m above the PZT's. That is level with the surveyed ground at the back wall (357.3–357.4) and about 0.4 m below the road boundary. The PZT floor is about 0.3 m below that ground.
- Garage floor 0.50 m lower (356.90, about the PZT's forecourt level), so three steps lead up to the entrance. The garage door is 500/250 instead of 500/225, which leaves 25 cm more wall above it than in the catalogue.
- The drive is level for 1 m at the door and then falls 11.5% to the surveyed ground at the gate, about as steep as on the PZT.
- The house starts 2.5 m further from the north-west boundary: 7.7 m at the garage corner instead of 5.2 m, with over 20 m left on the other side. Front to back it stays where the PZT has it. "Ustaw wg wariantu" puts it back there.
- The plot is not levelled (`GROUND_DESIGN` with no slopes): it keeps the surveyed ground, so there is no bank at the road and no embankment at the east corner. Only the house, the terrace and 2 m of lawn behind it stand on a level platform, which cuts about 0.3 m into the lawn rising to the road. Earthworks come to about 15 m³ of cut and 115 m³ of fill, including the forecourt.

Because the house stands elsewhere, this project has its own forecourt, gate, wicket and parked cars (`PROJECT_LAYOUT` in `src/site/sitePlan.ts`). They replace the PZT ones, by id, while the project is shown; the rest of the garden is shared as before. The forecourt is the same drawn yard moved with the house, which leaves a 2.5 m planting strip along the north-west fence, and the access road ends at the moved gate.

Not modelled: the drain or shallow swale that the ground behind the terrace needs, since the lawn there falls towards the house. The levels are assumptions for the architect, as in the other variant.

## Interiors and looking inside

Dom w Arganiach 2 (and both of its variants) has a full interior, measured from archon.pl's interactive ground-floor and attic plans and described in `interior` in `src/house/argania2.ts`:

- partition walls with their doors, drawn open as on the plans, including the sliding door of the vestibule and the folding door of the wardrobe
- the dog-leg stairs: 16 risers of 19.1 cm, 12 up to a landing over the ground-floor wardrobe and 4 back up to the attic, with glass balustrades
- the void over the living room, with a glass gallery
- floor finishes: boards, tiles in the kitchen, vestibule, bathrooms and laundry, concrete in the garage and the boiler room
- furniture and fixtures where the plans draw them: kitchen with a peninsula and three stools, dining table for eight, sofa, fireplace wall, bathrooms, beds, desks, wardrobes, boiler and tank
- attic ceilings: flat at 2.55 m, sloped down to the 1.25 m knee wall, with walls and cupboards cut to the slope

Finishes follow ARCHON+'s interior visualisations (cream walls, oak, beige stone, graphite tall units) and are not part of the colour palette. The furniture is built from simple shapes in `src/house/interior.ts`; a new project gets an interior by filling in `HouseDef.interior` (walls, doors, floors, items, stairs). Houses without one keep their approximate `partitions`.

Two switches under "Wyświetlanie" open the house up:

- "Ukryj dach" hides the roof, gutters, roof windows and the ceiling under the roof. On a single-storey house that shows the rooms; on Dom w Arganiach it shows the attic.
- "Ukryj piętro (poddasze)" also hides the upper storey: its slab, rooms and the outer walls above the slab's underside, which leaves the ground floor open from above. It is offered only for houses with an upper storey.

The geometry is built in three layers for this (`buildHouseLayers` in `src/house/geometry.ts`: base, upper, roof), and the outer walls are split at the underside of the attic slab.

Known simplifications: the garage floor is drawn at the house floor level in the lowered-garage variants too, the catalogue's entrance is 140/210 (it was drawn 150/210 before), and the fireplace flue moved 35 cm to where the attic plan has it.

## Garden

Every visitor starts with the garden the family planned in November 2026 (`src/site/sitePlan.ts`; none of it is on the PZT):

- Wiata + garage in the east corner (`DEFAULT_SHED`), where the family put it: its back 1.4–2.0 m from the south-east boundary, its garage end 1.0 m from the north-east one, 14.2 m from the house. That is closer than the 3–4 m a building of this size needs from a boundary, and the setback table shows it in red.
- Its floor is at 356.10. The ground under it falls from 356.4 at the wiata end to 355.6 at the garage end, which is the lowest pocket of the plot. 356.10 is the level of the ground the drive arrives on, 10 cm above balanced cut and fill.
- A 3.5 m drive (`SHED_DRIVE`) runs along the inside of the north-east fence from the forecourt straight to the garage door, on the surveyed ground (356.0–356.2). The shed's own apron (`lowerGround` in `src/house/outbuildings.ts`) is level for 1 m and then falls 1% away from the door, which fills the dip in front of it.
- Thuja hedges (`THUJA_HEDGE`, tree kind `thuja`, "Tuja" in the planting tools): one tree every 75 cm, 75 cm inside the boundary, about 2.2 m tall, along the road behind the house and along both neighbours. The gate side stays open. All of them are drawn as one mesh.

When stored data from an older version is opened, the hedges replace the trees planted before, the shed and its drive are added unless the visitor has a shed somewhere else, and the compromise variant opens.

### The designed garden

On top of that comes a full planting plan (`src/site/gardenPlan.ts`), written in the house's plan coordinates as the compromise variant stands. It follows the motifs modern Polish garden visualisations keep returning to:

- every edge of the paving is planted: grasses and lavender between the fence and the drive to the shed, an avenue of four ball-headed trees over lavender on its garden side, box balls, grasses and a red maple along the lane to the entrance, and a gravel bed with hydrangeas between the forecourt and the north-west hedge
- white hydrangeas with ornamental grasses in front of the thuja hedge along the road and along the north-west neighbour
- beds at both ends of the terrace, and a rock garden with boulders on the bank behind it
- a group of birches in the west corner and a second red maple by the terrace
- on the south-east side: a slab path from the terrace to a gravel fire-pit circle with sitting stones, on to a patio in front of the wiata; four raised vegetable beds on gravel by the hedge; three fruit trees and a pine towards the road; a shade tree by the fire pit

New plant kinds, all with their own planting tool: `grass`, `lavender`, `hydrangea`, `boxwood`, `globe` (ball-headed tree), `maple` (red). `rock` and `firepit` are objects placed the same way. Small plants are drawn as one mesh with per-vertex colours (`plantGeometry` in `src/site/Garden.tsx`). A new area kind, `vegbed`, is a raised bed: a timber frame filled with soil, with rows of vegetables.

Paving now ends in a kerb (`src/site/GardenFeatures.tsx`): a 10 cm kerb, 4.5 cm proud, along every edge that has paving on one side only. There is none where a drive runs into the forecourt, at a wall or in a gateway, and the painted edge follows the same rule, so no line crosses the paving where two areas meet. Beds get a thin dark edging.

The garden is laid out for the compromise variant; with another house project the beds near the house stay where they are.

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
  - Levels: ceiling 2.68, knee wall 1.25, a 38° roof with the ridge at +7.98. The catalogue's ground is −0.32; here it is −0.05, as the plot is levelled to the floor (see "Default position (PZT)"). The lowered-garage variant keeps −0.32.

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
