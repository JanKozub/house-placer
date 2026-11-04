import { useEffect, useState } from 'react';
import { loadSite, type Site } from './geo/site';
import { SiteContext } from './derived';
import { useStore } from './store';
import { centroid } from './placement/geom2d';
import { PreviewView } from './views/PreviewView';
import { PlacementView } from './views/PlacementView';
import { PlacementPanel, PreviewPanel } from './ui/Panels';

export function App() {
  const [site, setSite] = useState<Site | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const tab = useStore((s) => s.tab);
  const set = useStore((s) => s.set);

  useEffect(() => {
    loadSite()
      .then((s) => {
        const st = useStore.getState();
        if (!st.placementInitialised) {
          const c = centroid(s.parcel);
          st.set({ placement: { x: Math.round(c[0] * 10) / 10, z: Math.round(c[1] * 10) / 10, bearing: 222, mirror: false }, placementInitialised: true });
        }
        setSite(s);
      })
      .catch((e) => setErr(String(e)));
  }, []);

  if (err) return <div className="splash">Could not load site data: {err}<br />Run <code>npm run fetch-site</code>.</div>;
  if (!site) return <div className="splash">Loading plot 664/2…</div>;

  return (
    <SiteContext.Provider value={site}>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <strong>Ambrozja 17</strong> <span>on plot {site.meta.parcelNumber} · {site.meta.region}, gm. {site.meta.commune}</span>
          </div>
          <nav className="tabs">
            <button className={tab === 'preview' ? 'on' : ''} onClick={() => set({ tab: 'preview' })}>3D preview</button>
            <button className={tab === 'placement' ? 'on' : ''} onClick={() => set({ tab: 'placement' })}>Placement</button>
          </nav>
        </header>
        <main className="main">
          <aside className="sidebar">{tab === 'preview' ? <PreviewPanel /> : <PlacementPanel />}</aside>
          {tab === 'preview' ? <PreviewView /> : <PlacementView />}
        </main>
      </div>
    </SiteContext.Provider>
  );
}
