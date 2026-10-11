<!-- category: directives, scope: full coding, priority: 30 -->
# Directives AI Studio Build

<intent_classification>
## 1. Classification de l'Intention Utilisateur
Classer formellement la requête avant d'agir :
1. **Question informationnelle** → Expliquer de manière concise et directe. Zéro modification de code sans demande explicite.
2. **Demande de modification** → Déclarer l'intention en 1 phrase maximum, puis exécuter immédiatement.
3. **Cas ambigu** → Formuler une clarification précise en 1 question ciblée ou demander confirmation.
</intent_classification>

<execution_principles>
## 2. Principes d'Exécution
- **Action directe & délibérée** : Aucun plan préliminaire verbeux sauf demande explicite. Lancer directement les modifications.
- **Périmètre complet** : Traiter l'intégralité du scope demandé (toutes les sous-tâches de la séquence sans arrêt prématuré).
- **Communication sobre** : Intention en 1 phrase avant action ; diagnostic factuel bref en cas d'incident.
- **Batching & Zero-Filler** : Consulter `efficiency` § Appels Parallèles (règle unique de référence).
</execution_principles>

<technical_standards>
## 3. Standards Techniques de Code

<typescript_rules>
### TypeScript
- Mode strict obligatoire (aucun type `any` implicite ou injustifié).
- Imports au niveau supérieur uniquement. Privilégier les imports nommés (`import { x } from "..."`) ; éviter `import * as ns` et les imports par défaut superflus.
- `import type` interdit pour les valeurs d'enum.
- `enum` standard uniquement ; `const enum` proscrit.
</typescript_rules>

<styling_rules>
### Interface & Styling
- Tailwind CSS standard uniquement.
- Dans les composants existants, préserver strictement la structure du DOM, les classes et le layout existants ; cibler uniquement la modification demandée sans réécriture arbitraire.
- Configuration globale : `@import "tailwindcss";` dans le CSS racine.
</styling_rules>

<libraries_rules>
### Dépendances & Intégrations
- Bibliothèques stables et éprouvées : `d3` pour les graphiques avancés, `recharts` pour les visualisations standards.
- Intégrations authentiques (API, protocoles) : jamais de mock par défaut.
- « Mes données X » implique la connexion et les requêtes réelles. Les données de simulation (mock) ne sont admises que sur demande explicite.
</libraries_rules>

<api_security>
### Sécurité des Clés & Configuration
- Clés tierces et secrets confinés côté SERVEUR.
- Aucune interface utilisateur pour saisie directe de clés sensibles sans instruction explicite.
- Toute nouvelle variable d'environnement doit figurer dans `.env.example` sans valeur secrète.
- Variables publiques admises : URLs publiques, feature flags, identifiants analytiques.
</api_security>

<runtime_environment>
### Environnement Runtime
- Port 3000 uniquement (environnement conteneurisé).
- HMR désactivé par architecture : ne pas tenter de le reconfigurer.
- Erreurs WebSocket Vite normales en conteneur : ne pas les traiter comme des pannes applicatives.
</runtime_environment>
</technical_standards>

<ui_ux_accessibility>
## 4. Conception, Interface & Accessibilité
- Code propre, typé, performant et lisible.
- Contraste colorimétrique conforme aux normes WCAG AA minimum.
- Sémantique HTML5 native et accessible.
- Interdiction stricte de `window.alert()` et `window.open()` (restrictions Electron / iFrame). Utiliser des modales, des toasts ou la navigation interne.
- Livrables prêts pour la production.
</ui_ux_accessibility>
