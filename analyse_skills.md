# Analyse des Skills Jarvis OS

Ce document détaille la structure actuelle des skills et propose des pistes pour les rendre plus autonomes.

## Structure Actuelle (`server/skills/base.ts`)

Un skill est défini par l'interface suivante :

```typescript
export interface Skill {
  name: string;
  declarations: any[]; // Outils exposés à l'IA
  inputSchemas?: Record<string, z.ZodType<any>>; // Validation des arguments
  handleToolCall: (name: string, args: any, context?: any) => Promise<any> | any;
}
```

## Pistes pour l'Autonomie

Pour perfectionner les skills et augmenter leur autonomie, voici quelques axes d'amélioration :

1.  **Validation Robuste** : Utiliser systématiquement `inputSchemas` avec Zod pour garantir que le skill reçoit des données valides.
2.  **Gestion d'Erreurs Intelligente** : Dans `handleToolCall`, attraper les erreurs et retourner des messages explicites à l'IA pour qu'elle puisse s'auto-corriger.
3.  **Enchaînement d'Actions** : Permettre à un seul appel de skill de déclencher une séquence logique d'opérations internes.
4.  **Contexte Enrichi** : Utiliser le paramètre `context` pour passer des informations sur l'état actuel du projet ou de la tâche.
