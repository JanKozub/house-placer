/** shared "view is changing" flag: set by AdaptiveQuality / bumpMotion, read by PostFX every frame */
export const motion = { active: false };

let timer: ReturnType<typeof setTimeout> | undefined;
let held = false;

/** controls drag start/end (AdaptiveQuality) */
export function holdMotion(on: boolean) {
  held = on;
  if (on) motion.active = true;
}

/**
 * Something is changing continuously (e.g. the time-of-day slider): render cheaply now and once at
 * full quality ~250 ms after the last change.
 */
export function bumpMotion(invalidate: () => void) {
  motion.active = true;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!held) motion.active = false;
    invalidate();
  }, 250);
}
