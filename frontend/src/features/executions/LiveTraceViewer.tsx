import React, { useState, useMemo } from 'react';
import { ExecutionRun, TraceEvent, TraceEventType, EvaluationResult } from '../../types';
import { StatusBadge } from '../../components/StatusBadge';
import { JsonViewer } from '../../components/JsonViewer';
import {
  Activity,
  Clock,
  Coins,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Sparkles,
  UserCheck,
  Mail,
  Globe,
  Bot,
  MessageSquare,
  Eye,
  KeyRound,
  FileCode2,
  Copy,
  ExternalLink,
  Zap,
  Scale,
  ShieldAlert,
  AlertTriangle,
  Code,
  Trash2,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Layers,
  Search,
  FileCode,
  Play,
  AlertCircle,
  RefreshCw,
  Link2,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  FileSpreadsheet
} from 'lucide-react';
import { ExcelReportModal } from './ExcelReportModal';
import { SwarmInspectorModal } from './SwarmInspectorModal';

interface LiveTraceViewerProps {
  executions: ExecutionRun[];
  selectedExecution: ExecutionRun | null;
  evaluations?: EvaluationResult[];
  rca?: any;
  projectId?: string;
  projectName?: string;
  onSelectExecution: (executionId: string) => void;
  onOpenHITL: (execution: ExecutionRun) => void;
  onOpenRCA: (executionId: string) => void;
  onDeleteExecution?: (executionId: string) => Promise<void>;
  onClearHistory?: () => Promise<void>;
}

const formatTraceTitle = (title?: string) => {
  if (!title) return 'Step';
  if (title.startsWith('node-')) {
    const parts = title.split(' ');
    return parts.slice(1).join(' ') || title;
  }
  return title;
};

