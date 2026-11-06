import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Line, MapControls, OrthographicCamera } from '@react-three/drei';
import { LabelContext, LabelOverlay, LabelProjector, LabelRegistry, WorldLabel } from './labels';
import { create } from 'zustand';
import { useDerived, useSite } from '../derived';
import { uid, useStore, type GardenKind, type Tool, type TreeKind } from '../store';
import { houseById, useHouse } from '../house/projects';
import { buildingPlacement, setBuildingPlacement, useTarget } from '../house/annex';
import type { HouseDef } from '../house/types';
import { toLocal } from '../house/geometry';
import { centroid, closestOnSegment, pointInPolygon, toSite, type P2, type Placement } from '../placement/geom2d';
import { f } from '../ui/format';
import { Attribution } from '../ui/Attribution';
import { cornerLabel } from '../placement/setbacks';

const OVER = 200; // overlay height (scene units) — drawn without depth test
const FIXED_SUN = new THREE.Vector3(-0.35, 0.85, 0.4).normalize();

const AREA_TOOLS: GardenKind[] = ['driveway', 'path', 'patio', 'flowerbed', 'gravel'];
const TREE_TOOLS: TreeKind[] = ['deciduous', 'conifer', 'birch', 'shrub'];
const TREE_H: Record<TreeKind, number> = { deciduous: 7, conifer: 5, birch: 9, shrub: 1.3 };

const v3 = (p: P2, y = OVER): [number, number, number] => [p[0], y, p[1]];
const ring = (pts: P2[], y = OVER) => [...pts, pts[0]].map((p) => v3(p, y));

function Overlay({ children, order = 10 }: { children: React.ReactNode; order?: number }) {
  return (
    <group userData={{ rasterOnly: true }} renderOrder={order}>
      {children}
    </group>
  );
}

function Label({ at, children, className = 'map-label' }: { at: P2; children: React.ReactNode; className?: string }) {
  return (
    <WorldLabel pos={v3(at)} className={className}>
      {children}
    </WorldLabel>
  );
}

function Lines({ points, color, width = 2, dashed = false, opacity = 1 }: { points: [number, number, number][]; color: string; width?: number; dashed?: boolean; opacity?: number }) {
  return (
    <Line
      points={points}
      color={color}
      lineWidth={width}
      dashed={dashed}
      dashSize={0.6}
      gapSize={0.4}
      depthTest={false}
      transparent
      opacity={opacity}
      renderOrder={20}
    />
  );
}

/** one building's plan: outline, openings, partitions, room names */
function BuildingPlan({ house, pl, fp, selected, frontLabel }: { house: HouseDef; pl: Placement; fp: P2[]; selected: boolean; frontLabel: string }) {
  const showPlan = useStore((s) => s.layers.plan);
  const toS = (X: number, Y: number) => toSite(toLocal(house, X, Y), pl);
  const fillGeom = useMemo(() => {
    const s = new THREE.Shape(fp.map(([x, z]) => new THREE.Vector2(x, z)));
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(Math.PI / 2);
    g.translate(0, OVER - 0.1, 0);
    return g;
  }, [fp]);
  const front = toS(house.width / 2, house.depth + 0.5);
  return (
    <>
      {showPlan && (
        <mesh geometry={fillGeom} renderOrder={15}>
          <meshBasicMaterial color="#ffffff" transparent opacity={0.82} depthTest={false} side={THREE.DoubleSide} />
        </mesh>
      )}
      <Lines points={ring(fp)} color={selected ? '#2563eb' : '#1f2a37'} width={selected ? 4 : 3} />
      {showPlan && (
        <>
          {house.partitions.map(([x1, y1, x2, y2], i) => (
            <Lines key={i} points={[v3(toS(x1, y1)), v3(toS(x2, y2))]} color="#4b5563" width={1.2} />
          ))}
          {house.openings.filter((o) => !o.level).map((o, i) => {
            const w = house.walls.find((ww) => ww.id === o.wall)!;
            const horiz = Math.abs(w.a[1] - w.b[1]) < 1e-6;
            const a: P2 = horiz ? [o.at - o.width / 2, w.a[1]] : [w.a[0], o.at - o.width / 2];
            const b: P2 = horiz ? [o.at + o.width / 2, w.a[1]] : [w.a[0], o.at + o.width / 2];
            return <Lines key={'o' + i} points={[v3(toS(...a)), v3(toS(...b))]} color={o.kind === 'garage' || o.kind === 'entrance' || o.kind === 'door' ? '#b45309' : '#0284c7'} width={5} />;
          })}
          {house.rooms.map((r, i) => (
            <Label key={'r' + i} at={toS(...r.at)} className="room-label">
              {r.name}
              <br />
              <small>{f(r.area, 2)} m²</small>
            </Label>
          ))}
        </>
      )}
      <Label at={front} className="front-label">{frontLabel}</Label>
    </>
  );
}

