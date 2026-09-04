import React, { useState, useEffect } from 'react';
import { api } from './services/api';
import {
  Project,
  Environment,
  Workflow,
  ExecutionRun,
  TestSuite,
  TestDataset,
  EvaluationResult,
  RegressionReport,
  RCAAnalysis,
  ReleaseDecision,
  DatasetExecutionStrategy,
} from './types';
import { Navbar } from './components/Navbar';
import { Sidebar, NavTab } from './components/Sidebar';
import { DashboardView } from './features/dashboard/DashboardView';
import { WorkflowCanvas } from './features/workflows/WorkflowCanvas';
import { LiveTraceViewer } from './features/executions/LiveTraceViewer';
import { EvaluationView } from './features/evaluation/EvaluationView';
import { RegressionMatrix } from './features/regression/RegressionMatrix';
import { TestManagementView } from './features/test_management/TestManagementView';
import { UploadDocumentView } from './features/documents/UploadDocumentView';
import { SwarmAsyncHubView } from './features/swarm_async/SwarmAsyncHubView';
import { AdminPanelView } from './features/admin/AdminPanelView';
import { HITLModal } from './features/executions/HITLModal';
import { RCAModal } from './features/rca/RCAModal';
import { CreateProjectModal } from './components/CreateProjectModal';
import { DeleteProjectsModal } from './components/DeleteProjectsModal';
import { groupDatasetIntoScenarios } from './utils/scenarioHelper';
import { useAuth } from './context/AuthContext';
import { LoginPage } from './features/auth/LoginPage';
import {
  KeyRound,
  ShieldCheck,
  Check,
  AlertCircle,
  RefreshCw,
  Loader2,
  CheckCircle2,
  ArrowRight,
  Clock,
  Play,
  X,
  ChevronDown,
  ChevronRight,
  Zap,
  Copy,
  GripVertical,
  AlertTriangle,
  RotateCcw,
  Trash2,
  Square
} from 'lucide-react';

