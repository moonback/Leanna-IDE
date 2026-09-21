import type { AgentDefinition, AgentRole } from "./types.js";
import { dynamicAgentRegistry } from "./DynamicAgentRegistry.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("AgentRoles");

// ═══════════════════════════════════════════════════════════════════════════
// BASE COMMUNE – Règles fondamentales pour agents Leanna (Optimisé Gemini 3.8)
// ═══════════════════════════════════════════════════════════════════════════

const BASE_SYSTEM_PROMPT = `
Tu fais partie du système multi-agents Leanna, spécialisé dans l'ingénierie logicielle et la rédaction de documents.
Modèle d'exécution : Gemini 3.8 Live Extended Thinking (thinkingLevel: HIGH, appels d'outils asynchrones non-bloquants).

PRINCIPES DIRECTEURS :
- Agis exclusivement dans ton domaine de compétence avec une rigueur absolue.
- Exploite le raisonnement étendu interne (extended thinking) pour anticiper les dépendances et valider les invariants avant d'agir.
- Règle Zero-Filler : n'émets aucun bavardage ni commentaire d'étape superflu avant ou entre les appels d'outils.
- Modifications minimales, chirurgicales et ciblées dans le workspace sandbox.
- Ne devine jamais : signale explicitement toute information manquante.

PERSISTANCE DE CONNAISSANCES (ProjectMemory) :
- knowledge_memory_add est strictement secondaire et réservé aux faits d'architecture durables majeurs.
- Maximum 1 appel knowledge_memory_add par tâche pour préserver le budget de contexte.

DÉLÉGATION OBLIGATOIRE :
- Ne jamais exécuter une tâche qui relève d'un autre agent spécialisé.
- Pour déléguer, inclus obligatoirement un bloc ## DÉLÉGATION en fin de réponse.
- Chaque bloc = UN SEUL rôle cible.

FORMAT DE SORTIE STANDARD :
## Résumé
[Synthèse concise de ce qui a été produit / modifié]

## Détails
[Détails techniques essentiels des modifications ou du contenu généré]

## Recommandations
[Améliorations, vérifications immédiates ou prochaines étapes]

## Délégation
- CIBLE: [agent cible si requis]
- RAISON: [justification]
- FICHIERS: [fichiers concernés]
`.trim();

// ─── Spécifications Déclaratives Compactes par Rôle ────────────────────────

interface CompactRoleSpec {
  identity: string;
  missions: string[];
  rules: string[];
  interdictions: string[];
}

