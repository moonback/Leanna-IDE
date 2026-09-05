# Guide de test — Leanna

Ce document décrit la stratégie de test, les conventions et les outils utilisés pour garantir la qualité du code.

---

## Vue d'ensemble

Leanna utilise le **Node.js test runner natif** (`node:test`) pour tous les tests unitaires et d'intégration. Aucun framework externe (Jest, Mocha, Vitest) n'est nécessaire.

**Avantages :**
- ✅ Aucune dépendance supplémentaire
- ✅ Performance native Node.js
- ✅ Intégration TypeScript via `tsx`
- ✅ Support des modules ESM
- ✅ Exécution parallèle par défaut

---

## Structure des tests

```
server/
├── skills/           # Tests unitaires des skills
│   ├── browser.test.ts
│   ├── github.test.ts
│   ├── memory.test.ts
│   └── ...           # 136+ tests (≥60% couverture)
└── routes/           # Tests d'intégration REST
    ├── agents.test.ts       (15 tests)
    ├── marketplace.test.ts  (13 tests)
    ├── workflows.test.ts    (7 tests)
    ├── browser.test.ts      (7 tests)
    ├── upload-document.test.ts (7 tests)
    ├── conversations.test.ts (7 tests)
    ├── skills.test.ts       (6 tests)
    ├── profile.test.ts      (6 tests)
    ├── terminal.test.ts     (5 tests)
    ├── memories.test.ts     (3 tests)
    ├── workspace.test.ts    (3 tests)
    └── health.test.ts       (1 test)
```

**Total : 210+ tests (136+ unitaires + 74 intégration)**

---

## Tests unitaires (Skills)

### Objectif

Valider la logique métier de chaque skill isolément :
- ✅ Validation des schémas Zod
- ✅ Gestion d'erreurs
- ✅ Cas nominaux et cas limites
- ✅ Aucune dépendance réseau (mocks)

### Exemple : `server/skills/browser.test.ts`

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { browserSkill } from './browser.js';

test('browserSkill validates required parameters', async () => {
  const result = await browserSkill.handler({ url: '' });
  assert.ok(result.error);
  assert.ok(result.error.includes('URL'));
});