export const App: React.FC = () => {
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');

  // RBAC Guard: Redirect non-admins away from admin panel
  useEffect(() => {
    if (activeTab === 'admin_panel' && user && user.role?.toUpperCase() !== 'ADMIN') {
      setActiveTab('dashboard');
    }
  }, [activeTab, user]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [currentEnv, setCurrentEnv] = useState<Environment | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [currentWorkflow, setCurrentWorkflow] = useState<Workflow | null>(null);
  const [executions, setExecutions] = useState<ExecutionRun[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionRun | null>(null);
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
  const [datasets, setDatasets] = useState<TestDataset[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationResult[]>([]);
  const [regressionReports, setRegressionReports] = useState<RegressionReport[]>([]);
  const [rca, setRca] = useState<RCAAnalysis | null>(null);
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false);
  const [isDeleteProjectsOpen, setIsDeleteProjectsOpen] = useState(false);
  const [deleteInitialId, setDeleteInitialId] = useState<string | undefined>(undefined);
  const [releaseDecision, setReleaseDecision] = useState<ReleaseDecision | null>({
    verdict: 'GO',
    passed: true,
    checks: [
      { name: 'Overall Quality Score', passed: true, threshold: 85.0, actual: 96.4, message: 'Quality score 96.4% >= 85.0%' },
      { name: 'Safety & Policy', passed: true, threshold: 90.0, actual: 100.0, message: 'Safety score 100.0% >= 90.0%' },
      { name: 'Critical Failures', passed: true, threshold: 0, actual: 0, message: '0 critical failures' },
      { name: 'Regression Count', passed: true, threshold: 0, actual: 0, message: '0 regressions vs baseline' }
    ],
    summary: 'Release decision: GO. All quality criteria satisfied.',
    blocking_reasons: []
  });

  // Global Backend Matrix Job Polling State
  const [activeMatrixJob, setActiveMatrixJob] = useState<any | null>(null);
  const [isMatrixModalOpen, setIsMatrixModalOpen] = useState(false);
  const [isFloatingPillDismissed, setIsFloatingPillDismissed] = useState(false);
  const [showMatrixCelebration, setShowMatrixCelebration] = useState(false);
  const [expandedMatrixNodeKey, setExpandedMatrixNodeKey] = useState<string | null>(null);
  const [nodePayloadsCache, setNodePayloadsCache] = useState<Record<string, any>>({});
  const [loadingPayloadKey, setLoadingPayloadKey] = useState<string | null>(null);
  const pollingIntervalRef = React.useRef<any>(null);

  // Movable Floating Pill Drag State
  const [pillPos, setPillPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingPill, setIsDraggingPill] = useState(false);
  const dragStartRef = React.useRef<{ startX: number; startY: number; initX: number; initY: number }>({ startX: 0, startY: 0, initX: 0, initY: 0 });
  const pillRef = React.useRef<HTMLDivElement>(null);

  const handlePillMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.preventDefault();
    const rect = pillRef.current?.getBoundingClientRect();
    const currentX = rect ? rect.left : (window.innerWidth - 460);
    const currentY = rect ? rect.top : (window.innerHeight - 110);

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: currentX,
      initY: currentY,
    };
    setIsDraggingPill(true);
  };

  useEffect(() => {
    if (!isDraggingPill) return;

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      const pillWidth = pillRef.current?.offsetWidth || 440;
      const pillHeight = pillRef.current?.offsetHeight || 80;

      const newX = Math.max(12, Math.min(window.innerWidth - pillWidth - 12, dragStartRef.current.initX + dx));
      const newY = Math.max(12, Math.min(window.innerHeight - pillHeight - 12, dragStartRef.current.initY + dy));

      setPillPos({ x: newX, y: newY });
    };

    const onMouseUp = () => {
      setIsDraggingPill(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingPill]);

  const handleToggleInspectNode = async (sIdx: number, nIdx: number, nodeKey: string) => {
    const key = `${sIdx}-${nIdx}`;
    if (expandedMatrixNodeKey === key) {
      setExpandedMatrixNodeKey(null);
      return;
    }

    setExpandedMatrixNodeKey(key);

    const cacheKey = `${activeMatrixJob?.job_id}_${sIdx}_${nodeKey}`;
    if (!nodePayloadsCache[cacheKey] && activeMatrixJob?.job_id) {
      setLoadingPayloadKey(key);
      try {
        const payloadData = await api.getMatrixNodePayload(activeMatrixJob.job_id, sIdx, nodeKey);
        setNodePayloadsCache((prev) => ({
          ...prev,
          [cacheKey]: payloadData,
        }));
      } catch (err) {
        console.warn('Failed to load node payload on-demand:', err);
      } finally {
        setLoadingPayloadKey(null);
      }
    }
  };

  const [isRunningDemo, setIsRunningDemo] = useState(false);
  const [isHITLOpen, setIsHITLOpen] = useState(false);
  const [isRCAOpen, setIsRCAOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadProjectData = async (project: Project) => {
    try {
      if (project.environments && project.environments.length > 0) {
        setCurrentEnv(project.environments[0]);
      } else {
        setCurrentEnv(null);
      }

      const [wfs, execs, suites, dsets, reps] = await Promise.all([
        api.getWorkflows(project.id).catch(() => []),
        api.getExecutions(project.id).catch(() => []),
        api.getTestSuites(project.id).catch(() => []),
        api.getDatasets(project.id).catch(() => []),
        api.getRegressionReports(project.id).catch(() => []),
      ]);

      setWorkflows(wfs);
      setCurrentWorkflow(wfs.length > 0 ? wfs[0] : null);

      setExecutions(execs);
      if (execs.length > 0) {
        setSelectedExecution(execs[0]);
        const evals = await api.getEvaluationResults(execs[0].id).catch(() => []);
        setEvaluations(evals);
      } else {
        setSelectedExecution(null);
        setEvaluations([]);
      }

      setTestSuites(suites);
      setDatasets(dsets);
      setRegressionReports(reps);

      const gate = await api.evaluateQualityGate(project.id).catch(() => null);
      if (gate) setReleaseDecision(gate);
    } catch (e) {
      console.warn('Error loading project data:', e);
    }
  };

  const defaultProjects: Project[] = [
    {
      id: 'proj-travel-01',
      organization_id: 'org-delphi-01',
      name: 'Travel AI Booking Suite',
      slug: 'travel-ai-suite',
      description: 'Autonomous multi-turn flight booking agent with human approval and Outlook verification',
      created_at: new Date().toISOString(),
      environments: [
        {
          id: 'env-prod',
          project_id: 'proj-travel-01',
          name: 'Production',
          env_type: 'PRODUCTION',
          base_url: 'https://api.travelservice.internal',
          variables: {},
          secrets: [],
          created_at: new Date().toISOString()
        },
        {
          id: 'env-stag',
          project_id: 'proj-travel-01',
          name: 'Staging',
          env_type: 'STAGING',
          base_url: 'https://staging.travelservice.internal',
          variables: {},
          secrets: [],
          created_at: new Date().toISOString()
        }
      ]
    },
    {
      id: 'proj-support-02',
      organization_id: 'org-delphi-01',
      name: 'Enterprise Support Bot',
      slug: 'support-bot',
      description: 'Customer service agent with refund policies and CRM tool integration',
      created_at: new Date().toISOString(),
      environments: [
        {
          id: 'env-support-prod',
          project_id: 'proj-support-02',
          name: 'Production',
          env_type: 'PRODUCTION',
          base_url: 'https://support.acmecorp.internal',
          variables: {},
          secrets: [],
          created_at: new Date().toISOString()
        }
      ]
    },
    {
      id: 'proj-finance-03',
      organization_id: 'org-delphi-01',
      name: 'Finance & Invoice Agent',
      slug: 'finance-agent',
      description: 'Receipt scanning, invoice validation, and ERP ledger sync agent',
      created_at: new Date().toISOString(),
      environments: [
        {
          id: 'env-fin-prod',
          project_id: 'proj-finance-03',
          name: 'Production',
          env_type: 'PRODUCTION',
          base_url: 'https://erp.finance.internal',
          variables: {},
          secrets: [],
          created_at: new Date().toISOString()
        }
      ]
    }
  ];

  const loadData = async () => {
    try {
      const projs = await api.getProjects();
      if (projs && projs.length > 0) {
        setProjects(projs);
        const initialProj = currentProject ? projs.find(p => p.id === currentProject.id) || projs[0] : projs[0];
        setCurrentProject(initialProj);
        await loadProjectData(initialProj);
      } else {
        setProjects(defaultProjects);
        setCurrentProject(defaultProjects[0]);
        await loadProjectData(defaultProjects[0]);
      }
    } catch (e) {
      console.warn('Backend offline or loading initial state:', e);
      setProjects(defaultProjects);
      setCurrentProject(defaultProjects[0]);
      await loadProjectData(defaultProjects[0]);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const handleSelectProject = async (project: Project) => {
    setCurrentProject(project);
    await loadProjectData(project);
  };

  const handleSelectExecution = async (execOrId: string | ExecutionRun) => {
    try {
      const execId = typeof execOrId === 'string' ? execOrId : execOrId.id;
      const exec = await api.getExecutionById(execId);
      setSelectedExecution(exec);
      setExecutions((prev) => prev.map((e) => (e.id === execId ? exec : e)));
      const evals = await api.getEvaluationResults(execId);
      setEvaluations(evals);
      setActiveTab('executions');
    } catch (e) {
      console.error(e);
    }
  };

  const handleRunDemo = async (type: 'v1_full' | 'v2_regressed') => {
    setIsRunningDemo(true);
    showToast(type === 'v1_full' ? '🚀 Executing 11-Step Travel AI Agent E2E Flow...' : '⚠️ Simulating Regressed Agent v2.0.0...');
    try {
      let result: ExecutionRun;
      if (type === 'v1_full') {
        result = await api.runFullTravelWorkflowDemo();
        showToast('✅ Travel Agent E2E Flow Completed — Quality Score: 96.4% (PASS)');
      } else {
        result = await api.runRegressedAgentV2Demo();
        showToast('⚠️ Agent v2 Invoked Unauthorized Tool "refund_search" — Root Cause Identified');
      }

      setExecutions((prev) => [result, ...prev.filter((e) => e.id !== result.id)]);
      setSelectedExecution(result);
      const evals = await api.getEvaluationResults(result.id).catch(() => []);
      setEvaluations(evals);

      if (type === 'v2_regressed') {
        const rcaData = await api.getRCA(result.id).catch(() => null);
        if (rcaData) setRca(rcaData);
        setIsRCAOpen(true);
      }

      setActiveTab('executions');
    } catch (e) {
      showToast('Error executing demo flow. Ensure backend is running on port 8000.');
    } finally {
      setIsRunningDemo(false);
    }
  };

  const handleResolveHITL = async (approved: boolean, comments: string) => {
    if (!selectedExecution) return;
    const task = selectedExecution.hitl_tasks?.[0];
    if (task) {
      await api.resolveHITLTask(task.id, { approved, comments });
      showToast(`HITL Gate ${approved ? 'APPROVED' : 'REJECTED'} successfully.`);
      await loadData();
    }
  };

  const handlePromoteRCA = async () => {
    if (!selectedExecution || !testSuites[0]) return;
    await api.promoteToRegression(selectedExecution.id, testSuites[0].id);
    showToast('🎉 Scenario successfully added to permanent regression test suite!');
    await loadData();
  };

  const handleCreateProject = async (name: string, description?: string) => {
    try {
      const newProj = await api.createProject(name, description);
      showToast(`🎉 Project "${name}" created successfully!`);
      const projs = await api.getProjects();
      setProjects(projs);
      setCurrentProject(newProj);
      await loadProjectData(newProj);
    } catch (e) {
      showToast('Error creating project. Please try again.');
    }
  };

  const handleOpenDeleteProjects = (projectId?: string) => {
    setDeleteInitialId(projectId);
    setIsDeleteProjectsOpen(true);
  };

  const handleDeleteProjects = async (projectIds: string[]) => {
    try {
      if (projectIds.length === 1) {
        await api.deleteProject(projectIds[0]);
      } else {
        await api.batchDeleteProjects(projectIds);
      }
      showToast(`🗑️ Successfully deleted ${projectIds.length} project${projectIds.length > 1 ? 's' : ''}.`);
      
      const updatedProjects = await api.getProjects();
      setProjects(updatedProjects);
      
      if (currentProject && projectIds.includes(currentProject.id)) {
        const nextProj = updatedProjects[0] || null;
        setCurrentProject(nextProj);
        if (nextProj) {
          await loadProjectData(nextProj);
        } else {
          setWorkflows([]);
          setExecutions([]);
          setTestSuites([]);
          setDatasets([]);
        }
      }
    } catch (err) {
      console.error('Failed to delete projects:', err);
      showToast('❌ Failed to delete projects. Please try again.');
    }
  };

  const handleExecuteCurrentWorkflow = async () => {
    if (!currentProject) {
      showToast('⚠️ Please select a project first.');
      return;
    }

    setIsRunningDemo(true);
    showToast(`🚀 Executing workflow for "${currentProject.name}"...`);

    try {
      const envId = currentEnv?.id || currentProject.environments?.[0]?.id || 'env-default';

      let initialVars: Record<string, any> = {};
      try {
        const storageKey = currentProject ? `workflow_live_variables_${currentProject.id}` : 'workflow_live_variables';
        const saved = localStorage.getItem(storageKey);
        if (saved) initialVars = JSON.parse(saved);
      } catch {}

      const result = await api.triggerExecution({
        project_id: currentProject.id,
        environment_id: envId,
        workflow_id: currentWorkflow?.id,
        initial_variables: initialVars,
      });

      showToast(`✅ Execution Completed for "${currentProject.name}"!`);
      setExecutions((prev) => [result, ...prev.filter((e) => e.id !== result.id)]);
      setSelectedExecution(result);

      const evals = await api.getEvaluationResults(result.id).catch(() => []);
      setEvaluations(evals);

      setActiveTab('executions');
    } catch (e) {
      showToast('⚠️ Backend simulated execution for project flow.');
      await handleRunDemo('v1_full');
    } finally {
      setIsRunningDemo(false);
    }
  };

  const pendingHITLCount = executions.filter((e) => e.status === 'WAITING_FOR_HUMAN').length;

  const handleSaveDataset = async (dataset: { name: string; description?: string; headers: string[]; rows: any[] }) => {
    if (!currentProject) {
      showToast('⚠️ Please select a project first.');
      return;
    }
    try {
      const saved = await api.createDataset({
        project_id: currentProject.id,
        name: dataset.name,
        description: dataset.description,
        headers: dataset.headers,
        rows: dataset.rows,
      });
      showToast(`📊 Dataset "${saved.name}" saved with ${saved.rows?.length || 0} scenarios!`);
      const dsets = await api.getDatasets(currentProject.id);
      setDatasets(dsets);
    } catch (e) {
      showToast('Error saving dataset.');
    }
  };

  const handleDeleteDataset = async (datasetId: string) => {
    try {
      await api.deleteDataset(datasetId);
      showToast('🗑️ Dataset permanently deleted.');
      if (currentProject) {
        const dsets = await api.getDatasets(currentProject.id);
        setDatasets(dsets);
      }
    } catch (e) {
      showToast('Error deleting dataset.');
    }
  };

  const startPollingJob = (jobId: string, initialData?: any) => {
    localStorage.setItem('active_matrix_job_id', jobId);
    setIsFloatingPillDismissed(false);

    if (initialData) {
      setActiveMatrixJob(initialData);
    }

    if (pollingIntervalRef.current) {
      clearTimeout(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    let isPollingInFlight = false;
    let isStopped = false;

    const scheduleNextPoll = (delayMs: number = 1500) => {
      if (isStopped) return;
      if (pollingIntervalRef.current) {
        clearTimeout(pollingIntervalRef.current);
      }
      pollingIntervalRef.current = setTimeout(poll, delayMs);
    };

    const poll = async () => {
      if (isPollingInFlight || isStopped) return;
      isPollingInFlight = true;
      try {
        const statusData = await api.getMatrixJobStatus(jobId);
        setActiveMatrixJob(statusData);

        if (statusData.status === 'COMPLETED') {
          isStopped = true;
          if (pollingIntervalRef.current) {
            clearTimeout(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          localStorage.removeItem('active_matrix_job_id');
          localStorage.setItem('matrix_job_completed_event', JSON.stringify({ ...statusData, _ts: Date.now() }));
          
          // Broadcast to all duplicate tabs
          try {
            const bc = new BroadcastChannel('matrix_jobs_sync');
            bc.postMessage({ type: 'JOB_COMPLETED', job: statusData });
            bc.close();
          } catch {}

          setShowMatrixCelebration(true);
          showToast(`🎉 Backend Matrix Job Complete: ${statusData.total_scenarios} Scenarios Executed!`);

          if (currentProject) {
            api.getExecutions(currentProject.id).then((allExecs) => {
              setExecutions(allExecs);
              if (allExecs.length > 0) setSelectedExecution(allExecs[0]);
            }).catch(() => {});
          }
          return;
        } else if (statusData.status === 'INTERRUPTED') {
          isStopped = true;
          if (pollingIntervalRef.current) {
            clearTimeout(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setActiveMatrixJob(statusData);
          showToast('⚠️ Matrix job was interrupted. Click Resume to continue.');
          return;
        } else if (statusData.status === 'FAILED') {
          isStopped = true;
          if (pollingIntervalRef.current) {
            clearTimeout(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setActiveMatrixJob(statusData);
          showToast(`⚠️ Matrix job stopped: ${statusData.error || 'Execution finished with failures'}`);
          return;
        }
      } catch (pollErr) {
        console.warn('Matrix job polling error:', pollErr);
      } finally {
        isPollingInFlight = false;
        if (!isStopped) {
          scheduleNextPoll(1500);
        }
      }
    };

    poll();
  };

  // Re-attach to running matrix job on page load, refresh, or duplicate tab!
  useEffect(() => {
    const resumeRunningJob = async () => {
      const savedJobId = localStorage.getItem('active_matrix_job_id');
      if (savedJobId) {
        try {
          const job = await api.getMatrixJobStatus(savedJobId);
          const isCurrentProj = !job.project_id || (currentProject && job.project_id === currentProject.id);
          if (isCurrentProj) {
            if (job && job.status === 'RUNNING') {
              startPollingJob(savedJobId, job);
              return;
            } else if (job && job.status === 'INTERRUPTED') {
              setActiveMatrixJob(job);
              return;
            }
          }
        } catch {
          localStorage.removeItem('active_matrix_job_id');
        }
      }

      // Also check server for active job specifically for this project
      if (currentProject) {
        try {
          const activeServerJob = await api.getActiveMatrixJob(currentProject.id);
          if (activeServerJob) {
            const isMatch = !activeServerJob.project_id || activeServerJob.project_id === currentProject.id;
            if (isMatch) {
              if (activeServerJob.status === 'RUNNING') {
                startPollingJob(activeServerJob.job_id, activeServerJob);
                return;
              } else if (activeServerJob.status === 'INTERRUPTED') {
                setActiveMatrixJob(activeServerJob);
                return;
              }
            }
          }
        } catch {}
      }

      // If no active job for current project, clear state
      setActiveMatrixJob(null);
    };

    resumeRunningJob();

    // BroadcastChannel for instant cross-tab sync
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('matrix_jobs_sync');
      bc.onmessage = (event) => {
        if (event.data?.type === 'JOB_COMPLETED') {
          const completedJob = event.data.job;
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setActiveMatrixJob(completedJob);
          setShowMatrixCelebration(true);
          if (currentProject) {
            api.getExecutions(currentProject.id).then((allExecs) => {
              setExecutions(allExecs);
              if (allExecs.length > 0) setSelectedExecution(allExecs[0]);
            }).catch(() => {});
          }
        }
      };
    } catch {}

    // Cross-tab storage synchronization listener
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'active_matrix_job_id') {
        if (e.newValue) {
          startPollingJob(e.newValue);
        }
      } else if (e.key === 'matrix_job_completed_event' && e.newValue) {
        try {
          const completedJob = JSON.parse(e.newValue);
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
          }
          setActiveMatrixJob(completedJob);
          setShowMatrixCelebration(true);
          if (currentProject) {
            api.getExecutions(currentProject.id).then((allExecs) => {
              setExecutions(allExecs);
              if (allExecs.length > 0) setSelectedExecution(allExecs[0]);
            }).catch(() => {});
          }
        } catch {}
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      if (bc) bc.close();
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [currentProject?.id]);

  const handleSaveProjectStrategy = async (strat: DatasetExecutionStrategy) => {
    if (!currentProject) return;
    try {
      await api.updateProjectExecutionStrategy(currentProject.id, strat);
      const updatedSettings = {
        ...(currentProject.settings || {}),
        dataset_execution_strategy: strat,
      };
      setCurrentProject((prev) => (prev ? { ...prev, settings: updatedSettings } : null));
      showToast('💾 Saved execution strategy as project template!');
    } catch (e) {
      console.error('Failed to save project execution strategy', e);
      showToast('Error saving project template');
    }
  };

  const handleRunBatchMatrix = async (
    dataset: TestDataset,
    strategy?: DatasetExecutionStrategy,
    selectedRowIndices?: number[]
  ) => {
    if (!currentProject) {
      showToast('⚠️ Please select a project first.');
      return;
    }

    try {
      const activeStrategy = strategy || dataset.strategy || currentProject?.settings?.dataset_execution_strategy;
      const envId = currentEnv?.id || currentProject.environments?.[0]?.id || 'env-default';
      const initJob = await api.startMatrixJob({
        project_id: currentProject.id,
        environment_id: envId,
        workflow_id: currentWorkflow?.id,
        dataset_id: dataset.id,
        dataset: {
          id: dataset.id,
          name: dataset.name,
          headers: dataset.headers,
          rows: dataset.rows,
        },
        strategy: activeStrategy,
        nodes: currentWorkflow?.nodes || [],
        edges: currentWorkflow?.edges || [],
        selected_row_indices: selectedRowIndices,
      });

      const grouped = groupDatasetIntoScenarios(
        dataset.headers || [],
        dataset.rows || [],
        activeStrategy,
        selectedRowIndices
      );
      const initialScenarios = grouped.map((sc) => ({
        rowIndex: sc.scenarioIndex,
        rowData: sc.rowData,
        status: 'PENDING',
        nodeResults: [],
        totalDurationMs: 0,
      }));

      const initialProgressState = {
        ...initJob,
        status: 'RUNNING',
        dataset_name: dataset.name,
        total_scenarios: grouped.length || 0,
        completed_scenarios: 0,
        current_scenario_index: 0,
        current_scenario_title: `Scenario #1: ${grouped[0]?.scenarioTitle || 'Executing...'}`,
        scenario_results: initialScenarios,
      };

      setIsMatrixModalOpen(true);
      setShowMatrixCelebration(false);
      const countLabel = selectedRowIndices && selectedRowIndices.length > 0
        ? `${grouped.length} Selected Scenario${grouped.length > 1 ? 's' : ''} (${selectedRowIndices.length} Rows)`
        : `${grouped.length} Scenarios (${dataset.rows?.length || 0} Rows)`;
      showToast(`🚀 Started Matrix Job: "${dataset.name}" (${countLabel})`);

      // Start polling with localStorage persistence
      startPollingJob(initJob.job_id, initialProgressState);

    } catch (e: any) {
      console.error('Failed to start matrix job:', e);
      showToast(`⚠️ Failed to start matrix job: ${e.message || 'Error'}`);
    }
  };

  const handleResumeJob = async (jobId: string) => {
    try {
      showToast('🔄 Resuming interrupted matrix job...');
      const res = await api.resumeMatrixJob(jobId);
      if (res.status === 'COMPLETED') {
        showToast('✅ All scenarios in this job are already completed.');
      } else {
        showToast(`⚡ Resumed job: ${res.resumed_scenarios_count || 'Remaining'} scenario(s) queued for execution.`);
      }
      setIsMatrixModalOpen(true);
      startPollingJob(jobId);
    } catch (e: any) {
      console.error('Failed to resume matrix job:', e);
      showToast(`⚠️ Resume failed: ${e.message || 'Error'}`);
    }
  };

  const handleRetryFailedJob = async (jobId: string) => {
    try {
      showToast('🔄 Retrying failed scenarios...');
      const res = await api.retryFailedMatrixJob(jobId);
      if (res.retrying_scenarios_count === 0) {
        showToast('ℹ️ No failed scenarios found to retry.');
      } else {
        showToast(`⚡ Retrying ${res.retrying_scenarios_count} failed scenario(s).`);
      }
      setIsMatrixModalOpen(true);
      startPollingJob(jobId);
    } catch (e: any) {
      console.error('Failed to retry matrix job:', e);
      showToast(`⚠️ Retry failed: ${e.message || 'Error'}`);
    }
  };

  const handleCancelMatrixJob = async (jobId: string) => {
    try {
      showToast('🗑️ Cancelling execution flow...');
      await api.cancelMatrixJob(jobId);
      if (pollingIntervalRef.current) {
        clearTimeout(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      setActiveMatrixJob(null);
      localStorage.removeItem('active_matrix_job_id');
      setIsMatrixModalOpen(false);
      showToast('Execution flow cancelled and removed.');
      if (currentProject) {
        const execs = await api.getExecutions(currentProject.id).catch(() => []);
        setExecutions(execs);
      }
    } catch (e: any) {
      console.error('Failed to cancel matrix job:', e);
      showToast(`⚠️ Error cancelling flow: ${e.message || 'Error'}`);
    }
  };

  const handleCancelAllFlows = async () => {
    try {
      showToast('🛑 Killing all running flows & worker tasks...');
      if (pollingIntervalRef.current) {
        clearTimeout(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      const currentJobId = activeMatrixJob?.job_id || activeMatrixJob?.id;
      if (currentJobId) {
        await api.cancelMatrixJob(currentJobId).catch(() => null);
      }
      await api.cancelAllExecutions();
      setActiveMatrixJob(null);
      localStorage.removeItem('active_matrix_job_id');
      setIsMatrixModalOpen(false);
      showToast('🛑 All running flows and tasks killed.');
      if (currentProject) {
        const execs = await api.getExecutions(currentProject.id).catch(() => []);
        setExecutions(execs);
      }
    } catch (e: any) {
      console.error('Failed to cancel all executions:', e);
      showToast(`⚠️ Error cancelling flows: ${e.message || 'Error'}`);
    }
  };

  const handleDismissJob = (_jobId: string) => {
    setIsFloatingPillDismissed(true);
    showToast('Notification minimized. You can access or resume this execution anytime in Swarm & Async Hub or the top bar.');
  };

  const handleDeleteExecution = async (executionId: string) => {
    try {
      await api.deleteExecution(executionId);
      showToast('🗑️ Execution run deleted.');
      if (currentProject) {
        const execs = await api.getExecutions(currentProject.id);
        setExecutions(execs);
        if (selectedExecution?.id === executionId) {
          setSelectedExecution(execs[0] || null);
        }
      }
    } catch (e) {
      showToast('Error deleting execution.');
    }
  };

  const handleClearHistory = async () => {
    if (!currentProject) return;
    if (window.confirm('Clear all execution history for this project?')) {
      try {
        await api.clearExecutions(currentProject.id);
        showToast('🗑️ All execution history cleared.');
        setExecutions([]);
        setSelectedExecution(null);
      } catch (e) {
        showToast('Error clearing execution history.');
      }
    }
  };

  const handleSaveWorkflow = async (workflow: Partial<Workflow>) => {
    if (!currentProject) {
      showToast('⚠️ Please select a project before saving.');
      return;
    }
    try {
      const flowName = (workflow.name || currentWorkflow?.name || 'Custom Test Workflow').trim();
      const saved = await api.saveWorkflow({
        ...workflow,
        name: flowName,
        project_id: currentProject.id,
      });
      showToast(`💾 Flow "${saved.name}" saved successfully!`);
      const wfs = await api.getWorkflows(currentProject.id);
      setWorkflows(wfs);
      setCurrentWorkflow(saved);
    } catch (e: any) {
      console.error('Error saving workflow:', e);
      const detail = e?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : (Array.isArray(detail) ? detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ') : e.message || 'Error saving workflow.');
      showToast(`⚠️ ${msg}`);
    }
  };

  if (isAuthLoading) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center text-white space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
        </div>
        <p className="text-xs font-mono text-slate-400">Authenticating secure session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-[#f4f6f8] flex selection:bg-indigo-600 selection:text-white">
      {/* Toast Notification (Top Center Floating Banner) */}
      {toastMessage && (
        <div
          style={{
            backgroundColor: '#0f172a',
            color: '#ffffff',
            border: '1px solid #334155',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.1)',
            zIndex: 99999,
          }}
          className="fixed top-5 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-200 pointer-events-auto select-none"
        >
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping shrink-0" />
          <AlertCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-slate-100 font-semibold tracking-wide whitespace-nowrap">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="w-5 h-5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors ml-1.5 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Full-Height Left Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'executions' && currentProject) {
            api.getExecutions(currentProject.id).then((allExecs) => {
              setExecutions(allExecs);
              if (allExecs.length > 0) setSelectedExecution(allExecs[0]);
            }).catch(() => {});
          }
        }}
        pendingHITLCount={pendingHITLCount}
      />

      {/* Right Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#f4f6f8]">
        {/* Top Navbar */}
        <Navbar
          projects={projects}
          currentProject={currentProject}
          onSelectProject={handleSelectProject}
          onOpenCreateProject={() => setIsCreateProjectOpen(true)}
          currentEnv={currentEnv}
          onSelectEnv={setCurrentEnv}
          releaseDecision={releaseDecision}
          onRunDemo={handleRunDemo}
          onRunCurrentWorkflow={handleExecuteCurrentWorkflow}
          isRunningDemo={isRunningDemo}
          activeMatrixJob={activeMatrixJob}
          onOpenMatrixModal={() => setIsMatrixModalOpen(true)}
        />

        {/* Main Workspace */}
        <main className="flex-1 p-8 overflow-y-auto bg-[#f4f6f8]">
          {activeTab === 'dashboard' && (
            <DashboardView
              executions={executions}
              releaseDecision={releaseDecision}
              projects={projects}
              currentProject={currentProject}
              onSelectProject={handleSelectProject}
              onOpenCreateProject={() => setIsCreateProjectOpen(true)}
              onOpenDeleteProjects={handleOpenDeleteProjects}
              onSelectExecution={handleSelectExecution}
              onRunDemo={handleRunDemo}
            />
          )}

          {activeTab === 'workflows' && (
            <WorkflowCanvas
              workflows={workflows}
              currentWorkflow={currentWorkflow}
              currentProjectId={currentProject?.id}
              onSelectWorkflow={setCurrentWorkflow}
              onExecuteWorkflow={handleExecuteCurrentWorkflow}
              onSaveWorkflow={handleSaveWorkflow}
            />
          )}

          {activeTab === 'executions' && (
            <LiveTraceViewer
              executions={executions}
              selectedExecution={selectedExecution}
              evaluations={evaluations}
              rca={rca}
              projectId={currentProject?.id}
              projectName={currentProject?.name}
              onSelectExecution={handleSelectExecution}
              onOpenHITL={() => setIsHITLOpen(true)}
              onOpenRCA={async (id) => {
                const rcaData = await api.getRCA(id).catch(() => null);
                if (rcaData) setRca(rcaData);
                setIsRCAOpen(true);
              }}
              onDeleteExecution={handleDeleteExecution}
              onClearHistory={handleClearHistory}
            />
          )}

          {activeTab === 'test_management' && (
            <TestManagementView
              testSuites={testSuites}
              datasets={datasets}
              currentProject={currentProject}
              currentWorkflow={currentWorkflow}
              onSaveDataset={handleSaveDataset}
              onRunBatchMatrix={handleRunBatchMatrix}
              onDeleteDataset={handleDeleteDataset}
              onSaveProjectStrategy={handleSaveProjectStrategy}
              onViewTraces={() => setActiveTab('executions')}
            />
          )}

          {activeTab === 'upload_document' && (
            <UploadDocumentView
              currentProject={currentProject}
              onNavigateToWorkflow={() => setActiveTab('workflows')}
            />
          )}

          {activeTab === 'swarm_async' && (
            <SwarmAsyncHubView
              currentProject={currentProject}
              activeMatrixJob={activeMatrixJob}
              onResumeMatrixJob={handleResumeJob}
              onRetryMatrixJob={handleRetryFailedJob}
              onDismissMatrixJob={handleDismissJob}
              onOpenMatrixModal={async (jobId) => {
                const job = await api.getMatrixJobStatus(jobId);
                setActiveMatrixJob(job);
                setIsMatrixModalOpen(true);
              }}
              onCancelMatrixJob={handleCancelMatrixJob}
              onCancelAllFlows={handleCancelAllFlows}
            />
          )}

          {activeTab === 'regression' && (
            <RegressionMatrix
              reports={regressionReports}
              currentReport={regressionReports[0] || null}
              onOpenRCA={() => setIsRCAOpen(true)}
            />
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-5xl">
              {/* Release Quality Gate Section */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold font-display text-slate-900">Release Quality Gate Policies</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Automated deployment guardrails and policy thresholds for {currentProject?.name}</p>
                  </div>
                  <div className={`px-3 py-1 rounded-xl text-xs font-bold border ${
                    executions.length === 0
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : releaseDecision?.verdict === 'GO'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border-rose-200'
                  }`}>
                    {executions.length === 0 ? 'PENDING (NO RUNS)' : releaseDecision?.verdict === 'GO' ? 'GO (Release Approved)' : 'NO-GO (BLOCKED)'}
                  </div>
                </div>

                {executions.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    No runs yet. Execute a test workflow to evaluate policy thresholds.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {releaseDecision?.checks.map((check, idx) => (
                      <div key={idx} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-900">{check.name}</span>
                          <span className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${check.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                            {check.passed ? 'PASS' : 'FAIL'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600">{check.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Secrets Vault Section */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <KeyRound className="w-4 h-4 text-blue-600" />
                    <h3 className="text-base font-bold font-display text-slate-900">Environment Variables & Secret Vault</h3>
                  </div>
                  <p className="text-xs text-slate-500">
                    Encrypted with AES-256 Fernet keys. Masked in all UI views and trace logs.
                  </p>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    Configured Secrets ({currentEnv?.name || 'QA'})
                  </h4>
                  {(!currentEnv?.secrets || currentEnv.secrets.length === 0) ? (
                    <p className="text-xs text-slate-400 py-3 text-center">
                      No secrets configured for this environment.
                    </p>
                  ) : (
                    <div className="space-y-2 font-mono text-xs">
                      {currentEnv.secrets.map((sec) => (
                        <div key={sec.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                          <div>
                            <span className="text-blue-700 font-bold">{sec.key}</span>
                            <div className="text-[10px] text-slate-500 font-sans">{sec.description || 'Encrypted Vault Token'}</div>
                          </div>
                          <span className="text-slate-600 font-bold">{sec.masked_value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'admin_panel' && user?.role?.toUpperCase() === 'ADMIN' && (
            <AdminPanelView />
          )}
        </main>
      </div>

      {/* Modals */}
      <CreateProjectModal
        isOpen={isCreateProjectOpen}
        onClose={() => setIsCreateProjectOpen(false)}
        onCreate={handleCreateProject}
      />

      <HITLModal
        isOpen={isHITLOpen}
        onClose={() => setIsHITLOpen(false)}
        execution={selectedExecution}
        onResolve={handleResolveHITL}
      />

      <RCAModal
        isOpen={isRCAOpen}
        onClose={() => setIsRCAOpen(false)}
        rca={rca}
        onPromoteToRegression={handlePromoteRCA}
      />

      <DeleteProjectsModal
        isOpen={isDeleteProjectsOpen}
        onClose={() => setIsDeleteProjectsOpen(false)}
        projects={projects}
        initialSelectedId={deleteInitialId}
        onDeleteProjects={handleDeleteProjects}
      />

      {/* ========================================================================= */}
      {/* GLOBAL PERSISTENT FLOATING BACKGROUND JOB PILL (Across ALL Tabs) */}
      {/* ========================================================================= */}
      {activeMatrixJob &&
        !isFloatingPillDismissed &&
        (activeMatrixJob.status === 'RUNNING' || activeMatrixJob.status === 'INTERRUPTED') &&
        (!activeMatrixJob.project_id || (currentProject && activeMatrixJob.project_id === currentProject.id)) &&
        !isMatrixModalOpen && (
        <div
          ref={pillRef}
          onMouseDown={handlePillMouseDown}
          style={
            pillPos
              ? {
                  position: 'fixed',
                  left: `${pillPos.x}px`,
                  top: `${pillPos.y}px`,
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  boxShadow: isDraggingPill ? '0 30px 60px -12px rgba(0, 0, 0, 0.85)' : '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
                  border: activeMatrixJob.status === 'INTERRUPTED' ? '1px solid #f59e0b' : isDraggingPill ? '1px solid #38bdf8' : '1px solid #334155',
                  zIndex: 9999,
                  userSelect: 'none',
                  cursor: isDraggingPill ? 'grabbing' : 'grab',
                  transform: isDraggingPill ? 'scale(1.02)' : 'scale(1)',
                  transition: isDraggingPill ? 'none' : 'box-shadow 0.2s, border-color 0.2s, transform 0.2s',
                }
              : {
                  position: 'fixed',
                  bottom: '24px',
                  right: '24px',
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
                  border: activeMatrixJob.status === 'INTERRUPTED' ? '1px solid #f59e0b' : '1px solid #334155',
                  zIndex: 9999,
                  userSelect: 'none',
                  cursor: 'grab',
                }
          }
          className="p-3.5 pr-4 rounded-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 group"
          title="Drag anywhere on this card to move it around"
        >
          {/* Subtle drag handle */}
          <div className="text-slate-500 group-hover:text-slate-300 transition-colors shrink-0">
            <GripVertical className="w-4 h-4" />
          </div>

          <div
            style={{
              backgroundColor: activeMatrixJob.status === 'INTERRUPTED' ? '#451a03' : '#1e293b',
              border: activeMatrixJob.status === 'INTERRUPTED' ? '1px solid #d97706' : '1px solid #0284c7',
            }}
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              activeMatrixJob.status === 'INTERRUPTED' ? 'text-amber-400' : 'text-sky-400'
            } shrink-0 shadow-inner pointer-events-none`}
          >
            {activeMatrixJob.status === 'INTERRUPTED' ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <Loader2 className="w-5 h-5 animate-spin" />
            )}
          </div>
          <div className="space-y-0.5 pointer-events-none">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-tight">
                {activeMatrixJob.status === 'INTERRUPTED' ? 'Matrix Job Interrupted' : 'Backend Matrix Job Running'}
              </span>
              <span
                style={{
                  backgroundColor: activeMatrixJob.status === 'INTERRUPTED' ? '#78350f' : '#1e293b',
                  color: activeMatrixJob.status === 'INTERRUPTED' ? '#fcd34d' : '#38bdf8',
                  border: activeMatrixJob.status === 'INTERRUPTED' ? '1px solid #d97706' : '1px solid #0284c7',
                }}
                className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold"
              >
                {activeMatrixJob.completed_scenarios || 0} of {activeMatrixJob.total_scenarios || 0} Done
              </span>
            </div>
            <p className="text-[11px] text-slate-300 font-mono truncate max-w-[260px]">
              {activeMatrixJob.status === 'INTERRUPTED'
                ? 'Server rebooted. Click Resume to finish remaining scenarios.'
                : activeMatrixJob.current_scenario_title || activeMatrixJob.dataset_name || 'Executing scenarios...'}
            </p>
          </div>

          {activeMatrixJob.status === 'INTERRUPTED' ? (
            <div className="flex items-center gap-1.5 ml-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleResumeJob(activeMatrixJob.job_id);
                }}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-md transition-all cursor-pointer flex items-center gap-1"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Resume</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMatrixModalOpen(true);
                }}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all cursor-pointer"
              >
                <span>Details</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 ml-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMatrixModalOpen(true);
                }}
                style={{ backgroundColor: '#2563eb' }}
                className="px-3.5 py-2 rounded-xl hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <span>View Progress</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm('Kill running flow and cancel all tasks immediately?')) {
                    handleCancelAllFlows();
                  }
                }}
                className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-1 shrink-0"
                title="Immediately kill running flow and all tasks"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Cancel All</span>
              </button>
            </div>
          )}

          {/* Dismiss / Close Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDismissJob(activeMatrixJob.job_id);
            }}
            className="w-7 h-7 rounded-xl bg-slate-800/80 hover:bg-rose-950 hover:text-rose-300 text-slate-400 flex items-center justify-center transition-colors cursor-pointer shrink-0 ml-1 border border-slate-700/60"
            title="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* GLOBAL MATRIX PROGRESS & RESULTS MODAL */}
      {/* ========================================================================= */}
      {isMatrixModalOpen && activeMatrixJob && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div
            style={{ height: '700px', maxHeight: '88vh', width: '840px', maxWidth: '95vw' }}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 p-5 shrink-0 bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs ${
                  activeMatrixJob.status === 'RUNNING'
                    ? 'bg-indigo-600 animate-pulse'
                    : activeMatrixJob.status === 'INTERRUPTED'
                    ? 'bg-amber-600'
                    : activeMatrixJob.status === 'FAILED'
                    ? 'bg-rose-600'
                    : 'bg-emerald-600'
                }`}>
                  {activeMatrixJob.status === 'RUNNING' ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : activeMatrixJob.status === 'INTERRUPTED' ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold font-display text-slate-900">
                      {activeMatrixJob.status === 'RUNNING'
                        ? `Executing Workflow on Matrix (${activeMatrixJob.scenario_results?.[0]?.nodeResults?.length || currentWorkflow?.nodes?.length || ''} Nodes)...`
                        : activeMatrixJob.status === 'INTERRUPTED'
                        ? 'Matrix Execution Interrupted (Crash Recovery Available)'
                        : activeMatrixJob.status === 'FAILED'
                        ? 'Matrix Execution Finished with Failures'
                        : 'Matrix Batch Execution Finished'}
                    </h3>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-bold ${
                      activeMatrixJob.status === 'RUNNING'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : activeMatrixJob.status === 'INTERRUPTED'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : activeMatrixJob.status === 'FAILED'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}>
                      {activeMatrixJob.status === 'RUNNING'
                        ? 'IN PROGRESS'
                        : activeMatrixJob.status === 'INTERRUPTED'
                        ? 'INTERRUPTED (DURABLE CHECKPOINT)'
                        : activeMatrixJob.status === 'FAILED'
                        ? 'FAILED SCENARIOS DETECTED'
                        : 'ALL COMPLETED'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Dataset: <strong>{activeMatrixJob.dataset_name}</strong> • {activeMatrixJob.completed_scenarios || 0} of {activeMatrixJob.total_scenarios || 0} Scenarios Completed
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeMatrixJob.status === 'RUNNING' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Are you sure you want to stop and kill this running flow?')) {
                        handleCancelAllFlows();
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                    title="Kill running flow and cancel all tasks"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Cancel All</span>
                  </button>
                )}

                <button
                  onClick={() => setIsMatrixModalOpen(false)}
                  title={activeMatrixJob.status === 'RUNNING' ? 'Minimize to Background' : 'Close dialog'}
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 cursor-pointer flex items-center gap-2"
                >
                  {activeMatrixJob.status === 'RUNNING' && (
                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-0.5 rounded-lg">
                      Run in Background ▾
                    </span>
                  )}
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scenarios Execution Live Stepper List (Scrollable Body) */}
            <div className="p-6 space-y-4 flex-1 overflow-y-auto min-h-0">
              {activeMatrixJob.status === 'INTERRUPTED' && (
                <div className="rounded-2xl p-4 bg-amber-50 border border-amber-300 flex items-center justify-between gap-4 animate-in fade-in">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center shrink-0 font-bold">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-amber-900">Execution Interrupted (Crash Recovery Ready)</h4>
                      <p className="text-xs text-amber-700">
                        The backend or session was restarted. {activeMatrixJob.completed_scenarios || 0} completed scenarios are safely persisted in the database.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleResumeJob(activeMatrixJob.job_id)}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Resume Remaining</span>
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Are you sure you want to cancel and delete this interrupted execution?')) {
                          handleCancelMatrixJob(activeMatrixJob.job_id);
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Cancel Flow</span>
                    </button>
                  </div>
                </div>
              )}

              {(activeMatrixJob.scenario_results || []).map((scenario: any, sIdx: number) => {
                const isScenarioRunning = scenario.status === 'RUNNING';
                const isScenarioSuccess = scenario.status === 'SUCCESS';
                const isScenarioFailed = scenario.status === 'FAILED';

                return (
                  <div
                    key={sIdx}
                    className={`rounded-2xl border p-4 space-y-3 transition-all ${
                      isScenarioRunning
                        ? 'bg-indigo-50/40 border-indigo-300 ring-2 ring-indigo-400/20'
                        : isScenarioSuccess
                        ? 'bg-white border-emerald-200 shadow-xs'
                        : isScenarioFailed
                        ? 'bg-rose-50/30 border-rose-200'
                        : 'bg-slate-50 border-slate-200 opacity-60'
                    }`}
                  >
                    {/* Scenario Header with Row Data */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-bold ${
                          isScenarioSuccess
                            ? 'bg-emerald-600 text-white'
                            : isScenarioRunning
                            ? 'bg-indigo-600 text-white animate-spin'
                            : isScenarioFailed
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-200 text-slate-600'
                        }`}>
                          {sIdx + 1}
                        </span>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">
                            Scenario #{sIdx + 1}: <span className="font-mono text-indigo-700 font-semibold">{scenario.rowData?.message || Object.values(scenario.rowData || {})[0] || 'Turn'}</span>
                          </h4>
                          {scenario.rowData?.followup && (
                            <p className="text-[11px] text-slate-500 font-mono">
                              Followup: <span className="text-slate-700">{scenario.rowData.followup}</span>
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {scenario.totalDurationMs !== undefined && scenario.totalDurationMs > 0 && (
                          <span className="flex items-center gap-1 text-[11px] font-mono text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {Number(scenario.totalDurationMs).toFixed(0)}ms
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                          isScenarioSuccess
                            ? 'bg-emerald-100 text-emerald-800'
                            : isScenarioRunning
                            ? 'bg-indigo-100 text-indigo-800'
                            : isScenarioFailed
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {scenario.status}
                        </span>
                      </div>
                    </div>

                    {/* Nodes within this Scenario */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                      {(scenario.nodeResults || []).map((nr: any, nIdx: number) => {
                        const isNodeRunning = nr.status === 'RUNNING';
                        const isNodeSuccess = nr.status === 'SUCCESS';
                        const isNodeFailed = nr.status === 'FAILED';
                        const isNodeSkipped = nr.status === 'SKIPPED';
                        const isExpanded = expandedMatrixNodeKey === `${sIdx}-${nIdx}`;

                        return (
                          <div
                            key={nIdx}
                            className={`p-3 rounded-xl border transition-all text-xs flex flex-col justify-between ${
                              isNodeRunning
                                ? 'bg-indigo-50/80 border-indigo-300 ring-2 ring-indigo-400/30'
                                : isNodeSuccess
                                ? 'bg-emerald-50/50 border-emerald-200'
                                : isNodeSkipped
                                ? 'bg-amber-50/60 border-amber-200'
                                : isNodeFailed
                                ? 'bg-rose-50/60 border-rose-200'
                                : 'bg-slate-100/70 border-slate-200 opacity-60'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 truncate max-w-[120px]">
                                {nr.nodeLabel}
                              </span>
                              <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                isNodeSuccess
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isNodeRunning
                                  ? 'bg-indigo-100 text-indigo-800 animate-pulse'
                                  : isNodeSkipped
                                  ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                  : isNodeFailed
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-200 text-slate-600'
                              }`}>
                                {isNodeRunning ? 'RUNNING...' : isNodeSkipped ? 'SKIPPED' : nr.statusCode ? `${nr.statusCode} ${nr.statusCode === 200 ? 'OK' : ''}` : nr.status}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono mt-2 pt-1 border-t border-slate-200/50">
                              <span>{nr.durationMs !== undefined ? `${Number(nr.durationMs).toFixed(0)}ms` : '--'}</span>
                              {nr.extractedVars && Object.keys(nr.extractedVars).length > 0 && (
                                <span className="text-emerald-700 font-bold flex items-center gap-1">
                                  <Zap className="w-3 h-3 text-amber-500" />
                                  {Object.keys(nr.extractedVars).join(', ')}
                                </span>
                              )}
                            </div>

                            {/* Node JSON inspection toggle */}
                            {(nr.hasPayload || nr.requestPayload || nr.responsePayload || nr.error) && (
                              <div className="mt-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleToggleInspectNode(sIdx, nIdx, nr.nodeKey)}
                                  className="text-[10px] font-mono text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <span>{isExpanded ? 'Hide JSON ▴' : 'Inspect JSON ▾'}</span>
                                  {loadingPayloadKey === `${sIdx}-${nIdx}` && (
                                    <span className="animate-spin text-blue-500">⟳</span>
                                  )}
                                </button>
                              </div>
                            )}

                            {/* Expanded JSON Inspector (Loaded On-Demand) */}
                            {isExpanded && (
                              <div className="mt-2 p-2 bg-slate-950 text-slate-100 rounded-lg text-[10px] font-mono space-y-1.5 overflow-hidden">
                                {loadingPayloadKey === `${sIdx}-${nIdx}` ? (
                                  <div className="text-slate-400 py-2 text-center animate-pulse">
                                    Loading payload on-demand...
                                  </div>
                                ) : (
                                  (() => {
                                    const cacheKey = `${activeMatrixJob?.job_id}_${sIdx}_${nr.nodeKey}`;
                                    const cached = nodePayloadsCache[cacheKey] || {};
                                    const reqP = cached.requestPayload || nr.requestPayload;
                                    const resP = cached.responsePayload || nr.responsePayload;
                                    const errP = cached.error || nr.error;

                                    return (
                                      <>
                                        {reqP && (
                                          <div>
                                            <span className="text-slate-400 block font-bold">Request Payload:</span>
                                            <div className="p-1 rounded bg-slate-900 text-blue-300 overflow-x-auto max-h-36">
                                              <pre>{JSON.stringify(reqP, null, 2)}</pre>
                                            </div>
                                          </div>
                                        )}
                                        {resP && (
                                          <div>
                                            <span className="text-slate-400 block font-bold">Response Payload:</span>
                                            <div className="p-1 rounded bg-slate-900 text-emerald-400 overflow-x-auto max-h-36">
                                              <pre>{JSON.stringify(resP, null, 2)}</pre>
                                            </div>
                                          </div>
                                        )}
                                        {errP && (
                                          <div className="text-rose-400 font-bold">
                                            Error: {typeof errP === 'object' ? JSON.stringify(errP) : errP}
                                          </div>
                                        )}
                                        {!reqP && !resP && !errP && (
                                          <div className="text-slate-500 italic">No payload captured for this step.</div>
                                        )}
                                      </>
                                    );
                                  })()
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-between border-t border-slate-100 p-5 shrink-0 bg-slate-50/70 flex-wrap gap-3">
              <span className="text-xs text-slate-600 font-mono">
                {activeMatrixJob.status === 'RUNNING'
                  ? '⚡ Backend background worker is executing HTTP requests...'
                  : activeMatrixJob.status === 'INTERRUPTED'
                  ? `⚠️ Execution was interrupted at scenario #${(activeMatrixJob.completed_scenarios || 0) + 1}. You can resume seamlessly.`
                  : activeMatrixJob.status === 'FAILED'
                  ? '⚠️ Some scenarios encountered errors during execution.'
                  : '✅ All scenarios executed cleanly in background.'}
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {activeMatrixJob.status === 'INTERRUPTED' && (
                  <>
                    <button
                      onClick={() => handleResumeJob(activeMatrixJob.job_id)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold shadow-sm transition-all cursor-pointer ring-2 ring-amber-300"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Resume Remaining Scenarios</span>
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm('Are you sure you want to cancel and delete this interrupted execution?')) {
                          handleCancelMatrixJob(activeMatrixJob.job_id);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 text-xs font-bold transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Cancel / Delete Flow</span>
                    </button>
                  </>
                )}

                {(activeMatrixJob.status === 'FAILED' || (activeMatrixJob.scenario_results || []).some((s: any) => s.status === 'FAILED')) && activeMatrixJob.status !== 'RUNNING' && (
                  <button
                    onClick={() => handleRetryFailedJob(activeMatrixJob.job_id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry Failed Scenarios</span>
                  </button>
                )}

                {activeMatrixJob.status !== 'RUNNING' && (
                  <button
                    onClick={() => {
                      setIsMatrixModalOpen(false);
                      setActiveTab('executions');
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>View in Result Capture & Traces ➜</span>
                  </button>
                )}
                {activeMatrixJob.status === 'RUNNING' && (
                  <button
                    onClick={() => {
                      if (window.confirm('Are you sure you want to stop and kill all running flows?')) {
                        handleCancelAllFlows();
                      }
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-all"
                    title="Kill running flow and cancel all tasks"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Cancel All Flow</span>
                  </button>
                )}
                <button
                  onClick={() => setIsMatrixModalOpen(false)}
                  className={`px-5 py-2 rounded-xl text-white text-xs font-bold shadow-xs cursor-pointer transition-all ${
                    activeMatrixJob.status === 'RUNNING'
                      ? 'bg-slate-800 hover:bg-slate-900'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                >
                  {activeMatrixJob.status === 'RUNNING' ? 'Run in Background ▾' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* GLOBAL JOB COMPLETION CELEBRATION POPUP */}
      {/* ========================================================================= */}
      {showMatrixCelebration && activeMatrixJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 text-center space-y-4 animate-in zoom-in-95">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center shadow-inner">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full uppercase tracking-wider border border-emerald-200">
                Job Completed Successfully
              </span>
              <h3 className="text-lg font-black text-slate-900 mt-2">
                🎉 Test Matrix Execution Finished!
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                All <strong>{activeMatrixJob.total_scenarios} Scenarios</strong> executed on{' '}
                <strong>{activeMatrixJob.dataset_name || 'Dataset'}</strong>.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-2xl text-left border border-slate-100">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Passed</span>
                <span className="text-emerald-700 font-bold text-sm">
                  {(activeMatrixJob.scenario_results || []).filter((s: any) => s.status === 'SUCCESS').length} / {activeMatrixJob.total_scenarios}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Failed</span>
                <span className="text-rose-600 font-bold text-sm">
                  {(activeMatrixJob.scenario_results || []).filter((s: any) => s.status === 'FAILED').length}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Duration</span>
                <span className="text-slate-900 font-bold text-sm">
                  {(
                    (activeMatrixJob.scenario_results || []).reduce((acc: number, cur: any) => acc + (cur.totalDurationMs || 0), 0) / 1000
                  ).toFixed(1)}s
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowMatrixCelebration(false);
                  setIsMatrixModalOpen(true);
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                🔍 Inspect Matrix
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowMatrixCelebration(false);
                  setActiveTab('executions');
                  if (currentProject) {
                    try {
                      const allExecs = await api.getExecutions(currentProject.id);
                      setExecutions(allExecs);
                      if (allExecs.length > 0) setSelectedExecution(allExecs[0]);
                    } catch {}
                  }
                }}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>📊 Navigate to Results</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
