import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { TestSuite, TestCase, TestDataset, Project, Workflow, WorkflowNode, ExecutionRun, DatasetExecutionStrategy } from '../../types';
import { api } from '../../services/api';
import { groupDatasetIntoScenarios } from '../../utils/scenarioHelper';
import { ExcelReportModal } from '../executions/ExcelReportModal';
import { ExecutionStrategyModal } from './ExecutionStrategyModal';
import {
  FolderKanban,
  Database,
  Plus,
  Tag,
  ShieldCheck,
  FileText,
  CheckCircle2,
  Upload,
  FileSpreadsheet,
  Play,
  Trash2,
  Table,
  Sparkles,
  X,
  Check,
  HelpCircle,
  Clock,
  Coins,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  XCircle,
  Zap,
  Loader2,
  Code,
  Copy,
  Terminal,
  ArrowRight,
  Sliders,
  Layers
} from 'lucide-react';

interface NodeRunProgress {
  nodeKey: string;
  nodeLabel: string;
  nodeType: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  statusCode?: number;
  durationMs?: number;
  extractedVars?: Record<string, any>;
  requestPayload?: any;
  responsePayload?: any;
  error?: string;
}

interface ScenarioProgress {
  rowIndex: number;
  rowData: Record<string, any>;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  totalDurationMs?: number;
  nodeResults: NodeRunProgress[];
}

interface TestManagementViewProps {
  testSuites: TestSuite[];
  datasets: TestDataset[];
  currentProject: Project | null;
  currentWorkflow: Workflow | null;
  onSelectTestCase?: (testCase: TestCase) => void;
  onSaveDataset?: (dataset: { name: string; description?: string; headers: string[]; rows: any[] }) => Promise<void>;
  onRunBatchMatrix?: (dataset: TestDataset, strategy?: DatasetExecutionStrategy, selectedRowIndices?: number[]) => Promise<void>;
  onDeleteDataset?: (datasetId: string) => Promise<void>;
  onSaveProjectStrategy?: (strategy: DatasetExecutionStrategy) => Promise<void>;
  onViewTraces?: () => void;
}

