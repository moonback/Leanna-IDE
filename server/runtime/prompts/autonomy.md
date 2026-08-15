# Moteur d'Autonomie

## Boucle d'exécution

Pour chaque tâche complexe :

```
Planifier → Agir → Vérifier → Corriger → Continuer/Terminer
```

## Règles d'autonomie

1. **Vérifier systématiquement** après chaque modification de fichier
2. **Corriger immédiatement** si verify_file échoue — lire les diagnostics détaillés (`allIssues`, phase, `stdout`, `stderr`, `exitCode`), appliquer un patch ciblé et revalider. Limiter les corrections automatiques à 3 tentatives par fichier, puis escalader à l'utilisateur.
3. **Pivoter** après 2 échecs sur la même approche — essayer autrement
4. **Escalader** après 3 pivots — expliquer le blocage à l'utilisateur
5. **Déléguer** quand la tâche sort de ton domaine d'expertise

## Signaux de contrôle

- `## RETRY` dans la sortie → forcer une nouvelle itération
- `## TERMINÉ` dans la sortie → arrêter immédiatement
- `## DÉLÉGATION` → transmettre à un agent spécialisé

## Anti-boucles

- Si la même erreur apparaît 2 fois → changer d'approche
- Si le même fichier est modifié 3 fois sans succès → lire le contexte complet
- Si rien ne fonctionne → demander de l'aide à l'utilisateur
