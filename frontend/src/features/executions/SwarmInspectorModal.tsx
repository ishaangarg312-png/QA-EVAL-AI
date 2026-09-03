import React, { useState, useEffect } from 'react';
import { SwarmMessage } from '../../types';
import { api } from '../../services/api';
import { JsonViewer } from '../../components/JsonViewer';
import {
  Bot,
  X,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Layers,
  Clock,
  Coins,
  Copy,
  Check,
  Terminal,
  Upload,
  Workflow as WorkflowIcon,
  MessageSquare
} from 'lucide-react';

interface SwarmInspectorModalProps {
  isOpen: boolean;
  executionId: string;
  executionCorrelationId?: string;
  onClose: () => void;
}

export const SwarmInspectorModal: React.FC<SwarmInspectorModalProps> = ({
  isOpen,
  executionId,
  executionCorrelationId,
  onClose,
}) => {
  const [messages, setMessages] = useState<SwarmMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState<SwarmMessage | null>(null);
  const [activeTab, setActiveTab] = useState<'graph' | 'ingest'>('graph');
  const [pastedTrace, setPastedTrace] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  const fetchMessages = async () => {
    if (!executionId) return;
    setIsLoading(true);
    try {
      const res = await api.getSwarmMessages(executionId);
      setMessages(res.messages || []);
      if (res.messages?.length > 0 && !selectedMsg) {
        setSelectedMsg(res.messages[0]);
      }
    } catch (err) {
      console.error('Failed to load swarm messages:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && executionId) {
      fetchMessages();
    }
  }, [isOpen, executionId]);

  if (!isOpen) return null;

  // Compute summary metrics
  const uniqueAgents = Array.from(new Set(messages.flatMap(m => [m.sender_agent, m.recipient_agent]).filter(Boolean)));
  const contractViolationsCount = messages.filter(m => m.contract_status === 'FAILED').length;
  const deadlockDetected = messages.some(m => m.is_loop_suspect === 'true');
  const totalTokens = messages.reduce((acc, m) => acc + (m.tokens || 0), 0);

  const handleIngest = async () => {
    if (!pastedTrace.trim()) return;
    setIsIngesting(true);
    setIngestStatus(null);
    try {
      const parsed = JSON.parse(pastedTrace);
      const res = await api.ingestSwarmTrace(executionId, { payload: parsed });
      setIngestStatus(`Successfully ingested ${res.messages_ingested} swarm message(s)!`);
      await fetchMessages();
      setActiveTab('graph');
    } catch (err: any) {
      setIngestStatus(`Error: ${err.message || 'Failed to ingest trace'}`);
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-6xl my-auto overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 font-display">
                  Multi-Agent Swarm Inspector
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Swarm Telemetry
                </span>
                {deadlockDetected && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-rose-600" />
                    Deadlock Terminated
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium flex items-center gap-2 mt-0.5">
                <span>Execution: <code className="font-mono text-slate-700">{executionCorrelationId || executionId}</code></span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(executionId);
                    setCopiedId(true);
                    setTimeout(() => setCopiedId(false), 1500);
                  }}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  title="Copy execution ID"
                >
                  {copiedId ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                </button>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveTab('graph')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === 'graph' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Swarm Graph ({messages.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ingest')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'ingest' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Ingest Trace</span>
              </button>
            </div>

            <button
              type="button"
              onClick={fetchMessages}
              disabled={isLoading}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-200"
              title="Refresh Swarm Messages"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Metrics Banner */}
        <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Agents:</span>
              <span className="font-bold text-slate-900 font-mono bg-white px-2 py-0.5 rounded-md border border-slate-200">
                {uniqueAgents.length || 0}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Messages:</span>
              <span className="font-bold text-indigo-700 font-mono bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                {messages.length}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Contracts:</span>
              <span className={`font-bold font-mono px-2 py-0.5 rounded-md border ${
                contractViolationsCount === 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}>
                {contractViolationsCount === 0 ? 'All Valid' : `${contractViolationsCount} Violations`}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-medium">Tokens:</span>
              <span className="font-bold text-slate-700 font-mono bg-white px-2 py-0.5 rounded-md border border-slate-200">
                {totalTokens.toLocaleString()}
              </span>
            </div>
          </div>

          {uniqueAgents.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-slate-400 text-[11px] mr-1 font-medium">Participants:</span>
              {uniqueAgents.map((ag, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-800 text-[11px] font-mono font-bold"
                >
                  {ag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {activeTab === 'ingest' ? (
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">
                  Ingest External Swarm Telemetry
                </h3>
                <p className="text-xs text-slate-500">
                  Paste raw JSON traces from <strong>LangGraph</strong>, <strong>CrewAI</strong>, <strong>AutoGen</strong>, <strong>OpenAI Swarm</strong>, or custom multi-agent logs.
                </p>
              </div>

              {/* Sample Presets */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-600">Sample Templates:</span>
                <button
                  type="button"
                  onClick={() => setPastedTrace(JSON.stringify({
                    swarm_trace: [
                      { sender: "PlannerAgent", recipient: "ResearcherAgent", content: "Collect market data on renewable energy trends.", tokens: 120 },
                      { sender: "ResearcherAgent", recipient: "WriterAgent", content: "Found 4 key growth sectors with 24% YoY growth.", tokens: 210, data: { citations: ["https://report1.org"], stats: [24, 18, 32] } },
                      { sender: "WriterAgent", recipient: "ReviewerAgent", content: "Drafted executive summary report.", tokens: 350 },
                      { sender: "ReviewerAgent", recipient: "WriterAgent", content: "Approved without revisions.", tokens: 45 }
                    ]
                  }, null, 2))}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-colors cursor-pointer"
                >
                  Standard Swarm Trace
                </button>

                <button
                  type="button"
                  onClick={() => setPastedTrace(JSON.stringify({
                    chat_history: [
                      { sender: "UserProxy", recipient: "CoderAgent", content: "Build a Python microservice with FastAPI and Docker." },
                      { sender: "CoderAgent", recipient: "ReviewerAgent", content: "Implemented endpoints, please review security." },
                      { sender: "ReviewerAgent", recipient: "CoderAgent", content: "Missing input sanitization in request body." },
                      { sender: "CoderAgent", recipient: "ReviewerAgent", content: "Patched input sanitization with Pydantic validator." }
                    ]
                  }, null, 2))}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-colors cursor-pointer"
                >
                  AutoGen Format
                </button>

                <button
                  type="button"
                  onClick={() => setPastedTrace(JSON.stringify({
                    tasks_output: [
                      { agent: "Senior Analyst", task: "Analyze balance sheet", output: "Identified $4.2M surplus in operational expenses.", duration: 3.4 },
                      { agent: "Audit Specialist", task: "Verify compliance", output: "Audit passed with zero critical flags.", duration: 2.1 }
                    ]
                  }, null, 2))}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-colors cursor-pointer"
                >
                  CrewAI Format
                </button>
              </div>

              <textarea
                value={pastedTrace}
                onChange={(e) => setPastedTrace(e.target.value)}
                placeholder="Paste JSON trace here..."
                rows={12}
                className="w-full font-mono text-xs p-4 bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 focus:outline-none focus:border-indigo-500 shadow-inner"
              />

              {ingestStatus && (
                <div className={`p-3 rounded-xl text-xs font-bold border ${
                  ingestStatus.startsWith('Error')
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}>
                  {ingestStatus}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('graph')}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleIngest}
                  disabled={isIngesting || !pastedTrace.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-xs cursor-pointer flex items-center gap-2 disabled:opacity-50"
                >
                  {isIngesting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>Normalize & Ingest Trace</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* Left Column: Sequence of Agent Hand-offs */}
              <div className="w-1/2 border-r border-slate-200 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                {messages.length === 0 ? (
                  <div className="text-center py-16 px-4">
                    <Bot className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-slate-800 mb-1">No Swarm Messages Recorded</h3>
                    <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                      This execution hasn't received any multi-agent communications yet. You can test the inspector by ingesting a sample trace.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('ingest')}
                      className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 shadow-xs cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Ingest Sample Swarm Trace</span>
                    </button>
                  </div>
                ) : (
                  messages.map((msg, idx) => {
                    const isSelected = selectedMsg?.id === msg.id;
                    const isViolation = msg.contract_status === 'FAILED';
                    const isLoop = msg.is_loop_suspect === 'true';

                    return (
                      <div
                        key={msg.id || idx}
                        onClick={() => setSelectedMsg(msg)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-white border-indigo-600 ring-2 ring-indigo-100 shadow-md'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-xs'
                        }`}
                      >
                        {/* Step Header */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-mono font-bold flex items-center justify-center border border-slate-300">
                              {msg.turn_index || idx + 1}
                            </span>
                            <span className="text-xs font-bold text-slate-900 font-mono">
                              {msg.sender_agent}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-indigo-500" />
                            <span className="text-xs font-bold text-indigo-700 font-mono">
                              {msg.recipient_agent}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isLoop && (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                Loop Suspect
                              </span>
                            )}

                            {isViolation ? (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                                <ShieldAlert className="w-3 h-3 text-rose-600" />
                                Contract Failed
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                Contract Passed
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Content Snippet */}
                        <p className="text-xs text-slate-600 line-clamp-2 bg-slate-50 p-2 rounded-xl border border-slate-100 font-sans">
                          {msg.content}
                        </p>

                        {/* Footer details */}
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 font-mono">
                          <span>{msg.message_type}</span>
                          <div className="flex items-center gap-3">
                            {msg.tokens > 0 && <span>{msg.tokens} tokens</span>}
                            {msg.latency_ms > 0 && <span>{Math.round(msg.latency_ms)}ms</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Right Column: Deep Inspection Details */}
              <div className="w-1/2 overflow-y-auto p-5 bg-white space-y-4">
                {selectedMsg ? (
                  <>
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 font-display">
                          Turn #{selectedMsg.turn_index}: Hand-off Inspection
                        </h4>
                        <p className="text-xs text-slate-500 font-mono">
                          {selectedMsg.sender_agent} ➔ {selectedMsg.recipient_agent}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${
                          selectedMsg.contract_status === 'FAILED'
                            ? 'bg-rose-100 text-rose-800 border-rose-300'
                            : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        }`}>
                          {selectedMsg.contract_status === 'FAILED' ? <ShieldAlert className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                          <span>{selectedMsg.contract_status === 'FAILED' ? 'Contract Violation' : 'Contract Satisfied'}</span>
                        </span>
                      </div>
                    </div>

                    {/* Contract Violation Alert Box */}
                    {selectedMsg.contract_status === 'FAILED' && (selectedMsg.contract_violations || []).length > 0 && (
                      <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs space-y-1.5 animate-in fade-in">
                        <div className="flex items-center gap-2 font-bold text-rose-900">
                          <ShieldAlert className="w-4 h-4 text-rose-600" />
                          <span>Schema Contract Violations ({(selectedMsg.contract_violations || []).length}):</span>
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-rose-800 pl-1 font-mono text-[11px]">
                          {(selectedMsg.contract_violations || []).map((v, vIdx) => (
                            <li key={vIdx}>
                              <strong>{v.field || 'root'}:</strong> {v.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Loop / Deadlock Telemetry Box */}
                    {selectedMsg.is_loop_suspect === 'true' && (
                      <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs space-y-1 animate-in fade-in">
                        <div className="flex items-center gap-2 font-bold text-amber-900">
                          <AlertTriangle className="w-4 h-4 text-amber-600" />
                          <span>Deadlock / Infinite Loop Telemetry:</span>
                        </div>
                        <p className="text-amber-800 text-[11px]">
                          Consecutive turn similarity score: <strong>{Math.round((selectedMsg.similarity_score_to_previous || 0) * 100)}%</strong>. Runaway conversational ping-pong loop was detected and halted.
                        </p>
                      </div>
                    )}

                    {/* Content */}
                    <div>
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">
                        Message Content
                      </label>
                      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                        {selectedMsg.content}
                      </div>
                    </div>

                    {/* Structured Payload JSON */}
                    {selectedMsg.structured_payload && (
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">
                          Extracted Structured Payload
                        </label>
                        <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 text-xs max-h-60 overflow-y-auto">
                          <JsonViewer data={selectedMsg.structured_payload} />
                        </div>
                      </div>
                    )}

                    {/* Tools Invoked */}
                    {(selectedMsg.tools_invoked || []).length > 0 && (
                      <div>
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block mb-1.5">
                          Tools Invoked During Turn ({(selectedMsg.tools_invoked || []).length})
                        </label>
                        <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 text-xs max-h-40 overflow-y-auto">
                          <JsonViewer data={selectedMsg.tools_invoked} />
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-20 text-slate-400 text-xs">
                    Select any communication step on the left to inspect payloads, tools, and contract validation diffs.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50 text-xs text-slate-500 shrink-0">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Universal Swarm Observer • Black-Box, Framework & Canvas Swarms</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold transition-all cursor-pointer"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
