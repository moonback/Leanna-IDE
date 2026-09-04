# Guide de contribution — Leanna

Merci de l'intérêt porté au projet. Ce guide couvre tout ce qu'il faut savoir pour contribuer efficacement.

---

## Prérequis

| Outil | Version minimale |
|---|---|
| Node.js | 20.x |
| npm | 10.x |
| Git | 2.x |
| TypeScript | 5.x (via `devDependencies`) |

Un compte Google AI Studio avec une clé `GEMINI_API_KEY` est nécessaire pour tester les fonctionnalités IA. Supabase est optionnel (les fonctionnalités dépendantes sont désactivées silencieusement si non configuré).

---

## Installation de l'environnement

```bash
git clone https://github.com/<owner>/leanna.git
cd leanna
npm install
cp .env.example .env
# Renseigner GEMINI_API_KEY dans .env
npm run dev
```

L'application démarre sur `http://127.0.0.1:4000`.

---

## Workflow Git

### Branches

| Type | Préfixe | Exemple |
|---|---|---|
| Nouvelle fonctionnalité | `feat/` | `feat/notebook-export` |
| Correction de bug | `fix/` | `fix/sandbox-sync-race` |
| Refactoring | `refactor/` | `refactor/skill-manager-v2` |
| Documentation | `docs/` | `docs/api-endpoints` |
| Tests | `test/` | `test/ide-routes` |
| Chore (deps, config) | `chore/` | `chore/bump-electron-43` |

**Règle :** ne jamais pousser directement sur `main`. Toujours passer par une branche + PR.

### Création d'une branche

```bash
git checkout main
git pull origin main
git checkout -b feat/ma-feature
```

### Commits — Conventional Commits

Format : `<type>(<scope>): <description>`

```bash
feat(agents): add autonomous delegation with priority queue
fix(sandbox): prevent symlink traversal in copy route
refactor(runtime): extract ToolRegistry from SkillManagerV2
docs(api): document notebook RAG endpoints
test(ide): add unit tests for resolveWorkspacePath
chore(deps): upgrade electron to 43.1.0
```

**Types valides :** `feat` · `fix` · `refactor` · `docs` · `test` · `chore` · `perf` · `ci` · `style`

**Scope recommandés :** `agents` · `sandbox` · `ide` · `runtime` · `notebooks` · `knowledge` · `skills` · `auth` · `electron` · `ui` · `workflows`

**Règles :**
- Description en anglais, impératif, sans majuscule ni point final
- Maximum 72 caractères pour la première ligne
- Corps du commit pour expliquer le *pourquoi* (pas le *quoi*)
- Marquer les breaking changes avec `!` : `feat(auth)!: require token for all routes`

### Pull Request

```bash
git push -u origin feat/ma-feature
```

Puis créer la PR via GitHub. Titre = message de commit principal (max 70 caractères).

**Template de description PR :**

```markdown
## Résumé
Courte description du changement et du problème résolu.

## Type de changement
- [ ] Bug fix
- [ ] Nouvelle fonctionnalité
- [ ] Refactoring
- [ ] Documentation
- [ ] Breaking change

## Testé
- [ ] Tests unitaires ajoutés/mis à jour
- [ ] Tests manuels effectués (décrire les cas)
- [ ] Build de production vérifié (`npm run build`)

## Points d'attention pour le reviewer
Éléments spécifiques à vérifier, compromis ou décisions techniques.
```

---

## Standards de code

### TypeScript

- **Mode strict activé** : `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` (voir `tsconfig.json`)
- Pas de `any` explicite sauf justification commentée
- Types inférés là où c'est clair ; types explicites pour les signatures de fonctions publiques
- Pas d'`as` forcé sauf après validation (utiliser des type guards)
- Interfaces pour les shapes de données, types pour les unions/intersections

### Backend (Express)

- Chaque domaine fonctionnel dans son propre fichier `server/routes/<domaine>.ts`
- Les routeurs sont des fonctions `create<Name>Router()` qui reçoivent leurs dépendances en paramètre (injection)
- Validation des inputs avec **Zod** (`z.safeParse` + retour `400` structuré)
- Toujours `async/await`, jamais de callbacks `.then()` imbriqués dans les handlers
- Les opérations sur le système de fichiers passent par `resolveWorkspacePath` ou `assertSandboxReady` (jamais de `path.join` direct sans validation)
- Enregistrer un événement d'audit (`appendAuditEvent`) pour toute opération destructive

### Frontend (React)

- Composants fonctionnels uniquement, pas de class components
- Un composant par fichier
- Les hooks personnalisés dans `src/hooks/`, préfixés `use`
- Les appels API via les services dans `src/services/` (pas de `fetch` direct dans les composants)
- CSS via TailwindCSS uniquement (pas de `style={}` inline sauf pour les valeurs dynamiques CSS variables)
- Accessibilité : tout élément interactif a `aria-label` ou `title`, les boutons icônes ont un texte accessible

