import { useDeferredValue, useRef } from 'react';
import { useDerived, useSite } from '../derived';
import { DEFAULT_PALETTE, PERSIST_KEYS, useStore, type DimsMode, type Palette, type Tool } from '../store';
import { roofTopAt } from '../house/roof';
import { HOUSES } from '../house/projects';
import { defaultOutbuildingPlacement, setBuildingFloor, setBuildingPlacement, useTarget } from '../house/annex';
import { OUTBUILDINGS } from '../house/outbuildings';
import type { Placement } from '../placement/geom2d';
import { cornerLabel } from '../placement/setbacks';
import { sunTimes } from '../site/sun';
import { carvedHeight } from '../site/Terrain';
import { centroid, polygonArea, toSite } from '../placement/geom2d';
import { f } from './format';
import type { GardenKind } from '../store';

const KIND_NAMES: Record<GardenKind, string> = { driveway: 'podjazd', path: 'ścieżka', patio: 'patio', flowerbed: 'rabata', gravel: 'żwir' };

const fmtTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;
const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
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
  const house = d.house;
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
    ...(house.facadeZones?.some((z) => z.finish === 'accent') ? [['accent', 'Tynk – pas ciemny']] as [keyof Palette, string][] : []),
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
              <input type="color" value={palette[k] ?? DEFAULT_PALETTE[k]} onChange={(e) => setPalette({ [k]: e.target.value })} />
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
        {house.upperRooms && (
          <p className="hint">
            Poddasze ({f(house.upperRooms.reduce((s2, r) => s2 + r.area, 0), 2)} m², posadzka +{f(house.upperFloor?.level ?? 0, 2)}): {house.upperRooms.map((r) => `${r.name.toLowerCase()} ${f(r.area, 2)}`).join(', ')} m².
          </p>
        )}
        {d.annexes.map((a) => (
          <p key={a.id} className="hint">
            {a.label} ({a.outbuilding ? 'budynek dodatkowy' : 'osobny budynek'}): {f(a.def.width)} × {f(a.def.depth)} m · pow. {f(a.def.usableArea)} m² · wys. kalenicy {f(a.def.heightTotal)} m · posadzka {f(a.floorH)} m n.p.m.
            {(() => {
              const g = d.gaps.find((gg) => gg.id === a.id);
              return g && <> · {g.overlap ? 'nachodzi na dom' : `${f(g.d, 2)} m od domu`}</>;
            })()}
          </p>
        ))}
      </Section>
    </div>
  );
}

