import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const files = [
  "src/components/UnifiedSidebar.tsx",
  "src/components/TokenCounter.tsx",
  "src/components/ThemeToggle.tsx",
  "src/components/HelpButton.tsx",
  "src/components/panels/SystemLogsPanel.tsx",
  "src/components/panels/PromptContextIndicator.tsx",
  "src/components/panels/ScreenSharePanel.tsx",
  "src/components/panels/SessionTranscriptPanel.tsx",
  "src/components/panels/AuditPanel.tsx",
  "src/components/panels/SkillsPanel.tsx",
  "src/components/panels/WorkspacePanel.tsx",
  "src/components/notebooks/ImportToNotebookButton.tsx",
  "src/components/ide/ActivityFeed.tsx",
  "src/components/ide/AIConnectionBanner.tsx",
  "src/components/ide/ChatCards.tsx",
  "src/components/ide/Breadcrumb.tsx",
  "src/components/ide/RenameInput.tsx",
  "src/components/ide/CheckpointPanel.tsx",
  "src/components/ide/MultiAgentIndicator.tsx",
  "src/components/ide/AssistantActivityBar.tsx",
  "src/components/ide/sidebar/AgentsSidebarButton.tsx",
  "src/components/ide/sidebar/FlyoutMenu.tsx",
  "src/components/ide/sidebar/SidebarItem.tsx",
  "src/components/ide/sidebar/SidebarSection.tsx",
  "src/components/ide/sidebar/index.ts",
  "src/components/sidebar/AgentStatusBlock.tsx",
  "src/components/sidebar/ModeToggleButton.tsx",
  "src/components/sidebar/buildAIMenuItems.ts",
  "src/components/sidebar/useIDEState.ts",
  "src/components/sidebar/index.ts",
  "src/hooks/useHotkeys.ts",
  "src/hooks/useAmplitude.ts",
  "src/hooks/useSupabaseMemories.ts",
  "src/hooks/useSidebarExpanded.ts"
];

let deleted = 0;
let absent = 0;

for (const relPath of files) {
  const fullPath = path.resolve(relPath);
  if (fs.existsSync(fullPath)) {
    try {
      execSync(`git rm -f "${relPath}"`, { stdio: 'ignore' });
    } catch {
      fs.unlinkSync(fullPath);
    }
    console.log(`Supprimé : ${relPath}`);
    deleted++;
  } else {
    console.log(`Absent : ${relPath}`);
    absent++;
  }
}

// Clean empty dir if exists
const emptyDir = path.resolve('src/components/ide/sidebar');
if (fs.existsSync(emptyDir)) {
  try {
    fs.rmdirSync(emptyDir);
  } catch {}
}

console.log(`\nBilan: ${deleted} supprimé(s), ${absent} absent(s).`);
