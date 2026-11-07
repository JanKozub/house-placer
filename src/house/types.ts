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
  /** slab of the upper storey (walkable attic); voids are double-height spaces and the stairwell */
  upperFloor?: { level: number; thickness: number; voids?: { x0: number; x1: number; y0: number; y1: number }[] };
  /** rooms of the upper storey (info only; the plan view shows the ground floor) */
  upperRooms?: { name: string; area: number }[];
  roofWindows?: RoofWindow[];
  /** ceiling over part of the outline only (a wiata open to the roof); default: the whole outline */
  ceilingOutline?: Vec2[];
  facadeZones?: FacadeZone[];
  extras?: ExtraBox[];
}
