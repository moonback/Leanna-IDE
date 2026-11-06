import { createClient } from '@supabase/supabase-js';
import type { DebateSynthesis } from './DebateOrchestrator.js';

export async function persistLiveDebate(
  topic: string,
  turns: Array<{ speaker: 'leanna' | 'roxane' | 'user'; text: string }>,
  synthesis: DebateSynthesis,
): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.warn('[Roxane][Persistence] Supabase indisponible : variables de service manquantes.');
    return null;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const title = `Débat Roxane : ${topic.slice(0, 68)}`;
  const summary = [
    synthesis.recommendation,
    synthesis.agreements.length ? `Accords : ${synthesis.agreements.join(' ; ')}` : '',
    synthesis.disagreements.length ? `Désaccords : ${synthesis.disagreements.join(' ; ')}` : '',
    synthesis.decisions.length ? `Décisions : ${synthesis.decisions.join(' ; ')}` : '',
  ].filter(Boolean).join('\n');

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .insert([{ title, summary, message_count: turns.length }])
    .select('id')
    .single();

  if (conversationError || !conversation?.id) {
    throw new Error(`Création de l'historique Roxane impossible : ${conversationError?.message || 'ID absent'}`);
  }

  const messages = turns.slice(0, 32).map(turn => ({
    conversation_id: conversation.id,
    role: turn.speaker === 'user' ? 'user' : 'assistant',
    content: `[${turn.speaker.toUpperCase()}] ${String(turn.text).slice(0, 5000)}`,
  }));

  if (messages.length > 0) {
    const { error: messageError } = await supabase.from('conversation_messages').insert(messages);
    if (messageError) {
      await supabase.from('conversations').delete().eq('id', conversation.id);
      throw new Error(`Sauvegarde de la transcription Roxane impossible : ${messageError.message}`);
    }
  }

  console.info('[Roxane][Persistence] Débat sauvegardé dans l’historique', {
    conversationId: conversation.id,
    turns: messages.length,
  });
  return String(conversation.id);
}