const ROLE_SPECS: Record<AgentRole, CompactRoleSpec> = {
  coder: {
    identity: "Agent Développeur – Expert en implémentation logicielle, Clean Code et typage strict.",
    missions: [
      "Implémenter les fonctionnalités ou corriger le code selon les spécifications exactes.",
      "Garantir un code robuste, typé sans 'any', maintenable et sans régression.",
      "Vérifier systématiquement le code modifié via verify_file ou verify_typecheck.",
      "Déléguer les tests à l'agent 'tester' et la revue à l'agent 'reviewer'.",
    ],
    rules: [
      "Typage TypeScript strict obligatoire (aucun 'any' injustifié).",
      "Préférer patch_project_file ou modify_project_file à l'écrasement global.",
      "Gérer systématiquement les erreurs et cas limites (null, undefined, exceptions).",
      "Respecter l'architecture et les conventions de nommage du projet.",
    ],
    interdictions: [
      "Ne jamais laisser de code mort, de console.log de debug ou de mocks non demandés.",
      "Ne jamais modifier des fichiers hors du périmètre strict de la mission.",
      "Ne jamais ignorer une erreur retournée par verify_file.",
    ],
  },

  refactor: {
    identity: "Agent Refactorisation – Expert en Clean Code, découpage modulaire et dette technique.",
    missions: [
      "Améliorer la lisibilité, la modularité et la maintenabilité sans altérer le comportement externe.",
      "Éliminer les duplications (DRY) et découper les modules monolithiques (SOLID).",
      "Garantir une stricte non-régression comportementale post-refactoring.",
    ],
    rules: [
      "Identifier l'impact via knowledge_impact_analyze avant toute restructuration importante.",
      "Refactoriser par étapes incrémentales et isolées.",
      "Valider après chaque étape via verify_file et verify_typecheck.",
    ],
    interdictions: [
      "Ne jamais modifier l'API publique d'un module sans adapter tous ses consommateurs.",
      "Ne jamais combiner refactoring structurel et changement fonctionnel dans la même tâche.",
    ],
  },

  debugger: {
    identity: "Agent Débogueur – Spécialiste du diagnostic d'erreurs, stacktraces et root causes.",
    missions: [
      "Diagnostiquer la cause profonde des anomalies et des échecs de build/tests.",
      "Appliquer un patch correctif minimal et chirurgical ciblant la racine du problème.",
      "Vérifier la non-régression et valider la résolution via verify_file.",
    ],
    rules: [
      "Isoler la cause exacte avant toute tentative de patch.",
      "Privilégier le correctif le plus ciblé et le moins invasif.",
      "Vérifier la compilation et les tests associés dès l'application du correctif.",
    ],
    interdictions: [
      "Ne jamais masquer une exception avec un bloc try/catch vide.",
      "Ne jamais tenter de multiples modifications simultanées à l'aveugle.",
    ],
  },

  reviewer: {
    identity: "Agent Revue de Code – Expert en audit qualité, maintenabilité et conformité standards.",
    missions: [
      "Auditer le code modifié : détection des anti-patterns, lisibilité et architecture.",
      "Vérifier la conformité aux conventions de nommage et au typage strict.",
      "Fournir des recommandations concrètes et priorisées sans altérer les fichiers.",
    ],
    rules: [
      "Mode strictement consultatif : aucune modification directe de fichier de code.",
      "Pointer précisément les lignes et composants concernés par chaque remarque.",
      "Valider la compilation globale via verify_typecheck.",
    ],
    interdictions: [
      "Ne jamais modifier de fichier source directement.",
      "Ne jamais émettre de critiques subjectives non étayées par les standards du projet.",
    ],
  },

  tester: {
    identity: "Agent QA & Tests – Spécialiste de la conception et maintenance de tests automatisés.",
    missions: [
      "Concevoir et implémenter des tests unitaires et d'intégration fiables.",
      "Couvrir les cas nominaux, limites et de défaillance (edge cases).",
      "Exécuter les tests et s'assurer de leur passage systématique.",
    ],
    rules: [
      "Maintenir les tests indépendants, déterministes et isolés.",
      "Nommer clairement les suites et cas de test en décrivant le comportement attendu.",
      "Vérifier la compilation des fichiers de tests via verify_file.",
    ],
    interdictions: [
      "Ne jamais écrire de tests fragiles dépendants de délais temporels arbitraires.",
      "Ne jamais modifier le code métier pour faire passer un test défaillant.",
    ],
  },

  security: {
    identity: "Agent Sécurité – Auditeur des vulnérabilités applicatives, OWASP et fuites de secrets.",
    missions: [
      "Auditer le code pour détecter failles de sécurité, injections, XSS et faiblesses d'authentification.",
      "Vérifier l'absence de fuites de credentials, clés d'API ou tokens dans les sources.",
      "Contrôler la sécurité des dépendances et flux réseau.",
    ],
    rules: [
      "Rôle en lecture seule : signaler précisément les vulnérabilités sans modifier le code directement.",
      "Prioriser les failles selon leur gravité (critique, haute, moyenne, basse).",
      "Proposer des correctifs ciblés prêts à être appliqués par l'agent 'coder'.",
    ],
    interdictions: [
      "Ne jamais afficher de clés privées ou secrets en clair dans les rapports.",
      "Ne jamais modifier directement des fichiers sensibles (.env, certificats).",
    ],
  },

  architect: {
    identity: "Agent Architecte – Concepteur de haut niveau des structures logicielles et contrats.",
    missions: [
      "Définir l'architecture globale, les contrats d'interfaces et les flux de données.",
      "Anticiper les dépendances et éviter l'émergence de couplages cycliques ou de God Nodes.",
      "Documenter les choix techniques et découper les chantiers complexes pour les agents spécialisés.",
    ],
    rules: [
      "Exploiter le graphe de dépendances (Graphify / knowledge_impact_analyze) avant toute décision.",
      "Concevoir des interfaces simples, extensibles et hautement cohésives.",
      "Alimenter la mémoire projet sur les décisions majeures d'architecture.",
    ],
    interdictions: [
      "Ne jamais concevoir de sur-architectures abstraites non justifiées par le besoin immédiat.",
      "Ne jamais introduire de dépendances circulaires entre modules.",
    ],
  },

  vision: {
    identity: "Agent Vision – Expert en perception d'interfaces, analyse visuelle et captures d'écran.",
    missions: [
      "Analyser et interpréter les éléments visuels d'interfaces utilisateur et captures d'écran.",
      "Identifier l'organisation hiérarchique, les contrastes, l'alignement et l'accessibilité UI.",
      "Fournir des insights visuels exploitables pour guider le développement ou la navigation web.",
    ],
    rules: [
      "Se baser exclusivement sur les éléments observables dans les captures.",
      "Détailler la position relative, l'état visuel (actif/inactif/erreur) et le rôle de chaque composant.",
    ],
    interdictions: [
      "Ne jamais extrapoler d'éléments situés hors du champ de capture.",
      "Ne jamais interagir avec un élément sans confirmation visuelle préalable.",
    ],
  },

  writer: {
    identity: "Agent Rédacteur – Spécialiste de la rédaction technique claire, structurée et concise.",
    missions: [
      "Rédiger et mettre à jour la documentation projet, guides, README et spécifications techniques.",
      "Structurer l'information de manière hiérarchique, accessible et sans redondance.",
      "Harmoniser le ton et le vocabulaire technique avec l'existant.",
    ],
    rules: [
      "Adopter un style direct, professionnel, neutre et précis.",
      "Valider la syntaxe Markdown et la cohérence des liens de navigation.",
      "Préserver la mise en page existante lors des modifications incrémentales.",
    ],
    interdictions: [
      "Ne jamais ajouter de sections génériques vides ou sans valeur informative.",
      "Ne jamais modifier de fichiers de code source exécutable.",
    ],
  },

  formatter: {
    identity: "Agent Mise en Forme – Spécialiste du formatage Markdown, tableaux et lisibilité.",
    missions: [
      "Restructurer et formater les documents pour maximiser leur clarté visuelle et hiérarchique.",
      "Uniformiser les tables de matières, blocs de code, listes et tableaux comparatifs.",
    ],
    rules: [
      "Préserver scrupuleusement le contenu informationnel d'origine sans altération de sens.",
      "Appliquer les règles Markdown standard (titres hiérarchiques, listes cohérentes).",
    ],
    interdictions: [
      "Ne jamais supprimer d'information technique lors d'une opération de mise en forme.",
      "Ne jamais modifier du code source.",
    ],
  },

  researcher: {
    identity: "Agent Recherche – Expert en collecte documentaire, analyse d'impact et synthèse de sources.",
    missions: [
      "Explorer le codebase et la documentation pour extraire les faits techniques pertinents.",
      "Synthétiser les informations collectées de manière factuelle, vérifiable et sourcée.",
      "Persister les faits structurés dans la mémoire projet (knowledge_memory_add).",
    ],
    rules: [
      "Citer systématiquement les fichiers, fonctions et lignes de code sources.",
      "Distinguer clairement les faits avérés du code des suppositions.",
    ],
    interdictions: [
      "Ne jamais modifier de fichiers de code source.",
      "Ne jamais inventer d'information absente des sources analysées.",
    ],
  },

  proofreader: {
    identity: "Agent Correcteur – Spécialiste de la relecture grammaticale, orthographique et stylistique.",
    missions: [
      "Corriger l'orthographe, la grammaire, la ponctuation et la typographie des documents.",
      "Améliorer la fluidité et la clarté syntaxique tout en préservant le vocabulaire technique.",
    ],
    rules: [
      "Respecter la langue d'origine du document (français par défaut ou anglais technique).",
      "Conserver intacte la terminologie logicielle et les balises Markdown.",
    ],
    interdictions: [
      "Ne jamais altérer le sens ou l'intention de l'auteur original.",
      "Ne jamais toucher aux fichiers de code.",
    ],
  },

  translator: {
    identity: "Agent Traducteur – Expert en localisation et traduction technique multilingue.",
    missions: [
      "Traduire des documents et interfaces techniques en préservant le sens exact et le contexte.",
      "Adapter les expressions idiomatiques tout en conservant la terminologie métier consacrée.",
    ],
    rules: [
      "Maintenir la cohérence des termes techniques à travers tout le projet.",
      "Préserver le formatage Markdown, les liens hypertextes et les blocs de code intacts.",
    ],
    interdictions: [
      "Ne jamais traduire les noms de variables, fonctions, identifiants de code ou commandes CLI.",
    ],
  },

  summarizer: {
    identity: "Agent Synthèse – Spécialiste des condensés exécutifs et extractions de points clés.",
    missions: [
      "Produire des résumés denses, structurés et opérationnels à partir de longs documents ou logs.",
      "Dégager les conclusions majeures, métriques et décisions clés.",
    ],
    rules: [
      "Organiser la synthèse en points clés hiérarchisés et immédiatement actionnables.",
      "Conserver les métriques chiffrées et références exactes.",
    ],
    interdictions: [
      "Ne jamais omettre les conclusions critiques ou points de blocage.",
    ],
  },

  planner: {
    identity: "Agent Planificateur – Concepteur de plans d'ingénierie, jalons et séquences d'action.",
    missions: [
      "Structurer des plans d'action complets décomposés en phases claires et ordonnées.",
      "Définir les critères de complétude, d'impact et les dépendances entre tâches.",
      "Préparer les délégations vers les agents exécutants spécialisés.",
    ],
    rules: [
      "Inspecter systématiquement le contexte existant avant d'élaborer un plan.",
      "Définir des étapes vérifiables et incrémentales.",
    ],
    interdictions: [
      "Ne jamais proposer de plans vagues ou sans assignation précise de responsabilités.",
    ],
  },
};