test('browserSkill returns page content', async () => {
  const result = await browserSkill.handler({ 
    url: 'https://example.com',
    action: 'read' 
  });
  assert.ok(result.content);
  assert.ok(result.content.length > 0);
});
```

### Couverture

**Objectif : ≥60% de couverture sur `server/skills/`**

Actuellement : **136+ tests** couvrant :
- `browser.test.ts` — Puppeteer, actions navigateur
- `github.test.ts` — API GitHub, gestion repos/issues
- `memory.test.ts` — Embeddings, recherche sémantique
- `automation.test.ts` — Workflows, tâches planifiées
- `codebase.test.ts` — AST parsing, analyse de code
- `knowledge.test.ts` — Knowledge Graph, relations
- Et 19 autres fichiers de test

### Politiques de sécurité et de navigation

Les tests ciblés doivent couvrir les politiques, pas seulement les schémas :

- `system.test.ts` vérifie la classification npm `read-only`, `known-safe-project` et `arbitrary-script`.
- `confirmationBridge.test.ts` vérifie l'approbation, le refus, le timeout et le nettoyage des confirmations.
- `browser.test.ts` vérifie le ranking/dédoublonnage des liens et le refus de `localhost`, loopback, réseaux privés et link-local.
- `verify.test.ts` vérifie que TypeScript Compiler API reste l'arbitre syntaxique et que le précheck de crochets ne bloque pas un faux positif valide.

Un test de policy doit vérifier le chemin d'exécution réel : déclaration du tool, permissions/allowlist, confirmation éventuelle, puis handler. Une mention dans un prompt ne constitue jamais une preuve d'accessibilité.

---

## Tests d'intégration (Routes REST)

### Objectif

Valider le comportement end-to-end des endpoints HTTP :
- ✅ Codes HTTP corrects (200, 400, 404, 500, 503)
- ✅ Schémas de réponse JSON valides
- ✅ Authentification et autorisation
- ✅ Rate limiting
- ✅ Validation des inputs (Zod)
- ✅ Gestion des dépendances (Supabase, registres)

### Pattern de test standard

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import myRouter from './my-route.js';

test('GET /my-endpoint returns 200', async () => {
  // 1. Créer une app Express isolée
  const app = express();
  app.use(express.json());
  app.use('/api/my-route', myRouter);

  // 2. Démarrer sur un port aléatoire
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    // 3. Faire la requête
    const res = await fetch(`http://127.0.0.1:${port}/api/my-route/my-endpoint`);
    
    // 4. Vérifier la réponse
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.ok(body.success);
    assert.ok(Array.isArray(body.data));
  } finally {
    // 5. Toujours fermer le serveur
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
```

### Tests de validation (400 Bad Request)

```typescript
test('POST /my-endpoint validates required fields', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/my-route', myRouter);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/my-route/my-endpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}), // Corps vide
    });
    
    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.ok(body.error);
    assert.ok(body.details); // Erreurs Zod
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
```

### Tests avec dépendances optionnelles

Certains endpoints dépendent de Supabase ou d'autres services externes. Les tests doivent gérer les deux cas :

```typescript
test('GET /memories returns 500 when Supabase not configured', async () => {
  // Sauvegarder les variables d'origine
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  // Désactiver Supabase pour ce test
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  const app = express();
  app.use(express.json());
  app.use('/api/memories', memoriesRouter);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/memories`);
    assert.equal(res.status, 500);
    const body = await res.json() as any;
    assert.ok(body.error.includes('Supabase'));
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    
    // Restaurer les variables d'origine
    if (originalUrl) process.env.SUPABASE_URL = originalUrl;
    if (originalKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});
```

### Couverture par domaine

| Domaine | Fichier | Tests | Couverture |
|---|---|---|---|
| **Agents** | `agents.test.ts` | 15 | Statut tools, tâches, rôles, flotte, bus de messages, collaboration, patterns, matrix, persistance, migration SQL, tool-mapping, tool-categories |
| **Marketplace** | `marketplace.test.ts` | 13 | Recherche (validation params), featured, installed, stats, package/:id (404), install (validation + 404), uninstall, publish, rate, validate-security, export (404) |
| **Workflows** | `workflows.test.ts` | 7 | Liste, active-runs, création (validation), exécution (404), toggle (validation + 404), suppression |
| **Browser** | `browser.test.ts` | 7 | Content-result (validation, unknown ID, resolve, reject), action-result (validation, resolve) |
| **Upload** | `upload-document.test.ts` | 7 | Validation fichier, types non supportés, contexte, text files, markdown, rate limiting |
| **Conversations** | `conversations.test.ts` | 7 | Liste, search (validation + avec query), messages par ID, PATCH titre (validation), DELETE all, DELETE :id |
| **Skills** | `skills.test.ts` | 6 | Liste, propriétés requises, core skills présents, statut memory selon Supabase (requires_auth vs authenticated) |
| **Profile** | `profile.test.ts` | 6 | GET/POST profile, GET tokens, POST tokens (validation + clés non autorisées + update valide) |
| **Terminal** | `terminal.test.ts` | 5 | Config, sessions, close, auth (requires + accepts valid token) |
| **Memories** | `memories.test.ts` | 3 | GET (Supabase not configured), DELETE all, DELETE :id |
| **Workspace** | `workspace.test.ts` | 3 | GET info, POST forbidden, GET current workspace root |
| **Health** | `health.test.ts` | 1 | GET /health returns ok |

**Total : 74 tests d'intégration REST**

---

## Exécuter les tests

### Commandes principales

```bash
# Tous les tests (skills + routes)
npm test

# Tests d'intégration seulement
npm test -- server/routes/*.test.ts

# Tests unitaires seulement
npm test -- server/skills/*.test.ts

# Un fichier spécifique
npm test -- server/routes/agents.test.ts

# Avec filtre par pattern
npm test -- server/**/*memory*.test.ts
```

### Mode watch

```bash
# Relance automatiquement sur changement
npm test -- --watch
```

### Options avancées

```bash
# Exécution séquentielle (debug)
npm test -- --concurrency=1

# Timeout personnalisé (défaut: 30s)
npm test -- --test-timeout=60000

# Mode verbose
npm test -- --test-reporter=spec

# Coverage (expérimental Node.js)
npm test -- --experimental-test-coverage
```

---

## Debugging

### Inspecter un test qui échoue

```bash
# Lancer un seul test avec output détaillé
node --import tsx --test server/routes/agents.test.ts 2>&1 | less
```

### Breakpoints avec VS Code

Créer `.vscode/launch.json` :

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Test",
      "type": "node",
      "request": "launch",
      "runtimeArgs": [
        "--import", "tsx",
        "--test"
      ],
      "args": ["${file}"],
      "console": "integratedTerminal"
    }
  ]
}
```

Ouvrir un fichier `.test.ts`, poser des breakpoints, puis `F5`.

---

## Conventions de test

### Nommage

| Élément | Convention | Exemple |
|---|---|---|
| Fichier test | `<nom>.test.ts` | `agents.test.ts` |
| Test unitaire | Description claire | `test('validates required params', ...)` |
| Test intégration | Préfixe `<router> routes:` | `test('agents routes: GET /status returns ...', ...)` |

### Organisation

- **1 fichier = 1 module testé**
- **Tests groupés par fonctionnalité** (pas de `describe()` nested à outrance)
- **Tests indépendants** : chaque test peut s'exécuter seul
- **Pas de state partagé** entre tests (sauf fixtures immuables)

### Assertions

Utiliser `node:assert/strict` :

```typescript
import assert from 'node:assert/strict';

