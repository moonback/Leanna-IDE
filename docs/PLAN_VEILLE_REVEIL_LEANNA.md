# Plan — Veille automatique et réveil par le nom « Leanna »

**Objectif** : laisser la conversation vocale ouverte en permanence. Sans activité, Leanna passe en **veille** : elle n'envoie plus d'audio à Gemini et ne consomme plus de tokens. Elle se **réveille** quand on prononce « Leanna », sans clic.

## État actuel (constaté dans le code)

| Constat | Où | Conséquence |
|---|---|---|
| L'« auto-mute » est un compte à rebours fixe de N s qui démarre au démarrage ou au réveil. Il ne surveille pas l'inactivité. `resetAutoMute()` n'écrit que `lastActivityRef`, et aucun code ne lit cette valeur pour le timer. | `src/hooks/useAudio.ts:142-164` | Leanna se coupe au bout de 40 s **même en pleine conversation**. |
| En mode muet, `processCaptureFrame` sort immédiatement (`if (mutedRef.current) return;`). | `src/hooks/useAudio.ts:346` | Aucune trame micro n'est analysée : le réveil vocal est impossible. |
| Le réveil existe (`wake()`), mais seulement par clic sur l'orbe. | `useAudio.ts:167`, `useOrbState.ts` | — |
| Sur GoAway, `ws.onclose` appelle `cleanupAudio()`, qui remet `muted=false` puis reconnecte. | `src/hooks/useWebSocket.ts:205-230`, `useAudio.ts:453` | Pendant une longue veille, Leanna **se réveille toute seule** à chaque redémarrage de session Gemini (environ toutes les 10 min). |
| Le micro est en 16 kHz mono, avec `echoCancellation: true`. | `useAudio.ts:265-281` | C'est directement le format attendu par un détecteur hors ligne. |
| Les réglages `autoMuteEnabled` et `autoMuteTimeout` existent déjà. Le commentaire dit « Activé par défaut » alors que la valeur est `false`. | `UserProfileContext.tsx:78-131`, `BehaviorSection.tsx:49-68` | — |

## Décisions

1. **La session Gemini reste ouverte pendant la veille.** Veille = on n'envoie plus d'audio (le mécanisme muet existant). Une session inactive ne facture rien. Le réveil est donc instantané : pas de reconnexion de 1 à 2 s après « Leanna ». Le flag de veille doit **survivre** aux reconnexions GoAway (voir l'étape 2).
2. **Le mot de réveil est détecté hors ligne, dans le renderer, avec Vosk WASM (`vosk-browser`) en mode grammaire restreinte.** Le modèle est `vosk-model-small-fr`, environ 40 Mo, sous licence Apache-2.0. La grammaire est `["leanna", "léna", "liana", "[unk]"]`. Avantages : pas de compte, pas de clé, fonctionne en français, aucun entraînement nécessaire.
   - Option écartée : `webkitSpeechRecognition`, qui renvoie une erreur `network` dans Electron (pas de clés Google intégrées).
   - Option écartée : Porcupine. Il est plus précis mais exige une AccessKey Picovoice et un mot-clé entraîné sur leur console. C'est le plan B si Vosk se révèle trop gourmand ou imprécis.
   - Option écartée : openWakeWord, qui demande d'entraîner un modèle « Leanna » personnalisé.
   - Risque connu : `vosk-browser` 0.0.8 n'a pas bougé depuis décembre 2022. Il est figé mais fonctionnel. Il faut épingler la version.
3. **L'activité est définie largement.** Le compte à rebours repart à zéro dans chacun de ces cas : voix utilisateur au-dessus du seuil VAD, audio de Leanna en cours de lecture, outil en cours (`isBusyRef`), message texte envoyé.

---

## Step 1 — Corriger le timer d'inactivité (auto-mute → vraie veille sur inactivité)

Le timer de `useAudio.ts` est un compte à rebours fixe. Il doit devenir un vrai timer d'inactivité : toute activité le remet à zéro (voix au-dessus du seuil VAD via `resetAutoMute`, lecture audio de Leanna via `playAudioChunk`, outil en cours, texte envoyé). Il ne doit jamais endormir Leanna pendant qu'elle parle ou exécute un outil.

Critères d'acceptation :
- Un test vitest avec de faux timers montre que l'activité repousse la veille, et que N s sans activité déclenchent la veille.
- La veille ne se déclenche pas pendant la lecture audio ou quand `isBusy` est vrai.
- Le second consommateur, `useNotebookLive.ts`, n'est pas cassé.

## Step 2 — Ajouter le réveil vocal par le nom « Leanna »

Ajouter la détection du mot de réveil en veille.
- Un Web Worker charge `vosk-browser` avec le modèle `vosk-model-small-fr`, servi en local depuis `public/models/`. Le modèle est inclus dans le build Electron (vérifier `extraResources`/asar).
- Dans `processCaptureFrame`, **avant** le `return` du mode muet : en veille, les trames 16 kHz partent au worker et non à Gemini.
- Quand le worker reconnaît « leanna » (ou une variante de la grammaire) : appel de `wake()`, son de réveil via `src/lib/sound.ts`, puis envoi d'un pré-buffer d'environ 1,5 s à Gemini. Ainsi, « Leanna, ouvre X » fonctionne d'une seule traite.
- Le flag de veille doit survivre aux reconnexions GoAway : `cleanupAudio` ne doit plus forcer le réveil quand la fermeture vient d'un GoAway.
- Le worker ne tourne qu'en veille.

Critères d'acceptation :
- Un test unitaire couvre la correspondance des variantes du nom, ainsi que l'absence de réveil sur un texte sans le nom.
- Un test vérifie qu'une reconnexion GoAway conserve l'état de veille.
- Aucune trame n'est envoyée à Gemini pendant la veille.

## Step 3 — Changer l'UI et les réglages : « Veille automatique » et « Réveil par le nom »

Dans `BehaviorSection.tsx`, renommer « Mode muet automatique » en « Veille automatique ». Ajouter un interrupteur « Réveil par le nom (Leanna) » : nouveau champ `wakeWordEnabled` dans `UserProfileContext`, activé par défaut. Corriger le commentaire du défaut d'`autoMuteEnabled`, qui doit dire la même chose que la valeur.

Dans `useOrbState.ts`, ajouter un état `sleeping`, avec une couleur ou une animation lente et un tooltip « En veille — dites "Leanna" ». Le clic sur l'orbe réveille toujours Leanna.

Critères d'acceptation :
- L'interrupteur est persisté dans le profil.
- L'orbe affiche `sleeping` en veille et revient à `listening` au réveil.
- L'interrupteur désactivé coupe le worker Vosk.
