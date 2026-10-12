# Plan d'Amélioration des Documents Riches et Interactifs

Ce plan détaille les étapes pour améliorer le formatage, la présentation et les fonctionnalités des documents riches et interactifs générés par Leanna.

## Sommaire

1. [Introduction](#1-introduction)
2. [Améliorations des Tableaux](#2-améliorations-des-tableaux)
3. [Sections Repliables](#3-sections-repliables)
4. [Formats d'Exportation](#4-formats-d'exportation)
5. [Cohérence Visuelle et CSS](#5-cohérence-visuelle-et-css)

## 1. Introduction

L'objectif est d'enrichir l'expérience utilisateur lors de la consultation des documents générés en ajoutant des fonctionnalités d'interaction avancées et en assurant une cohérence visuelle stricte avec le design system du projet.

## 2. Améliorations des Tableaux

Pour les blocs de type `table`, les améliorations suivantes sont prévues :

- **Tri des colonnes** : Permettre aux utilisateurs de trier les données par ordre croissant ou décroissant en cliquant sur les en-têtes de colonnes.
- **Pagination** : Ajouter une pagination pour les tableaux contenant un grand nombre de lignes afin d'améliorer la lisibilité et les performances.
- **Sélection de lignes** : Permettre la sélection de lignes pour des actions groupées (copie, export spécifique).

## 3. Sections Repliables

Pour les documents longs ou comportant de nombreux blocs :

- **Blocs repliables** : Ajouter une option pour rendre les titres de blocs (`BlockTitle`) cliquables afin de masquer ou afficher le contenu du bloc.
- **État initial** : Permettre de définir l'état initial (replié/déplié) dans la configuration du bloc.

## 4. Formats d'Exportation

Actuellement, seul l'export CSV est disponible pour les tableaux.

- **Export PDF** : Intégrer une bibliothèque d'exportation PDF pour permettre de générer des rapports imprimables.
- **Export JSON** : Ajouter une option pour télécharger la structure brute du document.

## 5. Cohérence Visuelle et CSS

- **Variables CSS** : S'assurer que tous les composants utilisent exclusivement les variables CSS définies dans le projet (ex: `var(--bg-secondary)`, `var(--text-muted)`).
- **Adaptation Thématique** : Vérifier le comportement des composants lors du basculement entre les thèmes clair et sombre.