function HousePlanOverlay() {
  const pl = useStore((s) => s.placement);
  const target = useStore((s) => s.target);
  const d = useDerived();
  const several = d.annexes.length > 0;
  return (
    <Overlay>
      <BuildingPlan house={d.house} pl={pl} fp={d.footprint} selected={several && target === 'main'} frontLabel={several ? '▼ wejście' : '▼ wejście / garaż'} />
      {d.annexes.map((a) => (
        <BuildingPlan key={a.id} house={a.def} pl={a.placement} fp={a.footprint} selected={target === a.id} frontLabel="▼ brama" />
      ))}
    </Overlay>
  );
}

/** house ↔ detached garage: shortest distance between the walls */
function GapOverlay() {
  const d = useDerived();
  const mode = useStore((s) => s.layers.dimsMode ?? 'corners');
  const g = d.gap;
  if (!g || mode === 'off') return null;
  const color = g.overlap ? '#dc2626' : '#7c3aed';
  return (
    <Overlay order={30}>
      {!g.overlap && <Lines points={[v3(g.p), v3(g.q)]} color={color} width={2} />}
      <Label at={[(g.p[0] + g.q[0]) / 2, (g.p[1] + g.q[1]) / 2]} className={`dim-label gap ${g.overlap ? 'fail' : ''}`}>
        {g.overlap ? `dom i ${g.label.toLowerCase()} nachodzą na siebie` : `dom–${g.label.toLowerCase()}: ${f(g.d, 2)} m`}
      </Label>
    </Overlay>
  );
}

/** distance from every house corner to its nearest plot edge (skipping lines through the house) */
function CornerOverlay() {
  const d = useDerived();
  const mode = useStore((s) => s.layers.dimsMode ?? 'corners');
  const pl = useStore((s) => s.placement);
  const showLabels = mode !== 'off';
  const buildings = [
    { key: 'main', fp: d.footprint, pl, corners: d.corners, letter: (i: number) => cornerLabel(i) },
    ...d.annexes.map((a) => ({ key: a.id, fp: a.footprint, pl: a.placement, corners: a.corners, letter: (i: number) => `${a.label.charAt(0).toUpperCase()}${i + 1}` })),
  ];
  const all = buildings.flatMap((b) => b.corners);
  // corner letters, pushed slightly outward from each building's centre
  const letters = buildings.flatMap((b) =>
    b.fp.flatMap((c, i) => {
      if (!b.corners.some((m) => m.corner === i)) return []; // unmeasured (B) or no clear line to the boundary
      const v: P2 = [c[0] - b.pl.x, c[1] - b.pl.z];
      const L = Math.hypot(v[0], v[1]) || 1;
      return [{ key: `${b.key}-${i}`, text: b.letter(i), at: [c[0] + (v[0] / L) * 0.9, c[1] + (v[1] / L) * 0.9] as P2 }];
    }),
  );
  const color = (m: number) => (m < 3 ? '#dc2626' : m < 4 ? '#d97706' : '#1e40af');
  return (
    <Overlay order={30}>
      {mode === 'corners' &&
        all.map((c) => (
          <group key={`${c.label}-${c.edge}`}>
            <Lines points={[v3(c.p), v3(c.q)]} color={color(c.d)} width={1.3} opacity={0.9} />
            <Label at={[(c.p[0] + c.q[0]) / 2, (c.p[1] + c.q[1]) / 2]} className={`dim-label corner ${c.d < 3 ? 'fail' : c.d < 4 ? 'warn' : ''}`}>
              {c.label}: {f(c.d, 2)} m
            </Label>
          </group>
        ))}
      {showLabels && letters.map((c) => (
        <Label key={c.key} at={c.at} className="corner-label">{c.text}</Label>
      ))}
      {showLabels &&
        d.corners
          .filter((c) => c.corner < 0)
          .map((c) => (
            <Label key={'pt-' + c.label} at={c.p} className="corner-label point">{c.label}</Label>
          ))}
    </Overlay>
  );
}

