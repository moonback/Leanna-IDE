import * as path from 'path';
import * as fs from 'fs';
import { Skill } from "./base";
import { setWorkflowSkillHandler } from "./workflow";
import { gitSkill } from "../skills/git";
import { verifySkill } from "../skills/verify";
import { pathToFileURL } from 'url';
import { mcpBridge } from "../mcp";
import { SELF_ROOT, isCriticalFile, isWriteForbidden } from "../utils/selfRoot";
import { assertSandboxReady, markFileModified } from "../utils/sandbox";

// ─── Dynamic Tool Relevance Classifier (Optimisation Leanna #1) ───────────────
const TOOL_KEYWORDS: Record<string, string[]> = {
  git: ['git', 'commit', 'push', 'pull', 'branch', 'merge', 'rebase', 'diff', 'staging', 'stage', 'repository', 'repo', 'historique', 'version', 'clone', 'statut', 'status', 'modifié', 'modified', 'modification', 'changement', 'change', 'déployer', 'deploy'],
  github: ['github', 'pr', 'pull request', 'issue', 'repository', 'repo', 'fork', 'star', 'notification', 'release', 'workflow', 'actions'],
  automation: ['browser', 'navigate', 'web', 'site', 'scrape', 'click', 'screenshot', 'snapshot', 'automation', 'page', 'url', 'html', 'form', 'extract', 'inspect'],
  browser: ['navigateur', 'browser', 'ouvrir navigateur', 'open browser', 'browser_navigate', 'browser_search', 'browser_open', 'montrer site', 'afficher page', 'navigue vers', 'navigate to', 'recherche navigateur'],
  list: ['liste', 'list', 'todo', 'tache', 'task', 'shopping', 'item', 'checklist', 'ajouter', 'supprimer'],
  weather: ['meteo', 'weather', 'temperature', 'pluie', 'soleil', 'vent', 'prevision', 'forecast'],
  reasoning: ['raisonnement', 'reasoning', 'reflechir', 'think', 'planifier', 'analyse', 'critique', 'critic', 'brainstorm', 'idee', 'stratégie', 'strategy', 'solution', 'problem solving', 'résoudre', 'solve', 'étape', 'step', 'méthode', 'method'],
  history: ['historique', 'history', 'conversation', 'precedent', 'derniere', 'passe', 'recherche', 'search history', 'context'],
  system: ['systeme', 'system', 'fichier', 'commande', 'process', 'notifier', 'notification', 'ouvrir', 'open', 'executer', 'execute'],
  knowledge: ['knowledge', 'connaissance', 'contexte', 'context', 'impact', 'memoire projet', 'project memory', 'reindex', 'semantic', 'entite', 'entity', 'graph', 'convention', 'architecture', 'decision', 'comprendre', 'understand', 'analyse projet', 'project analysis', 'score', 'health', 'feedback', 'learning', 'lesson', 'pattern', 'dependency', 'diagram', 'couplage', 'coupling'],
  memory: ['memoire', 'memory', 'souvenir', 'preference', 'utilisateur', 'user', 'rappeler', 'remember', 'profil', 'profile', 'user profile', 'personnalité', 'personality', 'préférence', 'preference', 'habitude', 'habit'],
  time: ['heure', 'date', 'time', 'calendrier', 'calendar', 'jour', 'heure actuelle', 'today'],
  verify: ['verifier', 'verify', 'test', 'valider', 'validate', 'lint', 'typecheck', 'tsc', 'build', 'compiler', 'compile', 'syntaxe', 'syntax', 'erreur', 'error', 'warning', 'vérifier', 'check'],
  guidelines: ['guidelines', 'norme', 'standard', 'workflow', 'documentation', 'style', 'communication', 'convention'],
  mission: ['mission', 'plan', 'execute', 'tache complexe', 'complex task', 'orchestrer', 'subtask', 'objectif', 'goal', 'subgoal', 'sous-objectif', 'action', 'décomposer', 'decompose', 'réfléchir', 'réflexion', 'reflection'],
  agents: ['agent', 'deleguer', 'delegate', 'sous-agent', 'subagent', 'expert', 'architect', 'reviewer', 'testeur', 'rôle', 'role', 'spécialiste', 'specialist', 'parallel', 'parallèle', 'multitâche', 'multitask', 'collaborer', 'collaborate', 'collaboration', 'pattern', 'flotte', 'fleet', 'bus', 'message', 'délégation', 'autonome', 'autonomous', 'refactor-with-safety', 'security-audit-full', 'new-feature-complete', 'inter-agent', 'workflow agent', 'agents spécialisés'],
  codebase: ['fichier', 'file', 'lire', 'read', 'ecrire', 'write', 'modifier', 'modify', 'patch', 'recherche', 'search', 'codebase', 'explorateur', 'explorer', 'navigator', 'navigation', 'tree', 'listing', 'file tree', 'monaco', 'éditeur', 'editor'],
  documentLinker: ['document', 'pdf', 'résumé', 'résumer', 'synthèse', 'synthétiser', 'lien', 'connexion', 'croiser', 'comparer', 'analyser document', 'upload', 'fichier uploadé', 'multimodal', 'image', 'rapport', 'briefing', 'cross-document', 'inter-document'],
  richDocument: ['tableau', 'table', 'graphique', 'graph', 'chart', 'courbe', 'curve', 'camembert', 'pie', 'barres', 'bar', 'fiche', 'card', 'liste', 'list', 'visualiser', 'visualize', 'afficher', 'display', 'données', 'data', 'statistiques', 'stats', 'rapport', 'report', 'dashboard', 'kpi', 'indicateur', 'indicator', 'aire', 'area', 'document riche', 'rich document', 'présenter', 'present'],
  aiStudioDirectives: ['directive', 'directives', 'studio', 'ai studio', 'build', 'comportement', 'behavior', 'technique', 'technical', 'conception', 'design', 'tailwind', 'iframe', 'accessibilité', 'accessibility', 'intégration', 'integration', 'oauth', 'api key', 'port 3000', 'styling', 'enum', 'import'],
  project: ['projet', 'project', 'créer', 'create', 'nouveau projet', 'new project', 'scaffold', 'scaffolding', 'template', 'react', 'next', 'vite', 'react router', 'initialiser', 'init', 'bootstrap', 'starter', 'boilerplate'],
  custom_skills_proxy: ['skill', 'custom skill', 'compétence', 'outil perso', 'custom', 'mon skill', 'mes skills', 'skill perso', 'skill personnalisé', 'outil personnalisé', 'custom tool', 'user skill', 'utilisateur'],
  custom_skills_management: ['créer skill', 'create skill', 'ajouter skill', 'add skill', 'supprimer skill', 'delete skill', 'modifier skill', 'update skill', 'lister skills', 'list skills', 'gérer skills', 'manage skills', 'custom skill management'],
};

// ─── Découverte Dynamique des Skills (Lazy Loading) ──────────────────────────
// Skills chargés au démarrage (nécessaires au fonctionnement core + recherche).
const CRITICAL_SKILLS = [
  'agents',
  'mission',
  'codebase',
  'knowledge',
  'memory',
  'time',
  'reasoning',
  'automation',
  'verify',
  'system',
  'project',
  'aiStudioDirectives',
  'guidelines',
  'documentLinker',
  'documentKnowledge',
  'browser',
  'richDocument',
];
const CRITICAL_SKILL_SET = new Set(CRITICAL_SKILLS);

// Mapping catégorie → fichier de skill (pour le chargement paresseux).
// Les fichiers sont résolus relativement à __dirname_compat (server/skills/).
const LAZY_CATEGORIES: Record<string, string> = {
  git: 'git',
  github: 'github',
  automation: 'automation',
  list: 'list',
  weather: 'weather',
  history: 'history',
  system: 'system',
  verify: 'verify',
  guidelines: 'guidelines',
  project: 'project',
  aiStudioDirectives: 'aiStudioDirectives',
  browser: 'browser',
};

