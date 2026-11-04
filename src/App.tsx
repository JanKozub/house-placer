import { useEffect, useState } from 'react';
import { loadSite, type Site } from './geo/site';
import { DerivedProvider, SiteContext } from './derived';
import { useStore } from './store';
import { centroid } from './placement/geom2d';
import { Viewport } from './views/Viewport';
import { PlacementPanel, PreviewPanel } from './ui/Panels';
import { HOUSE_LIST, useHouse } from './house/projects';
import { usePreviewUi } from './views/PreviewView';

export function App() {
  const [site, setSite] = useState<Site | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const tab = useStore((s) => s.tab);
  const set = useStore((s) => s.set);
  const setProject = useStore((s) => s.setProject);
  const house = useHouse();

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

  const switchTab = (t: 'preview' | 'placement') => set({ tab: t });
  useEffect(() => {
    if (site) document.title = `${house.name} na działce ${site.meta.parcelNumber}`;
  }, [house, site]);

  if (err) return <div className="splash">Nie udało się wczytać danych działki: {err}<br />Uruchom <code>npm run fetch-site</code>.</div>;
  if (!site) return <div className="splash">Wczytywanie działki 664/2…</div>;

  return (
    <SiteContext.Provider value={site}>
      <DerivedProvider>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <select
              className="project-select"
              value={house.id}
              title="Projekt domu"
              onChange={(e) => {
                usePreviewUi.getState().setPhoto(null); // the path tracer holds the old scene
                setProject(e.target.value);
              }}
            >
              {HOUSE_LIST.map((h) => (
                <option key={h.id} value={h.id}>{h.name} ({h.code})</option>
              ))}
            </select>{' '}
            <span>na działce nr {site.meta.parcelNumber} · {site.meta.region}, gm. {site.meta.commune}</span>
          </div>
          <nav className="tabs">
            <button className={tab === 'preview' ? 'on' : ''} onClick={() => switchTab('preview')}>Podgląd 3D</button>
            <button className={tab === 'placement' ? 'on' : ''} onClick={() => switchTab('placement')}>Ustawienie na działce</button>
          </nav>
        </header>
        <main className="main">
          <aside className="sidebar">{tab === 'preview' ? <PreviewPanel /> : <PlacementPanel />}</aside>
          <Viewport />
        </main>
      </div>
      </DerivedProvider>
    </SiteContext.Provider>
  );
}
