let context: AudioContext | null = null;

/** À appeler dans le geste « C’est fait » : iOS ne joue un son plus tard que s’il a été réveillé par le doigt. */
export function unlockChime() {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  if (!context) context = new Ctx();
  void context.resume().catch(() => undefined);
}

export function playChime() {
  if (!context || context.state !== "running") return;
  try {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = 740;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    const second = context.createOscillator();
    const secondGain = context.createGain();
    second.frequency.value = 880;
    secondGain.gain.value = 0.03;
    second.connect(secondGain);
    secondGain.connect(context.destination);
    second.start(context.currentTime + 0.16);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
    secondGain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
    osc.stop(context.currentTime + 0.3);
    second.stop(context.currentTime + 0.46);
  } catch {
    /* son indisponible */
  }
}
