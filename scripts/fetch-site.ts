/**
 * One-off site data fetch from GUGiK public services.
 *   npm run fetch-site
 * Writes public/site/{site.json, parcel.json, neighbors.json, dem.bin, ortho.jpg}
 *
 * Coordinates: EPSG:2180 (PUWG 1992). WKT from ULDK is "E N" order.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fromArrayBuffer } from 'geotiff';
import proj4 from 'proj4';

const PARCEL_ID = '120906_2.0004.664/2';
const OUT = new URL('../public/site/', import.meta.url);
const SIZE = 320; // metres, square bbox around parcel centroid
const DEM_RES = 1; // m/px
const ORTHO_PX = 2048;

proj4.defs(
  'EPSG:2180',
  '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +units=m +no_defs',
);

type Ring = [number, number][];

function parseWkt(wkt: string): Ring {
  const m = wkt.match(/POLYGON\s*\(\((.*?)\)/);
  if (!m) throw new Error('bad wkt ' + wkt);
  return m[1].split(',').map((p) => p.trim().split(/\s+/).map(Number) as [number, number]);
}

async function uldk(params: string): Promise<string[] | null> {
  const url = `https://uldk.gugik.gov.pl/?${params}`;
  for (let i = 0; i < 3; i++) {
    try {
      const txt = (await (await fetch(url)).text()).trim();
      const lines = txt.split('\n');
      if (lines[0].trim() !== '0') return null;
      return lines[1].split('|');
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return null;
}

type BBox = { minE: number; minN: number; maxE: number; maxN: number };
const UA = 'house-placer/0.1 (https://github.com/JanKozub/house-placer)';

/** satellite imagery for a bbox in EPSG:2180: Esri World Imagery, falling back to the GUGiK orthophoto */
async function fetchImagery(b: BBox, file: string, px: number) {
  const sources = [
    {
      name: 'Esri World Imagery',
      url: `https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=${b.minE},${b.minN},${b.maxE},${b.maxN}&bboxSR=2180&imageSR=2180&size=${px},${px}&format=jpg&f=image`,
    },
    {
      name: 'GUGiK ORTO',
      url: `https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=Raster&STYLES=&SRS=EPSG:2180&BBOX=${b.minE},${b.minN},${b.maxE},${b.maxN}&WIDTH=${px}&HEIGHT=${px}&FORMAT=image/jpeg`,
    },
  ];
  for (const src of sources) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(src.url, { headers: { 'User-Agent': UA } });
        const buf = Buffer.from(await r.arrayBuffer());
        // reject errors and blank (all-white) images, which compress to tiny files
        if (r.ok && buf.length > px * px * 0.04 && (r.headers.get('content-type') ?? '').includes('image')) {
          await writeFile(new URL(file, OUT), buf);
          console.log(file, src.name, px, 'bytes', buf.length);
          return src.name;
        }
        console.log(file, src.name, 'failed', r.status, buf.length);
      } catch (e) {
        console.log(file, src.name, 'error', String(e));
      }
      await new Promise((res) => setTimeout(res, 1500));
    }
  }
  return null;
}

const ROAD_WIDTH: Record<string, number> = {
  primary: 7, secondary: 6.5, tertiary: 5.5, unclassified: 4.5, residential: 4.5, living_street: 4,
  service: 3, track: 3, footway: 1.5, path: 1.2, cycleway: 2, steps: 1.5,
};

/** roads from OpenStreetMap (Overpass API), converted to site-local coordinates */
async function fetchRoads(b: BBox, E0: number, N0: number) {
  const [w, s] = proj4('EPSG:2180', 'EPSG:4326', [b.minE, b.minN]);
  const [e, n] = proj4('EPSG:2180', 'EPSG:4326', [b.maxE, b.maxN]);
  const q = `[out:json][timeout:60];way["highway"](${s},${w},${n},${e});out geom tags;`;
  for (const host of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const r = await fetch(host, {
        method: 'POST',
        headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(q),
      });
      if (!r.ok) { console.log('overpass', host, r.status); continue; }
      const d = (await r.json()) as { elements: { id: number; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[] };
      const roads = d.elements
        .filter((el) => el.geometry && el.tags?.highway)
        .map((el) => {
          const t = el.tags!;
          const width = Number(t.width) || (Number(t.lanes) ? Number(t.lanes) * 3 : ROAD_WIDTH[t.highway] ?? 3);
          return {
            id: el.id,
            highway: t.highway,
            name: t.name ?? null,
            surface: t.surface ?? (['tertiary', 'secondary', 'primary', 'residential'].includes(t.highway) ? 'asphalt' : 'unpaved'),
            width,
            pts: el.geometry!.map(({ lat, lon }) => {
              const [E, N] = proj4('EPSG:4326', 'EPSG:2180', [lon, lat]);
              return [Math.round((E - E0) * 100) / 100, Math.round(-(N - N0) * 100) / 100];
            }),
          };
        });
      await writeFile(new URL('roads.json', OUT), JSON.stringify(roads));
      console.log('roads', roads.length, [...new Set(roads.map((r) => r.name).filter(Boolean))].join(', '));
      return true;
    } catch (err) {
      console.log('overpass error', host, String(err));
    }
  }
  return false;
}

