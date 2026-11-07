/**
 * Extra buildings in the top bar: one chip per added building (click = select it for the placement
 * controls, × = remove) and a button to add one from the catalog.
 */
import { useStore } from '../store';
import { useHouse } from '../house/projects';
import { defaultOutbuildingPlacement } from '../house/annex';
import { OUTBUILDINGS, outbuildingKind } from '../house/outbuildings';
import { f } from './format';

export function OutbuildingBar() {
  const house = useHouse();
  const outbuildings = useStore((s) => s.outbuildings);
  const target = useStore((s) => s.target);

  const add = (kind: string) => {
    const k = outbuildingKind(kind);
    if (!k) return;
    const s = useStore.getState();
    s.addOutbuilding(kind, defaultOutbuildingPlacement(house, k.def, s.placement));
  };
  const select = (id: string) => useStore.getState().set({ target: id, tab: 'placement', selected: null });

  // same names as the plan view and the tables: a second copy is "Wiata + garaż 2"
  const seen = new Map<string, number>();
  const chips = outbuildings.flatMap((o) => {
    const k = outbuildingKind(o.kind);
    if (!k) return [];
    const n = (seen.get(o.kind) ?? 0) + 1;
    seen.set(o.kind, n);
    return [{ id: o.id, label: n > 1 ? `${k.label} ${n}` : k.label, size: `${f(k.def.width)} × ${f(k.def.depth)} m` }];
  });

  return (
    <div className="ob-bar" role="group" aria-label="Budynki dodatkowe">
      {chips.map((c) => (
        <span key={c.id} className={`ob-chip ${target === c.id ? 'on' : ''}`}>
          <button className="ob-select" aria-pressed={target === c.id} title={`${c.label} · ${c.size} · ustaw na działce`} onClick={() => select(c.id)}>
            {c.label}
          </button>
          <button className="ob-remove" aria-label={`Usuń: ${c.label}`} title="Usuń" onClick={() => useStore.getState().removeOutbuilding(c.id)}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </button>
        </span>
      ))}
      {OUTBUILDINGS.length === 1 ? (
        <button className="ob-add" title={`Dodaj budynek: ${OUTBUILDINGS[0].label} (${f(OUTBUILDINGS[0].def.width)} × ${f(OUTBUILDINGS[0].def.depth)} m)`} onClick={() => add(OUTBUILDINGS[0].kind)}>
          + {OUTBUILDINGS[0].label}
        </button>
      ) : (
        <select className="ob-add" aria-label="Dodaj budynek" value="" onChange={(e) => e.target.value && add(e.target.value)}>
          <option value="">+ Dodaj budynek</option>
          {OUTBUILDINGS.map((k) => (
            <option key={k.kind} value={k.kind}>{k.label} ({f(k.def.width)} × {f(k.def.depth)} m)</option>
          ))}
        </select>
      )}
    </div>
  );
}
