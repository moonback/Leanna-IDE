import { Router, Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { clearAllConversations } from '../skills/history.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('DataPurge');
const router = Router();

// Sentinelle "tout" : supprime toutes les lignes (id != uuid nul).
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Tables Supabase purgées via suppression directe.
 * L'ordre respecte les contraintes de clé étrangère :
 * agent_tasks référence agent_orchestrations → on supprime les tâches avant.
 * (conversations est traité à part via clearAllConversations, qui gère aussi
 * conversation_messages en cascade.)
 */
const DIRECT_TABLES = [
  'memories',
  'lists',
  'missions',
  'workflows',
  'scheduled_tasks',
  'custom_skills',
  'autonomy_tasks',
  'agent_messages',
  'agent_tasks',
  'agent_orchestrations',
] as const;

async function purgeTable(supabase: SupabaseClient, table: string): Promise<number> {
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
  const { error } = await supabase.from(table).delete().neq('id', NIL_UUID);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count || 0;
}

// DELETE /api/data/all — vide TOUTE la base de données applicative.
// Périmètre : conversations (+ messages en cascade), memories, lists, missions,
// workflows, scheduled_tasks, custom_skills, autonomy_tasks, agent_messages,
// agent_tasks, agent_orchestrations. OPÉRATION IRRÉVERSIBLE.
router.delete('/all', async (_req: Request, res: Response) => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ status: 'error', error: 'Supabase not configured' });
  }

  const deleted: Record<string, number> = {};
  const errors: Record<string, string> = {};

  // 1) Conversations (+ conversation_messages en cascade) via le service dédié,
  //    qui réinitialise aussi la conversation active en mémoire.
  try {
    deleted.conversations = await clearAllConversations();
  } catch (e: any) {
    errors.conversations = e.message || String(e);
  }

  // 2) Toutes les autres tables via suppression Supabase directe.
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  for (const table of DIRECT_TABLES) {
    try {
      deleted[table] = await purgeTable(supabase, table);
    } catch (e: any) {
      errors[table] = e.message || String(e);
    }
  }

  const total = Object.values(deleted).reduce((a, b) => a + b, 0);
  const hasErrors = Object.keys(errors).length > 0;

  if (hasErrors) {
    log.warn(`Purge partielle : ${total} ligne(s) supprimée(s), erreurs=${JSON.stringify(errors)}`);
    return res.status(207).json({
      status: 'partial',
      deleted: total,
      details: deleted,
      errors,
    });
  }

  log.info(`Base de données vidée : ${total} ligne(s) supprimée(s) — ${JSON.stringify(deleted)}`);
  return res.json({ status: 'success', deleted: total, details: deleted });
});

export default router;