export const LiveTraceViewer: React.FC<LiveTraceViewerProps> = ({
  executions,
  selectedExecution,
  projectId,
  projectName,
  onSelectExecution,
  onOpenHITL,
  onDeleteExecution,
  onClearHistory
}) => {
  const [activeTab, setActiveTab] = useState<'responses' | 'traces'>('responses');
  const [responseFilterText, setResponseFilterText] = useState<string>('');
  const [responseFormatMode, setResponseFormatMode] = useState<'clean' | 'json' | 'raw'>('clean');
  const [selectedResponseRunId, setSelectedResponseRunId] = useState<string | null>(null);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState<boolean>(false);
  const [isSwarmModalOpen, setIsSwarmModalOpen] = useState<boolean>(false);
  const [expandedResponseVars, setExpandedResponseVars] = useState<Record<string, boolean>>({});

  const toggleResponseVar = (key: string) => {
    setExpandedResponseVars((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleAllResponseVars = (runId: string, varKeys: string[]) => {
    const areAllOpen = varKeys.length > 0 && varKeys.every((vk) => !!expandedResponseVars[`${runId}_${vk}`]);
    setExpandedResponseVars((prev) => {
      const next = { ...prev };
      varKeys.forEach((vk) => {
        next[`${runId}_${vk}`] = !areAllOpen;
      });
      return next;
    });
  };

  const [selectedTraceEvent, setSelectedTraceEvent] = useState<TraceEvent | null>(null);
  const [payloadViewMode, setPayloadViewMode] = useState<'normalized' | 'raw'>('raw');
  const [expandedBatchIds, setExpandedBatchIds] = useState<Record<string, boolean>>({ 'matrix-batch-parent': true });

  React.useEffect(() => {
    if (selectedExecution?.trace_events && selectedExecution.trace_events.length > 0) {
      setSelectedTraceEvent(selectedExecution.trace_events[0]);
    } else {
      setSelectedTraceEvent(null);
    }
  }, [selectedExecution]);

  const getHumanRunTitle = (exec: ExecutionRun) => {
    if (!exec) return { title: 'Execution Run', subtitle: '', badge: 'Run' };
    const corr = exec.correlation_id || '';
    if (corr.startsWith('corr-matrix-') || corr.startsWith('corr-row-') || corr.startsWith('Scenario-')) {
      const match = corr.match(/-s(\d+)-/i) || corr.match(/-r(\d+)-/i) || corr.match(/row-(\d+)/i) || corr.match(/Scenario-(\d+)/i);
      const scenarioNum = (exec.runtime_context as any)?.scenario_index
        ? String((exec.runtime_context as any).scenario_index)
        : (match ? match[1] : (exec.dataset_row_index !== undefined ? String(exec.dataset_row_index + 1) : '1'));
      
      let promptQuery = (exec.runtime_context as any)?.scenario || (exec.runtime_context as any)?.dataset_vars?.message || '';
      if (!promptQuery && corr.includes(':')) {
        promptQuery = corr.split(':')[1]?.split('(')[0]?.trim() || '';
      }
      if (!promptQuery && exec.trace_events) {
        for (const t of exec.trace_events) {
          const payload = t.raw_payload as any;
          if (payload && typeof payload === 'object') {
            const msg = payload.message || payload.body?.message || payload.payload_in?.message;
            if (msg) {
              promptQuery = String(msg);
              break;
            }
          }
        }
      }

      const totalTurns = (exec.runtime_context as any)?.total_turns || 1;
      const totalRows = (exec.runtime_context as any)?.total_rows || totalTurns;

      return {
        title: `Scenario #${scenarioNum}${promptQuery ? `: "${promptQuery.slice(0, 28)}${promptQuery.length > 28 ? '...' : ''}"` : ''}`,
        subtitle: `Matrix Scenario ${scenarioNum} • ${totalTurns > 1 ? `${totalTurns} Turns (${totalRows} Rows)` : '3 Nodes'}`,
        badge: `Scenario ${scenarioNum}`,
        rowNumber: parseInt(scenarioNum, 10) || 1
      };
    }
    if (corr.startsWith('corr-') || corr.startsWith('run-')) {
      return {
        title: `Workflow Run (${corr.slice(-6)})`,
        subtitle: 'Interactive Flow Execution',
        badge: 'Flow Run',
        rowNumber: 1
      };
    }
    return {
      title: corr,
      subtitle: 'Execution Trace',
      badge: 'Run',
      rowNumber: 1
    };
  };

  // Group batch runs into distinct per-batch parent folders
  const groupedExecutions = useMemo(() => {
    const groups: {
      id: string;
      isBatch: boolean;
      title: string;
      subtitle: string;
      createdAt: string;
      runs: ExecutionRun[];
    }[] = [];

    // Map of batchKey -> ExecutionRun[]
    const batchMap = new Map<string, ExecutionRun[]>();
    const singleRuns: ExecutionRun[] = [];

    executions.forEach((exec) => {
      const corr = exec.correlation_id || '';
      
      if (corr.startsWith('corr-matrix-')) {
        // e.g. corr-matrix-59d22a-s1-0124 or corr-matrix-546a14-r1-a8b2
        const matrixMatch = corr.match(/^(corr-matrix-[a-zA-Z0-9]+)/i);
        const batchKey = matrixMatch ? matrixMatch[1] : (corr.split(/-[sr]\d+/i)[0] || corr);

        if (!batchMap.has(batchKey)) {
          batchMap.set(batchKey, []);
        }
        batchMap.get(batchKey)!.push(exec);
      } else if (corr.startsWith('corr-row-') || corr.startsWith('Scenario-') || corr.startsWith('batch-')) {
        // Legacy runs: group by minute of creation
        const timeKey = exec.created_at ? exec.created_at.slice(0, 16) : (exec.started_at ? exec.started_at.slice(0, 16) : 'legacy-batch');
        const batchKey = `batch-${timeKey}`;
        if (!batchMap.has(batchKey)) {
          batchMap.set(batchKey, []);
        }
        batchMap.get(batchKey)!.push(exec);
      } else {
        singleRuns.push(exec);
      }
    });

    // Add each batch group as an independent branch
    Array.from(batchMap.entries()).forEach(([batchKey, runs]) => {
      // Sort in scenario order (1, 2, 3...)
      runs.sort((a, b) => {
        const corrA = a?.correlation_id || '';
        const corrB = b?.correlation_id || '';
        const matchA = corrA.match(/-s(\d+)-/i) || corrA.match(/-r(\d+)-/i) || corrA.match(/row-(\d+)/i) || corrA.match(/Scenario-(\d+)/i);
        const matchB = corrB.match(/-s(\d+)-/i) || corrB.match(/-r(\d+)-/i) || corrB.match(/row-(\d+)/i) || corrB.match(/Scenario-(\d+)/i);
        const rA = (a?.runtime_context as any)?.scenario_index ?? (matchA ? parseInt(matchA[1], 10) : (a?.dataset_row_index ?? 0));
        const rB = (b?.runtime_context as any)?.scenario_index ?? (matchB ? parseInt(matchB[1], 10) : (b?.dataset_row_index ?? 0));
        return rA - rB;
      });

      const firstRun = runs[0];
      const createdDate = firstRun?.created_at ? new Date(firstRun.created_at) : new Date();
      const timeStr = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dateStr = createdDate.toLocaleDateString([], { month: 'short', day: 'numeric' });

      const totalRowsCount = runs.reduce((acc, r) => acc + ((r.runtime_context as any)?.total_rows || 1), 0);

      groups.push({
        id: batchKey,
        isBatch: true,
        title: 'Batch Matrix Run',
        subtitle: `${dateStr} • ${timeStr}`,
        createdAt: firstRun?.created_at || '',
        runs
      });
    });

    // Add standalone single runs
    singleRuns.forEach((exec) => {
      const { title, subtitle } = getHumanRunTitle(exec);
      groups.push({
        id: exec.id,
        isBatch: false,
        title,
        subtitle,
        createdAt: exec.created_at || '',
        runs: [exec]
      });
    });

    // Sort top-level groups by most recent createdAt desc
    groups.sort((a, b) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tB - tA;
    });

    return groups;
  }, [executions]);

  const toggleBatchExpand = (batchId: string) => {
    setExpandedBatchIds((prev) => ({
      ...prev,
      [batchId]: prev[batchId] === undefined ? false : !prev[batchId]
    }));
  };

  const getEventIcon = (eventType: any) => {
    switch (String(eventType)) {
      case 'HTTP_REQUEST':
      case 'HTTP_RESPONSE':
      case 'API_RESPONSE':
        return <Globe className="w-4 h-4 text-blue-600" />;
      case 'AGENT_START':
      case 'AGENT_COMPLETE':
        return <Bot className="w-4 h-4 text-indigo-600" />;
      case 'TOOL_CALL':
      case 'TOOL_RESULT':
        return <Zap className="w-4 h-4 text-amber-600" />;
      case 'HUMAN_APPROVAL_REQUEST':
      case 'HUMAN_APPROVAL_RESPONSE':
        return <UserCheck className="w-4 h-4 text-orange-600" />;
      case 'EMAIL_SENT':
      case 'EMAIL_RECEIVED':
        return <Mail className="w-4 h-4 text-purple-600" />;
      case 'RESULT_CAPTURE':
      case 'VARIABLE_EXTRACT':
        return <Sparkles className="w-4 h-4 text-teal-600" />;
      case 'EVALUATION_RESULT':
        return <Sparkles className="w-4 h-4 text-emerald-600" />;
      default:
        return <Activity className="w-4 h-4 text-slate-500" />;
    }
  };

  const parsedFlowResponses = useMemo(() => {
    const resList = executions.map((r, idx) => {
      let capturedVariables: Record<string, any> = {};

      if ((r as any).steps && (r as any).steps.length > 0) {
        const capStep = (r as any).steps.find((s: any) =>
          s.node_type === 'CAPTURE_RESULT' ||
          (s.node_key && s.node_key.toLowerCase().includes('capture')) ||
          (s.input_data && s.input_data.rules)
        );
        if (capStep && capStep.output_data) {
          if (capStep.output_data.captured_variables) {
            capturedVariables = { ...capStep.output_data.captured_variables };
          } else if (capStep.output_data.response) {
            capturedVariables = typeof capStep.output_data.response === 'object' ? { ...capStep.output_data.response } : { response: capStep.output_data.response };
          } else if (typeof capStep.output_data === 'object') {
            capturedVariables = { ...capStep.output_data };
          }
        }

        const chatUrlStep = (r as any).steps.find((s: any) =>
          s.node_type === 'CHAT_URL_CREATOR' ||
          (s.node_key && s.node_key.toLowerCase().includes('chat_url'))
        );
        if (chatUrlStep && chatUrlStep.output_data) {
          if (chatUrlStep.output_data.chat_url) {
            capturedVariables.chat_url = chatUrlStep.output_data.chat_url;
          }
        }
      }

      if (Object.keys(capturedVariables).length === 0 && r.trace_events) {
        for (const t of r.trace_events) {
          const p = t.raw_payload as any;
          if (p && typeof p === 'object') {
            if (p.captured_variables) {
              capturedVariables = { ...p.captured_variables };
              break;
            }
            if (t.title && t.title.toLowerCase().includes('capture') && p.response) {
              capturedVariables = typeof p.response === 'object' ? { ...p.response } : { response: p.response };
              break;
            }
          }
        }
      }

      if ((r.runtime_context as any)?.captured_variables && Object.keys((r.runtime_context as any).captured_variables).length > 0) {
        capturedVariables = { ...(r.runtime_context as any).captured_variables };
      } else if (Object.keys(capturedVariables).length === 0 && (r.runtime_context as any)?.dataset_vars && typeof (r.runtime_context as any).dataset_vars === 'object') {
        capturedVariables = { ...(r.runtime_context as any).dataset_vars };
      }

      // Check if this execution contains multi-turn steps or traces
      const stepsArr = (r as any).steps || [];
      const tracesArr = r.trace_events || [];
      const turnSteps = stepsArr.filter((s: any) => s.node_key && s.node_key.includes('_turn_'));
      const turnTraces = tracesArr.filter((t: any) => t.title && t.title.includes('(Turn #'));

      if (turnSteps.length > 0 || turnTraces.length > 0) {
        // Collect output for each turn step
        turnSteps.forEach((st: any, sIdx: number) => {
          const matchTurn = st.node_key.match(/_turn_(\d+)/i);
          const tNum = matchTurn ? matchTurn[1] : String(sIdx + 1);
          const varKey = `follow_up_questions_response (Turn #${tNum})`;
          if (st.output_data !== undefined && st.output_data !== null) {
            capturedVariables[varKey] = st.output_data;
          }
        });

        // Also check traces for any turns
        turnTraces.forEach((tr: any) => {
          const matchTurn = tr.title.match(/Turn\s*#?(\d+)/i);
          if (matchTurn) {
            const tNum = matchTurn[1];
            const varKey = `follow_up_questions_response (Turn #${tNum})`;
            if (!capturedVariables[varKey] && tr.raw_payload) {
              capturedVariables[varKey] = tr.raw_payload;
            }
          }
        });

        // Remove the overwritten single variable if multi-turn keys are present
        if (capturedVariables['follow_up_questions_response'] && (capturedVariables['follow_up_questions_response (Turn #1)'] || capturedVariables['follow_up_questions_response_turn_1'])) {
          delete capturedVariables['follow_up_questions_response'];
        }
      }

      const match = (r.correlation_id || '').match(/-s(\d+)-/i) || (r.correlation_id || '').match(/-r(\d+)-/i) || (r.correlation_id || '').match(/row-(\d+)/i) || (r.correlation_id || '').match(/Scenario-(\d+)/i);
      const scenarioNum = (r.runtime_context as any)?.scenario_index
        ? String((r.runtime_context as any).scenario_index)
        : (match ? match[1] : (r.dataset_row_index !== undefined ? String(r.dataset_row_index + 1) : String(idx + 1)));

      const promptMsg = (r.runtime_context as any)?.scenario || (r.runtime_context as any)?.dataset_vars?.message || `Scenario #${scenarioNum}`;
      const followupMsg = (r.runtime_context as any)?.dataset_vars?.followup || '';
      const rawTurns = (r.runtime_context as any)?.turns;
      const turns = Array.isArray(rawTurns) ? rawTurns : [];

        return {
          id: r.id,
          correlation_id: r.correlation_id,
          scenario_index: parseInt(scenarioNum, 10) || idx + 1,
          title: promptMsg,
          followup: followupMsg,
          turns,
          status: r.status || 'PASSED',
          started_at: r.created_at,
          completed_at: r.created_at,
          duration_ms: r.total_duration_ms || 0,
          captured_variables: capturedVariables,
          steps: (r as any).steps || [],
          raw_run: r
        };
      });

      // Sort in ascending scenario index order (Scenario #1, Scenario #2, Scenario #3...)
      resList.sort((a, b) => {
        if (a.scenario_index !== b.scenario_index) {
          return a.scenario_index - b.scenario_index;
        }
        const tA = a.started_at ? new Date(a.started_at).getTime() : 0;
        const tB = b.started_at ? new Date(b.started_at).getTime() : 0;
        return tA - tB;
      });

      return resList;
    }, [executions]);

  const filteredResponses = useMemo(() => {
    if (!responseFilterText.trim()) return parsedFlowResponses;
    const q = responseFilterText.toLowerCase();
    return parsedFlowResponses.filter((r) => {
      if (r.title && r.title.toLowerCase().includes(q)) return true;
      if (r.followup && r.followup.toLowerCase().includes(q)) return true;
      if (r.captured_variables) {
        const varsStr = JSON.stringify(r.captured_variables).toLowerCase();
        if (varsStr.includes(q)) return true;
      }
      return false;
    });
  }, [parsedFlowResponses, responseFilterText]);

  const activeResponseRun = useMemo(() => {
    if (selectedResponseRunId) {
      const found = parsedFlowResponses.find((r) => r.id === selectedResponseRunId);
      if (found) return found;
    }
    if (selectedExecution) {
      const found = parsedFlowResponses.find((r) => r.id === selectedExecution.id);
      if (found) return found;
    }
    return parsedFlowResponses[0] || null;
  }, [parsedFlowResponses, selectedResponseRunId, selectedExecution]);

  // Group responses by parent batch matching Live Traces tab
  const groupedResponseRuns = useMemo(() => {
    return groupedExecutions.map((group) => {
      const groupRunIds = new Set(group.runs.map((r) => r.id));
      const groupResponseItems = filteredResponses.filter((resp) => groupRunIds.has(resp.id));
      return {
        ...group,
        responseItems: groupResponseItems
      };
    }).filter((g) => g.responseItems.length > 0);
  }, [groupedExecutions, filteredResponses]);

  const renderCleanResponseValue = (val: any) => {
    if (val === null || val === undefined) {
      return <span className="text-slate-400 italic">No output captured</span>;
    }

    let candidateText = '';
    let metaProps: Record<string, any> = {};
    let userDocs: any[] = [];
    let buDocs: any[] = [];
    let groupDocs: any[] = [];
    let citations: any[] = [];

    const ingestDocSources = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj.user_docs)) userDocs = obj.user_docs;
      if (Array.isArray(obj.bu_docs)) buDocs = obj.bu_docs;
      if (Array.isArray(obj.group_docs)) groupDocs = obj.group_docs;
      if (Array.isArray(obj.citations)) citations = obj.citations;
      if (Array.isArray(obj.sources)) citations = obj.sources;
      if (Array.isArray(obj.docs)) citations = obj.docs;
    };

    if (typeof val === 'object') {
      ingestDocSources(val);
      if (typeof val.response === 'string') {
        candidateText = val.response;
        metaProps = { ...val };
        delete metaProps.response;
      } else if (typeof val.content === 'string') {
        candidateText = val.content;
        metaProps = { ...val };
        delete metaProps.content;
      } else if (typeof val.answer === 'string') {
        candidateText = val.answer;
        metaProps = { ...val };
        delete metaProps.answer;
      } else {
        candidateText = JSON.stringify(val, null, 2);
      }
    } else {
      candidateText = String(val);
    }

    // Try parsing if candidateText is a JSON string
    try {
      if (candidateText.trim().startsWith('{') || candidateText.trim().startsWith('[')) {
        const parsed = JSON.parse(candidateText);
        if (parsed && typeof parsed === 'object') {
          ingestDocSources(parsed);
          if (parsed.answer && typeof parsed.answer === 'string') {
            candidateText = parsed.answer;
            Object.assign(metaProps, parsed);
            delete metaProps.answer;
          } else if (parsed.response && typeof parsed.response === 'string') {
            candidateText = parsed.response;
            Object.assign(metaProps, parsed);
            delete metaProps.response;
          }
        }
      }
    } catch { }

    delete metaProps.user_docs;
    delete metaProps.bu_docs;
    delete metaProps.group_docs;
    delete metaProps.citations;
    delete metaProps.sources;
    delete metaProps.docs;

    // Check if candidateText is an HTML report
    const isHtmlReport = typeof candidateText === 'string' && (
      candidateText.trim().toLowerCase().startsWith('<!doctype html') ||
      candidateText.trim().toLowerCase().startsWith('<html') ||
      (candidateText.includes('<head') && candidateText.includes('<body')) ||
      (candidateText.includes('<style') && candidateText.includes('</style>')) ||
      (candidateText.includes('<div') && (candidateText.includes('class=') || candidateText.includes('style=')))
    );

    if (isHtmlReport) {
      return (
        <div className="w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-white">
          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold text-slate-800">Visual HTML Report</span>
              <span className="text-[10px] text-slate-400 font-mono">({(candidateText.length / 1024).toFixed(1)} KB)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const blob = new Blob([candidateText], { type: 'text/html;charset=utf-8' });
                  const url = URL.createObjectURL(blob);
                  window.open(url, '_blank');
                }}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 px-3 py-1 rounded-lg border border-teal-200 transition-colors cursor-pointer"
                title="Open report in new browser tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open in Full Screen Tab</span>
              </button>
            </div>
          </div>
          <iframe
            srcDoc={candidateText}
            title="HTML Report"
            className="w-full min-h-[750px] h-[850px] border-0 bg-white"
            sandbox="allow-same-origin allow-scripts allow-popups"
          />
        </div>
      );
    }

    // Helper to resolve citation tags like "U1", "U2", "B1", "G1", "1"
    const resolveCitation = (tag: string) => {
      const cleanTag = tag.trim().toUpperCase();
      let docUrl = '';
      let docName = `Source ${cleanTag}`;
      let pageNum: number | string = '';

      if (cleanTag.startsWith('U')) {
        const idx = parseInt(cleanTag.slice(1), 10) - 1;
        if (userDocs[idx]) {
          docUrl = userDocs[idx].document_blob_url || userDocs[idx].url || userDocs[idx].blob_url || '';
          docName = userDocs[idx].document_name || userDocs[idx].name || `User Document #${idx + 1}`;
          pageNum = userDocs[idx].page_number ?? '';
        }
      } else if (cleanTag.startsWith('B')) {
        const idx = parseInt(cleanTag.slice(1), 10) - 1;
        if (buDocs[idx]) {
          docUrl = buDocs[idx].document_blob_url || buDocs[idx].url || '';
          docName = buDocs[idx].document_name || `BU Document #${idx + 1}`;
          pageNum = buDocs[idx].page_number ?? '';
        }
      } else if (cleanTag.startsWith('G')) {
        const idx = parseInt(cleanTag.slice(1), 10) - 1;
        if (groupDocs[idx]) {
          docUrl = groupDocs[idx].document_blob_url || groupDocs[idx].url || '';
          docName = groupDocs[idx].document_name || `Group Document #${idx + 1}`;
          pageNum = groupDocs[idx].page_number ?? '';
        }
      } else {
        const num = parseInt(cleanTag, 10);
        const idx = !isNaN(num) ? num - 1 : -1;
        if (idx >= 0 && userDocs[idx]) {
          docUrl = userDocs[idx].document_blob_url || userDocs[idx].url || '';
          docName = userDocs[idx].document_name || `Document #${idx + 1}`;
          pageNum = userDocs[idx].page_number ?? '';
        } else if (idx >= 0 && citations[idx]) {
          docUrl = citations[idx].url || citations[idx].document_blob_url || '';
          docName = citations[idx].document_name || citations[idx].title || `Citation #${idx + 1}`;
          pageNum = citations[idx].page_number || citations[idx].page || '';
        }
      }

      const tooltip = pageNum ? `${docName} (Page ${pageNum})` : docName;
      return { tag: cleanTag, url: docUrl, name: docName, pageNum, tooltip };
    };

    // Helper to render text with inline citation pill badges (matching Image 1)
    const renderInlineCitations = (rawText: string) => {
      // Regex matches: [U1], [U2], [B1], [G1], [1], [label](url), or raw https:// URLs
      const tokenRegex = /(\[([UBGubg]?\d+)\])|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s\),]+)/g;
      const elements: React.ReactNode[] = [];
      let lastPos = 0;
      let m;

      while ((m = tokenRegex.exec(rawText)) !== null) {
        if (m.index > lastPos) {
          elements.push(rawText.substring(lastPos, m.index));
        }

        if (m[1]) {
          // Citation tag: e.g. [U1], [U2]
          const tag = m[2];
          const info = resolveCitation(tag);

          elements.push(
            <a
              key={m.index}
              href={info.url || '#'}
              target={info.url ? '_blank' : undefined}
              rel="noopener noreferrer"
              onClick={(e) => {
                if (!info.url) {
                  e.preventDefault();
                  alert(`Citation [${info.tag}]:\n${info.tooltip}`);
                }
              }}
              className="inline-flex items-center gap-1 mx-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#E8F8F5] text-[#00A884] border border-[#B7ECE2] hover:bg-[#D1F2EB] hover:border-[#85DFD0] transition-all cursor-pointer shadow-2xs group align-baseline"
              title={info.tooltip}
            >
              <Link2 className="w-3 h-3 text-[#00A884] group-hover:scale-110 transition-transform" />
              <span>{info.tag}</span>
            </a>
          );
        } else if (m[3]) {
          // Markdown link: [label](url)
          const label = m[4];
          const url = m[5];
          elements.push(
            <a
              key={m.index}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mx-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-all cursor-pointer shadow-2xs"
              title={url}
            >
              <span>📄 {label}</span>
            </a>
          );
        } else if (m[6]) {
          // Raw URL
          const url = m[6];
          elements.push(
            <a
              key={m.index}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-600 hover:text-teal-800 underline break-all mx-0.5 text-xs font-mono"
            >
              {url}
            </a>
          );
        }

        lastPos = m.index + m[0].length;
      }

      if (lastPos < rawText.length) {
        elements.push(rawText.substring(lastPos));
      }

      return elements.length > 0 ? elements : rawText;
    };

    // Parse structured paragraphs and bullet lists
    const lines = candidateText.split('\n');
    const renderedBlocks: React.ReactNode[] = [];

    lines.forEach((line, lIdx) => {
      const trimmed = line.trim();
      if (!trimmed) {
        // Empty line spacing
        renderedBlocks.push(<div key={`sp-${lIdx}`} className="h-2" />);
        return;
      }

      // Check for numbered section headings: "1. Work model and culture" or "1) Work model..."
      const numberedMatch = trimmed.match(/^(\d+)[\.\)]\s+(.*)$/);
      if (numberedMatch) {
        const num = numberedMatch[1];
        const headingText = numberedMatch[2];
        renderedBlocks.push(
          <div key={`h-${lIdx}`} className="flex items-baseline gap-2 font-bold text-slate-800 text-[13px] mt-3 mb-1">
            <span className="font-bold text-slate-900 font-mono">{num}.</span>
            <span>{renderInlineCitations(headingText)}</span>
          </div>
        );
        return;
      }

      // Check for bullet items: "- Delphi believes..." or "* Delphi believes..." or "• ..."
      const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
      if (bulletMatch) {
        const itemText = bulletMatch[1];
        renderedBlocks.push(
          <div key={`b-${lIdx}`} className="flex items-start gap-2 pl-4 text-xs text-slate-700 leading-relaxed my-1">
            <span className="text-slate-400 font-bold mt-0.5 shrink-0">•</span>
            <div className="flex-1">{renderInlineCitations(itemText)}</div>
          </div>
        );
        return;
      }

      // Standard paragraph text
      renderedBlocks.push(
        <div key={`p-${lIdx}`} className="text-xs text-slate-700 leading-relaxed my-1">
          {renderInlineCitations(line)}
        </div>
      );
    });

    const hasMeta = Object.keys(metaProps).length > 0;

    return (
      <div className="space-y-3 font-sans">
        {hasMeta && (
          <div className="flex flex-wrap items-center gap-1.5 pb-2 border-b border-slate-100">
            {Object.entries(metaProps).map(([mK, mV]) => {
              if (mV === null || mV === undefined || typeof mV === 'object') return null;
              return (
                <span key={mK} className="inline-flex items-center gap-1 text-[11px] font-mono bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md border border-slate-200">
                  <strong className="text-slate-900">{mK}:</strong>
                  <span className="truncate max-w-[200px]" title={String(mV)}>{String(mV)}</span>
                </span>
              );
            })}
          </div>
        )}

        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs space-y-1 select-text">
          {renderedBlocks}

          {/* Bottom Chat Assistant Action Bar (matching frontend Image 1) */}
          <div className="flex items-center gap-3 pt-3.5 mt-3 border-t border-slate-100 text-slate-400">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(candidateText);
                alert('Copied response text to clipboard!');
              }}
              className="p-1 rounded hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer"
              title="Copy Response"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1 rounded hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer"
              title="Good Response"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1 rounded hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer"
              title="Bad Response"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1 rounded hover:bg-slate-100 hover:text-slate-700 transition-all cursor-pointer"
              title="Regenerate / Re-run"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between pb-1 flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-slate-900 font-display">Result Capture & Traces</h1>

          <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('responses')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg transition-all cursor-pointer ${activeTab === 'responses'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200 font-bold'
                : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              <FileCode className="w-3.5 h-3.5 text-teal-600" />
              <span>View Responses</span>
              {parsedFlowResponses.length > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-teal-100 text-teal-800 font-mono font-bold">
                  {parsedFlowResponses.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('traces')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg transition-all cursor-pointer ${activeTab === 'traces'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200 font-bold'
                : 'text-slate-500 hover:text-slate-800'
                }`}
            >
              <Activity className="w-3.5 h-3.5 text-blue-600" />
              <span>Live Traces & Steps</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsExcelModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition-all cursor-pointer shadow-2xs group"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
            <span>Export Excel Report</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSwarmModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold transition-all cursor-pointer shadow-2xs group"
          >
            <Bot className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform" />
            <span>Agent Swarm Graph</span>
          </button>
        </div>
      </div>

      {activeTab === 'responses' && (
        <div style={{ height: '740px' }} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-600">
                <FileCode className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900 leading-tight">
                    Captured Flow Responses
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-teal-50 text-teal-700 border border-teal-200">
                    {parsedFlowResponses.length} Flow Runs Recorded
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Inspecting live variables and formatted JSON/HTML payloads captured from Capture Result nodes
                </p>
              </div>
            </div>
          </div>

          {parsedFlowResponses.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600 mb-3 shadow-2xs">
                <FileCode className="w-7 h-7" />
              </div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">No Flow Runs Recorded Yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mb-4">
                Execute your workflow on Matrix or click Execute to capture live API responses and inspect them here.
              </p>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-12 overflow-hidden">
              <div className="col-span-4 border-r border-slate-200 bg-slate-50/60 flex flex-col overflow-hidden">
                <div className="p-3 border-b border-slate-200 bg-white shrink-0">
                  <div className="relative flex items-center w-full">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 z-10 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search scenario or query..."
                      value={responseFilterText}
                      onChange={(e) => setResponseFilterText(e.target.value)}
                      style={{ paddingLeft: '36px', paddingRight: '12px' }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-100 transition-all shadow-2xs"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                  {groupedResponseRuns.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      No matching responses found.
                    </div>
                  ) : (
                    groupedResponseRuns.map((group) => {
                      if (group.isBatch) {
                        const isExpanded = expandedBatchIds[group.id] !== false;
                        const hasSelectedChild = group.responseItems.some(
                          (r) => r.id === (activeResponseRun?.id || parsedFlowResponses[0]?.id)
                        );

                        return (
                          <div key={group.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-2xs">
                            {/* Parent Batch Header */}
                            <div
                              className={`p-2.5 px-3 bg-slate-50/90 hover:bg-slate-100/90 transition-all cursor-pointer flex items-center justify-between border-b border-slate-100 ${
                                hasSelectedChild ? 'bg-teal-50/40' : ''
                              }`}
                              onClick={() => toggleBatchExpand(group.id)}
                            >
                              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                )}
                                <FolderOpen className="w-4 h-4 text-teal-600 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-bold text-slate-900 truncate">
                                      {group.title}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {group.subtitle}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-teal-50 text-teal-700 border border-teal-200">
                                  {group.responseItems.length} {group.responseItems.length === 1 ? 'Scenario' : 'Scenarios'}
                                </span>
                              </div>
                            </div>

                            {/* Batch Child Scenarios */}
                            {isExpanded && (
                              <div className="p-2 space-y-2 bg-slate-50/40">
                                {group.responseItems.map((runItem) => {
                                  const isSelected = runItem.id === (activeResponseRun?.id || parsedFlowResponses[0]?.id);
                                  const varCount = Object.keys(runItem.captured_variables || {}).length;

                                  return (
                                    <div
                                      key={runItem.id}
                                      onClick={() => {
                                        setSelectedResponseRunId(runItem.id);
                                        onSelectExecution(runItem.id);
                                      }}
                                      className={`p-2.5 rounded-xl border-2 transition-all cursor-pointer space-y-1 ${
                                        isSelected
                                          ? 'bg-white border-teal-600 ring-2 ring-teal-100 shadow-sm'
                                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200">
                                          Scenario #{runItem.scenario_index}
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[10px] text-slate-400 font-mono">
                                            ⚡ {Math.round(runItem.duration_ms || 0)}ms
                                          </span>
                                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                            {runItem.status || 'PASSED'}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="text-xs font-bold text-slate-900 line-clamp-1">
                                        {runItem.title}
                                      </div>

                                      {runItem.followup && (
                                        <div className="text-[11px] text-slate-500 line-clamp-1 font-mono">
                                          ↳ {runItem.followup}
                                        </div>
                                      )}

                                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
                                        <span>📦 {varCount} {varCount === 1 ? 'variable' : 'variables'} captured</span>
                                        {runItem.started_at && (
                                          <span>{new Date(runItem.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }

                      // Standalone single run
                      const runItem = group.responseItems[0];
                      if (!runItem) return null;
                      const isSelected = runItem.id === (activeResponseRun?.id || parsedFlowResponses[0]?.id);
                      const varCount = Object.keys(runItem.captured_variables || {}).length;

                      return (
                        <div
                          key={runItem.id}
                          onClick={() => {
                            setSelectedResponseRunId(runItem.id);
                            onSelectExecution(runItem.id);
                          }}
                          className={`p-3 rounded-xl border-2 transition-all cursor-pointer space-y-1.5 shadow-2xs ${
                            isSelected
                              ? 'bg-white border-teal-600 ring-2 ring-teal-100'
                              : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200">
                              Scenario #{runItem.scenario_index}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-slate-400 font-mono font-semibold">
                                ⚡ {Math.round(runItem.duration_ms || 0)}ms
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                {runItem.status || 'PASSED'}
                              </span>
                            </div>
                          </div>

                          <div className="text-xs font-bold text-slate-900 line-clamp-1">
                            {runItem.title}
                          </div>

                          {runItem.followup && (
                            <div className="text-[11px] text-slate-500 line-clamp-1 font-mono">
                              ↳ {runItem.followup}
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
                            <span>📦 {varCount} {varCount === 1 ? 'variable' : 'variables'} captured</span>
                            {runItem.started_at && (
                              <span>{new Date(runItem.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="col-span-8 bg-slate-100/50 flex flex-col overflow-hidden">
                {activeResponseRun ? (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="p-3.5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
                      <div className="min-w-0 flex-1 pr-3">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold text-slate-900 font-display">
                            Scenario #{activeResponseRun.scenario_index}: {activeResponseRun.title}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {activeResponseRun.status}
                          </span>
                          {Array.isArray(activeResponseRun.turns) && activeResponseRun.turns.length > 1 && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200">
                              {activeResponseRun.turns.length} Turns
                            </span>
                          )}
                        </div>
                        {Array.isArray(activeResponseRun.turns) && activeResponseRun.turns.length > 1 ? (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {activeResponseRun.turns.map((turn: any, tIdx: number) => {
                              const q = turn?.followup || turn?.message || (typeof turn === 'object' ? Object.values(turn)[0] : String(turn)) || `Turn #${tIdx + 1}`;
                              return (
                                <span key={tIdx} className="text-[10px] font-mono px-2 py-0.5 bg-slate-100 rounded-md text-slate-700 border border-slate-200 truncate max-w-xs" title={String(q)}>
                                  <strong>T{tIdx + 1}:</strong> {String(q)}
                                </span>
                              );
                            })}
                          </div>
                        ) : activeResponseRun.followup ? (
                          <p className="text-[11px] text-slate-500 font-mono truncate">
                            Followup Query: {activeResponseRun.followup}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Expand / Collapse All Variables Button */}
                        {activeResponseRun.captured_variables && Object.keys(activeResponseRun.captured_variables).length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleAllResponseVars(activeResponseRun.id, Object.keys(activeResponseRun.captured_variables))}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition-all border border-slate-200"
                            title={Object.keys(activeResponseRun.captured_variables).every(vk => !!expandedResponseVars[`${activeResponseRun.id}_${vk}`]) ? "Collapse All Variables" : "Expand All Variables"}
                          >
                            {Object.keys(activeResponseRun.captured_variables).every(vk => !!expandedResponseVars[`${activeResponseRun.id}_${vk}`]) ? (
                              <>
                                <ChevronUp className="w-3.5 h-3.5" />
                                <span>Collapse All</span>
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-3.5 h-3.5" />
                                <span>Expand All</span>
                              </>
                            )}
                          </button>
                        )}

                        <div className="inline-flex rounded-lg p-0.5 bg-slate-100 border border-slate-200 text-xs font-bold">
                          <button
                            type="button"
                            onClick={() => setResponseFormatMode('clean')}
                            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${responseFormatMode === 'clean'
                              ? 'bg-slate-900 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                              }`}
                          >
                            ✨ Clean HTML/Text
                          </button>
                          <button
                            type="button"
                            onClick={() => setResponseFormatMode('json')}
                            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${responseFormatMode === 'json'
                              ? 'bg-slate-900 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                              }`}
                          >
                            📦 Formatted JSON
                          </button>
                          <button
                            type="button"
                            onClick={() => setResponseFormatMode('raw')}
                            className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${responseFormatMode === 'raw'
                              ? 'bg-slate-900 text-white shadow-2xs'
                              : 'text-slate-600 hover:text-slate-900'
                              }`}
                          >
                            📄 Raw
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(activeResponseRun.captured_variables, null, 2));
                            alert('Copied scenario captured payload to clipboard!');
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-all cursor-pointer"
                          title="Copy JSON Payload"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4">
                      {!activeResponseRun.captured_variables || typeof activeResponseRun.captured_variables !== 'object' || Object.keys(activeResponseRun.captured_variables).length === 0 ? (
                        <div className="p-8 text-center bg-white rounded-xl border border-slate-200 space-y-2">
                          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
                          <h4 className="text-xs font-bold text-slate-800">No Variables Captured in this Run</h4>
                          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                            Ensure your workflow contains a <strong>Capture Result</strong> node with extraction rules configured.
                          </p>
                        </div>
                      ) : (
                        Object.entries(activeResponseRun.captured_variables).map(([varName, varVal], vIdx) => {
                          const strVal = typeof varVal === 'object' ? JSON.stringify(varVal, null, 2) : String(varVal);
                          const varKey = `${activeResponseRun.id}_${varName}`;
                          const isExpanded = !!expandedResponseVars[varKey];

                          const valLength = strVal.length;
                          const sizeBadge = valLength > 1024
                            ? `${(valLength / 1024).toFixed(1)} KB`
                            : `${valLength} chars`;

                          const previewSnippet = strVal
                            .replace(/<[^>]+>/g, ' ')
                            .replace(/\s+/g, ' ')
                            .trim()
                            .slice(0, 110);

                          return (
                            <div
                              key={varName}
                              className={`bg-white rounded-2xl border-2 transition-all shadow-2xs ${
                                isExpanded
                                  ? 'border-teal-300 ring-2 ring-teal-100 p-4 space-y-3'
                                  : 'border-slate-200 hover:border-teal-200 p-3.5'
                              }`}
                            >
                              {/* Clickable Header for Collapsing / Expanding */}
                              <div
                                className={`flex items-center justify-between gap-2 cursor-pointer select-none ${
                                  isExpanded ? 'border-b border-slate-100 pb-2.5' : ''
                                }`}
                                onClick={() => toggleResponseVar(varKey)}
                              >
                                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleResponseVar(varKey);
                                    }}
                                    className={`p-1 rounded-lg transition-colors cursor-pointer ${
                                      isExpanded ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                    }`}
                                    title={isExpanded ? "Collapse response" : "Expand response"}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </button>

                                  <span className="w-5 h-5 shrink-0 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center font-mono">
                                    {vIdx + 1}
                                  </span>

                                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 font-mono text-xs font-bold shrink-0">
                                    <span>{"{{"}</span>
                                    <span>{varName}</span>
                                    <span>{"}}"}</span>
                                  </div>

                                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 shrink-0">
                                    {sizeBadge}
                                  </span>

                                  {!isExpanded && (
                                    <span className="text-xs text-slate-400 font-mono truncate hidden md:inline-block ml-1">
                                      {previewSnippet || 'Empty payload'}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(strVal);
                                      alert(`Copied {{${varName}}} to clipboard!`);
                                    }}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-xs font-semibold cursor-pointer transition-colors"
                                    title="Copy variable content"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copy</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => toggleResponseVar(varKey)}
                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                                      isExpanded
                                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        : 'bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200'
                                    }`}
                                  >
                                    {isExpanded ? (
                                      <>
                                        <ChevronUp className="w-3.5 h-3.5" />
                                        <span>Collapse</span>
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="w-3.5 h-3.5" />
                                        <span>Expand</span>
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>

                              {/* Expanded Content View */}
                              {isExpanded && (
                                <div className="space-y-3 pt-1">
                                  {responseFormatMode === 'clean' ? (
                                    <div className="max-h-[600px] overflow-y-auto pr-1">
                                      {renderCleanResponseValue(varVal)}
                                    </div>
                                  ) : responseFormatMode === 'json' ? (
                                    <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 p-3 text-emerald-400 font-mono text-xs max-h-[600px] overflow-y-auto">
                                      <pre className="whitespace-pre-wrap select-text leading-relaxed font-mono">
                                        {typeof varVal === 'object' ? JSON.stringify(varVal, null, 2) : strVal}
                                      </pre>
                                    </div>
                                  ) : (
                                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-slate-800 font-mono text-xs whitespace-pre-wrap max-h-[600px] overflow-y-auto select-text">
                                      {strVal}
                                    </div>
                                  )}

                                  {/* Bottom Collapse Helper */}
                                  <div className="pt-2 border-t border-slate-100 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => toggleResponseVar(varKey)}
                                      className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 px-2 py-1 rounded-md transition-colors cursor-pointer"
                                    >
                                      <ChevronUp className="w-3 h-3" />
                                      <span>Collapse {`{{${varName}}}`}</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400 text-xs">
                    Select a scenario on the left to inspect its captured response
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'traces' && (
        <div className="h-[740px] grid grid-cols-12 gap-4">
          {/* Left Column: Execution Runs List (Col 1-3, 25% width) */}
          <div className="col-span-3 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Execution Runs ({executions.length})
                </h3>
              </div>

              {executions.length > 0 && onClearHistory && (
                <button
                  onClick={onClearHistory}
                  className="flex items-center gap-1 text-[11px] font-bold text-rose-600 hover:text-rose-800 px-2 py-0.5 rounded-lg hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all cursor-pointer"
                  title="Clear all execution history"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {executions.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No executions recorded in this project.
                </div>
              ) : (
                groupedExecutions.map((group) => {
                  if (group.isBatch) {
                    const isExpanded = expandedBatchIds[group.id] !== false;
                    const hasSelectedChild = group.runs.some((r) => r.id === selectedExecution?.id);

                    return (
                      <div key={group.id} className="border-b border-slate-100">
                        {/* Parent Batch Header */}
                        <div
                          className={`p-3 bg-slate-50/80 hover:bg-slate-100/90 transition-all cursor-pointer ${
                            hasSelectedChild ? 'bg-indigo-50/40' : ''
                          }`}
                          onClick={() => toggleBatchExpand(group.id)}
                        >
                          {/* Top Row: Folder Icon + Title + Badge + Delete */}
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              )}
                              <FolderOpen className="w-4 h-4 text-indigo-600 shrink-0" />
                              <span className="text-xs font-bold text-slate-900 truncate">
                                {group.title}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                {group.runs.length} {group.runs.length === 1 ? 'Scenario' : 'Scenarios'}
                              </span>
                              {onDeleteExecution && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Delete all ${group.runs.length} runs in this batch?`)) {
                                      group.runs.forEach((r) => onDeleteExecution(r.id));
                                    }
                                  }}
                                  className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-all cursor-pointer"
                                  title="Delete Batch"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Subtitle Row: Timestamp */}
                          <div className="text-[10px] font-mono text-slate-400 pl-6 mt-1 truncate">
                            {group.subtitle}
                          </div>
                        </div>

                        {/* Child Scenarios List */}
                        {isExpanded && (
                          <div className="bg-slate-50/30 pl-3 divide-y divide-slate-100 border-t border-slate-100">
                            {group.runs.map((exec) => {
                              const isSelected = exec.id === selectedExecution?.id;
                              const { title } = getHumanRunTitle(exec);

                              return (
                                <div
                                  key={exec.id}
                                  onClick={() => onSelectExecution(exec.id)}
                                  className={`p-2.5 text-xs transition-all flex items-center justify-between gap-2 cursor-pointer ${
                                    isSelected
                                      ? 'bg-white text-indigo-950 font-bold border-l-4 border-indigo-600 shadow-2xs'
                                      : 'hover:bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${exec.status === 'PASSED' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                    <div className="min-w-0 flex-1">
                                      <div className="font-semibold text-slate-900 truncate" title={title}>
                                        {title}
                                      </div>
                                      <span className="text-[10px] text-slate-400 font-mono block">
                                        ⏱️ {Math.round(exec.total_duration_ms || 0)}ms
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1 shrink-0">
                                    <StatusBadge status={exec.status as any} />
                                    {onDeleteExecution && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (window.confirm('Delete this scenario run?')) {
                                            onDeleteExecution(exec.id);
                                          }
                                        }}
                                        className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-all cursor-pointer"
                                        title="Delete Scenario"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  }

                  const exec = group.runs[0];
                  const isSelected = exec.id === selectedExecution?.id;

                  return (
                    <div
                      key={exec.id}
                      onClick={() => onSelectExecution(exec.id)}
                      className={`p-3 text-xs transition-all flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/70 text-indigo-950 font-bold border-l-4 border-indigo-600 shadow-2xs'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 truncate">
                          {group.title}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {group.subtitle}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <StatusBadge status={exec.status as any} />
                        {onDeleteExecution && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm('Delete this execution?')) {
                                onDeleteExecution(exec.id);
                              }
                            }}
                            className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600 transition-all cursor-pointer"
                            title="Delete Execution"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Middle Column: Step Traces List (Col 4-7, 33% width) */}
          <div className="col-span-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 truncate" title={selectedExecution ? getHumanRunTitle(selectedExecution).title : 'Execution Steps'}>
                  {selectedExecution ? getHumanRunTitle(selectedExecution).title : 'Execution Steps'}
                </h3>
              </div>
              {selectedExecution && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-mono text-slate-500">
                    ⏱️ {Math.round(selectedExecution.total_duration_ms || 0)}ms
                  </span>
                  <StatusBadge status={selectedExecution.status as any} />
                </div>
              )}
            </div>

            <div className="flex-1 p-3.5 overflow-y-auto space-y-2.5 bg-slate-50/40">
              {!selectedExecution ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  Select an execution run from the left panel to inspect its execution steps and trace events.
                </div>
              ) : !selectedExecution.trace_events || selectedExecution.trace_events.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  No trace events recorded for this execution.
                </div>
              ) : (
                selectedExecution.trace_events.map((event, idx) => {
                  const isSelected = selectedTraceEvent?.id === event.id;

                  return (
                    <div
                      key={event.id || idx}
                      onClick={() => setSelectedTraceEvent(event)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2 ${
                        isSelected
                          ? 'bg-white border-blue-600 ring-2 ring-blue-100 shadow-sm'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
                            {getEventIcon(event.event_type)}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-slate-900">
                              {formatTraceTitle(event.title)}
                            </h4>
                            <span className="text-[10px] font-mono text-slate-400 uppercase">
                              STEP #{idx + 1} • {event.event_type}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-500">
                            {event.duration_ms}ms
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            event.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                          }`}>
                            {event.status}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Payload & Response Inspector (Col 8-12, 42% width) */}
          <div className="col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Payload & Response
                </h3>
              </div>
              {selectedTraceEvent && (
                <div className="flex gap-1 text-[11px]">
                  <button
                    onClick={() => setPayloadViewMode('normalized')}
                    className={`px-2.5 py-0.5 rounded-lg font-bold transition-all cursor-pointer ${
                      payloadViewMode === 'normalized' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    Normalized
                  </button>
                  <button
                    onClick={() => setPayloadViewMode('raw')}
                    className={`px-2.5 py-0.5 rounded-lg font-bold transition-all cursor-pointer ${
                      payloadViewMode === 'raw' ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    Raw
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {selectedTraceEvent ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-100">
                    <span className="font-bold text-slate-800">
                      {formatTraceTitle(selectedTraceEvent.title)}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      selectedTraceEvent.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                      {selectedTraceEvent.duration_ms}ms • {selectedTraceEvent.status}
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-900 p-3.5 overflow-x-auto text-xs font-mono">
                    <pre className="text-emerald-400 leading-relaxed">
                      {JSON.stringify(
                        payloadViewMode === 'normalized'
                          ? selectedTraceEvent.normalized_payload
                          : selectedTraceEvent.raw_payload,
                        null,
                        2
                      )}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-slate-400 text-xs">
                  Select a trace step on the left to inspect its JSON request & response payload.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Excel Report Builder & Template Studio Modal */}
      <ExcelReportModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        projectId={projectId}
        projectName={projectName}
        executions={executions}
        groupedExecutions={groupedExecutions}
        selectedExecution={selectedExecution}
        correlationId={selectedExecution?.correlation_id}
      />

      {/* Multi-Agent Swarm Inspector & Contract Graph Modal */}
      <SwarmInspectorModal
        isOpen={isSwarmModalOpen}
        executionId={selectedExecution?.id || (executions.length > 0 ? executions[0].id : '')}
        executionCorrelationId={selectedExecution?.correlation_id}
        onClose={() => setIsSwarmModalOpen(false)}
      />
    </div>
  );
};
