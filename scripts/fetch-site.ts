/**
 * One-off site data fetch from GUGiK public services.
 *   npm run fetch-site
 * Writes public/site/{site.json, parcel.json, neighbors.json, dem.bin, ortho.jpg, roads.json, land-*, buildings.json}
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
        const r = await fetch(src.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(120_000) });
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

/** imagery for the DEM area and roads; updates site.json */
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

/** GUGiK DSM (surface incl. trees/buildings) as an ASCII grid → Float32 heights, row 0 = north */
async function fetchDsm(b: BBox, px: number): Promise<Float32Array> {
  const url =
    `https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage` +
    `&COVERAGE=DSM_PL-KRON86-NH&CRS=EPSG:2180&BBOX=${b.minE},${b.minN},${b.maxE},${b.maxN}&WIDTH=${px}&HEIGHT=${px}&FORMAT=image/x-aaigrid`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const txt = await (await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(300_000) })).text();
      const lines = txt.split('\n');
      const hdr: Record<string, number> = {};
      let k = 0;
      while (k < lines.length && /^[a-zA-Z]/.test(lines[k].trim())) {
        const [key, v] = lines[k].trim().split(/\s+/);
        hdr[key.toLowerCase()] = Number(v);
        k++;
      }
      const vals = lines.slice(k).join(' ').trim().split(/\s+/).map(Number);
      if (hdr.ncols !== px || vals.length < px * px) throw new Error(`bad grid ${hdr.ncols}×${hdr.nrows}, ${vals.length} values`);
      const nodata = hdr.nodata_value ?? -9999;
      const out = new Float32Array(px * px);
      // GUGiK's DSM has gaps (0 / nodata); mark them NaN so the caller can fill from the DTM
      for (let i = 0; i < px * px; i++) out[i] = vals[i] === nodata || !(vals[i] > 1) ? NaN : vals[i];
      return out;
    } catch (e) {
      console.log('dsm attempt failed', String(e));
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('DSM unavailable');
}

/** GUGiK DTM (bare terrain, complete coverage) as Float32 heights, row 0 = north */
async function fetchDtm(b: BBox, px: number): Promise<Float32Array> {
  const url =
    `https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMT/GRID1/WCS/DigitalTerrainModelFormatTIFF?SERVICE=WCS&VERSION=1.0.0&REQUEST=GetCoverage` +
    `&COVERAGE=DTM_PL-KRON86-NH_TIFF&CRS=EPSG:2180&BBOX=${b.minE},${b.minN},${b.maxE},${b.maxN}&WIDTH=${px}&HEIGHT=${px}&FORMAT=image/tiff`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const tiff = await fromArrayBuffer(await (await fetch(url, { signal: AbortSignal.timeout(300_000) })).arrayBuffer());
      const ras = (await (await tiff.getImage()).readRasters({ interleave: true })) as unknown as Float32Array;
      return new Float32Array(ras);
    } catch (e) {
      console.log('dtm attempt failed', String(e));
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('DTM unavailable');
}

/** DSM in n×n tiles (the service drops large requests); null if any tile fails */
async function fetchDsmTiled(b: BBox, px: number, n: number): Promise<Float32Array | null> {
  const tp = px / n, ts = (b.maxE - b.minE) / n;
  const out = new Float32Array(px * px);
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++) {
      const tb: BBox = { minE: b.minE + col * ts, maxE: b.minE + (col + 1) * ts, maxN: b.maxN - row * ts, minN: b.maxN - (row + 1) * ts };
      let t: Float32Array;
      try {
        t = await fetchDsm(tb, tp);
      } catch {
        console.warn('DSM tile unavailable — falling back to DTM + OSM forest canopy');
        return null;
      }
      for (let j = 0; j < tp; j++) out.set(t.subarray(j * tp, (j + 1) * tp), (row * tp + j) * px + col * tp);
    }
  return out;
}

