import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Workflow, WorkflowNode, WorkflowEdge, NodeType, TestDataset, UploadedDocument } from '../../types';
import { api } from '../../services/api';
import { CanvasNode } from './components/CanvasNode';
import { NodeConfigModal } from './components/NodeConfigModal';
import { ImportExportModal } from './components/ImportExportModal';
import { WorkflowExecutionModal, StepExecutionState } from './components/WorkflowExecutionModal';
import { DEFAULT_PARALLEL_NODES, DEFAULT_PARALLEL_EDGES } from './utils/defaultNodeConfigs';
import {
  Plus,
  Play,
  Save,
  Zap,
  RefreshCw,
  Maximize2,
  Minimize2,
  Layers,
  ChevronDown,
  Globe,
  MessageSquare,
  Bot,
  Variable,
  Sparkles,
  UserCheck,
  Scale,
  Upload,
  Download,
  Link,
  Trash2,
  LayoutTemplate,
  Pencil,
  ChevronLeft,
  ChevronRight,
  MoveHorizontal,
  Compass,
  Minus,
  GitBranch
} from 'lucide-react';

interface WorkflowCanvasProps {
  workflows: Workflow[];
  currentWorkflow: Workflow | null;
  currentProjectId?: string;
  onSelectWorkflow: (workflow: Workflow) => void;
  onExecuteWorkflow: (workflowId: string) => void;
  onSaveWorkflow?: (workflow: Partial<Workflow>) => Promise<void>;
}

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  workflows = [],
  currentWorkflow,
  currentProjectId,
  onSelectWorkflow,
  onExecuteWorkflow,
  onSaveWorkflow,
}) => {
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<WorkflowNode | null>(null);
  const [workflowName, setWorkflowName] = useState<string>(
    currentWorkflow?.name || 'Custom Test Workflow'
  );
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const prevWorkflowIdRef = useRef<string | undefined>(currentWorkflow?.id);

  // Node Edit Pop-up Dialog State
  const [editingNode, setEditingNode] = useState<WorkflowNode | null>(null);
  const [isNodeModalOpen, setIsNodeModalOpen] = useState(false);

  // Node Testing & Variable Extraction State
  const [isTesting, setIsTesting] = useState(false);
  const [testingNodeKey, setTestingNodeKey] = useState<string | null>(null);
  const [testResponse, setTestResponse] = useState<any | null>(null);
  const [nodeTestResults, setNodeTestResults] = useState<Record<string, { status: string; code?: number; time?: number }>>({});
  const getLiveVarsKey = (projId?: string) => (projId ? `workflow_live_variables_${projId}` : 'workflow_live_variables');
  const getNodeOutputsKey = (projId?: string) => (projId ? `workflow_node_outputs_${projId}` : 'workflow_node_outputs');

  const [liveVariablesContext, setLiveVariablesContext] = useState<Record<string, any>>(() => {
    try {
      const key = currentProjectId ? `workflow_live_variables_${currentProjectId}` : 'workflow_live_variables';
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [nodeOutputs, setNodeOutputs] = useState<Record<string, any>>(() => {
    try {
      const key = currentProjectId ? `workflow_node_outputs_${currentProjectId}` : 'workflow_node_outputs';
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [projectDatasets, setProjectDatasets] = useState<TestDataset[]>([]);
  const [projectDocuments, setProjectDocuments] = useState<UploadedDocument[]>([]);

  // Canvas View & Interaction State
  const [isSaving, setIsSaving] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeSimulationNode, setActiveSimulationNode] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Wire Dragging & Connecting State
  const [connectingSource, setConnectingSource] = useState<string | null>(null);
  const [isDraggingWire, setIsDraggingWire] = useState(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Node Dragging State
  const [draggingNodeKey, setDraggingNodeKey] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Flow Export & Import State (.agflow.json)
  const [isImportExportModalOpen, setIsImportExportModalOpen] = useState(false);

  // Canvas Horizontal Navigation & Dynamic Width State
  const [scrollProgress, setScrollProgress] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Interactive Minimap State
  const [isMinimapOpen, setIsMinimapOpen] = useState(true);
  const [isPanningMinimap, setIsPanningMinimap] = useState(false);
  const minimapRef = useRef<HTMLDivElement>(null);
  const [viewportMetrics, setViewportMetrics] = useState({ scrollLeft: 0, clientWidth: 1000, scrollWidth: 3600 });

  // Workflow Full Execution Modal & Live Progress State
  const [isExecutionModalOpen, setIsExecutionModalOpen] = useState<boolean>(false);
  const [isWorkflowExecuting, setIsWorkflowExecuting] = useState<boolean>(false);
  const [executionSteps, setExecutionSteps] = useState<StepExecutionState[]>([]);
  const [currentExecutingStepIndex, setCurrentExecutingStepIndex] = useState<number>(-1);
  const [executingNodeKeys, setExecutingNodeKeys] = useState<string[]>([]);
  const [executionDurationSec, setExecutionDurationSec] = useState<number>(0);
  const abortExecutionRef = useRef<boolean>(false);
  const executionTimerRef = useRef<any>(null);

  const dynamicCanvasWidth = useMemo(() => {
    if (nodes.length === 0) return 3600;
    const maxX = Math.max(
      ...nodes.map((n, idx) =>
        typeof n.position_x === 'number' && !isNaN(n.position_x) ? n.position_x : idx * 240 + 80
      )
    );
    return Math.max(3600, maxX + 800);
  }, [nodes]);

  const handleCanvasScroll = () => {
    if (canvasRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = canvasRef.current;
      const maxScroll = Math.max(1, scrollWidth - clientWidth);
      setScrollProgress(Math.min(1, Math.max(0, scrollLeft / maxScroll)));
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft < maxScroll - 10);
      setViewportMetrics({ scrollLeft, clientWidth, scrollWidth });
    }
  };

  useEffect(() => {
    const updateMetrics = () => {
      if (canvasRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = canvasRef.current;
        setViewportMetrics({ scrollLeft, clientWidth, scrollWidth });
      }
    };
    updateMetrics();
    window.addEventListener('resize', updateMetrics);
    return () => window.removeEventListener('resize', updateMetrics);
  }, [dynamicCanvasWidth]);

  const handleMinimapPan = (clientX: number) => {
    if (!minimapRef.current || !canvasRef.current) return;
    const rect = minimapRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const { scrollWidth, clientWidth } = canvasRef.current;
    const maxScroll = Math.max(0, scrollWidth - clientWidth);
    canvasRef.current.scrollLeft = ratio * maxScroll;
  };

  const handleMinimapMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsPanningMinimap(true);
    handleMinimapPan(e.clientX);
  };

  useEffect(() => {
    if (!isPanningMinimap) return;
    const onMouseMove = (e: MouseEvent) => {
      handleMinimapPan(e.clientX);
    };
    const onMouseUp = () => {
      setIsPanningMinimap(false);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isPanningMinimap]);

  const handleScrollStep = (direction: 'left' | 'right', amount = 400) => {
    if (canvasRef.current) {
      const delta = direction === 'left' ? -amount : amount;
      canvasRef.current.scrollBy({ left: delta, behavior: 'smooth' });
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ratio = parseFloat(e.target.value);
    setScrollProgress(ratio);
    if (canvasRef.current) {
      const { scrollWidth, clientWidth } = canvasRef.current;
      const maxScroll = Math.max(1, scrollWidth - clientWidth);
      canvasRef.current.scrollLeft = ratio * maxScroll;
    }
  };

  const handleScrollToStart = () => {
    canvasRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  };

  const handleScrollToEnd = () => {
    if (canvasRef.current) {
      canvasRef.current.scrollTo({ left: canvasRef.current.scrollWidth, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (currentProjectId) {
      api.getDatasets(currentProjectId).then(setProjectDatasets).catch(() => {});
      api.getProjectDocuments(currentProjectId).then(setProjectDocuments).catch(() => {});

      // Load project-isolated live variables
      try {
        const savedVars = localStorage.getItem(getLiveVarsKey(currentProjectId));
        setLiveVariablesContext(savedVars ? JSON.parse(savedVars) : {});
      } catch {
        setLiveVariablesContext({});
      }

      // Load project-isolated node outputs
      try {
        const savedOuts = localStorage.getItem(getNodeOutputsKey(currentProjectId));
        setNodeOutputs(savedOuts ? JSON.parse(savedOuts) : {});
      } catch {
        setNodeOutputs({});
      }
    } else {
      setLiveVariablesContext({});
      setNodeOutputs({});
    }
  }, [currentProjectId]);

  const handleClearLiveVariables = () => {
    setLiveVariablesContext({});
    setNodeOutputs({});
    if (currentProjectId) {
      try {
        localStorage.removeItem(getLiveVarsKey(currentProjectId));
        localStorage.removeItem(getNodeOutputsKey(currentProjectId));
      } catch {}
    }
    try {
      localStorage.removeItem('workflow_live_variables');
      localStorage.removeItem('workflow_node_outputs');
    } catch {}
  };

  // Synchronize canvas nodes & edges whenever currentWorkflow changes
  useEffect(() => {
    if (currentWorkflow) {
      setNodes(currentWorkflow.nodes || []);
      setEdges(currentWorkflow.edges || []);
      setSelectedNode(currentWorkflow.nodes?.[0] || null);
      setWorkflowName(currentWorkflow.name || 'Custom Test Workflow');
    } else if (prevWorkflowIdRef.current !== undefined) {
      setNodes([]);
      setEdges([]);
      setSelectedNode(null);
      setWorkflowName('Custom Test Workflow');
    }
    prevWorkflowIdRef.current = currentWorkflow?.id;
  }, [currentWorkflow?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConnectingSource(null);
        setIsDraggingWire(false);
        if (isFullscreen) {
          document.exitFullscreen?.().catch(() => {});
          setIsFullscreen(false);
        }
      }
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen]);

  // Collect all upstream variables
  const availableUpstreamVariables = useMemo(() => {
    if (!editingNode) return [];
    const directParentKeys = new Set(
      edges.filter((e) => e.target_node_key === editingNode.node_key).map((e) => e.source_node_key)
    );

    const list: Array<{
      variable_name: string;
      json_path: string;
      source_node_label: string;
      source_node_key: string;
      is_direct_parent: boolean;
    }> = [];

    // 1. Extractions & Rules from all other nodes
    nodes.forEach((n) => {
      if (n.node_key !== editingNode.node_key) {
        const extractions = (n.config?.extractions as any[]) || [];
        extractions.forEach((ext) => {
          if (ext.variable_name && !list.some((v) => v.variable_name === ext.variable_name)) {
            list.push({
              variable_name: ext.variable_name,
              json_path: ext.json_path || '',
              source_node_label: n.label,
              source_node_key: n.node_key,
              is_direct_parent: directParentKeys.has(n.node_key),
            });
          }
        });

        const rules = (n.config?.rules as any[]) || [];
        rules.forEach((r) => {
          const varName = r.target_variable || r.name;
          if (varName && !list.some((v) => v.variable_name === varName)) {
            list.push({
              variable_name: varName,
              json_path: r.expression || '',
              source_node_label: n.label,
              source_node_key: n.node_key,
              is_direct_parent: directParentKeys.has(n.node_key),
            });
          }
        });
      }
    });

    // 2. Project Datasets (Excel headers)
    projectDatasets.forEach((ds) => {
      (ds.headers || []).forEach((h: string) => {
        if (!list.some((v) => v.variable_name === h)) {
          list.push({
            variable_name: h,
            json_path: `dataset.${h}`,
            source_node_label: `Excel: ${ds.name}`,
            source_node_key: `dataset-${ds.id}`,
            is_direct_parent: true,
          });
        }
      });
    });

    // 3. Live Variables Context (e.g. job_id, session_id, access_token)
    Object.keys(liveVariablesContext || {}).forEach((k) => {
      if (k && !list.some((v) => v.variable_name === k)) {
        list.push({
          variable_name: k,
          json_path: k,
          source_node_label: 'Live Context',
          source_node_key: 'live-context',
          is_direct_parent: true,
        });
      }
    });

    // 4. Keys from upstream node outputs
    Object.entries(nodeOutputs || {}).forEach(([nodeId, resp]) => {
      if (resp && typeof resp === 'object') {
        const matchingNode = nodes.find((n) => n.node_key === nodeId || n.label === nodeId);
        const sourceLabel = matchingNode ? matchingNode.label : nodeId;
        const isParent = matchingNode ? directParentKeys.has(matchingNode.node_key) : false;

        Object.keys(resp).forEach((key) => {
          if (key && !list.some((v) => v.variable_name === key)) {
            list.push({
              variable_name: key,
              json_path: key,
              source_node_label: sourceLabel,
              source_node_key: nodeId,
              is_direct_parent: isParent,
            });
          }
        });
      }
    });

    // 5. Standard Pipeline Variables (always available)
    const standardVars = ['job_id', 'session_id', 'access_token', 'blob_url', 'auth_token'];
    standardVars.forEach((sv) => {
      if (!list.some((v) => v.variable_name === sv)) {
        list.push({
          variable_name: sv,
          json_path: sv,
          source_node_label: 'Pipeline Context',
          source_node_key: 'pipeline',
          is_direct_parent: true,
        });
      }
    });

    return list;
  }, [nodes, edges, editingNode, projectDatasets, liveVariablesContext, nodeOutputs]);

  // Helper: Topological wave grouping of nodes along edges for true parallel branching
  const getExecutionWaves = (nodeList: WorkflowNode[], edgeList: WorkflowEdge[]): WorkflowNode[][] => {
    if (nodeList.length === 0) return [];

    const parents: Record<string, Set<string>> = {};
    nodeList.forEach((n) => {
      parents[n.node_key] = new Set<string>();
    });

    edgeList.forEach((e) => {
      if (parents[e.target_node_key] && nodeList.some((n) => n.node_key === e.source_node_key)) {
        parents[e.target_node_key].add(e.source_node_key);
      }
    });

    const executed = new Set<string>();
    const waves: WorkflowNode[][] = [];
    const remaining = new Set<string>(nodeList.map((n) => n.node_key));

    while (remaining.size > 0) {
      const readyKeys: string[] = [];
      for (const key of remaining) {
        const pSet = parents[key];
        let allParentsDone = true;
        for (const pKey of pSet) {
          if (!executed.has(pKey)) {
            allParentsDone = false;
            break;
          }
        }
        if (allParentsDone) {
          readyKeys.push(key);
        }
      }

      if (readyKeys.length === 0) {
        const fallbackKey = Array.from(remaining).sort((aKey, bKey) => {
          const nodeA = nodeList.find((n) => n.node_key === aKey);
          const nodeB = nodeList.find((n) => n.node_key === bKey);
          return (nodeA?.position_x || 0) - (nodeB?.position_x || 0);
        })[0];
        readyKeys.push(fallbackKey);
      }

      const waveNodes = readyKeys
        .map((k) => nodeList.find((n) => n.node_key === k)!)
        .sort((a, b) => (a.position_y || 0) - (b.position_y || 0) || (a.position_x || 0) - (b.position_x || 0));

      waves.push(waveNodes);

      for (const k of readyKeys) {
        executed.add(k);
        remaining.delete(k);
      }
    }

    return waves;
  };

  // Start Full Workflow Execution with Concurrent Parallel Branching
  const handleStartWorkflowExecution = async () => {
    if (nodes.length === 0) return;

    const waves = getExecutionWaves(nodes, edges);
    if (waves.length === 0) return;

    const allOrderedNodes = waves.flat();

    abortExecutionRef.current = false;

    const steps: StepExecutionState[] = allOrderedNodes.map((n) => ({
      nodeKey: n.node_key,
      nodeLabel: n.label,
      nodeType: n.node_type,
      status: 'PENDING'
    }));

    setExecutionSteps(steps);
    setIsExecutionModalOpen(true);
    setIsWorkflowExecuting(true);
    setExecutionDurationSec(0);
    setCurrentExecutingStepIndex(0);

    const startTime = Date.now();
    if (executionTimerRef.current) clearInterval(executionTimerRef.current);
    executionTimerRef.current = setInterval(() => {
      setExecutionDurationSec(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    let currentLiveVars = { ...liveVariablesContext };
    try {
      const saved = localStorage.getItem(getLiveVarsKey(currentProjectId));
      if (saved) Object.assign(currentLiveVars, JSON.parse(saved));
    } catch {}

    let currentStepOutputs = { ...nodeOutputs };
    try {
      const savedOutputs = localStorage.getItem(getNodeOutputsKey(currentProjectId));
      if (savedOutputs) Object.assign(currentStepOutputs, JSON.parse(savedOutputs));
    } catch {}

    // Execute wave by wave; all nodes in the same wave (e.g. OPCO, COMP, News) execute CONCURRENTLY IN PARALLEL!
    for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
      if (abortExecutionRef.current) break;

      const wave = waves[waveIdx];
      const waveKeys = wave.map((n) => n.node_key);

      // Mark all nodes in current wave as RUNNING simultaneously on canvas and modal
      setExecutingNodeKeys((prev) => Array.from(new Set([...prev, ...waveKeys])));
      setExecutionSteps((prev) =>
        prev.map((s) =>
          waveKeys.includes(s.nodeKey) ? { ...s, status: 'RUNNING', startedAt: Date.now() } : s
        )
      );

      // Execute all nodes in wave concurrently via Promise.all
      const waveResults = await Promise.all(
        wave.map(async (node) => {
          if (abortExecutionRef.current) return { success: false, node };

          try {
            const data = await api.testNode({
              node_type: node.node_type,
              config: node.config,
              initial_variables: currentLiveVars,
              step_outputs: currentStepOutputs,
              extractions: node.config?.extractions || []
            });

            if (abortExecutionRef.current) return { success: false, node };

            if (data.status === 'SUCCESS') {
              if (data.response) {
                currentStepOutputs[node.node_key] = data.response;
                currentStepOutputs[node.label] = data.response;
                setNodeOutputs((prev) => {
                  const upd = { ...prev, [node.node_key]: data.response, [node.label]: data.response };
                  try {
                    localStorage.setItem(getNodeOutputsKey(currentProjectId), JSON.stringify(upd));
                  } catch {}
                  return upd;
                });
              }

              if (data.extracted_variables && Object.keys(data.extracted_variables).length > 0) {
                Object.assign(currentLiveVars, data.extracted_variables);
                setLiveVariablesContext((prev) => {
                  const upd = { ...prev, ...data.extracted_variables };
                  try {
                    localStorage.setItem(getLiveVarsKey(currentProjectId), JSON.stringify(upd));
                  } catch {}
                  return upd;
                });
              }

              setNodeTestResults((prev) => ({
                ...prev,
                [node.node_key]: {
                  status: 'SUCCESS',
                  code: data.status_code || 200,
                  duration_ms: data.duration_ms,
                  time: data.duration_ms
                }
              }));

              setExecutionSteps((prev) =>
                prev.map((s) =>
                  s.nodeKey === node.node_key
                    ? {
                        ...s,
                        status: 'SUCCESS',
                        durationMs: data.duration_ms,
                        statusCode: data.status_code || 200,
                        response: data.response,
                        extractedVariables: data.extracted_variables
                      }
                    : s
                )
              );

              return { success: true, node };
            } else {
              setNodeTestResults((prev) => ({
                ...prev,
                [node.node_key]: {
                  status: 'FAILED',
                  code: data.status_code || 500,
                  duration_ms: data.duration_ms,
                  time: data.duration_ms
                }
              }));

              setExecutionSteps((prev) =>
                prev.map((s) =>
                  s.nodeKey === node.node_key
                    ? {
                        ...s,
                        status: 'FAILED',
                        durationMs: data.duration_ms,
                        statusCode: data.status_code || 500,
                        response: data.response,
                        error: data.error || 'Step execution failed'
                      }
                    : s
                )
              );

              return { success: false, node, error: data.error };
            }
          } catch (err: any) {
            setNodeTestResults((prev) => ({
              ...prev,
              [node.node_key]: {
                status: 'FAILED',
                code: 500,
                duration_ms: 0,
                time: 0
              }
            }));

            setExecutionSteps((prev) =>
              prev.map((s) =>
                s.nodeKey === node.node_key
                  ? {
                      ...s,
                      status: 'FAILED',
                      durationMs: 0,
                      statusCode: 500,
                      error: err?.message || 'Network or server communication error'
                    }
                  : s
              )
            );

            return { success: false, node, error: err?.message };
          } finally {
            setExecutingNodeKeys((prev) => prev.filter((k) => k !== node.node_key));
          }
        })
      );

      // If any node in the wave failed, stop downstream execution
      const anyFailed = waveResults.some((r) => !r.success);
      if (anyFailed || abortExecutionRef.current) {
        break;
      }
    }

    if (executionTimerRef.current) {
      clearInterval(executionTimerRef.current);
      executionTimerRef.current = null;
    }
    setExecutingNodeKeys([]);
    setIsWorkflowExecuting(false);
  };

  const handleStopExecution = () => {
    abortExecutionRef.current = true;
    if (executionTimerRef.current) {
      clearInterval(executionTimerRef.current);
      executionTimerRef.current = null;
    }
    setExecutingNodeKeys([]);
    setIsWorkflowExecuting(false);
  };

  // Open Node Edit Modal
  const handleOpenEditModal = (node: WorkflowNode, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingNode({ ...node });
    setIsNodeModalOpen(true);
  };

  // Node Execution / Single-Node Live Testing
  const handleExecuteNodeTest = async (nodeToTest: WorkflowNode, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsTesting(true);
    setTestingNodeKey(nodeToTest.node_key);

    const allStepOutputs: Record<string, any> = { ...nodeOutputs };

    try {
      let mergedLive = { ...liveVariablesContext };

      if (projectDatasets && projectDatasets.length > 0) {
        const firstDs = projectDatasets[0];
        if (firstDs.headers && firstDs.rows && firstDs.rows.length > 0) {
          const firstRow = firstDs.rows[0];
          firstDs.headers.forEach((h: string, idx: number) => {
            if (!mergedLive[h]) {
              const val = Array.isArray(firstRow) ? firstRow[idx] : typeof firstRow === 'object' ? (firstRow as any)[h] : firstRow;
              if (val !== undefined && val !== null && String(val).trim().length > 0) {
                mergedLive[h] = val;
              }
            }
          });
        }
      }

      if (!mergedLive['message']) mergedLive['message'] = 'Explain about these documents';
      if (!mergedLive['followup']) mergedLive['followup'] = 'What is main thing about these documents';

      if (nodeToTest.node_type === 'CAPTURE_RESULT') {
        const upstreamNodes = nodes.filter((n) => n.node_key !== nodeToTest.node_key);
        upstreamNodes.sort((a, b) => (a.position_x || 0) - (b.position_x || 0));

        for (const upNode of upstreamNodes) {
          try {
            const upData = await api.testNode({
              node_type: upNode.node_type,
              config: upNode.config,
              initial_variables: { ...mergedLive, ...allStepOutputs },
              extractions: upNode.config?.extractions || []
            });
            if (upData.response) {
              allStepOutputs[upNode.node_key] = upData.response;
              allStepOutputs[upNode.label] = upData.response;
              setNodeOutputs((prev) => ({
                ...prev,
                [upNode.node_key]: upData.response,
                [upNode.label]: upData.response
              }));
              try {
                const saved = JSON.parse(localStorage.getItem(getNodeOutputsKey(currentProjectId)) || '{}');
                saved[upNode.node_key] = upData.response;
                saved[upNode.label] = upData.response;
                localStorage.setItem(getNodeOutputsKey(currentProjectId), JSON.stringify(saved));
              } catch {}
            }
            if (upData.extracted_variables && Object.keys(upData.extracted_variables).length > 0) {
              mergedLive = { ...mergedLive, ...upData.extracted_variables };
            }
            if (typeof upData.response === 'object' && upData.response !== null) {
              mergedLive = { ...mergedLive, ...upData.response };
            }
          } catch (upErr) {
            console.warn('Live execution of upstream node failed:', upNode.label, upErr);
          }
        }
        setLiveVariablesContext(mergedLive);
      }

      const defaultUuid =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'f93e5ad8-61ae-4408-b722-6179be7edeb0';

      const validSessionId =
        mergedLive.session_id && mergedLive.session_id !== 'sess-dxb-441'
          ? mergedLive.session_id
          : defaultUuid;

      const defaultToken = localStorage.getItem('auth_token') || '';
      const initialVars = {
        user_id: mergedLive.user_id && mergedLive.user_id !== 'usr-9021' ? mergedLive.user_id : defaultUuid,
        auth_token: mergedLive.access_token || mergedLive.auth_token || defaultToken,
        access_token: mergedLive.access_token || mergedLive.auth_token || defaultToken,
        token: mergedLive.access_token || mergedLive.auth_token || defaultToken,
        session_id: validSessionId,
        job_id: mergedLive.job_id && mergedLive.job_id !== 'job-9841' ? mergedLive.job_id : defaultUuid,
        doc_id: 'doc-771',
        final_report_id: 'rep-1102',
        origin: 'DEL',
        destination: 'DXB',
        blob_url:
          mergedLive.blob_url ||
          'https://g42storacc.blob.core.windows.net/g42-bioppts-dev/attachments/f93e5ad8-61ae-4408-b722-6179be7edeb0/06e2fd5e-e190-40d4-ae26-86a48f9dc6a2_ENFS Presight AI Holding PLC (Jun26)SIGNED COPY.pdf',
        ...mergedLive,
      };

      const allExtractions = [
        ...(nodeToTest.config?.extractions || []),
        ...(nodeToTest.config?.rules || []).map((r: any) => ({
          variable_name: r.target_variable || r.name,
          json_path: r.expression || `$.${r.target_variable || r.name}`
        }))
      ];

      const data = await api.testNode({
        node_type: nodeToTest.node_type,
        config: nodeToTest.config,
        initial_variables: initialVars,
        step_outputs: allStepOutputs,
        extractions: allExtractions
      });
      setTestResponse(data);

      if (data.response) {
        setNodeOutputs((prev) => {
          const updated = {
            ...prev,
            [nodeToTest.node_key]: data.response,
            [nodeToTest.label]: data.response
          };
          try {
            localStorage.setItem(getNodeOutputsKey(currentProjectId), JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }

      if (data.extracted_variables && Object.keys(data.extracted_variables).length > 0) {
        setLiveVariablesContext((prev) => {
          const updated = { ...prev, ...data.extracted_variables };
          try {
            localStorage.setItem(getLiveVarsKey(currentProjectId), JSON.stringify(updated));
          } catch {}
          return updated;
        });
      }
      setNodeTestResults((prev) => ({
        ...prev,
        [nodeToTest.node_key]: {
          status: data.status,
          code: data.status_code || 200,
          time: data.duration_ms || 35
        }
      }));
      return data;
    } catch (err: any) {
      const errMsg = err?.response?.data?.detail || err?.message || 'Failed to execute node test';
      const fallbackData = {
        status: 'FAILED',
        status_code: err?.response?.status || 500,
        duration_ms: 0,
        response: err?.response?.data || { error: errMsg },
        extracted_variables: {},
        error: errMsg
      };
      setTestResponse(fallbackData);
      setNodeTestResults((prev) => ({
        ...prev,
        [nodeToTest.node_key]: { status: 'FAILED', code: fallbackData.status_code, time: 0 }
      }));
      return fallbackData;
    } finally {
      setIsTesting(false);
    }
  };

  const handleAddNode = (type: NodeType) => {
    setShowAddMenu(false);
    const nodeConfigs: Partial<Record<NodeType, Record<string, any>>> = {
      PROMPT: { prompt_text: 'Enter instructions with {{variable}}...' },
      FOLLOWUP_PROMPT: { prompt_text: 'Follow-up query: {{query}}' },
      AGENT: { version: 'v1.0.0' },
      API_REQUEST: { url: 'https://api.service.internal/v1/resource', method: 'GET', headers: {}, extractions: [] },
      POLLING: {
        url: 'https://api.service.internal/v1/jobs/{{job_id}}/status',
        method: 'GET',
        status_key: 'status',
        target_status: 'COMPLETED',
        interval_seconds: 2,
        max_attempts: 10,
        extractions: []
      },
      EXTRACT_VARIABLE: { extractions: [{ variable_name: 'extracted_var', json_path: 'data.id' }] },
      CAPTURE_RESULT: {
        source_mode: 'ALL_PREVIOUS',
        source_node_key: '',
        rules: [
          {
            name: 'api_response',
            target_variable: 'captured_response',
            mode: 'JSON_PATH',
            expression: '$.response.body',
            description: 'Extract full API JSON response or body'
          },
          {
            name: 'email_verification_url',
            target_variable: 'email_link',
            mode: 'HTML_LINKS',
            expression: 'verify|confirm|auth',
            description: 'Extract verification link from email HTML'
          }
        ]
      },
      CHAT_URL_CREATOR: {
        base_url: 'https://chat.example.com/session',
        query_template: '?id={session_id}',
        variable_name: 'chat_url'
      },
      HUMAN_APPROVAL: { task_type: 'APPROVAL', prompt_message: 'Approve requested agent action.' },
      OUTLOOK: { action: 'SEND_AND_VERIFY', recipient: '{{user_email}}', subject: 'Notification' },
      EVALUATION: { layer: 3, assertions: ['quality_score >= 85.0'] },
      CONDITION: {
        condition_variable: 'file_id',
        operator: 'is_not_empty',
        condition_value: '',
      },
      END: {},
    };

    const nextX = nodes.length > 0 ? Math.max(...nodes.map((n) => n.position_x)) + 200 : 100;
    const defaultLabel = type === 'CONDITION' ? 'Check File Attachments' : `New ${type.replace(/_/g, ' ')}`;
    const newNode: WorkflowNode = {
      node_key: `node-${Date.now().toString().slice(-4)}`,
      node_type: type,
      label: defaultLabel,
      position_x: nextX,
      position_y: 200,
      config: nodeConfigs[type] || {},
      assertions: []
    };

    const updated = [...nodes, newNode];
    setNodes(updated);
    setSelectedNode(newNode);
    handleOpenEditModal(newNode);
  };

  const handleDeleteNode = (nodeKey: string) => {
    const updatedNodes = nodes.filter((n) => n.node_key !== nodeKey);
    const updatedEdges = edges.filter(
      (e) => e.source_node_key !== nodeKey && e.target_node_key !== nodeKey
    );
    setNodes(updatedNodes);
    setEdges(updatedEdges);
    if (selectedNode?.node_key === nodeKey) {
      setSelectedNode(updatedNodes[0] || null);
    }
    if (editingNode?.node_key === nodeKey) {
      setIsNodeModalOpen(false);
      setEditingNode(null);
    }
  };

  const handleDisconnectEdge = (source: string, target: string) => {
    setEdges(edges.filter((e) => !(e.source_node_key === source && e.target_node_key === target)));
  };

  const handleToggleConnect = (nodeKey: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!connectingSource) {
      setConnectingSource(nodeKey);
      setIsDraggingWire(false);
    } else if (connectingSource === nodeKey) {
      setConnectingSource(null);
      setIsDraggingWire(false);
    } else {
      const src = connectingSource;
      const tgt = nodeKey;
      const exists = edges.some(
        (edge) =>
          (edge.source_node_key === src && edge.target_node_key === tgt) ||
          (edge.source_node_key === tgt && edge.target_node_key === src)
      );
      if (!exists) {
        setEdges((prev) => [...prev, { source_node_key: src, target_node_key: tgt }]);
      }
      setConnectingSource(null);
      setIsDraggingWire(false);
    }
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      canvasContainerRef.current?.requestFullscreen?.().catch(() => {
        setIsFullscreen((prev) => !prev);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleFitView = () => {
    if (nodes.length === 0) {
      setZoomLevel(1);
      if (canvasRef.current) {
        canvasRef.current.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
      }
      return;
    }
    const minX = Math.min(...nodes.map((n, idx) => (typeof n.position_x === 'number' && !isNaN(n.position_x) ? n.position_x : idx * 240 + 80)));
    const minY = Math.min(...nodes.map((n) => (typeof n.position_y === 'number' && !isNaN(n.position_y) ? n.position_y : 180)));
    const maxX = Math.max(...nodes.map((n, idx) => (typeof n.position_x === 'number' && !isNaN(n.position_x) ? n.position_x : idx * 240 + 80) + 180));
    const maxY = Math.max(...nodes.map((n) => (typeof n.position_y === 'number' && !isNaN(n.position_y) ? n.position_y : 180) + 90));

    if (canvasRef.current) {
      const cWidth = canvasRef.current.clientWidth || 900;
      const cHeight = canvasRef.current.clientHeight || 600;
      const graphWidth = maxX - minX + 160;
      const graphHeight = maxY - minY + 160;
      const fitZoom = Math.min(1.2, Math.max(0.4, Math.min(cWidth / graphWidth, cHeight / graphHeight)));
      setZoomLevel(Math.round(fitZoom * 100) / 100);
      canvasRef.current.scrollTo({
        left: Math.max(0, minX * fitZoom - 60),
        top: Math.max(0, minY * fitZoom - 60),
        behavior: 'smooth'
      });
    }
  };

  const handleMouseDownNode = (node: WorkflowNode, e: React.MouseEvent) => {
    if (
      (e.target as HTMLElement).closest('.port-handle') ||
      (e.target as HTMLElement).closest('.node-action-btn')
    )
      return;

    if (connectingSource && connectingSource !== node.node_key) {
      handleToggleConnect(node.node_key, e);
      return;
    }

    setDraggingNodeKey(node.node_key);
    setSelectedNode(node);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: (e.clientX - rect.left) / zoomLevel,
      y: (e.clientY - rect.top) / zoomLevel,
    });
  };

  const handleMouseMoveCanvas = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const scrollLeft = canvasRef.current.scrollLeft || 0;
    const scrollTop = canvasRef.current.scrollTop || 0;
    const curX = (e.clientX - canvasRect.left + scrollLeft) / zoomLevel;
    const curY = (e.clientY - canvasRect.top + scrollTop) / zoomLevel;
    setMousePos({ x: curX, y: curY });

    if (draggingNodeKey) {
      setNodes((prevNodes) =>
        prevNodes.map((n) => {
          if (n.node_key === draggingNodeKey) {
            return {
              ...n,
              position_x: Math.max(20, Math.round(curX - dragOffset.x)),
              position_y: Math.max(20, Math.round(curY - dragOffset.y)),
            };
          }
          return n;
        })
      );
    }
  };

  const handleMouseUpCanvas = () => {
    setDraggingNodeKey(null);
    if (isDraggingWire) {
      setConnectingSource(null);
      setIsDraggingWire(false);
    }
  };

  const handleSave = async () => {
    if (!onSaveWorkflow) {
      console.warn('onSaveWorkflow prop not provided to WorkflowCanvas');
      return;
    }
    setIsSaving(true);
    try {
      const nameToSave = (workflowName || currentWorkflow?.name || 'Custom Test Workflow').trim();
      await onSaveWorkflow({
        id: currentWorkflow?.id,
        name: nameToSave,
        description: currentWorkflow?.description || 'Custom workflow created from visual builder',
        nodes: nodes.map((n) => ({
          ...n,
          position_x: Number(n.position_x) || 0,
          position_y: Number(n.position_y) || 0,
          config: n.config || {},
          assertions: n.assertions || [],
          is_disabled: String(n.is_disabled || 'false'),
        })),
        edges: edges.map((e) => ({
          ...e,
          condition_expr: e.condition_expr || undefined,
          label: e.label || undefined,
        })),
      });
    } catch (err) {
      console.error('Error saving workflow from canvas:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* 1. Header with Title and Execute Button */}
      <div className="flex items-center justify-between pb-1">
        <div>
          <h1 className="text-xl font-bold text-slate-900 font-display">Onboard Endpoints</h1>
        </div>

        <button
          type="button"
          onClick={handleStartWorkflowExecution}
          disabled={isWorkflowExecuting}
          className="flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer"
        >
          {isWorkflowExecuting ? (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Executing Flow...</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Execute</span>
            </>
          )}
        </button>
      </div>

      {/* 2. Main Graph Card Container */}
      <div
        style={{ height: '720px' }}
        className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative"
      >
        {/* Action Top Bar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                {isEditingName ? (
                  <input
                    type="text"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    onBlur={() => setIsEditingName(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setIsEditingName(false);
                    }}
                    autoFocus
                    className="text-sm font-bold text-slate-900 bg-white border border-blue-400 rounded-lg px-2 py-0.5 outline-none ring-2 ring-blue-100"
                  />
                ) : (
                  <div
                    onClick={() => setIsEditingName(true)}
                    className="group flex items-center gap-1.5 cursor-pointer"
                    title="Click to rename workflow"
                  >
                    <h2 className="text-sm font-bold text-slate-900 leading-tight group-hover:text-blue-600 transition-colors">
                      {workflowName || currentWorkflow?.name || 'Custom Test Workflow'}
                    </h2>
                    <Pencil className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                )}
                {workflows && workflows.length > 1 && (
                  <select
                    value={currentWorkflow?.id || ''}
                    onChange={(e) => {
                      const selected = workflows.find((w) => w.id === e.target.value);
                      if (selected) onSelectWorkflow(selected);
                    }}
                    className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-slate-700 font-medium cursor-pointer"
                  >
                    {workflows.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                )}
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-blue-50 text-blue-600 border border-blue-200">
                  {nodes.length} Nodes • {edges.length} Wires
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Visual DAG Canvas • Click (+) on any node to link wires • Click name to edit
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Add Node Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowAddMenu(!showAddMenu)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-blue-600 border border-blue-200 text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 text-blue-600" />
                <span>+ Add Node</span>
                <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
              </button>

              {showAddMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white border border-slate-200 shadow-xl p-1.5 z-50 space-y-1 animate-in fade-in zoom-in-95">
                  <button onClick={() => handleAddNode('API_REQUEST')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-xs text-slate-800 flex items-center gap-2 cursor-pointer">
                    <Globe className="w-3.5 h-3.5 text-blue-500" /> <span>API Request (HTTP)</span>
                  </button>
                  <button onClick={() => handleAddNode('POLLING')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-xs text-slate-800 flex items-center gap-2 cursor-pointer">
                    <RefreshCw className="w-3.5 h-3.5 text-cyan-600" /> <span>Polling Node (Async Loop)</span>
                  </button>
                  <button onClick={() => handleAddNode('PROMPT')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-xs text-slate-800 flex items-center gap-2 cursor-pointer">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-500" /> <span>Prompt / LLM Input</span>
                  </button>
                  <button onClick={() => handleAddNode('AGENT')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-xs text-slate-800 flex items-center gap-2 cursor-pointer">
                    <Bot className="w-3.5 h-3.5 text-indigo-600" /> <span>Agent Execution</span>
                  </button>
                  <button onClick={() => handleAddNode('EXTRACT_VARIABLE')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-xs text-slate-800 flex items-center gap-2 cursor-pointer">
                    <Variable className="w-3.5 h-3.5 text-amber-500" /> <span>Extract Context Variable</span>
                  </button>
                  <button onClick={() => handleAddNode('CAPTURE_RESULT')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-teal-50 text-xs text-slate-800 flex items-center gap-2 cursor-pointer">
                    <Sparkles className="w-3.5 h-3.5 text-teal-600" /> <span>Capture Result (API/HTML/Email)</span>
                  </button>
                  <button onClick={() => handleAddNode('CHAT_URL_CREATOR')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-violet-50 text-xs text-slate-800 flex items-center gap-2 cursor-pointer">
                    <Link className="w-3.5 h-3.5 text-violet-600" /> <span>Chat URL Creator (Base + Dynamic Query)</span>
                  </button>
                  <button onClick={() => handleAddNode('CONDITION')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-amber-50 text-xs text-slate-800 flex items-center gap-2 cursor-pointer">
                    <GitBranch className="w-3.5 h-3.5 text-amber-600" /> <span>Condition Node (If / Else Gate)</span>
                  </button>
                  <button onClick={() => handleAddNode('HUMAN_APPROVAL')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-xs text-slate-800 flex items-center gap-2 cursor-pointer">
                    <UserCheck className="w-3.5 h-3.5 text-rose-500" /> <span>Human Approval Gate</span>
                  </button>
                  <button onClick={() => handleAddNode('EVALUATION')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-xs text-slate-800 flex items-center gap-2 cursor-pointer">
                    <Scale className="w-3.5 h-3.5 text-purple-600" /> <span>3-Layer Evaluation</span>
                  </button>
                </div>
              )}
            </div>

            {/* Import Flow Button */}
            <button
              onClick={() => setIsImportExportModalOpen(true)}
              style={{ color: '#064e3b', backgroundColor: '#ecfdf5', borderColor: '#a7f3d0' }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold shadow-2xs transition-all hover:bg-emerald-100 cursor-pointer"
              title="Import Workflow from .agflow.json or .json file"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-700" />
              <span>Import Flow</span>
            </button>

            {/* Export & Share Flow Button */}
            <button
              onClick={() => setIsImportExportModalOpen(true)}
              style={{ color: '#3b0764', backgroundColor: '#faf5ff', borderColor: '#d8b4fe' }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold shadow-2xs transition-all hover:bg-purple-100 cursor-pointer"
              title="Export & Download Workflow .agflow.json file"
            >
              <Download className="w-3.5 h-3.5 text-purple-700" />
              <span>Export Flow</span>
            </button>

            {/* Clear Canvas Action */}
            {nodes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Are you sure you want to clear this workflow canvas? All unsaved nodes will be removed.')) {
                    setNodes([]);
                    setEdges([]);
                    setSelectedNode(null);
                  }
                }}
                style={{ color: '#991b1b', backgroundColor: '#fef2f2', borderColor: '#fecaca' }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold shadow-2xs transition-all hover:bg-rose-100 cursor-pointer"
                title="Clear all nodes from the canvas"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-700" />
                <span>Clear Canvas</span>
              </button>
            )}

            {/* Save Graph Action */}
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : '+ Save Graph'}</span>
            </button>
          </div>
        </div>

        {/* Visual 2D Graph Canvas Container */}
        <div
          ref={canvasContainerRef}
          className={`relative overflow-hidden bg-canvas-grid min-h-0 ${isFullscreen ? 'fixed inset-0 z-50 bg-white w-screen h-screen flex flex-col' : 'flex-1 h-full min-h-[580px]'}`}
        >
          {isFullscreen && (
            <div className="px-6 py-3 bg-white/95 backdrop-blur-xs border-b border-slate-200 flex items-center justify-between z-40 shrink-0 shadow-xs">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-900 font-display">
                  {currentWorkflow?.name || 'Workflow Visual Canvas'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                  FULLSCREEN MODE
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggleFullscreen}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs cursor-pointer transition-all shadow-2xs"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Exit Fullscreen (Esc)</span>
              </button>
            </div>
          )}

          <div
            ref={canvasRef}
            onMouseMove={handleMouseMoveCanvas}
            onMouseUp={handleMouseUpCanvas}
            onScroll={handleCanvasScroll}
            onClick={(e) => {
              if ((e.target as HTMLElement) === canvasRef.current || (e.target as HTMLElement).tagName === 'svg') {
                setConnectingSource(null);
                setIsDraggingWire(false);
              }
            }}
            style={{ width: '100%', height: '100%', minHeight: isFullscreen ? '100%' : '580px' }}
            className="canvas-scroll-container relative overflow-x-auto overflow-y-auto bg-canvas-grid select-none flex-1"
          >
            {/* Zoom Scaling Layer Container */}
            <div
              style={{
                transform: `scale(${zoomLevel})`,
                transformOrigin: '0 0',
                width: `${dynamicCanvasWidth}px`,
                height: '2200px',
                position: 'relative',
                transition: 'transform 0.12s ease-out'
              }}
            >
              {/* SVG Wire Connections */}
              <svg
                width={dynamicCanvasWidth}
                height="2200"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: `${dynamicCanvasWidth}px`,
                  height: '2200px',
                  pointerEvents: 'none',
                  zIndex: 10,
                }}
              >
                {edges.map((edge, idx) => {
                  const srcNode = nodes.find((n) => n.node_key === edge.source_node_key);
                  const tgtNode = nodes.find((n) => n.node_key === edge.target_node_key);
                  if (!srcNode || !tgtNode) return null;

                  const srcIdx = nodes.findIndex((n) => n.node_key === edge.source_node_key);
                  const tgtIdx = nodes.findIndex((n) => n.node_key === edge.target_node_key);

                  const srcX = typeof srcNode.position_x === 'number' && !isNaN(srcNode.position_x) ? srcNode.position_x : (srcIdx * 240 + 80);
                  const srcY = typeof srcNode.position_y === 'number' && !isNaN(srcNode.position_y) ? srcNode.position_y : 180;
                  const tgtX = typeof tgtNode.position_x === 'number' && !isNaN(tgtNode.position_x) ? tgtNode.position_x : (tgtIdx * 240 + 80);
                  const tgtY = typeof tgtNode.position_y === 'number' && !isNaN(tgtNode.position_y) ? tgtNode.position_y : 180;

                  const x1 = srcX + 176;
                  const y1 = srcY + 36;
                  const x2 = tgtX;
                  const y2 = tgtY + 36;

                  const dx = Math.max(60, (x2 - x1) * 0.5);
                  const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
                  const midX = (x1 + x2) / 2;
                  const midY = (y1 + y2) / 2;

                  return (
                    <g
                      key={`${edge.source_node_key}-${edge.target_node_key}-${idx}`}
                      className="group pointer-events-auto cursor-pointer"
                      onClick={() => handleDisconnectEdge(edge.source_node_key, edge.target_node_key)}
                    >
                      <path
                        d={pathData}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="22"
                        className="cursor-pointer"
                      />
                      <path
                        d={pathData}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="3.5"
                        className="group-hover:stroke-rose-500 group-hover:stroke-[4.5px] transition-all"
                      />
                      <circle
                        cx={midX}
                        cy={midY}
                        r="6"
                        fill="#1d4ed8"
                        className="group-hover:fill-rose-600 transition-colors"
                      />
                    </g>
                  );
                })}

                {connectingSource && (
                  (() => {
                    const srcNode = nodes.find((n) => n.node_key === connectingSource);
                    if (!srcNode) return null;
                    const srcIdx = nodes.findIndex((n) => n.node_key === connectingSource);
                    const srcX = typeof srcNode.position_x === 'number' && !isNaN(srcNode.position_x) ? srcNode.position_x : (srcIdx * 240 + 80);
                    const srcY = typeof srcNode.position_y === 'number' && !isNaN(srcNode.position_y) ? srcNode.position_y : 180;

                    const x1 = srcX + 176;
                    const y1 = srcY + 36;
                    const x2 = mousePos.x;
                    const y2 = mousePos.y;
                    const dx = Math.max(60, (x2 - x1) * 0.5);
                    const pathData = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

                    return (
                      <path
                        d={pathData}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="3.5"
                        strokeDasharray="6 4"
                      />
                    );
                  })()
                )}
              </svg>

              {connectingSource && (
                <div
                  style={{
                    position: 'absolute',
                    top: '16px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 50,
                    whiteSpace: 'nowrap',
                  }}
                  className="bg-blue-600 text-white text-xs font-bold px-5 py-2 rounded-full shadow-2xl flex items-center gap-3 border border-blue-400"
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                  <span>
                    Linking from <strong>{nodes.find(n => n.node_key === connectingSource)?.label}</strong> → Click target node or (+) to connect
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConnectingSource(null); setIsDraggingWire(false); }}
                    className="px-2.5 py-0.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-[11px] font-bold text-white transition-all ml-2 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Render Draggable Canvas Nodes */}
              {nodes.length === 0 ? (
                <div
                  style={{
                    position: 'absolute',
                    top: '180px',
                    left: '260px',
                    width: '460px',
                    zIndex: 10
                  }}
                  className="p-8 rounded-3xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-xl text-center space-y-4 select-none"
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 mx-auto shadow-2xs">
                    <Sparkles className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Start Your Custom Workflow</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Canvas is clean. Add API endpoints, AI agents, prompts, or polling loops to design your test DAG.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => handleAddNode('API_REQUEST')}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ Add First Node</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNodes(DEFAULT_PARALLEL_NODES);
                        setEdges(DEFAULT_PARALLEL_EDGES);
                        setSelectedNode(DEFAULT_PARALLEL_NODES[0]);
                      }}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer transition-all border border-slate-200"
                      title="Load sample parallel demo graph"
                    >
                      <LayoutTemplate className="w-3.5 h-3.5 text-slate-500" />
                      <span>Load Sample Flow</span>
                    </button>
                  </div>
                </div>
              ) : (
                nodes.map((node, idx) => {
                  const isSelected = selectedNode?.node_key === node.node_key;
                  const isSimActive = activeSimulationNode === node.node_key;
                  const testResult = nodeTestResults[node.node_key];
                  const isTestingThis = (isTesting && testingNodeKey === node.node_key) || executingNodeKeys.includes(node.node_key);
                  const isConnectingFromThis = connectingSource === node.node_key;
                  const isConnectTarget = Boolean(connectingSource && connectingSource !== node.node_key);

                  return (
                    <CanvasNode
                      key={node.node_key}
                      node={node}
                      idx={idx}
                      isSelected={isSelected}
                      isSimActive={isSimActive}
                      testResult={testResult}
                      isTestingThis={isTestingThis}
                      isConnectingFromThis={isConnectingFromThis}
                      isConnectTarget={isConnectTarget}
                      connectingSource={connectingSource}
                      onMouseDown={handleMouseDownNode}
                      onToggleConnect={handleToggleConnect}
                      onOpenEditModal={handleOpenEditModal}
                      onExecuteNodeTest={handleExecuteNodeTest}
                    />
                  );
                })
              )}
            </div>

            {/* Pinned Bottom-Left Canvas Controls */}
            <div className="absolute bottom-6 left-6 z-30 flex flex-col bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden divide-y divide-slate-100">
              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.min(2.0, Math.round((prev + 0.15) * 100) / 100))}
                className="p-2.5 hover:bg-blue-50 text-slate-700 hover:text-blue-600 cursor-pointer transition-colors flex items-center justify-center"
                title="Zoom In (+15%)"
              >
                <Plus className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setZoomLevel(1)}
                className="px-1.5 py-1 text-[10px] font-mono font-bold text-slate-600 hover:text-blue-600 hover:bg-blue-50 text-center cursor-pointer transition-colors"
                title="Reset zoom to 100%"
              >
                {Math.round(zoomLevel * 100)}%
              </button>

              <button
                type="button"
                onClick={() => setZoomLevel((prev) => Math.max(0.4, Math.round((prev - 0.15) * 100) / 100))}
                className="p-2.5 hover:bg-blue-50 text-slate-700 hover:text-blue-600 cursor-pointer transition-colors flex items-center justify-center font-bold text-sm"
                title="Zoom Out (-15%)"
              >
                -
              </button>

              <button
                type="button"
                onClick={handleFitView}
                className="p-2.5 hover:bg-blue-50 text-slate-700 hover:text-blue-600 cursor-pointer transition-colors flex items-center justify-center"
                title="Fit & Center Nodes"
              >
                <Layers className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={handleToggleFullscreen}
                className={`p-2.5 hover:bg-blue-50 cursor-pointer transition-colors flex items-center justify-center ${isFullscreen ? 'text-blue-600 bg-blue-50' : 'text-slate-700 hover:text-blue-600'}`}
                title={isFullscreen ? "Exit Fullscreen (Esc)" : "Fullscreen Canvas View"}
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>

            {/* Pinned Bottom-Center Horizontal Canvas Navigator */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl px-3.5 py-1.5 shadow-lg shadow-slate-900/5">
              <button
                type="button"
                onClick={handleScrollToStart}
                className="px-2 py-1 text-[11px] font-bold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                title="Jump to Start (Leftmost)"
              >
                Start
              </button>

              <button
                type="button"
                onClick={() => handleScrollStep('left')}
                disabled={!canScrollLeft}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 disabled:opacity-40 disabled:hover:bg-slate-100 disabled:hover:text-slate-700 transition-colors cursor-pointer flex items-center justify-center"
                title="Scroll Left (←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 px-1">
                <MoveHorizontal className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.001}
                  value={scrollProgress}
                  onChange={handleSliderChange}
                  className="w-28 sm:w-52 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
                  title="Slide to scroll canvas horizontally"
                />
              </div>

              <button
                type="button"
                onClick={() => handleScrollStep('right')}
                disabled={!canScrollRight}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-600 disabled:opacity-40 disabled:hover:bg-slate-100 disabled:hover:text-slate-700 transition-colors cursor-pointer flex items-center justify-center"
                title="Scroll Right (→)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleScrollToEnd}
                className="px-2 py-1 text-[11px] font-bold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                title="Jump to End (Rightmost)"
              >
                End
              </button>
            </div>

            {/* Pinned Bottom-Right Interactive Minimap */}
            {isMinimapOpen ? (
              <div className="absolute bottom-6 right-6 z-30 w-64 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl p-2.5 space-y-1.5 select-none animate-scaleIn">
                {/* Header with Title & Collapse */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-800">
                    <Compass className="w-3.5 h-3.5 text-blue-600" />
                    <span>MINIMAP</span>
                    <span className="text-[10px] text-slate-400 font-normal">({nodes.length} nodes)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMinimapOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    title="Minimize minimap"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Minimap Interactive Screen */}
                <div
                  ref={minimapRef}
                  onMouseDown={handleMinimapMouseDown}
                  className={`w-full h-28 relative bg-slate-900/95 rounded-xl border border-slate-800 overflow-hidden cursor-crosshair ${
                    isPanningMinimap ? 'cursor-grabbing' : 'hover:border-blue-500/50'
                  }`}
                  title="Click or drag anywhere to navigate canvas"
                >
                  {/* Subtle Grid Dots */}
                  <div
                    className="absolute inset-0 opacity-15 pointer-events-none"
                    style={{
                      backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
                      backgroundSize: '12px 12px',
                    }}
                  />

                  {/* Wire hints */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {edges.map((e) => {
                      const src = nodes.find((n) => n.node_key === e.source_node_key);
                      const tgt = nodes.find((n) => n.node_key === e.target_node_key);
                      if (!src || !tgt) return null;
                      const x1 = ((src.position_x || 0) / dynamicCanvasWidth) * 100;
                      const y1 = (((src.position_y || 180) + 30) / 700) * 100;
                      const x2 = ((tgt.position_x || 0) / dynamicCanvasWidth) * 100;
                      const y2 = (((tgt.position_y || 180) + 30) / 700) * 100;

                      return (
                        <line
                          key={e.id}
                          x1={`${x1}%`}
                          y1={`${y1}%`}
                          x2={`${x2}%`}
                          y2={`${y2}%`}
                          stroke="#38bdf8"
                          strokeWidth="1.2"
                          strokeOpacity="0.4"
                        />
                      );
                    })}
                  </svg>

                  {/* Mini Nodes */}
                  {nodes.map((n, idx) => {
                    const pX = typeof n.position_x === 'number' && !isNaN(n.position_x) ? n.position_x : (idx * 240 + 80);
                    const pY = typeof n.position_y === 'number' && !isNaN(n.position_y) ? n.position_y : 180;
                    const isCurrent = selectedNode?.node_key === n.node_key;

                    let dotBg = 'bg-blue-400';
                    if (n.node_type === 'AGENT') dotBg = 'bg-purple-400';
                    else if (n.node_type === 'PROMPT' || n.node_type === 'FOLLOWUP_PROMPT') dotBg = 'bg-emerald-400';
                    else if (n.node_type === 'CAPTURE_RESULT') dotBg = 'bg-amber-400';
                    else if (n.node_type === 'CONDITION') dotBg = 'bg-rose-400';

                    return (
                      <div
                        key={n.node_key}
                        style={{
                          left: `${Math.max(2, Math.min(96, (pX / dynamicCanvasWidth) * 100))}%`,
                          top: `${Math.max(4, Math.min(92, (pY / 700) * 100))}%`,
                        }}
                        className={`absolute w-3.5 h-2 rounded-xs ${dotBg} pointer-events-none transition-transform ${
                          isCurrent ? 'ring-2 ring-white scale-125 z-10' : 'opacity-85'
                        }`}
                        title={n.label}
                      />
                    );
                  })}

                  {/* Live Viewport Highlight Camera Box */}
                  <div
                    style={{
                      left: `${Math.max(0, Math.min(100, (viewportMetrics.scrollLeft / Math.max(1, viewportMetrics.scrollWidth)) * 100))}%`,
                      width: `${Math.max(12, Math.min(100, (viewportMetrics.clientWidth / Math.max(1, viewportMetrics.scrollWidth)) * 100))}%`,
                    }}
                    className="absolute top-0 bottom-0 bg-blue-500/25 border-2 border-blue-400 rounded-md shadow-xs pointer-events-none"
                  />
                </div>

                {/* Footer Pan Hint */}
                <div className="flex items-center justify-between text-[10px] text-slate-400 px-1 pt-0.5">
                  <span>Click / drag to navigate</span>
                  <span className="font-mono font-bold text-blue-600">{Math.round(scrollProgress * 100)}%</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsMinimapOpen(true)}
                className="absolute bottom-6 right-6 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-md hover:shadow-lg text-slate-700 hover:text-blue-600 text-xs font-bold transition-all cursor-pointer"
                title="Expand Minimap"
              >
                <Compass className="w-3.5 h-3.5 text-blue-600" />
                <span>Minimap</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Node Configuration Modal */}
      <NodeConfigModal
        isOpen={isNodeModalOpen}
        editingNode={editingNode}
        nodes={nodes}
        edges={edges}
        projectDatasets={projectDatasets}
        projectDocuments={projectDocuments}
        liveVariablesContext={liveVariablesContext}
        nodeOutputs={nodeOutputs}
        availableUpstreamVariables={availableUpstreamVariables}
        isTesting={isTesting}
        testResponse={testResponse}
        onExecuteNodeTest={handleExecuteNodeTest}
        onSaveNode={(updatedNode) => {
          setNodes(nodes.map((n) => (n.node_key === updatedNode.node_key ? updatedNode : n)));
          if (selectedNode?.node_key === updatedNode.node_key) {
            setSelectedNode(updatedNode);
          }
        }}
        onDeleteNode={handleDeleteNode}
        onClearLiveVariables={handleClearLiveVariables}
        onClose={() => {
          setIsNodeModalOpen(false);
          setEditingNode(null);
        }}
      />

      {/* 4. Import / Export Flow Modal */}
      <ImportExportModal
        isOpen={isImportExportModalOpen}
        currentWorkflow={currentWorkflow}
        nodes={nodes}
        edges={edges}
        onImportWorkflow={({ nodes: impNodes, edges: impEdges }) => {
          setNodes(impNodes);
          setEdges(impEdges);
          if (impNodes.length > 0) setSelectedNode(impNodes[0]);
        }}
        onClose={() => setIsImportExportModalOpen(false)}
      />

      {/* 5. Full Workflow Execution Progress Modal */}
      <WorkflowExecutionModal
        isOpen={isExecutionModalOpen}
        workflowName={workflowName}
        steps={executionSteps}
        isExecuting={isWorkflowExecuting}
        totalDurationSec={executionDurationSec}
        currentStepIndex={currentExecutingStepIndex}
        onStopExecution={handleStopExecution}
        onRerunWorkflow={handleStartWorkflowExecution}
        onClose={() => setIsExecutionModalOpen(false)}
      />
    </div>
  );
};
