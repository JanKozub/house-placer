import { useDeferredValue, useRef } from 'react';
import { useDerived, useSite, autoFloorLevel } from '../derived';
import { DEFAULT_PALETTE, PERSIST_KEYS, useStore, type DimsMode, type Palette, type Tool } from '../store';
import { house, roofTopAt } from '../house/ambrozja17';
import { sunTimes } from '../site/sun';
import { carvedHeight } from '../site/Terrain';
import { centroid, polygonArea, toSite } from '../placement/geom2d';
import { f } from './format';
import type { GardenKind } from '../store';

const KIND_NAMES: Record<GardenKind, string> = { driveway: 'podjazd', path: 'ścieżka', patio: 'patio', flowerbed: 'rabata', gravel: 'żwir' };

const fmtTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const WALL_NAMES: Record<string, string> = {
  livN: 'Salon → taras', bedW: 'Sypialnia → taras', gableN: 'Szczyt tylny', east: 'Strona pokoi', gableS: 'Szczyt garażu (front)',
  garW: 'Garaż / wiata', front: 'Front (kuchnia, wejście)', gableW: 'Szczyt salonu',
};

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="panel-section">
      <header>
        <h3>{title}</h3>
        {right}
      </header>
      {children}
    </section>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function PreviewPanel() {
  const site = useSite();
  const sun = useStore((s) => s.sun);
  const setSun = useStore((s) => s.setSun);
  const palette = useStore((s) => s.palette);
  const setPalette = useStore((s) => s.setPalette);
  const layers = useStore((s) => s.layers);
  const setLayers = useStore((s) => s.setLayers);
  const d = useDeferredValue(useDerived());
  const times = sunTimes(sun, site.meta.origin.lat, site.meta.origin.lon);
  const presets: [string, Partial<typeof sun>][] = [
    ['Letni wieczór', { month: 6, day: 21, minutes: 19 * 60 + 30 }],
    ['Lato, południe', { month: 6, day: 21, minutes: 13 * 60 + 15 }],
    ['Równonoc, rano', { month: 3, day: 21, minutes: 8 * 60 + 30 }],
    ['Zima, południe', { month: 12, day: 21, minutes: 11 * 60 + 50 }],
    ['Noc', { minutes: 22 * 60 + 30 }],
  ];
  const colors: [keyof Palette, string][] = [
    ['plaster', 'Tynk elewacji'], ['roof', 'Dach / rynny'], ['frames', 'Ramy okien'], ['wood', 'Drewno (podbitka, drzwi)'], ['plinth', 'Cokół'], ['paving', 'Nawierzchnia tarasu'],
  ];
  return (
    <div className="panel">
      <Section title="Słońce i pora dnia" right={<small>{site.meta.region}, {f(site.meta.origin.lat, 4)}°N</small>}>
        <div className="row">
          <select value={sun.month} onChange={(e) => setSun({ month: +e.target.value })}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" min={1} max={31} value={sun.day} onChange={(e) => setSun({ day: Math.max(1, Math.min(31, +e.target.value)) })} style={{ width: 56 }} />
          <strong className="time">{fmtTime(sun.minutes)}</strong>
        </div>
        <input type="range" min={0} max={24 * 60 - 1} step={5} value={sun.minutes} onChange={(e) => setSun({ minutes: +e.target.value })} />
        <div className="hint">
          Wschód {fmtTime(times.sunrise)} · górowanie {fmtTime(times.noon)} · zachód {fmtTime(times.sunset)} · słońce {f((d.sun.altitude * 180 / Math.PI), 0)}° nad horyzontem, azymut {f(d.sun.azimuthDeg, 0)}°
        </div>
        <div className="chips">
          {presets.map(([n, p]) => <button key={n} onClick={() => setSun(p)}>{n}</button>)}
        </div>
      </Section>

      <Section title="Wykończenie" right={<button className="link" onClick={() => setPalette(DEFAULT_PALETTE)}>przywróć</button>}>
        <div className="colors">
          {colors.map(([k, label]) => (
            <label key={k} className="color">
              <input type="color" value={palette[k]} onChange={(e) => setPalette({ [k]: e.target.value })} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="chips">
          <button onClick={() => setPalette({ roof: '#8d9093' })}>Dach: srebrnoszary</button>
          <button onClick={() => setPalette({ roof: '#3b3f44' })}>Dach: grafit</button>
          <button onClick={() => setPalette({ roof: '#1f2124' })}>Dach: czarny</button>
          <button onClick={() => setPalette({ plaster: '#e6ded2' })}>Tynk: ciepły</button>
        </div>
      </Section>

      <Section title="Wyświetlanie">
        <Toggle label="Trawnik na działce (zamiast obecnego pola)" value={layers.parcelLawn} onChange={(v) => setLayers({ parcelLawn: v })} />
        <Toggle label="Zdjęcie satelitarne jako teren" value={layers.ortho} onChange={(v) => setLayers({ ortho: v })} />
        <Toggle label="Drogi (OpenStreetMap)" value={layers.roads !== false} onChange={(v) => setLayers({ roads: v })} />
        <Toggle label="Okoliczne budynki (BDOT10k)" value={layers.buildings !== false} onChange={(v) => setLayers({ buildings: v })} />
        <Toggle label="Cieniowanie otoczenia (AO)" value={layers.ao} onChange={(v) => setLayers({ ao: v })} />
        <Toggle label="Światła włączone nocą" value={layers.interiorLights} onChange={(v) => setLayers({ interiorLights: v })} />
        {!site.orthoUrl && <p className="hint warn">Brak zdjęcia satelitarnego. Uruchom <code>npm run fetch-map</code>.</p>}
      </Section>

      <Section title="Dom">
        <p className="hint">
          {house.name} ({house.code}) · {f(house.width)} × {f(house.depth)} m · pow. zabudowy {f(house.footprintArea)} m² · pow. użytkowa {f(house.usableArea)} m² · dach {house.pitchDeg}° · wys. kalenicy {f(house.heightTotal)} m
        </p>
        <p className="hint">±0,00 = {f(d.floorH)} m n.p.m. · front skierowany na azymut {f(useStore.getState().placement.bearing, 0)}°</p>
      </Section>
    </div>
  );
}

export function PlacementPanel() {
  const site = useSite();
  const d = useDeferredValue(useDerived());
  const pl = useDeferredValue(useStore((s) => s.placement));
  const setPlacement = useStore((s) => s.setPlacement);
  const floorLevel = useStore((s) => s.floorLevel);
  const tool = useStore((s) => s.tool);
  const layers = useStore((s) => s.layers);
  const setLayers = useStore((s) => s.setLayers);
  const garden = useStore((s) => s.garden);
  const trees = useStore((s) => s.trees);
  const selected = useStore((s) => s.selected);
  const fenceHeight = useStore((s) => s.fenceHeight);
  const buildingLine = useStore((s) => s.buildingLine);
  const set = useStore((s) => s.set);
  const fileRef = useRef<HTMLInputElement>(null);

  const ew = d.earthwork;
  const sb = d.setbacks;
  const tools: [Tool, string][] = [
    ['select', 'Przesuń dom'], ['driveway', 'Podjazd'], ['path', 'Ścieżka'], ['patio', 'Patio'], ['flowerbed', 'Rabata'], ['gravel', 'Żwir'],
    ['deciduous', 'Drzewo'], ['birch', 'Brzoza'], ['conifer', 'Iglak'], ['shrub', 'Krzew'], ['fence', 'Ogrodzenie'], ['buildingLine', 'Linia zabudowy'], ['measure', 'Pomiar'],
  ];

  const center = () => {
    const c = centroid(site.parcel);
    setPlacement({ x: Math.round(c[0] * 10) / 10, z: Math.round(c[1] * 10) / 10 });
  };

  const exportJson = () => {
    const s = useStore.getState() as unknown as Record<string, unknown>;
    const data = Object.fromEntries(PERSIST_KEYS.map((k) => [k, s[k]]));
    const blob = new Blob([JSON.stringify({ app: 'house-placer', version: 1, parcel: site.meta.parcelId, ...data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ambrozja17-dz${site.meta.parcelNumber.replace('/', '-')}.json`;
    a.click();
  };
  const importJson = async (f: File) => {
    const j = JSON.parse(await f.text());
    const patch = Object.fromEntries(PERSIST_KEYS.filter((k) => k in j).map((k) => [k, j[k]]));
    set(patch);
  };

  return (
    <div className="panel">
      <Section title="Położenie" right={<span className={`badge ${sb.ok ? 'ok' : 'fail'}`}>{sb.ok ? 'Odległości OK' : sb.insideParcel ? 'Sprawdź odległości' : 'Poza działką'}</span>}>
        <div className="grid3">
          <label>Wschód (m)<input type="number" step={0.1} value={pl.x.toFixed(2)} onChange={(e) => setPlacement({ x: +e.target.value })} /></label>
          <label>Południe (m)<input type="number" step={0.1} value={pl.z.toFixed(2)} onChange={(e) => setPlacement({ z: +e.target.value })} /></label>
          <label>Front na azymut (°)<input type="number" step={1} value={pl.bearing.toFixed(1)} onChange={(e) => setPlacement({ bearing: ((+e.target.value % 360) + 360) % 360 })} /></label>
        </div>
        <input type="range" min={0} max={359.5} step={0.5} value={pl.bearing} onChange={(e) => setPlacement({ bearing: +e.target.value })} />
        <div className="chips">
          <button onClick={() => setPlacement({ bearing: (pl.bearing + 270) % 360 })}>⟲ 90°</button>
          <button onClick={() => setPlacement({ bearing: (pl.bearing + 90) % 360 })}>⟳ 90°</button>
          <button className={pl.mirror ? 'on' : ''} onClick={() => setPlacement({ mirror: !pl.mirror })}>⇋ Odbicie lustrzane</button>
          <button onClick={center}>Wyśrodkuj na działce</button>
          {nearestRoadBearing(site.parcel, pl) !== null && (
            <button onClick={() => setPlacement({ bearing: nearestRoadBearing(site.parcel, pl)! })}>Frontem do najbliższej granicy</button>
          )}
        </div>
      </Section>

      <Section title="Odległości od granic (WT §12)">
        <table className="setbacks">
          <tbody>
            {sb.walls
              .filter((w) => w.distance < 30)
              .sort((a, b) => a.distance - a.required - (b.distance - b.required))
              .map((w) => (
                <tr key={w.wallId} className={w.status}>
                  <td>{WALL_NAMES[w.wallId] ?? w.wallId}</td>
                  <td>{w.hasOpenings ? 'z oknami' : 'bez okien'}</td>
                  <td className="num">{f(Math.max(0, w.distance), 2)} m</td>
                  <td className="num">≥ {w.required} m</td>
                </tr>
              ))}
          </tbody>
        </table>
        <p className="hint">
          Najbliższy punkt domu od granicy: {f(sb.minDistance)} m. Odległości mierzone są do granicy na wprost każdej ściany. Linie zabudowy sprawdź w MPZP / decyzji WZ i narysuj narzędziem <em>Linia zabudowy</em>.
          {sb.buildingLine && <> Linia zabudowy: {sb.buildingLine.ok ? 'zachowana' : 'PRZEKROCZONA'} ({f(sb.buildingLine.distance)} m).</>}
        </p>
      </Section>

      <Section title="Narożniki domu i tarasu → najbliższa granica">
        <CornerTable />
        <p className="hint">Odległość od każdego narożnika domu (A–H), narożnika tarasu (T) i narysowanych patio (P…) do najbliższej krawędzi działki (dla D i E do dwóch najbliższych) (numery 1–{site.parcel.length} przy krawędziach). Pomiary przechodzące przez dom są pomijane. Czerwone &lt; 3 m, pomarańczowe &lt; 4 m.</p>
      </Section>

      <Section title="Poziom posadzki i roboty ziemne">
        <div className="row">
          <label className="grow">±0,00 (m n.p.m.)
            <input type="number" step={0.05} value={d.floorH.toFixed(2)} onChange={(e) => set({ floorLevel: +e.target.value })} />
          </label>
          <button className={floorLevel === null ? 'on' : ''} onClick={() => set({ floorLevel: null })}>Auto (bilans mas)</button>
          <button onClick={() => set({ floorLevel: Math.round((ew.terrainMax + 0.3) * 100) / 100 })}>Najwyższy + 0,30</button>
        </div>
        <input type="range" min={(ew.terrainMin - 1).toFixed(2)} max={(ew.terrainMax + 1.5).toFixed(2)} step={0.05} value={d.floorH} onChange={(e) => set({ floorLevel: +e.target.value })} />
        <div className="stats">
          <div><b>{f((ew.terrainMax - ew.terrainMin), 2)} m</b><span>spadek pod domem</span></div>
          <div><b>{f(ew.cut, 0)} m³</b><span>wykop</span></div>
          <div><b>{f(ew.fill, 0)} m³</b><span>nasyp</span></div>
          <div><b>{f((d.floorH - ew.terrainMin), 2)} m</b><span>posadzka nad najniższym pkt</span></div>
        </div>
        <p className="hint">Teren {f(ew.terrainMin)}–{f(ew.terrainMax)} m n.p.m. (GUGiK NMT 1 m). Poziom auto ±0,00 = {f(autoFloorLevel(site, pl))}. Platforma na ±0,00 − {f(house.plinth)} m, skarpy 1:2. Roboty ziemne liczone tylko dla platformy (bez wykopów pod fundamenty).</p>
        <Profile />
      </Section>

      <Section title="Zagospodarowanie działki">
        <div className="tools">
          {tools.map(([t, label]) => (
            <button key={t} className={tool === t ? 'on' : ''} onClick={() => set({ tool: t, selected: null })}>{label}</button>
          ))}
        </div>
        <div className="row">
          <label className="grow">Wysokość ogrodzenia
            <input type="range" min={0.8} max={2.0} step={0.1} value={fenceHeight} onChange={(e) => set({ fenceHeight: +e.target.value })} />
          </label>
          <span>{f(fenceHeight, 1)} m</span>
        </div>
        <ul className="items">
          {garden.map((g) => (
            <li key={g.id} className={selected === g.id ? 'sel' : ''} onClick={() => set({ selected: g.id })}>
              {KIND_NAMES[g.kind]} · {f(polygonArea(g.points), 1)} m²
            </li>
          ))}
          {trees.length > 0 && <li className="muted">drzewa i krzewy: {trees.length}</li>}
          {buildingLine && <li onClick={() => set({ buildingLine: null })} className="muted">linia zabudowy · kliknij, aby usunąć</li>}
        </ul>
        {selected && <button className="danger" onClick={() => useStore.getState().removeSelected()}>Usuń zaznaczone</button>}
      </Section>

      <Section title="Warstwy i plik">
        <Toggle label="Rzut domu (pomieszczenia, otwory)" value={layers.plan} onChange={(v) => setLayers({ plan: v })} />
        <div className="row">
          <span className="grow">Wymiary na planie</span>
          <div className="seg">
            {([['corners', 'Narożniki'], ['walls', 'Ściany (WT)'], ['off', 'Brak']] as [DimsMode, string][]).map(([m, l]) => (
              <button key={m} className={(layers.dimsMode ?? 'corners') === m ? 'on' : ''} onClick={() => setLayers({ dimsMode: m })}>{l}</button>
            ))}
          </div>
        </div>
        <Toggle label="Sąsiednie działki" value={layers.neighbors} onChange={(v) => setLayers({ neighbors: v })} />
        <Toggle label="Drogi (OpenStreetMap)" value={layers.roads !== false} onChange={(v) => setLayers({ roads: v })} />
        <Toggle label="Okoliczne budynki (BDOT10k)" value={layers.buildings !== false} onChange={(v) => setLayers({ buildings: v })} />
        <div className="chips">
          <button onClick={exportJson}>Eksportuj JSON</button>
          <button onClick={() => fileRef.current?.click()}>Importuj JSON</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </div>
      </Section>
    </div>
  );
}

/** bearing facing away from the closest boundary edge (i.e. towards it) */
function nearestRoadBearing(parcel: [number, number][], pl: { x: number; z: number }) {
  let best = Infinity, bearing: number | null = null;
  for (let i = 0; i < parcel.length; i++) {
    const a = parcel[i], b = parcel[(i + 1) % parcel.length];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 8) continue;
    const t = Math.max(0, Math.min(1, ((pl.x - a[0]) * (b[0] - a[0]) + (pl.z - a[1]) * (b[1] - a[1])) / (L * L)));
    const q = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const dd = Math.hypot(q[0] - pl.x, q[1] - pl.z);
    if (dd < best) {
      best = dd;
      // direction from house to edge, as compass bearing (x east, z south → north = −z)
      bearing = ((Math.atan2(q[0] - pl.x, -(q[1] - pl.z)) * 180) / Math.PI + 360) % 360;
    }
  }
  return bearing === null ? null : Math.round(bearing);
}

/** side elevation along the house's front/back axis: terrain before/after and house silhouette */
function Profile() {
  const site = useSite();
  const d = useDeferredValue(useDerived());
  const pl = useDeferredValue(useStore((s) => s.placement));
  const W = 320, H = 130;
  const half = 26;
  const samples = 105;
  const pts: { s: number; t0: number; t1: number; roof: number | null }[] = [];
  for (let i = 0; i < samples; i++) {
    const s = -half + (2 * half * i) / (samples - 1); // along local z (front +)
    const p = toSite([0, s], pl);
    const t0 = site.dem.heightAt(p[0], p[1]);
    const t1 = carvedHeight(site, p[0], p[1], d.platform);
    const Y = s + house.depth / 2;
    let roof: number | null = null;
    for (let X = -0.5; X <= house.width + 0.5; X += 0.25) {
      const r = roofTopAt(X, Y);
      if (r !== null) roof = Math.max(roof ?? -Infinity, r);
    }
    pts.push({ s, t0, t1, roof: roof === null ? null : d.floorH + roof });
  }
  const hs = pts.flatMap((p) => [p.t0, p.t1, p.roof ?? p.t1]);
  const minH = Math.min(...hs) - 0.5, maxH = Math.max(...hs) + 0.5;
  const sx = (s: number) => ((s + half) / (2 * half)) * W;
  const sy = (h: number) => H - ((h - minH) / (maxH - minH)) * H;
  const line = (fn: (p: (typeof pts)[number]) => number) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.s).toFixed(1)},${sy(fn(p)).toFixed(1)}`).join(' ');
  const rp = pts.filter((p) => p.roof !== null);
  const houseShape =
    rp.length > 1
      ? `M${sx(rp[0].s)},${sy(d.floorH - house.plinth)} ` + rp.map((p) => `L${sx(p.s).toFixed(1)},${sy(p.roof!).toFixed(1)}`).join(' ') + ` L${sx(rp.at(-1)!.s)},${sy(d.floorH - house.plinth)} Z`
      : '';
  return (
    <svg className="profile" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path d={houseShape} fill="#e5e7eb" stroke="#374151" strokeWidth={1} />
      <path d={`${line((p) => p.t1)} L${W},${H} L0,${H} Z`} fill="#86a76a55" stroke="#4d7c0f" strokeWidth={1.5} />
      <path d={line((p) => p.t0)} fill="none" stroke="#92400e" strokeDasharray="4 3" strokeWidth={1.2} />
      <line x1={0} x2={W} y1={sy(d.floorH)} y2={sy(d.floorH)} stroke="#2563eb" strokeDasharray="2 3" strokeWidth={1} />
      <text x={4} y={sy(d.floorH) - 3} fontSize={9} fill="#2563eb">±0,00 = {f(d.floorH)}</text>
      <text x={4} y={H - 4} fontSize={9} fill="#6b7280">← tył</text>
      <text x={W - 4} y={H - 4} fontSize={9} fill="#6b7280" textAnchor="end">przód →</text>
    </svg>
  );
}

function CornerTable() {
  const d = useDeferredValue(useDerived());
  return (
    <table className="corners">
      <thead>
        <tr><th>Narożnik</th><th>Najbliższa krawędź</th><th>Odległość</th></tr>
      </thead>
      <tbody>
        {d.corners.map((c) => (
          <tr key={`${c.label}-${c.edge}`}>
            <th>{c.label}</th>
            <td>{c.edge + 1}</td>
            <td className={c.d < 3 ? 'fail' : c.d < 4 ? 'warn' : ''}>{f(c.d, 2)} m</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