### Nommage

| Élément | Convention |
|---|---|
| Fichiers composants React | `PascalCase.tsx` |
| Fichiers hooks | `useCamelCase.ts` |
| Fichiers services/utils | `camelCase.ts` |
| Fichiers routes serveur | `kebab-case.ts` |
| Constantes | `SCREAMING_SNAKE_CASE` |
| Types/Interfaces | `PascalCase` |
| Variables/fonctions | `camelCase` |

---

## Lancer les tests

```bash
# Tous les tests (Node test runner)
npm test

# Tests d'intégration des routes REST seulement
npm test -- server/routes/*.test.ts

# Tests des skills seulement
npm test -- server/skills/*.test.ts

# Un fichier spécifique
node --import tsx --test server/routes/ide.test.ts

# Lint (ESLint custom)
npm run lint
```

Les tests sont dans `server/**/*.test.ts`. Ils utilisent le **test runner natif Node.js** (`node:test`).

**Couverture actuelle :**
- ✅ **Skills** : ≥60% de couverture (136+ tests unitaires)
- ✅ **Routes REST** : 74 tests d'intégration couvrant tous les endpoints API
  - `agents.test.ts` : 15 tests (statut, tâches, collaboration, persistance)
  - `marketplace.test.ts` : 13 tests (recherche, installation, publication)
  - `workflows.test.ts` : 7 tests (CRUD et exécution)
  - `browser.test.ts` : 7 tests (actions navigateur)
  - `upload-document.test.ts` : 7 tests (validation fichiers, rate limiting)
  - `conversations.test.ts` : 7 tests (historique et recherche)
  - `skills.test.ts` : 6 tests (liste et configuration)
  - `profile.test.ts` : 6 tests (profil et tokens)
  - `terminal.test.ts` : 5 tests (configuration et sessions)
  - `memories.test.ts` : 3 tests (mémoire long-terme)
  - `workspace.test.ts` : 3 tests (info workspace)
  - `health.test.ts` : 1 test (health check)

Pour ajouter un test :

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';

test('myFunction should return expected value', () => {
  assert.equal(myFunction('input'), 'expected');
});
```

Pour ajouter un test d'intégration de route :

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import myRouter from './my-route.js';

test('GET /my-endpoint returns data', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/my-route', myRouter);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/my-route/my-endpoint`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.data);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
```

---

## Vérification avant PR

```bash
# 1. Build complet (frontend + backend)
npm run build

# 2. Démarrer en mode production pour vérifier
npm start

# 3. Linter
npm run lint

# 4. Tests
npm test

# 5. Audit de sécurité des dépendances de prod
npm run audit:deps
```

**La PR ne sera pas mergée si le build échoue ou si des erreurs TypeScript sont introduites.**

---

## Processus de review

1. La PR doit être approuvée par au moins **1 reviewer**
2. Tous les commentaires de review doivent être résolus ou répondus avant le merge
3. Le merge se fait en **squash** pour garder un historique propre sur `main`
4. Le reviewer vérifie : logique métier, sécurité (chemins, injection, auth), performances, tests

**Délai de réponse :** les PRs ouvertes depuis plus de 7 jours sans activité sont fermées automatiquement.

---

## Ajouter un Skill

Les skills sont les outils que l'IA peut appeler. Pour en ajouter un :

1. Créer `server/skills/monSkill.ts` :

```typescript
import type { SkillDefinition } from '../runtime/types.js';

export const monSkill: SkillDefinition = {
  name: 'mon_skill',
  description: 'Description claire de ce que fait le skill',
  parameters: {
    type: 'object',
    properties: {
      input: { type: 'string', description: 'La valeur à traiter' },
    },
    required: ['input'],
  },
  async handler({ input }: { input: string }) {
    // Implémentation
    return { result: `traité: ${input}` };
  },
};
```

2. L'enregistrer dans `server.ts` dans le tableau `skills` de `bootstrapRuntimeSync`.

3. Ajouter un test `server/skills/monSkill.test.ts`.

---

## Ajouter une Route API

1. Créer `server/routes/mon-domaine.ts` avec une fonction `createMonDomaineRouter()`
2. Monter le routeur dans `server.ts` : `app.use('/api/mon-domaine', createMonDomaineRouter())`
3. Documenter les endpoints dans `API_DOCS.md`
4. Valider les inputs avec Zod

---

## Code de conduite

- Respecter tous les contributeurs, indépendamment du niveau d'expérience
- Les retours critiques portent sur le code, jamais sur la personne
- Les discussions techniques restent factuelles et orientées solution
- Pas de contenu discriminatoire, harcelant ou inapproprié
- Les désaccords techniques se résolvent par des arguments techniques, pas par l'autorité

Les violations sont signalées aux mainteneurs via les issues GitHub (étiquette `conduct`).
