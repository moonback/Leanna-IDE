import { randomUUID } from 'node:crypto';
import { generateText } from '../utils/textGeneration.js';
import { DEFAULT_ROXANE_CONFIG, normalizeRoxaneConfig, type DebateRunRequest, type DebateTurn, type RoxaneAIConfig } from './types.js';

type Profile = Record<string, any>;

function leannaPrompt(profile: Profile): string {
  return [
    `Tu es ${profile.aiName || 'Leanna'}, l'assistante principale de l'utilisateur.`,
    'Tu connais son projet et tu défends une solution réaliste, cohérente, maintenable et vérifiable.',
    'Tu dois écouter les objections de Roxane, reconnaître les erreurs et améliorer ta proposition.',
    'Réponds en français oral, naturellement et sans préambule inutile.',
    typeof profile.customSystemPrompt === 'string' ? profile.customSystemPrompt.slice(0, 4000) : '',
  ].filter(Boolean).join('\n');
}

function roxanePrompt(config: RoxaneAIConfig): string {
  const stance = config.contradictionLevel >= 75
    ? 'Ton regard est très critique mais loyal : cherche les risques et les hypothèses fragiles.'
    : config.contradictionLevel >= 40
      ? 'Ton regard est équilibré : examine les avantages et les inconvénients.'
      : 'Ton regard est collaboratif : cherche surtout à compléter et améliorer les propositions.';
  return [config.systemPrompt, stance, `Style de réponse : ${config.responseStyle}. Langue : ${config.language}.`].join('\n');
}

async function ask(
  speaker: 'leanna' | 'roxane',
  prompt: string,
  systemPrompt: string,
  profile: Profile,
  config: RoxaneAIConfig,
) {
  const provider = speaker === 'roxane' ? config.provider : (profile.textProvider === 'openrouter' ? 'openrouter' : 'gemini');
  const model = speaker === 'roxane'
    ? config.model
    : (typeof profile.openrouterModel === 'string' ? profile.openrouterModel : undefined);
  const result = await generateText({
    prompt,
    systemPrompt,
    forceProvider: provider,
    ...(provider === 'openrouter' && model ? { openrouterModel: model } : {}),
    ...(provider === 'gemini' && speaker === 'roxane' ? { geminiModel: config.model } : {}),
    temperature: speaker === 'roxane' ? config.temperature : (profile.temperature ?? 0.7),
    maxTokens: speaker === 'roxane' ? config.maxTokens : 1200,
    untrustedPrompt: true,
    untrustedSource: 'roxane-debate-user-context',
  });
  return { text: result.text.trim(), provider: result.provider, model: result.model };
}

export async function runDebate(profile: Profile, request: DebateRunRequest) {
  const config = normalizeRoxaneConfig(profile.roxane ?? DEFAULT_ROXANE_CONFIG);
  if (!config.enabled) throw new Error('Roxane est désactivée dans les paramètres.');
  const topic = request.topic.trim().slice(0, 3000);
  if (!topic) throw new Error('Le sujet du débat est obligatoire.');
  const context = typeof request.context === 'string' ? request.context.slice(0, 18000) : '';
  const rounds = Math.min(config.maxRounds, Math.max(1, Math.round(request.rounds ?? config.maxRounds)));
  const id = randomUUID();
  const turns: DebateTurn[] = [];
  const startedAt = Date.now();
  const base = `SUJET : ${topic}\n\nCONTEXTE FOURNI :\n${context || '(aucun contexte complémentaire)'}\n\nTu participes à un débat vocal à deux IA. Donne une position claire, des raisons concrètes et une recommandation. N'invente aucune vérification.`;
  const push = (speaker: 'leanna' | 'roxane', text: string, round: number) => {
    const turn = { id: randomUUID(), speaker, text, round, createdAt: new Date().toISOString() } as DebateTurn;
    turns.push(turn);
    return turn;
  };

  const [firstLeanna, firstRoxane] = await Promise.all([
    ask('leanna', base + '\n\nPrésente ton analyse initiale en 100 à 160 mots.', leannaPrompt(profile), profile, config),
    ask('roxane', base + '\n\nPrésente ton analyse indépendante, sans connaître la position de Leanna. En 100 à 160 mots.', roxanePrompt(config), profile, config),
  ]);
  push('leanna', firstLeanna.text, 1);
  push('roxane', firstRoxane.text, 1);

  for (let round = 2; round <= rounds; round++) {
    if ((Date.now() - startedAt) / 1000 > config.maxDurationSeconds) break;
    const previous = turns.slice(-2).map(t => `${t.speaker === 'leanna' ? 'LEANNA' : 'ROXANE'} : ${t.text}`).join('\n\n');
    const leannaReply = await ask(
      'leanna',
      `${base}\n\nDÉBAT JUSQU'ICI :\n${previous}\n\nRéponds à l'objection de Roxane. Indique ce que tu maintiens et ce que tu ajustes. Maximum 130 mots.`,
      leannaPrompt(profile), profile, config,
    );
    push('leanna', leannaReply.text, round);
    const roxaneReply = await ask(
      'roxane',
      `${base}\n\nDÉBAT JUSQU'ICI :\n${turns.slice(-3).map(t => `${t.speaker.toUpperCase()} : ${t.text}`).join('\n\n')}\n\nRéponds à Leanna. Identifie ce qui reste non résolu et propose un compromis si possible. Maximum 130 mots.`,
      roxanePrompt(config), profile, config,
    );
    push('roxane', roxaneReply.text, round);
  }

  const transcript = turns.map(t => `${t.speaker.toUpperCase()} : ${t.text}`).join('\n\n');
  const synthesis = await ask(
    'leanna',
    `À partir de ce débat, produis une synthèse structurée en français avec : recommandation commune, accords, désaccords non résolus, risques, et 3 à 5 tâches proposées. Ne marque aucune décision comme approuvée : seul l'utilisateur décide.\n\n${transcript}`,
    leannaPrompt(profile) + '\nTu es également chargée de synthétiser le débat avec neutralité.',
    profile, config,
  );
  return {
    id,
    topic,
    turns,
    synthesis: synthesis.text,
    status: 'awaiting_user_decision' as const,
    createdAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    config: { leannaModel: firstLeanna.model, roxaneModel: firstRoxane.model, roxaneProvider: config.provider },
  };
}

