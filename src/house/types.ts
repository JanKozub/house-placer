/**
 * A house project as parametric data. Every house is described in its own plan coordinates:
 * X → right, Y → down (as drawn), metres, origin at the top-left corner of the outer wall
 * outline's bounding box. "Front" (entrance) is +Y. ±0.00 = finished ground-floor level.
 *
 * To add a project: write a `HouseDef` in src/house/<id>.ts and list it in src/house/projects.ts.
 */

export type Vec2 = [number, number];

export type OpeningKind = 'window' | 'door' | 'terraceDoor' | 'hs' | 'fixed' | 'garage' | 'entrance';

export interface Opening {
  /** id of the exterior wall edge */
  wall: string;
  /** centre position along the wall, as the absolute plan coordinate (X for horizontal walls, Y for vertical) */
  at: number;
  width: number;
  height: number;
  sill: number;
  kind: OpeningKind;
  /** number of glazed panes (mullions = panes − 1) */
  panes?: number;
  /** project symbol, for reference */
  ref?: string;
  /** floor level (above ±0.00) of the storey this opening serves — the attic is +3.06 in Argania 2.
   *  Only sets the eye height of views; sill stays relative to ±0.00. */
  level?: number;
  /** 'gable': glazing whose top follows the two roof slopes up to an apex (a pentagon); the total
   *  height is `height`. It must sit in a wall that carries a gable (see Roof.gables). */
  shape?: 'rect' | 'gable';
}

export interface WallEdge {
  id: string;
  a: Vec2;
  b: Vec2;
  /** name shown in the setback table */
  label?: string;
  /** top of this wall above ±0.00 (default: house.wallTop) */
  top?: number;
  /** open side (a wiata on posts): nothing is built, but it still counts for setbacks, as open */
  open?: boolean;
  /** bottom of this wall below ±0.00 (negative), where the ground in front of it is lower (a
   *  split-level garage); openings in it may have a sill down to this level. Default 0. */
  base?: number;
}

/**
 * Ground beside the house that lies lower than the building platform (a forecourt in front of a
 * split-level garage). Plan coords; heights relative to ±0.00.
 */
export interface LowerGround {
  outline: Vec2[];
  /** ground level at the house */
  top: number;
  /** from this plan Y outwards the ground falls by `fall` per metre (a drive down to the gate) */
  fallFromY?: number;
  fall?: number;
  /** part of the outline where the ground steps down vertically (walls, stairs), as a polyline */
  hardEdge?: Vec2[];
}

export interface Slab { x0: number; x1: number; y0: number; y1: number; top: number }

/**
 * One roof volume: a rectangle in plan (the eave/verge outline) with a ridge along X or Y.
 * Hip volumes slope on all four sides, gable volumes on the two sides parallel to the ridge.
 * The roof surface is the highest volume at each point.
 */
export interface RoofVolume {
  kind: 'hip' | 'gable';
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  ridge: 'x' | 'y';
  /** height of the roof's top surface at the rectangle's sloped edges (the outer eave line) */
  edgeTop: number;
}

export interface Chimney { x: number; y: number; w: number; d: number; top: number }

export interface Roof {
  pitchDeg: number;
  thickness: number;
  /** ridge height above ±0.00 (from the section; tests check the volumes reproduce it) */
  ridgeTop: number;
  /** roof top-surface height at the outer wall face (eave boxes and gable triangles start under it) */
  topAtWall: number;
  /** eave overhang beyond the wall face (for end caps) */
  eaveOverhang: number;
  /** underside of the boxed eave soffit */
  soffit: number;
  volumes: RoofVolume[];
  /** roof outline (eaves + verges), clockwise as drawn — for the plan view */
  outline: Vec2[];
  chimneys: Chimney[];
  /** horizontal soffit polygons at `soffit` (boxed eaves) */
  soffits: Vec2[][];
  /** fascia boards along eave edges, from `soffit` up to the eave */
  fasciae: [Vec2, Vec2][];
  /** end caps closing an eave box at a gable overhang: corner on the wall line, direction outward */
  caps: { at: Vec2; out: Vec2 }[];
  /** gutter runs (plan), hung just below the eave */
  gutters: [Vec2, Vec2][];
  /** downpipes: foot at the wall, swan-neck to the gutter */
  pipes: { wall: Vec2; gutter: Vec2 }[];
  /** gable wall triangles above the wall top: a→b along the façade (clockwise), base height */
  gables: { a: Vec2; b: Vec2; base: number }[];
}

