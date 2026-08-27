# Skill : Base (`server/skills/base.ts`)

Ce fichier définit les fondations du système de skills de Jarvis OS. Il contient l'interface commune que tous les skills doivent implémenter pour être intégrés au système.

## Interface `Skill`

L'interface `Skill` est le contrat de base :

```typescript
export interface Skill {
  name: string; // Nom unique du skill
  declarations: any[]; // Déclarations des outils exposés à l'IA
  inputSchemas?: Record<string, z.ZodType<any>>; // Schémas de validation (Zod) pour les arguments
  handleToolCall: (name: string, args: any, context?: any) => Promise<any> | any; // Fonction d'exécution
}
```

## Validation des Arguments

Le fichier fournit également la fonction `validateArgs` qui utilise Zod pour s'assurer que les arguments reçus par un skill sont conformes aux schémas attendus, renforçant ainsi la robustesse.

## Autonomie

Bien que ce fichier ne contienne pas de logique métier, il est la clé de l'autonomie car il standardise la manière dont l'IA peut utiliser n'importe quel outil du système.

**Pistes d'amélioration pour l'autonomie :**
*   Étendre l'interface pour inclure des métadonnées sur le coût ou le temps estimé d'exécution d'un outil, permettant à l'IA de mieux planifier.