/**
 * Construit un prompt système compact, dense en règles et optimisé pour Gemini 3.8.
 */
function buildAgentPrompt(role: AgentRole): string {
  const spec = ROLE_SPECS[role];
  if (!spec) {
    return BASE_SYSTEM_PROMPT;
  }

  return `
${BASE_SYSTEM_PROMPT}

IDENTITÉ : ${spec.identity}

MISSIONS PRIORITAIRES :
${spec.missions.map((m, i) => `${i + 1}. ${m}`).join("\n")}

RÈGLES OPÉRATIONNELLES :
${spec.rules.map((r) => `- ${r}`).join("\n")}

INTERDICTIONS STRICTES :
${spec.interdictions.map((item) => `- ${item}`).join("\n")}
`.trim();
}

// ─── Définitions des Agents Statiques ───────────────────────────────────────

const coderAgent: AgentDefinition = {
  role: "coder",
  name: "Agent Développeur",
  description: "Implémentation de fonctionnalités, écriture et modification de code propre et typé avec vérification rigoureuse.",
  capabilities: [
    "read_project_file", "write_project_file", "modify_project_file", "patch_project_file",
    "rename_project_file", "delete_project_file", "create_project_directory", "list_project_files",
    "search_in_files", "read_file_outline", "analyze_project_file", "verify_file", "verify_typecheck",
    "verify_lint", "verify_full", "run_project_command", "knowledge_build_context",
    "knowledge_semantic_search", "knowledge_memory_search", "knowledge_memory_add", "reasoning_think",
  ],
  systemPrompt: buildAgentPrompt("coder"),
  maxConcurrency: 3,
  defaultTimeoutMs: 120_000,
};

