/**
 * Installed-app mode on iOS can report a layout viewport shorter than the
 * physical screen, leaving a dead strip at the bottom that nothing sized to
 * the viewport reaches. Everything that should span the screen — the Pixi
 * canvas, the HUD, the overlays and the board layout — sizes itself from the
 * measured screen height instead (exposed as the `--gl-screen-h` CSS var).
 */

let measured: number | null = null; // only set in standalone mode

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function measure(): void {
  // screen.width/height stay portrait-oriented on iOS even when rotated —
  // pick the physical dimension that is currently vertical
  const physical =
    window.innerWidth > window.innerHeight
      ? Math.min(screen.width, screen.height)
      : Math.max(screen.width, screen.height);
  measured = Math.max(physical, window.innerHeight);
  document.documentElement.style.setProperty('--gl-screen-h', `${measured}px`);
}

/** Call once before anything measures the viewport. No-op outside standalone mode. */
export function installScreenHeight(): void {
  if (!isStandalone()) return;
  measure();
  window.addEventListener('resize', measure);
  // The document is taller than the (under-reported) layout viewport, so iOS
  // would let a drag scroll it by the difference. Only overlays may scroll.
  document.addEventListener(
    'touchmove',
    (e) => {
      if (!(e.target as Element | null)?.closest?.('.gl-overlay')) e.preventDefault();
    },
    { passive: false },
  );
}

/** The height everything full-screen should use, in CSS pixels. */
export function screenHeight(): number {
  return measured ?? window.innerHeight;
}
