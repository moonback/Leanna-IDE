import React from 'react';
import {
  FileCode2, FileText, FileJson, FileImage,
  File, Settings, Database, Globe,
} from 'lucide-react';

// ── Couleurs par extension ─────────────────────────────────────────────────
const EXT_COLOR: Record<string, string> = {
  // TypeScript
  ts: 'var(--accent-primary)', tsx: 'var(--accent-primary)',
  // JavaScript
  js: 'var(--color-warning)', jsx: 'var(--color-warning)', cjs: 'var(--color-warning)', mjs: 'var(--color-warning)',
  // Markup / style
  html: 'var(--color-warning)', css: 'var(--accent-primary)', scss: 'var(--color-accent-alt)', sass: 'var(--color-accent-alt)',
  // Data
  json: 'var(--color-warning)', yaml: 'var(--color-error)', yml: 'var(--color-error)', sql: 'var(--color-warning)',
  // Doc
  md: 'white', txt: 'var(--text-muted)',
  // Config / env
  env: 'var(--color-warning)', gitignore: 'var(--color-error)', lock: 'var(--text-muted)',
  // Python
  py: 'var(--accent-primary)',
  // Shell
  sh: 'var(--color-success)', bash: 'var(--color-success)',
  // Other
  cjs_: 'var(--color-warning)',
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
    return <Settings size={size} color="var(--color-warning)" />;
  }
  if (name === '.gitignore') {
    return <File size={size} color="var(--color-error)" />;
  }
  if (name === 'package.json' || name === 'package-lock.json') {
    return <FileJson size={size} color="var(--color-error)" />;
  }
  if (name === 'tsconfig.json' || name === 'vite.config.ts') {
    return <Settings size={size} color="var(--accent-primary)" />;
  }

  const parts = name.split('.');
  const ext   = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  const Icon  = pickIcon(ext);
  const color = EXT_COLOR[ext] ?? 'var(--text-muted)';

  return <Icon size={size} color={color} />;
}
