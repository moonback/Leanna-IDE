# Contributing to Jarvis OS

## Sommaire

- [Code de conduite](#-code-de-conduite)
- [Comment contribuer](#-comment-contribuer)
- [Configuration du projet](#-configuration-du-projet)
- [Conventions de code](#-conventions-de-code)
- [Processus de contribution](#-processus-de-contribution)
- [Style de commit](#-style-de-commit)
- [Tests](#-tests)
- [Documentation](#-documentation)
- [Signaler un bug](#-signaler-un-bug)
- [Demander une fonctionnalite](#-demander-une-fonctionnalite)

---

## Code de conduite

En participant a ce projet, vous acceptez de respecter le [Code de Conduite](CODE_OF_CONDUCT.md) qui sera base sur les standards de la communaute open source.

---

## Comment contribuer

### 1. Rapporter un bug

Voir [Signaler un bug](#-signaler-un-bug) ci-dessous.

### 2. Proposer une fonctionnalite

Voir [Demander une fonctionnalite](#-demander-une-fonctionnalite) ci-dessous.

### 3. Contribuer au code

1. Forker le projet sur GitHub
2. Creer une branche pour votre contribution (`git checkout -b feat/ma-fonctionnalite`)
3. Commiter vos changements (`git commit -m 'feat: ajouter ma fonctionnalite'`)
4. Pousser vers votre fork (`git push origin feat/ma-fonctionnalite`)
5. Ouvrir une Pull Request vers la branche principale

---

## Configuration du projet

### Prerequis

- Node.js >= 22.12.0
- npm >= 10.x
- Git
- Cle API Google Gemini (pour le developpement)

### Installation

```bash
# Cloner le depot
git clone https://github.com/moonback/Jarvis-OS.git
cd Jarvis-OS

# Installer les dependances
npm install

# Configurer l environnement
cp .env.example .env
# Editer .env avec vos cles API

# Demarrer en mode developpement
npm run dev
```

### Configuration recommandee

Pour le developpement, configurez ces variables dans `.env` :

```
# Obligatoire
GEMINI_API_KEY=votre_cle_api_gemini

# Recommande
JARVIS_API_TOKEN=token_secret_pour_dev

# Optionnel mais utile
SUPABASE_URL=votre_url_supabase
SUPABASE_SERVICE_ROLE_KEY=votre_cle_service
OPENROUTER_API_KEY=votre_cle_openrouter
GITHUB_TOKEN=votre_token_github

# Configuration
VITE_SERVER_PORT=4000
ENABLE_CHAIN_OF_THOUGHT=true
FORCE_TIERED_TOOLS=true
```

---

## Conventions de code

### TypeScript

1. **Strict Mode** : Toujours utiliser `strict: true` dans les `tsconfig.json`
   ```json
   {
     "compilerOptions": {
       "strict": true,
       "noImplicitAny": true,
       "strictNullChecks": true,
       "strictFunctionTypes": true,
       "strictBindCallApply": true,
       "noUnusedLocals": true,
       "noUnusedParameters": true
     }
   }
   ```

2. **Typage explicite** : Toujours typer les parametres, les retours et les variables
   ```typescript
   // Bon
   function readFile(path: string): Promise<string> { ... }
   
   // Mauvais
   function readFile(path) { ... }  // any implicite
   ```

3. **Interfaces vs Types** :
   - Utiliser `interface` pour les objets et classes
   - Utiliser `type` pour les unions et types complexes
   ```typescript
   interface User {
     id: string;
     name: string;
   }
   
   type Status = 'active' | 'inactive' | 'pending';
   ```

4. **Zod pour la validation** : Utiliser Zod pour valider les donnees d'entree
   ```typescript
   import { z } from 'zod';
   
   const filePathSchema = z.string().min(1).max(1000);
   type FilePath = z.infer<typeof filePathSchema>;
   ```

### Organisation du code Backend

#### Structure des fichiers

```
server/
├── module/
│   ├── ModuleManager.ts    # Gestionnaire principal
│   ├── ModuleService.ts   # Services
│   ├── ModuleRouter.ts    # Routeur Express
│   ├── types.ts           # Types TypeScript
│   └── index.ts           # Export principal
```

#### Nommage

- **Fichiers** : PascalCase ou kebab-case (`SkillManager.ts` ou `skill-manager.ts`)
- **Classes** : PascalCase (`class AgentOrchestrator`)
- **Fonctions** : camelCase (`function readProjectFile`)
- **Variables** : camelCase ou UPPER_CASE pour les constantes
- **Interfaces/Types** : PascalCase (`interface AgentTask`)

#### Patterns

1. **Router Pattern** :
   ```typescript
   import { Router } from 'express';
   
   const router = Router();
   
   router.get('/endpoint', handler);
   router.post('/endpoint', handler);
   
   export default router;
   ```

2. **Service Pattern** :
   ```typescript
   export class MyService {
     constructor(private dependencies: Dependencies) {}
     
     async execute(input: Input): Promise<Output> {
       // Logique
     }
   }
   ```

3. **Singleton Pattern** (pour les services globaux) :
   ```typescript
   class MyService {
     private static instance: MyService;
     
     private constructor() {}
     
     static getInstance(): MyService {
       if (!MyService.instance) {
         MyService.instance = new MyService();
       }
       return MyService.instance;
     }
   }
   ```

### Organisation du code Frontend

#### Structure des composants

```
src/
├── components/
│   ├── ide/
│   │   ├── FileExplorer.tsx    # Composant
│   │   ├── FileExplorer.stories.tsx  # Storybook (optionnel)
│   │   └── index.ts           # Export
```

#### Nommage

- **Composants** : PascalCase (`const MyComponent = () => {}`)
- **Hooks** : `use` prefix (`useFileSystem`, `useLiveAPI`)
- **Props** : camelCase avec interface
  ```typescript
  interface ButtonProps {
    onClick: () => void;
    children: React.ReactNode;
    variant?: 'primary' | 'secondary';
  }
  ```

#### Patterns

1. **Custom Hooks** : Extraire la logique dans des hooks
   ```typescript
   export function useFileSystem() {
     const [files, setFiles] = useState<File[]>([]);
     
     const loadFiles = async () => { ... };
     
     return { files, loadFiles };
   }
   ```

2. **Component Props** : Utiliser des interfaces pour typer les props
   ```typescript
   interface ChatPanelProps {
     notebookId: string;
     onSend: (message: string) => void;
   }
   
   export function ChatPanel({ notebookId, onSend }: ChatPanelProps) { ... }
   ```

3. **Lazy Loading** : Charger les composants lourds dynamiquement
   ```typescript
   const HeavyComponent = lazy(() => import('./HeavyComponent'));
   
   <Suspense fallback={<Loader />}>
     <HeavyComponent />
   </Suspense>
   ```

### Gestion des erreurs

1. **Backend** : Utiliser des try/catch avec des messages clairs
   ```typescript
   try {
     // Logique
   } catch (error: any) {
     console.error('[Module] Erreur:', error.message);
     throw new Error('Message comprehensible pour l utilisateur');
   }
   ```

2. **Frontend** : Utiliser des error boundaries
   ```typescript
   class ErrorBoundary extends React.Component {
     state = { hasError: false };
     
     static getDerivedStateFromError(error: Error) {
       return { hasError: true };
     }
     
     componentDidCatch(error: Error, info: React.ErrorInfo) {
       // Logger l erreur
     }
     
     render() {
       if (this.state.hasError) return <FallbackUI />;
       return this.props.children;
     }
   }
   ```

### Journalisation

Utiliser le systeme de logging de Jarvis :

```typescript
import { createLogger } from './utils/logger';

const log = createLogger('MyModule');

log.info('Operation reussie');
log.warn('Attention, valeur limite atteinte');
log.error('Erreur critique:', error);
```

---

## Processus de contribution

### 1. Creer une issue

Avant de commencer a coder, verifiez s'il existe deja une issue pour votre contribution. Si non, creez-en une avec :

- Un titre clair et descriptif
- Une description detaillee
- Les etapes pour reproduire (pour les bugs)
- Le comportement attendu
- Le comportement actuel

### 2. Forker le projet

1. Cliquez sur "Fork" sur la page GitHub du projet
2. Clonez votre fork localement
3. Ajoutez le depot upstream comme remote

```bash
git clone https://github.com/votre-username/Jarvis-OS.git
cd Jarvis-OS
git remote add upstream https://github.com/moonback/Jarvis-OS.git
```

### 3. Creer une branche

```bash
# Pour une fonctionnalite
git checkout -b feat/nom-de-la-fonctionnalite

# Pour un bug
git checkout -b fix/nom-du-bug

# Pour de la documentation
git checkout -b docs/description

# Pour de la refactorisation
git checkout -b refactor/description
```

### 4. Developper

- Suivez les [conventions de code](#-conventions-de-code)
- Ajoutez des tests pour les nouvelles fonctionnalites
- Mettez a jour la documentation si necessaire
- Faites des commits atomiques et reguliers

### 5. Soumettre la Pull Request

1. Poussez vos changements vers votre fork :
   ```bash
   git push origin nom-de-votre-branche
   ```

2. Ouvrez une Pull Request sur GitHub :
   - Vers la branche `main` (ou une autre branche de destination)
   - Avec un titre clair
   - Avec une description detaillee de vos changements
   - En referencant les issues pertinentes (ex: `Closes #123`)

### 6. Review et Merge

- Votre PR sera revisee par les maintaineurs
- Vous pouvez etre demande de faire des modifications
- Une fois approuvee, la PR sera mergée
- Vous serez ajoute au tableau des contributeurs !

---

## Style de commit

Suivez les [Conventional Commits](https://www.conventionalcommits.org/) :

### Types de commits

| Type | Description | Exemple |
|------|-------------|---------|
| `feat` | Nouvelle fonctionnalite | `feat: ajouter support des notebooks` |
| `fix` | Correction de bug | `fix: corriger erreur de typage dans readFile` |
| `docs` | Documentation | `docs: ajouter guide de contribution` |
| `refactor` | Refactorisation | `refactor: extraire logique dans service` |
| `test` | Tests | `test: ajouter tests pour SkillManager` |
| `style` | Style (pas de changement fonctionnel) | `style: formatter le code` |
| `chore` | Taches de maintenance | `chore: mettre a jour dependances` |
| `perf` | Optimisation de performance | `perf: optimiser indexation` |
| `build` | Changements de build | `build: configurer Vite` |
| `ci` | Configuration CI | `ci: ajouter workflow GitHub Actions` |

### Format

```
type(scope?): description

[body optionnel]

[footer optionnel]
```

### Exemples

```bash
# Commit simple
feat: ajouter support des PDF

# Commit avec scope
feat(notebooks): ajouter ingestion de PDF

# Commit avec body
test(skills): ajouter tests pour codebase

- Ajouter tests pour read_project_file
- Ajouter tests pour write_project_file
- Ajouter mocks pour le filesystem

# Commit avec footer
fix: corriger erreur de connection Supabase

Closes #456
```

---

## Tests

### Executer les tests

```bash
# Tous les tests
npm test

# Tests specifiques
npm test -- server/skills/*.test.ts

# Avec coverage
npm test -- --coverage
```

### Ecrire des tests

#### Backend (Node.js)

Utiliser le systeme de test natif de Node.js avec `--test` :

```typescript
// server/skills/codebase.test.ts
import { describe, it, expect } from 'node:test';
import { readProjectFile } from './codebase';

describe('Codebase Skill', () => {
  it('should read a file', async () => {
    const result = await readProjectFile({ path: 'test.txt' });
    expect(result.content).toBeDefined();
  });
});
```

#### Frontend (React)

Utiliser `@testing-library/react` :

```typescript
// src/components/Button.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders with children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });
  
  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(handleClick).toHaveBeenCalled();
  });
});
```

### Bonnes pratiques

1. **Nommer les tests** : Utiliser `describe` et `it` avec des descriptions claires
2. **Isoler les tests** : Chaque test doit etre independant
3. **Mock les dependances** : Ne pas dependre de services externes
4. **Tester le comportement** : Pas seulement l implementation
5. **Cover les cas limites** : Valeurs null, undef, vides, etc.

---

## Documentation

### Quand documenter

- Nouvelles fonctionnalites
- Modifications de l'API
- Changements architecturaux
- Fonctionnalites complexes
- Decisions de conception importantes

### Comment documenter

1. **Code** : Utiliser des commentaires JSDoc
   ```typescript
   /**
    * Lit un fichier du projet.
    * @param path - Chemin du fichier
    * @param options - Options de lecture
    * @returns Promise avec le contenu du fichier
    */
   function readFile(path: string, options?: ReadOptions): Promise<string> { ... }
   ```

2. **API** : Mettre a jour [API_DOCS.md](API_DOCS.md)
3. **Architecture** : Mettre a jour [ARCHITECTURE.md](ARCHITECTURE.md)
4. **Utilisation** : Mettre a jour le README.md

---

## Signaler un bug

### Avant de signaler

1. Verifiez que le bug n'a pas deja ete signale
2. Assurez-vous d'utiliser la derniere version
3. Testez avec un autre navigateur (si UI)
4. Essayez de reproduire avec les parametres par defaut

### Comment signaler

Creez une nouvelle issue sur GitHub avec :

1. **Titre** : Decrivez le bug en une phrase
   - Exemple : "Erreur 500 lors de l'upload de PDF > 10Mo"

2. **Description** :
   - Etapes pour reproduire
   - Comportement attendu
   - Comportement actuel
   - Captures d'ecran si pertinent

3. **Environment** :
   - Systeme d'exploitation
   - Version de Node.js
   - Navigateur (si UI)
   - Version de Jarvis OS

4. **Logs** : Si applicable, ajoutez les logs d'erreur

---

## Demander une fonctionnalite

### Avant de demander

1. Verifiez que la fonctionnalite n'existe pas deja
2. Pensez a comment elle pourrait etre implementee
3. Consultez la [Roadmap](ROADMAP.md) pour les plans existants

### Comment demander

Creez une nouvelle issue avec :

1. **Titre** : Decrivez la fonctionnalite
   - Exemple : "Support des fichiers Markdown dans les notebooks"

2. **Description** :
   - Use case : Pourquoi cette fonctionnalite est utile
   - Comportement attendu
   - Exemples d'utilisation

3. **Details techniques** (si vous avez des idees) :
   - Ou la fonctionnalite pourrait etre placee
   - Dependances eventuelles
   - Complexite estimee

---

## Review de code

### Pour les contributeurs

- Soyez ouvert aux feedbacks
- Repondez aux commentaires rapidement
- Mettez a jour votre PR selon les suggestions

### Pour les reviewers

- Soyez constructif
- Expliquez les raisons de vos suggestions
- Proposez des alternatives si necessaire
- Approuvez quand le code est pret

---

## Reconnaissance

Tous les contributeurs seront reconnus dans :
- Le fichier `CONTRIBUTORS.md`
- La section des contributeurs du README
- Les release notes

---

## Questions ?

Si vous avez des questions sur la contribution, ouvrez une issue avec le label `question` ou contactez les maintaineurs.

---

Merci de contribuer a Jarvis OS ! 
