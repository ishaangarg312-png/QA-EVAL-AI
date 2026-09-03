import React, { useState } from 'react';
import { WorkflowNode } from '../../../types';
import { cleanAndFormatJson } from '../utils/workflowHelpers';
import {
  Zap,
  Copy,
  Sparkles,
  Check,
  X
} from 'lucide-react';

interface JsonStudioModalProps {
  editingNode: WorkflowNode;
  onUpdateNodeConfig: (updatedConfig: any) => void;
  availableUpstreamVariables: Array<{
    variable_name: string;
    json_path: string;
    source_node_label: string;
    source_node_key: string;
    is_direct_parent: boolean;
  }>;
  onClose: () => void;
}

export const JsonStudioModal: React.FC<JsonStudioModalProps> = ({
  editingNode,
  onUpdateNodeConfig,
  availableUpstreamVariables,
  onClose,
}) => {
  const [jsonStudioRaw, setJsonStudioRaw] = useState<string>('');
  const [jsonStudioError, setJsonStudioError] = useState<string | null>(null);
  const [jsonCopiedVar, setJsonCopiedVar] = useState<string | null>(null);
  const [groqApiKey, setGroqApiKey] = useState<string>(() => localStorage.getItem('groq_api_key') || '');
  const [showGroqKeyInput, setShowGroqKeyInput] = useState<boolean>(false);
  const [isAiParameterizing, setIsAiParameterizing] = useState<boolean>(false);
  const [aiChangesList, setAiChangesList] = useState<string[]>([]);

  const handleAiParameterize = async () => {
    if (!jsonStudioRaw.trim()) {
      alert('Please paste a raw real app payload on the left first.');
      return;
    }
    setIsAiParameterizing(true);
    setJsonStudioError(null);
    setAiChangesList([]);
    try {
      const vars = availableUpstreamVariables.map((v) => v.variable_name);
      const res = await fetch('/api/v1/workflows/ai-parameterize-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_json: jsonStudioRaw,
          available_variables: vars,
          groq_api_key: groqApiKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.parameterized_json) {
        try {
          const parsed = JSON.parse(data.parameterized_json);
          onUpdateNodeConfig({ ...editingNode.config, body: parsed });
        } catch {
          onUpdateNodeConfig({ ...editingNode.config, body: data.parameterized_json });
        }
        setAiChangesList(data.changes_made || []);
      }
      if (data.cleaned_json) {
        setJsonStudioRaw(data.cleaned_json);
      }
    } catch (err: any) {
      setJsonStudioError(`AI Parameterize error: ${err.message}`);
    } finally {
      setIsAiParameterizing(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4 animate-in fade-in">
      {/* Extracted Variables Quick-Palette */}
      {availableUpstreamVariables.length > 0 && (
        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-blue-700" />
              <span className="text-xs font-bold text-blue-950 uppercase tracking-wider">
                Upstream Extracted Variables (Click to Copy or Inject)
              </span>
            </div>
            {jsonCopiedVar && (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full animate-in fade-in">
                ✓ Copied {jsonCopiedVar}!
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {availableUpstreamVariables.map((v, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  const placeholder = `{{${v.variable_name}}}`;
                  navigator.clipboard.writeText(placeholder);
                  setJsonCopiedVar(placeholder);
                  setTimeout(() => setJsonCopiedVar(null), 2000);
                }}
                className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-100 border border-blue-200 text-blue-800 font-mono text-xs font-bold shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
                title={`Click to copy {{${v.variable_name}}} to clipboard`}
              >
                <span>+ {`{{${v.variable_name}}}`}</span>
                <Copy className="w-3 h-3 text-blue-500" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Groq API Key Input Ribbon */}
      {showGroqKeyInput && (
        <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-purple-900 block mb-1">
              Groq API Key (Stored securely in browser localStorage)
            </label>
            <input
              type="password"
              value={groqApiKey}
              onChange={(e) => {
                setGroqApiKey(e.target.value);
                localStorage.setItem('groq_api_key', e.target.value);
              }}
              placeholder="gsk_..."
              className="w-full bg-white border border-purple-300 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-purple-600"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowGroqKeyInput(false)}
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold mt-3.5 cursor-pointer shadow-2xs"
          >
            Done
          </button>
        </div>
      )}

      {/* AI Changes Made Banner */}
      {aiChangesList.length > 0 && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1 animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>AI Parameterization & Corrections Applied ({aiChangesList.length})</span>
            </span>
            <button
              type="button"
              onClick={() => setAiChangesList([])}
              className="text-[10px] text-emerald-700 hover:text-emerald-900 font-semibold cursor-pointer"
            >
              ✕ Dismiss
            </button>
          </div>
          <ul className="list-disc list-inside text-xs font-medium text-emerald-800 space-y-0.5">
            {aiChangesList.map((ch, idx) => (
              <li key={idx}>{ch}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Side-by-Side 2-Column Comparator */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left Column: Real App Raw Payload */}
        <div className="space-y-2 flex flex-col">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <span>📥 Real App Payload</span>
              <span className="text-[11px] font-normal text-slate-500">(Paste raw / messy JSON)</span>
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowGroqKeyInput(!showGroqKeyInput)}
                className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${groqApiKey
                  ? 'bg-purple-100 text-purple-900 border-purple-300'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-purple-50 hover:text-purple-800'
                  }`}
                title="Configure your free Groq API Key (optional for higher accuracy)"
              >
                {groqApiKey ? '🔑 Groq Ready' : '+ Set Groq Key'}
              </button>
              <button
                type="button"
                onClick={handleAiParameterize}
                disabled={isAiParameterizing}
                className="px-3 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                title="Use AI to automatically parameterize and format this payload"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isAiParameterizing ? 'animate-spin' : ''}`} />
                <span>{isAiParameterizing ? 'AI Working...' : '🤖 AI Parameterize'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const { cleaned, error } = cleanAndFormatJson(jsonStudioRaw);
                  setJsonStudioRaw(cleaned);
                  setJsonStudioError(error || null);
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold shadow-2xs transition-all cursor-pointer flex items-center gap-1"
                title="Format and clean unescaped/messy JSON"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                <span>🧹 Clean</span>
              </button>
            </div>
          </div>

          <textarea
            rows={14}
            value={jsonStudioRaw}
            onChange={(e) => {
              setJsonStudioRaw(e.target.value);
              setJsonStudioError(null);
            }}
            placeholder='Paste raw / messy JSON from DevTools Network tab, Postman, Swagger, or real app here...&#10;&#10;e.g.&#10;{&#10;  "message": "Hello",&#10;  "attachment_ids": ["3b3d..."],&#10;  "user_id": "9948..."&#10;}'
            className="w-full flex-1 bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 shadow-inner"
          />

          {jsonStudioError && (
            <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs font-mono">
              <strong>Warning:</strong> {jsonStudioError}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-mono text-slate-500">
              Lines: {jsonStudioRaw.split('\n').length} | Chars: {jsonStudioRaw.length}
            </span>
            <button
              type="button"
              onClick={() => {
                const { cleaned } = cleanAndFormatJson(jsonStudioRaw);
                const targetJson = cleaned || jsonStudioRaw;
                try {
                  const parsed = JSON.parse(targetJson);
                  onUpdateNodeConfig({ ...editingNode.config, body: parsed });
                } catch {
                  onUpdateNodeConfig({ ...editingNode.config, body: targetJson });
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>➡️ Copy to Target Payload</span>
            </button>
          </div>
        </div>

        {/* Right Column: Target Node Payload */}
        <div className="space-y-2 flex flex-col">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <span>🚀 Current Node Payload (Target)</span>
              <span className="text-[11px] font-mono text-blue-600">Supports {'{{vars}}'}</span>
            </label>
            <button
              type="button"
              onClick={() => {
                const current = typeof editingNode.config.body === 'object'
                  ? JSON.stringify(editingNode.config.body, null, 2)
                  : String(editingNode.config.body || '');
                const { cleaned } = cleanAndFormatJson(current);
                try {
                  const parsed = JSON.parse(cleaned);
                  onUpdateNodeConfig({ ...editingNode.config, body: parsed });
                } catch {
                  onUpdateNodeConfig({ ...editingNode.config, body: cleaned });
                }
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold shadow-2xs transition-all cursor-pointer"
            >
              Format JSON
            </button>
          </div>

          <textarea
            rows={14}
            value={
              typeof editingNode.config.body === 'object'
                ? JSON.stringify(editingNode.config.body, null, 2)
                : editingNode.config.body || ''
            }
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                onUpdateNodeConfig({ ...editingNode.config, body: parsed });
              } catch {
                onUpdateNodeConfig({ ...editingNode.config, body: e.target.value });
              }
            }}
            placeholder='{\n  "query": "{{user_input}}",\n  "attachment_id": "{{attachment_id}}"\n}'
            className="w-full flex-1 bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 shadow-inner"
          />

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => {
                const current = typeof editingNode.config.body === 'object'
                  ? JSON.stringify(editingNode.config.body, null, 2)
                  : String(editingNode.config.body || '');
                navigator.clipboard.writeText(current);
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Target JSON</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>✓ Apply & Return to Node</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
