# Orb — 20 fonctionnalités à venir

Propositions de nouvelles fonctionnalités pour la vue **Orb Live** (`src/views/OrbLiveView.tsx`),
la fenêtre « présence vocale » plein écran de Leanna. Chaque idée s'appuie sur l'existant :
orb animé réactif à l'audio, contrôles (connexion, micro, partage d'écran, modes Full/Ask),
visualiseur audio, saisie texte et flux d'activité des agents / missions / outils.

> Légende effort : 🟢 faible · 🟡 moyen · 🔴 élevé

---

## 1. Transcription en direct (sous-titres)
Afficher en temps réel la transcription de la parole de l'utilisateur et des réponses de
Leanna sous l'orbe, avec défilement automatique et distinction visuelle des interlocuteurs.
Améliore l'accessibilité et permet de relire la conversation. 🟡

## 2. Historique de conversation persistant
Conserver et rejouer les échanges vocaux passés d'une session à l'autre, avec recherche
plein texte et export (Markdown / JSON). 🟡

## 3. Barre de commandes rapides (slash commands)
Un palette `/` dans la saisie texte pour déclencher des actions courantes (lancer une
mission, changer de mode, couper le micro, résumer la session) sans quitter l'orbe. 🟢

## 4. Indicateur de qualité réseau / latence
Afficher la latence de la session live et la qualité de connexion (ping, perte de paquets)
près du minuteur, avec alerte visuelle en cas de dégradation. 🟢

## 5. Choix multi-voix et vitesse de parole
Permettre de choisir la voix de synthèse, la langue et la vitesse de lecture directement
depuis la fenêtre orb, avec aperçu audio instantané. 🟡

## 6. Mode push-to-talk
Alternative au micro toujours ouvert : maintenir une touche (ou un clic long sur l'orbe)
pour parler, utile dans les environnements bruyants. 🟢

## 7. Détection de silence / coupure automatique du micro
Couper automatiquement le micro après un délai d'inactivité configurable, puis le
réactiver à la détection de voix (VAD), pour économiser bande passante et confidentialité. 🟡

## 8. Épinglage et filtres du flux d'activité
Épingler une mission ou un agent en haut du panneau Activité, et filtrer par statut
(en cours / terminé / échoué) ou par type (missions, agents, outils). 🟢

## 9. Export du journal d'activité de session
Bouton pour exporter l'intégralité du suivi (missions, agents, outils, horodatages,
durées) en Markdown ou CSV pour audit et reporting. 🟢

## 10. Minuteur et statistiques de session
Afficher en fin de session un récapitulatif : durée totale, nombre de missions, d'actions
d'outils, taux de réussite, et temps de parole réparti. 🟡

## 11. Prévisualisation du partage d'écran
Afficher une miniature en direct de l'écran partagé dans un coin de la fenêtre orb, avec
possibilité de choisir la fenêtre / l'écran à partager. 🔴

## 12. Annotations visuelles sur l'écran partagé
Permettre à Leanna de dessiner ou de pointer des zones sur l'écran partagé (surlignage,
flèches) pour guider l'utilisateur pendant une démonstration. 🔴

## 13. Interruption vocale (barge-in)
Détecter quand l'utilisateur parle pendant que Leanna répond et interrompre proprement la
synthèse pour une conversation plus naturelle. 🟡

## 14. Alertes et notifications de mission
Notification visuelle (et sonore optionnelle) lorsqu'une mission se termine, échoue ou
requiert une validation en mode Ask, même si le panneau d'activité est scrollé. 🟢

## 15. Validation inline en mode Ask
Quand Leanna demande une confirmation avant d'agir, afficher des boutons
Approuver / Refuser / Modifier directement dans le flux d'activité. 🟡

## 16. Thèmes et personnalisation de l'orbe
Choix de palettes, formes et styles d'animation de l'orbe (couleur d'accent liée au
profil), avec aperçu live et respect de `prefers-reduced-motion`. 🟢

## 17. Raccourcis clavier globaux
Raccourcis configurables pour connecter/déconnecter, couper le micro, basculer Full/Ask et
ouvrir la saisie, affichés dans une aide contextuelle (`?`). 🟢

## 18. Multi-sessions / onglets de présence
Gérer plusieurs sessions live en parallèle (ex. une par projet) avec bascule rapide et
indicateur d'activité par session. 🔴

## 19. Mémoire contextuelle visible
Afficher les éléments de contexte / mémoire que Leanna utilise pour la session en cours
(fichiers ouverts, mission active, notes), avec possibilité d'en ajouter / retirer. 🟡

## 20. Mode compact / widget flottant
Réduire l'orbe en un petit widget flottant toujours visible par-dessus les autres fenêtres,
montrant le statut et un indicateur d'activité, avec retour en plein écran au clic. 🟡

---

### Priorisation suggérée (gains rapides)
1. Transcription en direct (#1) — accessibilité et valeur immédiate
2. Slash commands (#3) — productivité, faible effort
3. Validation inline en mode Ask (#15) — fiabilise le mode Ask existant
4. Épinglage / filtres du flux d'activité (#8) — exploite le suivi déjà en place
5. Alertes de mission (#14) — meilleure visibilité des événements importants
