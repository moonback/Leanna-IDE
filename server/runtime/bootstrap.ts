/**
 * Bootstrap — Initialisation du nouveau runtime avec les skills existantes
 * 
 * Ce fichier remplace les ~120 lignes d'initialisation chaînée de server.ts
 * par une séquence claire et testable.
 * 
 * Usage dans server.ts :
 *   import { bootstrapRuntime } from "./server/runtime/bootstrap.js";
 *   const { runtime, skillManager } = await bootstrapRuntime();
 * 
 * L'ancien server.ts peut continuer à utiliser `skillManager.handleToolCall()`
 * comme avant — mais en interne ça passe par le ToolRegistry.
 */

import { AgentRuntime } from "./AgentRuntime.js";
import { SkillManagerV2 } from "./compat/SkillManagerV2.js";
import { PromptRegistry } from "./PromptRegistry.js";
import { PermissionPolicy } from "./PermissionPolicy.js";
import { DryRunController } from "./DryRun.js";
import { loadPromptTemplates } from "./prompts/loader.js";
import { defaultAgents } from "./agents/index.js";
import type { RuntimeConfig } from "./types.js";
import type { LegacySkill } from "./compat/SkillAdapter.js";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname_compat = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

export interface BootstrapConfig {
  /** Configuration du runtime */
  runtime?: Partial<RuntimeConfig>;
  /**
   * Politique de permissions appliquée au runtime.
   * Si absente, construite depuis l'environnement
   * (Leanna_PERMISSION_MODE / Leanna_GRANTED_PERMISSIONS).
   */
  permissionPolicy?: PermissionPolicy;
  /**
   * Contrôleur de simulation globale (dry-run).
   * Si absent, construit depuis l'environnement (Leanna_DRY_RUN).
   */
  dryRun?: DryRunController;
  /** Skills à enregistrer (toutes les skills existantes) */
  skills?: LegacySkill[];
  /** Désactiver les agents par défaut */
  disableDefaultAgents?: boolean;
  /** Dossier des prompts (défaut: server/runtime/prompts/) */
  promptsDir?: string;
  /** Callback post-initialisation */
  onReady?: (runtime: AgentRuntime, skillManager: SkillManagerV2) => void | Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════════════════════════════

export interface BootstrapResult {
  runtime: AgentRuntime;
  skillManager: SkillManagerV2;
  prompts: PromptRegistry;
}

/**
 * Initialise le runtime complet avec compatibilité SkillManager.
 * 
 * Séquence :
 *   1. Créer le runtime (EventBus, ToolRegistry, Memory, FSM)
 *   2. Créer le SkillManagerV2 (wrapper ToolRegistry)
 *   3. Enregistrer les skills existantes
 *   4. Enregistrer les agents plugins
 *   5. Démarrer le runtime
 *   6. Retourner les instances
 */
export async function bootstrapRuntime(config: BootstrapConfig = {}): Promise<BootstrapResult> {
  const startTime = Date.now();

  // 1. Créer le runtime (avec la politique de permissions et le dry-run)
  const permissionPolicy = config.permissionPolicy ?? PermissionPolicy.fromEnv();
  const dryRun = config.dryRun ?? DryRunController.fromEnv();
  const runtime = new AgentRuntime(config.runtime, { permissionPolicy, dryRun });

  // 1.5. Configurer l'AgentOrchestrator pour utiliser le ToolRegistry du runtime (timeout corrigé)
  // Import dynamique pour éviter la dépendance circulaire
  const { agentOrchestrator } = await import("../agents/AgentOrchestrator");
  // On accepte un 3ᵉ argument optionnel (options) transmis par le mission
  // Executor : { dryRun, timeoutMs }. Les appelants à 2 arguments (AgentExecutor)
  // le laissent indéfini, sans changement de comportement. Sans ce forward, le
  // timeout de mission (180 s) était ignoré et l'action retombait sur le défaut
  // du ToolRegistry — d'où les actions longues tuées en mission mais OK en REST.
  agentOrchestrator.setSkillHandler((name: string, args: any, options?: { dryRun?: boolean; timeoutMs?: number }) =>
    runtime.tools.call(name, args, { dryRun: options?.dryRun, timeoutMs: options?.timeoutMs })
  );

  // 2. Créer le SkillManagerV2 qui partage le ToolRegistry du runtime
  const skillManager = new SkillManagerV2({
    eventBus: runtime.events,
    registry: runtime.tools,
  });

  // 3. Charger les prompts depuis les fichiers .md
  const prompts = new PromptRegistry();
  const promptsDir = config.promptsDir ?? path.join(__dirname_compat, "prompts");
  const promptCount = loadPromptTemplates(prompts, promptsDir);

  // 4. Enregistrer les skills si fournies
  if (config.skills?.length) {
    skillManager.registerAllSkills(config.skills);
  }

  // 5. Enregistrer les agents
  if (!config.disableDefaultAgents) {
    for (const agent of defaultAgents) {
      runtime.registerAgent(agent);
    }
  }

  // 6. Démarrer le runtime
  await runtime.start();

  // 7. Callback post-init
  if (config.onReady) {
    await config.onReady(runtime, skillManager);
  }

  const elapsed = Date.now() - startTime;
  console.log(
    `[Bootstrap] Runtime initialisé en ${elapsed}ms — ` +
    `${runtime.tools.size} outils, ${runtime.listAgents().length} agents, ${promptCount} prompts`
  );
  console.log(
    `[Bootstrap] Permissions runtime — mode="${permissionPolicy.getMode()}", ` +
    `accordées=[${permissionPolicy.getGranted().join(", ")}]`
  );
  if (dryRun.isEnabled()) {
    console.log(`[Bootstrap] 🧪 Dry-run global ACTIVÉ — aucun effet de bord ne sera réellement exécuté.`);
  }

  return { runtime, skillManager, prompts };
}

/**
 * Version synchrone pour les cas où on ne peut pas await au top-level.
 * Retourne les instances immédiatement, l'initialisation async se fait en arrière-plan.
 */
export function bootstrapRuntimeSync(config: BootstrapConfig = {}): BootstrapResult {
  const permissionPolicy = config.permissionPolicy ?? PermissionPolicy.fromEnv();
  const dryRun = config.dryRun ?? DryRunController.fromEnv();
  const runtime = new AgentRuntime(config.runtime, { permissionPolicy, dryRun });
  const skillManager = new SkillManagerV2({
    eventBus: runtime.events,
    registry: runtime.tools,
  });
  console.log(
    `[Bootstrap] Permissions runtime — mode="${permissionPolicy.getMode()}", ` +
    `accordées=[${permissionPolicy.getGranted().join(", ")}]`
  );
  if (dryRun.isEnabled()) {
    console.log(`[Bootstrap] 🧪 Dry-run global ACTIVÉ — aucun effet de bord ne sera réellement exécuté.`);
  }

  // Charger les prompts
  const prompts = new PromptRegistry();
  const promptsDir = config.promptsDir ?? path.join(__dirname_compat, "prompts");
  loadPromptTemplates(prompts, promptsDir);

  if (config.skills?.length) {
    skillManager.registerAllSkills(config.skills);
  }

  if (!config.disableDefaultAgents) {
    for (const agent of defaultAgents) {
      runtime.registerAgent(agent);
    }
  }

  // Démarrage async en arrière-plan
  runtime.start().then(() => {
    if (config.onReady) {
      return config.onReady(runtime, skillManager);
    }
  }).catch((err) => {
    console.error("[Bootstrap] Erreur lors du démarrage:", err);
  });

  return { runtime, skillManager, prompts };
}
