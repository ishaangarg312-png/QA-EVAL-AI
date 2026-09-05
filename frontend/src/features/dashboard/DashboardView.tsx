import React, { useState } from 'react';
import { ExecutionRun, ReleaseDecision, Project } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import {
  Folder,
  Activity,
  Target,
  CheckCircle2,
  Plus,
  Search,
  ChevronDown,
  MoreVertical,
  Bot,
  Clock,
  Trash2
} from 'lucide-react';

interface DashboardViewProps {
  executions: ExecutionRun[];
  releaseDecision: ReleaseDecision | null;
  projects?: Project[];
  currentProject: Project | null;
  onSelectProject?: (project: Project) => void;
  onOpenCreateProject?: () => void;
  onOpenDeleteProjects?: (projectId?: string) => void;
  onSelectExecution: (executionId: string) => void;
  onRunDemo: (type: 'v1_full' | 'v2_regressed') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  executions,
  releaseDecision,
  projects = [],
  currentProject,
  onSelectProject,
  onOpenCreateProject,
  onOpenDeleteProjects,
  onSelectExecution,
  onRunDemo,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const totalRuns = executions.length;
  const passedRuns = executions.filter((e) => e.status === 'PASSED').length;
  const avgAccuracy = totalRuns > 0 ? `${((passedRuns / totalRuns) * 100).toFixed(1)}%` : '0%';

  const defaultProjects: Partial<Project>[] = [
    { id: 'sage-agent', name: 'Sage Agent', description: 'G42 Orchestrator Agent for multi-turn messaging and tools' },
    { id: 'delphi-staging', name: 'G42 Delphi Staging CEO', description: 'Executive AI workflow automation and staging evaluator' },
    { id: 'custom-prod', name: 'G42 CUSTOM PROD CEO', description: 'Production evaluated CEO agent with safety guardrails' },
    { id: 'g42-tra', name: 'G42 TRA', description: 'Regulatory agency testing assistant with compliance assertions' },
  ];

  const allProjects = projects.length > 0 ? projects : defaultProjects as Project[];

  const filteredProjects = allProjects.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getProjectAvatarColor = (idx: number) => {
    const colors = [
      'bg-blue-600',
      'bg-purple-600',
      'bg-emerald-600',
      'bg-purple-700',
      'bg-indigo-600',
    ];
    return colors[idx % colors.length];
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. Header Greeting */}
      <div>
        <h1 className="text-2xl font-bold font-display text-slate-900 tracking-tight">
          Hi,
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Here's the pulse of your evaluation pipelines.
        </p>
      </div>

