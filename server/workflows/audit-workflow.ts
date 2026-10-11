/**
 * Workflow d'audit périodique du codebase.
 *
 * Ce workflow est planifié toutes les 24h et effectue :
 * 1. Génération du codebase.md (structure + analyse OpenRouter)
 * 2. Vérification TypeScript (tsc --noEmit)
 * 3. Exécution des tests
 * 4. Sauvegarde d'un résumé en mémoire (pour notification à l'utilisateur)
 *
 * Le workflow est auto-enregistré au démarrage s'il n'existe pas déjà.
 * Il utilise le moteur workflow existant et n'est exécuté que si le serveur tourne.
 */

import { createWorkflow, listWorkflows, type WorkflowDefinition } from "../skills/workflow.js";
import { getEnv } from "../config/env.js";

const AUDIT_WORKFLOW_NAME = "audit-codebase-periodique";

export const AUDIT_WORKFLOW_DEFINITION = {
  name: AUDIT_WORKFLOW_NAME,
  description:
    "Audit automatique complet : vérifie l'état Git, génère le codebase.md, vérifie la compilation TypeScript, " +
    "exécute les tests, lance un audit de sécurité (SAST + dépendances), recense les missions en cours, " +
    "et sauvegarde un rapport détaillé en mémoire. S'exécute toutes les 24h. " +
    "Exécution optimisée (DAG) : les étapes légères (git, missions) tournent en parallèle, " +
    "tandis que les étapes lourdes (codebase, typecheck, tests, sécurité) sont sérialisées " +
    "entre elles pour ne pas saturer la machine.",
  schedule: "24h",
  // ── Plan d'exécution (DAG) ────────────────────────────────────────────────
  //  Vague 1 (parallèle) : git-check | git-log-recent | check-missions | generate-codebase
  //  Chaîne lourde (sérialisée) : generate-codebase → typecheck → run-tests → security-audit
  //  Vague finale : save-report (dépend de tout)
  //
  //  Les étapes légères ne bloquent plus la chaîne lourde : gain net de temps
  //  mural sans faire tourner tsc + tests + audit npm simultanément.
  steps: [
    {
      id: "git-check",
      action: "git_status",
      args: {},
      label: "État Git (branche, fichiers modifiés/staged/untracked)",
      onError: "skip" as const,
      maxRetries: 0,
      // Léger → aucune dépendance : démarre immédiatement en parallèle.
    },
    {
      id: "generate-codebase",
      action: "generate_codebase_markdown",
      args: { includePreview: false, analyzeWithOpenRouter: true },
      label: "Génération codebase.md + analyse architecturale via OpenRouter",
      onError: "skip" as const,
      maxRetries: 1,
      // Scan complet du projet + analyse LLM OpenRouter sur des centaines de
      // fichiers : 60s (défaut) est insuffisant. On accorde jusqu'à 10 min.
      timeoutMs: 600_000,
      // Tête de la chaîne lourde → démarre en parallèle des étapes légères.
    },
    {
      id: "typecheck",
      action: "verify_typecheck",
      args: {},
      label: "Vérification TypeScript (tsc --noEmit) — détection d'erreurs de typage",
      onError: "skip" as const,
      maxRetries: 0,
      // Sérialisé après la génération du codebase (évite tsc + scan simultanés).
      dependsOn: ["generate-codebase"],
    },
    {
      id: "run-tests",
      action: "verify_run_script",
      args: { script: "test" },
      label: "Exécution complète de la suite de tests",
      onError: "skip" as const,
      maxRetries: 0,
      // Sérialisé après le typecheck (évite tsc + suite de tests simultanés).
      dependsOn: ["typecheck"],
    },
    {
      id: "security-audit",
      action: "security_audit",
      args: {},
      label: "Audit de sécurité en lecture seule (SAST, secrets, dépendances npm)",
      onError: "skip" as const,
      maxRetries: 0,
      // Scan SAST + audit npm sur l'ensemble du projet : peut dépasser 60s.
      timeoutMs: 300_000,
      // Sérialisé après les tests (dernière étape lourde de la chaîne).
      dependsOn: ["run-tests"],
    },
    {
      id: "check-missions",
      action: "mission_list",
      args: {},
      label: "Liste des missions actives et récemment terminées",
      onError: "skip" as const,
      maxRetries: 0,
      // Léger → aucune dépendance : démarre immédiatement en parallèle.
    },
    {
      id: "git-log-recent",
      action: "git_log",
      args: { count: 10 },
      label: "Historique des 10 derniers commits (contexte des changements)",
      onError: "skip" as const,
      maxRetries: 0,
      // Léger → aucune dépendance : démarre immédiatement en parallèle.
    },
    {
      id: "save-report",
      // Dépend de toutes les étapes de collecte → exécuté en dernière vague,
      // une fois toutes les données disponibles pour le rapport.
      dependsOn: [
        "git-check",
        "generate-codebase",
        "typecheck",
        "run-tests",
        "security-audit",
        "check-missions",
        "git-log-recent",
      ],
      action: "save_memory",
      args: {
        content:
          "📋 Audit périodique Leanna — " +
          "Git: {{steps.git-check.status}} (branche: {{steps.git-check.result.branch}}, {{steps.git-check.result.summary}}) | " +
          "Codebase.md: {{steps.generate-codebase.status}} | " +
          "TypeCheck: {{steps.typecheck.status}} ({{steps.typecheck.result.message}}) | " +
          "Tests: {{steps.run-tests.status}} | " +
          "Sécurité: {{steps.security-audit.status}} ({{steps.security-audit.result.summary.total}} alertes, {{steps.security-audit.result.summary.critical}} critiques) | " +
          "Missions: {{steps.check-missions.result.total}} suivies | " +
          "Derniers commits: {{steps.git-log-recent.status}}",
      },
      label: "Sauvegarde du rapport d'audit complet en mémoire",
      condition: 'true', // Toujours exécuter, même si des étapes ont échoué
      onError: "skip" as const,
      maxRetries: 1,
    },
  ],
};

