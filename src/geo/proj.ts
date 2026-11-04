import proj4 from 'proj4';
import type { Site } from './site';

proj4.defs('EPSG:2180', '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +units=m +no_defs');

/** site-local (x east, z south) → WGS84 [lat, lon] */
export function localToLatLon(site: Site, x: number, z: number): [number, number] {
  const [lon, lat] = proj4('EPSG:2180', 'EPSG:4326', [site.meta.origin.E + x, site.meta.origin.N - z]);
  return [lat, lon];
}

/** true-north azimuth (°) of a grid bearing at site-local (x,z) */
export function trueBearing(site: Site, x: number, z: number, gridBearingDeg: number): number {
  const r = (gridBearingDeg * Math.PI) / 180;
  const [la1, lo1] = localToLatLon(site, x, z);
  const [la2, lo2] = localToLatLon(site, x + Math.sin(r) * 100, z - Math.cos(r) * 100);
  const φ1 = (la1 * Math.PI) / 180, φ2 = (la2 * Math.PI) / 180, Δλ = ((lo2 - lo1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const xx = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, xx) * 180) / Math.PI + 360) % 360;
}

export const compass8 = (deg: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
export const compassPl = (deg: number) => ['pn.', 'pn.-wsch.', 'wsch.', 'pd.-wsch.', 'pd.', 'pd.-zach.', 'zach.', 'pn.-zach.'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