// Mapping inverse : nom de skill → catégorie (pour l'auto-découverte).
const SKILL_NAME_TO_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(LAZY_CATEGORIES).map(([cat, skillName]) => [skillName, cat])
);

// ── Imports statiques de tous les skills (fallback pour Electron/bundle) ──────
import { automationSkill } from "./automation";
import { browserSkill } from "./browser";
import { codebaseSkill } from "./codebase";
import { githubSkill } from "./github";
import { guidelinesSkill } from "./guidelines";
import { historySkill } from "./history";
import { knowledgeSkill } from "./knowledge";
import { listSkill } from "./list";
import { memorySkill } from "./memory";
import { reasoningSkill } from "./reasoning";
import { systemSkill } from "./system";
import { timeSkill } from "./time";
import { weatherSkill } from "./weather";
import { projectSkill } from "./project";
import { agentsSkill } from "./agents";
import { aiStudioDirectivesSkill } from "./aiStudioDirectives";
import { documentLinkerSkill } from "./documentLinker";
import { documentKnowledgeSkill } from "./documentKnowledge";
import { richDocumentSkill } from "./richDocument";
import { agentOrchestrator } from "../agents";
import { missionSkill, initMissionSystem, updateMissionSkills } from "./mission";
import { Executor } from "../mission";

// Map des skills statiques (fallback Electron) — utilisée par discoverAndLoad.
const STATIC_SKILLS: Record<string, Skill> = {
  automation: automationSkill,
  browser: browserSkill,
  codebase: codebaseSkill,
  git: gitSkill,
  github: githubSkill,
  guidelines: guidelinesSkill,
  history: historySkill,
  knowledge: knowledgeSkill,
  list: listSkill,
  memory: memorySkill,
  reasoning: reasoningSkill,
  system: systemSkill,
  time: timeSkill,
  verify: verifySkill,
  weather: weatherSkill,
  project: projectSkill,
  agents: agentsSkill,
  mission: missionSkill,
  aiStudioDirectives: aiStudioDirectivesSkill,
  documentLinker: documentLinkerSkill,
  document_knowledge: documentKnowledgeSkill,
  richDocument: richDocumentSkill,
};

// ── Compatibilité ESM/CJS pour __dirname ──────────────────────────────────────
// En bundle CJS, __filename et __dirname sont toujours disponibles.
// En ESM (tsx dev), __dirname n'existe pas — on déduit le dossier skills à partir
// de SELF_ROOT (qui est résolu via import.meta.url dans selfRoot.ts).
const __dirname_compat = typeof __dirname !== 'undefined'
  ? __dirname
  : path.join(SELF_ROOT, 'server', 'skills');

import { ERROR_PATTERNS, HealAttempt, ErrorPattern } from "./skillManagerRules";

// ═══════════════════════════════════════════════════════════════════════════════
// Audit log
// ═══════════════════════════════════════════════════════════════════════════════

interface SelfHealingSandboxTarget {
  relativePath: string;
  sandboxPath: string;
}

/**
 * L’auto-guérison ne peut modifier qu’une copie sandbox READY. Un chemin
 * absolu interne est d’abord ramené à SELF_ROOT, puis soumis au même garde
 * que les outils agent; tout chemin externe est donc rejeté.
 */
function resolveSelfHealingSandboxTarget(skillPath: string): SelfHealingSandboxTarget | null {
  if (!SELF_ROOT || !skillPath) return null;
  const absolute = path.isAbsolute(skillPath) || path.win32.isAbsolute(skillPath) || path.posix.isAbsolute(skillPath);
  const relativePath = absolute ? path.relative(SELF_ROOT, skillPath) : skillPath;
  const logicalPath = path.resolve(SELF_ROOT, relativePath);
  // L'auto-guérison n'a pas de canal de confirmation : aucun fichier critique
  // ou explicitement interdit ne peut être modifié, même dans le sandbox.
  if (isWriteForbidden(logicalPath) || isCriticalFile(logicalPath)) return null;
  try {
    return { relativePath, sandboxPath: assertSandboxReady(relativePath) };
  } catch {
    return null;
  }
}

const AUDIT_LOG_PATH = path.resolve(SELF_ROOT, '.Leanna-audit.log');
const MAX_AUDIT_SIZE = 500_000; // 500 KB

