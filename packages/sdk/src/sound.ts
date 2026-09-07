/**
 * Notification chime. Defaults to a tiny two-note Web-Audio tone synthesized on
 * the fly — no audio asset ships, keeping the embed bundle lean (a KPI for a
 * partner widget). Web Audio is a Web API, so it plays from inside the Shadow
 * DOM; autoplay is allowed because the user has already gestured (opened the
 * widget / sent a message). A host can point `soundUrl` at a small custom clip.
 */

type AudioContextCtor = typeof AudioContext;

/** Lazily-created, reused context so repeated chimes don't leak contexts. */
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) {
    try {
      audioContext = new Ctor();
    } catch {
      return null;
    }
  }
  return audioContext;
}

/** Play a short pleasant two-note chime via a synthesized Web-Audio envelope. */
function playSynthChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  // A suspended context (tab was backgrounded) needs a resume; ignore failures.
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(ctx.destination);

  // Two ascending notes (E6 → A6) with a soft attack/decay — a gentle "ding".
  const notes = [
    { freq: 1318.5, at: 0 },
    { freq: 1760, at: 0.12 },
  ];
  for (const { freq, at } of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + at;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + 0.3);
  }
  master.gain.setValueAtTime(1, now);
}

/** Play the notification chime — a custom `soundUrl` if given, else the synth tone. */
export function playChime(soundUrl?: string): void {
  if (soundUrl) {
    try {
      const audio = new Audio(soundUrl);
      audio.volume = 0.5;
      void audio.play().catch(() => {});
      return;
    } catch {
      /* fall back to the synth tone */
    }
  }
  playSynthChime();
}
