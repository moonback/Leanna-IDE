import { Skill } from "./base";
import { exec } from "child_process";
import os from "os";
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

function isSafeReasoningCommand(command: string): boolean {
  return /^(dir|ls)(\s+.*)?$/i.test(command);
}

// ─── Thinking Strategies ────────────────────────────────────────────────────

type ThinkingStrategy =
  | "chain_of_thought"
  | "decomposition"
  | "analogical"
  | "self_critique"
  | "first_principles"
  | "tree_of_thought"
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
    systemPrompt: `Tu es un expert en raisonnement logique. Résous le problème ci-dessous en utilisant une approche Chain of Thought :

INSTRUCTIONS :
1. Reformule le problème avec tes propres mots pour confirmer ta compréhension.
2. Identifie les données clés et les contraintes.
3. Raisonne étape par étape. Numérote chaque étape et explique pourquoi elle découle de la précédente.
4. Si tu fais une hypothèse, annonce-la explicitement.
5. Termine par une conclusion claire et concise, séparée du raisonnement.

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
    systemPrompt: `Tu es un expert en résolution de problèmes complexes. Utilise la méthode de décomposition :

INSTRUCTIONS :
1. Identifie le problème principal.
2. Décompose-le en sous-problèmes indépendants et gérables (maximum 5).
3. Résous chaque sous-problème séparément avec un raisonnement clair.
4. Synthétise les résultats partiels en une solution cohérente.
5. Vérifie que la synthèse répond bien au problème initial.

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
    systemPrompt: `Tu es un expert en pensée critique. Résous le problème en utilisant un processus d'auto-critique itérative :

INSTRUCTIONS :
1. Propose une première solution (rapide, intuitive).
2. Critique cette solution : quelles sont ses failles, hypothèses non vérifiées, cas limites ?
3. Propose une solution améliorée qui adresse les critiques.
4. Critique à nouveau : reste-t-il des faiblesses ?
5. Si oui, itère une dernière fois. Sinon, finalise.

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
    description: "Explore plusieurs branches de raisonnement en parallèle, évalue chacune, sélectionne la meilleure avant d'agir. Idéal pour les tâches critiques ou à fort risque.",
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
    decomposition: "Je décompose le problème en sous-parties pour mieux le résoudre.",
    analogical: "Je cherche des analogies avec des problèmes similaires que je connais.",
    self_critique: "Je vais vérifier ma réponse en la critiquant pour la rendre plus robuste.",
    first_principles: "Je remonte aux principes fondamentaux pour construire une solution solide.",
    tree_of_thought: "J'explore plusieurs approches en parallèle avant de choisir la meilleure.",
  };

  // Raisons supplémentaires basées sur le contexte du prompt
  let contextReason = "";
  if (/sécurit|vulnérab|authentif/i.test(lower)) {
    contextReason = "C'est une question de sécurité, je dois être particulièrement prudent.";
  } else if (/architect|conception|design/i.test(lower)) {
    contextReason = "C'est une question d'architecture qui mérite une réflexion approfondie.";
  } else if (/migrat|refactor/i.test(lower)) {
    contextReason = "Un refactoring nécessite de bien planifier pour éviter les régressions.";
  } else if (/debug|bug|erreur|error/i.test(lower)) {
    contextReason = "Pour trouver la cause du problème, je dois analyser méthodiquement.";
  } else if (/plusieurs.*fichiers|multi/i.test(lower)) {
    contextReason = "Ça touche plusieurs fichiers, je dois coordonner les changements.";
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

  // Mots-clés pour la décomposition
  if (
    lower.includes("complexe") ||
    lower.includes("architecture") ||
    lower.includes("système") ||
    lower.includes("plusieurs parties") ||
    lower.includes("multi-étapes") ||
    lower.includes("plan") ||
    lower.includes("concevoir") ||
    complexity === "complex"
  ) {
    return "decomposition";
  }

  // Mots-clés pour l'analogie
  if (
    lower.includes("comme") ||
    lower.includes("similaire") ||
    lower.includes("analogie") ||
    lower.includes("comparable") ||
    lower.includes("ressemble")
  ) {
    return "analogical";
  }

  // Mots-clés pour les premiers principes
  if (
    lower.includes("fondamental") ||
    lower.includes("pourquoi") ||
    lower.includes("principes") ||
    lower.includes("repenser") ||
    lower.includes("depuis zéro") ||
    lower.includes("from scratch")
  ) {
    return "first_principles";
  }

  // Mots-clés pour l'auto-critique
  if (
    lower.includes("vérifier") ||
    lower.includes("critiquer") ||
    lower.includes("robuste") ||
    lower.includes("fiable") ||
    lower.includes("edge case") ||
    lower.includes("cas limite")
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
        "Effectue un raisonnement structuré selon la stratégie choisie (auto, chain_of_thought, decomposition, self_critique, tree_of_thought…). " +
        "Retourne un plan d'action. **Ne jamais s'arrêter après cet outil** — exécute immédiatement le plan ou formule la réponse finale. " +
        "Utiliser uniquement si : ≥ 3 étapes logiques, sécurité/architecture, approche ayant échoué (self_critique), ou nouvelle feature majeure (tree_of_thought).",
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
              "La stratégie de pensée à utiliser : 'chain_of_thought', 'decomposition', 'analogical', 'self_critique', 'first_principles', 'tree_of_thought', ou 'auto' pour laisser Jarvis choisir. Défaut: 'auto'. Utilisez 'tree_of_thought' pour les problèmes critiques (sécurité, migration, refactoring systémique).",
          },
        },
        required: ["prompt"],
      },
    },
    {
      name: "agent_execute",
      description:
        "Exécution interne réservée aux agents : produit directement un résultat concret, des appels structurés autorisés ou des fichiers à modifier. Ne génère pas de plan de raisonnement.",
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
        "Tu es un agent codeur d'exécution. Travaille uniquement sur le contexte fourni. " +
        "Ne fournis pas de plan, ne demande pas d'archive et ne simule jamais bash/shell. " +
        "Produis soit des appels structurés autorisés (JSON tool_calls avec name et parameters), soit un résultat final concret avec preuves et fichiers complets à modifier. " +
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
        chosenStrategy === "tree_of_thought";

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
      if (context?.emitToClient && (now - _lastTTSAnnouncementTime > TTS_ANNOUNCEMENT_COOLDOWN_MS)) {
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
          // Annonce vocale de fin uniquement si l'annonce de début a été jouée récemment
          if (Date.now() - _lastTTSAnnouncementTime < TTS_ANNOUNCEMENT_COOLDOWN_MS) {
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
            if (!isSafeReasoningCommand(payload)) {
              if (context && context.notifyLiveAPI) {
                context.notifyLiveAPI(
                  `Commande refusée: seules les commandes 'dir' ou 'ls' sont autorisées dans le workspace du projet.`
                );
              }
              return;
            }
            const commandParts = payload.split(/\s+/);
            const verb = commandParts[0].toLowerCase();
            const targetArg = commandParts.slice(1).join(" ").trim();
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

            console.log(`[Reasoning] Exécution de la commande en arrière-plan: ${payload}`);
            const commandToRun =
              verb === "dir" && os.platform() === "win32"
                ? `dir "${resolvedPath}"`
                : `ls -la "${resolvedPath}"`;

            exec(commandToRun, (error, stdout, stderr) => {
              if (context && context.notifyLiveAPI) {
                if (error) {
                  context.notifyLiveAPI(
                    `La tâche '${payload}' s'est terminée avec une erreur: ${error.message}\nStderr: ${stderr.substring(0, 500)}`
                  );
                } else {
                  context.notifyLiveAPI(
                    `La tâche '${payload}' est terminée avec succès.\nStdout: ${stdout.substring(0, 500)}`
                  );
                }
              }
            });
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