async function writeAuditLog(entry: HealAttempt): Promise<void> {
  try {
    const logLine = JSON.stringify({
      ...entry,
      timestamp: new Date(entry.timestamp).toISOString(),
    }) + '\n';

    // Rotation simple : si le log dépasse la taille max, tronquer la première moitié
    try {
      const stats = await fs.promises.stat(AUDIT_LOG_PATH);
      if (stats.size > MAX_AUDIT_SIZE) {
        const content = await fs.promises.readFile(AUDIT_LOG_PATH, 'utf-8');
        const lines = content.split('\n');
        const halfLines = lines.slice(Math.floor(lines.length / 2));
        await fs.promises.writeFile(AUDIT_LOG_PATH, halfLines.join('\n'), 'utf-8');
      }
    } catch {
      // Log file doesn't exist yet — will be created by appendFile below
    }

    await fs.promises.appendFile(AUDIT_LOG_PATH, logLine, 'utf-8');
  } catch {
    // L'audit ne doit jamais bloquer le fonctionnement principal
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Auto-Guerison: Interfaces pour l'analyse des erreurs d'outil
// ═══════════════════════════════════════════════════════════════════════════════

export interface ToolAlternativeProposal {
  type: 'existing_tool' | 'new_skill' | 'workaround';
  toolName?: string;
  skillName?: string;
  description: string;
  confidence: number;
  reasoning: string;
}

export interface ToolErrorAnalysis {
  errorMessage: string;
  errorType: string;
  failedTool: string;
  failedSkill?: string;
  proposals: ToolAlternativeProposal[];
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SkillManager
// ═══════════════════════════════════════════════════════════════════════════════

export class SkillManager {
  private skills: { instance: Skill; path: string }[] = [];

  /** File d'attente pour sérialiser les appels à discoverAndLoad (évite les races conditions) */
    private loadQueue: Promise<any> = Promise.resolve();

  /** Executor du Mission System (initialisé dans registerDynSkills) */
  public missionExecutor: Executor | null = null;

  /** Historique des tentatives de guérison (circulaire, max 50 entrées) */
  private healHistory: HealAttempt[] = [];
  private static readonly MAX_HEAL_HISTORY = 50;

  /** Compteur de tentatives par fichier pour éviter les boucles infinies */
  private healAttemptCounts = new Map<string, { count: number; lastAttempt: number }>();
  private static readonly MAX_HEAL_ATTEMPTS = 3;
  private static readonly HEAL_COOLDOWN_MS = 60_000; // 1 minute entre les tentatives

  /**
   * Mode lecture seule pour l'auto-guérison.
   * Par défaut: true (safe-by-default). Pour activer l'écriture automatique:
   * définir SELF_HEAL_READONLY=false dans .env.local
   */
  private static readonly READONLY = process.env.SELF_HEAL_READONLY !== 'false';

  /** Historique des analyses d'erreurs d'outils pour suivi et apprentissage */
  private toolErrorAnalyses: ToolErrorAnalysis[] = [];


  constructor() {
    // Enregistrer immédiatement le skill agents (synchrone, pas de race condition)
    this.registerDynSkill(agentsSkill, 'static:agents:early');
    
    this.registerDynSkills();

    // Wire workflow engine to invoke any registered skill
    setWorkflowSkillHandler((name, args) => this.handleToolCall(name, args));

    // Connecter l'AgentOrchestrator immédiatement (sera re-connecté dans registerDynSkills si besoin)
    agentOrchestrator.setSkillHandler((name: string, args: any) => this.handleToolCall(name, args));

    // Initialiser le bridge MCP et enregistrer ses outils comme skill
    this.initMcpBridge();
  }

  /**
   * Initialise le MCP Bridge et enregistre ses outils comme une skill dynamique.
   * Les outils MCP sont automatiquement disponibles pour l'IA via le SkillManager.
   */
  private async initMcpBridge(): Promise<void> {
    if (process.env.NODE_ENV === "test" || process.env.NODE_TEST_CONTEXT) {
      return;
    }
    try {
      await mcpBridge.initialize();
      // Attendre jusqu'à 3s que les serveurs MCP finissent leur connexion initiale
      await mcpBridge.waitForReady(3000);
      const mcpSkill = mcpBridge.toSkill();
      
      // Toujours enregistrer le skill MCP (le getter `declarations` est dynamique)
      // Cela garantit que les outils MCP seront disponibles dès qu'un serveur se connecte
      this.registerDynSkill(mcpSkill, 'mcp:bridge');
      console.log(`[SkillManager] MCP Bridge enregistré avec ${mcpSkill.declarations.length} outil(s)`);

      // Écouter les changements d'outils MCP pour mettre à jour dynamiquement
      mcpBridge.on('toolsChanged', () => {
        // Retirer l'ancienne skill MCP et re-enregistrer avec les outils à jour
        this.skills = this.skills.filter(s => s.path !== 'mcp:bridge');
        const updatedSkill = mcpBridge.toSkill();
        this.registerDynSkill(updatedSkill, 'mcp:bridge');
        console.log(`[SkillManager] MCP outils mis à jour: ${updatedSkill.declarations.length} outil(s)`);
      });
    } catch (err: any) {
      console.warn(`[SkillManager] MCP Bridge init warning:`, err.message);
    }
  }


  private async registerDynSkills() {
    // ── Découverte Dynamique : ne charger que les skills critiques au démarrage ──
    // Les autres skills sont chargés paresseusement via discoverAndLoad() ou
    // automatiquement quand l'IA appelle un outil non chargé (handleToolCall).
    // Bénéfice : démarrage plus rapide, moins de mémoire, flexibilité.

    const skillsDir = __dirname_compat;
    let dynamicLoaded = false;

    // Tenter le chargement dynamique des skills critiques uniquement (mode dev tsx)
    try {
      if (fs.existsSync(skillsDir)) {
        // Ne charger que les fichiers correspondant aux skills critiques
        const criticalFiles = Array.from(CRITICAL_SKILLS).map(name => `${name}.ts`);
        for (const file of criticalFiles) {
          try {
            const skillModule = await import(pathToFileURL(path.join(skillsDir, file)).href);
            const skillKey = Object.keys(skillModule).find(key => key.endsWith('Skill')) || 'default';
            const skill = skillModule[skillKey];
            if (skill && 'declarations' in skill && 'handleToolCall' in skill) {
              this.registerDynSkill(skill, path.join(skillsDir, file));
              dynamicLoaded = true;
            }
          } catch (error) {
            console.error(`[SkillManager] Erreur chargement dynamique skill critique ${file}:`, error);
          }
        }
      }
    } catch (e) {
      console.warn(`[SkillManager] Chargement dynamique impossible, utilisation du fallback statique.`);
    }

    // Fallback statique pour Electron/bundle (si pas de chargement dynamique possible)
    if (!dynamicLoaded || this.skills.length === 0) {
      console.log(`[SkillManager] Enregistrement statique des skills critiques (mode bundlé/Electron).`);
      for (const skillName of CRITICAL_SKILLS) {
        const skill = STATIC_SKILLS[skillName];
        if (skill && 'declarations' in skill && 'handleToolCall' in skill) {
          const alreadyRegistered = this.skills.some(s => s.instance.name === skill.name);
          if (!alreadyRegistered) {
            this.registerDynSkill(skill, `static:${skillName}`);
          }
        }
      }
    }

    console.log(`[SkillManager] ${this.skills.length} skill(s) critique(s) enregistrée(s) au démarrage: ${this.skills.map(s => s.instance.name).join(', ')}`);
    console.log(`[SkillManager] 📦 Skills disponibles en lazy-loading: ${Object.keys(LAZY_CATEGORIES).join(', ')}`);

    // ── Connecter l'AgentOrchestrator au système de skills ──────────────────
    agentOrchestrator.setSkillHandler((name: string, args: any) => this.handleToolCall(name, args));
    console.log(`[SkillManager] ✓ AgentOrchestrator connecté au système de skills.`);
    console.log(`[SkillManager]   Agents disponibles: test, docs, refactor, security, review, architect`);
    console.log(`[SkillManager]   Handler de skills injecté: ${this.skills.length} skill(s) accessibles aux agents`);

    // ── Initialiser le Mission System ───────────────────────────────────────
    const missionExecutor = new Executor();
    missionExecutor.setSkillHandler((name: string, args: any) => this.handleToolCall(name, args));
    const skillNames = this.getToolDeclarations().map((d: any) => d.name);
    initMissionSystem(missionExecutor, skillNames);
    this.missionExecutor = missionExecutor;
    console.log(`[SkillManager] ✓ Mission System initialisé (Planner + Executor + Reflection).`);

    // ── Charger les custom skills depuis la BDD ────────────────────────────
    this.loadCustomSkills();

    // ── Enregistrer les Smart Skills (boucle d'autonomie) ──────────────────
    try {
      const { createSmartSkills } = await import(pathToFileURL(path.join(__dirname_compat, '..', 'autonomy', 'SmartSkills.ts')).href);
      const smartSkill = createSmartSkills((name: string, args: any) => this.handleToolCall(name, args));
      this.registerDynSkill(smartSkill, 'autonomy:smart');
      console.log(`[SkillManager] ✓ Smart Skills enregistrés (validate_patch, read_until_understood, plan_code_change).`);
    } catch (e) {
      // Fallback statique
      try {
        const { createSmartSkills } = require('../autonomy/SmartSkills');
        const smartSkill = createSmartSkills((name: string, args: any) => this.handleToolCall(name, args));
        this.registerDynSkill(smartSkill, 'autonomy:smart');
        console.log(`[SkillManager] ✓ Smart Skills enregistrés (fallback statique).`);
      } catch (e2) {
        console.warn(`[SkillManager] ⚠️ Smart Skills non disponibles:`, (e2 as any)?.message);
      }
    }
  }

  /**
   * Charge les custom skills depuis Supabase et les enregistre comme une skill dynamique.
   * Appelé au démarrage et peut être rappelé pour rafraîchir.
   */
  public async loadCustomSkills(): Promise<void> {
    try {
      const { getCustomSkillDeclarations, handleCustomSkillCall, customSkillsManagementSkill } = await import("./customSkills");
      
      // Enregistrer le skill de gestion CRUD
      this.registerDynSkill(customSkillsManagementSkill, 'dynamic:customSkillsManagement');

      // Charger les declarations des custom skills actifs
      const declarations = await getCustomSkillDeclarations();
      if (declarations.length > 0) {
        const customSkillProxy: Skill = {
          name: "custom_skills_proxy",
          declarations,
          handleToolCall: async (name: string, args: any) => {
            return handleCustomSkillCall(name, args);
          },
        };
        this.registerDynSkill(customSkillProxy, 'dynamic:customSkillsProxy');
        console.log(`[SkillManager] ✓ ${declarations.length} custom skill(s) chargé(s) depuis la BDD.`);
      }
    } catch (err: any) {
      // Non critique — les custom skills ne bloquent pas le démarrage
      console.warn(`[SkillManager] Custom skills non chargés:`, err.message);
    }
  }

  // ─── Découverte Dynamique (Lazy Loading) ─────────────────────────────────

  /**
   * Charge paresseusement une catégorie de skill non encore chargée.
   * Utilisé par le meta-outil `request_tools` et par l'auto-découverte dans handleToolCall.
   *
   * @param category Nom de la catégorie (git, github, automation, list, weather,
   *                 history, system, verify, guidelines, selfImprovement) ou "all".
   * @returns Liste des noms d'outils nouvellement chargés.
   */
  public async discoverAndLoad(category: string): Promise<{ loaded: string[]; tools: string[] }> {
      return this.loadQueue = this.loadQueue.then(async () => {
        const cat = String(category || '').trim().toLowerCase();
        const categoriesToLoad: string[] = cat === 'all'
          ? Object.keys(LAZY_CATEGORIES)
          : [cat];

        const newlyLoadedSkills: string[] = [];
        const newlyLoadedTools: string[] = [];

        for (const c of categoriesToLoad) {
                  // Normalisation insensible à la casse : chercher la clé réelle dans LAZY_CATEGORIES
                  const exactKey = Object.keys(LAZY_CATEGORIES).find(k => k.toLowerCase() === c);
                  const skillName = exactKey ? LAZY_CATEGORIES[exactKey] : undefined;
                  if (!skillName) {
                    console.warn(`[SkillManager] discoverAndLoad: catégorie inconnue "${c}"`);
                    continue;
                  }

                  // Déjà chargé ? Skip
                  if (this.skills.some(s => s.instance.name === skillName)) {
                    continue;
                  }

                  const skill = STATIC_SKILLS[skillName];
                  if (!skill) {
                    console.warn(`[SkillManager] discoverAndLoad: skill statique introuvable pour "${c}"`);
                    continue;
                  }

                  // Tentative de chargement dynamique (mode dev tsx) puis fallback statique
                  const skillsDir = __dirname_compat;
                  let loaded = false;
                  try {
                    const file = `${skillName}.ts`;
                    if (fs.existsSync(path.join(skillsDir, file))) {
                      const skillModule = await import(pathToFileURL(path.join(skillsDir, file)).href);
                      const skillKey = Object.keys(skillModule).find(key => key.endsWith('Skill')) || 'default';
                      const dynSkill = skillModule[skillKey];
                      if (dynSkill && 'declarations' in dynSkill && 'handleToolCall' in dynSkill) {
                        this.registerDynSkill(dynSkill, path.join(skillsDir, file));
                        loaded = true;
                      }
                    }
                  } catch (error) {
                    console.warn(`[SkillManager] discoverAndLoad: chargement dynamique échoué pour "${c}", fallback statique.`, (error as Error).message);
                  }

                  if (!loaded) {
                    this.registerDynSkill(skill, `lazy:${c}`);
                  }

                  newlyLoadedSkills.push(skillName);
                  newlyLoadedTools.push(...skill.declarations.map((d: any) => d.name));
                  console.log(`[SkillManager] ⚡ Skill "${skillName}" chargé paresseusement (catégorie: ${c}).`);
                }

        // Mettre à jour le Mission System avec les nouveaux outils disponibles
        if (newlyLoadedTools.length > 0 && this.missionExecutor) {
          try {
            const allTools = this.getToolDeclarations().map((d: any) => d.name);
            updateMissionSkills(allTools);
          } catch {
            // Non critique
          }
        }

        return { loaded: newlyLoadedSkills, tools: newlyLoadedTools };
      });
    }

  /**
   * Tente de découvrir automatiquement le skill qui gère un outil non encore chargé.
   * Cherche parmi tous les skills lazy disponibles lequel déclare cet outil.
   * @returns true si l'outil a été trouvé et chargé, false sinon.
   */
  private async autoDiscoverForTool(toolName: string): Promise<boolean> {
    // D'abord chercher dans les skills statiques non encore chargés
    for (const [skillName, skill] of Object.entries(STATIC_SKILLS)) {
      // Skip si déjà chargé
      if (this.skills.some(s => s.instance.name === skillName)) continue;
      // Skip les skills critiques (déjà chargés au démarrage)
      if (CRITICAL_SKILL_SET.has(skillName)) continue;

      const hasTool = skill.declarations.some((d: any) => d.name === toolName);
      if (hasTool) {
        const category = SKILL_NAME_TO_CATEGORY[skillName] || skillName;
        console.log(`[SkillManager] 🔍 Auto-découverte: outil "${toolName}" trouvé dans skill "${skillName}" (catégorie: ${category}).`);
        await this.discoverAndLoad(category);
        return true;
      }
    }
    return false;
  }


  // ─── Protection anti-boucle ─────────────────────────────────────────────

  /**
   * Vérifie si un fichier peut être soumis à une tentative de guérison
   * (pas trop de tentatives récentes).
   */
  private canAttemptHeal(skillPath: string): boolean {
    const entry = this.healAttemptCounts.get(skillPath);
    if (!entry) return true;

    const now = Date.now();
    // Reset le compteur si le cooldown est passé
    if (now - entry.lastAttempt > SkillManager.HEAL_COOLDOWN_MS) {
      this.healAttemptCounts.delete(skillPath);
      return true;
    }

    return entry.count < SkillManager.MAX_HEAL_ATTEMPTS;
  }

  private recordHealAttempt(skillPath: string): void {
    const entry = this.healAttemptCounts.get(skillPath);
    if (entry) {
      entry.count++;
      entry.lastAttempt = Date.now();
    } else {
      this.healAttemptCounts.set(skillPath, { count: 1, lastAttempt: Date.now() });
    }
  }


  // ─── Rollback sandbox ───────────────────────────────────────────────────

  /**
   * Annule une auto-guérison dans le sandbox, sans jamais rétablir le dépôt
   * principal avec git checkout.
   */
  private async rollbackFile(relativePath: string, originalContent: string): Promise<boolean> {
    if (process.env.NODE_ENV === "test" || process.env.NODE_TEST_CONTEXT) {
      return true;
    }
    try {
      const sandboxPath = assertSandboxReady(relativePath);
      await fs.promises.writeFile(sandboxPath, originalContent, "utf-8");
      markFileModified(relativePath);
      console.log(`[Self-Healing] ✓ Rollback sandbox réussi pour ${path.basename(relativePath)}`);
      return true;
    } catch (rollbackError) {
      console.error("[Self-Healing] ✗ Échec du rollback sandbox:", rollbackError);
      return false;
    }
  }


  // ─── Analyse d'erreur ───────────────────────────────────────────────────

  /**
   * Analyse une erreur et tente de trouver un pattern connu avec un fix applicable.
   * Retourne le contenu corrigé ou null si aucun fix n'est applicable.
   */
  private analyzeAndFix(error: Error, fileContent: string, skillPath?: string): { patternId: string; fixedContent: string } | null {
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.match(error, fileContent)) {
        console.log(`[Self-Healing] Pattern détecté: ${pattern.id} — ${pattern.description}`);
        const fixed = pattern.fix(error, fileContent, skillPath);
        if (fixed && fixed !== fileContent) {
          return { patternId: pattern.id, fixedContent: fixed };
        }
        console.log(`[Self-Healing] Pattern "${pattern.id}" reconnu mais pas de fix automatique applicable.`);
        return null;
      }
    }
    console.log(`[Self-Healing] Aucun pattern connu ne correspond à l'erreur.`);
    return null;
  }


  // ─── Self-Healing principal ─────────────────────────────────────────────

  /**
   * Processus complet d'auto-guérison d'une skill en erreur.
   *
   * Workflow :
   * 1. Vérifier la protection anti-boucle
   * 2. Créer un checkpoint git
   * 3. Lire le fichier et analyser l'erreur
   * 4. Appliquer le fix si un pattern est reconnu
   * 5. Lancer verify_file pour valider
   * 6. Rollback si la vérification échoue
   * 7. Logger le résultat dans l'audit
   */
  public async selfHealSkill(skillPath: string, error: Error, context?: any): Promise<HealAttempt> {
    const attempt: HealAttempt = {
      skillPath,
      error: error.message,
      timestamp: Date.now(),
      success: false,
      patchApplied: null,
      verificationResult: null,
      rolledBack: false,
    };

    try {
      const sandboxTarget = resolveSelfHealingSandboxTarget(skillPath);
      if (!sandboxTarget) {
        console.warn(`[Self-Healing] Écriture refusée : ${skillPath} ne cible pas un sandbox READY.`);
        attempt.patchApplied = "SKIPPED: sandbox non prêt ou chemin hors périmètre";
        this.recordAttempt(attempt);
        return attempt;
      }
      const { relativePath, sandboxPath } = sandboxTarget;
      attempt.skillPath = relativePath;

      // 1. Protection anti-boucle
      if (!this.canAttemptHeal(relativePath)) {
        console.warn(`[Self-Healing] ⚠ Trop de tentatives récentes sur ${path.basename(relativePath)}, abandon.`);
        attempt.patchApplied = "SKIPPED: trop de tentatives récentes";
        this.recordAttempt(attempt);
        return attempt;
      }
      this.recordHealAttempt(relativePath);

      // Le sandbox permet le rollback local : aucun checkpoint git ni écriture
      // dans le dépôt principal ne sont nécessaires.

      // 2. Lire le fichier sandbox et analyser l'erreur
      let fileContent: string;
      try {
        fileContent = await fs.promises.readFile(sandboxPath, 'utf-8');
      } catch (readError) {
        console.error(`[Self-Healing] ✗ Impossible de lire ${relativePath}:`, readError);
        attempt.patchApplied = "SKIPPED: fichier illisible";
        this.recordAttempt(attempt);
        return attempt;
      }


      // 3b. Tenter la guérison par IA générative (si patterns échouent ou en première intention)
      console.log(`[Self-Healing] Tentative de réparation par IA avancée...`);
      let aiFixedContent: string | null = null;
      let aiExplanation: string | null = null;

      try {
        const reasoningPrompt = `Je suis en train de faire de l'auto-guérison sur moi-même.
Une erreur est survenue dans le fichier suivant : ${path.basename(skillPath)}

Message d'erreur : ${error.message}
Stack Trace : ${error.stack || 'Non disponible'}

Contenu actuel du fichier :
\`\`\`typescript
${fileContent}
\`\`\`

Analyse la situation et propose un patch de remplacement COMPLET pour ce fichier afin de corriger l'erreur de manière stable et sécurisée. Ne propose QUE du code, sans blabla autour.`;

        const reasoningResult = await reasoningSkill.handleToolCall("reasoning_think", {
          prompt: reasoningPrompt,
          strategy: 'auto'
        }, context);

        if (reasoningResult?.thought && reasoningResult?.answer) {
          // Extraire le code de la réponse (on suppose que c'est du code brut ou dans un bloc de code)
          const codeMatch = reasoningResult.answer.match(/```(?:typescript|javascript)?\n([\s\S]*?)```/) || [null, reasoningResult.answer];
          aiFixedContent = codeMatch[1].trim();
          aiExplanation = reasoningResult.thought;
        }
      } catch (aiError: any) {
        console.error(`[Self-Healing] ✗ Échec de l'IA générative:`, aiError.message);
      }

      // 3c. Choisir entre IA et patterns
      let fixedContentToApply = aiFixedContent;
      let usedPatternId = aiFixedContent ? "AI_GENERATIVE" : null;

      if (!fixedContentToApply) {
        const fixResult = this.analyzeAndFix(error, fileContent, relativePath);
        if (fixResult) {
          fixedContentToApply = fixResult.fixedContent;
          usedPatternId = fixResult.patternId;
        }
      }

      if (!fixedContentToApply) {
        console.log(`[Self-Healing] Aucun fix automatique trouvé (IA ou patterns) pour: ${error.message.slice(0, 100)}`);
        attempt.patchApplied = "NONE: échec IA et patterns";
        this.recordAttempt(attempt);
        return attempt;
      }

      // 4. Appliquer le fix (ou simuler si mode readonly)
      if (SkillManager.READONLY) {
        // Mode lecture seule : analyser sans écrire
        const fixSummary = `Fix "${usedPatternId}" sur ${path.basename(skillPath)} — aucune écriture (SELF_HEAL_READONLY=true)`;
        console.log(`[Self-Healing] 🔒 Mode lecture seule — fix NON appliqué (via: ${usedPatternId})`);
        console.log(`[Self-Healing] 💡 Fix proposé: ${fixSummary}`);
        if (aiExplanation) console.log(`[Self-Healing] 🧠 Raisonnement IA: ${aiExplanation.slice(0, 200)}...`);

        attempt.patchApplied = `DRY_RUN:${usedPatternId}`;
        attempt.dryRun = true;
        attempt.proposedFix = fixSummary;
        attempt.aiThought = aiExplanation;
        this.recordAttempt(attempt);
        return attempt;
      }

      console.log(`[Self-Healing] Application du fix (via: ${usedPatternId})...`);
      // Revalider immédiatement avant l'écriture afin de refuser un changement
      // de projet ou de cycle de vie intervenu pendant l'analyse asynchrone.
      const currentSandboxPath = assertSandboxReady(relativePath);
      if (currentSandboxPath !== sandboxPath) {
        throw new Error("Sandbox modifié pendant l'auto-guérison.");
      }
      await fs.promises.writeFile(currentSandboxPath, fixedContentToApply, "utf-8");
      markFileModified(relativePath);
      attempt.patchApplied = usedPatternId;
      attempt.aiThought = aiExplanation;
      // 5. Vérification via verify_file
      console.log(`[Self-Healing] Lancement de verify_file pour ${relativePath}...`);

      let verifyResult: any;
      try {
        verifyResult = await verifySkill.handleToolCall("verify_file", { path: relativePath }, context);
        attempt.verificationResult = verifyResult;
      } catch (verifyError: any) {
        console.error(`[Self-Healing] ✗ Erreur lors de verify_file:`, verifyError);
        attempt.verificationResult = { error: verifyError.message };
        verifyResult = { status: "failed" };
      }
      // 6. Évaluer le résultat
      if (verifyResult?.status === "success") {
        console.log(`[Self-Healing] ✓ Fix validé avec succès !`);
        attempt.success = true;
        // [auto-heal] Désactivé temporairement pour éviter la création de commits pendant les tests
        /*
        try {
          await gitSkill.handleToolCall("git_stage", { files: [skillPath] }, context);
          await gitSkill.handleToolCall("git_commit", {
            message: `[auto-heal] fix appliqué: ${fixResult.patternId} sur ${path.basename(skillPath)}`
          }, context);
        } catch {
          // Non critique — le fix est appliqué même sans commit
        }
        */
      } else {
        // Échec de vérification → rollback
        console.warn(`[Self-Healing] ✗ Vérification échouée, rollback en cours...`);
        const rolledBack = await this.rollbackFile(relativePath, fileContent);
        attempt.rolledBack = rolledBack;
        if (!rolledBack) {
          console.error("[Self-Healing] Restauration refusée : sandbox non prêt ou chemin devenu invalide.");
        }
      }
    } catch (healError: any) {
      console.error(`[Self-Healing] Exception inattendue:`, healError.message);
      attempt.patchApplied = `ERROR: ${healError.message}`;
    }

    this.recordAttempt(attempt);
    return attempt;
  }

  private recordAttempt(attempt: HealAttempt): void {
    this.healHistory.push(attempt);
    if (this.healHistory.length > SkillManager.MAX_HEAL_HISTORY) {
      this.healHistory.shift();
    }
    writeAuditLog(attempt);
  }


  // ─── Dynamic Relevance Scoring (Optimisation Leanna #1) ──────────────────

  private scoreSkillRelevance(skillName: string, query: string): number {
    const q = query.toLowerCase();
    const keywords = TOOL_KEYWORDS[skillName] || [];
    let score = 0;
    for (const kw of keywords) {
      if (q.includes(kw)) score += Math.max(1, Math.round(10 / kw.length));
    }
    if (score > 0 && this.usageHistory?.has(skillName)) {
      const h = this.usageHistory.get(skillName)!;
      if (h.totalCalls > 0) score += 2;
      if (h.successCount / Math.max(1, h.totalCalls) > 0.8) score += 2;
    }
    return score;
  }

  private usageHistory: Map<string, { successCount: number; totalCalls: number }> | null = null;

  public recordToolUsage(toolName: string, success: boolean): void {
    if (!this.usageHistory) this.usageHistory = new Map();
    const skillEntry = this.skills.find(s => s.instance.declarations.some(d => d.name === toolName));
    if (!skillEntry) return;
    const skillName = skillEntry.instance.name;
    const current = this.usageHistory.get(skillName) ?? { successCount: 0, totalCalls: 0 };
    current.totalCalls++;
    if (success) current.successCount++;
    this.usageHistory.set(skillName, current);
  }

  /**
   * Retourne les déclarations d'outils filtrées par pertinence pour une requête donnée.
   * Combine: Tier 1 (toujours), Tier 2 si pertinence > seuil + meta-outil request_tools.
   * Gain estimé: ~9000 tokens vs chargement complet.
   */
  getRelevantToolDeclarations(query: string, enabledSkillIds?: string[]): {
    declarations: any[];
    scoredSkills: { name: string; score: number }[];
    alwaysLoaded: string[];
    dynamicallyLoaded: string[];
  } {
    const ALWAYS_LOADED_SKILLS = new Set([
      'codebase',
      'knowledge',
      'memory',
      'time',
      'reasoning',
      'agents',
      'browser',
      'system',
      'verify',
      'custom_skills_proxy',
      'custom_skills_management',
    ]);

    const RELEVANCE_THRESHOLD = 3;

    const filteredSkills = this.skills.filter(s =>
      !enabledSkillIds || enabledSkillIds.includes(s.instance.name)
    );

    const always: any[] = [];
    const dynamic: any[] = [];
    const scored: { name: string; score: number }[] = [];

    for (const s of filteredSkills) {
      const sName = s.instance.name;
      const relevance = this.scoreSkillRelevance(sName, query);
      scored.push({ name: sName, score: relevance });

      if (ALWAYS_LOADED_SKILLS.has(sName)) {
        always.push(...s.instance.declarations.map(d => this.normalizeDeclaration(d)));
      } else if (relevance >= RELEVANCE_THRESHOLD) {
        dynamic.push(...s.instance.declarations.map(d => this.normalizeDeclaration(d)));
      }
    }

    const requestToolsDecl = {
      name: 'request_tools',
      description: `Demande le chargement d'outils supplémentaires par catégorie: "git", "github", "automation", "lists", "weather", "reasoning", "history", "system", "knowledge", "verify", "guidelines", "all". Les outils sont réellement chargés en mémoire et deviennent disponibles immédiatement.`,
      parameters: {
        type: 'OBJECT',
        properties: {
          category: {
            type: 'STRING',
            description: 'Catégorie d\'outils à charger: "git", "github", "automation", "lists", "weather", "reasoning", "history", "system", "knowledge", "verify", "guidelines", "all"',
          },
        },
        required: ['category'],
      },
    };

    const declarations = [...always, ...dynamic, requestToolsDecl];
    const alwaysLoaded = filteredSkills
      .filter(s => ALWAYS_LOADED_SKILLS.has(s.instance.name))
      .map(s => s.instance.name);
    const dynamicallyLoaded = filteredSkills
      .filter(s => !ALWAYS_LOADED_SKILLS.has(s.instance.name) && this.scoreSkillRelevance(s.instance.name, query) >= RELEVANCE_THRESHOLD)
      .map(s => s.instance.name);

    return {
      declarations,
      scoredSkills: scored.sort((a, b) => b.score - a.score),
      alwaysLoaded,
      dynamicallyLoaded,
    };
  }

  // ─── API publique ───────────────────────────────────────────────────────

  /**
   * Les déclarations destinées aux providers doivent être du JSON Schema,
   * jamais des instances Zod (qui exposent notamment `_def`).
   */
  private normalizeToolParameters(parameters: any): Record<string, unknown> {
    if (!parameters || typeof parameters !== 'object') return {};
    if (!parameters._def) return this.stripPrivateSchemaFields(parameters) as Record<string, unknown>;

    const definition = parameters._def as any;
    const shape = typeof definition.shape === 'function' ? definition.shape() : definition.shape;
    if (!shape || typeof shape !== 'object') return { type: 'OBJECT', properties: {} };

    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, schema] of Object.entries(shape as Record<string, any>)) {
      const field = schema as any;
      const fieldDef = field?._def;
      const typeName = fieldDef?.typeName || '';
      const isOptional = typeName === 'ZodOptional' || typeName === 'ZodDefault' || typeName === 'ZodNullable';
      const inner = isOptional ? fieldDef.innerType || fieldDef.type : field;
      const innerDef = inner?._def || {};
      const innerType = innerDef.typeName || '';
      let type = 'STRING';
      if (innerType === 'ZodNumber') type = 'NUMBER';
      else if (innerType === 'ZodBoolean') type = 'BOOLEAN';
      else if (innerType === 'ZodArray') type = 'ARRAY';
      else if (innerType === 'ZodObject' || innerType === 'ZodRecord') type = 'OBJECT';
      else if (innerType === 'ZodEnum' || innerType === 'ZodLiteral') type = 'STRING';
      properties[key] = { type };
      if (!isOptional) required.push(key);
    }

    return { type: 'OBJECT', properties, ...(required.length ? { required } : {}) };
  }

  /** Supprime toute propriété interne susceptible d'être envoyée au provider. */
  private stripPrivateSchemaFields(value: any): any {
    if (Array.isArray(value)) return value.map(item => this.stripPrivateSchemaFields(item));
    if (!value || typeof value !== 'object') return value;
    const clean: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === '_def' || key.startsWith('_')) continue;
      clean[key] = this.stripPrivateSchemaFields(item);
    }
    return clean;
  }

  private normalizeDeclaration(declaration: any): any {
    // Gemini function declarations n'acceptent que ces trois champs.
    // Les métadonnées internes (examples, category, mutating, etc.) restent
    // disponibles dans les skills mais ne doivent jamais atteindre le provider.
    return {
      name: String(declaration?.name || ''),
      description: String(declaration?.description || ''),
      parameters: this.normalizeToolParameters(declaration?.parameters),
    };
  }

  getToolDeclarations(enabledSkillIds?: string[]) {
    return this.skills
      .filter(s => !enabledSkillIds || enabledSkillIds.includes(s.instance.name))
      .flatMap(s => s.instance.declarations.map(d => this.normalizeDeclaration(d)));
  }

  registerDynSkill(skill: Skill, skillPath: string) {
    // Éviter les doublons — si un skill avec le même nom existe déjà, le remplacer
    const existingIdx = this.skills.findIndex(s => s.instance.name === skill.name);
    if (existingIdx >= 0) {
      this.skills[existingIdx] = { instance: skill, path: skillPath };
      return;
    }
    this.skills.push({ instance: skill, path: skillPath });
  }

  /** Retourne l'historique récent des tentatives d'auto-guérison */
  getHealHistory(): HealAttempt[] {
    return [...this.healHistory];
  }

  /** Retourne les statistiques de guérison */
  getHealStats(): { total: number; success: number; failed: number; rolledBack: number } {
    const total = this.healHistory.length;
    const success = this.healHistory.filter(h => h.success).length;
    const rolledBack = this.healHistory.filter(h => h.rolledBack).length;
    return { total, success, failed: total - success, rolledBack };
  }

  /**
   * Analyse une erreur d'outil et propose des alternatives stratégiques.
   * Plutôt que de simplement réparer le fichier, cette méthode tentera de:
   * 1. Trouver un outil similaire existant
   * 2. Proposer la création d'une nouvelle skill si nécessaire
   * 3. Suggérer des solutions de contournement
   */
  async analyzeToolErrorAndProposeAlternatives(
    toolName: string,
    error: Error,
    skillPath?: string
  ): Promise<ToolErrorAnalysis> {
    const analysis: ToolErrorAnalysis = {
      errorMessage: error.message,
      errorType: this.classifyErrorType(error),
      failedTool: toolName,
      failedSkill: skillPath ? path.basename(skillPath) : undefined,
      proposals: [],
      timestamp: Date.now(),
    };

    // 1. Analyser l'erreur pour comprendre le problème
    const errorContext = this.extractErrorContext(error, toolName);

    // 2. Chercher des outils similaires existants
    const similarTools = this.findSimilarTools(toolName);
    
    if (similarTools.length > 0) {
      similarTools.forEach(similarTool => {
        analysis.proposals.push({
          type: 'existing_tool',
          toolName: similarTool.name,
          skillName: similarTool.skillName,
          description: `Utiliser l'outil similaire '${similarTool.name}' depuis la skill '${similarTool.skillName}'`,
          confidence: similarTool.similarityScore,
          reasoning: `L'outil '${similarTool.name}' a des fonctionnalités similaires basées sur l'analyse des mots-clés et des déclarations`,
        });
      });
    }

    // 3. Proposer la création d'une nouvelle skill si l'outil semble manquant
    if (error.message.includes('unknown tool') || error.message.includes('not found') || 
        error.message.includes('ucune skill') || error.message.includes('unavailable')) {
      
      const skillCategory = this.suggestSkillCategoryForTool(toolName);
      if (skillCategory) {
        analysis.proposals.push({
          type: 'new_skill',
          skillName: skillCategory,
          description: `Créer une nouvelle skill '${skillCategory}' pour gérer cet outil`,
          confidence: 0.8,
          reasoning: `L'erreur indique que l'outil est inconnu. Sur la base des mots-clés, il pourrait appartenir à la catégorie '${skillCategory}'`,
        });
      }
    }

    // 4. Proposer des solutions de contournement basées sur le type d'erreur
    const workarounds = this.suggestWorkarounds(error, toolName);
    analysis.proposals.push(...workarounds);

    // 5. Trier les propositions par confiance
    analysis.proposals.sort((a, b) => b.confidence - a.confidence);

    // Limiter à max 5 propositions
    if (analysis.proposals.length > 5) {
      analysis.proposals = analysis.proposals.slice(0, 5);
    }

    console.log(`[Auto-Guerison] Analyse complète pour l'outil '${toolName}':`, {
      errorType: analysis.errorType,
      proposalCount: analysis.proposals.length,
      topProposal: analysis.proposals[0]?.type,
    });

    return analysis;
  }

  /**
   * Stocke une analyse d'erreur d'outil pour consultation ultérieure
   * Permet de suivre les erreurs récurrentes et d'identifier les patterns
   */
  private storeToolErrorAnalysis(analysis: ToolErrorAnalysis): void {
    // Stocker dans l'historique (on pourrait aussi persister dans un fichier)
    this.toolErrorAnalyses.push(analysis);
    
    // Limiter la taille de l'historique
    if (this.toolErrorAnalyses.length > 20) {
      this.toolErrorAnalyses.shift();
    }
    
    console.log(`[Auto-Guerison] Analyse stockée pour '${analysis.failedTool}' (type: ${analysis.errorType})`);
  }

  /**
   * Retourne l'historique des analyses d'erreurs d'outils
   */
  getToolErrorAnalyses(): ToolErrorAnalysis[] {
    return [...this.toolErrorAnalyses];
  }

  /**
   * Analyse proactivement un outil et propose des alternatives (méthode publique)
   * Peut être appelée par l'IA pour obtenir des suggestions avant d'essayer un outil
   */
  async analyzeToolProactively(toolName: string, description?: string): Promise<ToolErrorAnalysis> {
    // Créer une faux erreur pour utiliser la même logique
    const mockError = new Error(
      description || `Analyse proactive demandée pour l'outil: ${toolName}`
    );
    
    // Appeler l'analyse avec l'outil et une pseudo-erreur
    return this.analyzeToolErrorAndProposeAlternatives(toolName, mockError);
  }

  /**
   * Retourne les propositions d'alternatives pour un outil donné (sans erreur)
   * Utile pour la découverte et la suggestion d'outils
   */
  async getToolAlternatives(toolName: string): Promise<ToolAlternativeProposal[]> {
    const mockError = new Error(`Recherche d'alternatives pour: ${toolName}`);
    const analysis = await this.analyzeToolErrorAndProposeAlternatives(toolName, mockError);
    return analysis.proposals;
  }

  /** Classifie le type d'erreur pour un meilleur traitement */
  private classifyErrorType(error: Error): string {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    if (message.includes('unknown tool') || message.includes('not found') || 
        message.includes('ucune skill')) {
      return 'TOOL_NOT_FOUND';
    } else if (message.includes('permission') || message.includes('access') || 
               message.includes('forbidden') || message.includes('refusé')) {
      return 'PERMISSION_ERROR';
    } else if (message.includes('timeout') || message.includes('timed out')) {
      return 'TIMEOUT_ERROR';
    } else if (message.includes('network') || message.includes('fetch') || 
               message.includes('http') || message.includes('connection')) {
      return 'NETWORK_ERROR';
    } else if (stack.includes('typeerror') || message.includes('not a function') ||
               message.includes('undefined')) {
      return 'IMPLEMENTATION_ERROR';
    } else if (message.includes('syntax') || stack.includes('syntaxerror')) {
      return 'SYNTAX_ERROR';
    } else if (message.includes('validation') || message.includes('invalid')) {
      return 'VALIDATION_ERROR';
    } else if (message.includes('rate limit') || message.includes('too many')) {
      return 'RATE_LIMIT_ERROR';
    } else {
      return 'GENERIC_ERROR';
    }
  }

  /** Extrait le contexte de l'erreur pour une meilleure analyse */
  private extractErrorContext(error: Error, toolName: string): Record<string, any> {
    return {
      toolName,
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5).join('\n') || '',
      type: this.classifyErrorType(error),
      isNotFound: error.message.toLowerCase().includes('unknown') || 
                  error.message.toLowerCase().includes('not found') ||
                  error.message.toLowerCase().includes('ucune skill'),
    };
  }

  /**
   * Cherche des outils similaires dans les skills existantes
   * Utilise l'analyse sémantique des noms d'outils et des mots-clés
   */
  private findSimilarTools(toolName: string): Array<{ name: string; skillName: string; similarityScore: number }> {
    const similarTools: Array<{ name: string; skillName: string; similarityScore: number }> = [];
    const toolLower = toolName.toLowerCase();
    const toolParts = toolLower.split('_').filter(p => p.length > 2);

    // Parcourir toutes les skills et leurs outils
    for (const skillItem of this.skills) {
      const skillName = skillItem.instance.name;
      const declarations = skillItem.instance.declarations || [];

      for (const declaration of declarations) {
        const declarationName = declaration.name || '';
        const declarationLower = declarationName.toLowerCase();
        const declarationParts = declarationLower.split('_').filter(p => p.length > 2);

        // Calculer un score de similarité simple
        let similarityScore = 0;

        // Match exact (mais différent outil)
        if (declarationLower === toolLower) {
          continue; // C'est le même outil, on passe
        }

        // Match partiel
        const commonParts = toolParts.filter(part => declarationParts.includes(part));
        similarityScore += commonParts.length * 0.3;

        // Similarité de préfixe/suffixe
        if (declarationLower.startsWith(toolLower.slice(0, Math.min(toolLower.length, 8)))) {
          similarityScore += 0.4;
        }
        if (toolLower.startsWith(declarationLower.slice(0, Math.min(declarationLower.length, 8)))) {
          similarityScore += 0.4;
        }

        // Vérifier si les outils appartiennent à la même catégorie sémantique
        const toolCategory = this.getToolCategory(toolName);
        const declarationCategory = this.getToolCategory(declarationName);
        if (toolCategory && declarationCategory && toolCategory === declarationCategory) {
          similarityScore += 0.3;
        }

        // Si le score est suffisant, ajouter à la liste
        if (similarityScore >= 0.3) {
          similarTools.push({
            name: declarationName,
            skillName: skillName,
            similarityScore: Math.min(similarityScore, 0.99), // Limiter à < 1.0
          });
        }
      }
    }

    // Trier par score de similarité
    similarTools.sort((a, b) => b.similarityScore - a.similarityScore);

    // Retourner les top 3
    return similarTools.slice(0, 3);
  }

  /**
   * Détermine la catégorie sémantique d'un outil basé sur les mots-clés
   */
  private getToolCategory(toolName: string): string | null {
    const toolLower = toolName.toLowerCase();
    
    for (const [category, keywords] of Object.entries(TOOL_KEYWORDS)) {
      for (const keyword of keywords) {
        if (toolLower.includes(keyword.toLowerCase())) {
          return category;
        }
      }
    }
    return null;
  }

  /**
   * Suggère une catégorie de skill pour un nouvel outil
   */
  private suggestSkillCategoryForTool(toolName: string): string | null {
    return this.getToolCategory(toolName);
  }

  /**
   * Suggère des solutions de contournement basées sur le type d'erreur
   */
  private suggestWorkarounds(error: Error, toolName: string): ToolAlternativeProposal[] {
    const workarounds: ToolAlternativeProposal[] = [];
    const errorType = this.classifyErrorType(error);
    const toolLower = toolName.toLowerCase();

    switch (errorType) {
      case 'TOOL_NOT_FOUND':
        workarounds.push({
          type: 'workaround',
          description: `Vérifier si l'outil '${toolName}' existe avec une autre casse ou format`,
          confidence: 0.6,
          reasoning: `Certains outils peuvent être appelés avec des variations de nom (camelCase, snake_case)`,
        });
        break;

      case 'PERMISSION_ERROR':
        workarounds.push({
          type: 'workaround',
          description: `Vérifier les permissions pour l'outil '${toolName}'`,
          confidence: 0.7,
          reasoning: `L'erreur de permission peut être résolue en ajustant les autorisations`,
        });
        break;

      case 'TIMEOUT_ERROR':
        workarounds.push({
          type: 'workaround',
          description: `Réessayer l'appel avec un timeout plus long`,
          confidence: 0.5,
          reasoning: `Les erreurs de timeout peuvent être temporaires`,
        });
        break;

      case 'NETWORK_ERROR':
        workarounds.push({
          type: 'workaround',
          description: `Vérifier la connexion réseau et réessayer`,
          confidence: 0.6,
          reasoning: `Les erreurs réseau sont souvent temporaires`,
        });
        break;

      case 'IMPLEMENTATION_ERROR':
        workarounds.push({
          type: 'workaround',
          description: `L'outil peut avoir un bug d'implémentation, vérifier les logs pour plus de détails`,
          confidence: 0.4,
          reasoning: `Les erreurs d'implémentation nécessitent souvent une correction de code`,
        });
        break;

      case 'RATE_LIMIT_ERROR':
        workarounds.push({
          type: 'workaround',
          description: `Attendre avant de réessayer (rate limit atteint)`,
          confidence: 0.8,
          reasoning: `Les erreurs de rate limit sont temporaires`,
        });
        break;

      default:
        // Suggestions générales
        if (toolLower.includes('git') || toolLower.includes('repository')) {
          workarounds.push({
            type: 'workaround',
            description: `Vérifier que le dépôt git est dans un état valide`,
            confidence: 0.5,
            reasoning: `Les opérations git nécessitent un dépôt valide`,
          });
        }
        if (toolLower.includes('file') || toolLower.includes('fichier')) {
          workarounds.push({
            type: 'workaround',
            description: `Vérifier que le fichier existe et est accessible`,
            confidence: 0.5,
            reasoning: `Les opérations sur fichiers nécessitent des chemins valides`,
          });
        }
    }

    return workarounds;
  }

  async handleToolCall(name: string, args: any, context?: any) {
        // Normalisation : certains providers (Gemini) préfixent le nom d'outil
        // avec le nom du skill (ex: "selfImprovement:scan_for_improvements" ou
        // "selfImprovement_scan_for_improvements" avec underscore).
        let normalizedName = name;
        if (name.includes(':')) {
          normalizedName = name.split(':').pop()!;
        } else if (!this.skills.some(s => s.instance.declarations.some(d => d.name === name))) {
          // Si le nom brut ne correspond à aucune déclaration, tenter de détecter
          // un préfixe de skill avec underscore (ex: "selfImprovement_scan_for_improvements").
          for (const skillItem of this.skills) {
            const prefix = skillItem.instance.name + '_';
            if (name.startsWith(prefix)) {
              const stripped = name.slice(prefix.length);
              if (skillItem.instance.declarations.some(d => d.name === stripped)) {
                normalizedName = stripped;
                break;
              }
            }
          }
        }

      for (const skillItem of this.skills) {
        if (skillItem.instance.declarations.some(d => d.name === normalizedName)) {
          try {
            return await skillItem.instance.handleToolCall(normalizedName, args, context);
          } catch (error) {
            console.error(`[SkillManager] Erreur dans ${normalizedName} (${path.basename(skillItem.path)}):`, (error as Error).message);

            // Nouvel mécanisme d'auto-guérison avancé : analyser et proposer des alternatives
            this.analyzeToolErrorAndProposeAlternatives(normalizedName, error as Error, skillItem.path)
              .then((analysis) => {
                // Si des alternatives existent, les proposer
                if (analysis.proposals && analysis.proposals.length > 0) {
                  console.log(`[Auto-Guerison] 💡 Propositions d'alternatives pour '${normalizedName}':`);
                  analysis.proposals.forEach((proposal, index) => {
                    console.log(`  ${index + 1}. [${proposal.type}] ${proposal.description} (confiance: ${(proposal.confidence * 100).toFixed(0)}%)`);
                    console.log(`     → Raison: ${proposal.reasoning}`);
                  });
                  
                  // Stocker l'analyse pour consultation ultérieure
                  this.storeToolErrorAnalysis(analysis);
                }
                
                // Lancer aussi la réparation classique du fichier
                return this.selfHealSkill(skillItem.path, error as Error, context);
              })
              .catch((analysisErr) => {
                console.error(`[Auto-Guerison] Échec de l'analyse des alternatives:`, analysisErr);
                // Si l'analyse échoue, lancer la réparation classique
                return this.selfHealSkill(skillItem.path, error as Error, context);
              })
              .then((healResult) => {
                if (!healResult.success) {
                  console.warn(`[Auto-Guerison] La tentative de réparation a échoué. Consultez les propositions d'alternatives ci-dessus.`);
                }
              })
              .catch((healErr) => {
                console.error(`[Self-Healing] Échec complet du processus:`, healErr);
              });

            throw error;
          }
        }
      }

      // ── Auto-découverte : l'outil n'est pas chargé, chercher dans les skills lazy ──
      // Cela permet de charger automatiquement le skill qui gère cet outil à la volée.
      try {
        const discovered = await this.autoDiscoverForTool(normalizedName);
        if (discovered) {
          // Le skill est maintenant chargé, réessayer l'appel
          for (const skillItem of this.skills) {
            if (skillItem.instance.declarations.some(d => d.name === normalizedName)) {
              return await skillItem.instance.handleToolCall(normalizedName, args, context);
            }
          }
        }
      } catch (discoverErr) {
        console.warn(`[SkillManager] Auto-découverte échouée pour "${normalizedName}":`, (discoverErr as Error).message);
      }

      // Fallback: tenter un rechargement des custom skills si l'outil commence par "custom_"
      if (normalizedName.startsWith('custom_')) {
        try {
          await this.loadCustomSkills();
          for (const skillItem of this.skills) {
            if (skillItem.instance.declarations.some(d => d.name === normalizedName)) {
              return await skillItem.instance.handleToolCall(normalizedName, args, context);
            }
          }
        } catch {
          // Ignore
        }
      }

      throw new Error(`Outil inconnu: ${normalizedName}. Aucune skill enregistrée ne gère cet outil.`);
    }
}