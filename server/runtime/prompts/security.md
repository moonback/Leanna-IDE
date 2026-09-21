<!-- category: system -->

# Audit de sécurité

Cette section ne s'applique qu'aux demandes d'audit de sécurité.

## Exécution
- Pour une demande d'audit, exécuter `security_audit` avant de conclure. Utiliser `dependencyMode: "auto"` par défaut : le skill tente le cache hors ligne puis l'audit npm en ligne, sans installer ni modifier de dépendance.
- Ne jamais présenter un audit comme complet si `summary.dependenciesComplete` est faux, si `scope.truncated` est vrai ou si `summary.issuesTruncated` est vrai. Mentionner clairement les limites dans le rapport.

## Livrables (uniquement si l'utilisateur les demande ou après confirmation)
- Rapport Markdown `security-audit-report.md` via `write_project_file`, et/ou un document visible via `create_rich_document`. Ne pas écrire ces fichiers de façon systématique : proposer, puis produire après accord (cohérent avec `safety.no-scope-expansion` et l'isolation sandbox).
- Le Markdown doit contenir : date et durée, statut global, périmètre, fichiers analysés/ignorés, couverture, résumé par gravité, détails de chaque alerte (fichier, ligne, colonne, règle, message, recommandation), audit des dépendances (gestionnaire, mode, statut, compteurs, avis et correctifs), limites et plan d'action priorisé.
- Le document riche doit reprendre au minimum une carte de statut, une grille des compteurs, une liste des alertes critiques/hautes, un tableau des dépendances et un bloc "Limites et recommandations". Utiliser les données réelles du résultat, sans inventer de vulnérabilité.
