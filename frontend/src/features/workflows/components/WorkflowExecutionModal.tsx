import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { WorkflowNode } from '../../../types';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  X,
  Square,
  Copy,
  Check,
  CheckCheck
} from 'lucide-react';
import { getNodeBadge } from './CanvasNode';

export interface StepExecutionState {
  nodeKey: string;
  nodeLabel: string;
  nodeType: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  durationMs?: number;
  statusCode?: number;
  response?: any;
  extractedVariables?: Record<string, any>;
  error?: string;
  startedAt?: number;
}

interface WorkflowExecutionModalProps {
  isOpen: boolean;
  workflowName: string;
  steps: StepExecutionState[];
  isExecuting: boolean;
  totalDurationSec: number;
  currentStepIndex: number;
  onStopExecution: () => void;
  onRerunWorkflow: () => void;
  onClose: () => void;
  onSelectNodeToInspect?: (nodeKey: string) => void;
}

export const WorkflowExecutionModal: React.FC<WorkflowExecutionModalProps> = ({
  isOpen,
  workflowName,
  steps,
  isExecuting,
  totalDurationSec,
  currentStepIndex,
  onStopExecution,
  onRerunWorkflow,
  onClose,
}) => {
  const [expandedStepKeys, setExpandedStepKeys] = useState<Record<string, boolean>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Auto-expand ONLY if a step failed so the user can immediately diagnose errors
  useEffect(() => {
    const failedStep = steps.find((s) => s.status === 'FAILED');
    if (failedStep) {
      setExpandedStepKeys((prev) => ({
        ...prev,
        [failedStep.nodeKey]: true
      }));
    }
  }, [steps]);

  if (!isOpen) return null;

  const completedCount = steps.filter((s) => s.status === 'SUCCESS').length;
  const failedCount = steps.filter((s) => s.status === 'FAILED').length;
  const totalCount = steps.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const hasFailed = failedCount > 0;
  const isFinished = !isExecuting && (completedCount + failedCount === totalCount || hasFailed);

  const toggleExpand = (key: string) => {
    setExpandedStepKeys((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleCopyJson = (data: any, key: string) => {
    try {
      navigator.clipboard.writeText(typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data));
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {}
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}s`;
  };

  // Mount modal directly to document.body to guarantee viewport escape from parent scroll/clipping
  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 md:p-8 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExecuting) {
          onClose();
        }
      }}
    >
      {/* Centered, balanced, bounded modal container */}
      <div
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 my-auto"
        style={{
          height: 'min(680px, 84vh)',
          maxHeight: '84vh',
        }}
      >
        {/* 1. Modal Header (Pinned top) */}
        <div className="px-5 py-4 border-b border-slate-100 bg-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-2xs shrink-0 transition-colors ${
                isExecuting
                  ? 'bg-blue-600 text-white animate-pulse'
                  : hasFailed
                  ? 'bg-rose-600 text-white'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              {isExecuting ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : hasFailed ? (
                <XCircle className="w-4 h-4" />
              ) : (
                <CheckCircle2 className="w-4 h-4" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900 font-display truncate">
                  Workflow Execution Progress
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border uppercase tracking-wider ${
                    isExecuting
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : hasFailed
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {isExecuting ? 'Running Live' : hasFailed ? 'Execution Stopped' : 'Completed'}
                </span>
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium mt-0.5">
                <span className="truncate max-w-[180px] text-slate-700 font-bold">{workflowName}</span>
                <span>•</span>
                <span>{totalCount} Steps</span>
                <span>•</span>
                <span className="font-mono text-slate-600 font-bold">⏱️ {formatSeconds(totalDurationSec)}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors cursor-pointer border border-slate-200 shadow-2xs"
            title="Close Dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Progress Bar (Pinned) */}
        <div className="px-5 py-2.5 bg-slate-50/80 border-b border-slate-100 shrink-0 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-bold">
            <span className="text-slate-700">
              {isExecuting
                ? steps.filter((s) => s.status === 'RUNNING').length > 1
                  ? `⚡ Running ${steps.filter((s) => s.status === 'RUNNING').length} Parallel Steps Concurrently (${completedCount}/${totalCount} Completed)...`
                  : `Executing Step ${Math.min(completedCount + 1, totalCount)} of ${totalCount}...`
                : isFinished && !hasFailed
                ? `All ${totalCount} Steps Completed Cleanly!`
                : `Execution Stopped (${completedCount}/${totalCount} Completed)`}
            </span>
            <span className="font-mono text-blue-700">{progressPercent}%</span>
          </div>

          <div className="w-full h-2 rounded-full bg-slate-200/70 overflow-hidden p-0.5 flex">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                hasFailed ? 'bg-rose-500' : isFinished ? 'bg-emerald-500' : 'bg-blue-600'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* 3. Scrollable Steps List (Flexible middle pane) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-2 bg-slate-50/40">
          {steps.map((step, idx) => {
            const isExpanded = Boolean(expandedStepKeys[step.nodeKey]);
            const isCurrent = step.status === 'RUNNING';
            const mockNode: WorkflowNode = {
              node_key: step.nodeKey,
              node_type: step.nodeType as any,
              label: step.nodeLabel,
              config: {},
              assertions: [],
              position_x: 0,
              position_y: 0
            };

            return (
              <div
                key={step.nodeKey}
                className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                  isCurrent
                    ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-200/70 shadow-2xs'
                    : step.status === 'SUCCESS'
                    ? 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                    : step.status === 'FAILED'
                    ? 'bg-rose-50/60 border-rose-200 shadow-2xs'
                    : 'bg-white/70 border-slate-200 opacity-60'
                }`}
              >
                {/* Compact Step Row Header */}
                <div
                  onClick={() => toggleExpand(step.nodeKey)}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-2.5 cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {/* Status Icon */}
                    <div className="shrink-0">
                      {step.status === 'PENDING' && (
                        <div className="w-5 h-5 rounded-md bg-slate-100 text-slate-400 flex items-center justify-center">
                          <Clock className="w-3 h-3" />
                        </div>
                      )}
                      {step.status === 'RUNNING' && (
                        <div className="w-5 h-5 rounded-md bg-blue-600 text-white flex items-center justify-center shadow-2xs">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        </div>
                      )}
                      {step.status === 'SUCCESS' && (
                        <div className="w-5 h-5 rounded-md bg-emerald-600 text-white flex items-center justify-center shadow-2xs">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                      {step.status === 'FAILED' && (
                        <div className="w-5 h-5 rounded-md bg-rose-600 text-white flex items-center justify-center shadow-2xs">
                          <X className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </div>

                    {/* Index & Type Badge */}
                    <span className="text-[10px] font-mono font-bold text-slate-400 w-4 shrink-0">
                      #{idx + 1}
                    </span>

                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                      {getNodeBadge(mockNode)}
                    </span>

                    {/* Step Label */}
                    <span className="text-xs font-bold text-slate-900 truncate font-display">
                      {step.nodeLabel}
                    </span>
                  </div>

                  {/* Right Status Badge & Duration */}
                  <div className="flex items-center gap-2 shrink-0">
                    {step.durationMs !== undefined && step.durationMs > 0 && (
                      <span className="text-[10px] font-mono text-slate-500 font-semibold">
                        {step.durationMs > 1000
                          ? `${(step.durationMs / 1000).toFixed(1)}s`
                          : `${step.durationMs}ms`}
                      </span>
                    )}

                    {step.status === 'SUCCESS' && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                        {step.statusCode || 200} OK
                      </span>
                    )}

                    {step.status === 'FAILED' && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-mono font-bold">
                        FAILED
                      </span>
                    )}

                    {step.status === 'RUNNING' && (
                      <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-mono font-bold animate-pulse">
                        RUNNING
                      </span>
                    )}

                    {step.status === 'PENDING' && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-400 text-[10px] font-mono font-bold">
                        QUEUED
                      </span>
                    )}

                    <div className="text-slate-400 hover:text-slate-600 pl-0.5">
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Details Pane (Response, Variables, Error) */}
                {isExpanded && (
                  <div className="px-3.5 pb-3 pt-1 border-t border-slate-100 bg-white space-y-2 text-xs">
                    {step.error && (
                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 space-y-1">
                        <div className="font-bold flex items-center gap-1 text-[10px] uppercase tracking-wider text-rose-900">
                          <AlertCircle className="w-3 h-3" />
                          <span>Error Details:</span>
                        </div>
                        <p className="font-mono text-[10px] whitespace-pre-wrap">{step.error}</p>
                      </div>
                    )}

                    {step.extractedVariables && Object.keys(step.extractedVariables).length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          Extracted Context Variables:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(step.extractedVariables).map(([k, val]) => (
                            <span
                              key={k}
                              className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800 font-mono text-[10px] font-bold"
                            >
                              {k}: <span className="text-slate-700">{JSON.stringify(val)}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {step.response !== undefined && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Response Payload:
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyJson(step.response, step.nodeKey);
                            }}
                            className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
                          >
                            {copiedKey === step.nodeKey ? (
                              <>
                                <CheckCheck className="w-3 h-3 text-emerald-600" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy JSON</span>
                              </>
                            )}
                          </button>
                        </div>
                        <pre className="p-2 rounded-lg bg-slate-900 text-emerald-400 font-mono text-[10px] max-h-36 overflow-y-auto leading-relaxed border border-slate-800">
                          {typeof step.response === 'object'
                            ? JSON.stringify(step.response, null, 2)
                            : String(step.response)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 4. Modal Footer with Actions (Pinned bottom) */}
        <div className="px-5 py-3 border-t border-slate-100 bg-white flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-3 text-xs font-bold">
            <span className="text-emerald-700 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
              {completedCount} Passed
            </span>
            {failedCount > 0 && (
              <span className="text-rose-700 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span>
                {failedCount} Failed
              </span>
            )}
            <span className="text-slate-400">
              {steps.filter((s) => s.status === 'PENDING').length} Queued
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isExecuting ? (
              <button
                type="button"
                onClick={onStopExecution}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold shadow-2xs transition-all cursor-pointer"
              >
                <Square className="w-3 h-3 fill-rose-600" />
                <span>Stop Execution</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onRerunWorkflow}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold shadow-2xs transition-all cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Re-run Flow</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              {isExecuting ? 'Hide / Background' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