export const TestManagementView: React.FC<TestManagementViewProps> = ({
  testSuites,
  datasets,
  currentProject,
  currentWorkflow,
  onSelectTestCase,
  onSaveDataset,
  onRunBatchMatrix,
  onDeleteDataset,
  onSaveProjectStrategy,
  onViewTraces,
}) => {
  const [selectedSuite, setSelectedSuite] = useState<TestSuite | null>(testSuites[0] || null);
  const [activeTab, setActiveTab] = useState<'suites' | 'datasets'>('datasets');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [projectExecutions, setProjectExecutions] = useState<ExecutionRun[]>([]);
  const [datasetName, setDatasetName] = useState('Customer Questions Matrix');
  const [datasetDesc, setDatasetDesc] = useState('3-Row test scenario for user queries & authentication');
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);
  const [selectedStrategyDataset, setSelectedStrategyDataset] = useState<TestDataset | null>(null);
  const [datasetStrategies, setDatasetStrategies] = useState<Record<string, DatasetExecutionStrategy>>({});
  const [selectedRowsByDataset, setSelectedRowsByDataset] = useState<Record<string, number[]>>({});

  const getSelectedRows = (datasetId: string) => selectedRowsByDataset[datasetId] || [];

  const toggleSelectRow = (datasetId: string, rowIndex: number) => {
    setSelectedRowsByDataset((prev) => {
      const current = prev[datasetId] || [];
      const updated = current.includes(rowIndex)
        ? current.filter((i) => i !== rowIndex)
        : [...current, rowIndex];
      return { ...prev, [datasetId]: updated };
    });
  };

  const toggleSelectAllRows = (datasetId: string, totalRows: number) => {
    setSelectedRowsByDataset((prev) => {
      const current = prev[datasetId] || [];
      if (current.length === totalRows) {
        const copy = { ...prev };
        delete copy[datasetId];
        return copy;
      } else {
        const all = Array.from({ length: totalRows }, (_, i) => i);
        return { ...prev, [datasetId]: all };
      }
    });
  };

  const clearSelectedRows = (datasetId: string) => {
    setSelectedRowsByDataset((prev) => {
      const copy = { ...prev };
      delete copy[datasetId];
      return copy;
    });
  };

  const getStrategyForDataset = (ds: TestDataset): DatasetExecutionStrategy => {
    let base: DatasetExecutionStrategy;
    if (datasetStrategies[ds.id]) {
      base = datasetStrategies[ds.id];
    } else if (ds.strategy) {
      base = ds.strategy;
    } else if (currentProject?.settings?.dataset_execution_strategy) {
      base = currentProject.settings.dataset_execution_strategy;
    } else {
      const hasFollowup = (ds.headers || []).some((h) => {
        const lh = h.toLowerCase();
        return lh.includes('follow') || lh.includes('turn');
      });
      base = {
        mode: hasFollowup ? 'MULTI_TURN' : 'FLAT_ROW_BY_ROW',
        forward_fill_blanks: true,
        parallel_limit: 1,
      };
    }
    return {
      ...base,
      parallel_limit: base.parallel_limit ?? 1,
    };
  };

  const handleOpenExcelModal = async () => {
    if (currentProject?.id) {
      try {
        const execs = await api.getExecutions(currentProject.id);
        setProjectExecutions(execs);
      } catch {
        setProjectExecutions([]);
      }
    }
    setIsExcelModalOpen(true);
  };
  


  // Spreadsheet / Matrix builder state
  const [headers, setHeaders] = useState<string[]>(['query', 'user_id', 'category']);
  const [rows, setRows] = useState<string[][]>([
    ['How to reset password?', 'usr_101', 'Auth'],
    ['What are the refund terms?', 'usr_102', 'Billing'],
    ['How to cancel subscription?', 'usr_103', 'Orders'],
  ]);

  const [rawPastedText, setRawPastedText] = useState('');
  const [uploadMode, setUploadMode] = useState<'table' | 'paste' | 'file'>('table');
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setSelectedSuite(testSuites.length > 0 ? testSuites[0] : null);
  }, [testSuites]);

  // Parse CSV / TSV text
  const handleParseCsvText = (text: string) => {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return;

    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const parsedHeaders = lines[0].split(delimiter).map((h) => h.trim().replace(/^["']|["']$/g, ''));
    const parsedRows = lines.slice(1).map((line) =>
      line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ''))
    );

    if (parsedHeaders.length > 0) {
      setHeaders(parsedHeaders);
      setRows(parsedRows.length > 0 ? parsedRows : [['', '', '']]);
    }
  };

  // Handle File Upload (.csv, .xlsx, .xls, .txt)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setDatasetName(file.name.replace(/\.[^/.]+$/, ''));
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const data = new Uint8Array(evt.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

          if (jsonData && jsonData.length > 0) {
            const rawHeaders = (jsonData[0] as any[]).map((h) => String(h ?? '').trim());
            const cleanHeaders = rawHeaders.filter((h) => h.length > 0);

            const rawRows = jsonData.slice(1) as any[][];
            const cleanRows = rawRows
              .filter((row) => row && row.some((c) => c !== undefined && c !== null && String(c).trim().length > 0))
              .map((row) => cleanHeaders.map((_, colIdx) => String(row[colIdx] ?? '')));

            if (cleanHeaders.length > 0) {
              setHeaders(cleanHeaders);
              setRows(cleanRows.length > 0 ? cleanRows : [cleanHeaders.map(() => '')]);
              setUploadMode('table');
            }
          }
        } catch (err) {
          console.error('Error parsing Excel file:', err);
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target?.result as string;
        if (content) {
          handleParseCsvText(content);
          setUploadMode('table');
        }
      };
      reader.readAsText(file);
    }
  };

  // Pre-load sample 3-row matrix
  const handleLoadSampleMatrix = () => {
    setDatasetName('3-Scenario Customer Inquiries');
    setDatasetDesc('Parameterized matrix testing password reset, refund inquiry, and order cancellation');
    setHeaders(['query', 'user_id', 'category']);
    setRows([
      ['How to reset password?', 'usr_101', 'Auth'],
      ['What are the refund terms?', 'usr_102', 'Billing'],
      ['How to cancel subscription?', 'usr_103', 'Orders'],
    ]);
    setUploadMode('table');
  };

  // Pre-load Multi-Turn Follow-Up conversation matrix matching user's exact format
  const handleLoadFollowupMatrix = () => {
    setDatasetName('Multi-Turn Follow-Up Matrix');
    setDatasetDesc('Multi-turn conversation sessions: initial message creates a session; consecutive rows without a message execute follow-up questions in that same session.');
    setHeaders(['message', 'followup']);
    setRows([
      ['Hi', 'Show Important clauses'],
      ['Hello There', 'Show me clauses of Microsoft'],
      ['', 'Important points from meredian policy documents'],
      ['', 'Show clauses of delphi'],
      ['', 'Changes we should do in policy document?'],
      ['What is reuirement for hc policy', 'Why make these changes?'],
      ['', 'Why should I listen to you'],
    ]);
    setUploadMode('table');
  };

  const handleAddColumn = () => {
    const colName = `var_${headers.length + 1}`;
    setHeaders([...headers, colName]);
    setRows(rows.map((r) => [...r, '']));
  };

  const handleAddRow = () => {
    setRows([...rows, headers.map(() => '')]);
  };

  const handleSave = async () => {
    if (!onSaveDataset) return;
    await onSaveDataset({
      name: datasetName || 'Untitled Dataset',
      description: datasetDesc,
      headers: headers.filter((h) => h.trim().length > 0),
      rows: rows.filter((r) => r.some((c) => c.trim().length > 0)),
    });
    setIsUploadModalOpen(false);
  };

  // Execute Matrix via Backend Background Job in App.tsx
  const handleExecuteMatrix = (ds: TestDataset, strat?: DatasetExecutionStrategy, selectedIndices?: number[]) => {
    if (onRunBatchMatrix) {
      const finalStrat = strat || getStrategyForDataset(ds);
      onRunBatchMatrix(ds, finalStrat, selectedIndices);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header with Switcher & Main Actions */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold font-display text-slate-900">Test Suites & Parameterized Datasets</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Upload Excel / CSV spreadsheets to execute multi-node workflows across test matrix scenarios
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenExcelModal}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-2xs transition-all cursor-pointer group"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
            <span>Excel Report Studio</span>
          </button>

          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>+ Upload Excel / CSV Matrix</span>
          </button>

          <div className="flex bg-slate-100 rounded-xl p-1 border border-slate-200">
            <button
              onClick={() => setActiveTab('datasets')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'datasets'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>Datasets ({datasets.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('suites')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'suites'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5 text-indigo-600" />
              <span>Test Suites ({testSuites.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* DATASETS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'datasets' && (
        <div className="space-y-6">
          {datasets.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 border border-slate-200 shadow-sm text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">No Datasets Uploaded</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  Upload a CSV or Excel spreadsheet to start running parameterized tests against your 3-node agent workflow.
                </p>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload First Dataset</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {datasets.map((ds) => {
                const strategy = getStrategyForDataset(ds);
                const grouped = groupDatasetIntoScenarios(ds.headers || [], ds.rows || [], strategy);
                const scenarioCount = grouped.length;
                const rowCount = ds.rows?.length || 0;
                const selectedRows = getSelectedRows(ds.id);
                const isAllSelected = selectedRows.length > 0 && selectedRows.length === rowCount;
                const isPartiallySelected = selectedRows.length > 0 && selectedRows.length < rowCount;

                return (
                  <div
                    key={ds.id}
                    className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4 hover:border-slate-300 transition-all"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold">
                          <Table className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-slate-900">{ds.name}</h4>
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {scenarioCount} Test {scenarioCount === 1 ? 'Scenario' : 'Scenarios'} {rowCount !== scenarioCount ? `(${rowCount} Rows)` : ''}
                            </span>
                            {selectedRows.length > 0 && (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                🎯 {selectedRows.length} of {rowCount} rows selected
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{ds.description || 'Test matrix dataset'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        {selectedRows.length > 0 ? (
                          <>
                            <button
                              onClick={() => handleExecuteMatrix(ds, strategy, selectedRows)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer ring-2 ring-indigo-300"
                              title={`Execute ${selectedRows.length} selected row(s)`}
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>
                                Run Flow on {selectedRows.length} Selected Row{selectedRows.length > 1 ? 's' : ''}
                              </span>
                            </button>

                            <button
                              onClick={() => handleExecuteMatrix(ds, strategy, undefined)}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs shadow-2xs transition-all cursor-pointer"
                              title="Run all rows regardless of selection"
                            >
                              <span>Run All ({rowCount})</span>
                            </button>

                            <button
                              onClick={() => clearSelectedRows(ds.id)}
                              className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                              title="Deselect all rows"
                            >
                              <span>Clear Selection</span>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleExecuteMatrix(ds, strategy)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-xs transition-all cursor-pointer"
                          >
                            {(strategy.parallel_limit || 1) > 1 ? (
                              <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current" />
                            )}
                            <span>
                              {(strategy.parallel_limit || 1) > 1
                                ? `Run Workflow in Parallel (${scenarioCount} Scenarios • ${strategy.parallel_limit}x)`
                                : `Run Workflow (${scenarioCount} Scenarios • Sequential)`}
                              {rowCount !== scenarioCount ? ` (${rowCount} Rows)` : ''}
                            </span>
                          </button>
                        )}

                        {onDeleteDataset && (
                          <button
                            onClick={() => {
                              if (window.confirm(`Permanently delete dataset "${ds.name}"?`)) {
                                onDeleteDataset(ds.id);
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs shadow-2xs transition-all cursor-pointer"
                            title="Permanently Delete Dataset"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Execution Strategy Bar & Visual Flow Trigger */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2">
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <div className="flex items-center gap-1.5 font-bold text-slate-700">
                          <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Strategy:</span>
                        </div>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {strategy.mode === 'FLAT_ROW_BY_ROW' ? 'Flat Row-by-Row (1 Row = 1 Run)' : 'Conversational Multi-Turn'}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          (strategy.parallel_limit || 1) > 1
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-slate-200 text-slate-700 border border-slate-300'
                        }`}>
                          {(strategy.parallel_limit || 1) > 1
                            ? `⚡ ${strategy.parallel_limit} Parallel Workers`
                            : '1 Worker (Sequential)'}
                        </span>
                        {strategy.mode === 'FLAT_ROW_BY_ROW' && strategy.forward_fill_blanks && (
                          <span className="text-[11px] text-slate-500 font-medium hidden md:inline">
                            • Blanks inherit values from above
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStrategyDataset(ds);
                          setIsStrategyModalOpen(true);
                        }}
                        className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100/60 px-3 py-1 rounded-lg border border-indigo-200 transition-colors cursor-pointer"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Execution Flow Diagram</span>
                      </button>
                    </div>

                  {/* Variables & Column Headers */}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      Injected Variables:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {ds.headers?.map((h, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-mono font-bold text-xs"
                        >
                          {"{{" + h + "}}"}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Data Rows Preview Table */}
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/50">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                          <th className="py-2.5 px-3 w-10 text-center">
                            <input
                              type="checkbox"
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                              checked={isAllSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = isPartiallySelected;
                              }}
                              onChange={() => toggleSelectAllRows(ds.id, rowCount)}
                              title="Select or deselect all rows"
                            />
                          </th>
                          <th className="py-2.5 px-3.5 w-16 text-slate-400 font-mono">Row #</th>
                          {ds.headers?.map((h, idx) => (
                            <th key={idx} className="py-2.5 px-3.5 font-mono text-blue-800 font-bold">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/70 bg-white">
                        {ds.rows?.map((row, rIdx) => {
                          const isSelected = selectedRows.includes(rIdx);
                          const cells = Array.isArray(row)
                            ? row
                            : typeof row === 'object'
                            ? ds.headers.map((h) => (row as any)[h] || '')
                            : [String(row)];

                          return (
                            <tr
                              key={rIdx}
                              className={`transition-colors cursor-pointer ${
                                isSelected ? 'bg-indigo-50/70 hover:bg-indigo-50' : 'hover:bg-slate-50'
                              }`}
                              onClick={(e) => {
                                if ((e.target as HTMLElement).tagName !== 'INPUT') {
                                  toggleSelectRow(ds.id, rIdx);
                                }
                              }}
                            >
                              <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                                  checked={isSelected}
                                  onChange={() => toggleSelectRow(ds.id, rIdx)}
                                />
                              </td>
                              <td className="py-2.5 px-3.5 text-slate-400 font-mono font-semibold">
                                #{rIdx + 1}
                              </td>
                              {cells.map((cell, cIdx) => (
                                <td key={cIdx} className="py-2.5 px-3.5 text-slate-800 font-mono">
                                  {String(cell)}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TEST SUITES TAB */}
      {/* ========================================================================= */}
      {activeTab === 'suites' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Available Suites</h3>
            <div className="space-y-2">
              {testSuites.map((suite) => {
                const isSelected = selectedSuite?.id === suite.id;
                return (
                  <div
                    key={suite.id}
                    onClick={() => setSelectedSuite(suite)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50 border-blue-500 shadow-xs'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <h4 className="text-xs font-bold text-slate-900">{suite.name}</h4>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{suite.description}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {suite.tags?.map((t, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-white text-slate-600 border border-slate-200">
                          #{t}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="md:col-span-2 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{selectedSuite?.name || 'Select a Suite'}</h3>
                <p className="text-xs text-slate-500">{selectedSuite?.description}</p>
              </div>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                {selectedSuite?.test_cases?.length || 0} Test Cases
              </span>
            </div>

            <div className="space-y-2.5">
              {(!selectedSuite?.test_cases || selectedSuite.test_cases.length === 0) ? (
                <p className="text-xs text-slate-400 py-6 text-center">No test cases in this suite.</p>
              ) : (
                selectedSuite.test_cases.map((tc) => (
                  <div
                    key={tc.id}
                    onClick={() => onSelectTestCase && onSelectTestCase(tc)}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-blue-400 transition-all flex items-center justify-between cursor-pointer"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{tc.title}</span>
                        <span className={`px-2 py-0.2 rounded text-[9px] font-bold ${
                          tc.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {tc.severity}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">{tc.description}</p>
                    </div>
                    <div className="text-right text-[11px] font-mono text-slate-400">
                      <span>{tc.evaluator_configs?.length || 0} Evaluators</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* UPLOAD / CREATE EXCEL DATASET MODAL */}
      {/* ========================================================================= */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div
            style={{ height: '700px', maxHeight: '90vh', width: '840px', maxWidth: '95vw' }}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-5 shrink-0 bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-display text-slate-900">
                    Upload & Configure Excel / CSV Test Dataset
                  </h3>
                  <p className="text-xs text-slate-500">
                    Inject spreadsheet values into <code>{"{{variable_name}}"}</code> across all 3 nodes
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="p-6 space-y-5 flex-1 overflow-y-auto min-h-0">
              <div className="flex items-center justify-between">
                <div className="flex rounded-xl p-1 bg-slate-100 border border-slate-200 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setUploadMode('table')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      uploadMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Table Editor
                  </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('file')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    uploadMode === 'file' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Upload File (.csv / .xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('paste')}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    uploadMode === 'paste' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Paste Excel Text
                </button>
              </div>
            </div>

            {uploadMode === 'file' && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-2xl p-8 text-center cursor-pointer bg-emerald-50/40 hover:bg-emerald-50/80 transition-all space-y-2"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".csv,.txt,.xlsx,.xls,.tsv"
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-2xs">
                  <Upload className="w-6 h-6" />
                </div>
                <h4 className="text-xs font-bold text-slate-900">Click or Drag & Drop Excel / CSV File</h4>
                <p className="text-[11px] text-slate-500">Supports .csv, .xlsx, .tsv (First row used as headers)</p>
              </div>
            )}

            {uploadMode === 'paste' && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  Paste rows directly from Excel or Google Sheets (Tab or Comma separated):
                </label>
                <textarea
                  rows={5}
                  value={rawPastedText}
                  onChange={(e) => setRawPastedText(e.target.value)}
                  placeholder="message,followup&#10;Hi,Show Important clauses&#10;Hello There,Show me clauses of Microsoft&#10;What is requirement for hc policy,Is something off?"
                  className="w-full font-mono text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:border-emerald-600"
                />
                <button
                  type="button"
                  onClick={() => {
                    handleParseCsvText(rawPastedText);
                    setUploadMode('table');
                  }}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white font-bold text-xs cursor-pointer"
                >
                  Parse into Table
                </button>
              </div>
            )}

            {uploadMode === 'table' && (
              <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Table className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-900">
                    Matrix Preview ({rows.length} Scenarios • {headers.length} Variables)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddColumn}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    + Add Column
                  </button>
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold cursor-pointer"
                  >
                    + Add Row
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-56 rounded-xl border border-slate-200 bg-white">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      <th className="p-2 w-12 text-slate-400 font-mono">#</th>
                      {headers.map((h, hIdx) => (
                        <th key={hIdx} className="p-2 font-mono text-blue-700">
                          <input
                            type="text"
                            value={h}
                            onChange={(e) => {
                              const updated = [...headers];
                              updated[hIdx] = e.target.value;
                              setHeaders(updated);
                            }}
                            className="bg-transparent font-bold font-mono focus:outline-none border-b border-transparent focus:border-blue-500 w-full"
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50">
                        <td className="p-2 font-mono text-slate-400 font-semibold">#{rIdx + 1}</td>
                        {headers.map((_, cIdx) => (
                          <td key={cIdx} className="p-2">
                            <input
                              type="text"
                              value={r[cIdx] || ''}
                              onChange={(e) => {
                                const updatedRows = [...rows];
                                updatedRows[rIdx][cIdx] = e.target.value;
                                setRows(updatedRows);
                              }}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:border-emerald-600 focus:bg-white"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            )}
            </div>

            {/* Upload Modal Fixed Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 p-5 shrink-0 bg-slate-50/70">
              <span className="text-[11px] text-slate-500 font-mono">
                Variables will be injected as <code>{"{{" + headers.join("}}, {{") + "}}"}</code>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Save & Connect Dataset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Excel Report Builder & Template Studio Modal */}
      <ExcelReportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        projectId={currentProject?.id}
        projectName={currentProject?.name}
        executions={projectExecutions}
      />

      {/* Dynamic Visual Execution Strategy Modal */}
      {isStrategyModalOpen && selectedStrategyDataset && (
        <ExecutionStrategyModal
          isOpen={isStrategyModalOpen}
          onClose={() => {
            setIsStrategyModalOpen(false);
            setSelectedStrategyDataset(null);
          }}
          dataset={selectedStrategyDataset}
          currentStrategy={getStrategyForDataset(selectedStrategyDataset)}
          onApplyStrategy={(newStrat) => {
            setDatasetStrategies((prev) => ({
              ...prev,
              [selectedStrategyDataset.id]: newStrat,
            }));
          }}
          onSaveAsProjectTemplate={onSaveProjectStrategy}
        />
      )}
    </div>
  );
};
