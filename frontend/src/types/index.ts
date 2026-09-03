export type UserRole = 'ADMIN' | 'QA_LEAD' | 'QA_ENGINEER' | 'VIEWER';
export type EnvironmentType = 'DEV' | 'QA' | 'UAT' | 'STAGING' | 'PRODUCTION';
export type AgentType = 'REST_API' | 'OPENAI' | 'AZURE_OPENAI' | 'ANTHROPIC' | 'CUSTOM' | 'MCP';
export type NodeType =
  | 'PROMPT'
  | 'FOLLOWUP_PROMPT'
  | 'AGENT'
  | 'API_REQUEST'
  | 'POLLING'
  | 'TOOL_CALL'
  | 'EXTRACT_VARIABLE'
  | 'CAPTURE_RESULT'
  | 'CHAT_URL_CREATOR'
  | 'CONDITION'
  | 'LOOP'
  | 'DELAY'
  | 'HUMAN_APPROVAL'
  | 'HUMAN_INPUT'
  | 'GMAIL'
  | 'OUTLOOK'
  | 'ATTACHMENT'
  | 'ASSERTION'
  | 'EVALUATION'
  | 'END';

export type ExecutionStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_FOR_HUMAN'
  | 'PASSED'
  | 'FAILED'
  | 'WARNING'
  | 'CANCELLED'
  | 'TIMEOUT'
  | 'DEADLOCK_DETECTED';

export type TraceEventType =
  | 'PROMPT'
  | 'AGENT_RESPONSE'
  | 'TOOL_CALL'
  | 'API_REQUEST'
  | 'API_RESPONSE'
  | 'VARIABLE_EXTRACT'
  | 'RESULT_CAPTURE'
  | 'HUMAN_INTERACTION'
  | 'EMAIL_SENT'
  | 'EMAIL_RECEIVED'
  | 'ASSERTION_CHECK'
  | 'EVALUATION_RESULT'
  | 'SWARM_HANDOFF'
  | 'CONTRACT_VIOLATION'
  | 'DEADLOCK_ABORTED';

export type EvaluationVerdict = 'PASS' | 'FAIL' | 'WARNING';
export type EvaluatorType = 'DETERMINISTIC' | 'SEMANTIC' | 'LLM_JUDGE' | 'TRACE_TRAJECTORY';

export interface SecretItem {
  id: string;
  environment_id: string;
  key: string;
  masked_value: string;
  description?: string;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  organization_id: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
  full_name?: string;
  role: UserRole;
  organization_id: string;
}

export interface Environment {
  id: string;
  project_id: string;
  name: string;
  env_type: EnvironmentType;
  base_url?: string;
  variables: Record<string, any>;
  secrets: SecretItem[];
  created_at: string;
}

export type ExecutionStrategyMode = 'FLAT_ROW_BY_ROW' | 'MULTI_TURN' | 'COMBINATORIAL_GRID';

export interface DatasetExecutionStrategy {
  mode: ExecutionStrategyMode;
  forward_fill_blanks?: boolean;
  group_by_column?: string;
  turn_column?: string;
  matrix_columns?: string[];
  parallel_limit?: number;
}

export interface Project {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description?: string;
  created_at: string;
  environments: Environment[];
  settings?: Record<string, any>;
}

export interface AgentVersion {
  id: string;
  agent_id: string;
  version_tag: string;
  endpoint_url?: string;
  model_name?: string;
  system_prompt?: string;
  tools_schema: any[];
  config: Record<string, any>;
  is_active: string;
  created_at: string;
}

export interface Agent {
  id: string;
  project_id: string;
  name: string;
  agent_type: AgentType;
  description?: string;
  created_at: string;
  versions: AgentVersion[];
}

export interface WorkflowNode {
  id?: string;
  node_key: string;
  node_type: NodeType;
  label: string;
  position_x: number;
  position_y: number;
  config: Record<string, any>;
  assertions: any[];
  is_disabled?: string;
}

export interface WorkflowEdge {
  id?: string;
  source_node_key: string;
  target_node_key: string;
  condition_expr?: string;
  label?: string;
}

