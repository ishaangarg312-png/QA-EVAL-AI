import React, { useState, useRef } from 'react';
import { Workflow, WorkflowNode, WorkflowEdge } from '../../../types';
import {
  FileCode,
  Download,
  Upload,
  Sparkles,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  X
} from 'lucide-react';

interface ImportExportModalProps {
  isOpen: boolean;
  currentWorkflow: Workflow | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  onImportWorkflow: (importedData: { workflow?: any; nodes: WorkflowNode[]; edges: WorkflowEdge[] }) => void;
  onClose: () => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  currentWorkflow,
  nodes,
  edges,
  onImportWorkflow,
  onClose,
}) => {
  const [importExportTab, setImportExportTab] = useState<'export' | 'import'>('export');
  const [pastedFlowJson, setPastedFlowJson] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const getWorkflowExportObject = () => ({
    schema_version: 'agflow/v1',
    exported_at: new Date().toISOString(),
    generator: 'Universal AI Agent QA Platform',
    workflow: {
      id: currentWorkflow?.id,
      name: currentWorkflow?.name || 'Custom Test Workflow',
      description: currentWorkflow?.description || '',
    },
    nodes,
    edges,
  });

  const handleExportWorkflow = () => {
    const data = getWorkflowExportObject();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = (currentWorkflow?.name || 'workflow')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    a.download = `${safeName || 'flow'}.agflow.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyWorkflowJson = () => {
    const data = getWorkflowExportObject();
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportSuccessMsg(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        validateAndApplyImport(parsed);
      } catch (err: any) {
        setImportError(`JSON Parse Error: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportPastedJson = () => {
    if (!pastedFlowJson.trim()) {
      setImportError('Please paste valid workflow JSON content first.');
      return;
    }
    setImportError(null);
    setImportSuccessMsg(null);
    try {
      const parsed = JSON.parse(pastedFlowJson.trim());
      validateAndApplyImport(parsed);
    } catch (err: any) {
      setImportError(`JSON Syntax Error: ${err.message}`);
    }
  };

  const validateAndApplyImport = (data: any) => {
    const incomingNodes = data.nodes || (data.workflow && data.workflow.nodes) || [];
    const incomingEdges = data.edges || (data.workflow && data.workflow.edges) || [];

    if (!Array.isArray(incomingNodes) || incomingNodes.length === 0) {
      setImportError('Invalid format: no valid "nodes" array found in JSON.');
      return;
    }

    const cleanNodes: WorkflowNode[] = incomingNodes.map((n, idx) => ({
      id: n.id || `node-${idx + 1}`,
      node_key: n.node_key || n.id || `node-${idx + 1}`,
      label: n.label || n.name || `Step ${idx + 1}`,
      node_type: n.node_type || 'API_REQUEST',
      position_x: typeof n.position_x === 'number' ? n.position_x : idx * 240 + 80,
      position_y: typeof n.position_y === 'number' ? n.position_y : 180,
      config: n.config || {},
      sequence_number: n.sequence_number ?? idx + 1,
      assertions: n.assertions || [],
    }));

    const cleanEdges: WorkflowEdge[] = Array.isArray(incomingEdges)
      ? incomingEdges.map((e, idx) => ({
          id: e.id || `edge-${idx + 1}`,
          source_node_key: e.source_node_key || e.source || '',
          target_node_key: e.target_node_key || e.target || '',
        }))
      : [];

    onImportWorkflow({ workflow: data.workflow, nodes: cleanNodes, edges: cleanEdges });
    setImportSuccessMsg(`✓ Successfully restored flow with ${cleanNodes.length} nodes & ${cleanEdges.length} connections!`);
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
      <input
        type="file"
        ref={importFileRef}
        onChange={handleImportFile}
        accept=".json,.agflow.json"
        className="hidden"
      />
      <div
        style={{ height: '680px', maxHeight: '88vh', width: '840px', maxWidth: '95vw' }}
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-5 shrink-0 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-xs">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold font-display text-slate-900">
                  Workflow Flow Exchange Hub
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  .agflow.json / JMeter Style
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Export, share, or import complete multi-node automation flows across teams
              </p>
            </div>
          </div>

          {/* Center Navigation Tabs */}
          <div className="flex rounded-xl p-1 bg-slate-200/70 border border-slate-200 text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setImportExportTab('export');
                setImportError(null);
              }}
              className={`px-4 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                importExportTab === 'export'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Download className="w-3.5 h-3.5 text-purple-600" />
              <span>Export & Share</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setImportExportTab('import');
                setImportError(null);
              }}
              className={`px-4 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                importExportTab === 'import'
                  ? 'bg-white text-slate-900 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5 text-emerald-600" />
              <span>Import Flow</span>
            </button>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 flex-1 overflow-y-auto min-h-0">
          {/* TAB 1: EXPORT */}
          {importExportTab === 'export' && (
            <div className="space-y-4">
              <div
                style={{ backgroundColor: '#faf5ff', borderColor: '#d8b4fe' }}
                className="p-4 rounded-2xl border flex items-center justify-between shadow-2xs"
              >
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-purple-700 shrink-0" />
                  <div>
                    <h4 style={{ color: '#3b0764' }} className="text-xs font-extrabold">
                      Ready for Export: {currentWorkflow?.name || 'Custom Test Workflow'}
                    </h4>
                    <p style={{ color: '#4c1d95' }} className="text-[11px] font-medium">
                      Includes {nodes.length} Nodes, {edges.length} Connections, headers, tokens, and multi-turn logic.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyWorkflowJson}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-purple-200 text-xs font-bold shadow-2xs transition-all cursor-pointer"
                  >
                    {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                    <span>{isCopied ? 'Copied JSON!' : 'Copy JSON'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportWorkflow}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-white" />
                    <span>Download .agflow.json</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Workflow Schema Preview
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">
                    Compatible with AI QA Platform & CLI
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 text-emerald-400 font-mono text-xs max-h-80 overflow-y-auto">
                  <pre>{JSON.stringify(getWorkflowExportObject(), null, 2)}</pre>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: IMPORT */}
          {importExportTab === 'import' && (
            <div className="space-y-4">
              <div
                onClick={() => importFileRef.current?.click()}
                className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 rounded-2xl p-6 text-center cursor-pointer bg-emerald-50/40 hover:bg-emerald-50/80 transition-all space-y-2"
              >
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-2xs">
                  <Upload className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-slate-900">
                  Click to Select or Drop <code>.agflow.json</code> / <code>.json</code> File
                </h4>
                <p className="text-[11px] text-slate-500">
                  Instantly restores all nodes, API headers, wires, and follow-up multi-turn configurations.
                </p>
              </div>

              {importError && (
                <div
                  style={{ backgroundColor: '#fff1f2', borderColor: '#fecdd3', color: '#9f1239' }}
                  className="p-3.5 rounded-xl border flex items-center gap-2 text-xs font-semibold"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {importSuccessMsg && (
                <div
                  style={{ backgroundColor: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}
                  className="p-3.5 rounded-xl border flex items-center gap-2 text-xs font-semibold"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{importSuccessMsg}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Or Paste Raw Flow JSON:
                </label>
                <textarea
                  rows={7}
                  value={pastedFlowJson}
                  onChange={(e) => setPastedFlowJson(e.target.value)}
                  placeholder='{"workflow": { "name": "My Flow", "nodes": [...], "edges": [...] }}'
                  className="w-full font-mono text-xs p-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:border-emerald-600 focus:bg-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 p-5 shrink-0 bg-slate-50/70">
          <span className="text-xs text-slate-500 font-mono">
            {importExportTab === 'export'
              ? '💡 You can share the .agflow.json file with team members to collaborate on test flows.'
              : '⚠️ Importing will update the canvas graph and save it to the current project.'}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Close
            </button>

            {importExportTab === 'import' && (
              <button
                type="button"
                onClick={handleImportPastedJson}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Restore & Load to Canvas</span>
              </button>
            )}

            {importExportTab === 'export' && (
              <button
                type="button"
                onClick={handleExportWorkflow}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download File</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