      {/* 2. Top Summary KPI Cards (4 Horizontal Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1: TOTAL PROJECTS */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4" style={{ backgroundColor: '#ffffff' }}>
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0" style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
            <Folder className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400" style={{ color: '#94a3b8' }}>TOTAL PROJECTS</div>
            <div className="text-3xl font-extrabold text-slate-900 font-display" style={{ color: '#0f172a' }}>{allProjects.length || 4}</div>
          </div>
        </div>

        {/* Card 2: EVALUATIONS RUN */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4" style={{ backgroundColor: '#ffffff' }}>
          <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0" style={{ backgroundColor: '#faf5ff', color: '#9333ea' }}>
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400" style={{ color: '#94a3b8' }}>EVALUATIONS RUN</div>
            <div className="text-3xl font-extrabold text-slate-900 font-display" style={{ color: '#0f172a' }}>
              {totalRuns > 0 ? `${totalRuns}` : '0'}
            </div>
          </div>
        </div>

        {/* Card 3: AVG. ACCURACY */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4" style={{ backgroundColor: '#ffffff' }}>
          <div className="w-12 h-12 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600 shrink-0" style={{ backgroundColor: '#ecfeff', color: '#0891b2' }}>
            <Target className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400" style={{ color: '#94a3b8' }}>AVG. ACCURACY</div>
            <div className="text-3xl font-extrabold text-slate-900 font-display" style={{ color: '#0f172a' }}>{avgAccuracy}</div>
          </div>
        </div>

        {/* Card 4: ONBOARDED */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center gap-4" style={{ backgroundColor: '#ffffff' }}>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0" style={{ backgroundColor: '#ecfdf5', color: '#059669' }}>
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400" style={{ color: '#94a3b8' }}>ONBOARDED</div>
            <div className="text-3xl font-extrabold text-slate-900 font-display" style={{ color: '#0f172a' }}>2</div>
          </div>
        </div>
      </div>

      {/* 3. All Projects Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight" style={{ color: '#0f172a' }}>All Projects</h2>
            <p className="text-xs text-slate-500 mt-0.5" style={{ color: '#64748b' }}>Projects listed here. Total {filteredProjects.length}</p>
          </div>

          <div className="flex items-center gap-2">
            {projects.length > 0 && onOpenDeleteProjects && (
              <button
                onClick={() => onOpenDeleteProjects()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold shadow-2xs transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-rose-600" />
                <span>Delete Projects</span>
              </button>
            )}

            <button
              onClick={onOpenCreateProject}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Project</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects..."
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 shadow-sm"
              style={{ backgroundColor: '#ffffff', color: '#0f172a', borderColor: '#e2e8f0' }}
            />
          </div>

          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
            style={{ backgroundColor: '#ffffff', color: '#334155', borderColor: '#e2e8f0' }}
          >
            <span>Status</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          <button
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer"
            style={{ backgroundColor: '#ffffff', color: '#334155', borderColor: '#e2e8f0' }}
          >
            <span>Framework</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

        {/* 4-Column Project Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {filteredProjects.map((p, idx) => {
            const isSelected = currentProject?.id === p.id;
            const isOnboarded = idx % 2 === 1;

            return (
              <div
                key={p.id}
                onClick={() => onSelectProject && onSelectProject(p)}
                className={`rounded-2xl p-5 border transition-all cursor-pointer shadow-sm relative flex flex-col justify-between h-44 ${isSelected
                  ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 hover:border-slate-300'
                  }`}
                style={{ backgroundColor: '#ffffff', borderColor: isSelected ? '#6366f1' : '#e2e8f0' }}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${getProjectAvatarColor(idx)} flex items-center justify-center text-white shrink-0 shadow-sm`}>
                        <Bot className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 leading-snug" style={{ color: '#0f172a' }}>{p.name}</h3>
                        <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full" style={{ backgroundColor: '#faf5ff', color: '#9333ea', borderColor: '#f3e8ff' }}>
                          🛡️ Custom
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 mt-2.5 line-clamp-2" style={{ color: '#94a3b8' }}>
                    {p.description || '-'}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto" style={{ borderColor: '#f1f5f9' }}>
                  <span className={`text-xs font-bold ${isOnboarded ? 'text-slate-700' : 'text-rose-500'
                    }`} style={{ color: isOnboarded ? '#334155' : '#f43f5e' }}>
                    {isOnboarded ? 'Onboarded' : 'Not Onboarded'}
                  </span>
                  <div className="flex items-center gap-1">
                    {onOpenDeleteProjects && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDeleteProjects(p.id);
                        }}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                        title={`Delete project "${p.name}"`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Active Project Executions & Traces Table */}
      <div className="rounded-2xl border shadow-sm overflow-hidden" style={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0' }}>
        <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: '#f1f5f9' }}>
          <div>
            <h3 className="text-sm font-bold text-slate-900" style={{ color: '#0f172a' }}>
              Evaluation Runs — {currentProject?.name || 'Active Project'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5" style={{ color: '#64748b' }}>
              Live multi-turn agent test executions and 3-layer validation results.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: '#64748b' }}>Release Gate:</span>
            {releaseDecision?.verdict === 'GO' ? (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
                GO (Approved)
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold" style={{ backgroundColor: '#fff1f2', color: '#e11d48', border: '1px solid #fecdd3' }}>
                NO-GO (Blocked)
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-[10px] border-b border-slate-100">
              <tr>
                <th className="px-6 py-3">Correlation ID</th>
                <th className="px-6 py-3">Version / Mode</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Quality Score</th>
                <th className="px-6 py-3">Safety Score</th>
                <th className="px-6 py-3">Duration</th>
                <th className="px-6 py-3">Tokens</th>
                <th className="px-6 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {executions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400">
                    <p className="text-xs font-semibold text-slate-600">No test executions yet in this project.</p>
                  </td>
                </tr>
              ) : (
                executions.map((exec) => (
                  <tr
                    key={exec.id}
                    onClick={() => onSelectExecution(exec.id)}
                    className="hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <td className="px-6 py-4 font-mono font-medium text-slate-900">
                      <div>{exec.correlation_id}</div>
                      <div className="text-[10px] text-slate-400 font-sans">{new Date(exec.created_at).toLocaleTimeString()}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-0.5 rounded font-mono text-[11px] bg-slate-100 text-slate-700">
                        {exec.agent_version_id ? 'v1.0.0' : 'Production'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={exec.status} size="sm" />
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-900">
                        {exec.quality_score ? `${exec.quality_score.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-medium text-slate-600">
                        {exec.safety_score ? `${exec.safety_score.toFixed(1)}%` : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-500">
                      {(exec.total_duration_ms / 1000).toFixed(2)}s
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-500">
                      {exec.total_tokens}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button className="text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                        View Trace →
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
