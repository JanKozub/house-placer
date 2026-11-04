import * as SunCalc from 'suncalc';
import * as THREE from 'three';
import type { Sun } from '../store';
import type { P2 } from '../placement/geom2d';

const YEAR = 2027;

// constructing Intl formatters is slow — build them once
const WARSAW_PARTS = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Warsaw', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});
const WARSAW_HM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hour12: false });

/** Build a Date for a wall-clock time in Europe/Warsaw (handles CET/CEST). */
export function warsawDate(month: number, day: number, minutes: number): Date {
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  let guess = Date.UTC(YEAR, month - 1, day, h, m) - 3600_000;
  for (let i = 0; i < 2; i++) {
    const parts = WARSAW_PARTS.formatToParts(new Date(guess));
    const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
    guess += Date.UTC(YEAR, month - 1, day, h, m) - shown;
  }
  return new Date(guess);
}

export interface SunState {
  dir: THREE.Vector3; // unit vector towards the sun, scene frame
  altitude: number; // radians
  azimuthDeg: number; // compass, from true north clockwise
  night: number; // 0 day … 1 full night
  date: Date;
}

/**
 * suncalc v2: azimuth in degrees clockwise from north, altitude in degrees. Convert to the
 * scene frame using the true-north vector in site coordinates (x east, z south).
 */
export function sunState(sun: Sun, lat: number, lon: number, trueNorth: P2): SunState {
  const date = warsawDate(sun.month, sun.day, sun.minutes);
  const pd = SunCalc.getPosition(date, lat, lon);
  const p = { azimuth: (pd.azimuth * Math.PI) / 180, altitude: (pd.altitude * Math.PI) / 180 };
  const compass = p.azimuth; // from true north, clockwise (east positive)
  const N = new THREE.Vector2(trueNorth[0], trueNorth[1]);
  const E = new THREE.Vector2(-N.y, N.x); // rotate N 90° clockwise seen from above (x east, z south)
  // horizontal direction = N cos(c) + E sin(c)
  const hx = N.x * Math.cos(compass) + E.x * Math.sin(compass);
  const hz = N.y * Math.cos(compass) + E.y * Math.sin(compass);
  const ca = Math.cos(p.altitude);
  const dir = new THREE.Vector3(hx * ca, Math.sin(p.altitude), hz * ca).normalize();
  const altDeg = (p.altitude * 180) / Math.PI;
  const night = THREE.MathUtils.clamp((2 - altDeg) / 8, 0, 1);
  return { dir, altitude: p.altitude, azimuthDeg: ((compass * 180) / Math.PI + 360) % 360, night, date };
}

export function sunTimes(sun: Sun, lat: number, lon: number) {
  const t = SunCalc.getTimes(warsawDate(sun.month, sun.day, 12 * 60), lat, lon);
  const toMin = (d: Date | null) => {
    if (!d || isNaN(d.getTime())) return NaN;
    const s = WARSAW_HM.format(d);
    const [h, m] = s.split(':').map(Number);
    return h * 60 + m;
  };
  return { sunrise: toMin(t.sunrise), sunset: toMin(t.sunset), noon: toMin(t.solarNoon) };
}

/** Simple analytic HDR sky as an equirectangular float texture (works for raster PMREM and the path tracer). */
export function makeSkyTexture(sunDir: THREE.Vector3, W = 256, H = 128): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Float32Array(W * H * 4), W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return fillSkyTexture(tex, sunDir);
}

/**
 * Re-fill an existing sky texture in place. Keeping the same texture object matters: a new
 * environment texture makes three.js recompile every material's shader.
 */
export function fillSkyTexture(tex: THREE.DataTexture, sunDir: THREE.Vector3): THREE.DataTexture {
  const W = tex.image.width, H = tex.image.height;
  const data = tex.image.data as Float32Array;
  const alt = Math.asin(THREE.MathUtils.clamp(sunDir.y, -1, 1));
  const day = THREE.MathUtils.clamp((alt + 0.1) / 0.35, 0, 1); // 0 at -6°, 1 at ~14°
  const golden = THREE.MathUtils.clamp(1 - Math.abs(alt - 0.05) / 0.25, 0, 1);
  const zenith = new THREE.Color(0.16, 0.36, 0.85).multiplyScalar(0.9 * day + 0.01);
  const horizon = new THREE.Color(0.72, 0.82, 0.95).lerp(new THREE.Color(1.0, 0.62, 0.38), golden * 0.7).multiplyScalar(1.1 * day + 0.015);
  const ground = new THREE.Color(0.22, 0.24, 0.2).multiplyScalar(0.6 * day + 0.01);
  const sunCol = new THREE.Color(1, 0.93, 0.82).lerp(new THREE.Color(1, 0.55, 0.3), golden);
  const d = new THREE.Vector3();
  const tmp = new THREE.Color();
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H;
    const theta = (v - 0.5) * Math.PI; // elevation
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W;
      const phi = (u - 0.5) * 2 * Math.PI;
      d.set(Math.cos(phi) * Math.cos(theta), Math.sin(theta), Math.sin(phi) * Math.cos(theta));
      if (d.y >= 0) {
        const t = Math.pow(1 - d.y, 4);
        tmp.copy(zenith).lerp(horizon, t);
      } else {
        tmp.copy(horizon).lerp(ground, Math.min(1, -d.y * 6));
      }
      const cos = d.dot(sunDir);
      if (alt > -0.12) {
        const glow = Math.pow(Math.max(cos, 0), 8) * 0.6 + Math.pow(Math.max(cos, 0), 64) * 1.5;
        tmp.r += sunCol.r * glow * day;
        tmp.g += sunCol.g * glow * day;
        tmp.b += sunCol.b * glow * day;
        // sun disc (≈1 texel at this resolution, intensity scaled to keep the same energy)
        if (cos > 0.9997 && d.y > -0.01) {
          tmp.r += 70 * sunCol.r * day;
          tmp.g += 70 * sunCol.g * day;
          tmp.b += 70 * sunCol.b * day;
        }
      }
      const k = (j * W + i) * 4;
      data[k] = tmp.r;
      data[k + 1] = tmp.g;
      data[k + 2] = tmp.b;
      data[k + 3] = 1;
    }
  }
  tex.needsUpdate = true;
  return tex;
}

/** sky colour at the horizon for a sun direction (matches makeSkyTexture), used for distance haze */
export function horizonColor(sunDir: THREE.Vector3): THREE.Color {
  const alt = Math.asin(THREE.MathUtils.clamp(sunDir.y, -1, 1));
  const day = THREE.MathUtils.clamp((alt + 0.1) / 0.35, 0, 1);
  const golden = THREE.MathUtils.clamp(1 - Math.abs(alt - 0.05) / 0.25, 0, 1);
  return new THREE.Color(0.72, 0.82, 0.95).lerp(new THREE.Color(1.0, 0.62, 0.38), golden * 0.7).multiplyScalar(1.1 * day + 0.015);
}