export function PlacementPanel() {
  const site = useSite();
  const d = useDeferredValue(useDerived());
  const house = d.house;
  // the building the controls act on: the house, or a separate building (detached garage)
  const t = useTarget();
  const pl = useDeferredValue(t.placement);
  const setPlacement = (p: Partial<Placement>) => setBuildingPlacement(house, t.id, p);
  const floorLevel = t.floorLevel;
  const setFloor = (v: number | null) => setBuildingFloor(house, t.id, v);
  const tg = (t.id === 'main' ? null : d.annexes.find((a) => a.id === t.id)) ?? d;
  const several = d.annexes.length > 0;
  const target = useStore((s) => s.target);
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

  const ew = tg.earthwork;
  const sb = d.setbacks;
  const allOk = sb.ok && d.annexes.every((a) => a.setbacks.ok) && !d.gaps.some((g) => g.overlap);
  const allInside = sb.insideParcel && d.annexes.every((a) => a.setbacks.insideParcel);
  const wallRows = [
    ...sb.walls.map((w) => ({ ...w, key: w.wallId, label: house.walls.find((ww) => ww.id === w.wallId)?.label ?? w.wallId })),
    ...d.annexes.flatMap((a) => a.setbacks.walls.map((w) => ({ ...w, key: `${a.id}-${w.wallId}`, label: a.def.walls.find((ww) => ww.id === w.wallId)?.label ?? w.wallId }))),
  ];
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
    const blob = new Blob([JSON.stringify({ app: 'house-placer', version: 3, parcel: site.meta.parcelId, ...data }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${house.id}-dz${site.meta.parcelNumber.replace('/', '-')}.json`;
    a.click();
  };
  const importJson = async (f: File) => {
    const j = JSON.parse(await f.text());
    const patch = Object.fromEntries(PERSIST_KEYS.filter((k) => k in j).map((k) => [k, j[k]]));
    // v1 files had a single house (Ambrozja 17); its placement belongs to that project
    const projectId = j.projectId ?? 'ambrozja17';
    set({ ...patch, annexes: j.annexes ?? {}, target: 'main', projectId: HOUSES[projectId] ? projectId : useStore.getState().projectId, projectState: j.projectState ?? useStore.getState().projectState });
  };

  return (
    <div className="panel">
      <Section title="Położenie" right={<span className={`badge ${allOk ? 'ok' : 'fail'}`}>{allOk ? 'Odległości OK' : !allInside ? 'Poza działką' : d.gaps.some((g) => g.overlap) ? 'Budynki nachodzą' : 'Sprawdź odległości'}</span>}>
        {several && (
          <div className="row">
            <span className="grow">Przesuwany budynek</span>
            <div className="seg">
              {[{ id: 'main', label: 'Dom' }, ...d.annexes.map((a) => ({ id: a.id, label: a.label }))].map((b) => (
                <button key={b.id} className={target === b.id ? 'on' : ''} onClick={() => set({ target: b.id })}>{b.label}</button>
              ))}
            </div>
          </div>
        )}
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
            {wallRows
              .filter((w) => w.distance < 30)
              .sort((a, b) => a.distance - a.required - (b.distance - b.required))
              .map((w) => (
                <tr key={w.key} className={w.status}>
                  <td>{w.label}</td>
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
        {d.gaps.map((g) => (
          <p key={g.id} className={`hint ${g.overlap ? 'warn' : ''}`}>
            Odstęp dom–{g.label.toLowerCase()}: <b>{g.overlap ? 'budynki nachodzą na siebie' : `${f(g.d, 2)} m`}</b> (najbliższe ściany).
          </p>
        ))}
        {d.annexes.length > 0 && (
          <p className="hint">Odległości od granic dotyczą też garażu i budynków dodatkowych; sprawdź, czy MPZP / WZ pozwala postawić budynek gospodarczy bliżej granicy.</p>
        )}
      </Section>

      <Section title={several ? 'Narożniki budynków i tarasu → najbliższa granica' : 'Narożniki domu i tarasu → najbliższa granica'}>
        <CornerTable />
        <p className="hint">Odległość od każdego narożnika domu (A–{cornerLabel(house.outline.length - 1)}), narożnika tarasu (T){d.annexes.map((a) => <span key={a.id}>, narożników budynku „{a.label}” ({a.letter}1–{a.letter}{a.def.outline.length})</span>)} i narysowanych patio (P…) do najbliższej krawędzi działki{house.twoEdgeCorners.length > 0 && <> (dla {house.twoEdgeCorners.map(cornerLabel).join(' i ')} do dwóch najbliższych)</>} (numery 1–{site.parcel.length} przy krawędziach). Pomiary przechodzące przez dom są pomijane. Czerwone &lt; 3 m, pomarańczowe &lt; 4 m.</p>
      </Section>

      <Section title={several ? `Poziom posadzki i roboty ziemne · ${t.id === 'main' ? 'dom' : t.label.toLowerCase()}` : 'Poziom posadzki i roboty ziemne'}>
        <div className="row">
          <label className="grow">±0,00 (m n.p.m.)
            <input type="number" step={0.05} value={tg.floorH.toFixed(2)} onChange={(e) => setFloor(+e.target.value)} />
          </label>
          <button className={floorLevel === null ? 'on' : ''} onClick={() => setFloor(null)}>Auto (bilans mas)</button>
          <button onClick={() => setFloor(Math.round((ew.terrainMax + 0.3) * 100) / 100)}>Najwyższy + 0,30</button>
        </div>
        <input type="range" min={(ew.terrainMin - 1).toFixed(2)} max={(ew.terrainMax + 1.5).toFixed(2)} step={0.05} value={tg.floorH} onChange={(e) => setFloor(+e.target.value)} />
        <div className="stats">
          <div><b>{f((ew.terrainMax - ew.terrainMin), 2)} m</b><span>spadek pod {t.id === 'main' ? 'domem' : 'garażem'}</span></div>
          <div><b>{f(ew.cut, 0)} m³</b><span>wykop</span></div>
          <div><b>{f(ew.fill, 0)} m³</b><span>nasyp</span></div>
          <div><b>{f((tg.floorH - ew.terrainMin), 2)} m</b><span>posadzka nad najniższym pkt</span></div>
        </div>
        <p className="hint">Teren {f(ew.terrainMin)}–{f(ew.terrainMax)} m n.p.m. (GUGiK NMT 1 m). Poziom auto ±0,00 = {f(tg.autoFloor)}. Platforma na ±0,00 − {f(t.def.plinth)} m, skarpy 1:2. Roboty ziemne liczone tylko dla platformy (bez wykopów pod fundamenty).
          {several && <> Razem dom i {d.annexes.map((a) => a.label.toLowerCase()).join(', ')}: wykop {f(d.earthwork.cut + d.annexes.reduce((s2, a) => s2 + a.earthwork.cut, 0), 0)} m³, nasyp {f(d.earthwork.fill + d.annexes.reduce((s2, a) => s2 + a.earthwork.fill, 0), 0)} m³.</>}
        </p>
        <Profile />
      </Section>

      <Section title="Budynki dodatkowe">
        <p className="hint">Wspólne dla wszystkich projektów domu. Dodany budynek przesuwasz, obracasz i poziomujesz jak dom (przełącznik „Przesuwany budynek” u góry albo przeciągnij go na planie).</p>
        <div className="chips">
          {OUTBUILDINGS.map((k) => (
            <button key={k.kind} onClick={() => useStore.getState().addOutbuilding(k.kind, defaultOutbuildingPlacement(house, k.def, useStore.getState().placement))}>
              + {k.label} ({f(k.def.width)} × {f(k.def.depth)} m)
            </button>
          ))}
        </div>
        {d.annexes.filter((a) => a.outbuilding).map((a) => (
          <div key={a.id} className="row">
            <span className="grow">{a.label} · {f(a.def.width)} × {f(a.def.depth)} m · posadzka {f(a.floorH)}</span>
            <button className={target === a.id ? 'on' : ''} onClick={() => set({ target: a.id })}>Wybierz</button>
            <button className="danger" onClick={() => useStore.getState().removeOutbuilding(a.id)}>Usuń</button>
          </div>
        ))}
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
  const house = d.house;
  const pl = useDeferredValue(useStore((s) => s.placement));
  const W = 320, H = 130;
  const half = 26;
  const samples = 105;
  const pts: { s: number; t0: number; t1: number; roof: number | null }[] = [];
  for (let i = 0; i < samples; i++) {
    const s = -half + (2 * half * i) / (samples - 1); // along local z (front +)
    const p = toSite([0, s], pl);
    const t0 = site.dem.heightAt(p[0], p[1]);
    const t1 = carvedHeight(site, p[0], p[1], d.platforms);
    const Y = s + house.depth / 2;
    let roof: number | null = null;
    for (let X = -1.5; X <= house.width + 1.5; X += 0.25) {
      const r = roofTopAt(house, X, Y);
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
        {[...d.corners, ...d.annexes.flatMap((a) => a.corners)].map((c) => (
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