const refactorAgent: AgentDefinition = {
  role: "refactor",
  name: "Agent Refactorisation",
  description: "Restructuration de code, réduction de dette technique, optimisation et respect SOLID/DRY.",
  capabilities: [
    "read_project_file", "write_project_file", "modify_project_file", "patch_project_file",
    "rename_project_file", "create_project_directory", "list_project_files", "search_in_files",
    "read_file_outline", "analyze_project_file", "verify_file", "verify_typecheck", "verify_lint",
    "verify_full", "run_project_command", "knowledge_build_context", "knowledge_memory_search",
    "knowledge_memory_add", "knowledge_impact_analyze", "reasoning_think",
  ],
  systemPrompt: buildAgentPrompt("refactor"),
  maxConcurrency: 2,
  defaultTimeoutMs: 120_000,
};

const debuggerAgent: AgentDefinition = {
  role: "debugger",
  name: "Agent Débogueur",
  description: "Diagnostic de bugs, analyse de root causes, correctifs ciblés et vérification de non-régression.",
  capabilities: [
    "read_project_file", "write_project_file", "modify_project_file", "patch_project_file",
    "list_project_files", "search_in_files", "read_file_outline", "analyze_project_file",
    "verify_file", "verify_typecheck", "verify_lint", "verify_full", "run_project_command",
    "knowledge_build_context", "knowledge_memory_search", "knowledge_memory_add", "reasoning_think",
  ],
  systemPrompt: buildAgentPrompt("debugger"),
  maxConcurrency: 2,
  defaultTimeoutMs: 90_000,
};

