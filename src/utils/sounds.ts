// Звуковые эффекты через Web Audio API
const audioContext = typeof window !== 'undefined' ? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)() : null;

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  if (!audioContext) return;
  if (audioContext.state === 'suspended') audioContext.resume();

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

  gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + duration);
}

export function playStartSound() {
  // Приятная восходящая мелодия
  playTone(523, 0.15, 'sine', 0.12); // C5
  setTimeout(() => playTone(659, 0.15, 'sine', 0.12), 100); // E5
  setTimeout(() => playTone(784, 0.25, 'sine', 0.12), 200); // G5
}

export function playStopSound() {
  // Нисходящая мелодия
  playTone(784, 0.15, 'sine', 0.12); // G5
  setTimeout(() => playTone(659, 0.15, 'sine', 0.12), 100); // E5
  setTimeout(() => playTone(523, 0.25, 'sine', 0.12), 200); // C5
}

export function playTimerEndSound() {
  // Тревожный двойной бип
  playTone(880, 0.2, 'square', 0.1); // A5
  setTimeout(() => playTone(880, 0.2, 'square', 0.1), 300);
  setTimeout(() => playTone(1046, 0.3, 'square', 0.1), 600);
}

export function playOrderSound() {
  // Короткий звук подтверждения
  playTone(800, 0.1, 'sine', 0.08);
  setTimeout(() => playTone(1000, 0.15, 'sine', 0.08), 80);
}
