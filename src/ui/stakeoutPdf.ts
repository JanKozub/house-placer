/**
 * The staking sheet as a PDF ("Tyczenie palikami"): a sketch of the plot with the house, terrace,
 * driveway and gate and every stake; the stakes measured from the plot borders; the house with its
 * inside walls, measured from its own walls. Loaded only when the user asks for it (jsPDF and the
 * font are not in the main bundle). The font is DejaVu Sans Condensed: PDF's built-in fonts have
 * no ł, ś, ż.
 */
import { jsPDF } from 'jspdf';
import regularUrl from 'dejavu-fonts-ttf/ttf/DejaVuSansCondensed.ttf?url';
import boldUrl from 'dejavu-fonts-ttf/ttf/DejaVuSansCondensed-Bold.ttf?url';
import { f } from './format';
import { pickScale, plotCornerName, type BorderRef, type BorderStake, type StakeoutPlan } from '../placement/stakeout';
import { pointInPolygon, type P2 } from '../placement/geom2d';

export interface PdfFonts { regular: ArrayBuffer | Uint8Array; bold: ArrayBuffer | Uint8Array }

type XY = [number, number];
type Doc = jsPDF;

const INK = '#111827';
const GREY = '#6b7280';
/** the house walls the inside points are measured from (page 3) */
const REF = '#1d4ed8';
const STAKE = '#dc2626';
const GATE = '#b45309';
const HOUSE_FILL = '#eef0f3';
const TERRACE_FILL = '#f4ead8';
const DRIVE_FILL = '#e5e7eb';
/** one light colour per room on the house plan */
const ROOM_COLOURS = ['#fde2cf', '#d6eaf8', '#dff2d3', '#f6dcec', '#fff1b8', '#e3defa', '#cdeee7', '#f9d6d5', '#dfe7ee', '#f1e3cc', '#d8f1fb', '#ece6d2'];

const NOTE =
  'Szkic pomocniczy do zobaczenia domu na działce – nie zastępuje wytyczenia budynku przez geodetę uprawnionego. ' +
  'Granice wg ewidencji gruntów (GUGiK): znaki graniczne w terenie mogą się różnić o kilka–kilkanaście cm. ' +
  'Narożniki domu = zewnętrzne lico ścian (z ociepleniem).';

function toBase64(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const font = (doc: Doc, size: number, bold = false, color = INK) => {
  doc.setFont('DejaVu', bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(color);
};

const pen = (doc: Doc, width: number, color = INK, dash: number[] = []) => {
  doc.setLineWidth(width);
  doc.setDrawColor(color);
  doc.setLineDashPattern(dash, 0);
};

function poly(doc: Doc, pts: XY[], style: 'S' | 'F' | 'FD', closed = true) {
  if (pts.length < 2) return;
  const d = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
  doc.lines(d, pts[0][0], pts[0][1], [1, 1], style, closed);
}

/** text centred on (x, y), optionally on a white box so it stays readable over lines */
function label(doc: Doc, text: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: string; bg?: boolean; angle?: number; align?: 'left' | 'center' | 'right' } = {}) {
  font(doc, o.size ?? 7, o.bold, o.color);
  const align = o.align ?? 'center';
  if (o.bg && !o.angle) {
    const w = doc.getTextWidth(text), h = ((o.size ?? 7) * 0.3528) * 1.05;
    const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    doc.setFillColor('#ffffff');
    doc.rect(x0 - 0.5, y - h / 2 - 0.2, w + 1, h + 0.4, 'F');
  }
  if (!o.angle) {
    doc.text(text, x, y, { align, baseline: 'middle' });
    return;
  }
  // turned text: jsPDF aligns it in the unturned page, so place its baseline start ourselves
  const a = (o.angle * Math.PI) / 180, base: XY = [Math.cos(a), -Math.sin(a)], down: XY = [Math.sin(a), Math.cos(a)];
  const w = doc.getTextWidth(text), drop = (o.size ?? 7) * 0.3528 * 0.36;
  const along = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
  doc.text(text, x + base[0] * along + down[0] * drop, y + base[1] * along + down[1] * drop, { angle: o.angle });
}

/** a stake: circle with a cross */
function stakeMark(doc: Doc, x: number, y: number, r = 0.85, color = STAKE) {
  pen(doc, 0.25, color);
  doc.circle(x, y, r, 'S');
  doc.line(x - r * 1.5, y, x + r * 1.5, y);
  doc.line(x, y - r * 1.5, x, y + r * 1.5);
}

function footer(doc: Doc, page: number, pages: number, w: number, h: number, text = NOTE) {
  font(doc, 6.3, false, GREY);
  const lines = doc.splitTextToSize(text, w - 40) as string[];
  doc.text(lines, 10, h - 3.5 - (lines.length - 1) * 2.6, { baseline: 'bottom' });
  doc.text(`str. ${page}/${pages}`, w - 10, h - 3.5, { align: 'right', baseline: 'bottom' });
}

const title = (doc: Doc, main: string, sub: string) => {
  label(doc, main, 10, 10, { size: 13, bold: true, align: 'left' });
  label(doc, sub, 10, 15.5, { size: 8, color: GREY, align: 'left' });
};

// ---------------------------------------------------------------------------------------------
// Labels that keep clear of each other (boxes may be turned, like text along a sloping line)
// ---------------------------------------------------------------------------------------------
type Quad = [XY, XY, XY, XY];

const unitXY = (v: XY): XY => {
  const L = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / L, v[1] / L];
};