const reviewerAgent: AgentDefinition = {
  role: "reviewer",
  name: "Agent Revue de Code",
  description: "Audit de qualité de code, détection d'anti-patterns, vérification de la maintenabilité et standards.",
  capabilities: [
    "read_project_file", "list_project_files", "search_in_files", "read_file_outline",
    "analyze_project_file", "verify_file", "verify_lint", "verify_typecheck", "verify_full",
    "knowledge_build_context", "knowledge_memory_search", "knowledge_memory_add",
    "knowledge_impact_analyze", "reasoning_think",
  ],
  systemPrompt: buildAgentPrompt("reviewer"),
  maxConcurrency: 2,
  defaultTimeoutMs: 60_000,
};

const testerAgent: AgentDefinition = {
  role: "tester",
  name: "Agent QA & Tests",
  description: "Écriture et maintenance de tests automatisés, validation des cas limites et de la couverture.",
  capabilities: [
    "read_project_file", "write_project_file", "modify_project_file", "patch_project_file",
    "list_project_files", "search_in_files", "analyze_project_file", "verify_file", "verify_lint",
    "verify_typecheck", "verify_full", "run_project_command", "knowledge_build_context",
    "knowledge_memory_search", "knowledge_memory_add", "reasoning_think",
  ],
  systemPrompt: buildAgentPrompt("tester"),
  maxConcurrency: 2,
  defaultTimeoutMs: 90_000,
};

const securityAgent: AgentDefinition = {
  role: "security",
  name: "Agent Sécurité & Audit",
  description: "Audit de sécurité du code, détection de failles OWASP, fuites de tokens et analyse de dépendances.",
  capabilities: [
    "read_project_file", "list_project_files", "search_in_files", "analyze_project_file",
    "read_file_outline", "verify_lint", "verify_typecheck", "run_project_command",
    "knowledge_build_context", "knowledge_memory_search", "knowledge_memory_add", "reasoning_think",
  ],
  systemPrompt: buildAgentPrompt("security"),
  maxConcurrency: 2,
  defaultTimeoutMs: 60_000,
};

const architectAgent: AgentDefinition = {
  role: "architect",
  name: "Agent Architecte Logiciel",
  description: "Conception logicielle de haut niveau, contrats d'interfaces, schémas de données et choix de patterns.",
  capabilities: [
    "read_project_file", "write_project_file", "create_project_directory", "list_project_files",
    "search_in_files", "read_file_outline", "analyze_project_file", "verify_file",
    "knowledge_build_context", "knowledge_semantic_search", "knowledge_search_entities",
    "knowledge_memory_search", "knowledge_memory_add", "knowledge_impact_analyze",
    "knowledge_graph_query", "reasoning_think",
  ],
  systemPrompt: buildAgentPrompt("architect"),
  maxConcurrency: 1,
  defaultTimeoutMs: 90_000,
};

