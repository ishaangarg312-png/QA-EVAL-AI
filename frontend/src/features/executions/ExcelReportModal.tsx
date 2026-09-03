import React, { useState, useEffect, useMemo } from 'react';
import {
  FileSpreadsheet,
  Download,
  Save,
  RotateCcw,
  CheckSquare,
  Square,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Settings2,
  CheckCircle2,
  X,
  Eye,
  Sliders,
  GitMerge,
  Table as TableIcon,
  FolderOpen,
  ExternalLink,
  Link
} from 'lucide-react';
import { ExecutionRun, ProjectReportTemplate, ReportColumnConfig } from '../../types';
import { api } from '../../services/api';

interface ExcelReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  projectName?: string;
  executions: ExecutionRun[];
  groupedExecutions?: {
    id: string;
    isBatch: boolean;
    title: string;
    subtitle: string;
    createdAt: string;
    runs: ExecutionRun[];
  }[];
  selectedExecution?: ExecutionRun | null;
  correlationId?: string;
}

const DEFAULT_STANDARD_COLUMNS: ReportColumnConfig[] = [
  { id: 'scenario_index', label: 'Scenario #', enabled: true, category: 'metadata', merge_rule: 'by_scenario', description: 'Scenario sequence number' },
  { id: 'title', label: 'Scenario Title / Prompt', enabled: true, category: 'metadata', merge_rule: 'by_scenario', description: 'Initial prompt or test case scenario title' },
  { id: 'input_message', label: 'Initial Message', enabled: true, category: 'input', merge_rule: 'by_scenario', description: 'Initial query sent to agent' },
  { id: 'response_message', label: 'Initial Response', enabled: true, category: 'output', merge_rule: 'by_scenario', description: 'Response captured from initial node' },
  { id: 'input_followup', label: 'Follow-up Question', enabled: true, category: 'input', merge_rule: 'none', description: 'Follow-up question (automatically expands row-wise)' },
  { id: 'response_followup', label: 'Follow-up Response', enabled: true, category: 'output', merge_rule: 'none', description: 'Response captured from follow-up node (automatically expands row-wise)' },
  { id: 'chat_url', label: 'Chat Session URL', enabled: true, category: 'output', merge_rule: 'by_scenario', description: 'Generated Dynamic Chat URL (Base URL + Session Query)' },
  { id: 'status', label: 'Execution Status', enabled: true, category: 'metadata', merge_rule: 'by_scenario', description: 'PASSED / FAILED / RUNNING' },
  { id: 'duration_ms', label: 'Latency (ms)', enabled: true, category: 'metadata', merge_rule: 'by_scenario', description: 'Total execution runtime in milliseconds' },
  { id: 'started_at', label: 'Executed Timestamp', enabled: true, category: 'metadata', merge_rule: 'by_scenario', description: 'Time execution started' },
];

const cleanPayloadText = (val: any): string => {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if (val.answer !== undefined && val.answer !== null) return cleanPayloadText(val.answer);
    if (val.response !== undefined && val.response !== null) return cleanPayloadText(val.response);
    if (val.output !== undefined && val.output !== null) return cleanPayloadText(val.output);
    if (val.result !== undefined && val.result !== null) return cleanPayloadText(val.result);
    if (val.content !== undefined && val.content !== null) return cleanPayloadText(val.content);
    if (val.text !== undefined && val.text !== null) return cleanPayloadText(val.text);
    if (val.message !== undefined && typeof val.message === 'string') return val.message;
    try {
      return JSON.stringify(val, null, 2);
    } catch {
      return String(val);
    }
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object' && parsed !== null) {
          return cleanPayloadText(parsed);
        }
      } catch {}
    }
    // Regex unwrap fallback for {"answer": "...", ...}
    const m = trimmed.match(/["'](?:answer|response|content|text|output)["']\s*:\s*["'](.*?)["']\s*(?:,|\}|$)/s);
    if (m && m[1]) {
      return m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t').trim();
    }
    return trimmed;
  }
  return String(val);
};

