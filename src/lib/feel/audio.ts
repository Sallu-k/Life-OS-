// The low-level audio: one shared AudioContext, a master volume, a small "room" reverb so chimes
// sound warm instead of dry, recorded samples (public/sounds, Kenney CC0) and a synth voice.
// Everything waits for the first tap (browsers only allow sound after the user interacts).

let ctx: BaseAudioContext | null = null;
let master: GainNode | null = null;
let room: GainNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
export const SAMPLES = ["tap", "select", "toggle", "tick", "open", "close", "drop", "glass", "back"] as const;
export type Sample = (typeof SAMPLES)[number];

export function audio(): { ctx: BaseAudioContext; master: GainNode; room: GainNode } | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    build(new Ctor());
    for (const s of SAMPLES) loadSample(s);
  }
  if (ctx instanceof AudioContext && ctx.state === "suspended") void ctx.resume();
  return { ctx: ctx!, master: master!, room: room! };
}

// The signal path: sounds -> master volume -> soft limiter -> speakers, with a reverb send ("room").
function build(c: BaseAudioContext): void {
  ctx = c;
  {
    master = ctx.createGain();
    // A gentle limiter so stacked sounds never clip.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    master.connect(limiter).connect(ctx.destination);
    room = ctx.createGain();
    room.gain.value = 0.22;
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 0.9);
    room.connect(reverb).connect(master);
  }
}

// For tests (?feeltest): plays `run` into an offline buffer and returns it, then restores the speakers.
export async function renderOffline(run: () => void, seconds = 3): Promise<AudioBuffer> {
  audio();
  await Promise.all(SAMPLES.map(loadSample));
  const saved = { ctx, master, room };
  const off = new OfflineAudioContext(2, Math.floor(44100 * seconds), 44100);
  build(off);
  master!.gain.value = 1;
  try {
    run();
    await new Promise((r) => setTimeout(r, 60)); // let sample playback get scheduled
    return await off.startRendering();
  } finally {
    ({ ctx, master, room } = saved);
  }
}

export function setMasterVolume(v: number): void {
  if (master) master.gain.value = Math.max(0, Math.min(1, v));
}

// A short decaying noise burst = a small, soft room.
function impulse(c: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, length, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.2);
  }
  return buf;
}

function loadSample(name: Sample): Promise<AudioBuffer | null> {
  let p = buffers.get(name);
  if (!p) {
    p = fetch(`/sounds/${name}.wav`)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx!.decodeAudioData(b))
      .catch(() => null);
    buffers.set(name, p);
  }
  return p;
}

const vary = (amount: number) => 1 + (Math.random() * 2 - 1) * amount;

// Plays a recorded sample. rate shifts the pitch (1 = as recorded); a little random variation keeps
// repeated taps from sounding like a machine.
export function sample(name: Sample, { gain = 0.5, at = 0, rate = 1 }: { gain?: number; at?: number; rate?: number } = {}): void {
  const a = audio();
  if (!a) return;
  void loadSample(name).then((buffer) => {
    if (!buffer) return;
    const src = a.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate * vary(0.03);
    const g = a.ctx.createGain();
    g.gain.value = gain * vary(0.08);
    src.connect(g).connect(a.master);
    src.start(a.ctx.currentTime + at);
    src.onended = () => g.disconnect();
  });
}

export interface ToneOptions {
  at?: number; // seconds from now
  dur?: number; // seconds until silent
  gain?: number;
  type?: OscillatorType;
  glide?: number; // pitch to slide to (Hz)
  shimmer?: number; // level of a soft octave partial (0..1)
  bell?: boolean; // add an inharmonic partial for a bell-like ring
  wet?: number; // how much goes to the room reverb
}

// One synth note: soft 5 ms attack, exponential decay (no clicks), optional glide and partials.
export function tone(freq: number, o: ToneOptions = {}): void {
  const a = audio();
  if (!a) return;
  const { at = 0, dur = 0.25, gain = 0.15, type = "triangle", glide, shimmer = 0.25, bell = false, wet = 0.35 } = o;
  const t = a.ctx.currentTime + at;
  const f = freq * Math.pow(2, ((Math.random() * 2 - 1) * 8) / 1200); // ±8 cents
  const out = a.ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.linearRampToValueAtTime(gain * vary(0.06), t + 0.005);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  out.connect(a.master);
  if (wet > 0) {
    const send = a.ctx.createGain();
    send.gain.value = wet;
    out.connect(send).connect(a.room);
  }
  const voices: [number, OscillatorType, number][] = [[f, type, 1]];
  if (shimmer > 0) voices.push([f * 2 * Math.pow(2, 6 / 1200), "sine", shimmer]);
  if (bell) voices.push([f * 2.76, "sine", 0.35]);
  for (const [vf, vt, level] of voices) {
    const osc = a.ctx.createOscillator();
    osc.type = vt;
    osc.frequency.setValueAtTime(vf, t);
    if (glide) osc.frequency.exponentialRampToValueAtTime(glide * (vf / f), t + Math.min(0.12, dur * 0.6));
    const g = a.ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    osc.onended = () => g.disconnect();
  }
  setTimeout(() => out.disconnect(), (at + dur + 0.3) * 1000);
}