/** a covered area (carport, terrace roof) with a flat ceiling and clad posts */
export interface Porch { x0: number; x1: number; y0: number; y1: number; posts: Vec2[]; postSize: number; ceiling: number; soffit?: boolean }

/** a roof window lying in the roof slope; `at` is its centre in plan, `length` along the slope */
export interface RoofWindow { at: Vec2; width: number; length: number }

/** thin cladding panels on the outside of a wall, cut around its openings */
export interface FacadeZone {
  wall: string;
  /** absolute plan coordinates along the wall (X for horizontal walls, Y for vertical), like Opening.at */
  from: number;
  to: number;
  h0: number;
  h1: number;
  finish: 'accent' | 'wood';
}

// ---------------------------------------------------------------------------------------------
// Interiors: partition walls with doors, stairs, floor finishes and furniture, per storey.
// ---------------------------------------------------------------------------------------------

/** which way an item's front faces in the plan: N = −Y (garden side as drawn), S = +Y, E = +X, W = −X */
export type Facing = 'N' | 'S' | 'E' | 'W';

export interface InteriorDoor {
  /** name, for variants that change this door */
  id?: string;
  /** threshold above the storey's floor (negative for a door on a lowered floor); default 0 */
  sill?: number;
  /** centre of the opening, metres along the wall from `a` */
  at: number;
  width: number;
  /** leaf: hinged (default), sliding along the wall, folding in two, or none (an open doorway) */
  kind?: 'swing' | 'sliding' | 'fold' | 'open';
  /** which end of the opening carries the hinges (sliding: the end the leaf is parked beyond) */
  hinge?: 'a' | 'b';
  /** side the leaf opens to, as a plan direction */
  opens: Facing;
}

export interface InteriorWall {
  /** name, for variants that change this wall */
  id?: string;
  a: Vec2;
  b: Vec2;
  /** foot of the wall below the storey's floor (negative), where it stands on a lowered floor; default 0 */
  base?: number;
  /** thickness (default: house.innerWallThickness) */
  t?: number;
  doors?: InteriorDoor[];
  /** a low wall of this height instead of a full-height one */
  h?: number;
  /** a glass balustrade (needs `h`) with a handrail */
  glass?: boolean;
}

export type FloorFinish = 'tile' | 'tileDark' | 'concrete';

export type FurnitureKind =
  | 'dining' | 'sofa' | 'ottoman' | 'coffeeTable' | 'rug' | 'tv' | 'console' | 'fireplace' | 'plant' | 'pendant'
  | 'island' | 'stool' | 'counter' | 'tall' | 'shelf' | 'appliance' | 'wardrobe' | 'bench' | 'desk' | 'armchair'
  | 'bed' | 'nightstand' | 'dresser' | 'wc' | 'basin' | 'shower' | 'bathtub' | 'boiler' | 'tank' | 'washer' | 'rack' | 'rail' | 'block';

export interface FurnitureItem {
  kind: FurnitureKind;
  /** centre in plan coords */
  at: Vec2;
  face?: Facing;
  /** width (across the front), depth (front to back) and height, where the kind allows them */
  w?: number;
  d?: number;
  h?: number;
  /** kind-specific variant: 'sink' / 'hob' (counter), 'fridge' / 'oven' (tall), 'double' (bed, basin), seats (dining) */
  opt?: string | number;
  /** colour variant: dark fronts / dark upholstery */
  dark?: boolean;
  /** floor it stands on, relative to the storey's (negative on a lowered floor) */
  level?: number;
}

/** one straight flight: `treads` steps of `going` from `from` (centre of the first riser) in direction `dir` */
export interface StairFlight {
  from: Vec2; dir: Facing; width: number; treads: number; going: number; rise: number; startLevel: number;
  /** the first so many steps are solid down to the floor (nothing under them) */
  solid?: number;
}
export interface StairLanding { x0: number; x1: number; y0: number; y1: number; level: number }

export interface Storey {
  /** finished floor above ±0.00 */
  level: number;
  /** flat ceiling above this storey's floor; under a roof the sloped ceiling cuts walls and tall furniture */
  height: number;
  /** under a roof: height of the knee wall, i.e. of the sloped ceiling at the inner face of the eaves walls */
  knee?: number;
  walls: InteriorWall[];
  /** floor finishes that are not the default timber boards: [x0, y0, x1, y1] */
  floors: { rect: [number, number, number, number]; finish: FloorFinish; level?: number }[];
  items: FurnitureItem[];
}

