# Tests des Dashboards Views

Ce dossier contient les tests complets pour les composants de tableau de bord de l'application Jarvis OS.

## Composants Testés

1. **SystemDashboardView** - Tableau de bord du système
   - Gestion des événements via EventBus
   - Gestion des artefacts via ArtifactManager
   - Vérifications via VerificationManager
   - Statistiques globales du système
   - Mode plein écran et paramètres

2. **MissionDashboardView** - Tableau de bord des missions
   - Gestion des missions actives et historiques
   - Goal Stack (pile d'objectifs) avec visualisation
   - Exécution des plans
   - Réflexion et apprentissage
   - Métriques de performance

3. **AgentDashboardView** - Tableau de bord des agents
   - Gestion des agents actifs et disponibles
   - Registre des agents (AgentRegistry)
   - Orchestration des tâches
   - Communication inter-agents
   - Métriques de performance

4. **WorkspaceDashboardView** - Tableau de bord du workspace
   - Gestion du contexte global du workspace
   - Projets actifs
   - État des fichiers
   - Ressources disponibles
   - Paramètres du workspace

## Structure des Tests

Chaque fichier de test suit la même structure :

```
📁 tests/views/
├── SystemDashboardView.test.tsx
├── MissionDashboardView.test.tsx
├── AgentDashboardView.test.tsx
├── WorkspaceDashboardView.test.tsx
├── index.ts                    # Export centralisé
└── README.md                  # Documentation
```

Chaque fichier de test couvre :
- **Props et initialisation** : Tests des props par défaut et personnalisées
- **Navigation entre onglets** : Tests de la navigation tabulaire
- **Contenu des onglets** : Tests du contenu de chaque onglet
- **Gestion des données** : Tests des fonctionnalités CRUD
- **Fonctionnalités de recherche et filtrage** : Tests des capacités de recherche
- **Fonctionnalités de l'en-tête** : Tests des boutons et actions de l'en-tête
- **Modals** : Tests des modales de création/édition
- **Gestion des callbacks** : Tests des fonctions de rappel
- **Types** : Tests des interfaces TypeScript
- **Composants internes** : Tests des sous-composants
- **Export** : Tests des exports du module
- **Intégration** : Tests avec React Router
- **Performance** : Tests des optimisations (useMemo, useCallback)
- **Sécurité** : Tests des cas d'erreur et données manquantes
- **Accessibilité** : Tests ARIA et navigation clavier
- **Responsive Design** : Tests d'adaptation mobile
- **Cleanup** : Tests de désallocation mémoire
- **Edge Cases** : Tests des cas limites

## Exécution des Tests

### Installation des dépendances

Avant d'exécuter les tests, assurez-vous que toutes les dépendances sont installées :

```bash
npm install
```

### Commandes disponibles

| Commande | Description |
|----------|-------------|
| `npm run test:frontend` | Exécute tous les tests des dashboards une seule fois |
| `npm run test:frontend:watch` | Exécute les tests en mode watch (rafraîchissement automatique) |
| `npm run test:frontend:coverage` | Exécute les tests avec couverture de code |
| `npm run test:all` | Exécute tous les tests (backend + frontend) |

### Exécution des tests

#### Tous les tests des dashboards
```bash
npm run test:frontend
```

#### Test d'un composant spécifique
```bash
# Exécuter seulement les tests de SystemDashboardView
npx vitest run tests/views/SystemDashboardView.test.tsx

# Exécuter seulement les tests de MissionDashboardView
npx vitest run tests/views/MissionDashboardView.test.tsx

# Exécuter seulement les tests de AgentDashboardView
npx vitest run tests/views/AgentDashboardView.test.tsx

# Exécuter seulement les tests de WorkspaceDashboardView
npx vitest run tests/views/WorkspaceDashboardView.test.tsx
```

#### Mode watch (développement)
```bash
npm run test:frontend:watch
```

#### Avec couverture de code
```bash
npm run test:frontend:coverage
```

Les rapports de couverture seront générés dans le dossier `coverage/`.

## Configuration

Les tests utilisent :

- **Vitest** : Framework de test (compatible avec Jest)
- **@testing-library/react** : Utilitaires pour tester les composants React
- **@testing-library/jest-dom** : Matchers DOM supplémentaires
- **jsdom** : Environnement de test pour simuler le DOM

### Fichiers de configuration

- `vitest.config.ts` : Configuration de Vitest
- `tests/setup.ts` : Configuration globale des tests (mocks, etc.)

## Écriture de nouveaux tests

### Bonnes pratiques

1. **Isolation** : Chaque test doit être indépendant
2. **Clarté** : Utilisez des noms de test descriptifs
3. **Mocking** : Mock les dépendances externes pour éviter les effets de bord
4. **Cleanup** : Nettoyez après chaque test
5. **Couverture** : Testez les cas normaux et les edge cases

### Exemple de test

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SystemDashboardView } from '../../src/views/SystemDashboardView';

