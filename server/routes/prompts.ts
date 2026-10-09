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
import { generateText } from '../utils/textGeneration.js';

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

  // POST /api/prompts/:name/optimize — améliore/optimise le prompt via IA.
  //   body: { content: string, goal?: 'clarity'|'concise'|'robust'|'tokens', instructions?: string }
  //   Ne sauvegarde RIEN : renvoie la proposition optimisée pour relecture.
  router.post('/:name/optimize', async (req: Request, res: Response) => {
    const name = req.params.name;
    if (!isValidMarkdownName(name)) {
      return res.status(400).json({ status: 'error', error: 'Nom de fichier invalide. Seuls les .md sont autorisés.' });
    }

    const { content, goal, instructions } = req.body as {
      content?: string;
      goal?: string;
      instructions?: string;
    };

    // Contenu : fourni par l'appelant (buffer d'édition en cours), sinon on lit le fichier effectif.
    let source = typeof content === 'string' ? content : '';
    if (!source) {
      const p = effectivePathFor(name);
      if (p && fs.existsSync(p)) source = fs.readFileSync(p, 'utf-8');
    }
    if (!source.trim()) {
      return res.status(400).json({ status: 'error', error: 'Aucun contenu à optimiser.' });
    }

    // Objectif d'optimisation → consigne ciblée injectée dans le méta-prompt.
    const GOALS: Record<string, string> = {
      clarity: 'Priorité : clarté et absence d\'ambiguïté. Reformule les tournures vagues, structure les consignes, lève les contradictions.',
      concise: 'Priorité : concision. Supprime les redondances et le remplissage sans perdre d\'exigence. Vise un prompt plus court mais complet.',
      robust: 'Priorité : robustesse et sécurité. Renforce les garde-fous, ferme les failles d\'interprétation, explicite les cas limites et les refus attendus.',
      tokens: 'Priorité : réduction du nombre de tokens. Compacte la formulation (listes, phrases courtes) tout en conservant 100% des règles et de la sémantique.',
    };
    const goalDirective = GOALS[goal ?? ''] ?? 'Priorité : amélioration générale (clarté, structure, concision, robustesse) sans changer l\'intention.';

    const extra = typeof instructions === 'string' && instructions.trim()
      ? `\n\nConsignes supplémentaires de l'utilisateur (à respecter) :\n${instructions.trim()}`
      : '';

    const systemPrompt = [
      'Tu es un ingénieur expert en prompt engineering. On te confie un fichier Markdown qui fait partie du PROMPT SYSTÈME d\'un assistant IA de développement.',
      'Ta mission : réécrire ce fichier pour l\'améliorer, SANS en changer l\'intention ni les règles de fond.',
      '',
      'CONTRAINTES STRICTES :',
      '- Conserve EXACTEMENT le front-matter de tête s\'il existe (ligne de commentaire HTML du type `<!-- scope: ..., priority: ... -->`) : ne le modifie pas, garde-le en première ligne.',
      '- Conserve toute balise structurelle significative (ex: <instructions>, <policy>, sections nommées) et les placeholders de variables comme {{aiName}}, {{userName}}, {{userRole}}.',
      '- Ne supprime AUCUNE règle, garde-fou, ni contrainte de sécurité. Tu peux les reformuler plus clairement, pas les affaiblir.',
      '- Reste en Markdown valide. Garde la même langue que l\'original (français si l\'original est en français).',
      '- N\'invente pas de nouvelles capacités, d\'outils ni de politiques qui n\'étaient pas présents ou implicites.',
      '',
      goalDirective,
      '',
      'FORMAT DE SORTIE : renvoie UNIQUEMENT le contenu Markdown final du fichier, sans explication, sans phrase d\'introduction, et SANS l\'entourer de barrières de code (pas de ```).',
    ].join('\n');

    const prompt = `Fichier : ${name}\n\n--- CONTENU ACTUEL ---\n${source}\n--- FIN DU CONTENU ---${extra}`;

    try {
      const result = await generateText({
        systemPrompt,
        prompt,
        temperature: 0.3,
        maxTokens: 8192,
      });

      // Nettoyage défensif : retire d'éventuelles barrières de code que le modèle aurait ajoutées.
      let optimized = (result.text ?? '').trim();
      const fence = optimized.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
      if (fence) optimized = fence[1].trim();

      if (!optimized) {
        return res.status(502).json({ status: 'error', error: 'Le modèle n\'a renvoyé aucun contenu. Réessaie.' });
      }

      return res.json({
        status: 'success',
        name,
        optimized,
        provider: result.provider,
        model: result.model,
        tokensBefore: countTokens(source),
        tokensAfter: countTokens(optimized),
      });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', error: e?.message || 'Échec de l\'optimisation IA.' });
    }
  });

  // POST /api/prompts/:name/optimize-selection — optimise UNIQUEMENT un extrait
  // sélectionné, en utilisant le document complet comme contexte pour la
  // cohérence. Renvoie seulement le fragment réécrit (à réinsérer à la place
  // de la sélection). Ne sauvegarde rien.
  //   body: { selection: string, context?: string, instructions?: string }
  router.post('/:name/optimize-selection', async (req: Request, res: Response) => {
    const name = req.params.name;
    if (!isValidMarkdownName(name)) {
      return res.status(400).json({ status: 'error', error: 'Nom de fichier invalide. Seuls les .md sont autorisés.' });
    }

    const { selection, context, instructions } = req.body as {
      selection?: string;
      context?: string;
      instructions?: string;
    };

    if (typeof selection !== 'string' || !selection.trim()) {
      return res.status(400).json({ status: 'error', error: 'Aucune sélection à optimiser.' });
    }

    const userDirective = typeof instructions === 'string' && instructions.trim()
      ? `Demande précise de l'utilisateur (prioritaire) :\n${instructions.trim()}`
      : 'Aucune demande précise : améliore clarté, concision et robustesse sans changer le sens.';

    const docContext = typeof context === 'string' && context.trim()
      ? `\n\n--- DOCUMENT COMPLET (CONTEXTE, NE PAS RÉÉCRIRE) ---\n${context.trim()}\n--- FIN DU CONTEXTE ---`
      : '';

    const systemPrompt = [
      'Tu es un ingénieur expert en prompt engineering. On te donne un EXTRAIT d\'un fichier Markdown de prompt système, ainsi que le document complet comme contexte.',
      'Ta mission : réécrire UNIQUEMENT l\'extrait fourni, en respectant la demande de l\'utilisateur.',
      '',
      'CONTRAINTES STRICTES :',
      '- Ne réponds QU\'avec le remplacement de l\'extrait — aucune phrase d\'introduction, aucune explication.',
      '- Ne réécris PAS le document complet : seulement l\'extrait.',
      '- Conserve le sens, les règles de fond et les garde-fous de sécurité ; tu peux les reformuler, pas les affaiblir.',
      '- Préserve les placeholders de variables ({{aiName}}, {{userName}}, {{userRole}}) et toute balise structurelle présente dans l\'extrait.',
      '- Reste en Markdown valide, dans la même langue que l\'extrait.',
      '- Préserve l\'indentation / le niveau de titre de départ pour que le remplacement s\'insère proprement.',
      '- N\'ajoute PAS de barrières de code (pas de ```), sauf si l\'extrait en contenait déjà.',
      '',
      userDirective,
    ].join('\n');

    const prompt = `Fichier : ${name}\n\n--- EXTRAIT À RÉÉCRIRE ---\n${selection}\n--- FIN DE L'EXTRAIT ---${docContext}`;

    try {
      const result = await generateText({
        systemPrompt,
        prompt,
        temperature: 0.3,
        maxTokens: 4096,
      });

      let optimized = (result.text ?? '').replace(/\r\n/g, '\n');
      // Retire d'éventuelles barrières de code ajoutées par le modèle.
      const fence = optimized.trim().match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
      if (fence) optimized = fence[1];

      if (!optimized.trim()) {
        return res.status(502).json({ status: 'error', error: 'Le modèle n\'a renvoyé aucun contenu. Réessaie.' });
      }

      return res.json({
        status: 'success',
        name,
        optimized,
        provider: result.provider,
        model: result.model,
        tokensBefore: countTokens(selection),
        tokensAfter: countTokens(optimized),
      });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', error: e?.message || 'Échec de l\'optimisation IA.' });
    }
  });

  return router;
}

export default createPromptsRouter();
