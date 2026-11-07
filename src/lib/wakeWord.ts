// Détection hors ligne du mot de réveil « Leanna » (Vosk WASM, grammaire restreinte).
// Le modèle français est servi en local : public/models/vosk-model-small-fr.tar.gz
// (source : https://alphacephei.com/vosk/models → vosk-model-small-fr-0.22.zip,
// reconditionné en .tar.gz — format exigé par vosk-browser).
import type { Model } from 'vosk-browser';

// Chemin absolu : la page peut être sur une route profonde (/ide/…).
export const WAKE_MODEL_URL = '/models/vosk-model-small-fr.tar.gz';

// « leanna » est absent du vocabulaire de vosk-model-small-fr-0.22 (vérifié dans Gr.fst) :
// la grammaire ne contient que des voisins phonétiques présents, Vosk choisit le plus proche.
// shortcut: liste empirique, à ajuster après essais réels avec la voix de l'utilisateur.
const GRAMMAR_WORDS = ['léna', 'lena', 'lina', 'liana', 'liane', 'léa'];
const WAKE_VARIANTS = ['leanna', ...GRAMMAR_WORDS];
const GRAMMAR = JSON.stringify([...GRAMMAR_WORDS, '[unk]']);
const WAKE_RE = new RegExp(`(^|\\s)(${WAKE_VARIANTS.join('|')})(\\s|$)`, 'i');

export function containsWakeWord(text: string): boolean {
  return WAKE_RE.test(text.trim());
}

// Modèle chargé une seule fois (~40 Mo) puis gardé : chaque veille ne crée qu'un recognizer.
let modelPromise: Promise<Model> | null = null;
export function preloadWakeModel(): Promise<Model> {
  if (!modelPromise) {
    modelPromise = import('vosk-browser')
      .then(({ createModel }) => createModel(new URL(WAKE_MODEL_URL, window.location.origin).href, -1)); // -1 : warnings Kaldi seulement, pas les LOG de chargement
    modelPromise.catch(() => { modelPromise = null; }); // réessai possible au prochain endormissement
  }
  return modelPromise;
}

export interface WakeWordListener {
  feed(frame: Float32Array): void;
  stop(): void;
}

/** Démarre l'écoute et appelle onWake dès que le nom est entendu. */
export async function startWakeWordListener(sampleRate: number, onWake: () => void): Promise<WakeWordListener> {
  const model = await preloadWakeModel();
  const rec = new model.KaldiRecognizer(sampleRate, GRAMMAR);
  const check = (text: string | undefined) => {
    if (text && containsWakeWord(text)) onWake();
  };
  // Le résultat partiel réveille sans attendre la fin de la phrase.
  rec.on('partialresult', (m: any) => check(m.result?.partial));
  rec.on('result', (m: any) => check(m.result?.text));
  return {
    feed: (frame) => rec.acceptWaveformFloat(frame, sampleRate),
    stop: () => rec.remove(),
  };
}
