let audioContext: AudioContext | null = null;

export type FeedbackPrefs = { sound: boolean; haptics: boolean };

function ctx(): AudioContext | null {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') void audioContext.resume();
    return audioContext;
  } catch {
    return null;
  }
}

function tone(freq: number, duration = 0.035, volume = 0.025): void {
  const c = ctx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
  osc.stop(c.currentTime + duration);
}

export function feedback(kind: 'pickup' | 'drop' | 'invalid' | 'draw' | 'success', prefs: FeedbackPrefs): void {
  if (prefs.sound) {
    if (kind === 'pickup') tone(620, 0.025, 0.018);
    if (kind === 'drop') tone(480, 0.035, 0.02);
    if (kind === 'invalid') tone(210, 0.07, 0.025);
    if (kind === 'draw') tone(380, 0.04, 0.02);
    if (kind === 'success') { tone(560, 0.035, 0.02); setTimeout(() => tone(720, 0.04, 0.018), 55); }
  }
  if (prefs.haptics && navigator.vibrate) {
    if (kind === 'pickup') navigator.vibrate(4);
    if (kind === 'drop') navigator.vibrate(7);
    if (kind === 'invalid') navigator.vibrate([12, 30, 12]);
    if (kind === 'draw') navigator.vibrate(5);
    if (kind === 'success') navigator.vibrate(8);
  }
}