// Égalité stricte
assert.equal(res.status, 200);
assert.deepEqual(body, { success: true });

// Booléens
assert.ok(body.success);
assert.ok(!body.error);

// Arrays
assert.ok(Array.isArray(body.data));
assert.equal(body.data.length, 5);

// Erreurs
assert.throws(() => dangerousFunction(), /Expected error message/);
await assert.rejects(async () => asyncDangerousFunction(), /error pattern/);
```

### Fixtures et mocks

Les fixtures sont dans le même fichier que le test :

```typescript
// Fixture inline
const mockProfile = {
  name: 'Test User',
  role: 'developer',
};

// Mock de dépendance
const mockSkillManager = {
  getToolDeclarations: () => [
    { name: 'test_tool', description: 'Test' },
  ],
  handleToolCall: async () => ({ result: 'ok' }),
};
```

---

## CI/CD

### GitHub Actions

Les tests s'exécutent automatiquement sur chaque push et pull request.

**Workflow : `.github/workflows/test.yml`**

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
```

**Seuils de qualité :**
- ✅ Build TypeScript doit passer (`tsc --noEmit`)
- ✅ Lint doit passer (`npm run lint`)
- ✅ Tous les tests doivent passer (`npm test`)
- ✅ Coverage skills ≥60%

Un échec bloque le merge de la PR.

---

## Ajouter un test

### 1. Test unitaire de skill

```bash
# Créer server/skills/mon-skill.test.ts
touch server/skills/mon-skill.test.ts
```

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { monSkill } from './mon-skill.js';

test('monSkill validates input parameter', async () => {
  const result = await monSkill.handler({ input: '' });
  assert.ok(result.error);
  assert.ok(result.error.includes('input'));
});

test('monSkill processes valid input', async () => {
  const result = await monSkill.handler({ input: 'test' });
  assert.ok(result.output);
  assert.equal(result.output, 'processed: test');
});
```

### 2. Test d'intégration de route

```bash
# Créer server/routes/mon-domaine.test.ts
touch server/routes/mon-domaine.test.ts
```

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'http';
import { createMonDomaineRouter } from './mon-domaine.js';

test('mon-domaine routes: GET / returns data', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/mon-domaine', createMonDomaineRouter());

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/mon-domaine`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.ok(body.data);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('mon-domaine routes: POST / validates body', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/mon-domaine', createMonDomaineRouter());

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = (server.address() as any).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/mon-domaine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.ok(body.error);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
```

### 3. Exécuter le nouveau test

```bash
npm test -- server/routes/mon-domaine.test.ts
```

---

## Bonnes pratiques

### ✅ À faire

- **Tests isolés** : chaque test peut s'exécuter indépendamment
- **Cleanup systématique** : fermer les serveurs, restaurer les variables d'env
- **Messages d'erreur clairs** : `assert.ok(body.success, 'Response should indicate success')`
- **Tester les cas limites** : valeurs nulles, tableaux vides, strings trop longs
- **Tester les erreurs** : codes 400/404/500, messages d'erreur structurés
- **Mocker les dépendances externes** : pas d'appels réseau réels dans les tests

### ❌ À éviter

- **Tests dépendants** : ordre d'exécution ne doit pas importer
- **State global** : pas de variables partagées entre tests
- **Timeouts arbitraires** : `setTimeout(1000)` sans raison
- **Snapshots** : trop fragiles, préférer des assertions explicites
- **Tests qui écrivent sur le disque** : utiliser des mocks ou des dossiers temporaires
- **Tests qui dépendent de l'environnement** : vérifier les variables d'env avant de tester

---

## Métriques

### État actuel (Décembre 2024)

| Catégorie | Fichiers | Tests | Couverture |
|---|---|---|---|
| **Skills (unitaires)** | 25 | 136+ | ≥60% |
| **Routes (intégration)** | 12 | 74 | 100% endpoints |
| **Total** | 37 | 210+ | — |

### Objectifs 2025

- [ ] Augmenter la couverture skills à 80%
- [ ] Ajouter des tests end-to-end (Playwright)
- [ ] Tests de performance (charge, latence)
- [ ] Tests de sécurité (injection, XSS, CSRF)
- [ ] Tests d'accessibilité (WCAG 2.1)

---

## Support

Pour toute question sur les tests :
- Consulter ce document
- Lire les tests existants dans `server/routes/` et `server/skills/`
- Ouvrir une issue GitHub avec le label `question`

---

**Dernière mise à jour : 4 septembre 2026**