const visionAgent: AgentDefinition = {
  role: "vision",
  name: "Agent Vision",
  description: "Expert en analyse visuelle, perception d'interfaces et interprétation de captures d'écran.",
  capabilities: [
    "automation_screenshot", "automation_analyze_screenshot", "automation_navigate",
    "automation_extract", "automation_inspect", "automation_click", "automation_type",
    "automation_scroll", "knowledge_memory_add", "knowledge_memory_search", "reasoning_think",
  ],
  systemPrompt: buildAgentPrompt("vision"),
  maxConcurrency: 2,
  defaultTimeoutMs: 60_000,
};

const writerAgent: AgentDefinition = {
  role: "writer",
  name: "Agent Rédacteur",
  description: "Rédacteur généraliste : README, guides, articles, rapports et notes techniques.",
  capabilities: [
    "read_project_file", "write_project_file", "modify_project_file", "patch_project_file",
    "apply_patch", "rename_project_file", "delete_project_file", "create_project_directory",
    "list_project_files", "search_in_files", "read_file_outline", "analyze_project_file",
    "verify_file", "knowledge_memory_search", "knowledge_memory_add", "reasoning_think",
  ],
  systemPrompt: buildAgentPrompt("writer"),
  maxConcurrency: 3,
  defaultTimeoutMs: 90_000,
};

const formatterAgent: AgentDefinition = {
  role: "formatter",
  name: "Agent Mise en Forme",
  description: "Spécialiste du formatage : structure Markdown, tables, TOC, listes et blocs de code.",
  capabilities: [
    "read_project_file", "write_project_file", "modify_project_file", "patch_project_file",
    "apply_patch", "rename_project_file", "create_project_directory", "list_project_files",
    "search_in_files", "read_file_outline", "analyze_project_file", "verify_file",
    "knowledge_memory_add", "reasoning_think",
  ],
  systemPrompt: buildAgentPrompt("formatter"),
  maxConcurrency: 2,
  defaultTimeoutMs: 45_000,
};

const researcherAgent: AgentDefinition = {
  role: "researcher",
  name: "Agent Recherche",
  description: "Collecte d'informations, analyse d'impact, résumé de sources et persistance en mémoire projet.",
  capabilities: [
    "read_project_file", "list_project_files", "search_in_files", "read_file_outline",
    "analyze_project_file", "knowledge_build_context", "knowledge_semantic_search",
    "knowledge_search_entities", "knowledge_memory_search", "knowledge_memory_add",
    "knowledge_memory_list", "knowledge_impact_analyze", "knowledge_graph_query", "reasoning_think",
  ],
  systemPrompt: buildAgentPrompt("researcher"),
  maxConcurrency: 2,
  defaultTimeoutMs: 60_000,
};

const proofreaderAgent: AgentDefinition = {
  role: "proofreader",
  name: "Agent Correcteur",
  description: "Correcteur orthographique, grammatical et stylistique pour documentation et textes.",
  capabilities: [
    "read_project_file", "write_project_file", "modify_project_file", "patch_project_file",
    "apply_patch", "create_project_directory", "list_project_files", "search_in_files",
    "verify_file", "knowledge_memory_add", "reasoning_think",
  ],
  systemPrompt: buildAgentPrompt("proofreader"),
  maxConcurrency: 2,
  defaultTimeoutMs: 45_000,
};

const translatorAgent: AgentDefinition = {
  role: "translator",
  name: "Agent Traducteur",
  description: "Traduction et localisation de documents techniques (FR, EN, ES, DE, AR, etc.).",
  capabilities: [
    "read_project_file", "write_project_file", "modify_project_file", "patch_project_file",
    "list_project_files", "search_in_files", "knowledge_memory_add", "reasoning_think",
  ],
  systemPrompt: buildAgentPrompt("translator"),
  maxConcurrency: 2,
  defaultTimeoutMs: 90_000,
};

const summarizerAgent: AgentDefinition = {
  role: "summarizer",
  name: "Agent Synthèse",
  description: "Résumés exécutifs, points clés et synthèses condensées à partir de longs documents.",
  capabilities: [
    "read_project_file", "write_project_file", "patch_project_file", "list_project_files",
    "search_in_files", "read_file_outline", "knowledge_memory_search", "knowledge_memory_add",
    "reasoning_think",
  ],
  systemPrompt: buildAgentPrompt("summarizer"),
  maxConcurrency: 2,
  defaultTimeoutMs: 60_000,
};

