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

const WAKE_WORD_RE = new RegExp(`^(${WAKE_VARIANTS.join('|')})$`, 'i');

export interface RecognizedWord {
  word: string;
  conf: number;
  start: number;
  end: number;
}

export interface WakeStrictness {
  /** Confiance minimale de Vosk sur le mot (0–1). */
  minConfidence: number;
  /** Durée minimale du mot (s) : « Leanna » a 3 syllabes, un « là » ramené à « léa » est trop court. */
  minDurationSec: number;
  /** Position maximale du nom dans l'énoncé (0 = premier mot) : on interpelle en début de phrase. */
  maxWordIndex: number;
}

// shortcut: valeurs empiriques, à ajuster après essais réels avec la voix de l'utilisateur.
export const DEFAULT_WAKE_STRICTNESS: WakeStrictness = {
  minConfidence: 0.8,
  minDurationSec: 0.3,
  maxWordIndex: 1,
};

/**
 * Décide si un résultat FINAL de Vosk est un vrai appel du nom.
 *
 * La grammaire fermée force tout mot proche vers un voisin de « Leanna » : en
 * conversation, « là », « Léa », « Lina »… sortiraient sinon comme des réveils.
 * On exige donc un mot confiant, assez long, et placé en début d'énoncé.
 */
export function isWakeResult(
  result: { text?: string; result?: RecognizedWord[] } | undefined,
  strictness: WakeStrictness = DEFAULT_WAKE_STRICTNESS,
): boolean {
  if (!result) return false;
  const words = result.result;
  // Sans détail par mot (setWords non supporté) : repli sur le texte, en début d'énoncé.
  if (!words || words.length === 0) {
    const tokens = (result.text ?? '').trim().split(/\s+/).filter(Boolean);
    return tokens.slice(0, strictness.maxWordIndex + 1).some(t => WAKE_WORD_RE.test(t));
  }
  return words.some((w, i) =>
    i <= strictness.maxWordIndex
    && WAKE_WORD_RE.test(w.word)
    && w.conf >= strictness.minConfidence
    && w.end - w.start >= strictness.minDurationSec,
  );
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
export async function startWakeWordListener(
  sampleRate: number,
  onWake: () => void,
  /** Lu à chaque résultat : un changement de réglage s'applique sans redémarrer l'écoute. */
  getStrictness: () => WakeStrictness = () => DEFAULT_WAKE_STRICTNESS,
): Promise<WakeWordListener> {
  const model = await preloadWakeModel();
  const rec = new model.KaldiRecognizer(sampleRate, GRAMMAR);
  // Détail par mot (confiance, début/fin) pour filtrer les faux réveils.
  rec.setWords(true);
  // Uniquement sur résultat FINAL : les partiels sont instables et, avec la
  // grammaire fermée, déclenchaient au milieu de phrases ordinaires. Le préroll
  // de useAudio rejoue la phrase entière à Gemini après le réveil.
  rec.on('result', (m: any) => {
    if (isWakeResult(m.result, getStrictness())) onWake();
  });
  return {
    feed: (frame) => rec.acceptWaveformFloat(frame, sampleRate),
    stop: () => rec.remove(),
  };
}
