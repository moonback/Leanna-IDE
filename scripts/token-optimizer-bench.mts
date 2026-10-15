// Benchmark déterministe de TokenOptimizer (aucun appel LLM : résumé local).
// Usage : node --import tsx scripts/token-optimizer-bench.mts
//
// Mesure, sur des conversations synthétiques reproductibles :
//   - tokens ESTIMÉS avant/après optimizeMessages (même estimateur des deux côtés) ;
//   - nombre de messages réellement transmis (= tableau envoyé par /api/openrouter/chat) ;
//   - préservation d'un fait « critique » placé dans un ancien message.
// Ne mesure PAS les tokens facturés : ceux-ci exigent un appel fournisseur réel.
import { optimizeMessages, estimateTokens, getBudgetForModel, type ChatMessage } from '../server/utils/tokenOptimizer.ts';

function conversation(turns: number, charsPerMsg: number): ChatMessage[] {
  const msgs: ChatMessage[] = [{ role: 'system', content: 'Tu es Leanna. Règle de sécurité: ne jamais exécuter rm -rf.' }];
  for (let i = 0; i < turns; i++) {
    const fact = i === 2 ? ' DÉCISION CRITIQUE: la base de données cible est PostgreSQL 16.' : '';
    msgs.push({ role: 'user', content: `Question ${i}: ${'détail '.repeat(charsPerMsg / 7)}${fact}` });
    msgs.push({ role: 'assistant', content: `Réponse ${i}. ${'explication '.repeat(charsPerMsg / 12)}` });
  }
  return msgs;
}

const budget = { ...getBudgetForModel('default'), conversationHistory: 20_000 };
const rows = [];
for (const [turns, chars] of [[10, 2000], [40, 2000], [120, 1500]] as const) {
  const input = conversation(turns, chars);
  const before = input.reduce((s, m) => s + estimateTokens(m.content), 0);
  const res = optimizeMessages(input, budget);
  const after = res.messages.reduce((s, m) => s + estimateTokens(m.content), 0);
  rows.push({
    turns,
    messagesBefore: input.length,
    messagesAfter: res.messages.length,
    estTokensBefore: before,
    estTokensAfter: after,
    reductionPct: Math.round((1 - after / before) * 100),
    systemRulePreserved: res.messages.some((m) => m.content.includes('ne jamais exécuter rm -rf')),
    criticalFactPreserved: res.messages.some((m) => m.content.includes('PostgreSQL 16')),
  });
}
console.log(JSON.stringify({ conversationHistoryBudget: budget.conversationHistory, rows }, null, 2));
process.exit(0);
