import React, { useState } from 'react';
import {
  X,
  Sliders,
  Layers,
  MessageSquare,
  CheckCircle2,
  Save,
  ArrowRight,
  Check,
  Table,
  Zap,
  GitBranch,
  Sparkles,
  Info,
  Play
} from 'lucide-react';
import { DatasetExecutionStrategy, ExecutionStrategyMode, TestDataset } from '../../types';
import { groupDatasetIntoScenarios } from '../../utils/scenarioHelper';

interface ExecutionStrategyModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset: TestDataset;
  currentStrategy: DatasetExecutionStrategy;
  onApplyStrategy: (strategy: DatasetExecutionStrategy) => void;
  onSaveAsProjectTemplate?: (strategy: DatasetExecutionStrategy) => Promise<void>;
}

export const ExecutionStrategyModal: React.FC<ExecutionStrategyModalProps> = ({
  isOpen,
  onClose,
  dataset,
  currentStrategy,
  onApplyStrategy,
  onSaveAsProjectTemplate,
}) => {
  const [strategy, setStrategy] = useState<DatasetExecutionStrategy>(() => ({
    ...currentStrategy,
    parallel_limit: currentStrategy.parallel_limit ?? 1,
  }));
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  React.useEffect(() => {
    setStrategy({
      ...currentStrategy,
      parallel_limit: currentStrategy.parallel_limit ?? 1,
    });
  }, [currentStrategy]);

  if (!isOpen) return null;

  // Calculate live preview of scenarios under the selected strategy
  const previewScenarios = groupDatasetIntoScenarios(
    dataset.headers || [],
    dataset.rows || [],
    strategy
  );

  const rowCount = dataset.rows?.length || 0;
  const scenarioCount = previewScenarios.length;

  const handleModeChange = (mode: ExecutionStrategyMode) => {
    setStrategy((prev) => ({
      ...prev,
      mode,
    }));
  };

  const handleSaveTemplate = async () => {
    if (!onSaveAsProjectTemplate) return;
    setIsSavingTemplate(true);
    try {
      await onSaveAsProjectTemplate(strategy);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (e) {
      console.error('Failed to save project template', e);
    } finally {
      setIsSavingTemplate(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-150">
      {/* Modal Container: strictly bounded within viewport height */}
      <div
        style={{
          maxHeight: 'min(760px, calc(100vh - 32px))',
          width: '100%',
          maxWidth: '860px',
        }}
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
      >
        {/* Modal Header (Always visible at top) */}
        <div className="shrink-0 px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center shadow-xs shrink-0">
              <GitBranch className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Execution Flow & Routing Designer</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Dynamic Engine
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Configure how dataset spreadsheet rows map to pipeline execution instances.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body (Scrollable inside height boundary) */}
        <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-5 bg-slate-50/40">
          
          {/* Section 1: Execution Strategy Architecture */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">1</span>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Execution Strategy Architecture</h4>
              </div>
              <span className="text-[11px] text-slate-400">Select routing model</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Option A: Flat Row-by-Row */}
              <div
                onClick={() => handleModeChange('FLAT_ROW_BY_ROW')}
                className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer relative bg-white ${
                  strategy.mode === 'FLAT_ROW_BY_ROW'
                    ? 'border-indigo-600 ring-2 ring-indigo-500/10 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-lg ${strategy.mode === 'FLAT_ROW_BY_ROW' ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600'}`}>
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h5 className="text-xs font-bold text-slate-900">Flat Row-by-Row</h5>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Recommended
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500">1 Row = 1 Isolated Workflow Run</p>
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${strategy.mode === 'FLAT_ROW_BY_ROW' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'}`}>
                    {strategy.mode === 'FLAT_ROW_BY_ROW' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                </div>

                <p className="mt-2 text-[11px] text-slate-600 leading-relaxed">
                  Every spreadsheet row runs independently as an isolated scenario. Ideal for batch testing and parameterized workflow evaluations.
                </p>

                {/* Sub-option: Forward-fill empty blanks */}
                {strategy.mode === 'FLAT_ROW_BY_ROW' && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={strategy.forward_fill_blanks ?? true}
                        onChange={(e) =>
                          setStrategy((prev) => ({
                            ...prev,
                            forward_fill_blanks: e.target.checked,
                          }))
                        }
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Inherit blank cells from above (Forward-Fill)</span>
                    </label>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">Spreadsheet Standard</span>
                  </div>
                )}
              </div>

              {/* Option B: Conversational Multi-Turn */}
              <div
                onClick={() => handleModeChange('MULTI_TURN')}
                className={`p-3.5 rounded-xl border-2 transition-all cursor-pointer relative bg-white ${
                  strategy.mode === 'MULTI_TURN'
                    ? 'border-indigo-600 ring-2 ring-indigo-500/10 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-1.5 rounded-lg ${strategy.mode === 'MULTI_TURN' ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-slate-100 text-slate-600'}`}>
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold text-slate-900">Conversational Multi-Turn</h5>
                      <p className="text-[10px] text-slate-500">Sequential Session Grouping</p>
                    </div>
                  </div>
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${strategy.mode === 'MULTI_TURN' ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'}`}>
                    {strategy.mode === 'MULTI_TURN' && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                </div>

                <p className="mt-2 text-[11px] text-slate-600 leading-relaxed">
                  Groups rows into conversational sessions. Initial prompt creates a session; subsequent rows execute as follow-up turns in that session.
                </p>

                {/* Session Boundary Selector */}
                {strategy.mode === 'MULTI_TURN' && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 space-y-1">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
                      Session Boundary Column:
                    </label>
                    <select
                      value={strategy.group_by_column || ''}
                      onChange={(e) =>
                        setStrategy((prev) => ({
                          ...prev,
                          group_by_column: e.target.value || undefined,
                        }))
                      }
                      className="w-full text-xs rounded-lg border border-slate-300 px-2 py-1 bg-white text-slate-700 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="">Auto-detect empty prompt boundary</option>
                      {dataset.headers?.map((h) => (
                        <option key={h} value={h}>
                          Group by {h}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: Concurrency & Parallel Execution Workers */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">2</span>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Parallel Execution Concurrency</h4>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
                (strategy.parallel_limit || 1) > 1 
                  ? 'bg-amber-50 text-amber-800 border border-amber-200' 
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}>
                {(strategy.parallel_limit || 1) > 1 ? `⚡ ${(strategy.parallel_limit || 1)} Parallel Workers` : '1 Worker (Sequential Default)'}
              </span>
            </div>

            <p className="text-xs text-slate-500">
              Configure how many scenarios run simultaneously across the pipeline. Default is 1 parallel. Saved in project template.
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {[1, 2, 4, 8].map((num) => {
                const isSelected = (strategy.parallel_limit || 1) === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setStrategy((prev) => ({ ...prev, parallel_limit: num }))}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {num === 1 ? '1 (Sequential)' : `${num} Parallel`}
                  </button>
                );
              })}

              <div className="flex items-center gap-1.5 ml-auto text-xs text-slate-600">
                <span className="font-medium">Custom:</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={strategy.parallel_limit || 1}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(20, parseInt(e.target.value) || 1));
                    setStrategy((prev) => ({ ...prev, parallel_limit: val }));
                  }}
                  className="w-16 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-center focus:outline-none focus:border-indigo-600"
                />
                <span className="text-[11px] text-slate-400">max 20</span>
              </div>
            </div>
          </div>

          {/* Section 3: Interactive Execution Flow Canvas */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center">3</span>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Interactive Execution Flow Canvas</h4>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                {(strategy.parallel_limit || 1) > 1
                  ? `⚡ Target: ${scenarioCount} Scenarios (${strategy.parallel_limit}x Parallel Runs)`
                  : `Target: ${scenarioCount} Scenarios (Sequential 1-by-1)`}
              </span>
            </div>

            {/* Visual Canvas Card */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
              
              {/* Flow Graph 3 Connected Nodes */}
              <div className="p-4 bg-gradient-to-r from-slate-50 via-indigo-50/30 to-emerald-50/30 border-b border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                  
                  {/* Step 1: Input Dataset */}
                  <div className="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs text-center">
                    <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <Table className="w-3 h-3 text-slate-400" />
                      <span>Step 1: Input Data</span>
                    </div>
                    <div className="font-bold text-slate-900 text-xs truncate mt-0.5" title={dataset.name}>
                      {dataset.name || 'Spreadsheet'}
                    </div>
                    <div className="mt-1 flex items-center justify-center gap-1">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold">
                        {rowCount} Rows
                      </span>
                      <span className="text-[10px] text-slate-400">({(dataset.headers || []).length} cols)</span>
                    </div>
                  </div>

                  {/* Step 2: Routing Engine */}
                  <div className="bg-white border border-indigo-200 rounded-lg p-2.5 shadow-2xs text-center">
                    <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                      <GitBranch className="w-3 h-3 text-indigo-600" />
                      <span>Step 2: Routing Engine</span>
                    </div>
                    <div className="font-bold text-indigo-950 text-xs mt-0.5">
                      {strategy.mode === 'FLAT_ROW_BY_ROW' ? 'Flat Row-by-Row' : 'Multi-Turn Grouping'}
                    </div>
                    <div className="mt-1 flex items-center justify-center">
                      <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono text-[10px] font-semibold">
                        {strategy.mode === 'FLAT_ROW_BY_ROW'
                          ? strategy.forward_fill_blanks ? 'Forward-Fill: ON' : 'Raw Rows'
                          : strategy.group_by_column ? `Key: ${strategy.group_by_column}` : 'Blank Split'}
                      </span>
                    </div>
                  </div>

                  {/* Step 3: Target Execution */}
                  <div className="bg-white border border-emerald-200 rounded-lg p-2.5 shadow-2xs text-center">
                    <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                      <Zap className="w-3 h-3 text-emerald-600" />
                      <span>Step 3: Target Runs</span>
                    </div>
                    <div className="font-bold text-emerald-950 text-xs mt-0.5">
                      {scenarioCount} Scenarios
                    </div>
                    <div className="mt-1 flex items-center justify-center">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-[10px] font-bold">
                        {strategy.mode === 'FLAT_ROW_BY_ROW' ? '100% Isolated DAGs' : 'Sequential Turns'}
                      </span>
                    </div>
                  </div>

                </div>
              </div>

              {/* Data Routing Distribution Matrix */}
              <div className="p-3.5">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-700">Scenario Distribution Matrix ({scenarioCount} Runs):</span>
                  <span className="text-[10px] text-slate-400 font-mono">Live Simulation</span>
                </div>

                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {previewScenarios.map((sc) => (
                    <div
                      key={sc.scenarioIndex}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 hover:bg-indigo-50/30 hover:border-indigo-200 transition-colors text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded bg-indigo-600 text-white font-mono font-bold text-[10px] flex items-center justify-center shrink-0">
                          #{sc.scenarioIndex}
                        </span>
                        <div className="truncate">
                          <span className="font-bold text-slate-800 text-[11px]">
                            {sc.scenarioTitle}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0 font-mono text-[10px]">
                        <span className="text-slate-400 hidden sm:inline">
                          Row #{sc.initialRowIndex + 1}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                          Trigger DAG
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* Modal Footer (Always visible at bottom) */}
        <div className="shrink-0 px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            {onSaveAsProjectTemplate && (
              <button
                type="button"
                onClick={handleSaveTemplate}
                disabled={isSavingTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-bold text-xs transition-all shadow-2xs cursor-pointer"
                title="Save this strategy as the default template for all datasets in this project"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Saved as Project Default!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Save as Project Template</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyStrategy(strategy);
                onClose();
              }}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
            >
              {(strategy.parallel_limit || 1) > 1 ? (
                <Zap className="w-3 h-3 text-amber-300 fill-amber-300" />
              ) : (
                <Play className="w-3 h-3 fill-current" />
              )}
              <span>
                {(strategy.parallel_limit || 1) > 1
                  ? `Apply & Run ${scenarioCount} Scenarios (${strategy.parallel_limit}x Parallel)`
                  : `Apply & Run ${scenarioCount} Scenarios (Sequential)`}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
