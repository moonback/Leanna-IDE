/**
 * core/LedgerGuard.ts — adaptateur reliant l'ExecutionLedger (P0.3) au point de
 * passage des outils (`ToolRegistry`).
 *
 * `ToolRegistry` définit l'interface `IdempotencyGuard` chez lui pour rester
 * découplé du noyau (aucun cycle d'import). Cet adaptateur l'implémente au-dessus
 * du ledger : il traduit `begin/complete/fail` en la forme attendue par le
 * registre.
 *
 * Portée de la garde (audit 2026-10-15, C1) :
 *   - seuls les outils à EFFET DE BORD (write/exec/network/dangerous) passent par
 *     le ledger. Une lecture n'est ni journalisée ni resservie : une
 *     re-vérification (`verify_file`) doit observer l'état courant ;
 *   - la déduplication exige une étape identifiée (`missionId` ET `stepId`).
 *     Sans elle, l'appel s'exécute normalement : pas de clé globale qui
 *     resservirait un résultat d'une autre mission ou d'avant un redémarrage.
 *
 * Le contexte vient de l'appel (`ToolCallOptions.idempotencyScope`, posé par
 * l'Executor de missions et le runtime agentique) et/ou du contexte ambiant
 * réglé par le Supervisor autour d'une mission supervisée. Le `missionId`
 * ambiant prime (la mission supervisée englobe les tâches qu'elle lance) ;
 * le `stepId` de l'appel prime (il est le plus précis).
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { IdempotencyGuard, IdempotencyScope } from "../runtime/ToolRegistry.js";
import type { ToolPermission } from "../runtime/types.js";
import { ExecutionLedger, permissionsHaveSideEffect } from "./ExecutionLedger.js";

export type LedgerGuardContext = IdempotencyScope;

/** Exécution sans journalisation (lecture, ou appel hors étape de mission). */
const PASS_THROUGH = {
  decision: "execute" as const,
  commit: (_result: unknown) => {},
  fail: (_error: string) => {},
};

export class LedgerGuard implements IdempotencyGuard {
  private ctx: LedgerGuardContext = {};
  /** Contexte par exécution asynchrone : deux missions concurrentes ne se mélangent pas (F-06). */
  private readonly scoped = new AsyncLocalStorage<LedgerGuardContext>();

  constructor(private readonly ledger: ExecutionLedger = new ExecutionLedger()) {}

  /** Exécute `fn` avec un contexte ambiant isolé à cette chaîne asynchrone. */
  runWithContext<T>(ctx: LedgerGuardContext, fn: () => T): T {
    return this.scoped.run({ ...ctx }, fn);
  }

  /**
   * Règle le contexte ambiant GLOBAL (partagé par tous les appels). Préférer
   * `runWithContext` dès que plusieurs missions peuvent tourner en parallèle.
   */
  setContext(ctx: LedgerGuardContext): void {
    this.ctx = { ...ctx };
  }

  /** Efface le contexte ambiant (fin de mission/étape). */
  clearContext(): void {
    this.ctx = {};
  }

  guard(
    tool: string,
    args: Record<string, unknown>,
    permissions: ToolPermission[] | undefined,
    _agentId: string | undefined,
    scope?: IdempotencyScope
  ):
    | { decision: "execute"; commit: (result: unknown) => void; fail: (error: string) => void }
    | { decision: "skip"; result: unknown }
    | { decision: "block"; reason: string } {
    if (!permissionsHaveSideEffect(permissions as string[] | undefined)) return PASS_THROUGH;

    const ambient = this.scoped.getStore() ?? this.ctx;
    const missionId = ambient.missionId ?? scope?.missionId;
    const stepId = scope?.stepId ?? ambient.stepId;
    if (!missionId || !stepId) return PASS_THROUGH;

    const decision = this.ledger.begin({ tool, args, missionId, stepId }, true);

    if (decision.action === "skip") {
      return { decision: "skip", result: decision.result };
    }
    if (decision.action === "block") {
      return { decision: "block", reason: decision.reason };
    }
    return {
      decision: "execute",
      commit: (result) => this.ledger.complete(decision.key, result),
      fail: (error) => this.ledger.fail(decision.key, error),
    };
  }
}