export interface DebateSynthesis {
  recommendation: string;
  agreements: string[];
  disagreements: string[];
  decisions: string[];
  tasks: Array<{ title: string; description: string; priority: 'low' | 'medium' | 'high' | 'critical' }>;
}

export async function synthesizeLiveDebate(
  profile: Profile,
  topic: string,
  turns: Array<{ speaker: 'leanna' | 'roxane' | 'user'; text: string }>,
): Promise<DebateSynthesis> {
  const config = normalizeRoxaneConfig(profile.roxane ?? DEFAULT_ROXANE_CONFIG);
  const transcript = turns.slice(0, 32).map(turn =>
    `${turn.speaker.toUpperCase()} : ${String(turn.text).slice(0, 5000)}`
  ).join('\\n\\n');
  const prompt = `Analyse le débat vocal ci-dessous et retourne UNIQUEMENT un objet JSON valide, sans markdown, avec exactement cette structure :
{
  "recommendation": "synthèse courte et équilibrée",
  "agreements": ["points réellement partagés"],
  "disagreements": ["désaccords qui restent ouverts"],
  "decisions": ["décisions que l'utilisateur a explicitement prises; tableau vide si aucune"],
  "tasks": [{"title":"titre actionnable","description":"description concrète et vérifiable","priority":"low|medium|high|critical"}]
}
N'invente aucune décision de l'utilisateur. Les suggestions des IA ne sont pas des décisions approuvées. Ne propose que 3 à 5 tâches utiles, directement liées au débat. Si aucune tâche n'est justifiée, retourne un tableau vide.
SUJET : ${topic.slice(0, 3000)}
TRANSCRIPTION :
${transcript}`;
  const result = await ask(
    'leanna',
    prompt,
    leannaPrompt(profile) + '\\nTu synthétises avec neutralité et tu distingues strictement les propositions des décisions humaines.',
    profile,
    config,
  );
  const cleaned = result.text.trim().replace(/^```(?:json)?\\s*/i, '').replace(/\\s*```$/, '');
  const parsed = JSON.parse(cleaned) as Partial<DebateSynthesis>;
  const priorities = ['low', 'medium', 'high', 'critical'];
  return {
    recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation.slice(0, 4000) : '',
    agreements: Array.isArray(parsed.agreements) ? parsed.agreements.filter((v): v is string => typeof v === 'string').slice(0, 10) : [],
    disagreements: Array.isArray(parsed.disagreements) ? parsed.disagreements.filter((v): v is string => typeof v === 'string').slice(0, 10) : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions.filter((v): v is string => typeof v === 'string').slice(0, 10) : [],
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks.slice(0, 5).flatMap(task => {
      if (!task || typeof task.title !== 'string' || typeof task.description !== 'string') return [];
      return [{
        title: task.title.trim().slice(0, 160),
        description: task.description.trim().slice(0, 4000),
        priority: priorities.includes(task.priority as string) ? task.priority as DebateSynthesis['tasks'][number]['priority'] : 'medium',
      }];
    }) : [],
  };
}
