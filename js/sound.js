// المؤثرات الصوتية القصيرة (قرار المالك): تُولَّد في المتصفح نفسه، فلا ملفات تُحمَّل ولا حاجة إلى الإنترنت.
// تُعزف في نافذة الجمهور (سماعات التلفاز)، والكتم من نافذة المقدّم.
let ctx = null;
export let muted = false;
export const setMuted = on => { muted = !!on; };

// المتصفح لا يسمح بالصوت قبل أول نقرة في الصفحة، فيُفتح السياق عند أول نقرة أو مفتاح.
const wake = () => {
  try { ctx ??= new AudioContext(); if (ctx.state === 'suspended') ctx.resume(); } catch {}
};
addEventListener('pointerdown', wake);
addEventListener('keydown', wake);

function tone(freq, start, length, { type = 'sine', gain = 0.25, to } = {}) {
  const t = ctx.currentTime + start;
  const osc = ctx.createOscillator(), amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + length);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(gain, t + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.001, t + length);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

const SOUNDS = {
  tick: () => tone(880, 0, 0.12, { type: 'square', gain: 0.12 }),
  right: () => { tone(660, 0, 0.14); tone(990, 0.12, 0.28); },
  wrong: () => tone(220, 0, 0.4, { type: 'sawtooth', gain: 0.15, to: 110 }),
  // دوران العجلة: نقرة قصيرة مع كل خطوة للمؤشر، ونغمتان صاعدتان حين يقف (design/wheel.md 2.4).
  spin: () => tone(1320, 0, 0.035, { type: 'square', gain: 0.07 }),
  stop: () => { tone(523, 0, 0.12, { type: 'triangle' }); tone(784, 0.1, 0.3, { type: 'triangle' }); },
};

export function play(name) {
  if (muted || !SOUNDS[name]) return;
  try {
    wake();
    if (ctx?.state === 'running') SOUNDS[name]();
  } catch {}
}
