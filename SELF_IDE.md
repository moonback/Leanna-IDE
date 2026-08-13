# Jarvis-OS — IDE auto-référentiel

> Jarvis-OS ne lit, n'écrit et n'exécute **que sur son propre code source**. Ce document décrit l'architecture self-referential et explique comment étendre les skills en respectant le périmètre verrouillé.

---

## 1. Principe

Jarvis-OS n'est pas un IDE généraliste multi-projets. C'est un IDE **auto-hébergé** : l'application ne peut modifier que le repo qui la fait tourner. Il n'existe aucun moyen d'ouvrir un workspace externe ou de cloner un autre dépôt.

Cette contrainte est **structurelle**, pas cosmétique :
- La racine du projet (`SELF_ROOT`) est résolue une seule fois au démarrage et ne change jamais.
- Tous les accès filesystem passent par une validation de chemin centralisée.
- Les fichiers critiques nécessitent une confirmation explicite avant modification.
- Chaque écriture crée un checkpoint git automatique (rollback trivial).

---

## 2. Le module `selfRoot.ts`

`server/utils/selfRoot.ts` est la **source unique de vérité** pour le périmètre autorisé.

### Exports

| Export | Type | Rôle |
|--------|------|------|
| `SELF_ROOT` | `string` | Racine absolue et immuable du repo Jarvis-OS |
| `normalizeSelfPath(target)` | `(string) => string \| null` | Résout un chemin relatif et vérifie qu'il reste dans `SELF_ROOT`. Retourne `null` si sortie du périmètre |
| `isWriteForbidden(absPath)` | `(string) => boolean` | `true` si le chemin est totalement interdit en écriture (`.git/config`, `node_modules`…) |
| `isCriticalFile(absPath)` | `(string) => boolean` | `true` si le fichier nécessite une confirmation utilisateur (`server.ts`, `.env`…) |
| `resolveRealPathWithinSelf(path)` | `(string) => Promise<string \| null>` | Résout les symlinks et vérifie le chemin réel (anti symlink-escape) |
| `auditSymlinks()` | `() => Promise<string[]>` | Scanne le repo pour détecter les symlinks pointant hors du périmètre |

### Listes de protection

```typescript
// Nécessitent une confirmation explicite avant modification
CRITICAL_FILES = [
  "server.ts", "server/security.ts", "server/utils/selfRoot.ts",
  "electron/main.cjs", "electron/preload.cjs",
  ".env", ".env.local", ".gemini-keys.json",
];

// Totalement interdits en écriture, même avec confirmation
FORBIDDEN_WRITE_TARGETS = [".git/config", ".git/HEAD", "node_modules"];
```

---

## 3. Règles pour étendre un skill

Quand vous ajoutez un skill qui touche au filesystem, respectez **impérativement** ce contrat :

### ✅ À faire

```typescript
import { SELF_ROOT, normalizeSelfPath, isWriteForbidden, isCriticalFile } from "../utils/selfRoot";

// 1. Toujours résoudre le root via SELF_ROOT (jamais process.cwd())
function getProjectRoot(): string {
  return SELF_ROOT;
}

// 2. Valider tout chemin entrant AVANT accès
const normalized = normalizeSelfPath(requestedPath);
if (!normalized) return { error: "Chemin invalide ou en dehors du workspace." };

// 3. Pour les écritures : vérifier les interdits et les fichiers critiques
if (isWriteForbidden(normalized)) return { error: "Écriture interdite sur fichier protégé." };
const critical = isCriticalFile(normalized);
```

### ❌ À ne pas faire

```typescript
// JAMAIS : process.cwd() n'est pas fiable en Electron packagé
const root = process.cwd();

// JAMAIS : accès direct sans normalisation (path traversal)
fs.readFileSync(path.join(root, userInput));

// JAMAIS : lire JARVIS_DEFAULT_WORKSPACE (supprimé du produit)
const ws = process.env.JARVIS_DEFAULT_WORKSPACE;
```

---

## 4. Les garde-fous auto-modification (Phase 2)