/** do two convex quads overlap? (separating axis test) */
function overlap(a: Quad, b: Quad) {
  for (const q of [a, b])
    for (let i = 0; i < 4; i++) {
      const p = q[i], r = q[(i + 1) % 4];
      const ax: XY = [-(r[1] - p[1]), r[0] - p[0]];
      const proj = (s: Quad) => s.map((v) => v[0] * ax[0] + v[1] * ax[1]);
      const pa = proj(a), pb = proj(b);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  return true;
}

class Placer {
  quads: Quad[] = [];
  /** labels stay inside this box (the drawing area) */
  constructor(private doc: Doc, private bounds: [number, number, number, number] = [0, 0, 1e9, 1e9]) {}
  /** the outline of a label centred on (x, y), turned by `angle` degrees like jsPDF turns text */
  box(text: string, size: number, bold: boolean, x: number, y: number, angle = 0): Quad {
    font(this.doc, size, bold);
    const w = this.doc.getTextWidth(text) + 0.8, h = size * 0.3528 * 1.05 + 0.3;
    const a = (angle * Math.PI) / 180, u: XY = [Math.cos(a), -Math.sin(a)], v: XY = [Math.sin(a), Math.cos(a)];
    const c = (su: number, sv: number): XY => [x + u[0] * su * w / 2 + v[0] * sv * h / 2, y + u[1] * su * w / 2 + v[1] * sv * h / 2];
    return [c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)];
  }
  rect = (x0: number, y0: number, x1: number, y1: number): Quad => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  free = (q: Quad) => q.every(([x, y]) => x >= this.bounds[0] && y >= this.bounds[1] && x <= this.bounds[2] && y <= this.bounds[3]) && !this.quads.some((o) => overlap(o, q));
  take = (q: Quad) => void this.quads.push(q);
  /** keep labels off a drawn line: a thin strip along it */
  line(a: XY, b: XY, half = 0.5) {
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) return;
    const u = unitXY([b[0] - a[0], b[1] - a[1]]), n: XY = [-u[1] * half, u[0] * half];
    this.quads.push([[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]]]);
  }
  /** the first candidate whose box is free (else the first one); its box is taken */
  place(text: string, size: number, bold: boolean, cands: XY[], angle = 0): XY {
    for (const c of cands) {
      const q = this.box(text, size, bold, c[0], c[1], angle);
      if (this.free(q)) { this.take(q); return c; }
    }
    this.take(this.box(text, size, bold, cands[0][0], cands[0][1], angle));
    return cands[0];
  }
  /** candidates around point p: towards `dir` first, then turning away from it, just clear of the point */
  around(text: string, size: number, bold: boolean, p: XY, dir: XY, gap = 1.6): XY[] {
    font(this.doc, size, bold);
    const w = this.doc.getTextWidth(text) + 0.8, h = size * 0.3528 * 1.05 + 0.3;
    const out: XY[] = [];
    for (const extra of [0, 2.5])
      for (const deg of [0, 35, -35, 70, -70, 110, -110, 145, -145, 180]) {
        const a = (deg * Math.PI) / 180;
        const d: XY = [dir[0] * Math.cos(a) - dir[1] * Math.sin(a), dir[0] * Math.sin(a) + dir[1] * Math.cos(a)];
        const r = gap + extra + Math.abs(d[0]) * (w / 2) + Math.abs(d[1]) * (h / 2);
        out.push([p[0] + d[0] * r, p[1] + d[1] * r]);
      }
    return out;
  }
}

// ---------------------------------------------------------------------------------------------
// Dimensions drawn the way the PZT draws them: thin lines, short extension lines, oblique ticks
// where they cross, the value written along the line, above it
// ---------------------------------------------------------------------------------------------
const DIM_LINE = 0.13;

/** text angle (degrees, as jsPDF turns text) for a line along u, readable from the bottom or the
 *  right of the sheet as on a technical drawing: near-vertical text reads upwards */
function readable(u: XY) {
  let a = (-Math.atan2(u[1], u[0]) * 180) / Math.PI;
  if (a > 95) a -= 180;
  if (a <= -85) a += 180;
  return a;
}
/** "up" for text at angle a: the side the text stands on */
const upOf = (a: number): XY => [-Math.sin((a * Math.PI) / 180), -Math.cos((a * Math.PI) / 180)];

/** an oblique tick across a dimension line running along u, at p */
function tick(doc: Doc, p: XY, u: XY, len = 2) {
  const t = unitXY([u[0] - u[1], u[1] + u[0]]); // u turned by 45°
  doc.line(p[0] - (t[0] * len) / 2, p[1] - (t[1] * len) / 2, p[0] + (t[0] * len) / 2, p[1] + (t[1] * len) / 2);
}

/** the value of a dimension along a line from a to b: beside the line, clear of it and of every
 *  other line; if it does not fit there, staggered further out with a thin leader */
function dimText(doc: Doc, placer: Placer, text: string, a: XY, b: XY, size = 6.8) {
  const u = unitXY([b[0] - a[0], b[1] - a[1]]);
  const ang = readable(u), up = upOf(ang);
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const h = (size * 0.3528 * 1.05 + 0.3) / 2 + 0.9;
  const cands: XY[] = [];
  for (const t of [0.5, 0.38, 0.62, 0.26, 0.74, 0.15, 0.85])
    for (const side of [1, -1]) cands.push([a[0] + (b[0] - a[0]) * t + up[0] * h * side, a[1] + (b[1] - a[1]) * t + up[1] * h * side]);
  font(doc, size, false);
  const w = doc.getTextWidth(text);
  const near = cands.length;
  for (const s of [1, -1]) for (const f2 of [2.3, 3.6, 5]) cands.push([a[0] + (b[0] - a[0]) * 0.5 + up[0] * h * f2 * s, a[1] + (b[1] - a[1]) * 0.5 + up[1] * h * f2 * s]);
  for (const s of [-1, 1]) {
    const e = s < 0 ? a : b, d = (w / 2 + 1.5) * s;
    cands.push([e[0] + u[0] * d + up[0] * h, e[1] + u[1] * d + up[1] * h], [e[0] + u[0] * d - up[0] * h, e[1] + u[1] * d - up[1] * h]);
  }
  if (L < w + 1.5) cands.splice(0, near); // beside the line it would cover the ticks
  const at = placer.place(text, size, false, cands, ang);
  // moved away from its line: a thin leader from the middle of the line
  const mid: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const off = (at[0] - mid[0]) * up[0] + (at[1] - mid[1]) * up[1];
  const side = Math.abs((at[0] - mid[0]) * u[0] + (at[1] - mid[1]) * u[1]);
  if (Math.abs(off) > h * 1.6 || side > L / 2) {
    const end: XY = [at[0] - up[0] * Math.sign(off || 1) * (h - 0.6), at[1] - up[1] * Math.sign(off || 1) * (h - 0.6)];
    pen(doc, 0.1, GREY);
    doc.line(mid[0], mid[1], end[0], end[1]);
  }
  label(doc, text, at[0], at[1], { size, angle: ang });
}

// ---------------------------------------------------------------------------------------------
// Pages 1 and 2: the sketch of the plot alone, as large as the page allows (no title, footer or
// north arrow: the user's choice), with a scale bar. The same stakes have their line to a border
// parallel to the house walls on the first and square to the border on the second.
// ---------------------------------------------------------------------------------------------
type LineMode = 'wall' | 'square';
const MODE_CAPTION: Record<LineMode, string> = { wall: 'linie równoległe do ścian domu', square: 'linie prostopadłe do granic' };