export const ExcelReportModal: React.FC<ExcelReportModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName = 'AI Agent QA Project',
  executions,
  groupedExecutions,
  selectedExecution,
  correlationId,
}) => {
  const [selectedScope, setSelectedScope] = useState<string>('all');
  const [activeView, setActiveView] = useState<'config' | 'preview'>('config');
  const [previewTab, setPreviewTab] = useState<'scenarios' | 'summary'>('scenarios');
  const [activeCategory, setActiveCategory] = useState<'all' | 'metadata' | 'input' | 'output'>('all');
  const [includeSummary, setIncludeSummary] = useState<boolean>(true);
  const [highlightStatus, setHighlightStatus] = useState<boolean>(true);
  const [wrapText, setWrapText] = useState<boolean>(true);
  const [autoFitColumns, setAutoFitColumns] = useState<boolean>(true);
  const [mergeScenarioCells, setMergeScenarioCells] = useState<boolean>(true);
  const [formatUrlsHyperlink, setFormatUrlsHyperlink] = useState<boolean>(true);
  const [columns, setColumns] = useState<ReportColumnConfig[]>(DEFAULT_STANDARD_COLUMNS);
  const [isSavingTemplate, setIsSavingTemplate] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Filter executions based on user selected scope
  const activeExecutions = useMemo(() => {
    if (selectedScope === 'all' || !groupedExecutions || groupedExecutions.length === 0) {
      return executions;
    }
    if (selectedScope.startsWith('batch-')) {
      const bId = selectedScope.replace('batch-', '');
      const grp = groupedExecutions.find((g) => g.id === bId);
      return grp ? grp.runs : executions;
    }
    if (selectedScope.startsWith('single-')) {
      const sId = selectedScope.replace('single-', '');
      const single = executions.find((e) => e.id === sId);
      return single ? [single] : executions;
    }
    return executions;
  }, [executions, groupedExecutions, selectedScope]);

  // 1. Dynamic Discovery of Columns across active executions
  const discoveredColumns = useMemo(() => {
    const inputKeys = new Set<string>();
    const outputKeys = new Set<string>();

    activeExecutions.forEach((r) => {
      const ctx = r.runtime_context as any;
      if (ctx && typeof ctx === 'object') {
        if (ctx.dataset_vars && typeof ctx.dataset_vars === 'object') {
          Object.keys(ctx.dataset_vars).forEach((k) => inputKeys.add(k));
        }
      }

      // Check captured variables in steps
      const steps = (r as any).steps || [];
      steps.forEach((s: any) => {
        if (s.output_data) {
          if (typeof s.output_data === 'object' && s.output_data.captured_variables) {
            Object.keys(s.output_data.captured_variables).forEach((k) => outputKeys.add(k));
          } else if (s.node_key && !s.node_key.startsWith('node-')) {
            outputKeys.add(s.node_key);
          }
        }
      });

      // Check trace events
      const traces = r.trace_events || [];
      traces.forEach((t) => {
        if (t.raw_payload && typeof t.raw_payload === 'object' && (t.raw_payload as any).captured_variables) {
          Object.keys((t.raw_payload as any).captured_variables).forEach((k) => outputKeys.add(k));
        }
      });
    });

    const seen = new Set<string>();
    const pool: ReportColumnConfig[] = [];

    const addCol = (col: ReportColumnConfig) => {
      const lower = col.id.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        pool.push(col);
      }
    };

    // Standard Core Columns
    DEFAULT_STANDARD_COLUMNS.forEach(addCol);

    // Extra standard metadata
    ([
      { id: 'completed_at', label: 'Completion Timestamp', enabled: false, category: 'metadata', merge_rule: 'by_scenario', description: 'Execution completion time' },
      { id: 'correlation_id', label: 'Correlation ID', enabled: false, category: 'metadata', merge_rule: 'by_scenario', description: 'Batch execution run identifier' },
      { id: 'quality_score', label: 'Quality Score', enabled: false, category: 'metadata', merge_rule: 'by_scenario', description: 'Automated evaluation quality metric' },
      { id: 'safety_score', label: 'Safety Score', enabled: false, category: 'metadata', merge_rule: 'by_scenario', description: 'Automated safety metric' },
      { id: 'total_tokens', label: 'Total Tokens', enabled: false, category: 'metadata', merge_rule: 'by_scenario', description: 'Tokens consumed' },
      { id: 'total_turns', label: 'Total Turns', enabled: false, category: 'metadata', merge_rule: 'by_scenario', description: 'Conversation turns count' },
      { id: 'error_message', label: 'Error Message', enabled: false, category: 'metadata', merge_rule: 'by_scenario', description: 'Failure error details' }
    ] as ReportColumnConfig[]).forEach(addCol);

    // Discovered Raw Input Dataset Columns
    if (inputKeys.size > 0) {
      inputKeys.forEach((ik) => {
        const lower = ik.toLowerCase();
        if (!['message', 'query', 'prompt', 'followup', 'follow_up', 'chat_url'].includes(lower) && !ik.startsWith('node-') && !seen.has(lower)) {
          addCol({
            id: ik,
            label: ik.charAt(0).toUpperCase() + ik.slice(1).replace(/_/g, ' '),
            enabled: false,
            category: 'input',
            merge_rule: 'by_scenario',
            description: `Input variable {{${ik}}}`
          });
        }
      });
    }

    // Discovered Raw Output Variables
    outputKeys.forEach((ok) => {
      const lower = ok.toLowerCase();
      if (ok.startsWith('node-') || ['message_api_response', 'follow_up_questions_response', 'chat_url'].includes(lower) || seen.has(lower)) return;
      addCol({
        id: ok,
        label: ok.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        enabled: false,
        category: 'output',
        merge_rule: 'by_scenario',
        description: `Captured output variable {{${ok}}}`
      });
    });

    return pool;
  }, [activeExecutions]);

  // 2. Load Project Saved Template on Mount
  useEffect(() => {
    if (!isOpen) return;

    const loadTemplate = async () => {
      if (!projectId) {
        setColumns(discoveredColumns);
        return;
      }

      try {
        const saved = await api.getProjectReportTemplate(projectId);
        if (saved && Array.isArray(saved.columns) && saved.columns.length > 0) {
          if (saved.include_summary !== undefined) setIncludeSummary(saved.include_summary);
          if (saved.highlight_status !== undefined) setHighlightStatus(saved.highlight_status);
          if (saved.wrap_text !== undefined) setWrapText(saved.wrap_text);
          if (saved.auto_fit_columns !== undefined) setAutoFitColumns(saved.auto_fit_columns);
          if (saved.merge_scenario_cells !== undefined) setMergeScenarioCells(saved.merge_scenario_cells);
          if (saved.format_urls_hyperlink !== undefined) setFormatUrlsHyperlink(saved.format_urls_hyperlink);

          // Merge saved column order & labels with newly discovered columns (strictly deduplicated)
          const seenMerged = new Set<string>();
          const merged: ReportColumnConfig[] = [];

          saved.columns.forEach((sc) => {
            if (sc.id.startsWith('node-')) return;
            const lower = sc.id.toLowerCase();
            if (seenMerged.has(lower)) return;
            seenMerged.add(lower);

            const disc = discoveredColumns.find((dc) => dc.id.toLowerCase() === lower);
            merged.push({
              id: sc.id,
              label: sc.label || disc?.label || sc.id,
              enabled: sc.enabled !== false,
              category: sc.category || disc?.category || 'custom',
              merge_rule: sc.merge_rule || disc?.merge_rule || 'by_scenario',
              description: sc.description || disc?.description
            });
          });

          discoveredColumns.forEach((dc) => {
            const lower = dc.id.toLowerCase();
            if (!seenMerged.has(lower)) {
              seenMerged.add(lower);
              merged.push({ ...dc, enabled: false });
            }
          });

          setColumns(merged);
          return;
        }
      } catch (err) {
        console.error('Failed to load project report template:', err);
      }

      setColumns(discoveredColumns);
    };

    loadTemplate();
  }, [isOpen, projectId, discoveredColumns]);

  // Filter columns by active category tab
  const filteredColumns = useMemo(() => {
    if (activeCategory === 'all') return columns;
    return columns.filter((c) => c.category === activeCategory);
  }, [columns, activeCategory]);

  const enabledColumns = useMemo(() => columns.filter((c) => c.enabled), [columns]);
  const enabledCount = enabledColumns.length;

  const toggleColumn = (id: string) => {
    setColumns((prev) =>
      prev.map((col) => (col.id.toLowerCase() === id.toLowerCase() ? { ...col, enabled: !col.enabled } : col))
    );
  };

  const updateColumnLabel = (id: string, newLabel: string) => {
    setColumns((prev) =>
      prev.map((col) => (col.id.toLowerCase() === id.toLowerCase() ? { ...col, label: newLabel } : col))
    );
  };

  const updateColumnMergeRule = (id: string, rule: 'by_scenario' | 'same_value' | 'none') => {
    setColumns((prev) =>
      prev.map((col) => (col.id.toLowerCase() === id.toLowerCase() ? { ...col, merge_rule: rule } : col))
    );
  };

  const moveColumn = (targetId: string, direction: 'up' | 'down') => {
    setColumns((prev) => {
      const currentIndex = prev.findIndex((c) => c.id.toLowerCase() === targetId.toLowerCase());
      if (currentIndex === -1) return prev;

      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;

      const next = [...prev];
      const temp = next[currentIndex];
      next[currentIndex] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const selectAll = (enable: boolean) => {
    setColumns((prev) =>
      prev.map((col) => {
        if (activeCategory === 'all' || col.category === activeCategory) {
          return { ...col, enabled: enable };
        }
        return col;
      })
    );
  };

  const applyPreset = (preset: 'standard' | 'audit' | 'outputs' | 'all') => {
    setColumns((prev) =>
      prev.map((col) => {
        const idLower = col.id.toLowerCase();
        if (preset === 'all') return { ...col, enabled: true };
        if (preset === 'standard') {
          return {
            ...col,
            enabled: [
              'scenario_index',
              'title',
              'input_message',
              'response_message',
              'input_followup',
              'response_followup',
              'status',
              'duration_ms',
              'started_at'
            ].includes(idLower)
          };
        }
        if (preset === 'audit') {
          return {
            ...col,
            enabled: [
              'scenario_index',
              'title',
              'input_message',
              'response_message',
              'input_followup',
              'response_followup',
              'status',
              'duration_ms',
              'started_at',
              'total_tokens',
              'quality_score',
              'safety_score',
              'error_message'
            ].includes(idLower)
          };
        }
        if (preset === 'outputs') {
          return {
            ...col,
            enabled: [
              'scenario_index',
              'title',
              'response_message',
              'response_followup',
              'status'
            ].includes(idLower)
          };
        }
        return col;
      })
    );
  };

  const handleSaveTemplate = async () => {
    if (!projectId) {
      alert('No active project selected to save template.');
      return;
    }

    setIsSavingTemplate(true);
    try {
      const templatePayload: ProjectReportTemplate = {
        include_summary: includeSummary,
        highlight_status: highlightStatus,
        wrap_text: wrapText,
        auto_fit_columns: autoFitColumns,
        merge_scenario_cells: mergeScenarioCells,
        format_urls_hyperlink: formatUrlsHyperlink,
        columns: columns
      };

      await api.saveProjectReportTemplate(projectId, templatePayload);
      setSaveToast('Template saved as project default!');
      setTimeout(() => setSaveToast(null), 3000);
    } catch (err) {
      alert('Failed to save project template.');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleDownloadExcel = async () => {
    setIsDownloading(true);
    try {
      const templatePayload: ProjectReportTemplate = {
        include_summary: includeSummary,
        highlight_status: highlightStatus,
        wrap_text: wrapText,
        auto_fit_columns: autoFitColumns,
        merge_scenario_cells: mergeScenarioCells,
        format_urls_hyperlink: formatUrlsHyperlink,
        columns: columns.filter((c) => c.enabled)
      };

      const blob = await api.exportExecutionsExcel({
        project_id: projectId,
        execution_ids: activeExecutions.map((e) => e.id),
        template: templatePayload,
        correlation_id: correlationId
      });

      // Trigger browser download
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cleanProj = (projectName || 'QA_Report').replace(/[^a-zA-Z0-9_\-]/g, '_');
      const timestamp = new Date().toISOString().replace(/[:.-]/g, '').slice(0, 15);
      a.href = url;
      a.download = `QA_Report_${cleanProj}_${timestamp}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      console.error('Error generating Excel report:', err);
      alert('Failed to generate Excel report. Please check backend connection.');
    } finally {
      setIsDownloading(false);
    }
  };

  // 3. Robust Live Preview Dataset Computation matching Backend Generator
  const previewData = useMemo(() => {
    return activeExecutions.map((r, idx) => {
      const ctx = (r.runtime_context || {}) as any;
      const dvars = (ctx && typeof ctx === 'object' && ctx.dataset_vars) ? ctx.dataset_vars : {};
      const turns = (ctx && Array.isArray(ctx.turns)) ? ctx.turns : [];
      const steps = (r as any).steps || [];
      const traces = r.trace_events || [];

      // Initial Query - Comprehensive lookup
      let initialQuery = '';
      for (const k of Object.keys(dvars)) {
        if (['message', 'query', 'prompt', 'user_query', 'input_message', 'input', 'question', 'prompt_message'].includes(k.toLowerCase()) && dvars[k]) {
          initialQuery = cleanPayloadText(dvars[k]);
          break;
        }
      }
      if (!initialQuery && ctx.scenario) initialQuery = cleanPayloadText(ctx.scenario);
      if (!initialQuery && ctx.prompt) initialQuery = cleanPayloadText(ctx.prompt);
      if (!initialQuery && ctx.title) initialQuery = cleanPayloadText(ctx.title);
      if (!initialQuery && turns[0]?.message) initialQuery = cleanPayloadText(turns[0].message);
      if (!initialQuery && turns[0]?.query) initialQuery = cleanPayloadText(turns[0].query);
      if (!initialQuery && turns[0]?.scenario) initialQuery = cleanPayloadText(turns[0].scenario);

      if (!initialQuery && steps.length > 0) {
        for (const s of steps) {
          const inp = s.input_data || {};
          if (inp.message || inp.query || inp.prompt) {
            initialQuery = cleanPayloadText(inp.message || inp.query || inp.prompt);
            break;
          }
        }
      }

      const scenarioTitle = initialQuery || ctx.scenario || `Scenario #${idx + 1}`;

      // Captured variables
      const captured: Record<string, any> = { ...dvars };
      steps.forEach((s: any) => {
        if (s.output_data?.captured_variables) {
          Object.assign(captured, s.output_data.captured_variables);
        } else if (s.output_data?.response) {
          captured[s.node_key] = s.output_data.response;
        } else if (s.output_data) {
          captured[s.node_key] = s.output_data;
        }
      });
      traces.forEach((t: any) => {
        if (t.raw_payload?.captured_variables) {
          Object.assign(captured, t.raw_payload.captured_variables);
        }
      });

      // Initial Response
      let initialResponse = captured['message_api_response'] || captured['initial_response'] || captured['response'] || captured['answer'] || '';
      if (!initialResponse && steps.length > 0) {
        for (const s of steps) {
          if (s.output_data && !s.node_key?.includes('_turn_')) {
            const cl = cleanPayloadText(s.output_data);
            if (cl) {
              initialResponse = cl;
              break;
            }
          }
        }
      }
      initialResponse = cleanPayloadText(initialResponse);

      // Follow-up queries
      const followupQueries: string[] = [];
      if (turns.length > 0) {
        turns.forEach((t: any, tIdx: number) => {
          const fq = t.followup || t.follow_up;
          if (fq && !followupQueries.includes(String(fq))) {
            followupQueries.push(String(fq));
          } else if (tIdx > 0 && (t.query || t.message)) {
            const q = String(t.query || t.message);
            if (!followupQueries.includes(q)) followupQueries.push(q);
          }
        });
      }
      if (followupQueries.length === 0) {
        Object.keys(dvars).forEach((k) => {
          if (k.toLowerCase().includes('followup') && dvars[k] && !followupQueries.includes(String(dvars[k]))) {
            followupQueries.push(String(dvars[k]));
          }
        });
      }

      // Follow-up responses
      const followupResponses: string[] = [];
      steps.forEach((s: any) => {
        const m = (s.node_key || '').match(/_turn_(\d+)/i);
        if (m && s.output_data) {
          const tIdx = parseInt(m[1], 10) - 1;
          const cleaned = cleanPayloadText(s.output_data);
          while (followupResponses.length <= tIdx) followupResponses.push('');
          followupResponses[tIdx] = cleaned;
        }
      });
      traces.forEach((t: any) => {
        const m = (t.title || '').match(/Turn\s*#?(\d+)/i);
        if (m && t.raw_payload && (t.title.toLowerCase().includes('follow') || t.title.toLowerCase().includes('turn'))) {
          const tIdx = parseInt(m[1], 10) - 1;
          const cleaned = cleanPayloadText(t.raw_payload);
          while (followupResponses.length <= tIdx) followupResponses.push('');
          if (!followupResponses[tIdx]) followupResponses[tIdx] = cleaned;
        }
      });

      if (followupResponses.length === 0 && captured['follow_up_questions_response']) {
        const cleaned = cleanPayloadText(captured['follow_up_questions_response']);
        followupResponses.push(cleaned);
      }

      const followupTurns: { query: string; response: string }[] = [];
      const maxF = Math.max(followupQueries.length, followupResponses.length);
      for (let i = 0; i < maxF; i++) {
        followupTurns.push({
          query: followupQueries[i] || '',
          response: followupResponses[i] || ''
        });
      }

      const numRows = Math.max(1, followupTurns.length);

      return {
        exec: r,
        scenarioIndex: idx + 1,
        scenarioTitle,
        initialQuery,
        initialResponse,
        status: (r.status as any)?.value || String(r.status || 'PASSED'),
        durationMs: r.total_duration_ms || 0,
        startedAt: r.started_at || r.created_at || '',
        followupTurns,
        numRows,
        captured
      };
    });
  }, [activeExecutions]);

  // KPIs for summary tab preview
  const totalScenarios = previewData.length;
  const passedCount = previewData.filter((p) => p.status.toUpperCase().includes('PASS')).length;
  const failedCount = previewData.filter((p) => p.status.toUpperCase().includes('FAIL')).length;
  const passRate = totalScenarios > 0 ? ((passedCount / totalScenarios) * 100).toFixed(1) : '0.0';
  const avgLatency = totalScenarios > 0 ? (previewData.reduce((acc, p) => acc + p.durationMs, 0) / totalScenarios).toFixed(1) : '0';

  // Compute column width helpers
  const getColWidthClass = (colId: string) => {
    const id = colId.toLowerCase();
    if (id === 'scenario_index') return 'w-24 min-w-[90px]';
    if (['title', 'scenario'].includes(id)) return 'w-64 min-w-[220px]';
    if (['input_message', 'message', 'query'].includes(id)) return 'w-64 min-w-[220px]';
    if (['response_message', 'initial_response', 'message_api_response'].includes(id)) return 'w-80 min-w-[300px]';
    if (['input_followup', 'followup'].includes(id)) return 'w-64 min-w-[220px]';
    if (['response_followup', 'follow_up_questions_response'].includes(id)) return 'w-80 min-w-[300px]';
    if (['chat_url', 'chat_session_url', 'session_url', 'url'].includes(id)) return 'w-80 min-w-[280px] font-mono text-[11px] text-violet-700';
    if (['status', 'execution_status'].includes(id)) return 'w-32 min-w-[120px] text-center';
    if (['duration_ms', 'latency'].includes(id)) return 'w-28 min-w-[100px] text-center';
    if (['started_at', 'timestamp'].includes(id)) return 'w-40 min-w-[150px] text-center';
    return 'w-48 min-w-[180px]';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
      <div
        style={{ maxHeight: '90vh', width: '96vw', maxWidth: '1280px' }}
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto"
      >
        {/* Header (Fixed) */}
        <div className="p-3.5 px-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-2xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-slate-900 font-display">
                  Excel Report Builder & Template Studio
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  {enabledCount} of {columns.length} Columns Active
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Custom column selection, dynamic cell merging, and instant live spreadsheet preview for {projectName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Switcher: Config vs Live Preview */}
            <div className="flex items-center p-0.5 bg-slate-200/80 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveView('config')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeView === 'config'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Column & Merge Studio</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveView('preview')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeView === 'preview'
                    ? 'bg-white text-emerald-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                <span>Live Excel Preview</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Save Toast Notification */}
        {saveToast && (
          <div className="bg-emerald-500 text-white text-xs font-bold px-4 py-2 flex items-center justify-between animate-in slide-in-from-top duration-200 shrink-0">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{saveToast}</span>
            </div>
            <button onClick={() => setSaveToast(null)} className="text-emerald-100 hover:text-white cursor-pointer">
              ✕
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW A: COLUMN & MERGE CONFIGURATION STUDIO */}
        {/* ========================================================================= */}
        {activeView === 'config' && (
          <>
            {/* Scope & Preset Toolbar */}
            <div className="p-2.5 px-6 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between flex-wrap gap-2 text-xs shrink-0">
              {/* Scope Selector */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-700 font-bold flex items-center gap-1">
                  <FolderOpen className="w-3.5 h-3.5 text-teal-600" /> Export Scope:
                </span>
                <select
                  value={selectedScope}
                  onChange={(e) => setSelectedScope(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:border-teal-500 shadow-2xs cursor-pointer max-w-xs"
                >
                  <option value="all">🌐 All Runs Combined ({executions.length} Scenarios)</option>
                  {groupedExecutions?.filter((g) => g.isBatch).map((g) => (
                    <option key={g.id} value={`batch-${g.id}`}>
                      📁 {g.title} ({g.runs.length} Scenarios) — {g.subtitle}
                    </option>
                  ))}
                  {selectedExecution && (
                    <option value={`single-${selectedExecution.id}`}>
                      ⚡ Single Selected Run (Scenario #{(selectedExecution.runtime_context as any)?.scenario_index || 1})
                    </option>
                  )}
                </select>
                <span className="text-[11px] font-mono text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-md font-semibold">
                  {activeExecutions.length} {activeExecutions.length === 1 ? 'scenario' : 'scenarios'} selected
                </span>
              </div>

              {/* Presets & Select All */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-slate-500 font-semibold flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Presets:
                  </span>
                  <button
                    type="button"
                    onClick={() => applyPreset('standard')}
                    className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 font-semibold text-slate-700 hover:border-emerald-500 hover:text-emerald-700 hover:bg-emerald-50/50 transition-all cursor-pointer shadow-2xs"
                  >
                    Standard QA
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('audit')}
                    className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 font-semibold text-slate-700 hover:border-purple-500 hover:text-purple-700 hover:bg-purple-50/50 transition-all cursor-pointer shadow-2xs"
                  >
                    Audit
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('outputs')}
                    className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 font-semibold text-slate-700 hover:border-teal-500 hover:text-teal-700 hover:bg-teal-50/50 transition-all cursor-pointer shadow-2xs"
                  >
                    Outputs Only
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('all')}
                    className="px-2 py-0.5 rounded-lg bg-white border border-slate-200 font-semibold text-slate-700 hover:border-blue-500 hover:text-blue-700 hover:bg-blue-50/50 transition-all cursor-pointer shadow-2xs"
                  >
                    All
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => selectAll(true)}
                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer underline"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => selectAll(false)}
                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer underline"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Body: Tabs + Column Table */}
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-3.5 sm:p-4 space-y-2.5">
              {/* Category Tabs & Merging Banner */}
              <div className="flex items-center justify-between border-b border-slate-200 pb-2 flex-wrap gap-2 shrink-0">
                <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                  {[
                    { id: 'all', label: 'All Columns', count: columns.length },
                    { id: 'metadata', label: 'Metadata', count: columns.filter((c) => c.category === 'metadata').length },
                    { id: 'input', label: 'Input Variables', count: columns.filter((c) => c.category === 'input').length },
                    { id: 'output', label: 'Captured Outputs', count: columns.filter((c) => c.category === 'output').length },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveCategory(tab.id as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        activeCategory === tab.id
                          ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {tab.count > 0 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                            activeCategory === tab.id ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {tab.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-semibold flex items-center gap-1">
                    <GitMerge className="w-3.5 h-3.5 text-indigo-600" />
                    Dynamic Cell Merge:
                  </span>
                  <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 cursor-pointer text-xs font-bold text-indigo-900">
                    <input
                      type="checkbox"
                      checked={mergeScenarioCells}
                      onChange={(e) => setMergeScenarioCells(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                    />
                    <span>Merge Multi-Row Scenario Cells</span>
                  </label>
                </div>
              </div>

              {/* Columns Table */}
              <div
                style={{ maxHeight: '280px', minHeight: '140px' }}
                className="overflow-y-auto border border-slate-200 rounded-xl bg-slate-50/50 shadow-inner"
              >
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/95 text-slate-700 font-bold sticky top-0 border-b border-slate-200 z-10 shadow-2xs">
                    <tr>
                      <th className="py-2 px-3 w-12 text-center">Active</th>
                      <th className="py-2 px-3 w-28">Category</th>
                      <th className="py-2 px-3 w-48">Source Field ID</th>
                      <th className="py-2 px-3">Excel Column Header (Editable)</th>
                      <th className="py-2 px-3 w-44">Merge Relation</th>
                      <th className="py-2 px-3 w-20 text-center">Order</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/80 bg-white">
                    {filteredColumns.map((col) => {
                      const globalIndex = columns.findIndex((c) => c.id === col.id);

                      return (
                        <tr
                          key={col.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            col.enabled ? 'bg-white' : 'bg-slate-50/40 opacity-60'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-2 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => toggleColumn(col.id)}
                              className="text-emerald-600 hover:text-emerald-800 transition-colors cursor-pointer"
                            >
                              {col.enabled ? (
                                <CheckSquare className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300" />
                              )}
                            </button>
                          </td>

                          {/* Category Badge */}
                          <td className="py-2 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase ${
                                col.category === 'metadata'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : col.category === 'input'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : col.category === 'output'
                                  ? 'bg-teal-50 text-teal-700 border border-teal-200'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {col.category || 'CUSTOM'}
                            </span>
                          </td>

                          {/* Field ID */}
                          <td className="py-2 px-3 font-mono font-bold text-slate-800 truncate max-w-[180px]" title={col.id}>
                            {col.id}
                          </td>

                          {/* Custom Label Input */}
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={col.label}
                              onChange={(e) => updateColumnLabel(col.id, e.target.value)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-semibold focus:bg-white focus:border-emerald-500 focus:outline-none transition-all shadow-2xs"
                            />
                          </td>

                          {/* Merge Relation Dropdown */}
                          <td className="py-2 px-3">
                            <select
                              value={col.merge_rule || 'by_scenario'}
                              onChange={(e) => updateColumnMergeRule(col.id, e.target.value as any)}
                              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-800 focus:bg-white focus:border-indigo-500 focus:outline-none cursor-pointer"
                            >
                              <option value="by_scenario">🔄 = Scenario (Merge)</option>
                              <option value="same_value">🔀 = Same Value (Merge)</option>
                              <option value="none">❌ None (Distinct Row)</option>
                            </select>
                          </td>

                          {/* Move Up / Down */}
                          <td className="py-2 px-3 text-center">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => moveColumn(col.id, 'up')}
                                disabled={globalIndex === 0}
                                className="p-1 rounded hover:bg-slate-200 text-slate-500 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                title="Move Up"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => moveColumn(col.id, 'down')}
                                disabled={globalIndex === columns.length - 1}
                                className="p-1 rounded hover:bg-slate-200 text-slate-500 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer"
                                title="Move Down"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Formatting Options Box */}
              <div className="p-2.5 px-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between flex-wrap gap-3 text-xs shrink-0">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Settings2 className="w-4 h-4 text-slate-500" /> Spreadsheet Formatting Options:
                </span>

                <div className="flex items-center gap-4 flex-wrap">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeSummary}
                      onChange={(e) => setIncludeSummary(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                    />
                    <span className="text-slate-700 font-medium">Executive Summary Tab</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={highlightStatus}
                      onChange={(e) => setHighlightStatus(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                    />
                    <span className="text-slate-700 font-medium">Color Highlights (Pass/Fail)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={wrapText}
                      onChange={(e) => setWrapText(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                    />
                    <span className="text-slate-700 font-medium">Wrap Long Responses</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoFitColumns}
                      onChange={(e) => setAutoFitColumns(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                    />
                    <span className="text-slate-700 font-medium">Auto Column Widths</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formatUrlsHyperlink}
                      onChange={(e) => setFormatUrlsHyperlink(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 h-3.5 w-3.5"
                    />
                    <span className="text-slate-700 font-medium">Format URLs as Hyperlinks</span>
                  </label>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ========================================================================= */}
        {/* VIEW B: INTERACTIVE LIVE EXCEL SPREADSHEET PREVIEW (DUAL-AXIS SCROLLABLE) */}
        {/* ========================================================================= */}
        {activeView === 'preview' && (
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col p-3.5 sm:p-4 space-y-2.5">
            {/* Sheet Tabs Selector & Live Info */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 shrink-0 flex-wrap gap-2">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPreviewTab('scenarios')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    previewTab === 'scenarios'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span>Detailed Scenarios Sheet ({previewData.length} Scenarios)</span>
                </button>

                {includeSummary && (
                  <button
                    type="button"
                    onClick={() => setPreviewTab('summary')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      previewTab === 'summary'
                        ? 'bg-teal-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Executive Summary Sheet</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs flex-wrap">
                <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-lg">
                  <span className="font-bold text-slate-700 flex items-center gap-1">
                    <FolderOpen className="w-3 h-3 text-teal-600" /> Scope:
                  </span>
                  <select
                    value={selectedScope}
                    onChange={(e) => setSelectedScope(e.target.value)}
                    className="bg-white border border-slate-300 rounded px-2 py-0.5 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value="all">All Runs ({executions.length})</option>
                    {groupedExecutions?.filter((g) => g.isBatch).map((g) => (
                      <option key={g.id} value={`batch-${g.id}`}>
                        {g.title} ({g.runs.length})
                      </option>
                    ))}
                    {selectedExecution && (
                      <option value={`single-${selectedExecution.id}`}>
                        Scenario #{(selectedExecution.runtime_context as any)?.scenario_index || 1} Only
                      </option>
                    )}
                  </select>
                </div>

                <span className="px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 font-mono font-bold flex items-center gap-1">
                  <GitMerge className="w-3 h-3" />
                  {mergeScenarioCells ? 'Merging: ON' : 'Merging: OFF'}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold">
                  {enabledCount} Cols
                </span>
              </div>
            </div>

            {/* Preview Sheet Content with Dual-Axis Scroll Container */}
            {previewTab === 'scenarios' ? (
              <div
                style={{ height: 'calc(80vh - 220px)', minHeight: '300px' }}
                className="overflow-x-auto overflow-y-auto border border-slate-300 rounded-xl bg-white shadow-inner relative"
              >
                <table className="text-left text-xs border-collapse min-w-[1280px]">
                  {/* Excel Dark Navy Header */}
                  <thead className="bg-[#1E293B] text-white font-bold sticky top-0 z-20 shadow-md">
                    <tr>
                      <th className="py-2.5 px-2.5 w-12 min-w-[48px] text-center bg-slate-950 text-slate-400 border-r border-slate-700 font-mono text-[10px] sticky left-0 z-30">
                        #
                      </th>
                      {enabledColumns.map((col) => (
                        <th
                          key={col.id}
                          className={`py-2.5 px-3.5 border-r border-slate-700/80 font-bold text-xs tracking-wide ${getColWidthClass(col.id)}`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="truncate" title={col.label}>{col.label}</span>
                            <span className="text-[10px] text-slate-400 opacity-60 shrink-0">▾</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  {/* Excel Body with Dynamic Vertical Cell Merging (rowSpan) */}
                  <tbody className="divide-y divide-slate-200 text-slate-800">
                    {previewData.map((sc, scIdx) => {
                      let globalRowCounter = 0;
                      for (let i = 0; i < scIdx; i++) {
                        globalRowCounter += previewData[i].numRows;
                      }

                      return Array.from({ length: sc.numRows }).map((_, turnIdx) => {
                        const isFirstTurn = turnIdx === 0;
                        const turnData = sc.followupTurns[turnIdx] || { query: '', response: '' };
                        const excelRowNum = globalRowCounter + turnIdx + 2;

                        return (
                          <tr
                            key={`${sc.scenarioIndex}-${turnIdx}`}
                            className="hover:bg-slate-50/90 transition-colors border-b border-slate-200"
                          >
                            {/* Sticky Row Number */}
                            <td className="py-2 px-2 text-center bg-slate-100 text-slate-500 border-r border-slate-200 font-mono text-[10px] sticky left-0 z-10">
                              {excelRowNum}
                            </td>

                            {/* Columns with proper cell merging */}
                            {enabledColumns.map((col) => {
                              const colIdLower = col.id.toLowerCase();
                              const isTurnSpecific = ['input_followup', 'response_followup', 'followup', 'response_followup', 'follow_up_questions_response'].includes(colIdLower);
                              const isMergedCol = mergeScenarioCells && (col.merge_rule === 'by_scenario' || col.merge_rule === undefined) && !isTurnSpecific;

                              // If column is merged and this is not turn 0, skip rendering <td>
                              if (isMergedCol && !isFirstTurn) {
                                return null;
                              }

                              // Extract cell content
                              let cellContent: React.ReactNode = '';
                              let isCentered = false;

                              if (colIdLower === 'scenario_index') {
                                cellContent = sc.scenarioIndex;
                                isCentered = true;
                              } else if (['title', 'scenario'].includes(colIdLower)) {
                                cellContent = sc.scenarioTitle;
                              } else if (['input_message', 'message', 'query', 'prompt'].includes(colIdLower)) {
                                cellContent = isFirstTurn ? sc.initialQuery : '';
                              } else if (['response_message', 'initial_response', 'message_api_response'].includes(colIdLower)) {
                                cellContent = isFirstTurn ? sc.initialResponse : '';
                              } else if (['input_followup', 'followup', 'followup_question'].includes(colIdLower)) {
                                cellContent = turnData.query;
                              } else if (['response_followup', 'follow_up_questions_response', 'followup_response'].includes(colIdLower)) {
                                cellContent = turnData.response;
                              } else if (['status', 'execution_status'].includes(colIdLower)) {
                                const isPassed = sc.status.toUpperCase().includes('PASS');
                                cellContent = (
                                  <span
                                    className={`px-2 py-0.5 rounded font-bold text-[10px] inline-block ${
                                      isPassed
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                                    }`}
                                  >
                                    {sc.status}
                                  </span>
                                );
                                isCentered = true;
                              } else if (['duration_ms', 'latency'].includes(colIdLower)) {
                                cellContent = isFirstTurn ? `${sc.durationMs.toFixed(1)} ms` : '';
                                isCentered = true;
                              } else if (['started_at', 'timestamp'].includes(colIdLower)) {
                                cellContent = isFirstTurn ? sc.startedAt.slice(0, 19).replace('T', ' ') : '';
                                isCentered = true;
                              } else if (['chat_url', 'chat_session_url', 'session_url', 'url', 'chat_link', 'chat_url_creator'].includes(colIdLower)) {
                                const urlVal = sc.captured['chat_url'] || sc.captured['url'] || (sc.exec.runtime_context as any)?.dataset_vars?.chat_url || '';
                                cellContent = isFirstTurn && urlVal ? (
                                  <a
                                    href={urlVal}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-violet-600 hover:text-violet-800 underline font-mono text-[11px] inline-flex items-center gap-1 break-all"
                                  >
                                    <span>{urlVal}</span>
                                    <ExternalLink className="w-3 h-3 shrink-0 inline" />
                                  </a>
                                ) : '';
                              } else if (sc.captured[col.id] !== undefined) {
                                cellContent = isFirstTurn ? cleanPayloadText(sc.captured[col.id]) : '';
                              }

                              return (
                                <td
                                  key={col.id}
                                  rowSpan={isMergedCol && sc.numRows > 1 ? sc.numRows : undefined}
                                  className={`p-2.5 border-r border-slate-200 text-xs ${getColWidthClass(col.id)} ${
                                    isCentered ? 'text-center' : 'text-left'
                                  } ${isMergedCol && sc.numRows > 1 ? 'align-middle bg-slate-50/50 font-medium' : 'align-top'}`}
                                >
                                  {cellContent ? (
                                    <div className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words leading-relaxed">
                                      {cellContent}
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 italic font-mono text-[10px]">-</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      });
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* Executive Summary Preview Tab */
              <div
                style={{ height: 'calc(80vh - 220px)', minHeight: '300px' }}
                className="overflow-auto border border-slate-300 rounded-xl bg-slate-50/60 p-5 space-y-4 font-sans"
              >
                <div className="bg-[#0F766E] text-white p-4 rounded-xl flex items-center justify-between shadow-sm">
                  <div>
                    <h3 className="text-base font-bold">📊 AI Agent Automation Test Report — {projectName}</h3>
                    <p className="text-xs text-teal-100 mt-0.5">Live Executive Summary Dashboard Preview</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="bg-white border border-slate-200 rounded-xl p-3.5 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Total Scenarios</span>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{totalScenarios}</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide">Passed</span>
                    <p className="text-2xl font-bold text-emerald-800 mt-1">{passedCount}</p>
                  </div>
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wide">Failed</span>
                    <p className="text-2xl font-bold text-rose-800 mt-1">{failedCount}</p>
                  </div>
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-3.5 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-teal-700 uppercase tracking-wide">Pass Rate</span>
                    <p className="text-2xl font-bold text-teal-800 mt-1">{passRate}%</p>
                  </div>
                  <div className="bg-slate-100 border border-slate-200 rounded-xl p-3.5 text-center shadow-2xs">
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Avg Latency</span>
                    <p className="text-2xl font-bold text-slate-800 mt-1">{avgLatency} ms</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions (Fixed) */}
        <div className="p-4 px-6 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between flex-wrap gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={isSavingTemplate}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900 text-xs font-bold transition-all cursor-pointer shadow-2xs"
            >
              <Save className="w-3.5 h-3.5 text-blue-600" />
              <span>{isSavingTemplate ? 'Saving...' : 'Save as Project Template'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setColumns(DEFAULT_STANDARD_COLUMNS);
                setIncludeSummary(true);
                setHighlightStatus(true);
                setWrapText(true);
                setAutoFitColumns(true);
                setMergeScenarioCells(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-slate-500 hover:text-slate-800 text-xs font-semibold cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleDownloadExcel}
              disabled={isDownloading || enabledCount === 0}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>{isDownloading ? 'Generating Spreadsheet...' : `Download Excel (${enabledCount} Cols)`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