/** OSM forest/wood polygons rasterised onto a grid (1 = canopy), row 0 = north */
async function forestMask(b: BBox, px: number): Promise<Uint8Array | null> {
  const [w, s] = proj4('EPSG:2180', 'EPSG:4326', [b.minE, b.minN]);
  const [e, n] = proj4('EPSG:2180', 'EPSG:4326', [b.maxE, b.maxN]);
  const q = `[out:json][timeout:90];(way["landuse"="forest"](${s},${w},${n},${e});way["natural"="wood"](${s},${w},${n},${e}););out geom;`;
  try {
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(q),
      signal: AbortSignal.timeout(180_000),
    });
    if (!r.ok) throw new Error(String(r.status));
    const d = (await r.json()) as { elements: { geometry?: { lat: number; lon: number }[] }[] };
    const mask = new Uint8Array(px * px);
    const res = (b.maxE - b.minE) / px;
    let polys = 0;
    for (const el of d.elements) {
      if (!el.geometry || el.geometry.length < 4) continue;
      // to grid coords (col, row)
      const pts = el.geometry.map(({ lat, lon }) => {
        const [E, N] = proj4('EPSG:4326', 'EPSG:2180', [lon, lat]);
        return [(E - b.minE) / res, (b.maxN - N) / res] as [number, number];
      });
      polys++;
      let r0 = Infinity, r1 = -Infinity;
      for (const [, y] of pts) { r0 = Math.min(r0, y); r1 = Math.max(r1, y); }
      for (let row = Math.max(0, Math.floor(r0)); row <= Math.min(px - 1, Math.ceil(r1)); row++) {
        const y = row + 0.5;
        const xs: number[] = [];
        for (let k = 0, m = pts.length - 1; k < pts.length; m = k++) {
          const [x1, y1] = pts[k], [x2, y2] = pts[m];
          if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1));
        }
        xs.sort((a, c) => a - c);
        for (let k = 0; k + 1 < xs.length; k += 2)
          for (let col = Math.max(0, Math.ceil(xs[k] - 0.5)); col <= Math.min(px - 1, Math.floor(xs[k + 1] - 0.5)); col++) mask[row * px + col] = 1;
      }
    }
    console.log('forest polygons', polys);
    return mask;
  } catch (e) {
    console.warn('OSM forests unavailable', String(e));
    return null;
  }
}

const CANOPY_M = 18;

/** heights as Uint16 centimetres-above-base so they stay small: h = base + v / 50 (2 cm steps) */
function packHeights(h: Float32Array) {
  let mn = Infinity;
  for (const v of h) mn = Math.min(mn, v);
  const base = Math.floor(mn);
  const u = new Uint16Array(h.length);
  for (let i = 0; i < h.length; i++) u[i] = Math.max(0, Math.min(65535, Math.round((h[i] - base) * 50)));
  return { base, scale: 1 / 50, buf: Buffer.from(u.buffer) };
}

/**
 * Wider landscape for views from the house: an 8 km DSM ring (trees/buildings, 8 m) and a 30 km
 * horizon ring (60 m), each with satellite imagery. Updates site.json → landscape.
 */
