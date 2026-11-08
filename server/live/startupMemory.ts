/**
 * Lectures Supabase injectées au démarrage d'une session Live.
 *
 * Les tables `memories` et `conversations` sont partagées par tous les
 * workspaces : chaque lecture DOIT être scopée par `project_id`, sinon la
 * mémoire d'un autre projet fuit dans la conversation.
 */
import { getActiveProjectId } from '../utils/selfRoot.js';

type SupabaseLike = { from: (table: string) => any };

/** Mémoires du projet actif + mémoires globales héritées (project_id = ''). Sans projet actif : globales seules. */
export async function fetchStartupMemories(supabase: SupabaseLike, limit: number): Promise<string[]> {
  const { data } = await supabase
    .from('memories')
    .select('content')
    .in('project_id', [getActiveProjectId(), ''])
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((m: { content: string }) => m.content);
}

/** Conversations récentes du projet actif uniquement (même règle que listConversations). */
export async function fetchStartupConversations(
  supabase: SupabaseLike,
  limit: number,
): Promise<Array<{ title: string | null; summary: string | null; started_at: string; message_count: number }>> {
  const { data } = await supabase
    .from('conversations')
    .select('title, summary, started_at, message_count')
    .eq('project_id', getActiveProjectId())
    .order('started_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}