export interface Interior {
  ground: Storey;
  /**
   * Part of the ground storey with a lower floor (a split-level garage): its outline (orthogonal),
   * running inside the walls around it and out to the façade where a door opens onto lower ground,
   * and its floor relative to ±0.00. The floor there is concrete.
   */
  lowered?: { outline: Vec2[]; level: number };
  /** the storey on `upperFloor` (a usable attic) */
  upper?: Storey;
  stairs?: { flights: StairFlight[]; landings: StairLanding[] };
}

/** an extra box in plan coords (pergola beams, canopies, posts) */
export interface ExtraBox { x0: number; x1: number; y0: number; y1: number; h0: number; h1: number; part: 'plaster' | 'accent' | 'wood' | 'frame' | 'trim' | 'soffit' | 'plinth' | 'paving' }

export interface HouseView { at: Vec2 | 'valleyWindow'; h: number; look: Vec2 | 'valley'; label: string }

/**
 * A separate building that belongs to a project (e.g. a detached garage). It is a full HouseDef in
 * its own plan coordinates, placed and levelled independently of the main house.
 */
export interface Annex {
  id: string;
  /** short name in the UI ("Garaż") */
  label: string;
  def: HouseDef;
  /** where the annex's plan origin starts, in the main house's plan coords (same bearing as the house) */
  defaultAt: Vec2;
}

export interface HouseDef {
  id: string;
  name: string;
  code: string;
  /** who drew it, for the info panel */
  designer: string;
  width: number;
  depth: number;
  usableArea: number;
  footprintArea: number;
  /** ground to ridge */
  heightTotal: number;
  pitchDeg: number;

  /** finished floor above surrounding ground */
  plinth: number;
  wallThickness: number;
  innerWallThickness: number;
  ceilingHeight: number;
  /** top of ring beam (wieniec) — default wall top */
  wallTop: number;

  roof: Roof;
  /** exterior wall outline, clockwise as drawn (Y down) */
  outline: Vec2[];
  /** exterior walls, one per outline edge, in outline order */
  walls: WallEdge[];
  openings: Opening[];
  /** interior partitions [x1,y1,x2,y2] (axis-aligned) */
  partitions: [number, number, number, number][];
  rooms: { name: string; area: number; at: Vec2 }[];
  paving: Slab[];
  porches: Porch[];

  /** terrace corners measured to the boundary they face, with their outward sides */
  terraceCorners: { at: Vec2; faces: Vec2[] }[];
  /** house corners (outline indices) not dimensioned in the plan view (inner corners) */
  unmeasuredCorners: number[];
  /** house corners dimensioned to both boundaries they face */
  twoEdgeCorners: number[];

  /** ceiling lights inside (plan X,Y) */
  lights: Vec2[];
  /** façade lamps just outside the walls (plan X,Y) */
  wallLamps: Vec2[];
  /** eye-level views from the house */
  views: Record<'valley' | 'terrace' | 'living' | 'kitchen' | 'bedroom', HouseView>;
  /** separate buildings of this project, each placed on its own (detached garage) */
  annexes?: Annex[];

  // ---- optional: houses with a usable attic and richer façades (Argania 2) ----
  /** slab of the upper storey (walkable attic); voids are double-height spaces and the stairwell (plan polygons) */
  upperFloor?: { level: number; thickness: number; voids?: Vec2[][] };
  /** rooms of the upper storey (info only; the plan view shows the ground floor) */
  upperRooms?: { name: string; area: number }[];
  roofWindows?: RoofWindow[];
  /** ceiling over part of the outline only (a wiata open to the roof); default: the whole outline */
  ceilingOutline?: Vec2[];
  facadeZones?: FacadeZone[];
  extras?: ExtraBox[];
  /** real partition walls, doors, stairs, floor finishes and furniture (replaces `partitions` in 3D) */
  interior?: Interior;

  // ---- optional: split-level houses ----
  /** building platform in plan coords (default: the bounding rectangle with a 1 m margin) */
  platform?: Vec2[];
  /** gravel strip around the house in plan coords, a simple polygon (default: 0.5 m all round) */
  apron?: Vec2[];
  lowerGround?: LowerGround;
}