async function fetchLandscape() {
  const { readFile } = await import('node:fs/promises');
  const meta = JSON.parse(await readFile(new URL('site.json', OUT), 'utf8'));
  const { E: E0, N: N0 } = meta.origin;
  const rings = [
    { name: 'wide', size: 8000, px: 1000, dsm: true, tiles: 2 },
    { name: 'far', size: 30000, px: 500, dsm: false, tiles: 1 },
  ];
  const landscape: Record<string, unknown> = {};
  for (const r of rings) {
    const h = r.size / 2;
    const b: BBox = { minE: E0 - h, minN: N0 - h, maxE: E0 + h, maxN: N0 + h };
    const dtm = await fetchDtm(b, r.px);
    const heights = new Float32Array(dtm);
    let dsmCover = 0, canopy = 0;
    if (r.dsm) {
      // prefer the real surface model (trees, buildings); fill its gaps with DTM + OSM forest canopy
      const dsm = await fetchDsmTiled(b, r.px, 2);
      const forest = await forestMask(b, r.px);
      for (let i = 0; i < dtm.length; i++) {
        if (dsm && Number.isFinite(dsm[i]) && dsm[i] >= dtm[i] - 2) {
          heights[i] = dsm[i];
          dsmCover++;
        } else if (forest?.[i]) {
          heights[i] = dtm[i] + CANOPY_M;
          canopy++;
        }
      }
    }
    const packed = packHeights(heights);
    await writeFile(new URL(`land-${r.name}.bin`, OUT), packed.buf);
    // imagery as n×n tiles of 2048 px (Esri times out on larger exports), row-major from the north-west
    const tiles: (string | null)[] = [];
    const ts = r.size / r.tiles;
    for (let row = 0; row < r.tiles; row++)
      for (let col = 0; col < r.tiles; col++) {
        const tb: BBox = { minE: b.minE + col * ts, maxE: b.minE + (col + 1) * ts, maxN: b.maxN - row * ts, minN: b.maxN - (row + 1) * ts };
        const file = `land-${r.name}-${row}${col}.jpg`;
        tiles.push((await fetchImagery(tb, file, 2048)) ? file : null);
      }
    landscape[r.name] = {
      bbox: b, size: r.size, px: r.px, res: r.size / r.px, base: packed.base, scale: packed.scale, file: `land-${r.name}.bin`,
      tiles: r.tiles, imagery: tiles.every(Boolean) ? tiles : null,
      surface: dsmCover ? 'GUGiK DSM + DTM' : canopy ? 'GUGiK DTM + OSM forest canopy' : 'GUGiK DTM',
    };
    console.log('landscape', r.name, r.size, 'm @', r.size / r.px, 'm', `DSM ${((100 * dsmCover) / dtm.length).toFixed(0)}%, canopy ${((100 * canopy) / dtm.length).toFixed(0)}%`, 'imagery', tiles.filter(Boolean).length + '/' + tiles.length);
  }
  meta.landscape = landscape;
  await writeFile(new URL('site.json', OUT), JSON.stringify(meta, null, 2));
}

const BUILDING_RADIUS = 2500; // m around the parcel
const CACHE = new URL('../.cache/bdot/', import.meta.url);

/** building kind from BDOT10k's detailed function */
function buildingKind(fn: string, general: string): 'h' | 'o' | 'c' | 'r' {
  if (/kości|kaplic|cerkiew|świątyni/i.test(fn)) return 'r';
  if (/gospodarcz|garaż|wiata|inwentarsk|stodo|szklarni/i.test(fn)) return 'o';
  if (/mieszkaln|jednorodzin|wielorodzin|letnisk/i.test(fn + ' ' + general)) return 'h';
  return 'c';
}

/**
 * Neighbouring buildings from GUGiK BDOT10k (EGiB outlines, storey count, function): the powiat
 * GML package(s) are downloaded once into .cache/bdot and cut to BUILDING_RADIUS around the parcel.
 * Output public/site/buildings.json: [{ k: kind, l: storeys, u?: under construction, p: [x,z,…] }].
 */
