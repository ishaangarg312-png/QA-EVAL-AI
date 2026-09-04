import React, { useState, useMemo, useEffect } from 'react';
import { WorkflowNode, WorkflowEdge, TestDataset, UploadedDocument } from '../../../types';
import { getCleanExt, getExtBadgeClass, cleanAndFormatJson, extractResponseKeys } from '../utils/workflowHelpers';
import { getNodeIcon, getNodeBadge } from './CanvasNode';
import { JsonStudioModal } from './JsonStudioModal';
import { DocumentPickerModal } from './DocumentPickerModal';
import { CurlImportModal } from './CurlImportModal';
import { parseCurlOrInspect, repairMangledFields, ParsedRequest } from '../utils/curlParser';
import {
  FileUp,
  FileText,
  Zap,
  Play,
  Copy,
  Check,
  Trash2,
  Plus,
  Sparkles,
  AlertCircle,
  Upload,
  X,
  Variable,
  Link,
  ExternalLink,
  Terminal,
  RefreshCw,
  GitBranch,
  Bot
} from 'lucide-react';

interface NodeConfigModalProps {
  isOpen: boolean;
  editingNode: WorkflowNode | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  projectDatasets: TestDataset[];
  projectDocuments: UploadedDocument[];
  liveVariablesContext: Record<string, any>;
  nodeOutputs: Record<string, any>;
  availableUpstreamVariables: Array<{
    variable_name: string;
    json_path: string;
    source_node_label: string;
    source_node_key: string;
    is_direct_parent: boolean;
  }>;
  isTesting: boolean;
  testResponse: any;
  onExecuteNodeTest: (node: WorkflowNode) => Promise<any>;
  onSaveNode: (updatedNode: WorkflowNode) => void;
  onDeleteNode: (nodeKey: string) => void;
  onClearLiveVariables?: () => void;
  onClose: () => void;
}

