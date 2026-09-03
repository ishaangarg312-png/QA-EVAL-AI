import axios from 'axios';
import {
  Project,
  Agent,
  TestSuite,
  Workflow,
  TestDataset,
  ExecutionRun,
  EvaluationResult,
  RegressionReport,
  RCAAnalysis,
  ReleaseDecision,
  HITLTask,
  UploadedDocument,
  ProjectReportTemplate,
  ExcelExportRequest,
  User,
  TokenResponse,
  QueueStats,
  QueueTaskItem,
  SwarmMessage
} from '../types';

const API_BASE = '/api/v1';

const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach Bearer token to outgoing requests
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 Unauthorized globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (!error.config?.url?.includes('/auth/login') && !error.config?.url?.includes('/auth/google')) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('auth_user');
        window.dispatchEvent(new Event('auth:unauthorized'));
      }
    }
    return Promise.reject(error);
  }
);

export const api = {
  // Authentication
  login: async (email: string, password: string): Promise<TokenResponse> => {
    const res = await apiClient.post<TokenResponse>('/auth/login', { email, password });
    return res.data;
  },

  register: async (data: { email: string; full_name: string; password: string; role?: string }): Promise<User> => {
    const res = await apiClient.post<User>('/auth/register', data);
    return res.data;
  },

  getAuthConfig: async (): Promise<{ google_client_id: string }> => {
    const res = await apiClient.get<{ google_client_id: string }>('/auth/config');
    return res.data;
  },

  loginWithGoogle: async (idToken: string): Promise<TokenResponse> => {
    const res = await apiClient.post<TokenResponse>('/auth/google', { id_token: idToken });
    return res.data;
  },

  getMe: async (): Promise<User> => {
    const res = await apiClient.get<User>('/auth/me');
    return res.data;
  },

  // Projects
  getProjects: async (): Promise<Project[]> => {
    const res = await apiClient.get<Project[]>('/projects');
    return res.data;
  },

  createProject: async (name: string, description?: string): Promise<Project> => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const res = await apiClient.post<Project>('/projects', { name, slug, description });
    return res.data;
  },

  deleteProject: async (projectId: string): Promise<void> => {
    await apiClient.delete(`/projects/${projectId}`);
  },

  batchDeleteProjects: async (projectIds: string[]): Promise<{ deleted_count: number }> => {
    const res = await apiClient.post<{ deleted_count: number }>('/projects/batch-delete', { project_ids: projectIds });
    return res.data;
  },

  // Agents
  getAgents: async (projectId: string): Promise<Agent[]> => {
    const res = await apiClient.get<Agent[]>('/agents', { params: { project_id: projectId } });
    return res.data;
  },

  // Test Suites
  getTestSuites: async (projectId: string): Promise<TestSuite[]> => {
    const res = await apiClient.get<TestSuite[]>('/test-suites', { params: { project_id: projectId } });
    return res.data;
  },

  // Workflows
  getWorkflows: async (projectId: string): Promise<Workflow[]> => {
    const res = await apiClient.get<Workflow[]>('/workflows', { params: { project_id: projectId } });
    return res.data;
  },

  saveWorkflow: async (workflow: Partial<Workflow> & { project_id: string }): Promise<Workflow> => {
    if (workflow.id) {
      const res = await apiClient.put<Workflow>(`/workflows/${workflow.id}`, workflow);
      return res.data;
    }
    const res = await apiClient.post<Workflow>('/workflows', workflow);
    return res.data;
  },

  // Datasets
  getDatasets: async (projectId: string): Promise<TestDataset[]> => {
    const res = await apiClient.get<TestDataset[]>('/datasets', { params: { project_id: projectId } });
    return res.data;
  },

  createDataset: async (payload: {
    project_id: string;
    name: string;
    description?: string;
    headers: string[];
    rows: any[];
  }): Promise<TestDataset> => {
    const res = await apiClient.post<TestDataset>('/datasets', payload);
    return res.data;
  },

  deleteDataset: async (datasetId: string): Promise<void> => {
    await apiClient.delete(`/datasets/${datasetId}`);
  },

  // Executions
  getExecutions: async (projectId?: string): Promise<ExecutionRun[]> => {
    const res = await apiClient.get<ExecutionRun[]>('/executions', { params: { project_id: projectId } });
    return res.data;
  },

  getExecutionById: async (id: string): Promise<ExecutionRun> => {
    const res = await apiClient.get<ExecutionRun>(`/executions/${id}`);
    return res.data;
  },

  deleteExecution: async (executionId: string): Promise<void> => {
    await apiClient.delete(`/executions/${executionId}`);
  },

  clearExecutions: async (projectId?: string): Promise<void> => {
    await apiClient.delete('/executions', { params: { project_id: projectId } });
  },

  triggerExecution: async (payload: {
    project_id: string;
    environment_id: string;
    agent_version_id?: string;
    test_case_id?: string;
    workflow_id?: string;
    initial_variables?: Record<string, any>;
  }): Promise<ExecutionRun> => {
    const res = await apiClient.post<ExecutionRun>('/executions', payload);
    return res.data;
  },

  triggerBatchExecution: async (payload: {
    project_id: string;
    environment_id?: string;
    workflow_id?: string;
    dataset_id?: string;
    rows?: Array<Record<string, any>>;
  }): Promise<ExecutionRun[]> => {
    const res = await apiClient.post<ExecutionRun[]>('/executions/batch', payload);
    return res.data;
  },

  startMatrixJob: async (payload: {
    project_id: string;
    environment_id?: string;
    workflow_id?: string;
    dataset_id?: string;
    dataset?: any;
    strategy?: any;
    nodes?: any[];
    edges?: any[];
    selected_row_indices?: number[];
  }): Promise<{ job_id: string; status: string; dataset_name: string; total_scenarios: number }> => {
    const res = await apiClient.post('/executions/matrix-job', payload);
    return res.data;
  },

  updateProjectExecutionStrategy: async (projectId: string, strategy: any): Promise<any> => {
    const res = await apiClient.put(`/projects/${projectId}/execution-strategy`, { strategy });
    return res.data;
  },

  getMatrixJobStatus: async (jobId: string): Promise<any> => {
    const res = await apiClient.get(`/executions/matrix-job/${jobId}`);
    return res.data;
  },

  resumeMatrixJob: async (jobId: string): Promise<any> => {
    const res = await apiClient.post(`/executions/matrix-job/${jobId}/resume`);
    return res.data;
  },

  retryFailedMatrixJob: async (jobId: string): Promise<any> => {
    const res = await apiClient.post(`/executions/matrix-job/${jobId}/retry-failed`);
    return res.data;
  },

  getActiveMatrixJob: async (projectId?: string): Promise<any> => {
    const res = await apiClient.get('/executions/matrix-jobs/active', {
      params: projectId ? { project_id: projectId } : undefined,
    });
    return res.data;
  },

  getMatrixNodePayload: async (jobId: string, scenarioIndex: number, nodeKey: string): Promise<any> => {
    const res = await apiClient.get(`/executions/matrix-job/${jobId}/scenario/${scenarioIndex}/node/${nodeKey}/payload`);
    return res.data;
  },

  // Human-in-the-Loop
  getHITLTasks: async (): Promise<HITLTask[]> => {
    const res = await apiClient.get<HITLTask[]>('/hitl/tasks');
    return res.data;
  },

  resolveHITLTask: async (taskId: string, payload: { approved: boolean; comments?: string; inputs?: any }): Promise<HITLTask> => {
    const res = await apiClient.post<HITLTask>(`/hitl/tasks/${taskId}/resolve`, payload);
    return res.data;
  },

  // Evaluations
  getEvaluationResults: async (executionId: string): Promise<EvaluationResult[]> => {
    const res = await apiClient.get<EvaluationResult[]>(`/evaluations/results/${executionId}`);
    return res.data;
  },

  // Regression
  getRegressionReports: async (projectId: string): Promise<RegressionReport[]> => {
    const res = await apiClient.get<RegressionReport[]>('/regression/reports', { params: { project_id: projectId } });
    return res.data;
  },

  compareVersions: async (projectId: string, baselineId: string, targetId: string): Promise<RegressionReport> => {
    const res = await apiClient.post<RegressionReport>('/regression/compare', null, {
      params: {
        project_id: projectId,
        baseline_version_id: baselineId,
        target_version_id: targetId,
      },
    });
    return res.data;
  },

  // RCA & Promotion
  getRCA: async (executionId: string): Promise<RCAAnalysis> => {
    const res = await apiClient.get<RCAAnalysis>(`/rca/${executionId}`);
    return res.data;
  },

  promoteToRegression: async (executionId: string, testSuiteId: string, title?: string, description?: string) => {
    const res = await apiClient.post(`/rca/${executionId}/promote-to-regression`, {
      test_suite_id: testSuiteId,
      title,
      description,
    });
    return res.data;
  },

  // Quality Gates
  evaluateQualityGate: async (projectId: string, policy?: any): Promise<ReleaseDecision> => {
    const res = await apiClient.post<ReleaseDecision>('/quality-gates/evaluate', policy || {
      min_quality_score: 85.0,
      min_safety_score: 90.0,
      max_critical_failures: 0,
      max_regressions: 0,
    }, { params: { project_id: projectId } });
    return res.data;
  },

  // Interactive Demo Scenarios
  runFullTravelWorkflowDemo: async (): Promise<ExecutionRun> => {
    const res = await apiClient.post<ExecutionRun>('/demo/run-full-travel-workflow');
    return res.data;
  },

  runRegressedAgentV2Demo: async (): Promise<ExecutionRun> => {
    const res = await apiClient.post<ExecutionRun>('/demo/run-regressed-agent-v2');
    return res.data;
  },

  // Documents & Attachments Management
  getProjectDocuments: async (projectId: string): Promise<UploadedDocument[]> => {
    try {
      const res = await apiClient.get<UploadedDocument[]>('/documents', { params: { project_id: projectId } });
      if (Array.isArray(res.data) && res.data.length > 0) {
        return res.data;
      }
    } catch {}

    // Fallback to project-keyed localStorage
    try {
      const saved = localStorage.getItem(`project_docs_${projectId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  },

  saveProjectDocuments: async (projectId: string, documents: UploadedDocument[]): Promise<void> => {
    try {
      await apiClient.post('/documents/bulk-save', { project_id: projectId, documents });
    } catch {}
    try {
      localStorage.setItem(`project_docs_${projectId}`, JSON.stringify(documents));
    } catch {}
  },

  deleteProjectDocument: async (documentId: string, projectId?: string): Promise<void> => {
    try {
      await apiClient.delete(`/documents/${documentId}`);
    } catch {}
    if (projectId) {
      try {
        const saved = localStorage.getItem(`project_docs_${projectId}`);
        if (saved) {
          const list: UploadedDocument[] = JSON.parse(saved);
          const filtered = list.filter((d) => d.id !== documentId && d.attachment_id !== documentId);
          localStorage.setItem(`project_docs_${projectId}`, JSON.stringify(filtered));
        }
      } catch {}
    }
  },

  // Project-Level Report Templates & Excel Export
  getProjectReportTemplate: async (projectId: string): Promise<ProjectReportTemplate | null> => {
    try {
      const res = await apiClient.get<{ template: ProjectReportTemplate }>(`/projects/${projectId}/report-template`);
      if (res.data && res.data.template && Object.keys(res.data.template).length > 0) {
        return res.data.template;
      }
    } catch {}
    try {
      const local = localStorage.getItem(`report_template_${projectId}`);
      return local ? JSON.parse(local) : null;
    } catch {
      return null;
    }
  },

  saveProjectReportTemplate: async (projectId: string, template: ProjectReportTemplate): Promise<void> => {
    try {
      await apiClient.put(`/projects/${projectId}/report-template`, { report_template: template });
    } catch {}
    try {
      localStorage.setItem(`report_template_${projectId}`, JSON.stringify(template));
    } catch {}
  },

  exportExecutionsExcel: async (request: ExcelExportRequest): Promise<Blob> => {
    const res = await apiClient.post('/executions/export-excel', request, {
      responseType: 'blob',
    });
    return res.data;
  },

  // Distributed Task Queue
  getQueueStats: async (projectId?: string): Promise<QueueStats> => {
    const res = await apiClient.get<QueueStats>('/queue/stats', {
      params: projectId ? { project_id: projectId } : undefined,
    });
    return res.data;
  },

  getQueueTasks: async (limit: number = 25, status?: string, projectId?: string): Promise<QueueTaskItem[]> => {
    const res = await apiClient.get<QueueTaskItem[]>('/queue/tasks', {
      params: { limit, status, project_id: projectId },
    });
    return res.data;
  },

  retryQueueTask: async (taskId: string): Promise<any> => {
    const res = await apiClient.post(`/queue/tasks/${taskId}/retry`);
    return res.data;
  },

  clearQueueTasks: async (projectId?: string): Promise<{ status: string; deleted_count: number }> => {
    const res = await apiClient.post<{ status: string; deleted_count: number }>('/queue/tasks/clear', null, {
      params: projectId ? { project_id: projectId } : undefined,
    });
    return res.data;
  },

  setQueueConcurrency: async (concurrency: number): Promise<{ status: string; concurrency: number; stats: QueueStats }> => {
    const res = await apiClient.post<{ status: string; concurrency: number; stats: QueueStats }>('/queue/concurrency', { concurrency });
    return res.data;
  },

  spawnWorkerProcess: async (concurrency: number = 2): Promise<{ status: string; pid: number; stats: QueueStats }> => {
    const res = await apiClient.post<{ status: string; pid: number; stats: QueueStats }>('/queue/workers/spawn', { concurrency });
    return res.data;
  },

  stopWorkerProcess: async (pid: number): Promise<{ status: string; pid: number; stats: QueueStats }> => {
    const res = await apiClient.post<{ status: string; pid: number; stats: QueueStats }>(`/queue/workers/${pid}/stop`);
    return res.data;
  },

  // Multi-Agent Swarm Testing
  getSwarmMessages: async (executionId: string): Promise<{ execution_id: string; total_messages: number; messages: SwarmMessage[] }> => {
    const res = await apiClient.get<{ execution_id: string; total_messages: number; messages: SwarmMessage[] }>(`/executions/${executionId}/swarm-messages`);
    return res.data;
  },

  ingestSwarmTrace: async (executionId: string, data: { payload?: any; swarm_trace?: any[]; contract_schema?: any; max_turns?: number }): Promise<any> => {
    const res = await apiClient.post(`/executions/${executionId}/swarm-trace`, data);
    return res.data;
  },

  dismissMatrixJob: async (jobId: string): Promise<any> => {
    const res = await apiClient.delete(`/executions/matrix-job/${jobId}`);
    return res.data;
  },

  cancelMatrixJob: async (jobId: string): Promise<any> => {
    const res = await apiClient.post(`/executions/matrix-job/${jobId}/cancel`);
    return res.data;
  },

  getProjectMatrixJobs: async (projectId: string): Promise<{ project_id: string; total: number; jobs: any[] }> => {
    const res = await apiClient.get<{ project_id: string; total: number; jobs: any[] }>(`/executions/projects/${projectId}/matrix-jobs`);
    return res.data;
  },

  // Project-Isolated Async Operations (CRUD)
  getProjectAsyncOperations: async (projectId: string): Promise<{ project_id: string; total: number; operations: any[] }> => {
    const res = await apiClient.get(`/executions/projects/${projectId}/async-operations`);
    return res.data;
  },

  deleteAsyncOperation: async (operationId: string): Promise<any> => {
    const res = await apiClient.delete(`/executions/async-operations/${operationId}`);
    return res.data;
  },

  clearProjectAsyncOperations: async (projectId: string): Promise<any> => {
    const res = await apiClient.post(`/executions/projects/${projectId}/async-operations/clear`);
    return res.data;
  },

  // Project-Isolated Swarm Contracts & Telemetry (CRUD)
  getProjectSwarmContracts: async (projectId: string): Promise<{ project_id: string; total: number; contracts: any[] }> => {
    const res = await apiClient.get(`/executions/projects/${projectId}/swarm-contracts`);
    return res.data;
  },

  createProjectSwarmContract: async (projectId: string, contract: { name: string; sender_agent: string; recipient_agent: string; contract_schema: any; max_turns?: number; is_active?: boolean }): Promise<any> => {
    const res = await apiClient.post(`/executions/projects/${projectId}/swarm-contracts`, contract);
    return res.data;
  },

  updateProjectSwarmContract: async (contractId: string, data: any): Promise<any> => {
    const res = await apiClient.put(`/executions/swarm-contracts/${contractId}`, data);
    return res.data;
  },

  deleteProjectSwarmContract: async (contractId: string): Promise<any> => {
    const res = await apiClient.delete(`/executions/swarm-contracts/${contractId}`);
    return res.data;
  },

  getProjectSwarmTelemetry: async (projectId: string): Promise<{ project_id: string; total_messages: number; total_contracts: number; violations_count: number; deadlocks_prevented: number; recent_messages: any[]; contracts: any[] }> => {
    const res = await apiClient.get(`/executions/projects/${projectId}/swarm-telemetry`);
    return res.data;
  },

  clearProjectSwarmMessages: async (projectId: string): Promise<any> => {
    const res = await apiClient.delete(`/executions/projects/${projectId}/swarm-messages`);
    return res.data;
  },
};

export const apiService = api;


