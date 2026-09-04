import React, { useState, useEffect } from 'react';
import { Project, Environment, ReleaseDecision, QueueStats } from '../types';
import { Bot, Play, ShieldAlert, ShieldCheck, Sparkles, RefreshCw, Zap, ChevronDown, Plus, User as UserIcon, LogOut, Shield, Server, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LoginModal } from '../features/auth/LoginModal';
import { TaskQueueModal } from './TaskQueueModal';
import { apiService } from '../services/api';

interface NavbarProps {
  projects: Project[];
  currentProject: Project | null;
  onSelectProject: (project: Project) => void;
  onOpenCreateProject: () => void;
  currentEnv: Environment | null;
  onSelectEnv: (env: Environment) => void;
  releaseDecision: ReleaseDecision | null;
  onRunDemo: (type: 'v1_full' | 'v2_regressed') => void;
  onRunCurrentWorkflow: () => void;
  isRunningDemo: boolean;
  activeMatrixJob?: any | null;
  onOpenMatrixModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  projects,
  currentProject,
  onSelectProject,
  onOpenCreateProject,
  currentEnv,
  onSelectEnv,
  releaseDecision,
  onRunDemo,
  onRunCurrentWorkflow,
  isRunningDemo,
  activeMatrixJob,
  onOpenMatrixModal,
}) => {
  const { user, isAuthenticated, logout } = useAuth();
  const [showDemoMenu, setShowDemoMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const s = await apiService.getQueueStats();
        setQueueStats(s);
      } catch {}
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <header className="h-14 border-b border-slate-200 bg-white px-6 flex items-center justify-between sticky top-0 z-40 shadow-xs">
        {/* Brand & Project Selector */}
        <div className="flex items-center gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-xs text-white font-bold">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold font-display tracking-tight text-slate-900 flex items-center gap-1.5">
                <span>EVAL AI</span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold">
                  Suite
                </span>
              </h1>
            </div>
          </div>

          <div className="h-4 w-px bg-slate-200" />

          {/* Project Selector */}
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <select
                value={currentProject?.id || ''}
                onChange={(e) => {
                  const p = projects.find((proj) => proj.id === e.target.value);
                  if (p) onSelectProject(p);
                }}
                style={{ minWidth: '220px' }}
                className="bg-slate-50 hover:bg-slate-100/80 border border-slate-200 hover:border-slate-300 text-xs font-bold text-slate-800 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer shadow-xs transition-all appearance-none pr-8"
              >
                {projects.length === 0 ? (
                  <option value="">No Projects (Click + to add)</option>
                ) : (
                  projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      📁 {p.name}
                    </option>
                  ))
                )}
              </select>
              <div className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                <ChevronDown className="w-3.5 h-3.5" />
              </div>
            </div>

            <button
              onClick={onOpenCreateProject}
              title="Create New Project"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Project</span>
            </button>
          </div>
        </div>

        {/* Right Controls: Gate Status & Action Button & User Profile */}
        <div className="flex items-center gap-3">
          {/* Task Queue & Worker Status Pill */}
          <button
            onClick={() => setShowQueueModal(true)}
            title="Distributed Task Queue & Worker Daemon Status"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold shadow-xs transition-all cursor-pointer ${
              (queueStats?.total_active_workers ?? 0) > 0
                ? 'bg-emerald-50 hover:bg-emerald-100/80 border-emerald-200 text-emerald-800'
                : (queueStats?.queued ?? 0) > 0
                ? 'bg-amber-50 hover:bg-amber-100/80 border-amber-200 text-amber-800 animate-pulse'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
            }`}
          >
            <Server className={`w-3.5 h-3.5 ${
              (queueStats?.total_active_workers ?? 0) > 0 ? 'text-emerald-600' : 'text-slate-500'
            }`} />
            <span>
              {(queueStats?.total_active_workers ?? 0) > 0
                ? `${queueStats?.total_active_workers} Worker(s)`
                : (queueStats?.queued ?? 0) > 0
                ? `${queueStats?.queued} Queued`
                : 'Queue'}
            </span>
          </button>

          {/* Active / Interrupted Matrix Flow Button in Navbar */}
          {activeMatrixJob && (activeMatrixJob.status === 'INTERRUPTED' || activeMatrixJob.status === 'RUNNING') && (
            <button
              onClick={onOpenMatrixModal}
              title={activeMatrixJob.status === 'INTERRUPTED' ? 'Flow was interrupted on restart. Click to view or resume.' : 'Flow is executing in background. Click to view.'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold shadow-xs transition-all cursor-pointer ${
                activeMatrixJob.status === 'INTERRUPTED'
                  ? 'bg-amber-100 hover:bg-amber-200 border-amber-300 text-amber-900 animate-pulse'
                  : 'bg-indigo-50 hover:bg-indigo-100 border-indigo-200 text-indigo-800'
              }`}
            >
              {activeMatrixJob.status === 'INTERRUPTED' ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                  <span>Flow Interrupted ({activeMatrixJob.completed_scenarios || 0}/{activeMatrixJob.total_scenarios || 0})</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                  <span>Flow Running ({activeMatrixJob.completed_scenarios || 0}/{activeMatrixJob.total_scenarios || 0})</span>
                </>
              )}
            </button>
          )}

          {/* Release Quality Gate Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <span className="text-[11px] text-slate-500 font-medium">Gate:</span>
            {releaseDecision?.verdict === 'GO' ? (
              <span className="flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>GO</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-rose-700 font-bold text-[11px]">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                <span>NO-GO</span>
              </span>
            )}
          </div>


          <div className="h-4 w-px bg-slate-200" />

          {/* User Auth Profile / Login Button */}
          {isAuthenticated && user ? (
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-800 transition-all cursor-pointer"
              >
                <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-[11px]">
                  {user.full_name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="max-w-[100px] truncate">{user.full_name}</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-emerald-100 text-emerald-800">
                  {user.role}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white border border-slate-200 shadow-xl p-2 z-50 animate-scaleIn">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-900 truncate">{user.full_name}</p>
                    <p className="text-[11px] text-slate-500 font-mono truncate">{user.email}</p>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => {
                        logout();
                        setShowUserMenu(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-xs cursor-pointer"
            >
              <UserIcon className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </header>

      <LoginModal
        isOpen={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />

      <TaskQueueModal
        isOpen={showQueueModal}
        onClose={() => setShowQueueModal(false)}
        currentProject={currentProject}
      />
    </>
  );
};

