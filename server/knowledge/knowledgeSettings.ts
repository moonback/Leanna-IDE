/**
 * knowledgeSettings — Préférences du Knowledge System, par projet.
 *
 * Stocke des réglages pilotables depuis l'UI Settings, PROPRES À CHAQUE PROJET :
 * persistés dans `<SELF_ROOT>/.Leanna/knowledge-settings.json`. Chaque workspace
 * a donc son propre choix, et changer de projet recharge le réglage du nouveau.
 *
 * Réglage actuel :
 *   • documentExtractionEnabled — active/désactive l'extraction automatique des
 *     documents du workspace (WorkspaceIndexer → DocumentStore). Désactivé, le
 *     Knowledge System continue d'indexer le code ; seule l'indexation
 *     documentaire (fichiers .md/.txt/.pdf/… → documents.json) est suspendue.
 *
 * Note : le cache est indexé par racine et se ré-aligne automatiquement quand
 * SELF_ROOT change à chaud (sélection d'un autre workspace), sans redémarrage.
 */

import fs from "fs";
import path from "path";
import { SELF_ROOT, stateBaseDir } from "../utils/selfRoot.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("KnowledgeSettings");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KnowledgeSettings {
  /** Extraction automatique des documents du workspace (défaut: false). */
  documentExtractionEnabled: boolean;
}

const DEFAULT_SETTINGS: KnowledgeSettings = {
  documentExtractionEnabled: false,
};

// ─── Persistance (par projet) ─────────────────────────────────────────────────

/**
 * Chemin du fichier de réglages du projet actif.
 * Retourne null si aucun projet n'est sélectionné (SELF_ROOT vide).
 */
function getSettingsPath(): string | null {
  if (!SELF_ROOT) return null;
  return path.join(stateBaseDir(), ".Leanna", "knowledge-settings.json");
}

/** Cache des réglages indexé par racine projet, pour éviter les relectures disque. */
const cacheByRoot = new Map<string, KnowledgeSettings>();

/**
 * Charge les réglages du projet actif. Sans projet actif, renvoie les valeurs
 * par défaut sans rien lire ni mettre en cache (il n'y a aucune racine à cibler).
 */
function load(): KnowledgeSettings {
  const root = SELF_ROOT;
  if (!root) return { ...DEFAULT_SETTINGS };

  const cached = cacheByRoot.get(root);
  if (cached) return cached;

  let settings: KnowledgeSettings = { ...DEFAULT_SETTINGS };
  try {
    const p = getSettingsPath();
    if (p && fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf-8");
      const parsed = JSON.parse(raw);
      settings = { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e: any) {
    log.warn(`⚠️ Échec lecture knowledge-settings.json: ${e?.message ?? e} — valeurs par défaut`);
    settings = { ...DEFAULT_SETTINGS };
  }

  cacheByRoot.set(root, settings);
  return settings;
}

function persist(settings: KnowledgeSettings): void {
  const p = getSettingsPath();
  if (!p) {
    log.warn("⚠️ Aucun projet actif — réglage non persisté (SELF_ROOT vide).");
    return;
  }
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(settings, null, 2), "utf-8");
  } catch (e: any) {
    log.error(`❌ Échec écriture knowledge-settings.json: ${e?.message ?? e}`);
  }
}

// ─── API publique ───────────────────────────────────────────────────────────

/** Retourne une copie des réglages du projet actif. */
export function getKnowledgeSettings(): KnowledgeSettings {
  return { ...load() };
}

/** Indique si l'extraction documentaire automatique est activée (projet actif). */
export function isDocumentExtractionEnabled(): boolean {
  return load().documentExtractionEnabled;
}

/**
 * Met à jour l'activation de l'extraction documentaire pour le projet actif
 * et persiste. Retourne la nouvelle valeur effective. Sans projet actif, le
 * réglage n'est pas persisté et la valeur demandée est renvoyée telle quelle.
 */
export function setDocumentExtractionEnabled(enabled: boolean): boolean {
  const current = load();
  const next: KnowledgeSettings = { ...current, documentExtractionEnabled: enabled };
  if (SELF_ROOT) {
    cacheByRoot.set(SELF_ROOT, next);
  }
  persist(next);
  log.info(`📄 Extraction documentaire ${enabled ? "activée" : "désactivée"} (projet: ${SELF_ROOT || "aucun"}).`);
  return next.documentExtractionEnabled;
}
