# Audit — Prochaines étapes

## Décisions attendues du mainteneur

1. **UX-001** : rendre `Leanna_MASTER_KEY` non éditable dans l'écran des paramètres, ou implémenter un re-chiffrement des secrets lors de son changement. Aujourd'hui, la changer rend tous les secrets chiffrés illisibles au redémarrage.
2. **CFG-001** : retirer de l'index git `.Leanna-telegram.json` et les `.project-*.json.tmp_*` (`git rm --cached`), en sachant que les autres clones perdront ces fichiers au prochain pull. Prévenir les contributeurs avant.
3. **BUG-004** : choisir l'architecture du Worker de sandbox des plugins :
   - soit un point d'entrée dédié, bundlé à part par esbuild (ex. `dist/skill-worker.cjs`) ;
   - soit, en dev, la transmission explicite du loader tsx au Worker.
   Aujourd'hui `LEANNA_PLUGIN_SANDBOX=true` ne fonctionne pas.

## Corrections recommandées (non faites dans cette session)

| Priorité | Sujet | Proposition |
|---|---|---|
| P2 | Dépendances de dev vulnérables (18 restantes après `npm audit fix`, dont 3 critiques) | Analyser `npm audit` (sans `--omit=dev`) : les correctifs restants exigent des montées de version majeures (`--force`) et sont à tester un par un. |
| P3 | 3 erreurs ESLint préexistantes (`ide.ts:533` `prefer-const`, `TelegramService.ts:928/961` `no-useless-escape`) | Corrections triviales, non faites pour garder les commits ciblés. |
| P3 | Environ 5 400 avertissements de lint (lint maison) | Traiter par module, en commençant par `no-explicit-any` sur les routes sensibles. |
| P3 | TEST-004 : tests dépendant du réseau ou du binaire `graphify` | Les marquer comme tests d'intégration (`skip` conditionnel explicite avec raison), ou injecter le résolveur DNS. |

## Zones non auditées en profondeur (à couvrir au prochain cycle)

- `server/live/LiveSocketHandler.ts` (2 000+ lignes) : sessions vocales et exécution d'outils.
- `server/mission/*` et `server/agents/*` : exécuteurs multiples, signalés comme doublons dans `audite.md`.
- `server/routes/self-root.ts` : `scaffold` lance des commandes, `clone` accepte un `targetDir` arbitraire.
- `server/mcp/McpClient.ts` : lancement de serveurs MCP via shell sous Windows.
- Frontend : accessibilité, états d'erreur et gros composants (`ChatPanel`, `IdeView`, `TerminalPanel`).
- Tests end-to-end avec navigateur : non lancés dans cette session.
