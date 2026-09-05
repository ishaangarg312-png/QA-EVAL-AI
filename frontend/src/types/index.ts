export type UserRole = 'ADMIN' | 'QA' | 'QA_LEAD' | 'QA_ENGINEER' | 'VIEWER';
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

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: 'ADMIN' | 'QA';
  raw_role: string;
  is_active: boolean;
  last_active_at: string | null;
  last_login_at: string | null;
  last_ip: string | null;
  created_at: string | null;
  is_online: boolean;
}

export interface SystemMetrics {
  timestamp: string;
  hostname: string;
  platform: string;
  python_version: string;
  uptime_seconds: number;
  cpu: {
    usage_percent: number;
    core_count: number;
    logical_cpu_count: number;
    load_avg_1m: number;
    load_avg_5m: number;
    load_avg_15m: number;
  };
  memory: {
    total_mb: number;
    available_mb: number;
    used_mb: number;
    percent: number;
  };
  disk: {
    total_gb: number;
    used_gb: number;
    free_gb: number;
    percent: number;
  };
  aws_ec2?: {
    is_ec2: boolean;
    instance_id?: string;
    instance_type?: string;
    region?: string;
    availability_zone?: string;
    public_ip?: string;
    private_ip?: string;
  };
}

export interface KillSwitchItem {
  key: string;
  name: string;
  description: string;
  is_enabled: boolean;
  reason?: string | null;
  updated_by?: string | null;
  updated_at?: string | null;
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

// ---------------------------------------------------------------------------
// AI PROVIDER & USAGE TYPES
// ---------------------------------------------------------------------------
export interface AIProviderKeyItem {
  id: string;
  name: string;
  masked_key: string;
  is_active: boolean;
  is_primary: boolean;
  request_count?: number;
  created_at: string;
}

export interface DiscoveredModel {
  id: string;
  name: string;
  provider: string;
  description?: string;
  context_window?: number;
  input_price_per_m?: number;
  output_price_per_m?: number;
  supports_vision?: boolean;
  supports_function_calling?: boolean;
  is_recommended?: boolean;
  tags?: string[];
}

export interface ActivePlatformModel {
  id: string;
  model_id?: string;
  name?: string;
  display_name?: string;
  provider: string;
  is_default?: boolean;
  is_recommended?: boolean;
}

export interface AIProviderConfig {
  provider: string;
  name: string;
  description: string;
  docs_url: string;
  key_prefix_hint: string;
  is_enabled: boolean;
  is_configured: boolean;
  max_keys?: number;
  masked_key?: string;
  api_keys: AIProviderKeyItem[];
  available_models: DiscoveredModel[];
  selected_models: string[];
  custom_endpoint?: string;
  updated_at?: string;
}

export interface ModelTestConnectionResult {
  success: boolean;
  message?: string;
  latency_ms: number;
  models_found?: number;
  provider?: string;
  model?: string;
  available_models?: any[];
  selected_count?: number;
  error?: string;
  tokens_used?: any;
  response_preview?: string;
}

export interface AIUsageSummary {
  total_tokens: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_requests: number;
  successful_requests?: number;
  failed_requests?: number;
  avg_latency_ms: number;
  by_provider?: Record<string, { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number; requests?: number; tokens?: number }>;
}

export interface UserAIUsage {
  user_id: string;
  username: string;
  full_name: string;
  email: string;
  role: string;
  total_tokens: number;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  request_count: number;
  last_active_at?: string | null;
}

export interface AIUsageLogItem {
  id: string;
  user_id?: string;
  username?: string;
  user_email?: string;
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  latency_ms: number;
  request_type: string;
  status: string;
  error_message?: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// TEST GENERATOR TYPES
// ---------------------------------------------------------------------------
export type GeneratorMode = 'both' | 'test_case' | 'test_cases' | 'test_data' | 'hybrid';

export interface GeneratorColumnConfig {
  id: string;
  name: string;
  scope?: string;
  entity_id?: string;
  merge_rows?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'json';
  required?: boolean;
  description?: string;
  enum_values?: string[];
  example?: string;
  level?: string;
}

export interface EntityLevel {
  id: string;
  level_id?: string;
  name: string;
  parent_id?: string;
  description?: string;
  max_items_per_parent?: number;
  branching_ratio?: number;
  columns: GeneratorColumnConfig[];
}

export interface GeneratedTestCaseItem {
  test_case_id: string;
  title: string;
  description?: string;
  category?: string;
  severity?: string;
  priority?: string;
  steps: string[];
  expected_result?: string;
  test_data?: Record<string, any>;
  level_values?: Record<string, string>;
}

export interface GenerateTestPayload {
  prompt?: string;
  master_prompt?: string;
  instructions?: string;
  domain_preset?: string;
  mode?: GeneratorMode;
  max_test_cases?: number;
  max_test_data_per_case?: number;
  target_rows?: number;
  columns?: GeneratorColumnConfig[];
  hierarchy?: EntityLevel[];
  entity_levels?: EntityLevel[];
  model_id?: string;
  provider?: string;
  document_text?: string;
}

export interface GenerateTestResponse {
  status: string;
  columns?: GeneratorColumnConfig[];
  hierarchy?: EntityLevel[];
  rows?: Record<string, any>[];
  data?: any;
  total_rows?: number;
  total_cases?: number;
  total_data_rows?: number;
  model?: string;
  provider?: string;
  latency_ms?: number;
  total_tokens?: number;
  validation_warnings?: Array<{ severity: 'warning' | 'error'; type: string; message: string }>;
}

export interface ExportGeneratorExcelPayload {
  mode?: GeneratorMode;
  sheet_name?: string;
  columns?: GeneratorColumnConfig[];
  hierarchy?: EntityLevel[];
  entity_levels?: EntityLevel[];
  rows?: Record<string, any>[];
  data?: any;
  filename?: string;
  theme?: string;
}

// ---------------------------------------------------------------------------
// TEST DOCUMENT GENERATOR (DOCX / PDF / PPTX) TYPES
// ---------------------------------------------------------------------------
export type DocGeneratorFormat = 'all' | 'docx' | 'pdf' | 'pptx';

export interface DocTable {
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface DocCallout {
  type: 'info' | 'warning' | 'critical' | 'success' | 'note';
  title?: string;
  content: string;
}

export interface DocSection {
  heading: string;
  level: number;
  summary?: string;
  paragraphs?: string[];
  bullet_points?: string[];
  callouts?: DocCallout[];
  tables?: DocTable[];
  key_metrics?: Array<Record<string, string>>;
}

export interface PptxSlideCard {
  title: string;
  content: string;
  value?: string;
  description?: string;
  badge?: string;
  icon?: string;
}

export interface PptxSlide {
  slide_number: number;
  layout_type: 'title_slide' | 'agenda' | 'card_grid' | 'split_columns' | 'metric_callout' | 'table_slide' | 'conclusion';
  title: string;
  subtitle?: string;
  bullet_points?: string[];
  cards?: PptxSlideCard[];
  metrics?: Array<Record<string, string>>;
  table?: DocTable;
  speaker_notes?: string;
}

export interface DocumentMetadata {
  title: string;
  subtitle?: string;
  author?: string;
  organization?: string;
  version?: string;
  classification?: string;
  date_str?: string;
  project_name?: string;
  document_type?: string;
  confidentiality?: string;
  target_pages?: number;
  target_slides?: number;
  summary?: string;
}

export interface DocumentContentModel {
  meta: DocumentMetadata;
  executive_summary?: string;
  sections: DocSection[];
  slides: PptxSlide[];
}

export interface GenerateDocPayload {
  document_type: 'docx' | 'pdf' | 'pptx' | 'all';
  template_preset?: string;
  master_prompt: string;
  instructions?: string;
  target_count: number;
  document_text?: string;
  model_id?: string;
  provider?: string;
  title?: string;
  theme?: string;
}

export interface GenerateDocRequest extends GenerateDocPayload {}

export interface GenerateDocResponse {
  status: string;
  document_type: string;
  title: string;
  content: DocumentContentModel;
  total_sections: number;
  total_slides: number;
  model: string;
  provider: string;
  latency_ms: number;
  total_tokens: number;
}

export interface ExportDocPayload {
  document_type: 'docx' | 'pdf' | 'pptx' | 'all' | 'all_zip';
  content: DocumentContentModel;
  filename?: string;
  theme?: string;
}




