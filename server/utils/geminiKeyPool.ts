import { GoogleGenAI } from "@google/genai";
import fs from "fs";
import path from "path";
import { encrypt, decrypt, isEncrypted } from "./crypto.js";
import { SELF_ROOT } from "./selfRoot.js";

/**
 * GeminiKeyPool — Manages a pool of Gemini API keys with round-robin rotation.
 * When a key hits rate limits (429), it automatically rotates to the next key.
 */

const KEYS_FILE = path.join(process.env.Leanna_CONFIG_PATH || process.env.ELECTRON_APP_PATH || SELF_ROOT, ".gemini-keys.json");

interface KeyEntry {
  key: string;
  label?: string;
  disabled?: boolean;
  lastError?: string;
  lastUsed?: string;
  /**
   * Capacités refusées par l'API pour cette clé (ex: un jeton « AQ. » accepté
   * par Live mais rejeté par embedContent avec ACCESS_TOKEN_TYPE_UNSUPPORTED).
   * En mémoire uniquement : la clé reste utilisable pour le reste.
   */
  unsupported?: Set<GeminiCapability>;
}

/** Familles d'appels pour lesquelles une clé peut être exclue individuellement. */
export type GeminiCapability = "embed";

let keyPool: KeyEntry[] = [];
let currentIndex = 0;

/**
 * Load keys from .gemini-keys.json and/or GEMINI_API_KEY env var.
 */
export async function loadGeminiKeys(): Promise<void> {
  keyPool = [];

  // Load from JSON file if it exists
  try {
    await fs.promises.access(KEYS_FILE);
    const raw = await fs.promises.readFile(KEYS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      keyPool = parsed
        .filter((e: any) => e && typeof e.key === "string" && e.key.trim())
        .map((e: any) => ({
          ...e,
          key: decrypt(e.key.trim()),
        }));
    }
  } catch (e) {
    console.warn("[GeminiKeyPool] Erreur lecture .gemini-keys.json:", e);
  }

  // If no keys from file, fall back to env var
  if (keyPool.length === 0) {
    const envKey = process.env.GEMINI_API_KEY?.trim();
    if (envKey) {
      // La valeur d'env peut être soit en clair (cas courant : saisie manuelle
      // dans .env), soit chiffrée sur disque par l'UI (updateEnvFile → encrypt()).
      // On ne déchiffre QUE si le format est reconnu comme chiffré, sinon on
      // garde la valeur telle quelle. Déchiffrer une clé en clair à l'aveugle
      // dépendait du fallback silencieux de decrypt() et masquait les clés
      // réellement invalides (ex: master key changée).
      const finalKey = isEncrypted(envKey) ? decrypt(envKey) : envKey;
      keyPool.push({ key: finalKey, label: "Default (env)" });
    }
  }

  currentIndex = 0;
  console.log(`[GeminiKeyPool] ${keyPool.length} clé(s) chargée(s).`);
}

/**
 * Save current key pool to .gemini-keys.json
 */
export async function saveGeminiKeys(): Promise<void> {
  // `unsupported` est volontairement non persisté (Set non sérialisable, état de session).
  const toSave = keyPool.map(({ unsupported: _unsupported, ...entry }) => ({
    ...entry,
    key: encrypt(entry.key),
  }));
  await fs.promises.writeFile(KEYS_FILE, JSON.stringify(toSave, null, 2), "utf-8");
}

/**
 * Construit un aperçu masqué d'une clé pour l'UI.
 * Robuste aux clés courtes/vides : `key.length - 6` pouvait être négatif et
 * faire planter `"•".repeat(négatif)` (RangeError) → la route GET renvoyait
 * alors une 500 et le pool ne se chargeait plus du tout.
 */
function buildKeyPreview(key: string): string {
  const safe = key || "";
  const visible = safe.slice(0, 6);
  const maskCount = Math.min(Math.max(safe.length - 6, 0), 20);
  return visible + "•".repeat(maskCount);
}

/**
 * Décrit une clé de façon sûre pour les logs : index (1-based) dans le pool,
 * label, et aperçu masqué — jamais le secret complet. Utile pour tracer quelle
 * clé est utilisée (ex: ouverture d'une session vocale) sans fuite de secret.
 */