function sketchPage(doc: Doc, plan: StakeoutPlan, mode: LineMode) {
  const W = 297, H = 210, M = 11.5; // M: room for the dimensions outside the borders
  const box = { x: 5, y: 5, w: W - 10, h: H - 10 };
  // turned so the house front points down the page: the plot as seen walking in from the gate
  const th = Math.PI / 2 - Math.atan2(plan.frontDir[1], plan.frontDir[0]);
  const c = Math.cos(th), s = Math.sin(th);
  const rot = (v: P2 | XY): XY => [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
  const pts = [...plan.parcel, ...plan.stakes.map((st) => st.p)].map(rot);
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
  const minZ = Math.min(...pts.map((p) => p[1])), maxZ = Math.max(...pts.map((p) => p[1]));
  // the largest scale that fits, to the next 1:5 (1:225 for plot 664/2)
  const scale = Math.ceil(Math.max(((maxX - minX) * 1000) / (box.w - 2 * M), ((maxZ - minZ) * 1000) / (box.h - 2 * M)) / 5) * 5;
  const k = 1000 / scale;
  const ox = box.x + (box.w - (maxX - minX) * k) / 2, oy = box.y + (box.h - (maxZ - minZ) * k) / 2;
  const P = (p: P2): XY => {
    const r = rot(p);
    return [ox + (r[0] - minX) * k, oy + (r[1] - minZ) * k];
  };
  const pc = P(plan.plotCentre);
  const placer = new Placer(doc, [box.x, box.y, box.x + box.w, box.y + box.h]);
  const gateKind = (st: BorderStake) => st.kind === 'gate' || st.kind === 'wicket';
  const LINE = 0.45; // labels keep this far off every drawn line (and a little more, see dimText)

  // ---- drawing ----
  // driveway and terrace under everything else
  for (const d of plan.driveways) {
    doc.setFillColor(DRIVE_FILL);
    pen(doc, 0.2, GREY, [1, 0.7]);
    poly(doc, d.map(P), 'FD');
  }
  if (plan.terrace) {
    doc.setFillColor(TERRACE_FILL);
    pen(doc, 0.2, GREY);
    poly(doc, plan.terrace.map(P), 'FD');
  }
  // numbers keep off their edges too
  for (const ring of [...plan.driveways, ...(plan.terrace ? [plan.terrace] : [])]) ring.forEach((p, i) => placer.line(P(p), P(ring[(i + 1) % ring.length]), 0.35));
  // the plot, with a boundary marker at each corner
  pen(doc, 0.6, INK);
  poly(doc, plan.parcel.map(P), 'S');
  plan.parcel.forEach((corner, i) => {
    const [x, y] = P(corner);
    doc.setFillColor(INK);
    doc.rect(x - 0.9, y - 0.9, 1.8, 1.8, 'F');
    placer.take(placer.rect(x - 1.2, y - 1.2, x + 1.2, y + 1.2));
    placer.line([x, y], P(plan.parcel[(i + 1) % plan.parcel.length]), 0.6);
  });
  // gate and wicket: thick marks on the border
  for (const g of plan.gates) {
    const a = P(g.a), b = P(g.b);
    pen(doc, 1.1, GATE);
    doc.line(a[0], a[1], b[0], b[1]);
    placer.line(a, b, 0.9);
  }
  // buildings
  const building = (fp: P2[], parts: [P2, P2][]) => {
    doc.setFillColor(HOUSE_FILL);
    pen(doc, 0.5, INK);
    poly(doc, fp.map(P), 'FD');
    fp.forEach((p, i) => placer.line(P(p), P(fp[(i + 1) % fp.length]), 0.5));
    pen(doc, 0.12, GREY);
    for (const [a, b] of parts) {
      const p = P(a), q = P(b);
      doc.line(p[0], p[1], q[0], q[1]);
    }
  };
  building(plan.footprint, plan.partitions);
  for (const b of plan.buildings) building(b.footprint, b.partitions);

  // ---- the house frame: u along the back wall A→B, v into the house (the terrace has v < 0) ----
  const hA = plan.footprint[0], hB = plan.footprint[1], hL = Math.hypot(hB[0] - hA[0], hB[1] - hA[1]);
  const hX: P2 = [(hB[0] - hA[0]) / hL, (hB[1] - hA[1]) / hL];
  let hN: P2 = [-hX[1], hX[0]];
  const fc = plan.footprint.reduce((m, p) => [m[0] + p[0] / plan.footprint.length, m[1] + p[1] / plan.footprint.length], [0, 0]);
  if ((fc[0] - hA[0]) * hN[0] + (fc[1] - hA[1]) * hN[1] < 0) hN = [-hN[0], -hN[1]];
  const uv = (p: P2): [number, number] => [(p[0] - hA[0]) * hX[0] + (p[1] - hA[1]) * hX[1], (p[0] - hA[0]) * hN[0] + (p[1] - hA[1]) * hN[1]];
  const fromUV = (u: number, v: number): P2 => [hA[0] + hX[0] * u + hN[0] * v, hA[1] + hX[1] * u + hN[1] * v];
  const houseCorners = plan.stakes.filter((st) => st.kind === 'house');
  const terraceStakes = plan.terrace ? plan.stakes.filter((st) => st.kind === 'terrace') : [];

  // the stakes with a line to a border (see `lines` in stakeout.ts), drawn the way this page shows them
  const dims = plan.lines.flatMap((l) => {
    const st = plan.stakes.find((x) => x.label === l.label);
    return st ? [{ st, r: l[mode] }] : [];
  });
  for (const { st, r } of dims) {
    const p = P(st.p), q = P(r.foot), u = unitXY([q[0] - p[0], q[1] - p[1]]);
    pen(doc, DIM_LINE, INK);
    doc.line(p[0], p[1], q[0], q[1]);
    tick(doc, q, u);
    placer.line(p, q, LINE);
  }

  // along every border, outside the plot: the distances between the corners, the feet of those
  // measurements and the gate posts (a chain), and further out the whole border
  const OFF1 = 6.5, OFF2 = 11.5, GAP = 1, EXT = 1.3;
  const chainTexts: { text: string; a: XY; b: XY; size: number }[] = [];
  for (const b of plan.borders) {
    const A = plan.parcel[b.from], C = plan.parcel[b.to];
    const pa = P(A), pb = P(C), L = b.length;
    const u = unitXY([pb[0] - pa[0], pb[1] - pa[1]]);
    let o: XY = [-u[1], u[0]];
    if (((pa[0] + pb[0]) / 2 - pc[0]) * o[0] + ((pa[1] + pb[1]) / 2 - pc[1]) * o[1] < 0) o = [-o[0], -o[1]];
    const dir: P2 = [(C[0] - A[0]) / L, (C[1] - A[1]) / L];
    const along = (q: P2) => (q[0] - A[0]) * dir[0] + (q[1] - A[1]) * dir[1];
    // points in order of importance: corners, measured feet, gate posts, wicket posts; a post within
    // 30 cm of a point already there is left out (its distance is in the table)
    const cand = [
      { s: 0, rank: 0 }, { s: L, rank: 0 },
      ...dims.filter((d) => d.r.edge === b.edge).map((d) => ({ s: d.r.s, rank: 1 })),
      ...plan.gates.filter((g) => g.edge === b.edge).flatMap((g) => [g.a, g.b].map((q) => ({ s: along(q), rank: g.kind === 'sliding' ? 2 : 3 }))),
    ].sort((x, y) => x.rank - y.rank);
    const kept: number[] = [];
    for (const p of cand) if (!kept.some((q) => Math.abs(q - p.s) < (p.rank >= 2 ? 0.3 : 0.005))) kept.push(Math.max(0, Math.min(L, p.s)));
    kept.sort((x, y) => x - y);
    const at = (sv: number, off: number): XY => [pa[0] + u[0] * sv * k + o[0] * off, pa[1] + u[1] * sv * k + o[1] * off];
    const overall = kept.length > 2;
    pen(doc, DIM_LINE, INK);
    for (const sv of kept) {
      const end = overall && (sv === 0 || sv === L) ? OFF2 : OFF1;
      const e0 = at(sv, GAP), e1 = at(sv, end + EXT);
      doc.line(e0[0], e0[1], e1[0], e1[1]);
      placer.line(e0, e1, LINE);
      tick(doc, at(sv, OFF1), u);
    }
    for (const off of overall ? [OFF1, OFF2] : [OFF1]) {
      const d0 = at(0, off), d1 = at(L, off);
      const e0: XY = [d0[0] - u[0] * 1.5, d0[1] - u[1] * 1.5], e1: XY = [d1[0] + u[0] * 1.5, d1[1] + u[1] * 1.5];
      doc.line(e0[0], e0[1], e1[0], e1[1]);
      placer.line(e0, e1, LINE);
    }
    if (overall) for (const sv of [0, L]) tick(doc, at(sv, OFF2), u);
    if (overall) for (let i = 1; i < kept.length; i++) chainTexts.push({ text: f(kept[i] - kept[i - 1]), a: at(kept[i - 1], OFF1), b: at(kept[i], OFF1), size: 6.8 });
    const off = overall ? OFF2 : OFF1;
    chainTexts.push({ text: `granica ${b.edge + 1}: ${f(L)}`, a: at(0, off), b: at(L, off), size: 7 });
  }

  // ---- the house and terrace dimensioned like an architect's plan: a chain along each side through
  // the corners that side can see (within 4 m, nothing of the house or terrace in between); a wall
  // no chain covers gets its own dimension ----
  const outlineTexts: { text: string; a: XY; b: XY }[] = [];
  {
    const blocks: P2[][] = [plan.footprint, ...(plan.terrace ? [plan.terrace] : [])];
    const blocked = (u: number, v: number) => blocks.some((b) => pointInPolygon(fromUV(u, v), b));
    const pts = [...houseCorners, ...terraceStakes].map((st) => ({ st, c: uv(st.p) }));
    const ext = [...plan.footprint, ...(plan.terrace ?? [])].map(uv);
    const bx = { u0: Math.min(...ext.map((e) => e[0])), u1: Math.max(...ext.map((e) => e[0])), v0: Math.min(...ext.map((e) => e[1])), v1: Math.max(...ext.map((e) => e[1])) };
    const seg = (a: XY, b: XY) => { doc.line(a[0], a[1], b[0], b[1]); placer.line(a, b, LINE); };
    const add = (p: XY, v: XY, d: number): XY => [p[0] + v[0] * d, p[1] + v[1] * d];
    const covered: [number, number, number][] = [];
    pen(doc, DIM_LINE, INK);
    const sides: { axis: 0 | 1; dir: [number, number]; edge: number }[] = [
      { axis: 0, dir: [0, -1], edge: bx.v0 }, { axis: 0, dir: [0, 1], edge: bx.v1 },
      { axis: 1, dir: [-1, 0], edge: bx.u0 }, { axis: 1, dir: [1, 0], edge: bx.u1 },
    ];
    for (const sd of sides) {
      const depth = (c: [number, number]) => Math.abs((sd.axis === 0 ? c[1] : c[0]) - sd.edge);
      const sees = (c: [number, number]) => {
        for (let t = 0.05; t < depth(c); t += 0.1) {
          const u = c[0] + sd.dir[0] * t, v = c[1] + sd.dir[1] * t;
          if (sd.axis === 0 ? blocked(u - 0.01, v) && blocked(u + 0.01, v) : blocked(u, v - 0.01) && blocked(u, v + 0.01)) return false;
        }
        return true;
      };
      const vis: { val: number; st: BorderStake }[] = [];
      for (const q of pts.filter((q) => depth(q.c) <= 4 && sees(q.c)).sort((a, b) => depth(a.c) - depth(b.c))) {
        const val = sd.axis === 0 ? q.c[0] : q.c[1];
        if (!vis.some((e) => Math.abs(e.val - val) < 0.01)) vis.push({ val, st: q.st });
      }
      if (vis.length < 2) continue;
      vis.sort((a, b) => a.val - b.val);
      const on = (val: number): P2 => (sd.axis === 0 ? fromUV(val, sd.edge) : fromUV(sd.edge, val));
      const o0 = P(on(vis[0].val)), o1 = P(sd.axis === 0 ? fromUV(vis[0].val + 0 * sd.dir[0], sd.edge + sd.dir[1]) : fromUV(sd.edge + sd.dir[0], vis[0].val));
      const n = unitXY([o1[0] - o0[0], o1[1] - o0[1]]);
      const at = vis.map((e) => add(P(on(e.val)), n, 5));
      const u = unitXY([at[at.length - 1][0] - at[0][0], at[at.length - 1][1] - at[0][1]]);
      vis.forEach((e, i) => {
        seg(add(P(e.st.p), n, 1), add(at[i], n, 1.3));
        tick(doc, at[i], u);
      });
      seg(add(at[0], u, -1.5), add(at[at.length - 1], u, 1.5));
      for (let i = 1; i < vis.length; i++) {
        outlineTexts.push({ text: f(vis[i].val - vis[i - 1].val), a: at[i - 1], b: at[i] });
        covered.push([sd.axis, vis[i - 1].val, vis[i].val]);
      }
    }
    // walls between house corners that no chain covers (the back wall under the terrace, a wall at an inner corner)
    const fpPage = plan.footprint.map(P);
    houseCorners.forEach((c, i) => {
      const d = houseCorners[(i + 1) % houseCorners.length];
      const cu = uv(c.p), du = uv(d.p), axis = Math.abs(cu[1] - du[1]) < 0.01 ? 0 : 1;
      const lo = Math.min(cu[axis], du[axis]), hi = Math.max(cu[axis], du[axis]);
      if (covered.some(([ax, a, b]) => ax === axis && Math.abs(a - lo) < 0.01 && Math.abs(b - hi) < 0.01)) return;
      const pa = P(c.p), pb = P(d.p), u = unitXY([pb[0] - pa[0], pb[1] - pa[1]]);
      let n: XY = [-u[1], u[0]];
      const mid: XY = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
      if (pointInPolygon([mid[0] + n[0] * 0.5, mid[1] + n[1] * 0.5], fpPage as P2[])) n = [-n[0], -n[1]];
      const off = 4;
      const a0 = add(pa, n, off), b0 = add(pb, n, off);
      seg(add(pa, n, 1), add(a0, n, 1.3));
      seg(add(pb, n, 1), add(b0, n, 1.3));
      seg(add(a0, u, -1.5), add(b0, u, 1.5));
      tick(doc, a0, u);
      tick(doc, b0, u);
      outlineTexts.push({ text: f(Math.hypot(d.p[0] - c.p[0], d.p[1] - c.p[1])), a: a0, b: b0 });
    });
  }

  // stakes
  for (const st of plan.stakes) {
    const [x, y] = P(st.p);
    stakeMark(doc, x, y, 0.8, gateKind(st) ? GATE : STAKE);
    placer.take(placer.rect(x - 1.3, y - 1.3, x + 1.3, y + 1.3));
  }

  // scale bar, in a corner of the page the drawing leaves free
  const plotPage = plan.parcel.map(P);
  const corner = (w: number, h: number, order: ('tl' | 'tr' | 'bl' | 'br')[]): XY => {
    const spots = order.map((o): XY => [o[1] === 'l' ? box.x + 1 : box.x + box.w - w - 1, o[0] === 't' ? box.y + 1 : box.y + box.h - h - 1]);
    const ok = (p: XY) => {
      const q = placer.rect(p[0], p[1], p[0] + w, p[1] + h);
      return placer.free(q) && !q.some((v) => pointInPolygon(v as P2, plotPage as P2[]));
    };
    const at = spots.find(ok) ?? spots[0];
    placer.take(placer.rect(at[0], at[1], at[0] + w, at[1] + h));
    return at;
  };
  // with a one-line caption under it saying which way this page's lines run
  font(doc, 7, true);
  const len = 10 * k, sb = corner(Math.max(len + 8, doc.getTextWidth(MODE_CAPTION[mode]) + 3), 11, ['bl', 'tl', 'br', 'tr']);
  const sx = sb[0] + 1, sy = sb[1] + 5.5;
  label(doc, MODE_CAPTION[mode], sx, sy + 4.2, { size: 7, bold: true, align: 'left' });
  pen(doc, 0.4, INK);
  doc.line(sx, sy, sx + len, sy);
  for (const t of [0, 5, 10]) {
    doc.line(sx + t * k, sy - 1, sx + t * k, sy + 1);
    label(doc, `${t}`, sx + t * k, sy - 2.6, { size: 6 });
  }
  label(doc, 'm', sx + len + 2.5, sy, { size: 6 });

  // ---- labels, most important first ----
  for (const t of chainTexts) dimText(doc, placer, t.text, t.a, t.b, t.size);
  plan.parcel.forEach((cn, i) => {
    const p = P(cn), n = plan.parcel.length;
    // inside the plot, along the bisector of the two borders meeting here
    const a = unitXY([P(plan.parcel[(i + n - 1) % n])[0] - p[0], P(plan.parcel[(i + n - 1) % n])[1] - p[1]]);
    const b = unitXY([P(plan.parcel[(i + 1) % n])[0] - p[0], P(plan.parcel[(i + 1) % n])[1] - p[1]]);
    let dir = unitXY([a[0] + b[0], a[1] + b[1]]);
    if ((pc[0] - p[0]) * dir[0] + (pc[1] - p[1]) * dir[1] < 0) dir = [-dir[0], -dir[1]];
    const text = plotCornerName(i);
    const at = placer.place(text, 10, true, placer.around(text, 10, true, p, dir, 2));
    label(doc, text, at[0], at[1], { size: 10, bold: true });
  });
  for (const st of plan.stakes) {
    const p = P(st.p);
    // gate and wicket posts: inside the plot (the dimensions run outside)
    const dir: XY = gateKind(st) ? unitXY([pc[0] - p[0], pc[1] - p[1]]) : rot(st.out);
    const at = placer.place(st.label, 7.4, true, placer.around(st.label, 7.4, true, p, dir));
    // pushed away from its stake (posts close together): a thin leader to it
    const q = placer.box(st.label, 7.4, true, at[0], at[1]);
    const w = q[1][0] - q[0][0], h = q[2][1] - q[1][1];
    const d: XY = [at[0] - p[0], at[1] - p[1]], L = Math.hypot(d[0], d[1]);
    const reach = (Math.abs(d[0]) / L) * (w / 2) + (Math.abs(d[1]) / L) * (h / 2);
    if (L > reach + 3) {
      pen(doc, 0.12, gateKind(st) ? GATE : STAKE);
      doc.line(p[0] + (d[0] / L) * 1.3, p[1] + (d[1] / L) * 1.3, at[0] - (d[0] / L) * (reach + 0.3), at[1] - (d[1] / L) * (reach + 0.3));
    }
    label(doc, st.label, at[0], at[1], { size: 7.4, bold: true, color: gateKind(st) ? GATE : STAKE, bg: true });
  }
  for (const { st, r } of dims) dimText(doc, placer, f(r.d), P(st.p), P(r.foot));
  for (const t of outlineTexts) dimText(doc, placer, t.text, t.a, t.b);
  for (const g of plan.gates) {
    const a = P(g.a), b = P(g.b);
    const mid: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const text = `${g.name} ${f(g.width)} m`;
    const at = placer.place(text, 6.8, true, placer.around(text, 6.8, true, mid, unitXY([pc[0] - mid[0], pc[1] - mid[1]]), 3.5));
    label(doc, text, at[0], at[1], { size: 6.8, bold: true, color: GATE, bg: true });
  }
}

// ---------------------------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------------------------
interface Cell { text: string; bold?: boolean; color?: string }
type Col = { title: string; w: number; align?: 'left' | 'right' | 'center' };

/** a table that continues on a new page; returns the y after it */
function table(doc: Doc, x: number, y: number, cols: Col[], rows: (string | Cell)[][], newPage: () => number, rowH = 5.4, bottom = 297 - 16) {
  const header = (yy: number) => {
    doc.setFillColor('#f3f4f6');
    doc.rect(x, yy - rowH / 2, cols.reduce((s, c) => s + c.w, 0), rowH, 'F');
    let cx = x;
    for (const c of cols) {
      const tx = c.align === 'right' ? cx + c.w - 1.5 : c.align === 'center' ? cx + c.w / 2 : cx + 1.5;
      label(doc, c.title, tx, yy, { size: 6.8, bold: true, align: c.align ?? 'left' });
      cx += c.w;
    }
    return yy + rowH;
  };
  y = header(y);
  for (const r of rows) {
    if (y + rowH / 2 > bottom) y = header(newPage());
    let cx = x;
    r.forEach((cell, i) => {
      const c = cols[i], cl: Cell = typeof cell === 'string' ? { text: cell } : cell;
      const tx = c.align === 'right' ? cx + c.w - 1.5 : c.align === 'center' ? cx + c.w / 2 : cx + 1.5;
      label(doc, cl.text, tx, y, { size: 7.4, bold: cl.bold, color: cl.color, align: c.align ?? 'left' });
      cx += c.w;
    });
    pen(doc, 0.1, '#d1d5db');
    doc.line(x, y + rowH / 2, cx, y + rowH / 2);
    y += rowH;
  }
  return y;
}

function paragraph(doc: Doc, text: string, x: number, y: number, w: number, size = 8, color = INK) {
  font(doc, size, false, color);
  const lines = doc.splitTextToSize(text, w) as string[];
  doc.text(lines, x, y, { baseline: 'top', lineHeightFactor: 1.3 });
  return y + lines.length * size * 0.3528 * 1.3;
}

// ---------------------------------------------------------------------------------------------
// Page 2: stakes from the plot borders
// ---------------------------------------------------------------------------------------------
function bordersPage(doc: Doc, plan: StakeoutPlan, head: string) {
  doc.addPage('a4', 'portrait');
  title(doc, 'Paliki – odległości od granic działki', head);
  let y = 22;
  const steps = [
    'Odszukaj znaki graniczne w narożnikach działki (I–VI, patrz szkic) i rozciągnij sznurek wzdłuż granicy, od której mierzysz.',
    'Od podanego narożnika odmierz wzdłuż sznurka odległość „wzdłuż” i zaznacz to miejsce na granicy.',
    'Prostopadle do granicy (szkic na str. 2): wyznacz tam kąt prosty do granicy (trójkąt 3-4-5: 3 m wzdłuż sznurka, 4 m w głąb, przekątna 5 m) i odmierz „w głąb” – tu wbij palik.',
    'Równolegle do ścian domu (szkic na str. 1): z tego miejsca linia biegnie w przedłużeniu ściany domu. Gdy sąsiednie narożniki stoją, przedłuż sznurek wzdłuż ściany do granicy – powinien trafić w to miejsce, a palik stać w podanej odległości od granicy.',
    'Paliki bez linii na szkicach (np. A, F, T2) wyznacz z wymiarów ścian domu i tarasu. Kilka centymetrów różnicy między sposobami to norma.',
  ];
  steps.forEach((st, i) => {
    label(doc, `${i + 1}.`, 12, y + 1.6, { size: 8, bold: true, align: 'left' });
    y = paragraph(doc, st, 17, y, 180) + 1.2;
  });
  y += 4;
  const newPage = () => {
    doc.addPage('a4', 'portrait');
    title(doc, 'Paliki – odległości od granic działki (cd.)', head);
    return 26;
  };
  const gateKind = (s: BorderStake) => s.kind === 'gate' || s.kind === 'wicket';
  // one measurement as four cells: border, plot corner, along the border, from the border to the stake
  const cells = (s: BorderStake, r: BorderRef | undefined): (string | Cell)[] =>
    r ? [{ text: String(r.edge + 1), bold: true }, plotCornerName(r.corner), { text: f(r.along), bold: true }, { text: gateKind(s) ? 'na granicy' : f(r.d), bold: true }] : ['–', '', '', ''];
  const rows = plan.stakes.map((s): (string | Cell)[] => {
    const line = plan.lines.find((l) => l.label === s.label);
    const square = line?.square ?? s.refs[0];
    const what: Cell = !s.inside ? { text: `${s.what} – POZA DZIAŁKĄ`, color: STAKE, bold: true } : { text: s.what };
    return [{ text: s.label, bold: true, color: gateKind(s) ? GATE : STAKE }, what, ...cells(s, line?.wall), ...cells(s, square)];
  });
  const group: Col[] = [{ title: 'Granica', w: 13, align: 'center' }, { title: 'Od narożn.', w: 16, align: 'center' }, { title: 'Wzdłuż', w: 17, align: 'right' }];
  const cols: Col[] = [
    { title: 'Palik', w: 12 }, { title: 'Co oznacza', w: 36 },
    ...group, { title: 'Odległość', w: 19, align: 'right' },
    ...group, { title: 'W głąb', w: 19, align: 'right' },
  ];
  // two groups of columns: the two ways of measuring, as on the two sketches
  const gx = 10 + 12 + 36, gw = 13 + 16 + 17 + 19;
  for (const [i, text] of ['Równolegle do ścian domu (str. 1) [m]', 'Prostopadle do granicy (str. 2) [m]'].entries()) {
    doc.setFillColor(i ? '#e8eef7' : '#f4ead8');
    doc.rect(gx + i * gw, y - 2.6, gw, 5.2, 'F');
    label(doc, text, gx + i * gw + gw / 2, y, { size: 7, bold: true });
  }
  y += 5.4;
  y = table(doc, 10, y, cols, rows, newPage);

  // squaring up the house
  y += 6;
  if (y > 297 - 50) y = newPage();
  label(doc, 'Kontrola wymiarów domu', 10, y, { size: 9, bold: true, align: 'left' });
  y += 4;
  y = paragraph(doc, 'Gdy narożniki domu są wbite, zmierz taśmą odległości między nimi. Różnicę większą niż 2–3 cm popraw, przesuwając paliki.', 10, y, 190, 7.6, GREY) + 2;
  y = paragraph(doc, `Długości ścian: ${plan.checks.walls.map((w) => `${w.a}–${w.b} ${f(w.d)}`).join(' · ')} m`, 10, y, 190, 8) + 1.5;
  if (plan.checks.fromA.length) y = paragraph(doc, `Przekątne: ${plan.checks.fromA.map((w) => `${w.a}–${w.b} ${f(w.d)}`).join(' · ')} m`, 10, y, 190, 8);
}

// ---------------------------------------------------------------------------------------------
// Page 3 (and 4): the house with its inside walls, measured from its own walls
// ---------------------------------------------------------------------------------------------
function housePage(doc: Doc, plan: StakeoutPlan, head: string) {
  doc.addPage('a4', 'portrait');
  const h = plan.house;
  const [ab0, ab1] = h.refAB, [sd0, sd1] = h.refSide;
  const PAGE_H = 297, BOTTOM = 22;
  title(doc, 'Dom – pomieszczenia i ściany wewnętrzne', `${head} · rzut parteru`);
  const y = paragraph(
    doc,
    `Gdy narożniki domu są wbite, rozciągnij sznurki wzdłuż ściany ${ab0}–${ab1} i ściany ${sd0}–${sd1} (na niebiesko, po zewnętrznym licu). ` +
      `Każdy ponumerowany punkt leży w podanych w tabeli odległościach od obu sznurków – mierz prostopadle do sznurka. ` +
      `Ściany są tu liniami, bez grubości: zewnętrzne po zewnętrznym licu (jak paliki narożników), wewnętrzne w osi; punkty to miejsca, gdzie ściana się zaczyna, kończy lub łączy z inną` +
      (h.exactPartitions ? '.' : '; w tym projekcie układ ścian wewnętrznych jest przybliżony.'),
    10, 21, 190, 8,
  );
  // the house as drawn in the project's plans (garden side up); mirrored placements are drawn mirrored
  const mx = (X: number) => (h.mirrored ? h.width - X : X);
  const pts: [number, number][] = [...h.outline, ...(h.terrace ?? [])].map(([X, Y]) => [mx(X), Y]);
  const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1])), maxY = Math.max(...pts.map((p) => p[1]));
  const M = 7, top = y + 3;
  const scale = pickScale(maxX - minX, maxY - minY, 190 - 2 * M, PAGE_H - BOTTOM - top - 2 * M);
  const k = 1000 / scale;
  const ox = 10 + (190 - (maxX - minX) * k) / 2, oy = top + M;
  // the table goes under the drawing when it fits there, else on its own page
  const rowH = 4.9, perBlock = Math.ceil(plan.inside.length / 2);
  // below the drawing and the dimensions under it
  const tableTop = oy + (maxY - minY) * k + 15;
  const tableHere = tableTop + (perBlock + 0.5) * rowH <= PAGE_H - 16;
  const P = ([X, Y]: [number, number]): XY => [ox + (mx(X) - minX) * k, oy + (Y - minY) * k];
  label(doc, `skala 1:${scale}`, 200, 15.5, { size: 8, color: GREY, align: 'right' });
  const placer = new Placer(doc);

  if (h.terrace) {
    doc.setFillColor(TERRACE_FILL);
    pen(doc, 0.2, GREY);
    poly(doc, h.terrace.map(P), 'FD');
  }
  doc.setFillColor('#ffffff');
  pen(doc, 0.6, INK);
  poly(doc, h.outline.map(P), 'FD');
  // every room in its own colour, up to the wall lines (no wall thickness)
  const colour = (i: number) => ROOM_COLOURS[i % ROOM_COLOURS.length];
  h.rooms.forEach((r, i) => {
    doc.setFillColor(colour(i));
    for (const [x0, y0, x1, y1] of r.cells) {
      const a = P([x0, y0]), b = P([x1, y1]);
      // a hair larger, so neighbouring cells of one room show no seam
      doc.rect(Math.min(a[0], b[0]) - 0.03, Math.min(a[1], b[1]) - 0.03, Math.abs(b[0] - a[0]) + 0.06, Math.abs(b[1] - a[1]) + 0.06, 'F');
    }
  });
  pen(doc, 0.35, '#374151');
  for (const w of h.walls) {
    const a = P(w.a as [number, number]), b = P(w.b as [number, number]);
    doc.line(a[0], a[1], b[0], b[1]);
  }
  pen(doc, 0.6, INK);
  poly(doc, h.outline.map(P), 'S');
  const o = h.outline, last = o.length - 1;
  const hc = P([o.reduce((s, v) => s + v[0], 0) / o.length, o.reduce((s, v) => s + v[1], 0) / o.length]);
  // reference walls
  const walls: [[number, number], [number, number], string][] = [[o[0], o[1], `ściana ${ab0}–${ab1}`], [o[last], o[0], `ściana ${sd0}–${sd1}`]];
  for (const [a, b] of walls) {
    const p = P(a), q = P(b);
    pen(doc, 1.1, REF);
    doc.line(p[0], p[1], q[0], q[1]);
  }
  // inside points
  for (const s of plan.inside) {
    const [x, y2] = P(s.plan as [number, number]);
    doc.setFillColor(STAKE);
    doc.circle(x, y2, 0.55, 'F');
    placer.take(placer.rect(x - 0.8, y2 - 0.8, x + 0.8, y2 + 0.8));
  }

  // ---- the walls' lengths, like an architect's plan ----
  // Outer walls: a chain along each side of the house, through the corners that side can see (within
  // 4 m, with nothing of the house in between); a wall no chain covers (beside an inner corner) gets
  // its own dimension. Inner walls: their length written along them.
  const outlinePage = o.map((v) => P(v as [number, number]));
  for (const w of h.walls) placer.line(P(w.a as [number, number]), P(w.b as [number, number]), 0.3);
  outlinePage.forEach((p, i) => placer.line(p, outlinePage[(i + 1) % outlinePage.length], 0.4));
  const real = o.flatMap((v, i) => (h.cornerLabels[i] ? [v as [number, number]] : []));
  const bx = { x0: Math.min(...o.map((v) => v[0])), x1: Math.max(...o.map((v) => v[0])), y0: Math.min(...o.map((v) => v[1])), y1: Math.max(...o.map((v) => v[1])) };
  const interior = (X: number, Y: number) => pointInPolygon([X, Y], o as P2[]);
  const DOFF = 7;
  const wallTexts: { text: string; a: XY; b: XY }[] = [];
  const covered: [number, number, number][] = []; // axis (0: along X, 1: along Y), from, to
  const dimLine = (from: XY[], at: XY[], u: XY, n: XY) => {
    pen(doc, DIM_LINE, INK);
    from.forEach((p, i) => {
      const e0: XY = [p[0] + n[0], p[1] + n[1]], e1: XY = [at[i][0] + n[0] * 1.3, at[i][1] + n[1] * 1.3];
      doc.line(e0[0], e0[1], e1[0], e1[1]);
      placer.line(e0, e1, 0.45);
      tick(doc, at[i], u);
    });
    const a: XY = [at[0][0] - u[0] * 1.5, at[0][1] - u[1] * 1.5], b: XY = [at[at.length - 1][0] + u[0] * 1.5, at[at.length - 1][1] + u[1] * 1.5];
    doc.line(a[0], a[1], b[0], b[1]);
    placer.line(a, b, 0.45);
  };
  const sides: { axis: 0 | 1; dir: [number, number]; edge: number }[] = [
    { axis: 0, dir: [0, -1], edge: bx.y0 }, { axis: 0, dir: [0, 1], edge: bx.y1 },
    { axis: 1, dir: [-1, 0], edge: bx.x0 }, { axis: 1, dir: [1, 0], edge: bx.x1 },
  ];
  for (const sd of sides) {
    const depth = (c: [number, number]) => Math.abs((sd.axis === 0 ? c[1] : c[0]) - sd.edge);
    // the line from the corner to the side runs outside the house, or along its walls
    const sees = (c: [number, number]) => {
      const d = depth(c);
      for (let t = 0.05; t < d; t += 0.1) {
        const X = c[0] + sd.dir[0] * t, Y = c[1] + sd.dir[1] * t;
        const blocked = sd.axis === 0 ? interior(X - 0.01, Y) && interior(X + 0.01, Y) : interior(X, Y - 0.01) && interior(X, Y + 0.01);
        if (blocked) return false;
      }
      return true;
    };
    const vis: { v: number; c: [number, number] }[] = [];
    for (const c of real.filter((cc) => depth(cc) <= 4 && sees(cc)).sort((p, q) => depth(p) - depth(q))) {
      const v = sd.axis === 0 ? c[0] : c[1];
      if (!vis.some((e) => Math.abs(e.v - v) < 0.01)) vis.push({ v, c });
    }
    if (vis.length < 2) continue;
    vis.sort((p, q) => p.v - q.v);
    const on = (v: number): [number, number] => (sd.axis === 0 ? [v, sd.edge] : [sd.edge, v]);
    const n = unitXY([P(on(vis[0].v))[0] - P([on(vis[0].v)[0] - sd.dir[0], on(vis[0].v)[1] - sd.dir[1]])[0], P(on(vis[0].v))[1] - P([on(vis[0].v)[0] - sd.dir[0], on(vis[0].v)[1] - sd.dir[1]])[1]]);
    const at = vis.map((e) => { const p = P(on(e.v)); return [p[0] + n[0] * DOFF, p[1] + n[1] * DOFF] as XY; });
    const u = unitXY([at[at.length - 1][0] - at[0][0], at[at.length - 1][1] - at[0][1]]);
    dimLine(vis.map((e) => P(e.c)), at, u, n);
    for (let i = 1; i < vis.length; i++) {
      wallTexts.push({ text: f(vis[i].v - vis[i - 1].v), a: at[i - 1], b: at[i] });
      covered.push([sd.axis, vis[i - 1].v, vis[i].v]);
    }
  }
  real.forEach((c, i) => {
    const d = real[(i + 1) % real.length];
    const axis = Math.abs(c[1] - d[1]) < 1e-6 ? 0 : 1;
    const lo = Math.min(c[axis], d[axis]), hi = Math.max(c[axis], d[axis]);
    if (covered.some(([ax, a, b]) => ax === axis && Math.abs(a - lo) < 0.01 && Math.abs(b - hi) < 0.01)) return;
    const pa = P(c), pb = P(d), u = unitXY([pb[0] - pa[0], pb[1] - pa[1]]);
    let n: XY = [-u[1], u[0]];
    const mid: XY = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
    if (pointInPolygon([mid[0] + n[0] * 0.5, mid[1] + n[1] * 0.5], outlinePage as P2[])) n = [-n[0], -n[1]];
    const at: XY[] = [pa, pb].map((p) => [p[0] + n[0] * DOFF, p[1] + n[1] * DOFF] as XY);
    dimLine([pa, pb], at, u, n);
    wallTexts.push({ text: f(Math.hypot(d[0] - c[0], d[1] - c[1])), a: at[0], b: at[1] });
  });

  // labels: corner letters, the reference walls, rooms, then the point numbers around them
  h.outline.forEach((v, i) => {
    const l = h.cornerLabels[i];
    if (!l) return;
    const p = P(v as [number, number]);
    const at = placer.place(l, 9, true, placer.around(l, 9, true, p, unitXY([p[0] - hc[0], p[1] - hc[1]]), 1.2));
    label(doc, l, at[0], at[1], { size: 9, bold: true, color: STAKE, bg: true });
  });
  for (const [a, b, text] of walls) {
    const p = P(a), q = P(b);
    const mid: XY = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const horiz = Math.abs(p[1] - q[1]) < Math.abs(p[0] - q[0]);
    // outside the house, beside the wall's middle
    const off: XY = horiz ? [0, Math.sign(mid[1] - hc[1]) * 3.2] : [Math.sign(mid[0] - hc[0]) * 3.2, 0];
    const at = placer.place(text, 7.5, true, [[mid[0] + off[0], mid[1] + off[1]], [mid[0] + off[0] * 2, mid[1] + off[1] * 2]], horiz ? 0 : 90);
    label(doc, text, at[0], at[1], { size: 7.5, bold: true, color: REF, bg: true, angle: horiz ? 0 : 90 });
  }
  if (h.stairsAt) {
    const [x, y2] = P(h.stairsAt as [number, number]);
    placer.take(placer.box('schody', 6.5, false, x, y2, 90));
    label(doc, 'schody', x, y2, { size: 6.5, color: GREY, angle: 90 });
  }
  if (h.terrace) {
    const c = h.terrace.reduce((s, p) => [s[0] + p[0] / h.terrace!.length, s[1] + p[1] / h.terrace!.length], [0, 0]);
    const [tx, ty] = P(c as [number, number]);
    const at = placer.place('taras', 7, false, [[tx, ty], [tx, ty - 4], [tx - 15, ty]]);
    label(doc, 'taras', at[0], at[1], { size: 7, color: GREY });
  }
  h.rooms.forEach((r, i) => {
    const [x, y2] = P(r.at as [number, number]);
    const name = placer.box(r.name, 7, true, x, y2 - 1.5), area = placer.box(`${f(r.area)} m²`, 6, false, x, y2 + 1.6);
    placer.take(name);
    placer.take(area);
    // without an outline the room's colour is a patch behind its name
    if (!r.cells.length) {
      doc.setFillColor(colour(i));
      doc.roundedRect(name[0][0] - 1, name[0][1] - 0.6, name[1][0] - name[0][0] + 2, area[2][1] - name[0][1] + 1.2, 1, 1, 'F');
    }
    label(doc, r.name, x, y2 - 1.5, { size: 7, bold: true, color: '#1f2937' });
    label(doc, `${f(r.area)} m²`, x, y2 + 1.6, { size: 6, color: '#4b5563' });
  });
  for (const s of plan.inside) {
    const p = P(s.plan as [number, number]);
    const text = String(s.n);
    const at = placer.place(text, 6.6, true, placer.around(text, 6.6, true, p, unitXY([1, -1]), 0.6));
    label(doc, text, at[0], at[1], { size: 6.6, bold: true, color: STAKE, bg: true });
  }
  for (const t of wallTexts) dimText(doc, placer, t.text, t.a, t.b, 7);
  // inner walls' lengths (not the outer walls' lines run on into the house)
  for (const w of h.walls.filter((ww) => !ww.extra)) dimText(doc, placer, f(Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])), P(w.a as [number, number]), P(w.b as [number, number]), 6);

  // the table of inside points, two blocks side by side
  const newPage = () => {
    doc.addPage('a4', 'portrait');
    title(doc, 'Pokoje – odległości punktów od ścian domu', head);
    return 26;
  };
  const ty = tableHere ? tableTop : newPage();
  const cols: Col[] = [{ title: 'Punkt', w: 16, align: 'center' }, { title: `od ściany ${ab0}–${ab1} [m]`, w: 38, align: 'right' }, { title: `od ściany ${sd0}–${sd1} [m]`, w: 38, align: 'right' }];
  const rows = plan.inside.map((s): (string | Cell)[] => [{ text: String(s.n), bold: true, color: STAKE }, f(s.fromAB), f(s.fromSide)]);
  table(doc, 10, ty, cols, rows.slice(0, perBlock), newPage, rowH);
  if (rows.length > perBlock) table(doc, 108, ty, cols, rows.slice(perBlock), newPage, rowH);
}

