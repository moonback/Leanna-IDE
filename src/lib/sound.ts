// Petit utilitaire pour jouer des sons de notification côté client.
// Utilise Web Audio API pour générer un son directement (pas de fichier binaire nécessaire),
// ou joue un fichier audio existant si un chemin est fourni.

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContext();
  }
  return sharedAudioContext;
}

/**
 * Joue un petit "ding" de notification (deux tons ascendants), généré via Web Audio API.
 * Ne nécessite aucun fichier audio externe.
 */
export function playSessionStartSound(): void {
  playNotes([
    { freq: 660, start: 0, duration: 0.12 },
    { freq: 880, start: 0.1, duration: 0.16 },
  ], 'playSessionStartSound');
}

/** Alerte d'approbation requise : trois bips, plus insistants que le "ding". */
export function playApprovalRequestSound(): void {
  playNotes([
    { freq: 988, start: 0, duration: 0.12 },
    { freq: 784, start: 0.14, duration: 0.12 },
    { freq: 988, start: 0.28, duration: 0.18 },
  ], 'playApprovalRequestSound');
}

function playNotes(notes: { freq: number; start: number; duration: number }[], label: string): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = note.freq;

      const startTime = now + note.start;
      const endTime = startTime + note.duration;

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(endTime + 0.02);
    }
  } catch (err) {
    console.warn(`${label}: unable to play sound`, err);
  }
}

/**
 * Joue un fichier audio (mp3/wav) depuis une URL statique (ex: /sounds/connected.mp3).
 * Utilise HTMLAudioElement, indépendant du contexte Web Audio partagé ci-dessus.
 */
export function playSoundFile(url: string, volume = 1): void {
  try {
    const audio = new Audio(url);
    audio.volume = Math.min(1, Math.max(0, volume));
    audio.play().catch((err) => {
      console.warn(`playSoundFile: unable to play ${url}`, err);
    });
  } catch (err) {
    console.warn(`playSoundFile: unable to play ${url}`, err);
  }
}