export function describeKey(key: string | null | undefined): string {
  if (!key) return "aucune clé";
  const idx = keyPool.findIndex((e) => e.key === key);
  const entry = idx >= 0 ? keyPool[idx] : undefined;
  const label = entry?.label || (idx >= 0 ? `Clé ${idx + 1}` : "Clé inconnue");
  const position = idx >= 0 ? `#${idx + 1}/${keyPool.length}` : "#?";
  return `${position} « ${label} » (${buildKeyPreview(key)})`;
}

/**
 * Get all keys (for settings UI). Masks the actual key values.
 */
export function getGeminiKeys(): Array<{ index: number; label: string; preview: string; disabled: boolean }> {
  return keyPool.map((entry, i) => ({
    index: i,
    label: entry.label || `Clé ${i + 1}`,
    preview: buildKeyPreview(entry.key),
    disabled: !!entry.disabled,
  }));
}

/**
 * Add a new key to the pool.
 */
export async function addGeminiKey(key: string, label?: string): Promise<void> {
  // Avoid duplicates
  if (keyPool.some((e) => e.key === key)) {
    throw new Error("Cette clé existe déjà dans le pool.");
  }
  keyPool.push({ key: key.trim(), label: label || `Clé ${keyPool.length + 1}` });
  await saveGeminiKeys();
  console.log(`[GeminiKeyPool] Clé ajoutée. Total: ${keyPool.length}`);
}

/**
 * Remove a key from the pool by index.
 */
export async function removeGeminiKey(index: number): Promise<void> {
  if (index < 0 || index >= keyPool.length) {
    throw new Error("Index invalide.");
  }
  keyPool.splice(index, 1);
  if (currentIndex >= keyPool.length) currentIndex = 0;
  await saveGeminiKeys();
  console.log(`[GeminiKeyPool] Clé supprimée. Total: ${keyPool.length}`);
}

/**
 * Toggle disable/enable a key.
 */
export async function toggleGeminiKey(index: number): Promise<boolean> {
  if (index < 0 || index >= keyPool.length) {
    throw new Error("Index invalide.");
  }
  keyPool[index].disabled = !keyPool[index].disabled;
  await saveGeminiKeys();
  return !keyPool[index].disabled; // returns new enabled state
}

/**
 * Update label for a key.
 */
export async function updateGeminiKeyLabel(index: number, label: string): Promise<void> {
  if (index < 0 || index >= keyPool.length) {
    throw new Error("Index invalide.");
  }
  keyPool[index].label = label;
  await saveGeminiKeys();
}

/**
 * Get the next available (non-disabled) API key using round-robin.
 * Returns null if no keys are available.
 */
export function getNextGeminiKey(capability?: GeminiCapability): string | null {
  const isUsable = (e: KeyEntry) => !e.disabled && !(capability && e.unsupported?.has(capability));
  const enabledKeys = keyPool.filter(isUsable);
  if (enabledKeys.length === 0) return null;

  // Find next enabled key starting from currentIndex
  for (let i = 0; i < keyPool.length; i++) {
    const idx = (currentIndex + i) % keyPool.length;
    if (isUsable(keyPool[idx])) {
      currentIndex = (idx + 1) % keyPool.length;
      keyPool[idx].lastUsed = new Date().toISOString();
      return keyPool[idx].key;
    }
  }
  return null;
}

/**
 * Mark a key as having errored (for UI display).
 */
function markKeyError(apiKey: string, error: string): void {
  const entry = keyPool.find((e) => e.key === apiKey);
  if (entry) {
    entry.lastError = error;
  }
}

/**
 * Exclut une clé pour une capacité donnée jusqu'au prochain redémarrage.
 */
function markKeyUnsupported(apiKey: string, capability: GeminiCapability): void {
  const entry = keyPool.find((e) => e.key === apiKey);
  if (!entry) return;
  entry.unsupported ??= new Set();
  if (!entry.unsupported.has(capability)) {
    entry.unsupported.add(capability);
    console.warn(`[GeminiKeyPool] Clé ${describeKey(apiKey)} exclue pour « ${capability} » (401 refusé par l'API).`);
  }
}

