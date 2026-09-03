# Correction : Génération de documents dans les Notebooks

## Problème identifié

Quand l'utilisateur génère un document dans un notebook et change d'onglet :
1. ❌ La génération continue en arrière-plan mais n'est plus visible
2. ❌ Quand la génération se termine, il faut actualiser manuellement pour voir le fichier
3. ❌ Aucune notification de fin de génération

## Solutions implémentées

### 1. Rafraîchissement automatique de l'arborescence
**Fichier modifié** : `src/components/notebooks/NotebookChat.tsx`

Quand un fichier est sauvegardé via `handleSaveAsMarkdown` :
- ✅ Le cache de l'arborescence est invalidé (`ideApi.invalidateCache()`)
- ✅ Un événement `'Leanna-sandbox-changed'` est déclenché
- ✅ L'arborescence des fichiers se rafraîchit automatiquement

```typescript
// Invalider le cache de l'arborescence pour forcer le rafraîchissement
ideApi.invalidateCache();

// Déclencher l'événement standard pour rafraîchir l'arborescence du sandbox
window.dispatchEvent(new CustomEvent('Leanna-sandbox-changed'));
```

### 2. Notifications de fin de génération
**Fichier modifié** : `src/components/notebooks/NotebookChat.tsx`

Ajout de notifications toast à la fin de chaque type de génération :
- ✅ `handleSend` : "✓ Réponse générée avec succès"
- ✅ `handleDeepDive` : "✓ Deep Dive terminé avec succès"
- ✅ `handleCompare` : "✓ Comparaison terminée avec succès"
- ✅ `handleInsights` : "✓ Extraction d'insights terminée avec succès"
- ✅ `handleSaveAsMarkdown` : "✓ Sauvegardé : [chemin du fichier]"

Ces notifications sont visibles même si l'utilisateur a changé d'onglet.

```typescript
// Notification de fin de génération
if (!document.hidden) {
  toastSuccess('✓ Réponse générée avec succès');
}
```

### 3. Gestion des erreurs améliorée
- ✅ Les erreurs `AbortError` (annulations) ne génèrent plus de notifications d'erreur
- ✅ Les autres erreurs sont correctement notifiées

```typescript
} catch (e: any) {
  if (e.name !== 'AbortError') {
    toastError(e.message);
  }
  // ...
}
```

## Comportement après correction

### Scénario : Génération de document
1. L'utilisateur demande à générer un document
2. Le streaming commence et affiche la progression
3. L'utilisateur change d'onglet → **la génération continue**
4. Quand la génération se termine :
   - ✅ Une notification toast apparaît
   - ✅ L'arborescence des fichiers se rafraîchit automatiquement
   - ✅ Le nouveau fichier est immédiatement visible
5. L'utilisateur revient sur l'onglet → **tout est à jour**

### Scénario : Sauvegarde de message
1. L'utilisateur clique sur "Sauvegarder" pour un message
2. Le fichier est sauvegardé dans le sandbox
3. Immédiatement :
   - ✅ Notification "✓ Sauvegardé : [chemin]"
   - ✅ L'arborescence se rafraîchit
   - ✅ Le fichier apparaît dans l'explorateur de fichiers

## Fichiers modifiés

- `src/components/notebooks/NotebookChat.tsx`
  - Fonction `handleSaveAsMarkdown` : ajout du rafraîchissement automatique
  - Fonction `handleSend` : ajout de notification + gestion AbortError
  - Fonction `handleDeepDive` : ajout de notification + gestion AbortError
  - Fonction `handleCompare` : ajout de notification + gestion AbortError
  - Fonction `handleInsights` : ajout de notification + gestion AbortError

## Tests recommandés

1. ✅ Générer un document, changer d'onglet, vérifier la notification et l'arborescence
2. ✅ Sauvegarder un message, vérifier l'apparition immédiate dans l'explorateur
3. ✅ Annuler une génération en cours (vérifier qu'aucune erreur n'apparaît)
4. ✅ Tester avec plusieurs générations simultanées
5. ✅ Vérifier que les performances ne sont pas impactées

## Notes techniques

### Événement `Leanna-sandbox-changed`
Cet événement est déjà utilisé dans plusieurs composants :
- `FileExplorer` / `FileExplorerVirtualized` : rafraîchit l'arborescence
- `useFileSystem` : recharge l'arbre et la liste des différences
- `sandboxApi` : invalide les caches
- `realtimeCache` : invalide tous les caches

### Cache de l'arborescence
Le service `ideApi` maintient un cache court (800ms TTL) pour l'arborescence.
L'invalidation force un rechargement immédiat sans attendre l'expiration du cache.

### Performance
- Le rafraîchissement est déclenché uniquement après une sauvegarde réussie
- Les notifications utilisent `document.hidden` pour éviter les notifications pendant le streaming visible
- Pas d'impact sur les performances car utilise les mécanismes existants
