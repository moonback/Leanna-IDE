# Skill : Workflow (`server/skills/workflow.ts`)

Ce skill permet à l'IA de créer, gérer et exécuter des workflows, qui sont des séquences d'actions automatisées. Ces workflows peuvent être planifiés pour s'exécuter à intervalles réguliers.

## Outils Exposés

Ce skill est principalement utilisé via le skill `automation.ts`, mais il contient la logique pour :

*   Définir des workflows avec plusieurs étapes, conditions et gestion d'erreurs.
*   Planifier l'exécution de workflows.
*   Exécuter des workflows et suivre leur état.

## Autonomie

Ce skill est fondamental pour l'autonomie car il permet à l'IA de programmer des séquences d'actions complexes et de les laisser s'exécuter sans supervision directe, que ce soit de manière ponctuelle ou planifiée.

**Pistes d'amélioration pour l'autonomie :**
*   Permettre à l'IA de créer des workflows de manière dynamique pour résoudre des problèmes spécifiques rencontrés lors de l'exécution d'une mission.
*   Intégrer des capacités de raisonnement dans les workflows pour permettre des décisions conditionnelles plus complexes basées sur les résultats des étapes précédentes.
