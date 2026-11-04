/**
 * Lightweight map labels: plain DOM elements over the canvas, positioned every frame by projecting
 * their world points. Replaces drei <Html>, which creates a React root per label and throws on
 * canvas teardown with React 19.
 */
import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

interface LabelData { pos: [number, number, number]; className: string; children: React.ReactNode }

export class LabelRegistry {
  map = new Map<string, LabelData>();
  els = new Map<string, HTMLDivElement>();
  private listeners = new Set<() => void>();
  private version = 0;
  private pending = false;
  set(id: string, d: LabelData) { this.map.set(id, d); this.emit(); }
  del(id: string) { this.map.delete(id); this.els.delete(id); this.emit(); }
  private emit() {
    // batch: at most one overlay re-render per frame
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => { this.pending = false; this.version++; this.listeners.forEach((l) => l()); });
  }
  subscribe = (l: () => void) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getVersion = () => this.version;
}

export const LabelContext = createContext<LabelRegistry | null>(null);

/** a label anchored at a world position (render inside <Canvas>) */
export function WorldLabel({ pos, className = 'map-label', children }: { pos: [number, number, number]; className?: string; children: React.ReactNode }) {
  const reg = useContext(LabelContext);
  const id = useId();
  useLayoutEffect(() => {
    reg?.set(id, { pos, className, children });
  });
  useEffect(() => () => reg?.del(id), [reg, id]);
  return null;
}

/** projects all labels each frame (render inside <Canvas>) */
export function LabelProjector() {
  const reg = useContext(LabelContext);
  const v = useRef(new THREE.Vector3());
  const invalidate = useThree((s) => s.invalidate);
  // new/changed labels need a frame to be positioned (frameloop is on-demand)
  useEffect(() => (reg ? reg.subscribe(() => invalidate()) : undefined), [reg, invalidate]);
  useFrame(({ camera, size }) => {
    if (!reg) return;
    for (const [id, d] of reg.map) {
      const el = reg.els.get(id);
      if (!el) continue;
      v.current.set(...d.pos).project(camera);
      const off = v.current.z > 1 || Math.abs(v.current.x) > 1.2 || Math.abs(v.current.y) > 1.2;
      el.style.visibility = off ? 'hidden' : 'visible';
      if (!off) el.style.transform = `translate(${((v.current.x + 1) / 2) * size.width}px, ${((1 - v.current.y) / 2) * size.height}px) translate(-50%, -50%)`;
    }
  });
  return null;
}

/** the DOM layer (render outside <Canvas>, inside a positioned container) */
export function LabelOverlay({ reg }: { reg: LabelRegistry }) {
  useSyncExternalStore(reg.subscribe, reg.getVersion);
  return (
    <div className="label-layer">
      {[...reg.map].map(([id, d]) => (
        <div
          key={id}
          ref={(el) => { if (el) reg.els.set(id, el); }}
          className="label-anchor"
          style={{ visibility: 'hidden' }}
        >
          <div className={d.className}>{d.children}</div>
        </div>
      ))}
    </div>
  );
}
