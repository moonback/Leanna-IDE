import { Skill } from "./base";
import fs from "fs";
import { generateText, getActiveProvider } from "../utils/textGeneration";
import { generateSpeech } from "../utils/geminiTTS";
import { SELF_ROOT, normalizeSelfPath } from "../utils/selfRoot";
import { ChainOfThoughtExecutor, assessComplexity, type ComplexityLevel } from "./chainOfThought";

// ─── Configuration ──────────────────────────────────────────────────────────

// Anti-doublon pour l'annonce vocale TTS (évite les répétitions si reasoning_think est appelé en boucle)
let _lastTTSAnnouncementTime = 0;
const TTS_ANNOUNCEMENT_COOLDOWN_MS = 30_000; // 30s minimum entre deux annonces

function getProjectRoot(): string {
  return SELF_ROOT;
}

function normalizeProjectPath(target: string): string | null {
  return normalizeSelfPath(target);
}

function parseReasoningListCommand(command: unknown): string | null {
  if (typeof command !== "string") return null;
  const match = /^(?:dir|ls)(?:\s+(.+?))?\s*$/i.exec(command);
  return match ? (match[1]?.trim() || "") : null;
}

// ─── Thinking Strategies ────────────────────────────────────────────────────

type ThinkingStrategy =
  | "chain_of_thought"
  | "decomposition"
  | "analogical"
  | "self_critique"
  | "first_principles"
  | "tree_of_thought"
  | "document_analysis"
  | "comparative_analysis"
  | "auto";

interface ThinkingConfig {
  strategy: ThinkingStrategy;
  label: string;
  description: string;
  systemPrompt: string;
}

