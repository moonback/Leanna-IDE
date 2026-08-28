import { motion } from 'motion/react';
import {
  Bot, Code2, Sparkles, Bug, CheckCheck, FlaskConical, ShieldAlert, Network,
  PenTool, AlignLeft, Search, SpellCheck, Languages, FileText, ListTree,
} from 'lucide-react';
import { useProfile } from '../../context/UserProfileContext';
import type { AgentRole } from '../../context/UserProfileContext';
import { Section, Field, ToggleSwitch, SectionDivider } from './SettingsPrimitives';

interface AgentRoleMeta {
  id: AgentRole;
  label: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  color: string;
  category: 'code' | 'docs';
}

const AGENT_ROLES: AgentRoleMeta[] = [
  // Code & Ingénierie logicielle
  { id: 'coder',       label: 'Développeur',     desc: 'Écriture et modification de code typé',       icon: Code2,        color: 'var(--accent-primary)', category: 'code' },
  { id: 'refactor',    label: 'Refactorisation', desc: 'Clean code, architecture & modularité',        icon: Sparkles,     color: 'var(--color-accent-alt)', category: 'code' },
  { id: 'debugger',    label: 'Débogueur',       desc: 'Diagnostic de bugs & patches chirurgicaux',     icon: Bug,          color: 'var(--color-error)', category: 'code' },
  { id: 'reviewer',    label: 'Revue de Code',   desc: 'Audit qualité, détection d\'anti-patterns',    icon: CheckCheck,   color: 'var(--color-success)', category: 'code' },
  { id: 'tester',      label: 'QA & Tests',      desc: 'Création & exécution de tests automatisés',    icon: FlaskConical, color: 'var(--color-warning)', category: 'code' },
  { id: 'security',    label: 'Sécurité & Audit',desc: 'Détection failles OWASP, fuites de secrets',   icon: ShieldAlert,  color: 'var(--color-accent-alt)', category: 'code' },
  { id: 'architect',   label: 'Architecte',      desc: 'Conception système, interfaces & modèles',    icon: Network,      color: 'var(--color-info)', category: 'code' },

  // Rédaction & Documentation
  { id: 'writer',      label: 'Rédacteur',       desc: 'Rédaction de documents & articles',            icon: PenTool,      color: 'var(--accent-primary)', category: 'docs' },
  { id: 'formatter',   label: 'Mise en Forme',   desc: 'Formatage & structure Markdown',               icon: AlignLeft,    color: 'var(--color-success)', category: 'docs' },
  { id: 'researcher',  label: 'Recherche',       desc: 'Collecte & synthèse d\'informations',          icon: Search,       color: 'var(--color-accent-alt)', category: 'docs' },
  { id: 'proofreader', label: 'Correcteur',      desc: 'Orthographe, grammaire & style',               icon: SpellCheck,   color: 'var(--color-warning)', category: 'docs' },
  { id: 'translator',  label: 'Traducteur',      desc: 'Traduction & localisation multilingue',        icon: Languages,    color: 'var(--color-error)', category: 'docs' },
  { id: 'summarizer',  label: 'Synthèse',        desc: 'Résumés & condensés exécutifs',                icon: FileText,     color: 'var(--color-warning)', category: 'docs' },
  { id: 'planner',     label: 'Planificateur',   desc: 'Plans & outlines de documents',                icon: ListTree,     color: 'var(--color-info)', category: 'docs' },
];

