/**
 * Routeur pour la lecture et l'édition des templates de prompts système (.md).
 *
 * Les fichiers vivent dans `server/runtime/prompts/*.md` et composent le prompt
 * système de l'assistant (base, autonomy, safety, security, etc.).
 *
 * Lecture seule vs modifiable :
 *  - En app packagée (Electron), les prompts bundlés sont dans `app.asar`
 *    (lecture seule). On ne peut donc PAS y écrire.
 *  - Les modifications sont donc persistées dans un dossier d'overrides
 *    modifiable sous userData : `<configBase>/.Leanna/prompts/*.md`.
 *  - La lecture privilégie l'override s'il existe, sinon le fichier bundlé.
 *    (Résolution centralisée dans `runtime/prompts/promptOverrides.ts`.)
 *
 * Sécurité :
 *  - Seuls les fichiers `.md` sont acceptés ; tout nom avec composante de
 *    chemin (`/`, `\\`, `..`) est rejeté (anti-traversée).
 *  - L'écriture ne cible que des fichiers déjà connus (présents en bundle ou
 *    déjà overridés) : pas de création de nom arbitraire via l'API.
 */

import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import {
  isValidMarkdownName,
  listPromptNames,
  effectivePathFor,
  basePathFor,
  overridePathFor,
  isOverridden,
  writeOverride,
  removeOverride,
  resolveBasePromptsDir,
  resolveOverridesDir,
} from '../runtime/prompts/promptOverrides.js';
import { estimateTokens } from '../utils/tokenOptimizer.js';

interface PromptFileMeta {
  name: string;
  size: number;
  modified: string;
  /** Estimation du nombre de tokens du contenu (tiktoken avec repli heuristique). */
  tokens: number;
  /** Nombre de lignes du contenu. */
  lines: number;
  /** true si le fichier a été personnalisé (override présent). */
  overridden: boolean;
}

/** Compte les tokens d'un texte via l'estimateur serveur (tiktoken). */
function countTokens(text: string): number {
  try {
    return estimateTokens(text);
  } catch {
    // Repli heuristique si tiktoken indisponible : ~4 caractères par token.
    return Math.ceil((text?.length ?? 0) / 4);
  }
}

/** Métadonnées (taille / date / tokens / lignes) du chemin effectif d'un fichier. */
function metaFor(name: string): PromptFileMeta | null {
  const p = effectivePathFor(name);
  if (!p) return null;
  try {
    const stat = fs.statSync(p);
    const content = fs.readFileSync(p, 'utf-8');
    return {
      name,
      size: stat.size,
      modified: stat.mtime.toISOString(),
      tokens: countTokens(content),
      lines: content ? content.split('\n').length : 0,
      overridden: isOverridden(name),
    };
  } catch {
    return null;
  }
}

export function createPromptsRouter(): Router {
  const router = Router();

  // GET /api/prompts — liste des fichiers .md disponibles (métadonnées)
  router.get('/', (_req: Request, res: Response) => {
    try {
      const files = listPromptNames()
        .map(metaFor)
        .filter((m): m is PromptFileMeta => m !== null);
      const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);
      res.json({
        status: 'success',
        baseDir: resolveBasePromptsDir(),
        overridesDir: resolveOverridesDir(),
        totalTokens,
        files,
      });
    } catch (e: any) {
      res.status(500).json({ status: 'error', error: e.message });
    }
  });

  // GET /api/prompts/:name — contenu effectif (override si présent, sinon bundle)
  //   query ?base=1 → force la lecture du fichier bundlé (version par défaut)
  router.get('/:name', (req: Request, res: Response) => {
    const name = req.params.name;
    if (!isValidMarkdownName(name)) {
      return res.status(400).json({ status: 'error', error: 'Nom de fichier invalide. Seuls les .md sont autorisés.' });
    }
    try {
      const forceBase = req.query.base === '1' || req.query.base === 'true';
      const p = forceBase ? basePathFor(name) : effectivePathFor(name);
      if (!p || !fs.existsSync(p)) {
        return res.status(404).json({ status: 'error', error: 'Fichier introuvable.' });
      }
      const content = fs.readFileSync(p, 'utf-8');
      const stat = fs.statSync(p);
      return res.json({
        status: 'success',
        name,
        content,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        tokens: countTokens(content),
        lines: content ? content.split('\n').length : 0,
        overridden: isOverridden(name),
      });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', error: e.message });
    }
  });

  // PUT /api/prompts/:name — écrit le contenu dans l'override modifiable
  //   body: { content: string }
  router.put('/:name', (req: Request, res: Response) => {
    const name = req.params.name;
    if (!isValidMarkdownName(name)) {
      return res.status(400).json({ status: 'error', error: 'Nom de fichier invalide. Seuls les .md sont autorisés.' });
    }

    const { content } = req.body as { content?: string };
    if (typeof content !== 'string') {
      return res.status(400).json({ status: 'error', error: 'Le champ `content` (chaîne) est requis.' });
    }

    // Bornage : on n'autorise l'écriture que pour un fichier connu (bundlé ou
    // déjà overridé), jamais pour un nom arbitraire.
    const known = fs.existsSync(basePathFor(name)) || isOverridden(name);
    if (!known) {
      return res.status(404).json({ status: 'error', error: 'Fichier inconnu. Création de nouveaux prompts non autorisée via cette API.' });
    }

    try {
      writeOverride(name, content);
      const stat = fs.statSync(overridePathFor(name));
      return res.json({
        status: 'success',
        name,
        size: stat.size,
        modified: stat.mtime.toISOString(),
        tokens: countTokens(content),
        lines: content ? content.split('\n').length : 0,
        overridden: true,
        note: 'Modification enregistrée. Elle s\'appliquera au prochain démarrage de session.',
      });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', error: e.message });
    }
  });

  // DELETE /api/prompts/:name — supprime l'override (retour à la version bundlée)
  router.delete('/:name', (req: Request, res: Response) => {
    const name = req.params.name;
    if (!isValidMarkdownName(name)) {
      return res.status(400).json({ status: 'error', error: 'Nom de fichier invalide.' });
    }
    try {
      if (!isOverridden(name)) {
        return res.status(404).json({ status: 'error', error: 'Aucune personnalisation à réinitialiser pour ce fichier.' });
      }
      removeOverride(name);
      const m = metaFor(name);
      return res.json({ status: 'success', name, overridden: false, meta: m });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', error: e.message });
    }
  });

  return router;
}

export default createPromptsRouter();
