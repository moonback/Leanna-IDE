
import { useEffect, useState } from 'react';
import { Play, Pause, Trash2, Zap, Clock, GitBranch, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { WorkflowsPanel, WorkflowViewModel } from '../components/panels/WorkflowsPanel.js';
import { ViewHeader } from '../components/ui/ViewHeader.js';
import { useToast } from '../components/ui/Toast.js';
import { useConfirm } from '../components/ui/ConfirmDialog.js';
import { viewHeaderProps } from '../config/navigation.js';

interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  interval: string;
  enabled: boolean;
  nextRunAt: string | null;
}

export default function AutomationView() {
  const { success: toastSuccess, error: toastError } = useToast();
  const { confirm } = useConfirm();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'workflows' | 'tasks'>('workflows');
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowViewModel[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    try {
      const response = await fetch('/api/automation/scheduled-tasks');
      const data = await response.json();
      if (!response.ok || data.status !== 'success' || !Array.isArray(data.tasks)) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      setTasks(data.tasks);
    } catch (error) {
      setLoadError('Impossible de charger les tâches planifiées. Vérifiez la connexion au serveur puis réessayez.');
      toastError('Impossible de charger les tâches planifiées');
      console.error('Erreur lors de la récupération des tâches:', error);
    }
  };

  const fetchWorkflows = async () => {
    try {
      const response = await fetch('/api/workflows');
      const data = await response.json();
      if (!response.ok || data.status !== 'success' || !Array.isArray(data.workflows)) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      setWorkflows(data.workflows);
    } catch (error) {
      setLoadError('Impossible de charger les workflows. Vérifiez la connexion au serveur puis réessayez.');
      toastError('Impossible de charger les workflows');
      console.error('Erreur lors de la récupération des workflows:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        setLoadError(null);
        await Promise.all([fetchTasks(), fetchWorkflows()]);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
    const timer = setInterval(() => {
      fetchTasks();
      fetchWorkflows();
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const toggleTask = async (id: string, currentlyEnabled: boolean) => {
    const action = currentlyEnabled ? 'pause' : 'resume';
    try {
      const response = await fetch(`/api/automation/scheduled-tasks/${id}/${action}`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status === 'error') throw new Error(data.error || `HTTP ${response.status}`);
      toastSuccess(currentlyEnabled ? 'Tâche mise en pause' : 'Tâche activée');
      await fetchTasks();
    } catch (error) {
      console.error(`Erreur lors du changement d'état (${action}) de la tâche:`, error);
      toastError(error instanceof Error ? error.message : 'Impossible de modifier cette tâche');
    }
  };

  const runNow = async (id: string) => {
    try {
      const response = await fetch(`/api/automation/scheduled-tasks/${id}/run`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status === 'error') throw new Error(data.error || `HTTP ${response.status}`);
      toastSuccess('Exécution de la tâche déclenchée');
      await fetchTasks();
    } catch (error) {
      console.error('Erreur lors de l’exécution immédiate:', error);
      toastError(error instanceof Error ? error.message : 'Impossible de lancer cette tâche');
    }
  };

  const deleteTask = async (id: string) => {
    const confirmed = await confirm({
      title: 'Supprimer cette tâche planifiée',
      message: 'Cette action est irréversible. La tâche sera supprimée définitivement.',
      confirmLabel: 'Supprimer',
      cancelLabel: 'Annuler',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const response = await fetch(`/api/automation/scheduled-tasks/${id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status === 'error') throw new Error(data.error || `HTTP ${response.status}`);
      toastSuccess('Tâche supprimée');
      await fetchTasks();
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
      toastError(error instanceof Error ? error.message : 'Impossible de supprimer cette tâche');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ViewHeader
        {...viewHeaderProps('automation')}
        badge="Low-Code"
        description="Crée et surveille tes workflows visuels et tâches planifiées"
        actions={
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--bg-ctrl)] border border-[var(--border-base)]">
            <button
              onClick={() => setActiveTab('workflows')}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                activeTab === 'workflows'
                  ? 'bg-[var(--bg-panel)] text-[var(--accent-primary)] shadow-sm border border-[var(--border-base)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              )}
            >
              <GitBranch className="w-3.5 h-3.5" /> Workflows visuels ({workflows.length})
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                activeTab === 'tasks'
                  ? 'bg-[var(--bg-panel)] text-[var(--accent-primary)] shadow-sm border border-[var(--border-base)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              )}
            >
              <Zap className="w-3.5 h-3.5" /> Tâches ({tasks.length})
            </button>
          </div>
        }
      />

      <main className="custom-scrollbar flex-1 overflow-y-auto p-5 lg:p-7">
        {loadError && !loading ? (
          <div role="alert" className="mx-auto flex max-w-xl flex-col items-center gap-3 rounded-2xl border border-[var(--color-error)]/30 bg-[var(--bg-panel)] p-8 text-center">
            <p className="text-sm font-medium text-[var(--text-primary)]">{loadError}</p>
            <button type="button" onClick={() => { setLoadError(null); setLoading(true); Promise.all([fetchTasks(), fetchWorkflows()]).finally(() => setLoading(false)); }} className="rounded-lg border border-[var(--border-base)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-ctrl)]">Réessayer</button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent-primary)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Chargement des automatisations...</p>
          </div>
        ) : activeTab === 'workflows' ? (
          <WorkflowsPanel workflows={workflows} onRefresh={fetchWorkflows} />
        ) : tasks.length === 0 ? (
          <div className="border-2 border-dashed border-[var(--border-base)] rounded-2xl p-12 text-center bg-[var(--bg-panel)]">
            <Zap className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-4 opacity-50" />
            <p className="text-[var(--text-muted)] font-medium">Aucune tâche planifiée pour le moment.</p>
            <p className="text-sm text-[var(--text-dimmed)] mt-1">Une fois créées, elles apparaîtront ici.</p>
          </div>
        ) : (
          <div className="grid gap-5">
            {tasks.map(task => (
              <div key={task.id} 
                className="group flex min-w-0 flex-col gap-4 rounded-2xl border border-[var(--border-base)] bg-[var(--bg-panel)] p-4 transition-all hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-lg sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5"
                style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className={clsx(
                      'w-3 h-3 rounded-full relative',
                      task.enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'
                    )}>
                      <span className={clsx(
                        'absolute inset-0 rounded-full animate-ping opacity-75',
                        task.enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-error)]'
                      )} style={{ animationDuration: '2s' }}></span>
                    </span>
                    <h3 className="font-bold text-lg text-[var(--text-primary)] truncate">
                      {task.name}
                    </h3>
                  </div>
                  
                  <p className="text-sm text-[var(--text-secondary)] mt-1.5 line-clamp-2 leading-relaxed">
                    {task.description || 'Pas de description fournie.'}
                  </p>
                  
                  <div className="mt-3.5 flex w-fit max-w-full flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-[var(--border-base)] bg-[var(--bg-ctrl)] px-3 py-2 text-xs text-[var(--text-muted)]">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Clock className="w-3.5 h-3.5" /> Intervalle: <span className="text-[var(--text-primary)] font-semibold">{task.interval}</span>
                    </span>
                    <span className="w-1 h-1 rounded-full bg-[var(--border-strong)]" />
                    <span className="font-medium">
                      Prochain lancement: <span className="text-[var(--text-primary)] font-semibold">{task.nextRunAt ? new Date(task.nextRunAt).toLocaleString() : 'N/A'}</span>
                    </span>
                  </div>
                </div>
                
                <div className="flex shrink-0 items-center justify-end gap-2 self-end sm:self-auto">
                  <button type="button" aria-label={`Lancer ${task.name} maintenant`} onClick={() => runNow(task.id)} 
                    className="p-3 rounded-xl transition-colors hover:bg-[var(--ctrl-hover)] text-[var(--ctrl-icon)] hover:text-[var(--accent-primary)] bg-[var(--bg-ctrl)] border border-[var(--border-base)]"
                    title="Lancer maintenant">
                    <Play className="w-5 h-5" />
                  </button>
                  <button type="button" aria-label={task.enabled ? `Mettre ${task.name} en pause` : `Activer ${task.name}`} onClick={() => toggleTask(task.id, task.enabled)} 
                    className="p-3 rounded-xl transition-colors hover:bg-[var(--ctrl-hover)] text-[var(--ctrl-icon)] hover:text-[var(--accent-primary)] bg-[var(--bg-ctrl)] border border-[var(--border-base)]"
                    title={task.enabled ? 'Désactiver' : 'Activer'}>
                    {task.enabled ? <Pause className="w-5 h-5" /> : <Zap className="w-5 h-5" />}
                  </button>
                  <button type="button" aria-label={`Supprimer ${task.name}`} onClick={() => deleteTask(task.id)} 
                    className="p-3 rounded-xl transition-colors hover:bg-[var(--ctrl-hover)] text-[var(--color-error)] hover:bg-[var(--color-error)]/10 bg-[var(--bg-ctrl)] border border-[var(--border-base)]"
                    title="Supprimer">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