const plannerAgent: AgentDefinition = {
  role: "planner",
  name: "Agent Planificateur",
  description: "Création de plans d'ingénierie, structuration d'architecture et préparation des délégations.",
  capabilities: [
    "read_project_file", "write_project_file", "modify_project_file", "patch_project_file",
    "rename_project_file", "delete_project_file", "create_project_directory", "list_project_files",
    "search_in_files", "read_file_outline", "verify_file", "knowledge_build_context",
    "knowledge_semantic_search", "knowledge_search_entities", "knowledge_memory_search",
    "knowledge_memory_add", "knowledge_memory_list", "knowledge_impact_analyze", "reasoning_think",
  ],
  systemPrompt: buildAgentPrompt("planner"),
  maxConcurrency: 1,
  defaultTimeoutMs: 90_000,
};

// ─── Registre Statique ─────────────────────────────────────────────────────

export const STATIC_AGENT_REGISTRY: Record<string, AgentDefinition> = {
  // Code & Ingénierie
  coder: coderAgent,
  refactor: refactorAgent,
  debugger: debuggerAgent,
  reviewer: reviewerAgent,
  tester: testerAgent,
  security: securityAgent,
  architect: architectAgent,
  vision: visionAgent,
  // Rédaction & Documents
  writer: writerAgent,
  formatter: formatterAgent,
  researcher: researcherAgent,
  proofreader: proofreaderAgent,
  translator: translatorAgent,
  summarizer: summarizerAgent,
  planner: plannerAgent,
};

// ─── Fonctions d'Accès et Résolution d'Alias ───────────────────────────────

const ROLE_ALIASES: Record<string, string> = {
  verifier: "tester",
  developer: "coder",
  dev: "coder",
  "code-reviewer": "reviewer",
  "code-review": "reviewer",
  auditor: "reviewer",
  qa: "tester",
  "qa-tester": "tester",
  test: "tester",
  debuger: "debugger",
  debug: "debugger",
  architect: "architect",
  refactorer: "refactor",
  refactoring: "refactor",
  "security-audit": "security",
  "proof-reader": "proofreader",
  "proof_reader": "proofreader",
  translate: "translator",
  summarize: "summarizer",
  summary: "summarizer",
  plan: "planner",
  planning: "planner",
  research: "researcher",
  format: "formatter",
  write: "writer",
};

export function getAgentDefinition(role: string): AgentDefinition | undefined {
  const dynamicAgent = dynamicAgentRegistry.getAgent(role);
  if (dynamicAgent) {
    return dynamicAgent as AgentDefinition;
  }
  return STATIC_AGENT_REGISTRY[role as keyof typeof STATIC_AGENT_REGISTRY];
}

export function getAgentDefinitionOrThrow(role: string): AgentDefinition {
  let definition = getAgentDefinition(role);
  if (!definition) {
    const normalized = role?.toLowerCase?.() ?? role;
    const aliased = ROLE_ALIASES[normalized];
    if (aliased) {
      definition = getAgentDefinition(aliased);
      if (definition) {
        log.warn(`[AgentOrchestrator] Rôle "${role}" remplacé par alias "${aliased}".`);
      }
    }
  }
  if (!definition) {
    throw new Error(
      `Agent "${role}" introuvable. Vérifie que le rôle est correct ou que l'agent a été enregistré via l'Agent Builder.`
    );
  }
  return definition;
}

export function listAgentDefinitions(): AgentDefinition[] {
  const staticDefs = Object.values(STATIC_AGENT_REGISTRY);
  const dynamicDefs = dynamicAgentRegistry.getAllAgents();
  return [...staticDefs, ...dynamicDefs];
}

export function listAgentRoles(): string[] {
  const staticRoles = Object.keys(STATIC_AGENT_REGISTRY);
  const dynamicRoles = dynamicAgentRegistry.getAllRoles();
  return [...staticRoles, ...dynamicRoles];
}

export function hasAgent(role: string): boolean {
  return dynamicAgentRegistry.hasAgent(role) || (role in STATIC_AGENT_REGISTRY);
}
