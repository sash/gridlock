import type { Mode, PowerUpKind, SerializedGame } from '../core/game';

const PREFIX = 'gridlock.';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // storage full or unavailable — gameplay continues unsaved
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

// --- in-progress game (persisted on every placement, restored on tab kill) ---

export function saveGame(state: SerializedGame): void {
  write(`save.${state.mode}`, state);
}

export function loadGame(mode: Mode): SerializedGame | null {
  return read<SerializedGame>(`save.${mode}`);
}

export function clearSavedGame(mode: Mode): void {
  remove(`save.${mode}`);
}

// --- high scores ---

export function getHighScore(mode: Mode): number {
  return read<number>(`high.${mode}`) ?? 0;
}

export function setHighScore(mode: Mode, score: number): void {
  if (score > getHighScore(mode)) write(`high.${mode}`, score);
}

// --- power-up inventory (earned: daily login, streak cap, perfect clears) ---

export type Inventory = Record<PowerUpKind, number>;

const DEFAULT_INVENTORY: Inventory = { rotate: 1, swap: 1, hammer: 1, undo: 1 };

export function getInventory(): Inventory {
  return { ...DEFAULT_INVENTORY, ...(read<Partial<Inventory>>('inv') ?? {}) };
}

export function setInventory(inv: Inventory): void {
  write('inv', inv);
}

/** +1 of each on the first launch of a calendar day (the daily-login earn). */
export function applyDailyLoginGrant(todayKey: string): boolean {
  if (read<string>('lastLogin') === todayKey) return false;
  write('lastLogin', todayKey);
  const inv = getInventory();
  for (const k of Object.keys(inv) as PowerUpKind[]) inv[k] += 1;
  setInventory(inv);
  return true;
}

// --- daily puzzle attempt lock ---

export function getDailyResult(key: string): { score: number; card: string } | null {
  return read(`daily.${key}`);
}

export function setDailyResult(key: string, score: number, card: string): void {
  write(`daily.${key}`, { score, card });
}

// --- add-to-home-screen hint (iOS browser only) ---

export function isInstallHintDismissed(): boolean {
  return read<boolean>('installHintDismissed') ?? false;
}

export function dismissInstallHint(): void {
  write('installHintDismissed', true);
}