export function AgentsSection() {
  const { profile, setField } = useProfile();
  const agents = profile.agents;

  const toggleEnabled = (value: boolean) => {
    setField('agents', { ...agents, enabled: value });
  };

  const toggleRole = (role: AgentRole) => {
    const current = agents.allowedRoles;
    const updated = current.includes(role)
      ? current.filter(r => r !== role)
      : [...current, role];
    setField('agents', { ...agents, allowedRoles: updated });
  };

  const selectAll = () => {
    setField('agents', { ...agents, allowedRoles: AGENT_ROLES.map(r => r.id) });
  };

  const selectCategory = (category: 'code' | 'docs') => {
    const categoryRoles = AGENT_ROLES.filter(r => r.category === category).map(r => r.id);
    const otherRoles = agents.allowedRoles.filter(id => !categoryRoles.includes(id));
    setField('agents', { ...agents, allowedRoles: [...otherRoles, ...categoryRoles] });
  };

  const selectNone = () => {
    setField('agents', { ...agents, allowedRoles: [] });
  };

  const activeCount = agents.allowedRoles.length;
  const totalCount = AGENT_ROLES.length;

  const codeRoles = AGENT_ROLES.filter(r => r.category === 'code');
  const docsRoles = AGENT_ROLES.filter(r => r.category === 'docs');

  return (
    <Section
      icon={Bot}
      title="Système Multi-Agents"
      description="Contrôlez quels agents spécialisés peuvent être activés et mandatés"
      badge={agents.enabled ? `${activeCount}/${totalCount}` : 'OFF'}
    >
      <Field
        label="Activer les agents"
        hint="Quand désactivé, l'assistant agit seul et peut modifier les fichiers directement."
      >
        <ToggleSwitch
          value={agents.enabled}
          onChange={toggleEnabled}
          label="Système multi-agents"
          hint={agents.enabled ? `${activeCount} agent(s) actif(s)` : 'Mode solo — pas de délégation'}
        />
      </Field>

      {agents.enabled && (
        <>
          {/* Quick actions bar */}
          <div className="flex flex-wrap items-center gap-1.5 pt-2 pb-1">
            <button
              type="button"
              onClick={selectAll}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold transition-all duration-150 hover:scale-105"
              style={{
                backgroundColor: activeCount === totalCount ? 'var(--accent-subtle)' : 'var(--bg-secondary)',
                color: activeCount === totalCount ? 'var(--accent-primary)' : 'var(--text-muted)',
                border: '1px solid var(--border-base)',
              }}
            >
              Tout activer
            </button>
            <button
              type="button"
              onClick={() => selectCategory('code')}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold transition-all duration-150 hover:scale-105"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
                color: 'var(--accent-primary)',
                border: '1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)',
              }}
            >
              + Tous Code ({codeRoles.length})
            </button>
            <button
              type="button"
              onClick={() => selectCategory('docs')}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold transition-all duration-150 hover:scale-105"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent-primary) 12%, transparent)',
                color: 'var(--accent-primary)',
                border: '1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent)',
              }}
            >
              + Tous Rédaction ({docsRoles.length})
            </button>
            <button
              type="button"
              onClick={selectNone}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold transition-all duration-150 hover:scale-105"
              style={{
                backgroundColor: activeCount === 0 ? 'color-mix(in srgb, var(--color-error) 10%, transparent)' : 'var(--bg-secondary)',
                color: activeCount === 0 ? 'var(--color-error)' : 'var(--text-muted)',
                border: '1px solid var(--border-base)',
              }}
            >
              Tout désactiver
            </button>
            <span className="ml-auto text-xs font-mono" style={{ color: 'var(--text-dimmed)' }}>
              {activeCount}/{totalCount}
            </span>
          </div>

          {/* Section: Code & Développement */}
          <SectionDivider label="Code & Ingénierie Logicielle" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {codeRoles.map(role => {
              const isActive = agents.allowedRoles.includes(role.id);
              const Icon = role.icon;

              return (
                <motion.button
                  key={role.id}
                  type="button"
                  onClick={() => toggleRole(role.id)}
                  whileHover={{ y: -1, scale: 1.01 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all duration-200"
                  style={{
                    backgroundColor: isActive ? `color-mix(in srgb, ${role.color} 8%, transparent)` : 'var(--bg-secondary)',
                    border: `1.5px solid ${isActive ? role.color + '60' : 'var(--border-base)'}`,
                    boxShadow: isActive ? `0 2px 8px ${role.color}15` : 'none',
                  }}
                  aria-pressed={isActive}
                  aria-label={`${isActive ? 'Désactiver' : 'Activer'} l'agent ${role.label}`}
                >
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-200"
                    style={{
                      backgroundColor: isActive ? `color-mix(in srgb, ${role.color} 15%, transparent)` : 'var(--bg-panel)',
                      border: `1px solid ${isActive ? role.color + '40' : 'var(--border-base)'}`,
                    }}
                  >
                    <Icon
                      style={{ width: 16, height: 16, color: isActive ? role.color : 'var(--text-dimmed)' }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div
                      className="text-xs font-semibold truncate transition-colors duration-200"
                      style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
                    >
                      {role.label}
                    </div>
                    <div
                      className="text-xs truncate leading-tight transition-colors duration-200"
                      style={{ color: isActive ? 'var(--text-muted)' : 'var(--text-dimmed)' }}
                    >
                      {role.desc}
                    </div>
                  </div>

                  <div
                    className="h-2 w-2 flex-shrink-0 rounded-full transition-all duration-200"
                    style={{
                      backgroundColor: isActive ? role.color : 'var(--border-base)',
                      boxShadow: isActive ? `0 0 6px ${role.color}60` : 'none',
                    }}
                  />
                </motion.button>
              );
            })}
          </div>

          {/* Section: Rédaction & Documents */}
          <SectionDivider label="Rédaction & Documentation" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {docsRoles.map(role => {
              const isActive = agents.allowedRoles.includes(role.id);
              const Icon = role.icon;

              return (
                <motion.button
                  key={role.id}
                  type="button"
                  onClick={() => toggleRole(role.id)}
                  whileHover={{ y: -1, scale: 1.01 }}
                  whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all duration-200"
                  style={{
                    backgroundColor: isActive ? `color-mix(in srgb, ${role.color} 8%, transparent)` : 'var(--bg-secondary)',
                    border: `1.5px solid ${isActive ? role.color + '60' : 'var(--border-base)'}`,
                    boxShadow: isActive ? `0 2px 8px ${role.color}15` : 'none',
                  }}
                  aria-pressed={isActive}
                  aria-label={`${isActive ? 'Désactiver' : 'Activer'} l'agent ${role.label}`}
                >
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-200"
                    style={{
                      backgroundColor: isActive ? `color-mix(in srgb, ${role.color} 15%, transparent)` : 'var(--bg-panel)',
                      border: `1px solid ${isActive ? role.color + '40' : 'var(--border-base)'}`,
                    }}
                  >
                    <Icon
                      style={{ width: 16, height: 16, color: isActive ? role.color : 'var(--text-dimmed)' }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div
                      className="text-xs font-semibold truncate transition-colors duration-200"
                      style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
                    >
                      {role.label}
                    </div>
                    <div
                      className="text-xs truncate leading-tight transition-colors duration-200"
                      style={{ color: isActive ? 'var(--text-muted)' : 'var(--text-dimmed)' }}
                    >
                      {role.desc}
                    </div>
                  </div>

                  <div
                    className="h-2 w-2 flex-shrink-0 rounded-full transition-all duration-200"
                    style={{
                      backgroundColor: isActive ? role.color : 'var(--border-base)',
                      boxShadow: isActive ? `0 0 6px ${role.color}60` : 'none',
                    }}
                  />
                </motion.button>
              );
            })}
          </div>

          {/* Info hint */}
          <div
            className="mt-3 rounded-lg p-2.5 text-xs leading-relaxed"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-base)',
              color: 'var(--text-muted)',
            }}
          >
            <strong style={{ color: 'var(--text-primary)' }}>💡 Spécialisation multi-agents :</strong> Les agents de code garantissent des modifications propres, testées et sécurisées (<em>Développeur</em> code, <em>Refactor</em> optimise, <em>Débogueur</em> corrige, <em>Revue</em> audite, <em>QA</em> teste).
          </div>
        </>
      )}

      {!agents.enabled && (
        <div
          className="rounded-xl p-3 text-sm leading-relaxed"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-warning) 6%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-warning) 20%, transparent)',
            color: 'var(--text-secondary)',
          }}
        >
          <strong style={{ color: 'var(--color-warning)' }}>⚡ Mode Solo actif</strong>
          <br />
          L'assistant peut modifier, créer et supprimer des fichiers directement sans délégation.
          Activez les agents pour un workflow supervisé et collaboratif.
        </div>
      )}
    </Section>
  );
}