/** Erreur d'authentification (401 / type de jeton non supporté) : la clé ne servira jamais pour cet appel. */
function isAuthError(error: any, status: unknown): boolean {
  if (status === 401 || status === "UNAUTHENTICATED") return true;
  const text = String(error?.message ?? "");
  return text.includes("ACCESS_TOKEN_TYPE_UNSUPPORTED") || text.includes('"code":401');
}

/**
 * Create a GoogleGenAI instance with the next available key.
 * Returns null if no key is available.
 */
export function createGeminiClient(): GoogleGenAI | null {
  const key = getNextGeminiKey();
  if (!key) return null;
  return new GoogleGenAI({ apiKey: key });
}

/**
 * Execute a Gemini API call with automatic retry on 429 (rate limit).
 * Rotates through available keys before giving up.
 * Avec `options.capability`, une clé refusée en 401 (ex: ACCESS_TOKEN_TYPE_UNSUPPORTED)
 * est exclue pour cette capacité et l'appel est retenté avec la clé suivante.
 */
export async function withGeminiRetry<T>(
  fn: (ai: GoogleGenAI) => Promise<T>,
  maxRetries?: number,
  /** Timeout global en ms (défaut: 120s). Protège contre les appels bloquants. */
  timeoutMs: number = 120_000,
  options: { capability?: GeminiCapability } = {}
): Promise<T> {
  const { capability } = options;
  const enabledCount = keyPool.filter((e) => !e.disabled && !(capability && e.unsupported?.has(capability))).length;
  const retries = maxRetries ?? Math.max(enabledCount, 2);
  let lastError: any = null;

  // (Audit §1) Timeout global pour éviter un blocage indéfini.
  // Le handle est conservé pour être nettoyé une fois la course terminée :
  // sans clearTimeout, ce timer de 120s garde la boucle d'événements vivante
  // (ex: node --test ne rend jamais la main après la fin des tests).
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`withGeminiRetry timeout après ${timeoutMs}ms`)), timeoutMs);
  });

  const execute = async (): Promise<T> => {
    for (let attempt = 0; attempt < retries; attempt++) {
      const key = getNextGeminiKey(capability);
      if (!key) {
        if (lastError) throw lastError;
        throw new Error("Aucune clé Gemini API disponible. Ajoutez des clés dans les paramètres.");
      }

      const ai = new GoogleGenAI({ apiKey: key });

      try {
        const result = await fn(ai);
        return result;
      } catch (error: any) {
        const status = error?.status || error?.httpStatus || error?.code;

        // BUGFIX : lastError n'était jamais assigné auparavant, donc l'erreur
        // finale (ligne throw ci-dessous) masquait systématiquement la vraie
        // cause avec un message générique, y compris pour un échec non lié au
        // rate limiting survenant à la dernière tentative.
        lastError = error;

        // For rate limiting (429) or overloaded/unavailable (503), rotate key
        if (status === 429 || status === 503) {
          console.warn(
            `[GeminiKeyPool] Erreur de clé (${status}), rotation vers la suivante... (tentative ${attempt + 1}/${retries})`
          );
          markKeyError(key, `${status} - ${status === 429 ? 'Rate limited' : 'Overloaded'} (${new Date().toLocaleTimeString()})`);
          // Small delay before retry
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }

        // Clé refusée pour cette capacité : on l'exclut et on passe à la suivante sans délai.
        if (capability && isAuthError(error, status)) {
          markKeyError(key, `401 - Refusée pour ${capability} (${new Date().toLocaleTimeString()})`);
          markKeyUnsupported(key, capability);
          continue;
        }

        // For non-429 errors, don't retry
        throw error;
      }
    }

    throw lastError || new Error("Toutes les clés API ont été rate-limited. Réessayez plus tard.");
  };

  try {
    return await Promise.race([execute(), timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

// NOTE: loadGeminiKeys() is called explicitly from server.ts at startup.
// Do NOT call it here — importing this module must not trigger a side-effect.