/** imagery (whole DEM area + sharper close-up around the plot) and roads; updates site.json */
async function fetchMap() {
  const { readFile } = await import('node:fs/promises');
  const meta = JSON.parse(await readFile(new URL('site.json', OUT), 'utf8'));
  const { E: E0, N: N0 } = meta.origin;
  const baseSrc = await fetchImagery(meta.bbox, 'ortho.jpg', ORTHO_PX);
  // (no close-up: Esri serves the plot area at ~0.3 m/px at most, already below the base image's 0.16 m/px)
  const roads = (await fetchRoads(meta.bbox, E0, N0)) || existsSync(new URL('roads.json', OUT));
  meta.imagery = baseSrc ? { file: 'ortho.jpg', source: baseSrc } : null;
  meta.roads = roads ? 'roads.json' : null;
  delete meta.ortho;
  await writeFile(new URL('site.json', OUT), JSON.stringify(meta, null, 2));
}

async function main() {
  if (process.argv.includes('--map-only') || process.argv.includes('--ortho-only')) {
    await fetchMap();
    return;
  }
  await mkdir(OUT, { recursive: true });

  // 1. Parcel
  const p = await uldk(
    `request=GetParcelById&id=${encodeURIComponent(PARCEL_ID)}&result=id,parcel,region,commune,geom_wkt&srid=2180`,
  );
  if (!p) throw new Error('parcel not found');
  const ring = parseWkt(p[4]);
  if (ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1]) ring.pop();
  let cx = 0, cy = 0;
  for (const [e, n] of ring) { cx += e; cy += n; }
  cx /= ring.length; cy /= ring.length;
  const E0 = Math.round(cx), N0 = Math.round(cy);
  const [lon, lat] = proj4('EPSG:2180', 'EPSG:4326', [E0, N0]);
  console.log('parcel', p[1], p[2], p[3], 'vertices', ring.length, 'origin', E0, N0, lat, lon);

  const half = SIZE / 2;
  const bbox = { minE: E0 - half, minN: N0 - half, maxE: E0 + half, maxN: N0 + half };

  // 2. Neighbouring parcels: sample a grid, dedupe by id
  const neighbors = new Map<string, { id: string; parcel: string; ring: Ring }>();
  const pts: [number, number][] = [];
  for (let e = bbox.minE + 10; e < bbox.maxE; e += 18)
    for (let n = bbox.minN + 10; n < bbox.maxN; n += 18) pts.push([e, n]);
  let idx = 0;
  async function worker() {
    while (idx < pts.length) {
      const [e, n] = pts[idx++];
      const known = [...neighbors.values()].some((nb) => pointInRing(e, n, nb.ring));
      if (known) continue;
      const r = await uldk(`request=GetParcelByXY&xy=${e},${n},2180&result=id,parcel,geom_wkt&srid=2180`);
      if (r && !neighbors.has(r[0])) neighbors.set(r[0], { id: r[0], parcel: r[1], ring: parseWkt(r[2]) });
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  neighbors.delete(PARCEL_ID);
  console.log('neighbours', neighbors.size);

  // 3. DEM (NMT 1 m, PL-KRON86-NH heights) via WCS GeoTIFF
  const W = SIZE / DEM_RES;
  const demUrl =
    `https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModelFormatTIFF?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage` +
    `&COVERAGE=DTM_PL-KRON86-NH_TIFF&CRS=EPSG:2180&BBOX=${bbox.minE},${bbox.minN},${bbox.maxE},${bbox.maxN}&WIDTH=${W}&HEIGHT=${W}&FORMAT=image/tiff`;
  const tiff = await fromArrayBuffer(await (await fetch(demUrl)).arrayBuffer());
  const img = await tiff.getImage();
  const ras = (await img.readRasters({ interleave: true })) as unknown as Float32Array;
  const dem = new Float32Array(ras);
  let min = Infinity, max = -Infinity;
  for (const v of dem) if (v > -100) { min = Math.min(min, v); max = Math.max(max, v); }
  // fill nodata with min
  for (let i = 0; i < dem.length; i++) if (!(dem[i] > -100)) dem[i] = min;
  await writeFile(new URL('dem.bin', OUT), Buffer.from(dem.buffer));
  console.log('dem', img.getWidth(), img.getHeight(), 'range', min, max);

  const site = {
    parcelId: PARCEL_ID,
    parcelNumber: p[1],
    region: p[2],
    commune: p[3],
    origin: { E: E0, N: N0, lat, lon },
    bbox,
    dem: { width: img.getWidth(), height: img.getHeight(), res: DEM_RES, min, max, datum: 'PL-KRON86-NH' },
    fetched: new Date().toISOString(),
  };
  await writeFile(new URL('site.json', OUT), JSON.stringify(site, null, 2));
  await writeFile(new URL('parcel.json', OUT), JSON.stringify({ id: PARCEL_ID, ring }, null, 2));
  await writeFile(new URL('neighbors.json', OUT), JSON.stringify([...neighbors.values()]));

  // 4. Imagery + roads
  await fetchMap();
}

function pointInRing(x: number, y: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