/** the staking sheet for a plan; `fonts` are DejaVu Sans Condensed regular and bold */
export function buildStakeoutPdf(plan: StakeoutPlan, fonts: PdfFonts): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('DejaVuSansCondensed.ttf', toBase64(fonts.regular));
  doc.addFont('DejaVuSansCondensed.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSansCondensed-Bold.ttf', toBase64(fonts.bold));
  doc.addFont('DejaVuSansCondensed-Bold.ttf', 'DejaVu', 'bold');
  doc.setProperties({ title: `Tyczenie palikami – ${plan.house.name}, dz. ${plan.parcelNumber}`, subject: 'Szkic do tyczenia domu palikami', creator: 'house-placer' });
  const head = `${plan.house.name} · ±0,00 = ${f(plan.floorLevel)} m n.p.m.`;

  // 1, 2: the sketch with lines parallel to the house walls / square to the borders; then the house
  // with its rooms (and the inside points); then the stakes measured from the borders
  sketchPage(doc, plan, 'wall');
  doc.addPage('a4', 'landscape');
  sketchPage(doc, plan, 'square');
  housePage(doc, plan, head);
  const houseEnd = doc.getNumberOfPages();
  bordersPage(doc, plan, head);

  const n = doc.getNumberOfPages();
  // pages 1 and 2 are the sketches alone
  for (let i = 3; i <= n; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
    footer(doc, i, n, w, h, i <= houseEnd ? `${NOTE} Punkty ścian wewnętrznych = osie ścian.` : NOTE);
  }
  return doc;
}

/** build the PDF in the browser and hand it to the user as a download */
export async function downloadStakeoutPdf(plan: StakeoutPlan, filename: string) {
  const load = (url: string) =>
    fetch(url).then((r) => {
      if (!r.ok) throw new Error(`font ${url}: ${r.status}`);
      return r.arrayBuffer();
    });
  const [regular, bold] = await Promise.all([load(regularUrl), load(boldUrl)]);
  buildStakeoutPdf(plan, { regular, bold }).save(filename);
}