describe('SystemDashboardView', () => {
  it('devrait afficher le titre du tableau de bord', () => {
    render(
      <MemoryRouter>
        <SystemDashboardView />
      </MemoryRouter>
    );
    
    expect(screen.getByText('Tableau de bord du système')).toBeInTheDocument();
  });
});
```

### Mocking des dépendances

Utilisez `vi.mock()` pour mocker les dépendances externes :

```typescript
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('lucide-react', () => ({
  LayoutDashboard: () => <span>LayoutDashboard</span>,
}));
```

## Couverture des fonctionnalités

### SystemDashboardView
- ✅ Gestion des onglets (5 onglets)
- ✅ Monitoring des événements
- ✅ Gestion des artefacts
- ✅ Vérifications système
- ✅ Statistiques globales
- ✅ Mode plein écran
- ✅ Paramètres du dashboard

### MissionDashboardView
- ✅ Gestion des missions
- ✅ Visualisation Goal Stack
- ✅ Exécution des plans
- ✅ Réflexion et apprentissage
- ✅ Métriques de performance
- ✅ Recherche et filtrage

### AgentDashboardView
- ✅ Gestion des agents
- ✅ Orchestration des tâches
- ✅ Communication inter-agents
- ✅ Monitoring des performances
- ✅ Recherche et filtrage

### WorkspaceDashboardView
- ✅ Gestion des projets
- ✅ Arborescence des fichiers
- ✅ Gestion des ressources
- ✅ Statistiques du workspace
- ✅ Recherche et filtrage

## Résolution des problèmes

### Erreurs courantes

1. **"Cannot find module"** : Assurez-vous que toutes les dépendances sont installées
2. **"Motion: No DOM found"** : Vérifiez que l'environnement est bien jsdom
3. **"Invalid hook call"** : Assurez-vous que les composants sont bien enveloppés dans un contexte React valide

### Dépannage

1. Vérifiez que Vitest est bien installé :
```bash
npm list vitest
```

2. Testez un fichier spécifique :
```bash
npx vitest run tests/views/SystemDashboardView.test.tsx --reporter=verbose
```

3. Activez les logs détaillés :
```bash
DEBUG=vitest* npm run test:frontend
```

## Intégration CI/CD

Pour intégrer les tests dans un pipeline CI/CD, ajoutez une étape comme :

```yaml
- name: Run frontend tests
  run: npm run test:frontend
```

Ou avec couverture :

```yaml
- name: Run tests with coverage
  run: npm run test:frontend:coverage
  
- name: Upload coverage report
  uses: actions/upload-artifact@v3
  with:
    name: coverage-report
    path: coverage/
```

## Maintenance

- Mettez à jour régulièrement les dépendances de test
- Ajoutez des tests pour les nouvelles fonctionnalités
- Supprimez les tests des fonctionnalités obsolètes
- Vérifiez régulièrement la couverture de code

## Contact

Pour toute question ou problème, contactez l'équipe de développement.

---

*Ce fichier a été généré automatiquement pour le projet Jarvis OS.*
