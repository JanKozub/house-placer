import { useSite } from '../derived';
import { useStore } from '../store';

/** data credits required by the imagery / map providers */
export function Attribution() {
  const site = useSite();
  const ortho = useStore((s) => s.layers.ortho);
  const roads = useStore((s) => s.layers.roads !== false);
  const parts: React.ReactNode[] = [];
  if (site.orthoUrl && ortho) {
    parts.push(
      site.imagerySource?.startsWith('Esri') ? (
        <span key="img">Zdjęcia: Powered by Esri · Esri, Maxar, Earthstar Geographics, GIS User Community</span>
      ) : (
        <span key="img">Ortofotomapa: GUGiK</span>
      ),
    );
  }
  if (roads && site.roads.length)
    parts.push(
      <span key="osm">
        Drogi: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>
      </span>,
    );
  parts.push(<span key="gugik">Działki i teren: GUGiK</span>);
  return <div className="attribution">{parts.reduce<React.ReactNode[]>((acc, p, i) => (i ? [...acc, ' · ', p] : [p]), [])}</div>;
}
