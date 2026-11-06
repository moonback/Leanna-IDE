# Sécurisation et gestion des secrets — état d'implémentation

> Mise à jour : 2026-11-06 · Ce document remplace la checklist initiale non actualisée.
> Il décrit les éléments visibles dans le code versionné, pas l'état du fichier `.env`
> d'une machine ni la validité de clés déjà émises.

## 1. État vérifié dans le dépôt

| Chantier initial | État | Preuve / limite |
|---|---|---|
| Validation stricte avec Zod | **Implémenté** | `server/config/env.ts` définit `envSchema` et `parseEnv` |
| Validation inter-champs Supabase | **Implémenté** | `server/config/environment.ts` impose URL et service-role key ensemble |
| Variables connues typées | **Partiel** | Schéma explicite pour les variables recensées ; `.passthrough()` conserve les autres variables historiques |
| Fichier modèle sans secrets | **Présent** | `.env.example` existe ; son contenu doit être revu à chaque ajout de variable |
| Remplacement de tous les accès directs à `process.env` | **Non certifié** | Le schéma n'établit pas que tous les appelants utilisent exclusivement `getEnv()` |
| Gestionnaire externe de secrets / chiffrement global de configuration | **Non établi** | Aucun gestionnaire externe n'est démontré par les fichiers vérifiés ici |
| Nettoyage des secrets d'une installation | **Hors vérification GitHub** | Le contenu du `.env` local et les secrets réellement déployés ne sont pas accessibles par cet audit |

## 2. Architecture de validation présente

- `server/config/env.ts` : schéma Zod, normalisation des chaînes vides, validation des
  URLs, booléens, enums et entiers, puis conservation des variables non encore migrées.
- `server/config/environment.ts` : validation inter-champs et agrégation des erreurs.
- `.env.example` : modèle de configuration à maintenir sans valeur secrète réelle.

Le schéma centralise la validation des variables connues, mais ne doit pas être décrit comme
une migration terminée de tous les accès d'environnement : le mode `.passthrough()` indique
explicitement que des variables historiques peuvent encore exister hors du schéma.

## 3. Actions restantes

1. Inventorier les lectures directes de `process.env` et distinguer les variables déjà
   validées des variables encore historiques.
2. Migrer progressivement les consommateurs vers `getEnv()` ou une interface typée unique,
   sans casser les tests ni les scripts.
3. Vérifier que chaque variable utilisée en production est documentée dans `.env.example`
   sans valeur réelle.
4. Ajouter un contrôle CI qui détecte les nouvelles variables non documentées et les secrets
   accidentellement committés.
5. Vérifier séparément les secrets locaux et déployés : rotation/révocation des clés exposées,
   stockage sécurisé, permissions et sauvegarde des clés maîtresses.
6. Documenter les procédures de rotation et de restauration sans publier les valeurs.

## 4. Procédure de validation recommandée

Depuis la racine du dépôt :

```bash
npm run typecheck
npm test
```

Ces commandes vérifient le code selon les scripts actuels ; elles ne prouvent pas qu'aucun
secret n'existe dans les environnements locaux ou distants. Compléter par un scanner de secrets
sur l'historique Git et les fichiers suivis, sans afficher les valeurs détectées dans les logs.

## 5. Références

- `server/config/env.ts`
- `server/config/environment.ts`
- `.env.example`
- `server/config/` et les appelants de `getEnv()`
