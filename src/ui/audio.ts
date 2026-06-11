/**
 * Synthesized sounds — no assets to load, nothing to cache. The context is
 * created lazily and resumed on the first touch (iOS requires a user gesture).
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  /** Call from a pointerdown handler — unlocks audio on iOS. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(
    freq: number,
    durationS: number,
    type: OscillatorType = 'sine',
    when = 0,
    peak = 1,
  ): void {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + durationS);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + durationS + 0.02);
  }

  place(): void {
    this.tone(220, 0.08, 'triangle', 0, 0.5);
  }

  invalid(): void {
    this.tone(110, 0.12, 'sawtooth', 0, 0.25);
  }

  /** Pitch rises with the streak — the combo "ladder". */
  clear(lines: number, streak: number): void {
    const base = 392 * Math.pow(2, Math.min(streak, 8) / 12); // G4 stepped up per combo
    for (let i = 0; i < Math.min(lines, 4); i++) {
      this.tone(base * (1 + i * 0.25), 0.18, 'triangle', i * 0.05, 0.8);
    }
  }

  perfectClear(): void {
    const notes = [523, 659, 784, 1047]; // C E G C — fanfare
    notes.forEach((f, i) => this.tone(f, 0.3, 'triangle', i * 0.09, 0.9));
  }

  powerUp(): void {
    this.tone(660, 0.12, 'square', 0, 0.3);
    this.tone(880, 0.15, 'square', 0.08, 0.3);
  }

  gameOver(): void {
    const notes = [330, 262, 196];
    notes.forEach((f, i) => this.tone(f, 0.35, 'sine', i * 0.16, 0.7));
  }
}
