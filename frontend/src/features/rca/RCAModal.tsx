import React, { useState } from 'react';
import { RCAAnalysis } from '../../types';
import { Modal } from '../../components/Modal';
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  BookmarkPlus,
  Wrench,
  Link,
  ShieldAlert
} from 'lucide-react';

interface RCAModalProps {
  isOpen: boolean;
  onClose: () => void;
  rca: RCAAnalysis | null;
  onPromoteToRegression: () => Promise<void>;
}

export const RCAModal: React.FC<RCAModalProps> = ({
  isOpen,
  onClose,
  rca,
  onPromoteToRegression,
}) => {
  const [isPromoting, setIsPromoting] = useState(false);
  const [promotedSuccess, setPromotedSuccess] = useState(false);

  const handlePromote = async () => {
    setIsPromoting(true);
    try {
      await onPromoteToRegression();
      setPromotedSuccess(true);
      setTimeout(() => setPromotedSuccess(false), 3000);
    } finally {
      setIsPromoting(false);
    }
  };

  const analysis = rca || {
    root_cause: "Analysis of the agent execution traces reveals non-200 responses or timeout on dependent node API calls.",
    confidence: 0.95,
    affected_step: "Workflow Node Pipeline",
    trace_evidence_ids: ["evt-trace-api-01"],
    suggested_fix: "1. Verify endpoint health and timeout configuration.\n2. Ensure authentication token variables are correctly extracted and interpolated in downstream nodes.",
    regression_probability: 0.90,
    is_promoted_to_regression: "false"
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Root Cause Analysis (Trace-Grounded)"
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Confidence Header */}
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-rose-700">Diagnostic Summary</span>
              <h4 className="text-sm font-bold text-slate-900">Execution Trace Failure</h4>
            </div>
          </div>

          <div className="text-right font-mono text-xs">
            <span className="text-slate-600 font-semibold">Confidence:</span>
            <div className="text-lg font-bold text-indigo-700">{(analysis.confidence * 100).toFixed(0)}%</div>
          </div>
        </div>

        {/* Root Cause Details */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
          <div>
            <span className="font-bold text-slate-800 uppercase text-[10px] block mb-1">Identified Root Cause:</span>
            <p className="text-slate-800 leading-relaxed font-sans font-medium">{analysis.root_cause}</p>
          </div>

          <div className="flex items-center gap-4 pt-2 border-t border-slate-200 text-[11px] text-slate-600">
            <span>
              Affected Step: <strong className="text-slate-900">{analysis.affected_step}</strong>
            </span>
            <span>
              Likelihood: <strong className="text-rose-700">{(analysis.regression_probability * 100).toFixed(0)}%</strong>
            </span>
          </div>
        </div>

        {/* Actionable Suggested Fixes */}
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs">
          <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
            <Wrench className="w-4 h-4 text-emerald-700" />
            <span>Recommended Fixes</span>
          </div>
          <pre className="text-slate-800 font-sans text-xs whitespace-pre-wrap font-medium">
            {analysis.suggested_fix}
          </pre>
        </div>

        {/* Promote to Regression Test Button */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <span className="text-[11px] text-slate-500 font-medium">
            Save as regression test scenario
          </span>

          <button
            disabled={isPromoting || promotedSuccess}
            onClick={handlePromote}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer ${
              promotedSuccess
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {promotedSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Saved to Regression Suite!</span>
              </>
            ) : (
              <>
                <BookmarkPlus className="w-4 h-4" />
                <span>Save to Regression Suite</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