async function fetchBuildings() {
  const { readFile, readdir } = await import('node:fs/promises');
  const { execFileSync } = await import('node:child_process');
  const meta = JSON.parse(await readFile(new URL('site.json', OUT), 'utf8'));
  const { E: E0, N: N0 } = meta.origin;
  const R = BUILDING_RADIUS;
  // powiats covering the area (this WFS uses N,E axis order for EPSG:2180)
  const wfs =
    'https://mapy.geoportal.gov.pl/wss/service/PZGIK/BDOT/WFS/PobieranieBDOT10k?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature' +
    `&TYPENAMES=ms:BDOT10k_powiaty&BBOX=${N0 - R},${E0 - R},${N0 + R},${E0 + R},urn:ogc:def:crs:EPSG::2180`;
  await mkdir(CACHE, { recursive: true });
  let urls: string[] = [];
  for (let attempt = 0; attempt < 3 && !urls.length; attempt++) {
    try {
      const caps = await (await fetch(wfs, { headers: { 'User-Agent': UA } })).text();
      urls = [...caps.matchAll(/<ms:URL_GML>([^<]+)<\/ms:URL_GML>/g)].map((m) => m[1]);
    } catch (err) {
      console.log('BDOT10k index', String(err));
    }
  }
  // offline: reuse packages downloaded earlier
  if (!urls.length) urls = (await readdir(CACHE)).filter((f) => f.endsWith('_GML.zip')).map((f) => `cache/${f}`);
  if (!urls.length) throw new Error('no BDOT10k package found for the area');
  const out: { k: string; l: number; u?: 1; p: number[] }[] = [];
  const seen = new Set<string>();
  for (const url of urls) {
    const zip = new URL(url.split('/').pop()!, CACHE);
    if (!existsSync(zip)) {
      console.log('downloading', url);
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`BDOT10k ${r.status}`);
      await writeFile(zip, Buffer.from(await r.arrayBuffer()));
    }
    const dir = new URL(zip.href.replace(/\.zip$/, '/'));
    execFileSync('unzip', ['-o', '-q', zip.pathname, '*OT_BUBD_A.xml', '-d', dir.pathname]);
    const files = (await readdir(dir, { recursive: true })).filter((f) => String(f).endsWith('OT_BUBD_A.xml'));
    for (const f of files) {
      const xml = await readFile(new URL(String(f), dir), 'utf8');
      for (const m of xml.matchAll(/<ot:OT_BUBD_A [\s\S]*?<\/ot:OT_BUBD_A>/g)) {
        const rec = m[0];
        const pos = /<gml:exterior>[\s\S]*?<gml:posList>([^<]+)<\/gml:posList>/.exec(rec);
        if (!pos) continue;
        const v = pos[1].trim().split(/\s+/).map(Number);
        if (Math.hypot(v[0] - E0, v[1] - N0) > R) continue;
        const id = /<ot:lokalnyId>([^<]+)/.exec(rec)?.[1] ?? '';
        if (seen.has(id)) continue;
        seen.add(id);
        const status = /<ot:kategoriaIstnienia>([^<]+)/.exec(rec)?.[1] ?? '';
        if (/projektowany|zniszczony/.test(status)) continue;
        const fn = /<ot:funkcjaSzczegolowaBudynku>([^<]+)/.exec(rec)?.[1] ?? '';
        const general = /<ot:funkcjaOgolnaBudynku>([^<]+)/.exec(rec)?.[1] ?? '';
        const levels = Number(/<ot:liczbaKondygnacji>(\d+)/.exec(rec)?.[1]) || 1;
        const p: number[] = [];
        for (let i = 0; i + 1 < v.length; i += 2) p.push(Math.round((v[i] - E0) * 10) / 10, Math.round(-(v[i + 1] - N0) * 10) / 10);
        if (p[0] === p.at(-2) && p[1] === p.at(-1)) p.splice(-2, 2); // closing vertex
        if (p.length < 6) continue;
        out.push({ k: buildingKind(fn, general), l: levels, ...(status === 'w budowie' ? { u: 1 as const } : {}), p });
      }
    }
  }
  await writeFile(new URL('buildings.json', OUT), JSON.stringify(out));
  meta.buildings = { file: 'buildings.json', source: 'GUGiK BDOT10k', radius: R, count: out.length };
  await writeFile(new URL('site.json', OUT), JSON.stringify(meta, null, 2));
  const kinds: Record<string, number> = {};
  for (const b of out) kinds[b.k] = (kinds[b.k] ?? 0) + 1;
  console.log('buildings', out.length, kinds);
}

async function main() {
  if (process.argv.includes('--buildings-only')) {
    await fetchBuildings();
    return;
  }
  if (process.argv.includes('--map-only') || process.argv.includes('--ortho-only')) {
    await fetchMap();
    return;
  }
  if (process.argv.includes('--landscape-only')) {
    await fetchLandscape();
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

  // 4. Imagery + roads, then the wider landscape
  await fetchMap();
  await fetchLandscape();
  await fetchBuildings();
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
