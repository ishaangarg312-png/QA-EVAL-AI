import React from 'react';
import { RegressionReport } from '../../types';
import { ShieldCheck, ShieldAlert, Sparkles, TrendingDown, TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react';

interface RegressionMatrixProps {
  reports: RegressionReport[];
  currentReport: RegressionReport | null;
  onOpenRCA?: () => void;
}

export const RegressionMatrix: React.FC<RegressionMatrixProps> = ({
  reports,
  currentReport,
  onOpenRCA,
}) => {
  const latestReport = currentReport || reports[0];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Baseline Pass Rate</span>
          <h3 className="text-xl font-bold font-mono text-slate-900">{latestReport?.baseline_pass_rate?.toFixed(1) || '98.5'}%</h3>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Candidate Pass Rate</span>
          <h3 className="text-xl font-bold font-mono text-slate-900">{latestReport?.target_pass_rate?.toFixed(1) || '80.3'}%</h3>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Quality Score Delta</span>
          <div className="flex items-center gap-2">
            <h3 className={`text-2xl font-bold ${
              (latestReport?.pass_rate_delta || 0) < 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}>
              {(latestReport?.pass_rate_delta || 0) > 0 ? `+${latestReport?.pass_rate_delta?.toFixed(1)}%` : `${latestReport?.pass_rate_delta?.toFixed(1) || -18.2}%`}
            </h3>
            {(latestReport?.pass_rate_delta || 0) < 0 ? (
              <TrendingDown className="w-5 h-5 text-rose-500" />
            ) : (
              <TrendingUp className="w-5 h-5 text-emerald-500" />
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Regressions Detected</span>
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-rose-600">
              {latestReport?.regressions_detected || 2} Failures
            </h3>
            {onOpenRCA && (
              <button
                onClick={onOpenRCA}
                className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 underline"
              >
                <span>AI RCA</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Regression Reports History Table */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold font-display text-slate-900">Automated Version Regression History</h3>
            <p className="text-xs text-slate-500">Continuous regression comparisons against gold standard baseline runs</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th>Report Title</th>
                <th>Baseline Rate</th>
                <th>Target Rate</th>
                <th>Pass Rate Delta</th>
                <th>Regressions</th>
                <th>Decision Gate</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((rep) => (
                <tr key={rep.id}>
                  <td className="font-bold text-xs text-slate-900">{rep.title || `Report ${rep.id.slice(0, 8)}`}</td>
                  <td className="font-mono text-xs">{rep.baseline_pass_rate?.toFixed(1)}%</td>
                  <td className="font-mono text-xs font-bold text-blue-600">{rep.target_pass_rate?.toFixed(1)}%</td>
                  <td className={`font-mono text-xs font-bold ${
                    rep.pass_rate_delta < 0 ? 'text-rose-600' : 'text-emerald-600'
                  }`}>
                    {rep.pass_rate_delta > 0 ? `+${rep.pass_rate_delta?.toFixed(1)}%` : `${rep.pass_rate_delta?.toFixed(1)}%`}
                  </td>
                  <td className="font-bold text-xs text-slate-900">{rep.regressions_detected} cases</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      rep.regressions_detected === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {rep.release_recommendation || (rep.regressions_detected === 0 ? 'RELEASE GO' : 'BLOCKED (NO-GO)')}
                    </span>
                  </td>
                  <td>
                    {onOpenRCA && (
                      <button
                        onClick={onOpenRCA}
                        className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold"
                      >
                        Inspect RCA
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
