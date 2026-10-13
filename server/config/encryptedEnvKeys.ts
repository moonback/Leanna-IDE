/**
 * Variables d'environnement chiffrées au repos dans le .env.
 *
 * Source unique partagée par :
 *  - server-bootstrap.ts : déchiffre ces clés au démarrage (après dotenv) ;
 *  - server/routes/env.ts : chiffre ces clés lors d'une écriture depuis l'UI.
 *
 * Une clé ne doit figurer ici QUE si elle est déchiffrée au démarrage.
 * Ne JAMAIS y ajouter :
 *  - `Leanna_MASTER_KEY` : c'est la clé de déchiffrement elle-même. Chiffrée,
 *    elle devient illisible au démarrage → une nouvelle clé est générée et tous
 *    les secrets chiffrés deviennent irrécupérables ;
 *  - les clés `VITE_*` : Vite les lit directement depuis le .env et les injecte
 *    telles quelles dans le bundle frontend, sans passer par decrypt().
 */
export const ENCRYPTED_AT_REST_ENV_KEYS: readonly string[] = [
  'Leanna_API_TOKEN',
  'GEMINI_API_KEY',
  'OPENROUTER_API_KEY',
  'OPENROUTER_FREE_API_KEY',
  'GITHUB_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_ANON_KEY',
  'SANDBOX_EXIT_CODE',
  'REDIS_URL',
  'LEANNA_KNOWLEDGE_REDIS_URL',
  'LEANNA_LOCK_REDIS_URL',
  'LEANNA_EVENTBUS_REDIS_URL',
];

const ENCRYPTED_AT_REST_SET = new Set(ENCRYPTED_AT_REST_ENV_KEYS);

export function isEncryptedAtRestEnvKey(key: string): boolean {
  return ENCRYPTED_AT_REST_SET.has(key);
}
