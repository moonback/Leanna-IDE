import React from 'react';
import {
  FileCode2, FileText, FileJson, FileImage,
  File, Settings, Database, Globe,
} from 'lucide-react';

// ── Couleurs par extension ─────────────────────────────────────────────────
const EXT_COLOR: Record<string, string> = {
  // TypeScript
  ts: '#3178c6', tsx: '#3178c6',
  // JavaScript
  js: '#f7df1e', jsx: '#f7df1e', cjs: '#f7df1e', mjs: '#f7df1e',
  // Markup / style
  html: '#e44d26', css: '#264de4', scss: '#c6538c', sass: '#c6538c',
  // Data
  json: '#cbcb41', yaml: '#cc3e44', yml: '#cc3e44', sql: '#e38c00',
  // Doc
  md: '#ffffff', txt: '#9ca3af',
  // Config / env
  env: '#eab308', gitignore: '#f05032', lock: '#6b7280',
  // Python
  py: '#3572a5',
  // Shell
  sh: '#89e051', bash: '#89e051',
  // Other
  cjs_: '#f7df1e',
};

// ── Icône par extension ────────────────────────────────────────────────────
function pickIcon(ext: string): React.ComponentType<{ size?: number; color?: string }> {
  if (['ts', 'tsx', 'js', 'jsx', 'cjs', 'mjs', 'py', 'sh', 'bash'].includes(ext)) return FileCode2;
  if (['json', 'yaml', 'yml'].includes(ext)) return FileJson;
  if (['md', 'txt'].includes(ext)) return FileText;
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return FileImage;
  if (['html', 'htm'].includes(ext)) return Globe;
  if (['css', 'scss', 'sass'].includes(ext)) return FileCode2;
  if (['sql', 'db', 'sqlite'].includes(ext)) return Database;
  if (['env', 'config', 'cfg', 'ini', 'toml'].includes(ext)) return Settings;
  return File;
}

interface FileIconProps {
  filePath: string;
  size?: number;
}

export function FileIcon({ filePath, size = 15 }: FileIconProps) {
  const name = filePath.split('/').pop() ?? filePath;

  // Cas spéciaux par nom de fichier
  if (name === '.env' || name.startsWith('.env.')) {
    return <Settings size={size} color="#eab308" />;
  }
  if (name === '.gitignore') {
    return <File size={size} color="#f05032" />;
  }
  if (name === 'package.json' || name === 'package-lock.json') {
    return <FileJson size={size} color="#cb3837" />;
  }
  if (name === 'tsconfig.json' || name === 'vite.config.ts') {
    return <Settings size={size} color="#3178c6" />;
  }

  const parts = name.split('.');
  const ext   = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  const Icon  = pickIcon(ext);
  const color = EXT_COLOR[ext] ?? 'var(--text-muted)';

  return <Icon size={size} color={color} />;
}