import { createClient } from "@supabase/supabase-js";

/**
 * Enregistre le workflow d'audit s'il n'existe pas déjà.
 * Double protection : vérification en mémoire ET en BDD pour éviter
 * les doublons même si le chargement asynchrone n'est pas encore terminé.
 */
export async function ensureAuditWorkflow(): Promise<WorkflowDefinition | null> {
  try {
    // 1. Vérification en mémoire (rapide)
    const existing = listWorkflows();
    const inMemory = existing.find((w) => w.name === AUDIT_WORKFLOW_NAME);
    if (inMemory) {
      console.log(`[Audit] Workflow "${AUDIT_WORKFLOW_NAME}" déjà en mémoire (id: ${inMemory.id}).`);
      return inMemory;
    }

    // 2. Vérification en BDD (protection contre race condition au démarrage)
    const auditEnv = getEnv();
    const supabaseUrl = auditEnv.SUPABASE_URL;
    const supabaseKey = auditEnv.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from("workflows")
        .select("id, name")
        .eq("name", AUDIT_WORKFLOW_NAME)
        .limit(1);

      if (!error && data && data.length > 0) {
        console.log(`[Audit] Workflow "${AUDIT_WORKFLOW_NAME}" déjà en BDD (id: ${data[0].id}). Pas de création.`);
        return null; // déjà persisté, loadWorkflows() l'a ou va l'enregistrer
      }

      // Nettoyage défensif : supprimer les doublons éventuels en BDD
      const { data: allInDb } = await supabase
        .from("workflows")
        .select("id, name, created_at")
        .eq("name", AUDIT_WORKFLOW_NAME)
        .order("created_at", { ascending: true });

      if (allInDb && allInDb.length > 1) {
        // Garder le plus ancien, supprimer les doublons
        const toDelete = allInDb.slice(1).map((w: { id: string }) => w.id);
        await supabase.from("workflows").delete().in("id", toDelete);
        console.warn(`[Audit] ⚠ ${toDelete.length} doublon(s) de "${AUDIT_WORKFLOW_NAME}" supprimé(s) de la BDD.`);
        return null;
      }
    }

    // 3. Créer le workflow
    const workflow = await createWorkflow(AUDIT_WORKFLOW_DEFINITION);
    console.log(`[Audit] Workflow "${AUDIT_WORKFLOW_NAME}" créé et planifié (id: ${workflow.id}, schedule: 24h).`);
    return workflow;
  } catch (error: any) {
    console.error(`[Audit] Impossible de créer le workflow d'audit:`, error.message || error);
    return null;
  }
}
