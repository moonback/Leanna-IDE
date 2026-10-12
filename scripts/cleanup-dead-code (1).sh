#!/usr/bin/env bash
# Étape 1 — Suppression du code mort du front (34 fichiers, ~4 000 lignes).
# Usage (depuis la racine du dépôt) :  bash cleanup-dead-code.sh [--dry-run]
#
# Chaque fichier a été vérifié : aucun import (hors commentaires) dans src/, server/,
# electron/, scripts/ ni dans les tests. Conservés volontairement :
#   src/components/sidebar/types.ts            (utilisé par GlobalSidebar)
#   src/components/sidebar/QuitConfirmDialog.tsx (utilisé par StartupProjectModal)
set -euo pipefail

DRY=0; [ "${1:-}" = "--dry-run" ] && DRY=1
USE_GIT=0; git rev-parse --is-inside-work-tree >/dev/null 2>&1 && USE_GIT=1

FILES=(
  "src/components/UnifiedSidebar.tsx"
  "src/components/TokenCounter.tsx"
  "src/components/ThemeToggle.tsx"
  "src/components/HelpButton.tsx"
  "src/components/panels/SystemLogsPanel.tsx"
  "src/components/panels/PromptContextIndicator.tsx"
  "src/components/panels/ScreenSharePanel.tsx"
  "src/components/panels/SessionTranscriptPanel.tsx"
  "src/components/panels/AuditPanel.tsx"
  "src/components/panels/SkillsPanel.tsx"
  "src/components/panels/WorkspacePanel.tsx"
  "src/components/notebooks/ImportToNotebookButton.tsx"
  "src/components/ide/ActivityFeed.tsx"
  "src/components/ide/AIConnectionBanner.tsx"
  "src/components/ide/ChatCards.tsx"
  "src/components/ide/Breadcrumb.tsx"
  "src/components/ide/RenameInput.tsx"
  "src/components/ide/CheckpointPanel.tsx"
  "src/components/ide/MultiAgentIndicator.tsx"
  "src/components/ide/AssistantActivityBar.tsx"
  "src/components/ide/sidebar/AgentsSidebarButton.tsx"
  "src/components/ide/sidebar/FlyoutMenu.tsx"
  "src/components/ide/sidebar/SidebarItem.tsx"
  "src/components/ide/sidebar/SidebarSection.tsx"
  "src/components/ide/sidebar/index.ts"
  "src/components/sidebar/AgentStatusBlock.tsx"
  "src/components/sidebar/ModeToggleButton.tsx"
  "src/components/sidebar/buildAIMenuItems.ts"
  "src/components/sidebar/useIDEState.ts"
  "src/components/sidebar/index.ts"
  "src/hooks/useHotkeys.ts"
  "src/hooks/useAmplitude.ts"
  "src/hooks/useSupabaseMemories.ts"
  "src/hooks/useSidebarExpanded.ts"
)

n=0; absent=0
for f in "${FILES[@]}"; do
  if [ ! -f "$f" ]; then echo "absent (déjà supprimé ?) : $f"; absent=$((absent+1)); continue; fi
  if [ $DRY -eq 1 ]; then echo "[dry-run] supprimerait $f"; n=$((n+1)); continue; fi
  if [ $USE_GIT -eq 1 ]; then git rm -q -- "$f"; else rm -- "$f"; fi
  n=$((n+1))
done

echo "→ $n fichier(s) traité(s), $absent absent(s)."
[ $DRY -eq 1 ] && exit 0
# Dossiers devenus vides
rmdir src/components/ide/sidebar 2>/dev/null || true
echo "Ensuite : npx tsc --noEmit && npm test"