export interface Workflow {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  version: string;
  created_at: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface TestCase {
  id: string;
  test_suite_id: string;
  workflow_id?: string;
  dataset_id?: string;
  title: string;
  description?: string;
  severity: string;
  priority: string;
  status: string;
  is_regression: string;
  promoted_from_execution_id?: string;
  expected_trace: any[];
  evaluator_configs: any[];
  created_at: string;
}

export interface TestSuite {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  tags: string[];
  created_at: string;
  test_cases: TestCase[];
}

export interface TestDataset {
  id: string;
  project_id: string;
  name: string;
  description?: string;
  headers: string[];
  rows: any[][];
  strategy?: DatasetExecutionStrategy;
  created_at: string;
}

export interface TraceEvent {
  id: string;
  execution_id: string;
  step_id?: string;
  sequence_number: number;
  event_type: TraceEventType;
  title: string;
  duration_ms: number;
  raw_payload?: Record<string, any>;
  normalized_payload?: Record<string, any>;
  provider?: string;
  model?: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  status: string;
  error?: string;
  timestamp: string;
}

export interface ExecutionStep {
  id: string;
  execution_id: string;
  node_key: string;
  node_type: string;
  step_order: number;
  status: ExecutionStatus;
  duration_ms: number;
  input_data?: Record<string, any>;
  output_data?: Record<string, any>;
  error_message?: string;
  started_at: string;
  completed_at?: string;
}

export interface SwarmMessage {
  id: string;
  execution_id: string;
  step_order: number;
  turn_index: number;
  sender_agent: string;
  recipient_agent: string;
  message_type: 'TASK_HANDOFF' | 'REVIEW' | 'TOOL_RESULT' | 'FINAL_OUTPUT';
  content: string;
  structured_payload?: Record<string, any>;
  tools_invoked?: any[];
  contract_status: 'PASSED' | 'FAILED' | 'SKIPPED';
  contract_violations?: Array<{ field?: string; message: string; rule?: string }>;
  similarity_score_to_previous?: number;
  is_loop_suspect?: string;
  latency_ms: number;
  tokens: number;
  created_at: string;
}

export interface HITLTask {
  id: string;
  execution_id: string;
  node_key: string;
  task_type: string;
  prompt_message: string;
  input_schema?: Record<string, any>;
  status: string;
  user_id?: string;
  response_payload?: Record<string, any>;
  comments?: string;
  timeout_seconds: number;
  created_at: string;
  resolved_at?: string;
}

export interface ExecutionRun {
  id: string;
  correlation_id: string;
  project_id: string;
  environment_id: string;
  agent_version_id?: string;
  test_case_id?: string;
  workflow_id?: string;
  dataset_row_index?: number;
  status: ExecutionStatus;
  total_duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  quality_score?: number;
  safety_score?: number;
  is_regression: string;
  error_message?: string;
  runtime_context: Record<string, any>;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  steps: ExecutionStep[];
  trace_events: TraceEvent[];
  hitl_tasks: HITLTask[];
}

export interface EvaluationResult {
  id: string;
  execution_id: string;
  evaluator_name: string;
  evaluator_type: EvaluatorType;
  layer: number;
  score: number;
  verdict: EvaluationVerdict;
  weight: number;
  reason?: string;
  evidence: string[];
  violations: string[];
  confidence: number;
  raw_response?: Record<string, any>;
  created_at: string;
}

export interface RCAAnalysis {
  id: string;
  execution_id: string;
  root_cause: string;
  confidence: number;
  affected_step: string;
  trace_evidence_ids: string[];
  suggested_fix: string;
  regression_probability: number;
  is_promoted_to_regression: string;
  created_at: string;
}

export interface RegressionReport {
  id: string;
  project_id: string;
  baseline_agent_version_id: string;
  target_agent_version_id: string;
  title: string;
  summary?: string;
  total_test_cases: number;
  baseline_pass_rate: number;
  target_pass_rate: number;
  pass_rate_delta: number;
  baseline_avg_latency_ms: number;
  target_avg_latency_ms: number;
  latency_delta_pct: number;
  baseline_avg_tokens: number;
  target_avg_tokens: number;
  regressions_detected: number;
  improvements_detected: number;
  metrics_diff: Record<string, any>;
  case_results: any[];
  release_recommendation: string;
  created_at: string;
}

export interface GateCheckResult {
  name: string;
  passed: boolean;
  threshold: any;
  actual: any;
  message: string;
}

export interface ReleaseDecision {
  verdict: 'GO' | 'NO-GO';
  passed: boolean;
  checks: GateCheckResult[];
  summary: string;
  blocking_reasons: string[];
}

export interface UploadedDocument {
  id: string;
  project_id: string;
  file_name: string;
  attachment_id: string;
  blob_url: string;
  file_size_bytes: number;
  content_type: string;
  api_url: string;
  method: string;
  status: 'UPLOADED' | 'FAILED' | 'READY';
  created_at: string;
  metadata?: Record<string, any>;
}

export interface DocumentUploadConfig {
  api_url: string;
  method: 'POST' | 'PUT';
  headers: Record<string, string>;
  file_field_name: string;
  extra_form_data: Record<string, string>;
  timeout_seconds: number;
}

export interface ReportColumnConfig {
  id: string;
  label: string;
  enabled: boolean;
  category?: 'metadata' | 'input' | 'output' | 'turns' | 'custom';
  description?: string;
  merge_rule?: 'by_scenario' | 'same_value' | 'none';
}

export interface ProjectReportTemplate {
  include_summary?: boolean;
  highlight_status?: boolean;
  wrap_text?: boolean;
  auto_fit_columns?: boolean;
  merge_scenario_cells?: boolean;
  format_urls_hyperlink?: boolean;
  columns: ReportColumnConfig[];
}

export interface ExcelExportRequest {
  project_id?: string;
  execution_ids?: string[];
  template?: ProjectReportTemplate;
  correlation_id?: string;
}

export interface WorkerNodeInfo {
  worker_id: string;
  hostname?: string;
  pid?: number;
  concurrency: number;
  active_tasks: number;
  completed_tasks: number;
  last_seen_at?: string;
  started_at?: string;
}

export interface QueueStats {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  desired_concurrency: number;
  total_active_workers: number;
  total_worker_concurrency: number;
  mode: 'DISTRIBUTED_WORKER' | 'EMBEDDED_WORKER';
  workers: WorkerNodeInfo[];
}

export interface QueueTaskItem {
  id: string;
  job_id: string;
  scenario_index: number;
  task_type: string;
  status: string;
  worker_id?: string;
  attempts: number;
  max_retries: number;
  duration_ms: number;
  error?: string;
  created_at?: string;
  completed_at?: string;
}

