# Contributing guide

## Prérequis
- Node.js 22.x ou plus récent
- npm 10.x ou plus récent
- Git installé
- Accès à une clé Gemini ou OpenRouter si vous voulez tester les scénarios IA complets

## Workflow Git
1. Créez une branche dédiée :
   ```bash
   git checkout -b feat/ma-nouvelle-fonctionnalite
   ```
2. Suivez les conventions de commit :
   - `feat:` pour une nouvelle fonctionnalité
   - `fix:` pour une correction
   - `docs:` pour une modification de documentation
   - `refactor:` pour une refactorisation
3. Ouvrez une pull request avec une description claire, les changements attendus et les risques éventuels.

## Standards de code
- Le projet est écrit en TypeScript strict.
- Préférez des composants et modules petits, testables et bien isolés.
- Respectez les patterns Express et les conventions React déjà présentes.
- Ajoutez ou mettez à jour les tests lorsque le changement impacte un comportement critique.

## Tests
Exécutez la suite de tests backend avec :
```bash
npm test
```

Pour valider le linting :
```bash
npm run lint
```

## Processus de review
- La PR doit être cohérente vis-à-vis du contexte du dépôt.
- Les changements sensibles doivent inclure une justification technique.
- Les risques de sécurité ou de régression doivent être signalés explicitement.

## Code of conduct
- Soyez respectueux et constructif.
- Priorisez la sécurité et la qualité logicielle.
- Évitez les changements non nécessaires ou les modifications destructrices sans discussion préalable.