function SetbackOverlay() {
  const d = useDerived();
  const mode = useStore((s) => s.layers.dimsMode ?? 'corners');
  if (mode !== 'walls') return null;
  const col = { ok: '#16a34a', warn: '#d97706', fail: '#dc2626' };
  // nearest boundary in front of each wall, coloured by the WT §12 check
  return (
    <Overlay order={30}>
      {[{ key: 'main', walls: d.setbacks.walls }, ...d.annexes.map((a) => ({ key: a.id, walls: a.setbacks.walls }))].flatMap((b) => b.walls.map((w) => ({ ...w, k: `${b.key}-${w.wallId}` }))).map((w) => (
        <group key={w.k}>
          <Lines points={[v3(w.from), v3(w.to)]} color={col[w.status]} width={2.5} />
          <Label at={[(w.from[0] + w.to[0]) / 2, (w.from[1] + w.to[1]) / 2]} className={`dim-label ${w.status}`}>
            {f(Math.max(0, w.distance), 2)} m
          </Label>
        </group>
      ))}
      {d.setbacks.buildingLine && (
        <Lines points={[v3(d.setbacks.buildingLine.from), v3(d.setbacks.buildingLine.to)]} color={d.setbacks.buildingLine.ok ? '#7c3aed' : '#dc2626'} width={2} />
      )}
    </Overlay>
  );
}

const ROAD_LABEL: Record<string, string> = { tertiary: 'droga powiatowa', residential: 'ulica', service: 'droga dojazdowa', track: 'droga gruntowa', footway: 'chodnik', unclassified: 'droga' };

function RoadOverlay() {
  const site = useSite();
  const show = useStore((s) => s.layers.roads !== false);
  if (!show) return null;
  const c = centroid(site.parcel);
  return (
    <Overlay order={12}>
      {site.roads.map((r) => {
        // label at the point of the road closest to the plot
        let best: P2 = r.pts[0], bd = Infinity;
        for (let i = 1; i < r.pts.length; i++) {
          const q = closestOnSegment(c, r.pts[i - 1], r.pts[i]);
          const dd = Math.hypot(q[0] - c[0], q[1] - c[1]);
          if (dd < bd) { bd = dd; best = q; }
        }
        return (
          <group key={r.id}>
            {bd < 140 && (
              <Label at={best} className="road-label">
                {r.name ?? ROAD_LABEL[r.highway] ?? r.highway}
              </Label>
            )}
          </group>
        );
      })}
    </Overlay>
  );
}

