import React, { useState, useEffect } from 'react';
import { Server, Activity, Cpu, CheckCircle2, AlertCircle, Clock, RefreshCw, X, Copy, Check, Play, Sliders, Zap, Loader2, Plus, Trash2 } from 'lucide-react';
import { apiService } from '../services/api';
import { Project, QueueStats, QueueTaskItem } from '../types';

interface TaskQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject?: Project | null;
}

export const TaskQueueModal: React.FC<TaskQueueModalProps> = ({ isOpen, onClose, currentProject }) => {
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [tasks, setTasks] = useState<QueueTaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedCli, setCopiedCli] = useState(false);
  const [isUpdatingConcurrency, setIsUpdatingConcurrency] = useState(false);
  const [isSpawningWorker, setIsSpawningWorker] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [stoppingWorkerPids, setStoppingWorkerPids] = useState<number[]>([]);

  const fetchQueueData = async () => {
    try {
      const [s, t] = await Promise.all([
        apiService.getQueueStats(currentProject?.id),
        apiService.getQueueTasks(15, undefined, currentProject?.id)
      ]);
      setStats(s);
      setTasks(t);
    } catch (e) {
      console.error('Error fetching queue status:', e);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchQueueData();
    const interval = setInterval(fetchQueueData, 2000);
    return () => clearInterval(interval);
  }, [isOpen, currentProject?.id]);

  if (!isOpen) return null;

  const currentConcurrency = stats?.desired_concurrency ?? 2;
  const cliCommand = `python -m app.worker --concurrency ${currentConcurrency}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(cliCommand);
    setCopiedCli(true);
    setTimeout(() => setCopiedCli(false), 2000);
  };

  const handleConcurrencyChange = async (val: number) => {
    if (val < 1 || val > 16 || isUpdatingConcurrency) return;
    setIsUpdatingConcurrency(true);
    try {
      const res = await apiService.setQueueConcurrency(val);
      if (res.stats) {
        setStats(res.stats);
      } else {
        await fetchQueueData();
      }
    } catch (e) {
      console.error('Error updating queue concurrency:', e);
    } finally {
      setIsUpdatingConcurrency(false);
    }
  };

  const handleSpawnWorker = async () => {
    setIsSpawningWorker(true);
    try {
      const res = await apiService.spawnWorkerProcess(currentConcurrency || 2);
      if (res.stats) {
        setStats(res.stats);
      }
      await new Promise((r) => setTimeout(r, 800));
      await fetchQueueData();
    } catch (e: any) {
      console.error('Failed to spawn worker process:', e);
      alert(e?.response?.data?.detail || e.message || 'Failed to spawn worker process');
    } finally {
      setIsSpawningWorker(false);
    }
  };

  const handleStopWorker = async (pid: number) => {
    setStoppingWorkerPids((prev) => [...prev, pid]);
    try {
      const res = await apiService.stopWorkerProcess(pid);
      if (res.stats) {
        setStats(res.stats);
      }
      await fetchQueueData();
    } catch (e) {
      console.error('Failed to stop worker process:', e);
    } finally {
      setStoppingWorkerPids((prev) => prev.filter((p) => p !== pid));
    }
  };

  const handleRetryTask = async (taskId: string) => {
    try {
      await apiService.retryQueueTask(taskId);
      await fetchQueueData();
    } catch (e) {
      console.error('Error retrying task:', e);
    }
  };

  const handleClearHistory = async () => {
    if (!window.confirm('Clear all finished, cancelled, and failed queue tasks from history?')) return;
    setIsClearingHistory(true);
    try {
      await apiService.clearQueueTasks(currentProject?.id);
      await fetchQueueData();
    } catch (e) {
      console.error('Error clearing queue history:', e);
    } finally {
      setIsClearingHistory(false);
    }
  };

  const hasWorkers = stats && stats.total_active_workers > 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs p-3 sm:p-6 flex items-start justify-center">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] my-auto animate-in fade-in zoom-in duration-150">
        
        {/* Header (Always Visible, Never Cut Off) */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs ${
              hasWorkers ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
            }`}>
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">Distributed Task Queue & Worker Daemon</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                  hasWorkers ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-slate-100 text-slate-700 border border-slate-300'
                }`}>
                  {hasWorkers ? `${stats.total_active_workers} Worker(s) Online` : 'Embedded Mode'}
                </span>
                {currentProject && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {currentProject.name}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">Zero-dependency, transactional queue with crash recovery and dynamic concurrency</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-2 rounded-xl hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 min-h-0 flex-1">
          
          {/* Key Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-amber-700 text-xs font-semibold mb-1">
                <span>Queued</span>
                <Clock className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold text-amber-900">{stats?.queued ?? 0}</div>
              <div className="text-[10px] text-amber-700 mt-0.5">Waiting for worker slot</div>
            </div>

            <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-blue-700 text-xs font-semibold mb-1">
                <span>Running</span>
                <Activity className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold text-blue-900">{stats?.running ?? 0}</div>
              <div className="text-[10px] text-blue-700 mt-0.5">Active scenario executions</div>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold mb-1">
                <span>Completed</span>
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold text-emerald-900">{stats?.completed ?? 0}</div>
              <div className="text-[10px] text-emerald-700 mt-0.5">Successfully finished</div>
            </div>

            <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-rose-700 text-xs font-semibold mb-1">
                <span>Failed</span>
                <AlertCircle className="w-4 h-4" />
              </div>
              <div className="text-2xl font-bold text-rose-900">{stats?.failed ?? 0}</div>
              <div className="text-[10px] text-rose-700 mt-0.5">Retries / errors logged</div>
            </div>
          </div>

          {/* Dynamic Concurrency Control Panel */}
          <div className="bg-gradient-to-r from-indigo-50/90 via-blue-50/70 to-slate-50/90 border border-indigo-200 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-800">Dynamic Queue Concurrency Control</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                      {currentConcurrency} Concurrent Slots
                    </span>
                    {isUpdatingConcurrency && (
                      <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500">Scale parallel execution capacity directly from the UI without terminal commands</p>
                </div>
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg shrink-0 whitespace-nowrap shadow-2xs">
                Live Scaling
              </span>
            </div>

            <div className="bg-white/90 backdrop-blur-xs border border-indigo-100 rounded-xl p-4 space-y-3 shadow-2xs">
              <div className="flex items-center gap-4">
                <span className="text-xs font-semibold text-slate-700 w-24 shrink-0">Parallel Limit:</span>
                <input
                  type="range"
                  min="1"
                  max="8"
                  step="1"
                  value={currentConcurrency}
                  onChange={(e) => handleConcurrencyChange(parseInt(e.target.value, 10))}
                  disabled={isUpdatingConcurrency}
                  className="flex-1 accent-indigo-600 cursor-pointer h-2 bg-slate-200 rounded-lg"
                />
                <span className="w-12 text-center font-mono font-bold text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 py-1 rounded-lg">
                  {currentConcurrency}x
                </span>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-2">
                <span className="text-xs font-medium text-slate-500">Quick Presets:</span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {[
                    { label: '1 (Low CPU)', val: 1, desc: 'Gentle on battery/fans' },
                    { label: '2 (Balanced)', val: 2, desc: 'Recommended default' },
                    { label: '4 (Fast)', val: 4, desc: 'Parallel high throughput' },
                    { label: '8 (Max Power)', val: 8, desc: 'Full multicore scale' }
                  ].map((p) => (
                    <button
                      key={p.val}
                      onClick={() => handleConcurrencyChange(p.val)}
                      disabled={isUpdatingConcurrency}
                      title={p.desc}
                      className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                        currentConcurrency === p.val
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-3">
              <Zap className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                Embedded worker automatically claims and processes up to <strong>{currentConcurrency} scenarios in parallel</strong> simultaneously.
              </span>
            </div>
          </div>

          {/* Worker Nodes Status */}
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-slate-500" />
                Active Worker Processes
              </span>
              <div className="flex items-center gap-2.5">
                <span className="text-xs font-mono text-slate-600 font-medium">
                  Total Capacity: {stats?.total_worker_concurrency ?? 0} slots
                </span>
                <button
                  type="button"
                  onClick={handleSpawnWorker}
                  disabled={isSpawningWorker}
                  className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Spawn a new independent Python worker process directly from UI"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isSpawningWorker ? 'Spawning...' : 'Add Worker'}</span>
                </button>
              </div>
            </div>

            {(!stats?.workers || stats.workers.length === 0) ? (
              <div className="p-4 bg-slate-50/30 text-center">
                <p className="text-xs text-slate-600 font-medium">No external worker processes currently active.</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  FastAPI embedded worker automatically handles background queue tasks with zero setup.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 bg-white">
                {stats.workers.map((w) => {
                  const isEmbedded = w.worker_id === 'embedded-worker-fastapi';
                  const isStopping = Boolean(w.pid && stoppingWorkerPids.includes(w.pid));
                  return (
                    <div key={w.worker_id} className="p-3 px-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-slate-800">{w.worker_id}</span>
                            {isEmbedded ? (
                              <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                System Embedded
                              </span>
                            ) : (
                              <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                Standalone Process
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">Host: {w.hostname} · PID: {w.pid}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-5 text-xs text-slate-600">
                        <div>
                          <span className="text-slate-400 text-[11px]">Concurrency:</span>{' '}
                          <span className="font-semibold text-slate-800">{w.concurrency} slots</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px]">Active:</span>{' '}
                          <span className="font-semibold text-blue-600">{w.active_tasks}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[11px]">Completed:</span>{' '}
                          <span className="font-semibold text-emerald-600">{w.completed_tasks}</span>
                        </div>
                        {!isEmbedded && typeof w.pid === 'number' && (
                          <button
                            type="button"
                            onClick={() => handleStopWorker(w.pid as number)}
                            disabled={isStopping}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 transition-colors cursor-pointer flex items-center gap-1 disabled:opacity-50"
                            title="Stop this worker process"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>{isStopping ? 'Stopping...' : 'Stop'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Standalone Worker CLI Instruction Box */}
          <div className="bg-slate-900 rounded-xl p-4 text-white shadow-inner">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-semibold text-slate-200">Optional: Run Standalone CLI Worker in Background</span>
              </div>
              <button
                onClick={copyToClipboard}
                className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-1 rounded-lg transition-colors cursor-pointer border border-slate-700"
              >
                {copiedCli ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCli ? 'Copied!' : 'Copy Command'}</span>
              </button>
            </div>
            <code className="block bg-slate-950 px-3.5 py-2 rounded-lg font-mono text-xs text-emerald-400 border border-slate-800 select-all">
              {cliCommand}
            </code>
            <p className="text-[11px] text-slate-400 mt-2">
              Running this command in an external terminal will offload matrix executions from your web server to a separate CPU process.
            </p>
          </div>

          {/* Recent Queue Tasks Stream */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Recent Queue Tasks {currentProject ? `(${currentProject.name})` : ''}
              </h3>
              <div className="flex items-center gap-2.5">
                {tasks.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    disabled={isClearingHistory}
                    className="text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 flex items-center gap-1 font-semibold cursor-pointer transition-colors disabled:opacity-50"
                    title="Clear completed, cancelled, and failed queue tasks"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isClearingHistory ? 'Clearing...' : 'Clear History'}</span>
                  </button>
                )}
                <button
                  onClick={fetchQueueData}
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-semibold cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh Stream
                </button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto shadow-2xs">
              {tasks.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 bg-slate-50/50">
                  No queue tasks for this project yet.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0 shadow-2xs">
                    <tr>
                      <th className="py-2.5 px-3.5">Scenario</th>
                      <th className="py-2.5 px-3.5">Status</th>
                      <th className="py-2.5 px-3.5">Worker ID</th>
                      <th className="py-2.5 px-3.5">Attempts</th>
                      <th className="py-2.5 px-3.5">Duration</th>
                      <th className="py-2.5 px-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono bg-white">
                    {tasks.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-3.5 font-sans font-semibold text-slate-800">
                          Scenario #{t.scenario_index}
                        </td>
                        <td className="py-2.5 px-3.5">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            t.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                            t.status === 'RUNNING' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                            t.status === 'FAILED' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                            'bg-amber-100 text-amber-700 border border-amber-200'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-xs text-slate-500 truncate max-w-[160px]">
                          {t.worker_id || '—'}
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-600">
                          {t.attempts}/{t.max_retries}
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-600">
                          {t.duration_ms ? `${t.duration_ms}ms` : '—'}
                        </td>
                        <td className="py-2.5 px-3.5 text-right">
                          {t.status === 'FAILED' && (
                            <button
                              onClick={() => handleRetryTask(t.id)}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-sans font-semibold transition-colors cursor-pointer border border-indigo-200"
                            >
                              Retry
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Footer (Always Visible, Never Cut Off) */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            <span className="font-medium">Database-backed Transactional Broker · Automatic stale task recovery</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition-all shadow-xs cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