Quand un skill modifie du code, chaînez les protections dans cet ordre :

```typescript
// 1. Rate limiting (anti-boucle infinie : 30 écritures/min)
if (!checkWriteRateLimit()) return { error: "Rate limit atteint." };

// 2. Validation du chemin
const normalized = normalizeSelfPath(requestedPath);
if (!normalized) return { error: "Chemin invalide." };
if (isWriteForbidden(normalized)) return { error: "Interdit." };

// 3. Confirmation interactive pour fichiers critiques
const critical = isCriticalFile(normalized);
if (critical && toolContext.emitToClient) {
  const approved = await requestConfirmation(requestedPath, 'write', toolContext.emitToClient);
  if (!approved) return { error: "Refusé par l'utilisateur." };
}

// 4. Checkpoint git AVANT écriture
await createCheckpoint(`avant écriture: ${requestedPath}`);

// 5. Écriture effective
await fs.promises.writeFile(normalized, content, "utf-8");

// 6. Audit enrichi (avec diff)
appendAuditEvent({ action: 'write', target: requestedPath, actor: 'ai',
  diff: generateDiffSummary(beforeContent, content) });

// 7. Restart serveur si nécessaire + validation post-édition
triggerRestartIfNeeded(requestedPath);
scheduleValidation();
```

### Modules impliqués

| Module | Rôle |
|--------|------|
| `utils/checkpoint.ts` | Snapshot git avant modification, rollback, validation `tsc` |
| `utils/confirmationBridge.ts` | Demande de confirmation UI (timeout 30s → refus) |
| `utils/serverRestart.ts` | Détecte les modifs serveur, redémarrage contrôlé |
| `utils/postEditValidator.ts` | Lance `tsc --noEmit` automatiquement (debounce 2.5s) |
| `audit.ts` | Journal NDJSON enrichi avec diff sommaire |

---

## 5. Sandboxing MCP (Phase 4)

Les serveurs MCP externes peuvent exposer des outils qui reçoivent des chemins. `McpBridge.sanitizePathArgs()` intercepte tous les arguments dont la clé ressemble à un chemin (`path`, `file`, `dir`, `cwd`, `target`, `source`, `destination`…) et vérifie qu'ils restent dans `SELF_ROOT`. Un chemin hors périmètre lève une erreur avant l'appel du tool.

---

## 6. Configuration développeur

En développement uniquement, vous pouvez surcharger le root pour les tests :

```bash
# NODE_ENV=development requis
JARVIS_SELF_ROOT_OVERRIDE="/chemin/vers/repo/test" npm run dev
```

Cette variable est **ignorée en production** et absente du `.env.example` public.

---

## 7. Tests de sécurité

Le périmètre est couvert par des tests automatisés :

| Fichier | Couverture |
|---------|-----------|
| `server/security.test.ts` | Path traversal, fichiers interdits, fichiers critiques |
| `server/selfRoot.test.ts` | Résolution du root, immutabilité, isolation env |
| `server/utils/safeguards.test.ts` | Confirmation, restart, diff audit, MCP sandboxing |
| `server/utils/checkpoint.test.ts` | Checkpoints, validation build |

```bash
npm run test
```

---

## 8. Interface utilisateur

- **Settings → Self-Root** : affiche le root verrouillé, la branche git, le statut sync.
- **Settings → Garde-fous** : toggles (checkpoint auto, validation, confirmation critique), liste des checkpoints, rollback.
- **Self-Edit Banner** : bandeau dans l'éditeur quand l'IA modifie le fichier ouvert.
- **StatusBar** : branche git, statut build, connexion MCP, compteur tokens.
- **Onboarding** : écran de premier lancement expliquant le périmètre.

### Raccourcis clavier

| Raccourci | Action |
|-----------|--------|
| `Ctrl+Shift+K` | Créer un checkpoint manuel |
| `Ctrl+Shift+B` | Lancer la validation (`tsc --noEmit`) |
| `Ctrl+Shift+H` | Afficher le panneau des checkpoints |
