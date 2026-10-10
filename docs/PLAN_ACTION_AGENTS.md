# Plan d'Action : Amélioration des Agents d'IA de Leanna

Ce document détaille le plan d'action pour optimiser les processus de délégation, renforcer la récupération d'erreurs et enrichir les prompts des agents d'IA.

## Vue d'ensemble de l'approche retenue
L'approche choisie est une **orchestration centralisée avec contrats d'agents**. Elle offre le meilleur compromis entre contrôle, fiabilité, observabilité et facilité de déploiement.

---

## Plan d'Exécution Détaillé

### 1. Cartographier l'architecture actuelle de Leanna
- [ ] Inventorier tous les agents existants (rôles, modèles, outils, sources de données).
- [ ] Documenter les flux actuels et les mécanismes de validation.
- [ ] Mesurer une ligne de base des performances (taux de réussite, taux d'erreur, coût).

### 2. Définir les rôles et frontières de responsabilité
- [ ] Créer un registre officiel des agents.
- [ ] Rédiger une fiche standardisée pour chaque agent incluant :
  - Mission principale
  - Types de tâches acceptées et refusées
  - Outils autorisés et limites opérationnelles.

### 3. Construire l'orchestrateur principal
- [ ] Implémenter un cycle fixe pour l'orchestrateur : classification, décomposition, sélection, contrôle, agrégation.
- [ ] Structurer le plan de tâche (JSON).
- [ ] Établir des conditions strictes pour éviter la délégation inutile.

### 4. Formaliser le processus de délégation
- [ ] Définir les déclencheurs de délégation basés sur les compétences, outils ou parallélisation.
- [ ] Établir le contenu obligatoire d'une demande de délégation (JSON).
- [ ] Mettre en place des règles anti-boucle (profondeur limitée, pas de circularité).

### 5. Mettre en place les boucles de récupération d'erreurs
- [ ] Distinguer les quatre types d'échecs : transitoire, validation, sémantique, sécurité.
- [ ] Automatiser les actions correctives pour chaque type d'erreur.
- [ ] Déployer une machine d'état pour le suivi des tâches (RECEIVED -> COMPLETED).

### 6. Enrichir les prompts des agents
- [ ] Structurer les prompts en couches : identité/mission, contexte opérationnel, méthode de travail, critères de qualité, format de sortie, exemples.
- [ ] Demander un résumé de raisonnement vérifiable.

### 7. Créer une mémoire de travail contrôlée
- [ ] Diviser la mémoire en quatre catégories : contexte de session, faits validés, préférences utilisateur, historique d'erreurs.
- [ ] Assurer la suppression des informations expirées.

### 8. Déployer une couche d'évaluation automatique
- [ ] Installer des évaluateurs indépendants (contrôles déterministes, évaluateurs par modèle, revue humaine).

### 9. Installer l'observabilité et l'audit
- [ ] Enregistrer les métadonnées de chaque exécution sans journaliser les données sensibles en clair.
- [ ] Assurer l'anonymisation et le contrôle d'accès aux logs.

### 10. Introduire progressivement les changements
- [ ] Suivre les phases : Préparation, Mode observation, Pilote limité, Extension contrôlée, Optimisation continue.

### 11. Définir les indicateurs de réussite
- [ ] Suivre les KPIs : taux de réussite, taux d'erreur, profondeur des chaînes, temps de réponse, coût.

### 12. Organiser la gouvernance
- [ ] Créer un comité de validation pour les changements de permissions, prompts et modèles.

---

## Points de Vigilance
- Ne pas confondre réponse bien formulée et réponse correcte.
- Limiter strictement la profondeur, le coût et la durée de la délégation.
- Versionner tous les prompts, contrats et schémas.
