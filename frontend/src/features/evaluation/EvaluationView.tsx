import React from 'react';
import { EvaluationResult, ExecutionRun } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import {
  Scale,
  CheckCircle2,
  AlertOctagon,
  Sparkles,
  ShieldCheck,
  Zap,
  Target,
  FileCheck2
} from 'lucide-react';

interface EvaluationViewProps {
  evaluations: EvaluationResult[];
  selectedExecution: ExecutionRun | null;
}

export const EvaluationView: React.FC<EvaluationViewProps> = ({
  evaluations,
  selectedExecution,
}) => {
  const layer1Evals = evaluations.filter((e) => e.layer === 1);
  const layer2Evals = evaluations.filter((e) => e.layer === 2);
  const layer3Evals = evaluations.filter((e) => e.layer === 3);

  const hasEvals = evaluations.length > 0;
  const totalScore = hasEvals
    ? (evaluations.reduce((acc, e) => acc + (e.score * e.weight), 0) /
       evaluations.reduce((acc, e) => acc + e.weight, 0) * 100).toFixed(1)
    : '—';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl p-6 border border-purple-200 bg-gradient-to-r from-purple-50 via-indigo-50 to-white flex items-center justify-between shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Scale className="w-5 h-5 text-purple-700" />
            <h2 className="text-xl font-bold font-display text-slate-900">3-Layer Evaluation System</h2>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
              Deterministic • Semantic • LLM Judge
            </span>
          </div>
          <p className="text-xs text-slate-600 max-w-2xl font-medium">
            Agent trajectory validation combining deterministic assertions, semantic alignment, and multi-metric LLM judges.
          </p>
        </div>

        <div className="text-right">
          <span className="text-xs text-slate-600 font-semibold">Quality Score</span>
          <div className="text-3xl font-extrabold font-display text-purple-700">
            {hasEvals ? `${totalScore}%` : '—'}
          </div>
          <span className="text-[11px] text-slate-700 font-bold">
            {hasEvals ? 'Status: PASS' : 'No evaluations recorded'}
          </span>
        </div>
      </div>

      {!hasEvals ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200 shadow-sm text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 mx-auto">
            <Scale className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">No 3-Layer Evaluations in this Project</h3>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            Execute a test workflow or run a test case to automatically generate Layer 1 (Deterministic), Layer 2 (Semantic), and Layer 3 (LLM Judge) score breakdowns.
          </p>
        </div>
      ) : (
        <>
          {/* Layer 1: Deterministic & Trajectory */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700">
                  L1
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Layer 1: Deterministic Assertions</h3>
                  <p className="text-[11px] text-slate-500 font-medium">HTTP status codes, regex matching, tool sequence integrity</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {layer1Evals.map((ev, i) => (
                <div key={ev.id || i} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{ev.evaluator_name}</span>
                    <StatusBadge status={ev.verdict} size="sm" />
                  </div>
                  <p className="text-xs text-slate-700 font-medium">{ev.reason}</p>
                  
                  {/* Evidence */}
                  {ev.evidence?.length > 0 && (
                    <div className="space-y-1 pt-2">
                      <span className="text-[10px] font-bold text-slate-600 uppercase">Evidence:</span>
                      {ev.evidence.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-[11px] text-emerald-800 font-semibold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Violations */}
                  {ev.violations?.length > 0 && (
                    <div className="space-y-1 pt-2">
                      <span className="text-[10px] font-bold text-rose-700 uppercase">Violations Detected:</span>
                      {ev.violations.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-[11px] text-rose-800 font-semibold">
                          <AlertOctagon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Layer 2: Semantic Alignment */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-cyan-50 border border-cyan-200 flex items-center justify-center text-xs font-bold text-cyan-800">
                  L2
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Layer 2: Semantic Intent Alignment</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Vector cosine similarity and concept token overlap</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {layer2Evals.map((ev, i) => (
                <div key={ev.id || i} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{ev.evaluator_name}</span>
                    <StatusBadge status={ev.verdict} size="sm" />
                  </div>
                  <p className="text-xs text-slate-700 font-medium">{ev.reason}</p>
                  {ev.evidence?.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-[11px] text-cyan-800 font-semibold">
                      <Target className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Layer 3: LLM-as-a-Judge */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-xs font-bold text-purple-700">
                  L3
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Layer 3: LLM-as-a-Judge</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Task Completion, Groundedness, Policy Adherence</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {layer3Evals.map((ev, i) => (
                <div key={ev.id || i} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{ev.evaluator_name}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-purple-800">{(ev.score * 100).toFixed(0)}%</span>
                      <StatusBadge status={ev.verdict} size="sm" />
                    </div>
                  </div>
                  <p className="text-xs text-slate-700 font-medium">{ev.reason}</p>
                  
                  {ev.evidence?.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-[11px] text-emerald-800 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}

                  {ev.violations?.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-[11px] text-rose-800 font-semibold">
                      <AlertOctagon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
