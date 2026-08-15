# 🤝 Guide de contribution — Jarvis-OS

Merci de prendre le temps de contribuer à Jarvis-OS ! Ce guide détaille les prérequis, les processus de développement et les conventions à respecter pour proposer des modifications.

---

## 📋 Prérequis pour contribuer

Avant de commencer à développer, assurez-vous d'avoir installé les outils suivants :
- **Node.js** : Version ≥ 22.12.0 (version LTS recommandée)
- **npm** : Version ≥ 10.x
- **Git** : Installé et configuré
- **Clé API Gemini** : Obtenue auprès de Google AI Studio pour exécuter et tester les fonctionnalités d'IA en temps réel.
- **Accès à un projet Supabase** (optionnel) : Requis si vous travaillez sur la mémoire persistante ou le bus inter-agents.

---

## 🔀 Workflow Git & Cycle de Vie

Nous utilisons une variante simple de Git Flow pour intégrer de nouvelles fonctionnalités ou corrections.

### 1. Création de branche
Créez toujours une branche dédiée à partir de `main` avec un nom structuré :
```bash
# Pour une nouvelle fonctionnalité
git checkout -b feat/ma-nouvelle-fonctionnalite

# Pour une correction de bug
git checkout -b fix/nom-du-bug

# Pour des modifications de documentation
git checkout -b docs/titre-doc
```

### 2. Formater les commits (Conventional Commits)
Les commits doivent respecter la convention standardisée :
*   `feat: ajouter un nouveau module d'audit` (pour les fonctionnalités)
*   `fix: résoudre le problème d'import de node-pty` (pour les corrections)
*   `docs: mettre à jour le guide d'installation` (pour la doc)
*   `refactor: nettoyer le contrôleur d'orchestration` (pour le nettoyage de code)
*   `test: ajouter des tests pour l'indexeur` (pour les tests)

### 3. Soumission de Pull Request (PR)
1. Poussez votre branche sur votre dépôt distant.
2. Ouvrez une Pull Request ciblant la branche `main` du projet d'origine.
3. Renseignez le modèle de PR en expliquant :
   - Le contexte du changement.
   - Les modifications majeures apportées.
   - La façon dont vous avez testé les changements.
   - Les risques potentiels ou régressions.

---

## 🎨 Standards de Code Appliqués

Pour assurer la cohérence et la maintenabilité du projet :
- **TypeScript strict** : Toutes les interfaces, types, paramètres et retours de fonction doivent être correctement typés. L'utilisation de `any` est proscrite sauf exception commentée.
- **Organisation Frontend** : Les composants React doivent être petits, modulaires, et situés dans les sous-dossiers appropriés de `src/components/`. Utilisez `clsx` pour les classes CSS dynamiques.
- **Organisation Backend** : Suivre l'architecture MVC simplifiée d'Express (les routes délèguent aux services ou aux gestionnaires de compétences `skills`).
- **Garde-fous de Sécurité** : Les manipulations de fichiers doivent systématiquement respecter la Sandbox. N'utilisez pas de méthodes d'écriture directe hors sandbox sans validation préalable.

---

## 🧪 Lancement des Tests & Qualité

Toutes les modifications backend critiques doivent s'accompagner de tests unitaires ou d'intégration.

### Exécuter la suite de tests
Pour lancer tous les tests unitaires du backend (`server/**/*.test.ts`) :
```bash
npm test
```

### Lancer le linter
Nous utilisons un linter interne pour vérifier les règles de formatage de base (longueur de ligne, console.logs résiduels, etc.) :
```bash
npm run lint
```

### Valider le typecheck
Avant de soumettre votre travail, assurez-vous que le projet compile sans erreur :
```bash
npx tsc --noEmit
```

---

## 🔎 Processus de Revue

Chaque Pull Request fait l'objet d'une revue systématique par les mainteneurs du projet.
1. **Vérification automatique** : Les tests unitaires et le linter doivent passer avec succès.
2. **Revue technique** : Un relecteur examine le code sous l'angle de la sécurité, de la lisibilité et de l'adéquation avec l'architecture.
3. **Validation & Fusion** : Une fois approuvée, la PR est fusionnée dans `main`.

---

## 📜 Code de conduite (Résumé)

- **Respect** : Soyez courtois, constructif et bienveillant dans les discussions de tickets ou de PR.
- **Collaboration** : Privilégiez la transparence. Si vous travaillez sur une refonte majeure, ouvrez un ticket de discussion préalable.
- **Responsabilité** : Assurez-vous de ne pas introduire de failles de sécurité (path traversal, injection de commande) et de tester rigoureusement vos contributions.