const THINKING_STRATEGIES: Record<Exclude<ThinkingStrategy, "auto">, ThinkingConfig> = {
  chain_of_thought: {    strategy: "chain_of_thought",
    label: "Chain of Thought",
    description: "Raisonnement étape par étape, chaque étape découlant logiquement de la précédente.",
    systemPrompt: `Tu es un expert en raisonnement logique et en analyse documentaire. Résous le problème ci-dessous en utilisant une approche Chain of Thought :

INSTRUCTIONS :
1. Reformule le problème avec tes propres mots pour confirmer ta compréhension.
2. Identifie les données clés et les contraintes.
3. Raisonne étape par étape. Numérote chaque étape et explique pourquoi elle découle de la précédente.
4. Si tu fais une hypothèse, annonce-la explicitement.
5. Termine par une conclusion claire et concise, séparée du raisonnement.

CONSIDÉRATIONS DOCUMENTAIRES (si le problème implique un/des documents) :
- Cite les passages ou sections pertinentes pour ancrer ton raisonnement.
- Distingue les FAITS (ce que dit le document) de tes INTERPRÉTATIONS.
- Si le document contient des ambiguïtés, signale-les à chaque étape concernée.
- Vérifie la cohérence entre les différentes parties du document à chaque étape.

FORMAT DE RÉPONSE :
## Compréhension du problème
(reformulation)

## Raisonnement étape par étape
Étape 1: ...
Étape 2: ...
...

## Conclusion
(réponse finale)`,
  },

  decomposition: {
    strategy: "decomposition",
    label: "Décomposition",
    description: "Divise un problème complexe en sous-problèmes indépendants, résout chacun, puis synthétise.",
    systemPrompt: `Tu es un expert en résolution de problèmes complexes et en structuration documentaire. Utilise la méthode de décomposition :

INSTRUCTIONS :
1. Identifie le problème principal.
2. Décompose-le en sous-problèmes indépendants et gérables (maximum 5).
3. Résous chaque sous-problème séparément avec un raisonnement clair.
4. Synthétise les résultats partiels en une solution cohérente.
5. Vérifie que la synthèse répond bien au problème initial.

CONSIDÉRATIONS DOCUMENTAIRES (si le problème implique un/des documents) :
- Décompose selon la structure logique du document (sections, chapitres, thèmes) plutôt qu'arbitrairement.
- Pour chaque sous-partie, identifie : contenu factuel, arguments, conclusions locales.
- Lors de la synthèse, vérifie qu'il n'y a pas de contradictions entre les sous-parties.
- Signale les dépendances croisées entre sections (ex: une conclusion en section 3 repose sur des données de section 1).

FORMAT DE RÉPONSE :
## Problème principal
(énoncé clair)

## Décomposition
### Sous-problème 1: ...
**Résolution:** ...

### Sous-problème 2: ...
**Résolution:** ...

(etc.)

## Synthèse
(solution combinée)

## Vérification
(la solution répond-elle au problème initial ?)`,
  },

  analogical: {
    strategy: "analogical",
    label: "Raisonnement par analogie",
    description: "Trouve des parallèles avec des problèmes connus pour transférer des solutions.",
    systemPrompt: `Tu es un expert en raisonnement analogique. Résous le problème en trouvant des parallèles :

INSTRUCTIONS :
1. Identifie la structure abstraite du problème (quels sont les éléments et relations clés ?).
2. Trouve 1 à 3 analogies pertinentes avec des domaines ou problèmes connus.
3. Pour chaque analogie, explique le mapping : quel élément correspond à quoi.
4. Transfère la solution du domaine analogique au problème original.
5. Vérifie les limites de l'analogie : où le parallèle cesse-t-il d'être valide ?

FORMAT DE RÉPONSE :
## Structure du problème
(abstraction)

## Analogies identifiées
### Analogie 1: [domaine source]
- Mapping: ...
- Solution dans ce domaine: ...
- Transfert au problème: ...

## Solution proposée
(basée sur le meilleur transfert analogique)

## Limites
(où l'analogie ne tient plus)`,
  },

  self_critique: {
    strategy: "self_critique",
    label: "Auto-critique itérative",
    description: "Propose une solution, la critique, l'améliore, en boucle jusqu'à convergence.",
    systemPrompt: `Tu es un expert en pensée critique et en révision documentaire. Résous le problème en utilisant un processus d'auto-critique itérative :

INSTRUCTIONS :
1. Propose une première solution (rapide, intuitive).
2. Critique cette solution : quelles sont ses failles, hypothèses non vérifiées, cas limites ?
3. Propose une solution améliorée qui adresse les critiques.
4. Critique à nouveau : reste-t-il des faiblesses ?
5. Si oui, itère une dernière fois. Sinon, finalise.

CONSIDÉRATIONS DOCUMENTAIRES (si le problème implique un/des documents) :
- Vérifie l'exactitude factuelle : les données citées sont-elles correctes et à jour ?
- Vérifie la cohérence interne : pas de contradictions entre sections.
- Vérifie la complétude : les informations essentielles sont-elles toutes présentes ?
- Vérifie la clarté : un lecteur non-expert comprendrait-il chaque partie ?
- Vérifie le ton et le registre : sont-ils adaptés au public cible ?

FORMAT DE RÉPONSE :
## Première tentative
(solution intuitive)

## Critique #1
- Faille: ...
- Faille: ...

## Deuxième tentative
(solution améliorée)

## Critique #2
- Point résolu: ...
- Faiblesse restante: ...

## Solution finale
(version la plus robuste)

## Niveau de confiance
(élevé / moyen / faible, et pourquoi)`,
  },

  first_principles: {
    strategy: "first_principles",
    label: "Premiers principes",
    description: "Remonte aux vérités fondamentales, élimine les suppositions, reconstruit depuis la base.",
    systemPrompt: `Tu es un expert en raisonnement par premiers principes (à la manière d'Elon Musk ou Aristote). Résous le problème en remontant aux fondamentaux :

INSTRUCTIONS :
1. Identifie les suppositions communes sur ce sujet.
2. Remets en question chaque supposition : est-elle vraiment nécessaire ?
3. Identifie les vérités fondamentales et indiscutables (les "premiers principes").
4. Reconstruis une solution uniquement à partir de ces premiers principes.
5. Compare avec l'approche conventionnelle : qu'apporte ta solution de différent ?

FORMAT DE RÉPONSE :
## Suppositions courantes
1. ...
2. ...

## Remise en question
- Supposition 1: [vraie/fausse/partielle] parce que...
- Supposition 2: ...

## Premiers principes identifiés
1. (vérité fondamentale)
2. ...

## Reconstruction depuis la base
(solution construite uniquement sur les premiers principes)

## Comparaison avec l'approche conventionnelle
(avantages / inconvénients de la nouvelle approche)`,
  },

  tree_of_thought: {
    strategy: "tree_of_thought",
    label: "Tree of Thought",
    description: "Explore plusieurs branches de raisonnement en parallèle, évalue chacune, sélectionne la meilleure avant d'agir. Idéal pour les tâches critiques ou à fort enjeu.",
    systemPrompt: `Tu es un stratège expert en résolution de problèmes critiques. Pour le problème donné, tu dois explorer 3 approches distinctes avant de choisir la meilleure.

INSTRUCTIONS :
1. Génère 3 approches fondamentalement différentes (pas de variantes mineures).
2. Pour chaque approche, évalue : faisabilité, risques, complexité, réversibilité.
3. Score chaque approche sur 10.
4. Sélectionne l'approche avec le meilleur rapport bénéfice/risque.
5. Développe un plan d'exécution détaillé pour l'approche retenue.

FORMAT DE RÉPONSE :
## Approche A : [nom court]
[description en 2-3 phrases]
- Avantages : ...
- Risques : ...
- Faisabilité : [haute/moyenne/basse]
- Score : [0-10]

## Approche B : [nom court]
[description en 2-3 phrases]
- Avantages : ...
- Risques : ...
- Faisabilité : [haute/moyenne/basse]
- Score : [0-10]

## Approche C : [nom court]
[description en 2-3 phrases]
- Avantages : ...
- Risques : ...
- Faisabilité : [haute/moyenne/basse]
- Score : [0-10]

## ✅ Approche retenue : [A/B/C] — [nom]
**Raison du choix :** [justification en 1-2 phrases]

## Plan d'exécution détaillé
1. ...
2. ...
(chaque étape inclut une vérification)

## Points de vigilance
- ...`,
  },

  document_analysis: {
    strategy: "document_analysis",
    label: "Analyse documentaire",
    description: "Stratégie spécialisée pour le traitement de documents : synthèse, extraction d'information, vérification de cohérence, restructuration, annotation et conformité.",
    systemPrompt: `Tu es un expert en analyse et traitement documentaire. Tu excelles en synthèse, extraction d'information clé, vérification de cohérence, détection d'incohérences et restructuration de contenu.

INSTRUCTIONS :
1. Identifie le TYPE de document (rapport, contrat, note, procédure, courrier, étude, présentation, etc.) et son OBJECTIF.
2. Extrais la STRUCTURE existante (sections, hiérarchie, flux logique).
3. Identifie les ÉLÉMENTS CLÉS : thèse principale, arguments, données chiffrées, conclusions, engagements, dates limites, parties prenantes.
4. Détecte les PROBLÈMES éventuels : incohérences internes, informations manquantes, ambiguïtés, contradictions entre sections, termes imprécis.
5. Propose des AMÉLIORATIONS concrètes avec localisation précise (section/paragraphe concerné).

PRINCIPES DOCUMENTAIRES :
- Fidélité : ne jamais inventer d'information absente du document source.
- Traçabilité : chaque observation doit être rattachée à une section/passage précis.
- Exhaustivité : couvrir l'ensemble du document, pas seulement les premières pages.
- Neutralité : séparer les faits des interprétations.
- Priorisation : classer les observations par impact (critique → mineur).

FORMAT DE RÉPONSE :
## Identification du document
- Type : ...
- Objectif : ...
- Public cible : ...
- Volume : ... (sections/pages/mots estimés)

## Structure et flux logique
(description de l'architecture du document)

## Éléments clés extraits
1. **[Catégorie]** : [élément] — Section [X]
2. ...

## Diagnostic
### Incohérences / Problèmes détectés
- 🔴 [Critique] : ... (Section X)
- 🟡 [Modéré] : ... (Section Y)
- 🟢 [Mineur] : ... (Section Z)

### Informations manquantes
- ...

## Recommandations
1. [Action prioritaire] — Impact : [élevé/moyen] — Effort : [faible/moyen/élevé]
2. ...

## Synthèse en une phrase
(résumé exécutif du diagnostic)`,
  },

  comparative_analysis: {
    strategy: "comparative_analysis",
    label: "Analyse comparative",
    description: "Compare, croise et réconcilie plusieurs documents, versions ou sources d'information. Identifie convergences, divergences et contradictions.",
    systemPrompt: `Tu es un expert en analyse comparative de documents. Tu excelles à croiser des sources, identifier des divergences, et produire une vue unifiée et fiable.

INSTRUCTIONS :
1. Identifie les SOURCES à comparer (documents, versions, sections, ou données).
2. Établis un CADRE DE COMPARAISON : quels critères/dimensions utiliser pour comparer ?
3. Pour chaque critère, identifie les CONVERGENCES (points d'accord) et les DIVERGENCES (désaccords, écarts, contradictions).
4. Évalue la FIABILITÉ de chaque source sur les points de divergence (date, auteur, niveau de détail, cohérence interne).
5. Propose une POSITION DE SYNTHÈSE qui réconcilie les sources ou explique pourquoi la réconciliation est impossible.
6. Signale les ZONES D'OMBRE : sujets couverts par une source mais absents de l'autre.

PRINCIPES DE COMPARAISON :
- Équité : ne pas favoriser une source a priori.
- Granularité : comparer au niveau le plus fin pertinent (phrase, donnée chiffrée, date).
- Contexte : une divergence peut être légitime si les contextes diffèrent (date, périmètre, audience).
- Transparence : toujours indiquer le degré de certitude de chaque conclusion.

FORMAT DE RÉPONSE :
## Sources identifiées
| # | Source | Type | Date | Périmètre |
|---|--------|------|------|-----------|
| 1 | ... | ... | ... | ... |
| 2 | ... | ... | ... | ... |

## Cadre de comparaison
Critères retenus : [liste des dimensions de comparaison]

## Matrice de comparaison
### Critère 1 : [nom]
- **Source 1** : ...
- **Source 2** : ...
- **Verdict** : [convergence ✅ | divergence ⚠️ | contradiction ❌]

### Critère 2 : [nom]
...

## Synthèse des divergences
| Critère | Nature de l'écart | Source la plus fiable | Confiance |
|---------|-------------------|-----------------------|-----------|
| ... | ... | ... | élevée/moyenne/faible |

## Zones d'ombre
- [Sujet X] : couvert uniquement par Source 1, absent de Source 2.
- ...

## Position de synthèse recommandée
(version réconciliée ou explication de l'impossibilité de réconcilier)

## Points nécessitant une vérification humaine
- ...`,
  },
};

