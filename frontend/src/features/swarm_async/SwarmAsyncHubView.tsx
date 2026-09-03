import React, { useState, useEffect } from 'react';
import {
  Bot,
  Zap,
  RefreshCw,
  Trash2,
  Play,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ArrowRight,
  ShieldCheck,
  Code2,
  Activity,
  Layers,
  Sparkles,
  X,
  ExternalLink
} from 'lucide-react';
import { api } from '../../services/api';
import { Project, SwarmMessage } from '../../types';
import { SwarmInspectorModal } from '../executions/SwarmInspectorModal';

interface SwarmAsyncHubViewProps {
  currentProject: Project | null;
  activeMatrixJob: any | null;
  onResumeMatrixJob: (jobId: string) => void;
  onRetryMatrixJob: (jobId: string) => void;
  onDismissMatrixJob: (jobId: string) => void;
  onOpenMatrixModal?: (jobId: string) => void;
  onCancelMatrixJob?: (jobId: string) => void;
}

export const SwarmAsyncHubView: React.FC<SwarmAsyncHubViewProps> = ({
  currentProject,
  activeMatrixJob,
  onResumeMatrixJob,
  onRetryMatrixJob,
  onDismissMatrixJob,
  onOpenMatrixModal,
  onCancelMatrixJob
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'async_ops' | 'swarm_contracts'>('async_ops');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Project Matrix Jobs State
  const [matrixJobs, setMatrixJobs] = useState<any[]>([]);

  // Async Ops State
  const [asyncOperations, setAsyncOperations] = useState<any[]>([]);

  // Swarm Contracts & Telemetry State
  const [contracts, setContracts] = useState<any[]>([]);
  const [telemetry, setTelemetry] = useState<any>({
    total_messages: 0,
    total_contracts: 0,
    violations_count: 0,
    deadlocks_prevented: 0,
    recent_messages: []
  });

  // Modals
  const [isCreateContractOpen, setIsCreateContractOpen] = useState(false);
  const [isSwarmInspectorOpen, setIsSwarmInspectorOpen] = useState(false);

  // New Contract Form
  const [newContractName, setNewContractName] = useState('');
  const [newSenderAgent, setNewSenderAgent] = useState('ResearcherAgent');
  const [newRecipientAgent, setNewRecipientAgent] = useState('WriterAgent');
  const [newMaxTurns, setNewMaxTurns] = useState(8);
  const [newContractSchema, setNewContractSchema] = useState<string>(
    JSON.stringify(
      {
        type: 'object',
        required: ['summary', 'citations'],
        properties: {
          summary: { type: 'string' },
          citations: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' }
        }
      },
      null,
      2
    )
  );

  const loadHubData = async () => {
    if (!currentProject) return;
    setIsLoading(true);
    try {
      const [opsRes, telemRes, matrixRes] = await Promise.all([
        api.getProjectAsyncOperations(currentProject.id).catch(() => ({ operations: [] })),
        api.getProjectSwarmTelemetry(currentProject.id).catch(() => ({
          total_messages: 0,
          total_contracts: 0,
          violations_count: 0,
          deadlocks_prevented: 0,
          recent_messages: [],
          contracts: []
        })),
        api.getProjectMatrixJobs(currentProject.id).catch(() => ({ jobs: [] }))
      ]);

      setAsyncOperations(opsRes.operations || []);
      setTelemetry(telemRes);
      setContracts(telemRes.contracts || []);
      setMatrixJobs(matrixRes.jobs || []);
    } catch (err) {
      console.error('Failed to load Swarm & Async Hub data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHubData();
  }, [currentProject?.id]);

  const handleDeleteAsyncOp = async (opId: string) => {
    try {
      await api.deleteAsyncOperation(opId);
      setAsyncOperations((prev) => prev.filter((o) => o.id !== opId));
    } catch (err) {
      alert('Failed to delete async operation');
    }
  };

  const handleClearAllAsyncOps = async () => {
    if (!currentProject) return;
    if (window.confirm('Clear all recorded async operations for this project?')) {
      try {
        await api.clearProjectAsyncOperations(currentProject.id);
        setAsyncOperations([]);
      } catch (err) {
        alert('Failed to clear operations');
      }
    }
  };

  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProject) return;
    try {
      let parsedSchema = {};
      try {
        parsedSchema = JSON.parse(newContractSchema);
      } catch {
        alert('Invalid JSON Schema format');
        return;
      }

      await api.createProjectSwarmContract(currentProject.id, {
        name: newContractName || `${newSenderAgent} to ${newRecipientAgent} Contract`,
        sender_agent: newSenderAgent,
        recipient_agent: newRecipientAgent,
        contract_schema: parsedSchema,
        max_turns: newMaxTurns,
        is_active: true
      });

      setIsCreateContractOpen(false);
      setNewContractName('');
      loadHubData();
    } catch (err) {
      alert('Failed to create contract');
    }
  };

  const handleDeleteContract = async (contractId: string) => {
    if (window.confirm('Delete this hand-off contract?')) {
      try {
        await api.deleteProjectSwarmContract(contractId);
        setContracts((prev) => prev.filter((c) => c.id !== contractId));
      } catch (err) {
        alert('Failed to delete contract');
      }
    }
  };

  const handleClearSwarmMessages = async () => {
    if (!currentProject) return;
    if (window.confirm('Clear all swarm messages and loop telemetry for this project?')) {
      try {
        await api.clearProjectSwarmMessages(currentProject.id);
        loadHubData();
      } catch (err) {
        alert('Failed to clear swarm messages');
      }
    }
  };

  const interruptedJobs = matrixJobs.filter(
    (j) => j.status === 'INTERRUPTED' && (!j.project_id || (currentProject && j.project_id === currentProject.id))
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Bot className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 font-display">
              Swarm & Async Hub
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Project Isolated
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Durable async operation checkpoints, idempotent polling recovery, and multi-agent contract governance for{' '}
            <strong className="text-slate-800">{currentProject?.name || 'Current Project'}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadHubData}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSwarmInspectorOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Open Swarm Graph</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center text-violet-600">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Async Operations</p>
            <h3 className="text-xl font-extrabold text-slate-900">{asyncOperations.length}</h3>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Interrupted Jobs</p>
            <h3 className="text-xl font-extrabold text-slate-900">
              {interruptedJobs.length}
            </h3>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active Contracts</p>
            <h3 className="text-xl font-extrabold text-slate-900">{contracts.length}</h3>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Deadlocks Blocked</p>
            <h3 className="text-xl font-extrabold text-slate-900">{telemetry.deadlocks_prevented || 0}</h3>
          </div>
        </div>
      </div>

      {/* Sub-Tabs Selector */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('async_ops')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'async_ops'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>Recoverable Async & Matrix Jobs</span>
          {asyncOperations.length > 0 && (
            <span className="px-2 py-0.2 rounded-full text-[10px] bg-slate-700 text-slate-200 font-mono">
              {asyncOperations.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('swarm_contracts')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
            activeSubTab === 'swarm_contracts'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Bot className="w-3.5 h-3.5" />
          <span>Multi-Agent Swarms & Contracts</span>
          {contracts.length > 0 && (
            <span className="px-2 py-0.2 rounded-full text-[10px] bg-indigo-700 text-indigo-100 font-mono">
              {contracts.length}
            </span>
          )}
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: ASYNC OPS & MATRIX JOBS (IDEMPOTENCY MANAGER) */}
      {/* ========================================================================= */}
      {activeSubTab === 'async_ops' && (
        <div className="space-y-6">
          {/* Active / Interrupted Matrix Executions Card List */}
          {interruptedJobs.length > 0 && (
            <div className="space-y-3">
              {interruptedJobs.map((job) => (
                <div
                  key={job.id || job.job_id}
                  className="p-5 rounded-2xl bg-amber-50 border border-amber-300 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in"
                >
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center shrink-0 mt-0.5 font-bold">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-bold text-amber-950">
                          Interrupted Matrix Execution Detected
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-200 text-amber-900 border border-amber-300">
                          {job.completed_scenarios || 0} of {job.total_scenarios || 0} Scenarios Done
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          CRASH RECOVERY READY
                        </span>
                      </div>
                      <p className="text-xs text-amber-800">
                        Execution was checkpointed during server restart. You can resume remaining scenarios safely without duplicate API triggers.
                      </p>
                      <p className="text-[11px] text-amber-700 font-mono mt-1">
                        Job ID: {job.id || job.job_id} • Dataset: <strong>{job.dataset_name || 'Standard Matrix'}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onResumeMatrixJob(job.id || job.job_id)}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer ring-2 ring-amber-300"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Resume Execution</span>
                    </button>

                    {onOpenMatrixModal && (
                      <button
                        type="button"
                        onClick={() => onOpenMatrixModal(job.id || job.job_id)}
                        className="px-3.5 py-2 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>View Details & Nodes</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onRetryMatrixJob(job.id || job.job_id)}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold transition-all cursor-pointer"
                    >
                      <span>Retry</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Cancel and delete this interrupted execution?')) {
                          if (onCancelMatrixJob) {
                            onCancelMatrixJob(job.id || job.job_id);
                          }
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                      title="Cancel and delete this execution"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Cancel Flow</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Async Operations Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Recorded Async Operations & Idempotency Keys
                </h3>
                <p className="text-[11px] text-slate-500">
                  Persisted remote task states enabling crash-proof polling resumption without redundant triggers
                </p>
              </div>

              <div className="flex items-center gap-2">
                {asyncOperations.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllAsyncOps}
                    className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All</span>
                  </button>
                )}
              </div>
            </div>

            {asyncOperations.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                <Zap className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="font-bold text-slate-700">No Async Operations Recorded For This Project</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                  When you execute workflows with &quot;Recoverable Async Execution&quot; enabled on API triggers or polling nodes, their idempotency keys and remote Job IDs appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <th className="py-3 px-4">Idempotency Key</th>
                      <th className="py-3 px-4">Remote Job ID</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Polls</th>
                      <th className="py-3 px-4">Target Node / URL</th>
                      <th className="py-3 px-4">Created</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {asyncOperations.map((op) => (
                      <tr key={op.id} className="hover:bg-slate-50/60 transition-colors font-mono text-[11px]">
                        <td className="py-3 px-4 font-bold text-slate-900 max-w-[200px] truncate" title={op.idempotency_key}>
                          {op.idempotency_key}
                        </td>
                        <td className="py-3 px-4 text-violet-700 font-bold">
                          {op.external_job_id || '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              op.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : op.status === 'POLLING'
                                ? 'bg-cyan-100 text-cyan-800 animate-pulse'
                                : op.status === 'FAILED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {op.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-700">
                          {op.poll_attempts ?? 0}
                        </td>
                        <td className="py-3 px-4 max-w-[240px] truncate text-slate-500" title={op.trigger_url || op.node_key}>
                          {op.trigger_url || op.node_key}
                        </td>
                        <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                          {op.created_at ? new Date(op.created_at).toLocaleTimeString() : '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteAsyncOp(op.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete operation state"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: MULTI-AGENT SWARMS & CONTRACTS STUDIO */}
      {/* ========================================================================= */}
      {activeSubTab === 'swarm_contracts' && (
        <div className="space-y-6">
          {/* Contracts Header & Add Button */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Inter-Agent Hand-off Contracts
              </h3>
              <p className="text-[11px] text-slate-500">
                Enforce strict JSON schemas and turn quotas between collaborating agents to catch format violations early
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCreateContractOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Contract</span>
              </button>
            </div>
          </div>

          {/* Contracts Cards Grid */}
          {contracts.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-xs">
              <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-indigo-400" />
              <p className="font-bold text-slate-700">No Hand-off Contracts Defined</p>
              <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto mb-4">
                Define contracts between collaborating agents (e.g. Researcher ➔ Writer) to enforce output schemas and prevent agent crashes.
              </p>
              <button
                type="button"
                onClick={() => setIsCreateContractOpen(true)}
                className="px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold transition-all cursor-pointer"
              >
                + Define First Contract
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {contracts.map((c) => (
                <div key={c.id} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 truncate max-w-[180px]">
                        {c.name}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Active
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-700 bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <span className="text-indigo-600 truncate">{c.sender_agent}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="text-violet-600 truncate">{c.recipient_agent}</span>
                    </div>

                    <div className="text-[11px] text-slate-500 font-mono">
                      Max Turns Quota: <strong className="text-slate-800">{c.max_turns || 8}</strong>
                    </div>

                    <div className="bg-slate-900 rounded-xl p-2.5 text-[10px] font-mono text-emerald-300 max-h-24 overflow-y-auto">
                      <pre>{JSON.stringify(c.contract_schema, null, 2)}</pre>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">
                      {c.created_at ? new Date(c.created_at).toLocaleDateString() : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteContract(c.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                      title="Delete contract"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Recent Swarm Telemetry & Deadlock History */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Recent Inter-Agent Conversation & Deadlock Telemetry
                </h3>
                <p className="text-[11px] text-slate-500">
                  Recorded turns, contract verification results, and token counts for this project
                </p>
              </div>

              {telemetry.recent_messages && telemetry.recent_messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearSwarmMessages}
                  className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Telemetry</span>
                </button>
              )}
            </div>

            {(!telemetry.recent_messages || telemetry.recent_messages.length === 0) ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                <Bot className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p className="font-bold text-slate-700">No Swarm Messages Recorded Yet</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
                  Execute multi-agent workflows or click &quot;Open Swarm Graph&quot; to ingest test traces.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                {telemetry.recent_messages.map((m: any) => (
                  <div key={m.id} className="p-3.5 hover:bg-slate-50/70 transition-colors flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-700">
                          {m.sender_agent} ➔ {m.recipient_agent}
                        </span>
                        <span
                          className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                            m.contract_status === 'PASSED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {m.contract_status === 'PASSED' ? 'Contract Passed' : 'Contract Violation'}
                        </span>
                        {m.is_loop_suspect === 'true' && (
                          <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 animate-pulse">
                            Deadlock Loop Suspect
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 line-clamp-2">{m.content}</p>
                    </div>

                    <div className="text-right text-[10px] font-mono text-slate-400 shrink-0">
                      <div>{m.tokens || 0} tokens</div>
                      <div>{m.latency_ms ? `${m.latency_ms}ms` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CREATE SWARM CONTRACT MODAL */}
      {/* ========================================================================= */}
      {isCreateContractOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 border border-slate-200 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  Create Inter-Agent Hand-off Contract
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateContractOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateContract} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Contract Name</label>
                <input
                  type="text"
                  value={newContractName}
                  onChange={(e) => setNewContractName(e.target.value)}
                  placeholder="e.g. Researcher to FactChecker Schema"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600 shadow-2xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Sender Agent</label>
                  <input
                    type="text"
                    value={newSenderAgent}
                    onChange={(e) => setNewSenderAgent(e.target.value)}
                    placeholder="ResearcherAgent"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600 shadow-2xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Recipient Agent</label>
                  <input
                    type="text"
                    value={newRecipientAgent}
                    onChange={(e) => setNewRecipientAgent(e.target.value)}
                    placeholder="WriterAgent"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600 shadow-2xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Max Turn Quota (Deadlock Breaker)
                </label>
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={newMaxTurns}
                  onChange={(e) => setNewMaxTurns(parseInt(e.target.value, 10) || 8)}
                  className="w-24 bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">Contract JSON Schema</label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewContractSchema(
                        JSON.stringify(
                          {
                            type: 'object',
                            required: ['summary', 'citations'],
                            properties: {
                              summary: { type: 'string' },
                              citations: { type: 'array', items: { type: 'string' } },
                              confidence: { type: 'number' }
                            }
                          },
                          null,
                          2
                        )
                      );
                    }}
                    className="text-[10px] text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    Reset to Default Schema
                  </button>
                </div>
                <textarea
                  rows={6}
                  value={newContractSchema}
                  onChange={(e) => setNewContractSchema(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600 shadow-2xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateContractOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                >
                  Save Contract
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Embedded Swarm Inspector Modal */}
      <SwarmInspectorModal
        isOpen={isSwarmInspectorOpen}
        executionId=""
        executionCorrelationId={currentProject?.name}
        onClose={() => {
          setIsSwarmInspectorOpen(false);
          loadHubData();
        }}
      />
    </div>
  );
};
