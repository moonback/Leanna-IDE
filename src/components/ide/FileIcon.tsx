import React from 'react';
import {
  FileCode2, FileText, FileJson, FileImage,
  File, Settings, Database, Globe, Type, Sql,
  Terminal, BookOpen, Palette, ShieldCheck,
  Zap, BrainCircuit, Code2, TestTube2
} from 'lucide-react';

// ── Couleurs par extension - Utilisant les couleurs Maysson (#00c2ff et #ff8c00) ─────────
const EXT_COLOR: Record<string, string> = {
  // TypeScript - Bleu cyan Maysson
  ts: '#00c2ff', tsx: '#00c2ff',
  // JavaScript - Orange Maysson
  js: '#ff8c00', jsx: '#ff8c00', cjs: '#ff8c00', mjs: '#ff8c00',
  // Markup
  html: '#ff8c00',
  // Style - Bleu cyan
  css: '#00c2ff', scss: '#00bfff', sass: '#00bfff',
  // Data
  json: '#ff8c00', 
  yaml: '#00c2ff', yml: '#00c2ff',
  // Database
  sql: '#ff8c00',
  // Doc
  md: 'white', txt: 'var(--text-muted)',
  // Config
  env: '#ff8c00', 
  gitignore: '#ff8c00', 
  lock: 'var(--text-muted)',
  toml: '#00c2ff',
  // Python
  py: '#00c2ff',
  // Shell
  sh: '#00c2ff', bash: '#00c2ff',
  zsh: '#00c2ff',
  // Config files
  config: '#00c2ff',
  cfg: '#00c2ff',
  ini: '#00c2ff',
  // Other
  cjs_: '#ff8c00',
};

// ── Icône par extension ────────────────────────────────────────────────────
function pickIcon(ext: string): React.ComponentType<{ size?: number; color?: string }> {
  if (['ts', 'tsx'].includes(ext)) return Type;
  if (['js', 'jsx', 'cjs', 'mjs'].includes(ext)) return Code2;
  if (['py'].includes(ext)) return Zap;
  if (['json'].includes(ext)) return FileJson;
  if (['yaml', 'yml'].includes(ext)) return BrainCircuit;
  if (['md'].includes(ext)) return BookOpen;
  if (['txt'].includes(ext)) return FileText;
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return FileImage;
  if (['html', 'htm'].includes(ext)) return Globe;
  if (['css', 'scss', 'sass'].includes(ext)) return Palette;
  if (['sql', 'db', 'sqlite'].includes(ext)) return Database;
  if (['sh', 'bash', 'zsh'].includes(ext)) return Terminal;
  if (['env', 'config', 'cfg', 'ini', 'toml'].includes(ext)) return Settings;
  if (['gitignore'].includes(ext)) return ShieldCheck;
  if (['lock'].includes(ext)) return FileJson;
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
    return <Settings size={size} color="#ff8c00" />;
  }
  if (name === '.gitignore') {
    return <ShieldCheck size={size} color="#ff8c00" />;
  }
  if (name === 'package.json' || name === 'package-lock.json') {
    return <FileJson size={size} color="#ff8c00" />;
  }
  if (name === 'tsconfig.json' || name === 'vite.config.ts' || name === 'tailwind.config.js') {
    return <Settings size={size} color="#00c2ff" />;
  }
  if (name === 'README.md' || name.startsWith('README.')) {
    return <BookOpen size={size} color="white" />;
  }

  const parts = name.split('.');
  const ext   = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  const Icon  = pickIcon(ext);
  const color = EXT_COLOR[ext] ?? 'var(--text-muted)';

  return <Icon size={size} color={color} />;
}