function SiteOverlay() {
  const site = useSite();
  const showNb = useStore((s) => s.layers.neighbors);
  const fenceEdges = useStore((s) => s.fenceEdges);
  const tool = useStore((s) => s.tool);
  const P = site.parcel;
  return (
    <Overlay>
      {showNb &&
        site.neighbors.map((n) => (
          <group key={n.id}>
            <Lines points={ring(n.ring)} color="#ffffff" width={1} opacity={0.45} />
            {n.ring.length > 2 && (
              <Label at={centroid(n.ring)} className="nb-label">
                {n.parcel}
              </Label>
            )}
          </group>
        ))}
      <Lines points={ring(P)} color="#facc15" width={3.5} />
      {P.map((p, i) => {
        const q = P[(i + 1) % P.length];
        const on = fenceEdges.includes(i);
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        return (
          <group key={i}>
            {(on || tool === 'fence') && <Lines points={[v3(p, OVER + 1), v3(q, OVER + 1)]} color={on ? '#374151' : '#9ca3af'} width={on ? 6 : 4} dashed={!on} />}
            <Label at={[(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]} className="edge-label"><b>{i + 1}</b> · {f(L, 2)} m</Label>
          </group>
        );
      })}
      <Label at={centroid(P)} className="parcel-label">dz. {site.meta.parcelNumber}</Label>
    </Overlay>
  );
}

function GardenOverlay({ draft, cursor }: { draft: P2[]; cursor: P2 | null }) {
  const garden = useStore((s) => s.garden);
  const trees = useStore((s) => s.trees);
  const selected = useStore((s) => s.selected);
  const bl = useStore((s) => s.buildingLine);
  const tool = useStore((s) => s.tool);
  const draftPts = cursor && draft.length ? [...draft, cursor] : draft;
  return (
    <Overlay order={25}>
      {garden.map((g) => (
        <Lines key={g.id} points={ring(g.points)} color={g.id === selected ? '#2563eb' : '#ffffff'} width={g.id === selected ? 3 : 1} opacity={g.id === selected ? 1 : 0.5} />
      ))}
      {trees.map((t) => (
        <mesh key={t.id} position={[t.x, OVER, t.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={26} visible={t.id === selected}>
          <ringGeometry args={[t.height * 0.3, t.height * 0.3 + 0.25, 32]} />
          <meshBasicMaterial color="#2563eb" depthTest={false} transparent />
        </mesh>
      ))}
      {bl && <Lines points={bl.map((p) => v3(p))} color="#7c3aed" width={2.5} dashed />}
      {draftPts.length >= 2 && (
        <Lines points={draftPts.map((p) => v3(p, OVER + 2))} color={tool === 'buildingLine' ? '#7c3aed' : '#2563eb'} width={2.5} dashed={tool === 'measure'} />
      )}
      {tool === 'measure' && draftPts.length === 2 && (
        <Label at={[(draftPts[0][0] + draftPts[1][0]) / 2, (draftPts[0][1] + draftPts[1][1]) / 2]} className="dim-label ok">
          {f(Math.hypot(draftPts[1][0] - draftPts[0][0], draftPts[1][1] - draftPts[0][1]), 2)} m
        </Label>
      )}
      {draft.map((p, i) => (
        <mesh key={i} position={[p[0], OVER + 3, p[1]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={27}>
          <circleGeometry args={[0.25, 16]} />
          <meshBasicMaterial color={i === 0 ? '#f59e0b' : '#2563eb'} depthTest={false} transparent />
        </mesh>
      ))}
    </Overlay>
  );
}

/** rotate handle in front of the building the controls act on */
const handlePos = (def: HouseDef, pl: Placement) => toSite(toLocal(def, def.width / 2, def.depth + 3.2), pl);

function RotateHandle() {
  const tool = useStore((s) => s.tool);
  const t = useTarget();
  if (tool !== 'select') return null;
  const h = handlePos(t.def, t.placement);
  return (
    <Overlay order={40}>
      <mesh position={[h[0], OVER + 4, h[1]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={41}>
        <circleGeometry args={[0.7, 24]} />
        <meshBasicMaterial color="#2563eb" depthTest={false} transparent opacity={0.9} />
      </mesh>
      <Label at={h} className="handle-label">⟳</Label>
    </Overlay>
  );
}

type Drag = { kind: 'move'; id: string; dx: number; dz: number } | { kind: 'rotate'; id: string; start: number; bearing0: number } | null;

function Interaction({ draft, setDraft, setCursor }: { draft: P2[]; setDraft: (d: P2[]) => void; setCursor: (p: P2 | null) => void }) {
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const site = useSite();
  const d = useDerived();
  const st = useStore;
  const drag = useRef<Drag>(null);
  const lastClick = useRef(0);

  const finishDraft = (pts: P2[]) => {
    const { tool } = st.getState();
    if (AREA_TOOLS.includes(tool as GardenKind) && pts.length >= 3) {
      const id = uid();
      st.getState().addGarden({ id, kind: tool as GardenKind, points: pts });
      st.setState({ selected: id });
    } else if (tool === 'buildingLine' && pts.length >= 2) {
      st.setState({ buildingLine: pts });
    }
    setDraft([]);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const s = st.getState();
      if (e.key === 'Escape') { setDraft([]); st.setState({ selected: null, tool: 'select' }); }
      if (e.key === 'Enter') finishDraft(draft);
      if (e.key === 'Backspace' && draft.length) { setDraft(draft.slice(0, -1)); e.preventDefault(); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !draft.length && s.selected) s.removeSelected();
      const step = e.shiftKey ? 1 : 0.1;
      if (s.tool === 'select' && !s.selected) {
        // arrows / Q / E act on the selected building (house or detached garage)
        const house = houseById(s.projectId);
        const cur = buildingPlacement(house, s.target);
        const set = (p: Partial<Placement>) => setBuildingPlacement(house, s.target, p);
        if (e.key === 'ArrowUp') set({ z: cur.z - step });
        if (e.key === 'ArrowDown') set({ z: cur.z + step });
        if (e.key === 'ArrowLeft') set({ x: cur.x - step });
        if (e.key === 'ArrowRight') set({ x: cur.x + step });
        if (e.key === 'q' || e.key === 'Q') set({ bearing: (cur.bearing - (e.shiftKey ? 15 : 1) + 360) % 360 });
        if (e.key === 'e' || e.key === 'E') set({ bearing: (cur.bearing + (e.shiftKey ? 15 : 1)) % 360 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // re-bind each render to see current draft

  const pt = (e: ThreeEvent<PointerEvent | MouseEvent>): P2 => [e.point.x, e.point.z];

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const s = st.getState();
    if (s.tool !== 'select') return;
    const p = pt(e);
    const house = houseById(s.projectId);
    const tpl = buildingPlacement(house, s.target);
    const tdef = house.annexes?.find((a) => a.id === s.target)?.def ?? house;
    const handle = handlePos(tdef, tpl);
    // separate buildings (smaller) are hit-tested before the house
    const hit = [...d.annexes.map((a) => ({ id: a.id, poly: a.platform.polygon })), { id: 'main', poly: d.platform.polygon }].find((b) => pointInPolygon(p, b.poly));
    if (Math.hypot(p[0] - handle[0], p[1] - handle[1]) < 1.0) {
      drag.current = { kind: 'rotate', id: s.target, start: Math.atan2(p[0] - tpl.x, -(p[1] - tpl.z)), bearing0: tpl.bearing };
    } else if (hit) {
      const pl = buildingPlacement(house, hit.id);
      drag.current = { kind: 'move', id: hit.id, dx: pl.x - p[0], dz: pl.z - p[1] };
      st.setState({ selected: null, target: hit.id });
    } else {
      // select garden item
      const tree = s.trees.find((t) => Math.hypot(t.x - p[0], t.z - p[1]) < Math.max(0.8, t.height * 0.3));
      const area = [...s.garden].reverse().find((g) => pointInPolygon(p, g.points));
      st.setState({ selected: tree?.id ?? area?.id ?? null });
      return;
    }
    if (controls) controls.enabled = false;
    (e.target as Element)?.setPointerCapture?.(e.pointerId);
    e.stopPropagation();
  };

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const p = pt(e);
    setCursor(p);
    const dr = drag.current;
    if (!dr) return;
    const house = houseById(st.getState().projectId);
    if (dr.kind === 'move') {
      setBuildingPlacement(house, dr.id, { x: Math.round((p[0] + dr.dx) * 20) / 20, z: Math.round((p[1] + dr.dz) * 20) / 20 });
    } else {
      const pl = buildingPlacement(house, dr.id);
      const a = Math.atan2(p[0] - pl.x, -(p[1] - pl.z));
      let b = dr.bearing0 + ((a - dr.start) * 180) / Math.PI;
      const snap = e.shiftKey ? 15 : 1;
      b = ((Math.round(b / snap) * snap) % 360 + 360) % 360;
      setBuildingPlacement(house, dr.id, { bearing: b });
    }
  };

  const onUp = () => {
    if (drag.current && controls) controls.enabled = true;
    drag.current = null;
  };

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4) return;
    const s = st.getState();
    const p = pt(e);
    const now = performance.now();
    const dbl = now - lastClick.current < 300;
    lastClick.current = now;
    const t = s.tool;
    if (AREA_TOOLS.includes(t as GardenKind) || t === 'buildingLine') {
      if (dbl) { finishDraft(draft); return; }
      if (draft.length >= 3 && Math.hypot(p[0] - draft[0][0], p[1] - draft[0][1]) < 0.6 && t !== 'buildingLine') { finishDraft(draft); return; }
      setDraft([...draft, p]);
    } else if (TREE_TOOLS.includes(t as TreeKind)) {
      const id = uid();
      s.addTree({ id, kind: t as TreeKind, x: p[0], z: p[1], height: TREE_H[t as TreeKind] * (0.85 + Math.random() * 0.3) });
    } else if (t === 'fence') {
      let best = -1, bd = 2.5;
      site.parcel.forEach((a, i) => {
        const b = site.parcel[(i + 1) % site.parcel.length];
        const q = closestOnSegment(p, a, b);
        const dd = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (dd < bd) { bd = dd; best = i; }
      });
      if (best >= 0) s.toggleFenceEdge(best);
    } else if (t === 'measure') {
      setDraft(draft.length >= 2 ? [p] : [...draft, p]);
    }
  };

  const size = Math.max(site.dem.sizeX, site.dem.sizeZ);
  return (
    <mesh
      position={[site.dem.x0 + site.dem.sizeX / 2, OVER - 5, site.dem.z0 + site.dem.sizeZ / 2]}
      rotation={[-Math.PI / 2, 0, 0]}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={() => setCursor(null)}
      onClick={onClick}
      userData={{ rasterOnly: true }}
    >
      <planeGeometry args={[size * 2, size * 2]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

function TopCamera() {
  const site = useSite();
  const c = centroid(site.parcel);
  const cam = useRef<THREE.OrthographicCamera>(null!);
  useEffect(() => {
    cam.current.up.set(0, 0, -1);
    cam.current.lookAt(c[0], 0, c[1]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <OrthographicCamera ref={cam} makeDefault position={[c[0], 600, c[1]]} zoom={9} near={1} far={2000} up={[0, 0, -1]} />;
}

function ControlsTarget() {
  const site = useSite();
  const c = centroid(site.parcel);
  return <MapControls makeDefault enableRotate={false} screenSpacePanning target={[c[0], 0, c[1]]} zoomSpeed={1.2} minZoom={2} maxZoom={80} />;
}

/** transient plan-editing state shared between the in-canvas scene and the HTML overlay */
export const usePlanUi = create<{ draft: P2[]; cursor: P2 | null; setDraft: (d: P2[]) => void; setCursor: (c: P2 | null) => void }>((set) => ({
  draft: [],
  cursor: null,
  setDraft: (draft) => set({ draft }),
  setCursor: (cursor) => set({ cursor }),
}));

export const planLabels = new LabelRegistry();
export const PLAN_SUN = FIXED_SUN;

/** everything the plan tab adds inside the shared <Canvas> (camera, controls, overlays, tools) */
export function PlacementScene() {
  const tool = useStore((s) => s.tool);
  const { draft, cursor, setDraft, setCursor } = usePlanUi();
  useEffect(() => setDraft([]), [tool, setDraft]);
  return (
    <LabelContext.Provider value={planLabels}>
      <LabelProjector />
      <TopCamera />
      <ControlsTarget />
      <RoadOverlay />
      <SiteOverlay />
      <GardenOverlay draft={draft} cursor={cursor} />
      <HousePlanOverlay />
      <SetbackOverlay />
      <CornerOverlay />
      <GapOverlay />
      <RotateHandle />
      <Interaction draft={draft} setDraft={setDraft} setCursor={setCursor} />
    </LabelContext.Provider>
  );
}

/** HTML on top of the canvas for the plan tab */
export function PlacementOverlay() {
  const tool = useStore((s) => s.tool);
  const draftLen = usePlanUi((s) => s.draft.length);
  return (
    <>
      <LabelOverlay reg={planLabels} />
      <div className="compass" title="Północ układu PUWG 1992">Pn ↑</div>
      <Attribution />
      <ToolHint tool={tool} draftLen={draftLen} />
    </>
  );
}

function ToolHint({ tool, draftLen }: { tool: Tool; draftLen: number }) {
  const hints: Partial<Record<Tool, string>> = {
    select: 'Przeciągnij dom (lub garaż), aby go przesunąć · przeciągnij niebieski uchwyt, aby obrócić (Shift = co 15°) · strzałki przesuwają, Q/E obracają · przeciągnij teren, aby przesunąć widok, kółko myszy przybliża',
    fence: 'Kliknij granicę działki, aby dodać lub usunąć ogrodzenie (przerwy zostają tam, gdzie przecina je podjazd lub ścieżka)',
    buildingLine: 'Klikaj kolejne punkty linii zabudowy (z MPZP / od drogi) · dwuklik lub Enter kończy',
    measure: 'Kliknij dwa punkty, aby zmierzyć odległość',
  };
  const area = AREA_TOOLS.includes(tool as GardenKind);
  const text = area
    ? `Klikaj, aby dodać narożniki${draftLen ? ` (${draftLen})` : ''} · kliknij pierwszy punkt, dwuklik lub Enter zamyka · Backspace cofa · Esc anuluje`
    : TREE_TOOLS.includes(tool as TreeKind)
      ? 'Kliknij, aby posadzić'
      : hints[tool];
  return text ? <div className="tool-hint">{text}</div> : null;
}
