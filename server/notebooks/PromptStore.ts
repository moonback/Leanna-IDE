/**
 * PromptStore — registre + surcharges éditables des prompts système des notebooks.
 *
 * Objectif : permettre à l'utilisateur de modifier, depuis les Settings, TOUS
 * les prompts système utilisés par les notebooks (chat groundé, génération de
 * documents, RAG, assistant vocal) sans toucher au code.
 *
 * Principe (sans duplication des textes par défaut) :
 *   - Chaque site d'appel ENREGISTRE son prompt au chargement du module via
 *     `promptStore.register({ id, label, category, placeholders, default })`.
 *     Le texte par défaut vit donc à côté de son usage (source de vérité unique).
 *   - À l'exécution, le code appelle `promptStore.render(id, vars)` qui :
 *       1. prend l'override éditable s'il existe, sinon le défaut enregistré ;
 *       2. interpole les placeholders `{{var}}` avec `vars`.
 *   - Les overrides sont persistés en JSON atomique dans un fichier unique,
 *     sous le dossier de config persistant (survit à l'empaquetage Electron),
 *     aligné sur le dossier des overrides .md (`<configBase>/.Leanna/prompts`).
 *
 * Les placeholders utilisent la syntaxe `{{nom}}` (et non `${}`) pour que le
 * texte éditable soit du texte brut sûr, jamais évalué comme du code.
 */

import * as fs from "fs";
import * as path from "path";
import { writeJsonAtomic, readJson } from "../core/paths.js";

export type NotebookPromptCategory = "chat" | "generation" | "report" | "rag" | "voice";

export interface NotebookPromptPlaceholder {
  /** Nom du placeholder, utilisé comme `{{name}}` dans le template. */
  name: string;
  /** Description courte de ce que le placeholder contient (affichée dans l'UI). */
  description: string;
}

export interface NotebookPromptDefinition {
  id: string;
  label: string;
  description: string;
  category: NotebookPromptCategory;
  /** Texte par défaut (source de vérité, enregistré par le code). */
  default: string;
  /** Placeholders dynamiques disponibles dans ce template. */
  placeholders: NotebookPromptPlaceholder[];
}

/** Vue exposée par l'API (défaut + override + texte effectif). */
export interface NotebookPromptView {
  id: string;
  label: string;
  description: string;
  category: NotebookPromptCategory;
  placeholders: NotebookPromptPlaceholder[];
  default: string;
  /** Texte effectif (override s'il existe, sinon défaut). */
  content: string;
  /** Vrai si un override éditable est en vigueur. */
  overridden: boolean;
}

type OverridesFile = { version: 1; overrides: Record<string, string> };

/** Racine de config persistante (userData en prod Electron, cwd en dev). */
function getConfigBase(): string {
  return (
    process.env.Leanna_CONFIG_PATH ||
    process.env.ELECTRON_APP_PATH ||
    process.cwd()
  );
}

/** Chemin du fichier d'overrides des prompts notebook. */
function overridesFilePath(): string {
  return path.join(getConfigBase(), ".Leanna", "prompts", "notebook-prompts.json");
}

class NotebookPromptStore {
  /** Définitions enregistrées par les modules (id → définition). */
  private registry = new Map<string, NotebookPromptDefinition>();
  /** Overrides éditables persistés (id → texte). */
  private overrides: Record<string, string> = {};
  private loaded = false;

  // ── Chargement paresseux des overrides depuis le disque ──────────────────
  private ensureLoaded(): void {
    if (this.loaded) return;
    const data = readJson<OverridesFile>(overridesFilePath(), { version: 1, overrides: {} });
    this.overrides = data && typeof data === "object" && data.overrides ? data.overrides : {};
    this.loaded = true;
  }

  private persist(): void {
    writeJsonAtomic(overridesFilePath(), { version: 1, overrides: this.overrides } satisfies OverridesFile);
  }

  /**
   * Enregistre (ou met à jour) la définition d'un prompt. Idempotent : appelé au
   * chargement de chaque module. Le dernier défaut enregistré fait foi.
   */
  register(def: NotebookPromptDefinition): void {
    this.registry.set(def.id, def);
  }

  /** Texte EFFECTIF (override ou défaut) d'un prompt, sans interpolation. */
  getRaw(id: string): string {
    this.ensureLoaded();
    const override = this.overrides[id];
    if (typeof override === "string" && override.trim().length > 0) return override;
    const def = this.registry.get(id);
    return def ? def.default : "";
  }

  /**
   * Rend un prompt : texte effectif + interpolation des placeholders `{{var}}`.
   * Les placeholders absents de `vars` sont remplacés par une chaîne vide pour
   * éviter de laisser des `{{...}}` littéraux dans le prompt final.
   */
  render(id: string, vars: Record<string, string | number | undefined> = {}): string {
    const template = this.getRaw(id);
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
      const v = vars[key];
      return v === undefined || v === null ? "" : String(v);
    });
  }

  // ── API d'édition (pour les routes HTTP) ─────────────────────────────────

  /** Liste toutes les définitions connues avec leur état d'override. */
  list(): NotebookPromptView[] {
    this.ensureLoaded();
    return [...this.registry.values()]
      .map(def => this.toView(def))
      .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
  }

  /** Vue d'un prompt précis, ou null s'il est inconnu. */
  get(id: string): NotebookPromptView | null {
    this.ensureLoaded();
    const def = this.registry.get(id);
    return def ? this.toView(def) : null;
  }

  private toView(def: NotebookPromptDefinition): NotebookPromptView {
    const override = this.overrides[def.id];
    const overridden = typeof override === "string" && override.trim().length > 0;
    return {
      id: def.id,
      label: def.label,
      description: def.description,
      category: def.category,
      placeholders: def.placeholders,
      default: def.default,
      content: overridden ? override : def.default,
      overridden,
    };
  }

  /** Définit l'override d'un prompt connu. Retourne false si l'id est inconnu. */
  set(id: string, content: string): boolean {
    this.ensureLoaded();
    if (!this.registry.has(id)) return false;
    const trimmed = typeof content === "string" ? content : "";
    // Un override vide (ou égal au défaut) = suppression de l'override.
    const def = this.registry.get(id)!;
    if (trimmed.trim().length === 0 || trimmed === def.default) {
      delete this.overrides[id];
    } else {
      this.overrides[id] = trimmed;
    }
    this.persist();
    return true;
  }

  /** Réinitialise un prompt (supprime son override). */
  reset(id: string): boolean {
    this.ensureLoaded();
    if (!this.registry.has(id)) return false;
    if (this.overrides[id] !== undefined) {
      delete this.overrides[id];
      this.persist();
    }
    return true;
  }

  /** Réinitialise TOUS les prompts (vide les overrides). */
  resetAll(): void {
    this.ensureLoaded();
    this.overrides = {};
    this.persist();
  }
}

export const notebookPromptStore = new NotebookPromptStore();

// Also check the file exists cheaply (helps during cold start on read-only FS).
try {
  const dir = path.dirname(overridesFilePath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
} catch {
  /* best-effort */
}
