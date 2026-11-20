// Sound and vibration settings, kept per device (each device has its own speakers and taste).
export interface FeelSettings {
  sound: boolean;
  volume: number; // 0..1
  vibrate: boolean;
}

const KEY = "lifeos-feel";
const DEFAULTS: FeelSettings = { sound: true, volume: 0.6, vibrate: true };

export function getFeel(): FeelSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<FeelSettings>;
    return { ...DEFAULTS, ...saved };
  } catch {
    return DEFAULTS;
  }
}

export function setFeel(changes: Partial<FeelSettings>): FeelSettings {
  const next = { ...getFeel(), ...changes };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage blocked: the setting lasts until the page closes.
  }
  return next;
}
