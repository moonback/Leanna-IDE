import { motion } from 'motion/react';
import { Bot, PenTool, AlignLeft, Search, SpellCheck, Languages, FileText, ListTree } from 'lucide-react';
import { useProfile } from '../../context/UserProfileContext';
import type { AgentRole } from '../../context/UserProfileContext';
import { Section, Field, ToggleSwitch, SectionDivider } from './SettingsPrimitives';

const AGENT_ROLES: { id: AgentRole; label: string; desc: string; icon: typeof Bot; color: string }[] = [
  { id: 'writer',      label: 'Rédacteur',      desc: 'Rédaction de documents',           icon: PenTool,    color: '#60a5fa' },
  { id: 'formatter',   label: 'Mise en Forme',  desc: 'Formatage & structure Markdown',   icon: AlignLeft,  color: '#4ade80' },
  { id: 'researcher',  label: 'Recherche',      desc: 'Collecte & synthèse d\'infos',     icon: Search,     color: '#a78bfa' },
  { id: 'proofreader', label: 'Correcteur',     desc: 'Orthographe, grammaire, style',    icon: SpellCheck,  color: '#fbbf24' },
  { id: 'translator',  label: 'Traducteur',     desc: 'Traduction & localisation',        icon: Languages,  color: '#f87171' },
  { id: 'summarizer',  label: 'Synthèse',       desc: 'Résumés & condensés',              icon: FileText,   color: '#fb923c' },
  { id: 'planner',     label: 'Planificateur',  desc: 'Plans & outlines de documents',    icon: ListTree,   color: '#2dd4bf' },
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

  const selectNone = () => {
    setField('agents', { ...agents, allowedRoles: [] });
  };

  const activeCount = agents.allowedRoles.length;
  const totalCount = AGENT_ROLES.length;

  return (
    <Section
      icon={Bot}
      title="Système Multi-Agents"
      description="Contrôlez quels agents peuvent être utilisés par l'assistant"
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
          <SectionDivider label="Agents autorisés" />

          {/* Quick actions */}
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={selectAll}
              className="rounded-lg px-2.5 py-1 text-[9px] font-semibold transition-all duration-150 hover:scale-105"
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
              onClick={selectNone}
              className="rounded-lg px-2.5 py-1 text-[9px] font-semibold transition-all duration-150 hover:scale-105"
              style={{
                backgroundColor: activeCount === 0 ? 'color-mix(in srgb, #f87171 10%, transparent)' : 'var(--bg-secondary)',
                color: activeCount === 0 ? '#f87171' : 'var(--text-muted)',
                border: '1px solid var(--border-base)',
              }}
            >
              Tout désactiver
            </button>
            <span className="ml-auto text-[9px] font-mono" style={{ color: 'var(--text-dimmed)' }}>
              {activeCount}/{totalCount}
            </span>
          </div>

          {/* Agent grid */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {AGENT_ROLES.map(role => {
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
                  {/* Icon */}
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-all duration-200"
                    style={{
                      backgroundColor: isActive ? `color-mix(in srgb, ${role.color} 15%, transparent)` : 'var(--bg-panel)',
                      border: `1px solid ${isActive ? role.color + '40' : 'var(--border-base)'}`,
                    }}
                  >
                    <Icon
                      className="h-4 w-4 transition-colors duration-200"
                      style={{ color: isActive ? role.color : 'var(--text-dimmed)' }}
                    />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[11px] font-semibold truncate transition-colors duration-200"
                      style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }}
                    >
                      {role.label}
                    </div>
                    <div
                      className="text-[9px] truncate leading-tight transition-colors duration-200"
                      style={{ color: isActive ? 'var(--text-muted)' : 'var(--text-dimmed)' }}
                    >
                      {role.desc}
                    </div>
                  </div>

                  {/* Status indicator */}
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
            className="mt-2 rounded-lg p-2.5 text-[9px] leading-relaxed"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-base)',
              color: 'var(--text-muted)',
            }}
          >
            <strong style={{ color: 'var(--text-primary)' }}>💡 Conseil :</strong> Chaque agent est spécialisé dans un aspect de la rédaction.
            Le <em>Planificateur</em> structure, le <em>Rédacteur</em> écrit, le <em>Correcteur</em> relit, le <em>Traducteur</em> adapte.
          </div>
        </>
      )}

      {!agents.enabled && (
        <div
          className="rounded-xl p-3 text-[10px] leading-relaxed"
          style={{
            backgroundColor: 'color-mix(in srgb, #fbbf24 6%, transparent)',
            border: '1px solid color-mix(in srgb, #fbbf24 20%, transparent)',
            color: 'var(--text-secondary)',
          }}
        >
          <strong style={{ color: '#fbbf24' }}>⚡ Mode Solo actif</strong>
          <br />
          L'assistant peut modifier, créer et supprimer des fichiers directement sans délégation.
          Activez les agents pour un workflow supervisé.
        </div>
      )}
    </Section>
  );
}