// ─── Strategy Auto-Selection ────────────────────────────────────────────────

/**
 * Génère une explication courte et naturelle du pourquoi du raisonnement,
 * destinée à être prononcée vocalement.
 */
function buildReasoningExplanation(
  prompt: string,
  strategy: Exclude<ThinkingStrategy, "auto">,
  complexity: ComplexityLevel
): string {
  const lower = prompt.toLowerCase();

  // Raisons basées sur la stratégie choisie
  const strategyReasons: Record<Exclude<ThinkingStrategy, "auto">, string> = {
    chain_of_thought: "Je vais raisonner étape par étape pour m'assurer de ne rien oublier.",
    decomposition: "Je décompose le document en sous-parties pour mieux le traiter.",
    analogical: "Je cherche des analogies avec des documents ou cas similaires que je connais.",
    self_critique: "Je vais vérifier ma réponse en la critiquant pour la rendre plus fiable.",
    first_principles: "Je remonte aux éléments fondamentaux pour construire une réponse solide.",
    tree_of_thought: "J'explore plusieurs approches en parallèle avant de choisir la meilleure.",
    document_analysis: "J'analyse le document en profondeur pour en extraire la structure et les éléments clés.",
    comparative_analysis: "Je croise les sources pour identifier les convergences et les écarts.",
  };

  // Raisons supplémentaires basées sur le contexte du prompt (usage documentaire)
  let contextReason = "";
  if (/confidentiel|sensible|conformit|juridique|contrat|rgpd|cnil|données personnelles/i.test(lower)) {
    contextReason = "Ce document touche à des informations sensibles ou confidentielles, je dois être particulièrement prudent.";
  } else if (/compar|croiser|différence|divergence|version|vs\b|versus|entre.*document/i.test(lower)) {
    contextReason = "Je compare les sources pour identifier les points de convergence et les contradictions.";
  } else if (/résum|synthès|condenser|essentiel|idée.?clé|point.?clé/i.test(lower)) {
    contextReason = "Une synthèse fiable demande d'identifier d'abord les idées clés avant de condenser.";
  } else if (/structur|organisat|plan\b|sommaire|table des matières|architecture du document/i.test(lower)) {
    contextReason = "C'est une question de structuration qui mérite une réflexion approfondie.";
  } else if (/réorganis|restructur|refonte|réécri|réécriture|remanier/i.test(lower)) {
    contextReason = "Cette réorganisation du document nécessite de bien planifier pour éviter les incohérences.";
  } else if (/incohérence|erreur|correction|contradiction|anomalie|coquille/i.test(lower)) {
    contextReason = "Pour identifier la source du problème, je dois analyser le document méthodiquement.";
  } else if (/plusieurs.*(document|section|fichier|page|source|version)/i.test(lower)) {
    contextReason = "Ça touche plusieurs documents ou sections, je dois coordonner les changements.";
  } else if (/extraire|extraction|identifier.*information|repérer|inventorier|lister.*éléments/i.test(lower)) {
    contextReason = "J'identifie et j'extrais les informations pertinentes de manière systématique.";
  } else if (/annoter|annotation|commentaire|marge|remarque|feedback/i.test(lower)) {
    contextReason = "J'annote le document de façon structurée pour faciliter la relecture.";
  } else if (/relire|relecture|proofreading|révision|qualité rédaction/i.test(lower)) {
    contextReason = "Une relecture rigoureuse nécessite de vérifier chaque section avec méthode.";
  } else if (/conformit|norme|iso|standard|réglementaire|audit|checklist/i.test(lower)) {
    contextReason = "Je vérifie la conformité point par point selon les critères applicables.";
  } else if (/classif|catégoris|trier|ranger|taxon|étiqueter|tag/i.test(lower)) {
    contextReason = "Je classe les éléments du document selon une logique cohérente.";
  } else if (complexity === "critical") {
    contextReason = "La complexité est critique, une approche structurée est indispensable.";
  }

  return contextReason || strategyReasons[strategy];
}