export const NodeConfigModal: React.FC<NodeConfigModalProps> = ({
  isOpen,
  editingNode: initialEditingNode,
  nodes,
  edges,
  projectDatasets,
  projectDocuments,
  liveVariablesContext,
  nodeOutputs,
  availableUpstreamVariables,
  isTesting,
  testResponse,
  onExecuteNodeTest,
  onSaveNode,
  onDeleteNode,
  onClearLiveVariables,
  onClose,
}) => {
  if (!isOpen || !initialEditingNode) return null;

  const [editingNode, setEditingNode] = useState<WorkflowNode>(initialEditingNode);
  const [modalSection, setModalSection] = useState<'input' | 'editor' | 'output'>('input');
  const [captureLeftViewMode, setCaptureLeftViewMode] = useState<'fields' | 'json'>('fields');
  const [captureUpstreamNodeFilter, setCaptureUpstreamNodeFilter] = useState<string>('all');
  const [responseDocTab, setResponseDocTab] = useState<number | 'all'>('all');

  // Sub-modal states
  const [isDocPickerOpen, setIsDocPickerOpen] = useState(false);
  const [isJsonStudioOpen, setIsJsonStudioOpen] = useState(false);
  const [isCurlModalOpen, setIsCurlModalOpen] = useState(false);

  const handleImportCurl = (parsed: ParsedRequest) => {
    const currentCfg = editingNode.config || {};
    const updatedCfg: Record<string, any> = { ...currentCfg };

    if (parsed.url) {
      updatedCfg.url = parsed.url;
    }
    if (parsed.method) {
      updatedCfg.method = parsed.method;
    }
    if (parsed.headers && Object.keys(parsed.headers).length > 0) {
      updatedCfg.headers = {
        ...(updatedCfg.headers || {}),
        ...parsed.headers
      };
    }
    if (parsed.body !== null && parsed.body !== undefined) {
      updatedCfg.body = parsed.body;
    }
    if (parsed.body_type) {
      updatedCfg.body_type = parsed.body_type;
      if (parsed.body_type === 'MULTIPART_FORM_DATA' && updatedCfg.headers) {
        delete updatedCfg.headers['Content-Type'];
        delete updatedCfg.headers['content-type'];
      }
    }

    setEditingNode({
      ...editingNode,
      config: updatedCfg
    });
  };

  // Auto-clean any mangled or Windows CMD caret bodies on mount/open
  useEffect(() => {
    if (editingNode?.config?.body) {
      const raw = editingNode.config.body;
      if (typeof raw === 'object' && !Array.isArray(raw)) {
        const keys = Object.keys(raw);
        if (
          keys.some(
            (k) =>
              k.includes('^') ||
              k.includes('  ') ||
              (k.includes(':') && raw[k] === '') ||
              (typeof raw[k] === 'string' &&
                (raw[k].includes('^') ||
                  raw[k].includes('""') ||
                  (raw[k].startsWith('{"') && raw[k].includes('\\"'))))
          )
        ) {
          const repaired = repairMangledFields(raw);
          setEditingNode((prev) => ({
            ...prev,
            config: {
              ...prev.config,
              body: repaired,
              body_type: 'MULTIPART_FORM_DATA'
            }
          }));
        }
      } else if (typeof raw === 'string' && raw.includes('^')) {
        const detected = parseCurlOrInspect(raw);
        if (detected && detected.body) {
          setEditingNode((prev) => ({
            ...prev,
            config: {
              ...prev.config,
              body: detected.body,
              body_type: detected.body_type || 'MULTIPART_FORM_DATA'
            }
          }));
        }
      }
    }
  }, [editingNode?.node_key]);

  // List of upstream nodes
  const upstreamNodesList = useMemo(() => {
    return nodes.filter((n) => n.node_key !== editingNode.node_key);
  }, [nodes, editingNode]);

  // Resolve inspectable payload from upstream nodes / live variables for Capture Result Node
  const upstreamInspectablePayload = useMemo(() => {
    if (captureUpstreamNodeFilter !== 'all') {
      const targetNode = nodes.find((n) => n.node_key === captureUpstreamNodeFilter);
      if (targetNode) {
        if (nodeOutputs[targetNode.node_key]) return nodeOutputs[targetNode.node_key];
        if (nodeOutputs[targetNode.label]) return nodeOutputs[targetNode.label];
        if (liveVariablesContext[targetNode.node_key]) return liveVariablesContext[targetNode.node_key];

        const lbl = (targetNode.label || '').toLowerCase();
        if (lbl.includes('follow') || targetNode.node_key.includes('follow')) {
          return {
            session_id: liveVariablesContext.session_id || "1a36047b-020d-484c-a2b8-f3af02a63088",
            message_id: "04d36b50-39ec-4475-a2a5-b34e440e3d62",
            agent_name: "SageOrchestratorAgent",
            content: "What is main thing about these documents",
            response: "The main theme running through these documents is governance and control around advanced AI and data use.",
            created_at: new Date().toISOString()
          };
        } else if (lbl.includes('upload') || (targetNode.node_type === 'API_REQUEST' && targetNode.config?.api_type === 'UPLOAD')) {
          return {
            attachment_ids: liveVariablesContext.attachment_ids || [
              "c694a921-6016-4503-84b7-db2ec4663f0d",
              "a7c58dda-eaaa-4ec1-b3ce-b6bf4fbb9d88"
            ],
            total_files: 2,
            successful_uploads: 2,
            job_id: liveVariablesContext.job_id || "job-9841"
          };
        } else if (lbl.includes('token') || lbl.includes('auth')) {
          return {
            access_token: liveVariablesContext.access_token || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sample_jwt",
            token_type: "Bearer",
            expires_in: 3600
          };
        } else {
          return {
            session_id: liveVariablesContext.session_id || "1a36047b-020d-484c-a2b8-f3af02a63088",
            message_id: "04d36b50-39ec-4475-a2a5-b34e440e3d62",
            agent_name: "SageOrchestratorAgent",
            content: "Explain about these documents",
            response: "I'm sorry, I encountered an error processing your request. Please try again.",
            attachment_ids: ["c694a921-6016-4503-84b7-db2ec4663f0d"],
            created_at: new Date().toISOString()
          };
        }
      }
    }

    const merged: Record<string, any> = { ...liveVariablesContext };
    Object.values(nodeOutputs).forEach((out) => {
      if (out && typeof out === 'object' && !Array.isArray(out)) {
        Object.assign(merged, out);
      }
    });

    if (testResponse && testResponse.response) {
      if (typeof testResponse.response === 'object' && !Array.isArray(testResponse.response)) {
        Object.assign(merged, testResponse.response);
      } else if (typeof testResponse.response === 'string') {
        merged.response = testResponse.response;
      }
    }

    return Object.keys(merged).length > 0 ? merged : {
      session_id: "1a36047b-020d-484c-a2b8-f3af02a63088",
      message_id: "04d36b50-39ec-4475-a2a5-b34e440e3d62",
      agent_name: "SageOrchestratorAgent",
      content: "Explain about these documents",
      response: "I'm sorry, I encountered an error processing your request. Please try again.",
      attachment_ids: ["c694a921-6016-4503-84b7-db2ec4663f0d"],
      created_at: new Date().toISOString()
    };
  }, [liveVariablesContext, testResponse, captureUpstreamNodeFilter, nodes, editingNode, nodeOutputs]);

  const inspectableFieldsList = useMemo(() => {
    return Object.entries(upstreamInspectablePayload).map(([key, val]) => {
      let typeStr: string = typeof val;
      if (Array.isArray(val)) typeStr = `array[${val.length}]`;
      else if (val === null) typeStr = 'null';
      else if (typeof val === 'string' && (val.includes('<html') || val.includes('<div') || val.includes('<a '))) typeStr = 'html';

      let preview = '';
      if (typeof val === 'object' && val !== null) {
        preview = JSON.stringify(val);
      } else {
        preview = String(val);
      }
      return { key, type: typeStr, value: val, preview };
    });
  }, [upstreamInspectablePayload]);

  // Live Interpolated URL Preview for CHAT_URL_CREATOR
  const previewChatUrl = useMemo(() => {
    if (editingNode.node_type !== 'CHAT_URL_CREATOR') return '';
    const base = editingNode.config.base_url || 'https://chat.example.com/session';
    const queryTmpl = editingNode.config.query_template || '?id={session_id}';

    const interpolate = (str: string) => {
      return str.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key) => {
        const k = key.trim();
        return liveVariablesContext[k] || (k === 'session_id' ? '1a36047b-020d-484c-a2b8-f3af02a63088' : (k === 'user_id' ? 'usr-4491' : `{${k}}`));
      }).replace(/\{([^{}]+?)\}/g, (_, key) => {
        const k = key.trim();
        return liveVariablesContext[k] || (k === 'session_id' ? '1a36047b-020d-484c-a2b8-f3af02a63088' : (k === 'user_id' ? 'usr-4491' : `{${k}}`));
      });
    };

    const resolvedBase = interpolate(base);
    const resolvedQuery = interpolate(queryTmpl);

    if (!resolvedBase) return resolvedQuery;
    if (!resolvedQuery) return resolvedBase;

    if (resolvedQuery.startsWith('/')) {
      return `${resolvedBase.replace(/\/+$/, '')}/${resolvedQuery.replace(/^\/+/, '')}`;
    } else if (resolvedQuery.startsWith('?') || resolvedQuery.startsWith('&')) {
      const cleanQ = resolvedQuery.replace(/^[?&]+/, '');
      const sep = resolvedBase.includes('?') ? '&' : '?';
      return `${resolvedBase.replace(/[?&]+$/, '')}${sep}${cleanQ}`;
    } else {
      const sep = resolvedBase.includes('?') ? '&' : '?';
      return `${resolvedBase.replace(/[?&]+$/, '')}${sep}${resolvedQuery}`;
    }
  }, [editingNode, liveVariablesContext]);

  // Compute discovered keys from live test response & node defaults
  const discoveredOutputKeys = useMemo(() => {
    const keys = new Set<string>();

    const collectKeys = (obj: any, prefix = '') => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        if (obj.length > 0 && typeof obj[0] === 'object') {
          collectKeys(obj[0], `${prefix}[0].`);
        }
        return;
      }
      Object.keys(obj).forEach((k) => {
        const fullPath = prefix ? `${prefix}${k}` : k;
        keys.add(fullPath);
        if (obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k]) && prefix.split('.').length < 2) {
          collectKeys(obj[k], `${fullPath}.`);
        }
      });
    };

    if (testResponse) {
      if (testResponse.response && typeof testResponse.response === 'object') {
        collectKeys(testResponse.response);
      }
      collectKeys(testResponse);
    }

    if (editingNode.node_type === 'CHAT_URL_CREATOR') {
      keys.add(editingNode.config.variable_name || 'chat_url');
      keys.add('url');
      keys.add('base_url');
      keys.add('query');
    }

    ['status', 'duration_ms', 'durationMs', 'executed_at', 'success', 'headers', 'timestamp'].forEach((k) =>
      keys.delete(k)
    );

    return Array.from(keys);
  }, [testResponse, editingNode]);

  return (
    <>
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-6">
        <div
          style={{ height: '700px', maxHeight: '90vh' }}
          className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col my-auto relative"
        >
          {/* Document Picker Modal Overlay */}
          <DocumentPickerModal
            isOpen={isDocPickerOpen}
            projectDocuments={projectDocuments}
            attachedFiles={editingNode.config.attached_files || []}
            onUpdateAttachedFiles={(files) =>
              setEditingNode({ ...editingNode, config: { ...editingNode.config, attached_files: files } })
            }
            onClose={() => setIsDocPickerOpen(false)}
          />

        {/* Modal Header */}
        <div className="px-6 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              {getNodeIcon(editingNode.node_type)}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">
                {editingNode.label}
              </h3>
              <p className="text-[10px] font-mono text-slate-400 font-semibold uppercase">
                {editingNode.node_type} • Key: {editingNode.node_key}
              </p>
            </div>
          </div>

          {/* Center: 3 Sections Navigation Tabs */}
          <div className="inline-flex rounded-xl p-1 bg-slate-200/70 text-xs font-semibold">
            <button
              onClick={() => setModalSection('input')}
              className={`px-3.5 py-1 rounded-lg transition-all flex items-center gap-1.5 ${modalSection === 'input' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <span>1. Inputs & Headers</span>
              {Object.keys(editingNode.config.headers || {}).length > 0 && (
                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">
                  {Object.keys(editingNode.config.headers || {}).length}
                </span>
              )}
            </button>

            <button
              onClick={() => setModalSection('editor')}
              className={`px-3.5 py-1 rounded-lg transition-all flex items-center gap-1.5 ${modalSection === 'editor' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <span>2. Payload & Editor</span>
            </button>

            <button
              onClick={() => setModalSection('output')}
              className={`px-3.5 py-1 rounded-lg transition-all flex items-center gap-1.5 ${modalSection === 'output' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
                }`}
            >
              <span>3. Output & Variables</span>
              {(editingNode.config.extractions || []).length > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold flex items-center justify-center">
                  {(editingNode.config.extractions || []).length}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {editingNode.node_type === 'API_REQUEST' && (
              <button
                type="button"
                onClick={() => setIsCurlModalOpen(true)}
                style={{ backgroundColor: '#2563eb', color: '#ffffff' }}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer mr-1"
                title="Import cURL command or Chrome DevTools inspect data"
              >
                <Terminal className="w-3.5 h-3.5 text-white" />
                <span>Import cURL</span>
              </button>
            )}

            <button
              onClick={onClose}
              title="Close dialog"
              className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          <datalist id="upstream-variables-datalist">
            {availableUpstreamVariables.map((v, i) => (
              <option key={i} value={`Bearer {{${v.variable_name}}}`}>
                Bearer {`{{${v.variable_name}}}`} (from {v.source_node_label} • {v.json_path})
              </option>
            ))}
            {availableUpstreamVariables.map((v, i) => (
              <option key={`raw-${i}`} value={`{{${v.variable_name}}}`}>
                {`{{${v.variable_name}}}`} (from {v.source_node_label} • {v.json_path})
              </option>
            ))}
          </datalist>

          {/* SECTION 1: INPUTS & HEADERS */}
          {modalSection === 'input' && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="flex items-end gap-3.5 w-full">
                <div className="flex-1 min-w-[220px]">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 block whitespace-nowrap">
                    Step Name
                  </label>
                  <input
                    type="text"
                    value={editingNode.label}
                    onChange={(e) => setEditingNode({ ...editingNode, label: e.target.value })}
                    placeholder="e.g. Upload Policy Document"
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 font-semibold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-2xs"
                  />
                </div>

                {editingNode.node_type === 'API_REQUEST' && (
                  <div className="w-64 shrink-0">
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 block whitespace-nowrap">
                      API Type
                    </label>
                    <select
                      value={editingNode.config.api_type || 'NORMAL'}
                      onChange={(e) =>
                        setEditingNode({
                          ...editingNode,
                          config: { ...editingNode.config, api_type: e.target.value }
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs"
                    >
                      <option value="NORMAL">🌐 Normal (Single Turn)</option>
                      <option value="FOLLOWUP">💬 Follow-up (Multi-turn)</option>
                      <option value="UPLOAD">📁 Upload API (Multipart / File)</option>
                    </select>
                  </div>
                )}

                <div className="w-24 shrink-0">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5 block whitespace-nowrap">
                    Timeout
                  </label>
                  <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-xl px-2.5 py-2 shadow-2xs focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                    <input
                      type="number"
                      min={5}
                      max={300}
                      value={editingNode.config.timeout_seconds ?? 60}
                      onChange={(e) =>
                        setEditingNode({
                          ...editingNode,
                          config: { ...editingNode.config, timeout_seconds: parseInt(e.target.value, 10) || 60 }
                        })
                      }
                      className="w-full bg-transparent text-xs text-slate-900 font-mono font-bold text-center focus:outline-none"
                    />
                    <span className="text-xs font-bold text-slate-400">s</span>
                  </div>
                </div>
              </div>

              {/* Recoverable Async Execution Toggle for API_REQUEST */}
              {editingNode.node_type === 'API_REQUEST' && (
                <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-indigo-600 shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-800">
                            Recoverable Async Execution (Idempotent Trigger)
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                            Crash-Safe
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Persists Job ID before polling. If a crash or restart occurs, resumes polling without re-triggering this API.
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={Boolean(editingNode.config.recoverable_async)}
                        onChange={(e) => setEditingNode({
                          ...editingNode,
                          config: {
                            ...editingNode.config,
                            recoverable_async: e.target.checked,
                            async_job_id_path: editingNode.config.async_job_id_path || 'job_id'
                          }
                        })}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>

                  {editingNode.config.recoverable_async && (
                    <div className="pt-2.5 border-t border-indigo-100 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in">
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                          Job ID Field in Response
                        </label>
                        <input
                          type="text"
                          value={editingNode.config.async_job_id_path || 'job_id'}
                          onChange={(e) => setEditingNode({
                            ...editingNode,
                            config: { ...editingNode.config, async_job_id_path: e.target.value }
                          })}
                          placeholder="e.g. job_id or data.task_id"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-indigo-700 focus:outline-none focus:border-indigo-600"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          Key in response returning the async task ID
                        </span>
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                          Custom Idempotency Key (Optional)
                        </label>
                        <input
                          type="text"
                          value={editingNode.config.idempotency_key || ''}
                          onChange={(e) => setEditingNode({
                            ...editingNode,
                            config: { ...editingNode.config, idempotency_key: e.target.value }
                          })}
                          placeholder="Defaults to deterministic scenario hash"
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-600"
                        />
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          Unique key to prevent duplicate calls (supports {'{{var}}'})
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CHAT URL CREATOR Configuration: Short, Crisp, High-Contrast */}
              {editingNode.node_type === 'CHAT_URL_CREATOR' && (
                <div className="space-y-3 pt-1 animate-in fade-in">
                  {/* Base URL Input */}
                  <div>
                    <label className="text-xs font-bold text-slate-900 flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1.5">
                        <Link className="w-3.5 h-3.5 text-violet-700" />
                        <span>Base URL</span>
                      </span>
                      <span className="text-[11px] text-slate-500 font-normal">e.g. https://chat.example.com/session</span>
                    </label>
                    <input
                      type="text"
                      list="upstream-variables-datalist"
                      value={editingNode.config.base_url || ''}
                      onChange={(e) => setEditingNode({
                        ...editingNode,
                        config: { ...editingNode.config, base_url: e.target.value }
                      })}
                      placeholder="https://chat.example.com/session"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-violet-600 focus:ring-1 focus:ring-violet-600 shadow-2xs"
                    />
                  </div>

                  {/* Dynamic Query Template Input */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-900 flex items-center justify-between">
                      <span>Dynamic Query Template</span>
                      <span className="text-[11px] text-slate-500 font-normal">Supports ?id={'{'}session_id{'}'} or ?id={'{{'}session_id{'}}'}</span>
                    </label>
                    <input
                      type="text"
                      list="upstream-variables-datalist"
                      value={editingNode.config.query_template || ''}
                      onChange={(e) => setEditingNode({
                        ...editingNode,
                        config: { ...editingNode.config, query_template: e.target.value }
                      })}
                      placeholder="?id={session_id}"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-violet-600 focus:ring-1 focus:ring-violet-600 shadow-2xs"
                    />

                    {/* Quick Dynamic Variable Inserter with Solid Dark Text */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="text-xs font-bold text-slate-800 mr-0.5">Insert:</span>
                      {['session_id', 'user_id', 'message_id', 'agent_name', 'job_id', 'access_token', ...availableUpstreamVariables.map(v => v.variable_name)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 6).map((vName) => (
                        <button
                          key={vName}
                          type="button"
                          onClick={() => {
                            const current = editingNode.config.query_template || '';
                            let nextQuery = current;
                            if (!current) {
                              nextQuery = `?id={${vName}}`;
                            } else if (current.includes('{')) {
                              nextQuery = `${current}&${vName}={${vName}}`;
                            } else {
                              nextQuery = `${current}{${vName}}`;
                            }
                            setEditingNode({
                              ...editingNode,
                              config: { ...editingNode.config, query_template: nextQuery }
                            });
                          }}
                          style={{ color: '#0f172a', backgroundColor: '#f1f5f9', borderColor: '#94a3b8' }}
                          className="px-2.5 py-1 rounded-lg border text-xs font-mono font-bold hover:bg-violet-100 hover:border-violet-400 hover:text-violet-950 shadow-2xs transition-all cursor-pointer"
                        >
                          + {'{' + vName + '}'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Target Output Variable Name */}
                  <div className="pt-0.5">
                    <label className="text-xs font-bold text-slate-900 block mb-1">
                      Save Merged URL to Context Variable
                    </label>
                    <input
                      type="text"
                      value={editingNode.config.variable_name || 'chat_url'}
                      onChange={(e) => setEditingNode({
                        ...editingNode,
                        config: { ...editingNode.config, variable_name: e.target.value }
                      })}
                      placeholder="chat_url"
                      className="w-full max-w-xs bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-violet-900 focus:bg-white focus:outline-none focus:border-violet-600 focus:ring-1 focus:ring-violet-600 shadow-2xs"
                    />
                  </div>

                  {/* Live URL Resolution Preview Box */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-white space-y-1.5 shadow-sm mt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        Live Merged URL Preview
                      </span>

                      <button
                        type="button"
                        onClick={() => {
                          if (previewChatUrl) {
                            navigator.clipboard.writeText(previewChatUrl);
                          }
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 transition-all cursor-pointer border border-slate-700"
                        title="Copy Resolved URL to Clipboard"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy URL</span>
                      </button>
                    </div>

                    <div className="p-2 rounded-lg bg-black/50 border border-white/10 font-mono text-xs text-emerald-300 break-all select-all leading-relaxed">
                      {previewChatUrl || 'https://chat.example.com/session?id=1a36047b-020d-484c-a2b8-f3af02a63088'}
                    </div>
                  </div>
                </div>
              )}

              {/* CONDITION Node Configuration */}
              {editingNode.node_type === 'CONDITION' && (
                <div className="space-y-4 pt-1 animate-in fade-in">
                  <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                        <GitBranch className="w-4 h-4 text-amber-600" />
                        <span>Conditional Execution Rule</span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                        IF / GATE
                      </span>
                    </div>
                    <p className="text-xs text-amber-800">
                      Evaluates dynamic dataset variables or upstream step outputs. If the condition is met (TRUE), connected downstream nodes execute normally. If not met (FALSE), downstream nodes are marked as <span className="font-bold underline">SKIPPED</span>.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-800 block mb-1">
                        Variable to Check
                      </label>
                      <input
                        type="text"
                        list="upstream-variables-datalist"
                        value={editingNode.config?.condition_variable || ''}
                        onChange={(e) => setEditingNode({
                          ...editingNode,
                          config: { ...editingNode.config, condition_variable: e.target.value }
                        })}
                        placeholder="e.g. file_id or {{file_id}}"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-800 block mb-1">
                        Condition Operator
                      </label>
                      <select
                        value={editingNode.config?.operator || 'is_not_empty'}
                        onChange={(e) => setEditingNode({
                          ...editingNode,
                          config: { ...editingNode.config, operator: e.target.value }
                        })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs cursor-pointer"
                      >
                        <option value="is_not_empty">Is Not Empty (Has Value)</option>
                        <option value="is_empty">Is Empty / Blank</option>
                        <option value="equals">Equals Exact Value</option>
                        <option value="not_equals">Does Not Equal</option>
                        <option value="contains">Contains Substring</option>
                      </select>
                    </div>
                  </div>

                  {['equals', 'not_equals', 'contains'].includes(editingNode.config?.operator) && (
                    <div>
                      <label className="text-xs font-bold text-slate-800 block mb-1">
                        Expected Value
                      </label>
                      <input
                        type="text"
                        value={editingNode.config?.condition_value || ''}
                        onChange={(e) => setEditingNode({
                          ...editingNode,
                          config: { ...editingNode.config, condition_value: e.target.value }
                        })}
                        placeholder="Expected string..."
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-600 shadow-2xs"
                      />
                    </div>
                  )}

                  {/* Quick Variable Injector Suggestions */}
                  {availableUpstreamVariables && availableUpstreamVariables.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Quick Suggestions:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {availableUpstreamVariables.slice(0, 6).map((v, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setEditingNode({
                              ...editingNode,
                              config: { ...editingNode.config, condition_variable: v.variable_name }
                            })}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-100 hover:bg-amber-100 hover:border-amber-300 text-slate-700 hover:text-amber-900 text-xs font-mono font-bold transition-all cursor-pointer shadow-2xs"
                          >
                            {v.variable_name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary / Preview Rule */}
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-white text-xs space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Rule Logic Preview</span>
                    <div className="font-mono text-xs text-emerald-300">
                      IF <span className="text-amber-300 font-bold">`{editingNode.config?.condition_variable || 'file_id'}`</span> {editingNode.config?.operator || 'is_not_empty'} {editingNode.config?.condition_value ? `"${editingNode.config.condition_value}"` : ''}
                    </div>
                    <p className="text-[11px] text-slate-400">
                      ➜ True: Execute connected downstream nodes.<br />
                      ➜ False: Skip downstream nodes (e.g. Document Upload) and continue rest of pipeline.
                    </p>
                  </div>
                </div>
              )}

              {/* CAPTURE RESULT Configuration in Tab 1 */}
              {editingNode.node_type === 'CAPTURE_RESULT' && (
                <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200 shadow-2xs space-y-4">
                  <div className="flex items-center justify-between border-b border-indigo-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-indigo-100 border border-indigo-300 flex items-center justify-center text-indigo-700">
                        <Variable className="w-4 h-4 text-indigo-700" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 font-display">
                          Capture Result Source Scope
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Select which upstream steps to capture outputs and variables from
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                      Result Preserver
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                        Source Scope Mode
                      </label>
                      <select
                        value={editingNode.config.source_mode || 'ALL_PREVIOUS'}
                        onChange={(e) => setEditingNode({
                          ...editingNode,
                          config: { ...editingNode.config, source_mode: e.target.value }
                        })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 shadow-2xs cursor-pointer"
                      >
                        <option value="ALL_PREVIOUS">🌐 All Previous Steps (Merged Context)</option>
                        <option value="SPECIFIC_NODE">🎯 Specific Upstream Step</option>
                      </select>
                    </div>

                    {editingNode.config.source_mode === 'SPECIFIC_NODE' && (
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                          Target Upstream Step
                        </label>
                        <select
                          value={editingNode.config.source_node_key || ''}
                          onChange={(e) => setEditingNode({
                            ...editingNode,
                            config: { ...editingNode.config, source_node_key: e.target.value }
                          })}
                          className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 shadow-2xs cursor-pointer"
                        >
                          <option value="">-- Choose Upstream Step --</option>
                          {nodes.filter(n => n.node_key !== editingNode.node_key).map((n) => (
                            <option key={n.node_key} value={n.node_key}>
                              {n.label} ({n.node_type})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-indigo-100 text-xs text-slate-600 flex items-center justify-between">
                    <span>
                      Currently configured: <strong>{(editingNode.config.rules || []).length} capture rules</strong>.
                    </span>
                    <button
                      type="button"
                      onClick={() => setModalSection('editor')}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer"
                    >
                      Configure Captured Variables (Tab 2) →
                    </button>
                  </div>
                </div>
              )}

              {/* Upload Document Configuration */}
              {editingNode.node_type === 'API_REQUEST' && editingNode.config.api_type === 'UPLOAD' && (
                <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0">
                        <FileUp className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-display">
                            Document Upload Configuration
                          </h4>
                          <span className="text-[11px] text-slate-500 font-semibold">
                            (PDF, DOCX, CSV, XLSX, PPTX • Max 5)
                          </span>
                        </div>
                      </div>
                    </div>

                    <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200">
                      {(editingNode.config.attached_files || []).length}/5 Attached
                    </span>
                  </div>

                  <div className="grid grid-cols-12 gap-3 items-end">
                    <div className="col-span-3">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1.5">
                        Form Field Key
                      </label>
                      <input
                        type="text"
                        value={editingNode.config.file_field_name || 'file'}
                        onChange={(e) => setEditingNode({
                          ...editingNode,
                          config: { ...editingNode.config, file_field_name: e.target.value }
                        })}
                        placeholder="e.g. file"
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-blue-500 shadow-2xs"
                      />
                    </div>

                    <div className="col-span-4">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1.5">
                        Execution Run Mode
                      </label>
                      <select
                        value={editingNode.config.execution_mode || 'SINGLE_RUN'}
                        onChange={(e) => setEditingNode({
                          ...editingNode,
                          config: { ...editingNode.config, execution_mode: e.target.value }
                        })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 shadow-2xs cursor-pointer"
                      >
                        <option value="SINGLE_RUN">Single Run (1 Request - 1 Doc)</option>
                        <option value="MULTIPLE_RUN">Multiple Run ({(editingNode.config.attached_files || []).length || 'N'} Requests == Batch)</option>
                      </select>
                    </div>

                    <div className="col-span-5 flex items-center gap-2">
                      <label className="flex-1 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-all">
                        <Upload className="w-4 h-4" />
                        <span>Browse Files</span>
                        <input
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx,.csv,.xls,.xlsx,.ppt,.pptx"
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const files = e.target.files;
                            if (!files || files.length === 0) return;
                            const existing = editingNode.config.attached_files || [];
                            const fileArray = Array.from(files).slice(0, 5 - existing.length);

                            const readPromises = fileArray.map((file) => {
                              return new Promise<{
                                name: string;
                                size: number;
                                type: string;
                                blob_url: string;
                                data_base64?: string;
                              }>((resolve) => {
                                const reader = new FileReader();
                                reader.onload = () => {
                                  resolve({
                                    name: file.name,
                                    size: file.size,
                                    type: getCleanExt(file.name, file.type),
                                    blob_url: URL.createObjectURL(file),
                                    data_base64: reader.result as string,
                                  });
                                };
                                reader.onerror = () => {
                                  resolve({
                                    name: file.name,
                                    size: file.size,
                                    type: getCleanExt(file.name, file.type),
                                    blob_url: URL.createObjectURL(file),
                                  });
                                };
                                reader.readAsDataURL(file);
                              });
                            });

                            const resolvedFiles = await Promise.all(readPromises);
                            const combined = [...existing, ...resolvedFiles].slice(0, 5);
                            setEditingNode({
                              ...editingNode,
                              config: { ...editingNode.config, attached_files: combined },
                            });
                          }}
                        />
                      </label>

                      {projectDocuments.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setIsDocPickerOpen(true)}
                          className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold shadow-xs transition-all cursor-pointer whitespace-nowrap"
                        >
                          + From Project ({projectDocuments.length})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Dynamic File ID / Excel Column Mapping */}
                  <div className="pt-3 border-t border-slate-100 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block">
                        Dynamic File ID / Excel Column Mapping (Optional)
                      </label>
                      <span className="text-[10px] text-slate-400 font-medium">
                        Reads attachment ID per row during test matrix execution
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <input
                        type="text"
                        value={editingNode.config.document_variable || editingNode.config.attachment_column || ''}
                        onChange={(e) => setEditingNode({
                          ...editingNode,
                          config: {
                            ...editingNode.config,
                            document_variable: e.target.value,
                            attachment_column: e.target.value
                          }
                        })}
                        placeholder="e.g. {{file_id}} or {{attachment_id}}"
                        className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-900 font-bold focus:bg-white focus:outline-none focus:border-blue-500 shadow-2xs"
                      />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {availableUpstreamVariables.filter(v => 
                          v.variable_name.toLowerCase().includes('file') || 
                          v.variable_name.toLowerCase().includes('att') || 
                          v.variable_name.toLowerCase().includes('doc')
                        ).map((v) => (
                          <button
                            key={v.variable_name}
                            type="button"
                            onClick={() => setEditingNode({
                              ...editingNode,
                              config: {
                                ...editingNode.config,
                                document_variable: `{{${v.variable_name}}}`,
                                attachment_column: `{{${v.variable_name}}}`
                              }
                            })}
                            className="px-2.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap"
                          >
                            + {"{{" + v.variable_name + "}}"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Attached Documents List */}
                  {(editingNode.config.attached_files || []).length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                        <span>Selected Documents ({(editingNode.config.attached_files || []).length}/5):</span>
                        <button
                          type="button"
                          onClick={() => setEditingNode({
                            ...editingNode,
                            config: { ...editingNode.config, attached_files: [] }
                          })}
                          className="text-rose-600 hover:text-rose-700 cursor-pointer font-bold"
                        >
                          Remove All
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {(editingNode.config.attached_files || []).map((fileItem: any, fIdx: number) => {
                          const ext = getCleanExt(fileItem.name, fileItem.type);
                          return (
                            <div
                              key={fIdx}
                              className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-xs shadow-2xs font-medium text-slate-900"
                            >
                              <span className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] border ${getExtBadgeClass(ext)}`}>
                                {ext}
                              </span>
                              <span className="truncate max-w-[180px] font-bold text-slate-900 text-xs" title={fileItem.name}>
                                {fileItem.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = (editingNode.config.attached_files || []).filter((_: any, i: number) => i !== fIdx);
                                  setEditingNode({
                                    ...editingNode,
                                    config: { ...editingNode.config, attached_files: updated }
                                  });
                                }}
                                className="text-slate-400 hover:text-rose-600 ml-1 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Endpoint URL Bar */}
              {(editingNode.node_type === 'API_REQUEST' || editingNode.node_type === 'POLLING') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                      Target Endpoint URL
                    </label>
                    {editingNode.node_type === 'API_REQUEST' && (
                      <button
                        type="button"
                        onClick={() => setIsCurlModalOpen(true)}
                        style={{ color: '#2563eb' }}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Terminal className="w-3 h-3" />
                        <span>Paste cURL / Inspect</span>
                      </button>
                    )}
                  </div>

                  {/* Upstream Variable Quick Chips for URL & Headers */}
                  {availableUpstreamVariables.length > 0 && (
                    <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
                          <Zap className="w-3 h-3 text-blue-600" />
                          <span>Insert Variable (Click to append to URL):</span>
                        </span>
                        <div className="flex items-center gap-2">
                          {onClearLiveVariables && (
                            <button
                              type="button"
                              onClick={onClearLiveVariables}
                              className="text-[10px] text-rose-600 hover:text-rose-800 font-bold hover:underline cursor-pointer flex items-center gap-1 bg-white px-2 py-0.5 rounded-md border border-rose-200 hover:bg-rose-50 transition-colors"
                              title="Purge saved live context variables for this project"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Clear Live Cache</span>
                            </button>
                          )}
                          <span className="text-[10px] text-blue-700 font-medium">1-Click Insert</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {availableUpstreamVariables.map((v, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              const curUrl = editingNode.config.url || '';
                              const placeholder = `{{${v.variable_name}}}`;
                              let newUrl = curUrl;
                              if (!curUrl) {
                                newUrl = placeholder;
                              } else if (curUrl.endsWith('/')) {
                                newUrl = `${curUrl}${placeholder}`;
                              } else if (curUrl.includes(placeholder)) {
                                return;
                              } else {
                                newUrl = `${curUrl}/${placeholder}`;
                              }
                              setEditingNode({
                                ...editingNode,
                                config: { ...editingNode.config, url: newUrl }
                              });
                            }}
                            className="px-2 py-0.5 rounded-lg bg-white hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-mono font-bold shadow-2xs transition-all cursor-pointer flex items-center gap-1 hover:border-blue-400"
                            title={`Insert {{${v.variable_name}}} into Target URL`}
                          >
                            <span className="text-blue-500 font-bold">+</span>
                            <span>{"{{" + v.variable_name + "}}"}</span>
                            {v.source_node_label && (
                              <span className="text-[9px] text-slate-400 font-sans font-normal ml-0.5">
                                ({v.source_node_label})
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100">
                    <select
                      value={editingNode.config.method || 'GET'}
                      onChange={(e) => setEditingNode({
                        ...editingNode,
                        config: { ...editingNode.config, method: e.target.value }
                      })}
                      className="bg-slate-100 border-r border-slate-200 px-3 py-2 text-xs font-bold text-blue-700 focus:outline-none cursor-pointer"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      {editingNode.node_type === 'API_REQUEST' && (
                        <>
                          <option value="PUT">PUT</option>
                          <option value="DELETE">DELETE</option>
                          <option value="PATCH">PATCH</option>
                        </>
                      )}
                    </select>
                    <input
                      type="text"
                      list="upstream-variables-datalist"
                      value={editingNode.config.url || ''}
                      onChange={(e) => setEditingNode({
                        ...editingNode,
                        config: { ...editingNode.config, url: e.target.value }
                      })}
                      placeholder={editingNode.node_type === 'POLLING' ? 'https://fe.staging.g42.delphiprojects.app/api/proxy/api/v1/bod/jobs/{{job_id}}' : 'https://api.service.internal/v1/...'}
                      className="flex-1 px-3 py-2 text-xs font-mono text-slate-900 border-none focus:outline-none bg-transparent"
                    />
                  </div>
                </div>
              )}

              {/* Polling Termination Condition & Interval Settings */}
              {editingNode.node_type === 'POLLING' && (
                <div className="p-4 rounded-2xl bg-cyan-50/60 border border-cyan-200 shadow-2xs space-y-3.5">
                  <div className="flex items-center justify-between border-b border-cyan-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-cyan-100 border border-cyan-300 flex items-center justify-center text-cyan-700">
                        <RefreshCw className="w-4 h-4 text-cyan-700" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-900 font-display">
                          Polling Termination Condition (When to finish)
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Repeatedly calls target URL until the status key matches the target status
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-100 text-cyan-800 border border-cyan-200">
                      Async Polling Loop
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Target Status (When to finish) */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                        Target Status (Finish When Status Equals)
                      </label>
                      <input
                        type="text"
                        value={editingNode.config.target_status ?? 'COMPLETED'}
                        onChange={(e) => setEditingNode({
                          ...editingNode,
                          config: { ...editingNode.config, target_status: e.target.value }
                        })}
                        placeholder="e.g. COMPLETED or SUCCESS"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-emerald-700 focus:outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                      />
                      {/* Quick Status Presets */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span className="text-[10px] text-slate-400 font-semibold">Presets:</span>
                        {['COMPLETED', 'SUCCESS', 'DONE', 'READY', 'FINISHED'].map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => setEditingNode({
                              ...editingNode,
                              config: { ...editingNode.config, target_status: st }
                            })}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border transition-colors cursor-pointer ${
                              (editingNode.config.target_status || 'COMPLETED').toUpperCase() === st
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {st}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Status Key / JSON Path */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                        Status Key / JSON Path
                      </label>
                      <input
                        type="text"
                        value={editingNode.config.status_key ?? 'status'}
                        onChange={(e) => setEditingNode({
                          ...editingNode,
                          config: { ...editingNode.config, status_key: e.target.value }
                        })}
                        placeholder="e.g. status or data.status"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                      />
                      <span className="text-[10px] text-slate-500 block">
                        Checks <code>response.{editingNode.config.status_key || 'status'}</code> == <code>"{editingNode.config.target_status || 'COMPLETED'}"</code>
                      </span>
                    </div>

                    {/* Poll Interval */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                        Poll Interval (Seconds)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={editingNode.config.interval_seconds ?? 5}
                          onChange={(e) => {
                            const newInterval = Math.max(1, Number(e.target.value) || 1);
                            const tSec = editingNode.config.timeout_seconds || 300;
                            const newAttempts = Math.max(5, Math.ceil(tSec / newInterval));
                            setEditingNode({
                              ...editingNode,
                              config: {
                                ...editingNode.config,
                                interval_seconds: newInterval,
                                max_attempts: newAttempts
                              }
                            });
                          }}
                          className="w-24 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-cyan-600"
                        />
                        <span className="text-xs text-slate-500 font-medium">seconds between checks</span>
                      </div>
                    </div>

                    {/* Max Attempts */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                        Max Polling Attempts
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={
                            editingNode.config.max_attempts ??
                            Math.max(10, Math.ceil((editingNode.config.timeout_seconds || 300) / (editingNode.config.interval_seconds || 5)))
                          }
                          onChange={(e) => {
                            const val = Number(e.target.value) || 10;
                            setEditingNode({
                              ...editingNode,
                              config: { ...editingNode.config, max_attempts: val }
                            });
                          }}
                          className="w-24 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-cyan-600"
                        />
                        <span className="text-[11px] text-slate-500 font-medium">
                          (~{Math.round(
                            (editingNode.config.max_attempts ??
                              Math.max(10, Math.ceil((editingNode.config.timeout_seconds || 300) / (editingNode.config.interval_seconds || 5)))) *
                            (editingNode.config.interval_seconds ?? 5)
                          )}s total timeout)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Recoverable Async Execution & Crash Recovery Banner */}
                  <div className="pt-2.5 border-t border-cyan-100 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="text-xs font-bold text-slate-800">
                        Recoverable Async Execution (Idempotent Polling)
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Crash-Safe Resumable
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Auto-links to upstream Job ID; resumes polling on restart without duplicate API triggers
                    </span>
                  </div>
                </div>
              )}

              {/* Headers Table */}
              {(editingNode.node_type === 'API_REQUEST' || editingNode.node_type === 'POLLING') && (
                <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">
                      Headers ({Object.keys(editingNode.config.headers || {}).length})
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const firstVar = availableUpstreamVariables.find(v => v.variable_name.includes('token') || v.variable_name.includes('auth'))?.variable_name || availableUpstreamVariables[0]?.variable_name || 'access_token';
                        const newHeaders = {
                          ...editingNode.config.headers,
                          'Authorization': `Bearer {{${firstVar}}}`
                        };
                        if (editingNode.config.api_type !== 'UPLOAD' && editingNode.config.body_type !== 'MULTIPART_FORM_DATA') {
                          newHeaders['Content-Type'] = 'application/json';
                        } else {
                          delete newHeaders['Content-Type'];
                          delete newHeaders['content-type'];
                        }
                        setEditingNode({ ...editingNode, config: { ...editingNode.config, headers: newHeaders } });
                      }}
                      className="px-2.5 py-0.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold shadow-2xs cursor-pointer"
                    >
                      + Add Auth Header
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    {Object.entries(editingNode.config.headers || {}).map(([hKey, hVal], idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={hKey}
                          onChange={(e) => {
                            const updated = { ...editingNode.config.headers };
                            delete updated[hKey];
                            updated[e.target.value] = hVal;
                            setEditingNode({ ...editingNode, config: { ...editingNode.config, headers: updated } });
                          }}
                          placeholder="Header Name"
                          className="w-1/3 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-900"
                        />
                        <input
                          type="text"
                          list="upstream-variables-datalist"
                          value={String(hVal)}
                          onChange={(e) => {
                            const updated = { ...editingNode.config.headers, [hKey]: e.target.value };
                            setEditingNode({ ...editingNode, config: { ...editingNode.config, headers: updated } });
                          }}
                          placeholder="Header Value"
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = { ...editingNode.config.headers };
                            delete updated[hKey];
                            setEditingNode({ ...editingNode, config: { ...editingNode.config, headers: updated } });
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        const updated = { ...editingNode.config.headers, '': '' };
                        setEditingNode({ ...editingNode, config: { ...editingNode.config, headers: updated } });
                      }}
                      className="text-xs text-blue-600 font-bold hover:text-blue-800 flex items-center gap-1 cursor-pointer pt-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Header</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: PAYLOAD & EDITOR */}
          {modalSection === 'editor' && (
            <div className="space-y-4 max-w-3xl mx-auto">
              {isJsonStudioOpen ? (
                <JsonStudioModal
                  editingNode={editingNode}
                  availableUpstreamVariables={availableUpstreamVariables}
                  onUpdateNodeConfig={(cfg) => setEditingNode({ ...editingNode, config: cfg })}
                  onClose={() => setIsJsonStudioOpen(false)}
                />
              ) : (
                <>
                  {editingNode.node_type !== 'CAPTURE_RESULT' && availableUpstreamVariables.length > 0 && (
                    <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-[11px] font-bold text-blue-950 uppercase tracking-wider">
                          Insert Extracted Variable:
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {availableUpstreamVariables.map((v, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              const currentBody = typeof editingNode.config.body === 'object'
                                ? JSON.stringify(editingNode.config.body, null, 2)
                                : String(editingNode.config.body || '');
                              const insertSnippet = `\n  "${v.variable_name}": "{{${v.variable_name}}}"`;
                              const newBody = currentBody
                                ? currentBody.replace(/\}\s*$/, `,${insertSnippet}\n}`)
                                : `{\n  "${v.variable_name}": "{{${v.variable_name}}}"\n}`;
                              setEditingNode({ ...editingNode, config: { ...editingNode.config, body: newBody } });
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-100 border border-blue-200 text-blue-700 font-mono text-[11px] font-bold shadow-xs transition-all cursor-pointer"
                          >
                            + {"{{" + v.variable_name + "}}"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {editingNode.node_type === 'API_REQUEST' && (
                    <div className="space-y-3">
                      {/* Payload Format Selector */}
                      <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            Payload Format:
                          </label>
                          <select
                            value={editingNode.config.body_type || (editingNode.config.api_type === 'UPLOAD' ? 'MULTIPART_FORM_DATA' : 'JSON')}
                            onChange={(e) => {
                              const newBodyType = e.target.value;
                              const currentCfg = editingNode.config || {};
                              const updatedHeaders: Record<string, any> = { ...(currentCfg.headers || {}) };
                              if (newBodyType === 'MULTIPART_FORM_DATA') {
                                delete updatedHeaders['Content-Type'];
                                delete updatedHeaders['content-type'];
                              } else if (newBodyType === 'FORM_URLENCODED') {
                                updatedHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
                              } else {
                                updatedHeaders['Content-Type'] = 'application/json';
                              }
                              setEditingNode({
                                ...editingNode,
                                config: {
                                  ...currentCfg,
                                  body_type: newBodyType,
                                  headers: updatedHeaders
                                }
                              });
                            }}
                            className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 shadow-2xs cursor-pointer focus:outline-none focus:border-blue-500"
                          >
                            <option value="JSON">📄 JSON (application/json)</option>
                            <option value="MULTIPART_FORM_DATA">📦 Form Data (multipart/form-data)</option>
                            <option value="FORM_URLENCODED">🔗 URL-Encoded (application/x-www-form-urlencoded)</option>
                          </select>
                        </div>

                        {(editingNode.config.body_type === 'MULTIPART_FORM_DATA' || editingNode.config.api_type === 'UPLOAD') && (
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                            ✓ Sends Form Data (stringifies nested JSON like dependencies)
                          </span>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                            {editingNode.config.api_type === 'UPLOAD' || editingNode.config.body_type === 'MULTIPART_FORM_DATA'
                              ? 'Form Data Fields / Parameters (JSON format)'
                              : 'Request Payload / JSON Body'}
                          </label>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setIsCurlModalOpen(true)}
                              style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}
                              className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <Terminal className="w-3.5 h-3.5 text-blue-600" />
                              <span>Import cURL / Inspect</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setIsJsonStudioOpen(true)}
                              className="px-2.5 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Sparkles className="w-3 h-3 text-blue-600" />
                              <span>✨ Smart JSON Studio</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const current = editingNode.config?.body;
                                if (typeof current === 'object' && current !== null) {
                                  setEditingNode({
                                    ...editingNode,
                                    config: {
                                      ...editingNode.config,
                                      body: repairMangledFields(current),
                                      body_type: 'MULTIPART_FORM_DATA'
                                    }
                                  });
                                } else if (typeof current === 'string') {
                                  const detected = parseCurlOrInspect(current);
                                  if (detected && detected.body) {
                                    setEditingNode({
                                      ...editingNode,
                                      config: {
                                        ...editingNode.config,
                                        body: detected.body,
                                        body_type: detected.body_type || 'MULTIPART_FORM_DATA'
                                      }
                                    });
                                  }
                                }
                              }}
                              className="px-2.5 py-0.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1 cursor-pointer"
                              title="Clean duplicate quotes and parse dependencies"
                            >
                              <Zap className="w-3 h-3 text-emerald-600" />
                              <span>⚡ Clean Payload</span>
                            </button>
                          </div>
                        </div>
                        <textarea
                          rows={editingNode.config.api_type === 'UPLOAD' ? 8 : 11}
                          value={
                            typeof editingNode.config.body === 'object'
                              ? JSON.stringify(editingNode.config.body, null, 2)
                              : editingNode.config.body || ''
                          }
                          onPaste={(e) => {
                            const pasted = e.clipboardData.getData('text');
                            if (!pasted || !pasted.trim()) return;
                            const trimmed = pasted.trim();
                            // If pasted content is cURL or DevTools Form Data (not standard JSON)
                            const isJson = trimmed.startsWith('{') || trimmed.startsWith('[');
                            if (!isJson) {
                              const detected = parseCurlOrInspect(trimmed);
                              if (detected && detected.body && detected.source !== 'json') {
                                e.preventDefault();
                                const currentCfg = editingNode.config || {};
                                const updatedCfg: Record<string, any> = {
                                  ...currentCfg,
                                  body: detected.body,
                                  body_type: detected.body_type || 'MULTIPART_FORM_DATA'
                                };
                                if (detected.url && !currentCfg.url) {
                                  updatedCfg.url = detected.url;
                                }
                                if (detected.headers && Object.keys(detected.headers).length > 0) {
                                  updatedCfg.headers = { ...(currentCfg.headers || {}), ...detected.headers };
                                }
                                setEditingNode({ ...editingNode, config: updatedCfg });
                                return;
                              }
                            }
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            const trimmed = val.trim();

                            // Only auto-detect if user literally pasted a full cURL command starting with "curl"
                            if (trimmed.toLowerCase().startsWith('curl')) {
                              const detected = parseCurlOrInspect(val);
                              if (detected && detected.body) {
                                const currentCfg = editingNode.config || {};
                                const updatedCfg: Record<string, any> = {
                                  ...currentCfg,
                                  body: detected.body,
                                  body_type: detected.body_type || 'MULTIPART_FORM_DATA'
                                };
                                if (detected.url && !currentCfg.url) {
                                  updatedCfg.url = detected.url;
                                }
                                if (detected.headers && Object.keys(detected.headers).length > 0) {
                                  updatedCfg.headers = { ...(currentCfg.headers || {}), ...detected.headers };
                                }
                                setEditingNode({ ...editingNode, config: updatedCfg });
                                return;
                              }
                            }

                            try {
                              const parsed = JSON.parse(val);
                              const repaired =
                                typeof parsed === 'object' && parsed !== null
                                  ? repairMangledFields(parsed)
                                  : parsed;
                              setEditingNode({
                                ...editingNode,
                                config: { ...editingNode.config, body: repaired },
                              });
                            } catch {
                              setEditingNode({
                                ...editingNode,
                                config: { ...editingNode.config, body: val },
                              });
                            }
                          }}
                          placeholder='{\n  "query": "{{user_input}}",\n  "flight_id": "{{flights[0].id}}"\n}'
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>
                  )}

                  {editingNode.node_type === 'POLLING' && (
                    <div className="p-4 rounded-2xl bg-cyan-50/50 border border-cyan-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 text-cyan-700" />
                          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                            Polling Loop Summary & Optional Body
                          </h4>
                        </div>
                        <span className="text-xs font-mono font-bold text-cyan-800 bg-cyan-100 px-2 py-0.5 rounded-md">
                          Method: {editingNode.config.method || 'GET'}
                        </span>
                      </div>
                      <div className="p-3 bg-white rounded-xl border border-cyan-200 text-xs text-slate-700 space-y-1">
                        <p>
                          <strong>Condition:</strong> Loop will poll <code>{editingNode.config.url || 'Target URL'}</code> every{' '}
                          <strong>{editingNode.config.interval_seconds ?? 2}s</strong> until{' '}
                          <code className="text-emerald-700 font-bold">
                            response.{editingNode.config.status_key || 'status'} == &quot;{editingNode.config.target_status || 'COMPLETED'}&quot;
                          </code>
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Max attempts: {editingNode.config.max_attempts ?? 20} (stops after ~
                          {Math.round(((editingNode.config.max_attempts ?? 20) * (editingNode.config.interval_seconds ?? 2)))}s timeout).
                        </p>
                      </div>

                      {editingNode.config.method === 'POST' && (
                        <div className="space-y-1.5 pt-2">
                          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                            POST Request Body:
                          </label>
                          <textarea
                            rows={6}
                            value={
                              typeof editingNode.config.body === 'object'
                                ? JSON.stringify(editingNode.config.body, null, 2)
                                : editingNode.config.body || ''
                            }
                            onChange={(e) => {
                              try {
                                const parsed = JSON.parse(e.target.value);
                                setEditingNode({ ...editingNode, config: { ...editingNode.config, body: parsed } });
                              } catch {
                                setEditingNode({ ...editingNode, config: { ...editingNode.config, body: e.target.value } });
                              }
                            }}
                            placeholder='{\n  "job_id": "{{job_id}}"\n}'
                            className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-900 focus:outline-none focus:border-cyan-600"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* AGENT: Multi-Agent Swarm Collaboration & Hand-off Contract */}
                  {editingNode.node_type === 'AGENT' && (
                    <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 shadow-2xs space-y-3.5">
                      <div className="flex items-center justify-between border-b border-indigo-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-xl bg-indigo-100 border border-indigo-300 flex items-center justify-center text-indigo-700">
                            <Bot className="w-4 h-4 text-indigo-700" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-900 font-display">
                              Multi-Agent Swarm Collaboration & Hand-off Contract
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Define contract schema expectations and deadlock loops when this agent passes outputs downstream
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                          Swarm Contract
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                            Max Inter-Agent Turns (Deadlock Breaker)
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={2}
                              max={50}
                              value={editingNode.config.max_turns ?? 8}
                              onChange={(e) => setEditingNode({
                                ...editingNode,
                                config: { ...editingNode.config, max_turns: parseInt(e.target.value, 10) || 8 }
                              })}
                              className="w-24 bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                            />
                            <span className="text-[11px] text-slate-500">
                              auto-kills runaway circular delegations
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                            Fail Execution on Contract Violation
                          </label>
                          <label className="flex items-center gap-2 mt-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editingNode.config.strict_contract !== false}
                              onChange={(e) => setEditingNode({
                                ...editingNode,
                                config: { ...editingNode.config, strict_contract: e.target.checked }
                              })}
                              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                            />
                            <span className="text-xs font-medium text-slate-700">Strict JSON Schema Enforcement</span>
                          </label>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                            Expected Output Contract (JSON Schema):
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const sampleSchema = {
                                type: "object",
                                required: ["summary", "citations"],
                                properties: {
                                  summary: { type: "string" },
                                  citations: { type: "array", items: { type: "string" } },
                                  confidence: { type: "number" }
                                }
                              };
                              setEditingNode({
                                ...editingNode,
                                config: { ...editingNode.config, contract_schema: sampleSchema }
                              });
                            }}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer hover:underline"
                          >
                            + Load Sample Contract
                          </button>
                        </div>
                        <textarea
                          rows={6}
                          value={
                            typeof editingNode.config.contract_schema === 'object'
                              ? JSON.stringify(editingNode.config.contract_schema, null, 2)
                              : editingNode.config.contract_schema || ''
                          }
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              setEditingNode({ ...editingNode, config: { ...editingNode.config, contract_schema: parsed } });
                            } catch {
                              setEditingNode({ ...editingNode, config: { ...editingNode.config, contract_schema: e.target.value } });
                            }
                          }}
                          placeholder='{\n  "type": "object",\n  "required": ["report_summary", "citations"],\n  "properties": {\n    "report_summary": { "type": "string" },\n    "citations": { "type": "array" }\n  }\n}'
                          className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-600 shadow-2xs"
                        />
                      </div>
                    </div>
                  )}

                  {/* CAPTURE RESULT: Dedicated Variable & Response Selection Studio */}
                  {editingNode.node_type === 'CAPTURE_RESULT' && (
                    <div className="space-y-4">
                      {/* Header & Quick Action Buttons */}
                      <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-200 shadow-2xs space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-2xs">
                              <Variable className="w-4 h-4" />
                            </div>
                            <div>
                              <h3 className="text-xs font-bold text-slate-900 font-display">
                                Select Variables & Responses to Capture
                              </h3>
                              <p className="text-[11px] text-slate-500">
                                Click any variable below to toggle capture, or add custom paths/expressions
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                const currentRules = [...(editingNode.config.rules || [])];
                                availableUpstreamVariables.forEach((v) => {
                                  if (!currentRules.some((r: any) => (r.target_variable || r.name) === v.variable_name)) {
                                    currentRules.push({
                                      name: v.variable_name,
                                      target_variable: v.variable_name,
                                      mode: 'JSON_PATH',
                                      expression: v.json_path || v.variable_name,
                                      source_node_key: v.source_node_key || ''
                                    });
                                  }
                                });
                                setEditingNode({
                                  ...editingNode,
                                  config: { ...editingNode.config, rules: currentRules }
                                });
                              }}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>⚡ Capture All ({availableUpstreamVariables.length})</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                const currentRules = [...(editingNode.config.rules || [])];
                                if (!currentRules.some((r: any) => (r.target_variable || r.name) === 'full_response')) {
                                  currentRules.push({
                                    name: 'full_response',
                                    target_variable: 'full_response',
                                    mode: 'ENTIRE_RESPONSE',
                                    expression: 'response',
                                    source_node_key: editingNode.config.source_node_key || ''
                                  });
                                  setEditingNode({
                                    ...editingNode,
                                    config: { ...editingNode.config, rules: currentRules }
                                  });
                                }
                              }}
                              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold shadow-2xs transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <span>📦 Capture Entire Response</span>
                            </button>

                            {(editingNode.config.rules || []).length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingNode({
                                    ...editingNode,
                                    config: { ...editingNode.config, rules: [] }
                                  });
                                }}
                                className="px-2 py-1 rounded-lg hover:bg-rose-50 text-rose-600 text-xs font-bold transition-all cursor-pointer"
                              >
                                Clear All
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 1-Click Toggle Variable Chips */}
                        {availableUpstreamVariables.length > 0 && (
                          <div className="space-y-1.5 pt-2 border-t border-indigo-100">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900 block">
                              Click variable to toggle capture rule:
                            </span>
                            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                              {availableUpstreamVariables.map((v) => {
                                const isCaptured = (editingNode.config.rules || []).some(
                                  (r: any) => (r.target_variable || r.name) === v.variable_name
                                );
                                return (
                                  <button
                                    key={v.variable_name}
                                    type="button"
                                    onClick={() => {
                                      let updated = [...(editingNode.config.rules || [])];
                                      if (isCaptured) {
                                        updated = updated.filter(
                                          (r: any) => (r.target_variable || r.name) !== v.variable_name
                                        );
                                      } else {
                                        updated.push({
                                          name: v.variable_name,
                                          target_variable: v.variable_name,
                                          mode: 'JSON_PATH',
                                          expression: v.json_path || v.variable_name,
                                          source_node_key: v.source_node_key || ''
                                        });
                                      }
                                      setEditingNode({
                                        ...editingNode,
                                        config: { ...editingNode.config, rules: updated }
                                      });
                                    }}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs ${
                                      isCaptured
                                        ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700'
                                        : 'bg-white hover:bg-indigo-50 text-indigo-900 border-indigo-200 hover:border-indigo-400'
                                    }`}
                                    title={isCaptured ? `Click to remove ${v.variable_name}` : `Click to capture ${v.variable_name}`}
                                  >
                                    <span className="text-[11px]">{isCaptured ? '✓' : '+'}</span>
                                    <span>{"{{" + v.variable_name + "}}"}</span>
                                    {v.source_node_label && (
                                      <span className={`text-[9px] font-sans font-normal ${isCaptured ? 'text-indigo-200' : 'text-slate-400'}`}>
                                        ({v.source_node_label})
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Active Capture Rules Table */}
                      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-900 font-display">
                              Configured Capture Rules ({(editingNode.config.rules || []).length})
                            </h4>
                            <span className="text-[11px] text-slate-400">
                              Saved to workflow variables
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...(editingNode.config.rules || [])];
                              const nextIdx = updated.length + 1;
                              updated.push({
                                name: `var_${nextIdx}`,
                                target_variable: `var_${nextIdx}`,
                                mode: 'JSON_PATH',
                                expression: '',
                                source_node_key: ''
                              });
                              setEditingNode({
                                ...editingNode,
                                config: { ...editingNode.config, rules: updated }
                              });
                            }}
                            className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>+ Add Custom Rule</span>
                          </button>
                        </div>

                        {(editingNode.config.rules || []).length === 0 ? (
                          <div className="text-center py-8 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            <Variable className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                            <p className="text-xs font-bold text-slate-700">No variables configured to capture yet</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Click any of the variable pills above or click &quot;+ Add Custom Rule&quot; to configure which responses to save.
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="grid grid-cols-12 gap-2 px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              <div className="col-span-4">Save As Variable Name</div>
                              <div className="col-span-3">Capture Mode</div>
                              <div className="col-span-4">Source Key / Path / Expression</div>
                              <div className="col-span-1 text-center">Action</div>
                            </div>

                            {(editingNode.config.rules || []).map((rule: any, rIdx: number) => (
                              <div
                                key={rIdx}
                                className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl bg-slate-50/80 border border-slate-200 hover:border-indigo-200 transition-colors"
                              >
                                {/* Target Variable Name */}
                                <div className="col-span-4">
                                  <input
                                    type="text"
                                    value={rule.target_variable || rule.name || ''}
                                    onChange={(e) => {
                                      const updated = [...(editingNode.config.rules || [])];
                                      updated[rIdx] = {
                                        ...updated[rIdx],
                                        name: e.target.value,
                                        target_variable: e.target.value
                                      };
                                      setEditingNode({ ...editingNode, config: { ...editingNode.config, rules: updated } });
                                    }}
                                    placeholder="variable_name"
                                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-indigo-900 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>

                                {/* Mode */}
                                <div className="col-span-3">
                                  <select
                                    value={rule.mode || 'JSON_PATH'}
                                    onChange={(e) => {
                                      const updated = [...(editingNode.config.rules || [])];
                                      updated[rIdx] = { ...updated[rIdx], mode: e.target.value };
                                      setEditingNode({ ...editingNode, config: { ...editingNode.config, rules: updated } });
                                    }}
                                    className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-indigo-500 cursor-pointer"
                                  >
                                    <option value="JSON_PATH">JSON Property</option>
                                    <option value="ENTIRE_RESPONSE">Full Response</option>
                                    <option value="REGEX">Regex Match</option>
                                    <option value="HTML_TEXT">HTML Text</option>
                                    <option value="HTML_LINKS">HTML Links</option>
                                  </select>
                                </div>

                                {/* Expression */}
                                <div className="col-span-4">
                                  <input
                                    type="text"
                                    list="upstream-variables-datalist"
                                    value={rule.expression ?? ''}
                                    onChange={(e) => {
                                      const updated = [...(editingNode.config.rules || [])];
                                      updated[rIdx] = { ...updated[rIdx], expression: e.target.value };
                                      setEditingNode({ ...editingNode, config: { ...editingNode.config, rules: updated } });
                                    }}
                                    placeholder={rule.mode === 'ENTIRE_RESPONSE' ? 'response (full body)' : 'e.g. status or job_id'}
                                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500"
                                  />
                                </div>

                                {/* Delete */}
                                <div className="col-span-1 text-center">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = (editingNode.config.rules || []).filter((_: any, i: number) => i !== rIdx);
                                      setEditingNode({ ...editingNode, config: { ...editingNode.config, rules: updated } });
                                    }}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                                    title="Remove Rule"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 mx-auto" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* SECTION 3: OUTPUT & VARIABLES */}
          {modalSection === 'output' && (
            <div className="space-y-5 max-w-3xl mx-auto">
              <datalist id="discovered-output-keys-datalist">
                {discoveredOutputKeys.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Execute & Test Live</h4>
                  <p className="text-[11px] text-slate-500">Run this individual node against the endpoint to inspect live output</p>
                </div>

                <button
                  onClick={() => onExecuteNodeTest(editingNode)}
                  disabled={isTesting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Play className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'Executing...' : '▶️ Execute / Test Node'}</span>
                </button>
              </div>

              {/* Extraction Rules Table */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                      <Variable className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <h4 className="text-xs font-bold text-slate-900 font-display">
                        Variable Extraction Rules
                      </h4>
                      <span className="text-[10px] text-slate-400 font-mono">
                        (Available as {"{{variable_name}}"} in next nodes)
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const updated = [...(editingNode.config.extractions || [])];
                      const nextKey = discoveredOutputKeys.find((k) => !updated.some((e: any) => e.json_path === k)) || `var_${updated.length + 1}`;
                      const cleanVarName = nextKey.replace(/[^a-zA-Z0-9_]/g, '_');
                      updated.push({ variable_name: cleanVarName, json_path: nextKey });
                      setEditingNode({ ...editingNode, config: { ...editingNode.config, extractions: updated } });
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Rule</span>
                  </button>
                </div>

                {/* Quick Extract Discovered Output Variables Chips */}
                {discoveredOutputKeys.length > 0 && (
                  <div className="p-3 rounded-xl bg-amber-50/80 border border-amber-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-amber-950 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                        <span>Discovered Output Variables (Click to auto-extract)</span>
                      </span>
                      <span className="text-[10px] text-amber-800 font-medium">1-Click Auto Extraction</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {discoveredOutputKeys.map((k) => {
                        const isAlreadyExtracted = (editingNode.config.extractions || []).some(
                          (e: any) => e.json_path === k || e.variable_name === k
                        );
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => {
                              if (isAlreadyExtracted) return;
                              const updated = [...(editingNode.config.extractions || [])];
                              const cleanVarName = k.replace(/[^a-zA-Z0-9_]/g, '_');
                              updated.push({ variable_name: cleanVarName, json_path: k });
                              setEditingNode({ ...editingNode, config: { ...editingNode.config, extractions: updated } });
                            }}
                            style={{
                              color: isAlreadyExtracted ? '#64748b' : '#0f172a',
                              backgroundColor: isAlreadyExtracted ? '#f1f5f9' : '#fef3c7',
                              borderColor: isAlreadyExtracted ? '#cbd5e1' : '#f59e0b'
                            }}
                            className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-bold shadow-2xs transition-all cursor-pointer flex items-center gap-1 ${
                              isAlreadyExtracted ? 'opacity-60 cursor-default' : 'hover:bg-amber-200 hover:border-amber-500'
                            }`}
                          >
                            <span>{isAlreadyExtracted ? '✓' : '+'}</span>
                            <span>{k}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  {(editingNode.config.extractions || []).length === 0 ? (
                    <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 text-xs font-medium">
                      No extraction rules added yet. Click a discovered variable above or "+ Add Rule".
                    </div>
                  ) : (
                    (editingNode.config.extractions || []).map((ext: any, extIdx: number) => (
                      <div
                        key={extIdx}
                        className="p-2.5 rounded-xl bg-slate-50/80 border border-slate-200 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className="w-44 shrink-0">
                            <label className="text-[9px] font-bold uppercase text-slate-400 block mb-0.5">Variable Name</label>
                            <input
                              type="text"
                              value={ext.variable_name}
                              placeholder="var_name"
                              onChange={(e) => {
                                const updated = [...(editingNode.config.extractions || [])];
                                updated[extIdx] = { ...updated[extIdx], variable_name: e.target.value };
                                setEditingNode({ ...editingNode, config: { ...editingNode.config, extractions: updated } });
                              }}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-amber-500 focus:outline-none"
                            />
                          </div>
                          <span className="text-slate-400 font-bold text-[10px] shrink-0 pt-3">← Key:</span>
                          <div className="w-56 shrink-0">
                            <label className="text-[9px] font-bold uppercase text-slate-400 block mb-0.5">Output Key / Path</label>
                            <input
                              type="text"
                              list="discovered-output-keys-datalist"
                              value={ext.json_path}
                              placeholder="e.g. chat_url or response"
                              onChange={(e) => {
                                const updated = [...(editingNode.config.extractions || [])];
                                updated[extIdx] = { ...updated[extIdx], json_path: e.target.value };
                                setEditingNode({ ...editingNode, config: { ...editingNode.config, extractions: updated } });
                              }}
                              className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 focus:border-amber-500 focus:outline-none"
                            />
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            const updated = (editingNode.config.extractions || []).filter((_: any, i: number) => i !== extIdx);
                            setEditingNode({ ...editingNode, config: { ...editingNode.config, extractions: updated } });
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer shrink-0 transition-colors mt-3"
                          title="Delete Rule"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Live Test Response Preview */}
              {testResponse && (
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-xs font-bold text-slate-900 uppercase">
                      Live Output ({testResponse.status || 'DONE'})
                    </span>
                    <button
                      onClick={() => navigator.clipboard.writeText(JSON.stringify(testResponse.response || testResponse, null, 2))}
                      className="text-xs text-blue-600 hover:text-blue-700 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy JSON</span>
                    </button>
                  </div>
                  <pre className="text-xs font-mono text-slate-900 bg-slate-50 p-3 rounded-xl max-h-56 overflow-y-auto">
                    {JSON.stringify(testResponse.response || testResponse, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <button
            onClick={() => onDeleteNode(editingNode.node_key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 text-xs font-bold transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-800" />
            <span>Delete Node</span>
          </button>

          <div className="flex items-center gap-2">
            {modalSection === 'input' && (
              <button
                onClick={() => setModalSection('editor')}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer"
              >
                <span>Next: Payload & Editor →</span>
              </button>
            )}
            {modalSection === 'editor' && (
              <>
                <button
                  onClick={() => setModalSection('input')}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer"
                >
                  ← Back
                </button>
                <button
                  onClick={() => setModalSection('output')}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer"
                >
                  <span>Next: Output & Variables →</span>
                </button>
              </>
            )}
            {modalSection === 'output' && (
              <button
                onClick={() => setModalSection('editor')}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer"
              >
                ← Back
              </button>
            )}

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSaveNode(editingNode);
                onClose();
              }}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              Apply & Close
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* cURL & Browser Inspect Importer Modal rendered on top level */}
    <CurlImportModal
      isOpen={isCurlModalOpen}
      onClose={() => setIsCurlModalOpen(false)}
      onImport={handleImportCurl}
    />
  </>
);
};