function autoSelectStrategy(prompt: string): Exclude<ThinkingStrategy, "auto"> {
  const lower = prompt.toLowerCase();

  // Déléguer la détection de complexité à assessComplexity
  const complexity = assessComplexity(prompt);
  if (complexity === "critical") return "tree_of_thought";

  // ── Analyse comparative (priorité haute : doit passer avant document_analysis) ──
  if (
    /compar(er|aison|atif|ative)/i.test(lower) ||
    /croiser|différence(s)?.*entre|divergence|version.*(précédente|antérieure|actuelle)/i.test(lower) ||
    /\bvs\b|versus/i.test(lower) ||
    /entre.*(document|version|source|fichier)/i.test(lower) ||
    /réconcili|fusionner.*version|merge.*document/i.test(lower) ||
    /écart(s)?.*entre|delta\b/i.test(lower)
  ) {
    return "comparative_analysis";
  }

  // ── Analyse documentaire (synthèse, extraction, relecture, conformité, annotation) ──
  if (
    /résum(é|er)|synth(è|é)s(e|er)|condenser|point(s)?.?clé(s)?|idée(s)?.?clé(s)?/i.test(lower) ||
    /extraire|extraction|identifier.*information|repérer.*dans|inventorier/i.test(lower) ||
    /relire|relecture|proofreading|réviser.*document|corriger.*texte/i.test(lower) ||
    /conformit(é)?|audit|norme|iso\s?\d|check.?list|réglementaire/i.test(lower) ||
    /annoter|annotation|marge|feedback.*document/i.test(lower) ||
    /classif|catégoris|trier.*document|ranger|taxon|étiqueter/i.test(lower) ||
    /analyser.*document|analyse.*contenu|examen.*texte|diagnostic.*document/i.test(lower) ||
    /table des matières|sommaire.*générer|index.*document/i.test(lower) ||
    /cohérence.*document|qualité.*rédaction|lisibilité/i.test(lower) ||
    /fiche.*lecture|note.*synthèse|abstract|executive.?summary/i.test(lower)
  ) {
    return "document_analysis";
  }

  // ── Décomposition (problèmes structurels, multi-parties) ──
  if (
    lower.includes("complexe") ||
    lower.includes("dossier") ||
    lower.includes("rapport") ||
    lower.includes("plusieurs parties") ||
    lower.includes("multi-étapes") ||
    lower.includes("structurer") ||
    lower.includes("organiser") ||
    /plan\b(?!.*d'action.*simple)/i.test(lower) ||
    /restructur|réorganis|refonte/i.test(lower) ||
    complexity === "complex"
  ) {
    return "decomposition";
  }

  // ── Analogie ──
  if (
    lower.includes("comme") ||
    lower.includes("similaire") ||
    lower.includes("analogie") ||
    lower.includes("comparable") ||
    lower.includes("ressemble") ||
    lower.includes("modèle de document") ||
    lower.includes("template") ||
    lower.includes("s'inspirer de") ||
    lower.includes("à la manière de")
  ) {
    return "analogical";
  }

  // ── Premiers principes ──
  if (
    lower.includes("fondamental") ||
    lower.includes("pourquoi") ||
    lower.includes("principes") ||
    lower.includes("repenser") ||
    lower.includes("depuis zéro") ||
    lower.includes("from scratch") ||
    lower.includes("repartir de la base")
  ) {
    return "first_principles";
  }

  // ── Auto-critique (vérification, robustesse) ──
  if (
    lower.includes("vérifier") ||
    lower.includes("critiquer") ||
    lower.includes("robuste") ||
    lower.includes("fiable") ||
    lower.includes("relire") ||
    lower.includes("cas limite") ||
    lower.includes("valider") ||
    lower.includes("contre-vérifier") ||
    lower.includes("double check")
  ) {
    return "self_critique";
  }

  // Par défaut : Chain of Thought (le plus polyvalent)
  return "chain_of_thought";
}

// ─── Build the thinking prompt ──────────────────────────────────────────────

function buildThinkingPrompt(strategy: Exclude<ThinkingStrategy, "auto">, userPrompt: string): string {
  const config = THINKING_STRATEGIES[strategy];
  return `${config.systemPrompt}\n\n---\n\nPROBLÈME À RÉSOUDRE :\n${userPrompt}`;
}

// ─── Skill Export ───────────────────────────────────────────────────────────

export const reasoningSkill: Skill = {
  name: "reasoning",
  declarations: [
    {
      name: "reasoning_think",
      description:
        "Effectue un raisonnement structuré selon la stratégie choisie (auto, chain_of_thought, decomposition, document_analysis, comparative_analysis, self_critique, tree_of_thought…). " +
        "Retourne un plan d'action. **Ne jamais s'arrêter après cet outil** — exécute immédiatement le plan ou formule la réponse finale. " +
        "Utiliser uniquement si : ≥ 3 étapes logiques, document sensible/confidentiel, approche ayant échoué (self_critique), analyse/synthèse/comparaison de documents (document_analysis, comparative_analysis), ou production d'un document/dossier majeur (tree_of_thought).",
      parameters: {
        type: "OBJECT",
        properties: {
          prompt: {
            type: "STRING",
            description: "Le problème ou la question à résoudre avec un raisonnement structuré.",
          },
          strategy: {
            type: "STRING",
            description:
              "La stratégie de pensée à utiliser : 'chain_of_thought', 'decomposition', 'analogical', 'self_critique', 'first_principles', 'tree_of_thought', 'document_analysis', 'comparative_analysis', ou 'auto' pour laisser Leanna choisir. Défaut: 'auto'. Utilisez 'document_analysis' pour synthèse/extraction/relecture de documents, 'comparative_analysis' pour croiser des sources, 'tree_of_thought' pour les tâches critiques.",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "agent_execute",
      description:
        "Exécution interne réservée aux agents : produit directement un résultat concret, des appels structurés autorisés ou du contenu de document à produire/modifier. Ne génère pas de plan de raisonnement.",
      parameters: {
        type: "OBJECT",
        properties: {
          prompt: { type: "STRING", description: "Contexte, objectif et contrat d'exécution de l'agent." },
        },
        required: ["prompt"],
      },
    },
    {
      name: "reasoning_delegate_task",
      description:
        "Délègue une tâche longue ou complexe en arrière-plan. L'orchestrateur s'en chargera et vous préviendra quand ce sera terminé.",
      parameters: {
        type: "OBJECT",
        properties: {
          task_type: {
            type: "STRING",
            description:
              "Le type de tâche: 'logic_analysis' (réflexion longue avec Gemini 2.5 Pro) ou 'execute_command' (lancer un script long)",
          },
          payload: {
            type: "STRING",
            description: "Le prompt pour 'logic_analysis' ou la commande shell pour 'execute_command'",
          },
        },
        required: ["task_type", "payload"],
      },
    },
    {
      name: "reasoning_list_strategies",
      description: "Liste toutes les stratégies de pensée disponibles avec leur description.",
      parameters: {
        type: "OBJECT",
        properties: {},
        required: [],
      },
    },
  ],

  handleToolCall: async (name, args, context) => {
    // ── agent_execute : voie d'exécution sans le wrapper de planification ──
    if (name === "agent_execute") {
      const prompt = typeof args?.prompt === "string" ? args.prompt.trim() : "";
      if (!prompt) return { error: "Prompt d'exécution agent requis." };

      const systemPrompt =
        "Tu es un agent d'exécution documentaire. Travaille uniquement sur le contexte fourni. " +
        "Ne fournis pas de plan, ne demande pas d'archive et ne simule jamais un traitement. " +
        "Produis soit des appels structurés autorisés (JSON tool_calls avec name et parameters), soit un résultat final concret avec preuves et le contenu complet des documents à produire ou modifier. " +
        "Réponds toujours avec du texte visible; ne reste jamais silencieux.";

      // Utilise le provider actif (Gemini ou OpenRouter selon le profil utilisateur)
      // avec thinkingBudget: 0 pour forcer une sortie visible immédiate.
      try {
        const response = await generateText({
          prompt,
          systemPrompt,
          temperature: 0.3,
          thinkingBudget: 0,
          maxOutputTokens: 16_384,
        });
        const answer = response.text.trim();
        if (answer) {
          return {
            answer,
            metadata: { model: response.model, provider: response.provider, mode: "agent_execute" },
          };
        }
        console.warn(`[agent_execute] ${response.provider}/${response.model} n'a produit aucun texte, tentative avec fallback...`);
      } catch (error) {
        console.warn(`[agent_execute] Erreur provider actif: ${(error as Error).message}, tentative avec fallback...`);
      }

      // Fallback : tente l'autre provider (si Gemini actif → OpenRouter, et vice versa)
      try {
        const activeProvider = getActiveProvider();
        const fallbackOptions: any = {
          prompt: `${systemPrompt}\n\n${prompt}`,
          temperature: 0.3,
          thinkingBudget: 0,
          maxOutputTokens: 16_384,
        };
        // Force l'autre provider comme fallback
        if (activeProvider === 'gemini') {
          fallbackOptions.openrouterModel = 'google/gemini-2.5-flash';
        } else {
          fallbackOptions.geminiModel = 'gemini-2.5-flash';
        }

        const fallback = await generateText(fallbackOptions);
        const answer = fallback.text.trim();
        if (answer) {
          return {
            answer,
            metadata: { model: fallback.model, provider: fallback.provider, mode: "agent_execute_fallback" },
          };
        }
      } catch (error) {
        return { error: `Erreur d'exécution agent (fallback): ${(error as Error).message}` };
      }

      return { error: "Le modèle n'a produit aucune sortie exécutable après 2 tentatives." };
    }

    // ── reasoning_think ─────────────────────────────────────────────────
    if (name === "reasoning_think") {
      const { prompt, strategy: requestedStrategy } = args;
      const chosenStrategy: Exclude<ThinkingStrategy, "auto"> =
        !requestedStrategy || requestedStrategy === "auto"
          ? autoSelectStrategy(prompt)
          : (requestedStrategy as Exclude<ThinkingStrategy, "auto">);

      const config = THINKING_STRATEGIES[chosenStrategy];
      if (!config) {
        return { error: `Stratégie inconnue: '${requestedStrategy}'. Utilisez reasoning_list_strategies pour voir les options.` };
      }

      // ── Étape de pré-raisonnement : CoT automatique pour complexe/critique ──
      // Pour les stratégies qui bénéficient d'une décomposition préalable,
      // on exécute le ChainOfThoughtExecutor avant d'appeler le LLM principal.
      const isDecompositionStrategy =
        chosenStrategy === "decomposition" ||
        chosenStrategy === "chain_of_thought" ||
        chosenStrategy === "tree_of_thought" ||
        chosenStrategy === "document_analysis" ||
        chosenStrategy === "comparative_analysis";

      const complexity = assessComplexity(prompt);
      const shouldRunCoT = isDecompositionStrategy && complexity !== "simple";

      // ── Annonce du raisonnement (texte + TTS) ──────────────────────────────
      // IMPORTANT : on signale TOUJOURS à l'utilisateur que le raisonnement démarre
      // AVANT de lancer quoi que ce soit (CoT ou LLM principal).
      // 1. Émission texte immédiate (jamais bloquée par cooldown ou erreur TTS)
      // 2. TTS audio en bonus si cooldown OK et génération réussie
      const reasonLabel = config.label;
      const complexityLabels: Record<string, string> = {
        simple: "simple",
        moderate: "modérée",
        complex: "complexe",
        critical: "critique",
      };
      const complexityText = complexityLabels[complexity] || complexity;
      const reasonExplanation = buildReasoningExplanation(prompt, chosenStrategy, complexity);
      const announcementText = `J'active mon raisonnement ${reasonLabel}, la tâche est ${complexityText}. ${reasonExplanation}`;

      // 1. Émettre l'état reasoning + texte d'annonce au frontend IMMÉDIATEMENT
      if (context?.emitToClient) {
        context.emitToClient({
          reasoning: {
            active: true,
            strategy: chosenStrategy,
            strategyLabel: config.label,
            complexity,
            announcement: announcementText,
          },
        });
      }

      // 2. TTS audio (avec cooldown pour éviter spam) — on ATTEND l'audio avant de continuer
      const now = Date.now();
      const ttsEnabled = context?.reasoningVoiceEnabled !== false;
      if (context?.emitToClient && ttsEnabled && (now - _lastTTSAnnouncementTime > TTS_ANNOUNCEMENT_COOLDOWN_MS)) {
        _lastTTSAnnouncementTime = now;
        try {
          const audioBase64 = await generateSpeech(announcementText, { voiceName: context.voiceName || "Aoede" });
          if (audioBase64 && context.emitToClient) {
            context.emitToClient({ audio: audioBase64 });
          }
        } catch (ttsErr) {
          // TTS échouée — pas grave, l'annonce texte est déjà envoyée
          console.warn(`[ReasoningSkill] TTS annonce échouée (non bloquant): ${(ttsErr as Error).message}`);
        }
      }

      let cotContext = "";
      let cotDecomposition: string[] = [];

      if (shouldRunCoT) {
        try {
          const cotExecutor = new ChainOfThoughtExecutor({
            emitToClient: context?.emitToClient,
          });
          const cotResult = await cotExecutor.run(prompt, complexity);

          if (cotResult.decomposition.length > 0) {
            cotDecomposition = cotResult.decomposition;
            cotContext = [
              `## Décomposition préalable (Chain of Thought)`,
              `Complexité détectée : ${cotResult.complexity}`,
              `Stratégie : ${cotResult.strategy}`,
              ``,
              `Sous-tâches identifiées :`,
              ...cotResult.decomposition.map((s, i) => `${i + 1}. ${s}`),
              ...(cotResult.answer
                ? [``, `Analyse préliminaire :`, cotResult.answer.slice(0, 800)]
                : []),
              ``,
              `---`,
              ``,
            ].join("\n");
          }
        } catch (cotErr) {
          // Le CoT est en best-effort, on continue sans lui
          console.warn(`[ReasoningSkill] CoT pre-processing failed: ${(cotErr as Error).message}`);
        }
      } else {
        // Pas de CoT nécessaire — le reasoning active a déjà été émis plus haut
      }

      // Enrichir le prompt avec le contexte CoT si disponible
      const enrichedPrompt = cotContext
        ? `${cotContext}${prompt}`
        : prompt;

      const fullPrompt = buildThinkingPrompt(chosenStrategy, enrichedPrompt);

      try {
        const response = await generateText({
          prompt: fullPrompt,
          systemPrompt: config.systemPrompt,
          temperature: 0.3,
        });

        // Notify frontend that reasoning is done
        if (context?.emitToClient) {
          context.emitToClient({ reasoning: { active: false } });
          // Annonce vocale de fin uniquement si l'annonce de début a été jouée récemment ET si la voix raisonnement est activée
          const ttsEndEnabled = context?.reasoningVoiceEnabled !== false;
          if (ttsEndEnabled && Date.now() - _lastTTSAnnouncementTime < TTS_ANNOUNCEMENT_COOLDOWN_MS) {
            generateSpeech("Mon raisonnement est terminé, je passe à l'action.", { voiceName: context.voiceName || "Aoede" })
              .then((audioBase64) => {
                if (audioBase64 && context.emitToClient) {
                  context.emitToClient({ audio: audioBase64 });
                }
              })
              .catch(() => { /* Non bloquant */ });
          }
        }

        return {
          strategy_used: config.label,
          strategy_id: chosenStrategy,
          complexity_detected: complexity,
          decomposition: cotDecomposition.length > 0 ? cotDecomposition : undefined,
          reasoning: response.text,
          next_action: "Le raisonnement est terminé. Tu DOIS maintenant utiliser ce plan pour agir : exécute les étapes identifiées, ou si c'était une question, formule la réponse finale à l'utilisateur en te basant sur la section 'Conclusion' ou 'Approche retenue' ci-dessus.",
          metadata: {
            auto_selected: !requestedStrategy || requestedStrategy === "auto",
            cot_preprocessing: shouldRunCoT && cotDecomposition.length > 0,
            model: response.model,
            provider: response.provider,
          },
        };
      } catch (e: any) {
        // Notify frontend that reasoning ended (with error)
        if (context && context.emitToClient) {
          context.emitToClient({ reasoning: { active: false } });
        }
        return { error: `Erreur lors du raisonnement: ${e.message}` };
      }
    }

    // ── reasoning_list_strategies ───────────────────────────────────────
    if (name === "reasoning_list_strategies") {
      const strategies = Object.entries(THINKING_STRATEGIES).map(([id, config]) => ({
        id,
        label: config.label,
        description: config.description,
      }));
      return {
        strategies,
        auto_selection_info: {
          description: "Le mode 'auto' utilise assessComplexity() pour détecter la complexité de la tâche.",
          levels: {
            simple: "Réponse directe, pas de décomposition",
            moderate: "chain_of_thought ou decomposition selon les mots-clés",
            complex: "decomposition avec analyse des dépendances",
            critical: "tree_of_thought — exploration de 3 branches avant décision",
          },
        },
        note: "Utilisez reasoning_think avec le paramètre 'strategy' pour choisir, ou laissez 'auto' pour une sélection automatique basée sur la complexité détectée.",
      };
    }

    // ── reasoning_delegate_task ─────────────────────────────────────────
    if (name === "reasoning_delegate_task") {
      const { task_type, payload } = args;

      // Lance la tâche en arrière-plan sans await
      (async () => {
        try {
          if (task_type === "logic_analysis") {
            console.log(`[Reasoning] Démarrage de l'analyse logique en arrière-plan...`);

            // Utilise Chain of Thought par défaut pour les analyses déléguées
            const thinkingPrompt = buildThinkingPrompt("chain_of_thought", payload);

            const response = await generateText({
              prompt: thinkingPrompt,
              systemPrompt: THINKING_STRATEGIES.chain_of_thought.systemPrompt,
              temperature: 0.3,
            });
            if (context && context.notifyLiveAPI) {
              context.notifyLiveAPI(
                `L'analyse logique (Chain of Thought) est terminée. Voici le résultat :\n${response.text}`
              );
            }
          } else if (task_type === "execute_command") {
            const targetArg = parseReasoningListCommand(payload);
            if (targetArg === null) {
              if (context && context.notifyLiveAPI) {
                context.notifyLiveAPI(
                  `Commande refusée: seules les commandes 'dir' ou 'ls' sont autorisées dans le workspace du projet.`
                );
              }
              return;
            }

            let resolvedPath = getProjectRoot();
            if (targetArg) {
              const normalized = normalizeProjectPath(targetArg);
              if (!normalized) {
                if (context && context.notifyLiveAPI) {
                  context.notifyLiveAPI(
                    `Commande refusée: le chemin doit rester à l'intérieur du workspace du projet.`
                  );
                }
                return;
              }
              resolvedPath = normalized;
            }

            // A directory listing does not need a shell or child process. Using
            // the filesystem API keeps untrusted paths as data, never commands.
            console.log(`[Reasoning] Listing workspace directory: ${resolvedPath}`);
            try {
              const entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
              const output = entries
                .slice(0, 500)
                .map((entry) => `${entry.isDirectory() ? "[DIR] " : "      "}${entry.name}`)
                .join("\n");
              const truncated = entries.length > 500 ? "\n… liste tronquée à 500 éléments" : "";
              context?.notifyLiveAPI?.(
                `La tâche '${payload}' est terminée avec succès.\nStdout: ${(output + truncated).substring(0, 500)}`
              );
            } catch (error) {
              context?.notifyLiveAPI?.(
                `La tâche '${payload}' s'est terminée avec une erreur: ${(error as Error).message}`
              );
            }
          }
        } catch (e: any) {
          console.error("[Reasoning] Erreur en arrière-plan:", e);
          if (context && context.notifyLiveAPI) {
            context.notifyLiveAPI(`Erreur lors de la tâche d'arrière-plan: ${e.message}`);
          }
        }
      })();

      return {
        status:
          "Tâche déléguée avec succès en arrière-plan. Vous pouvez informer l'utilisateur que vous vous en occupez. Vous recevrez un message système avec le résultat quand ce sera terminé.",
      };
    }

    return { error: "Unknown tool" };
  },
};