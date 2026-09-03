import { WorkflowNode, WorkflowEdge, NodeType } from '../../../types';

export const DEFAULT_PARALLEL_NODES: WorkflowNode[] = [
  {
    node_key: 'n-token',
    node_type: 'API_REQUEST',
    label: 'Refresh Token',
    position_x: 60,
    position_y: 200,
    config: {
      url: 'https://api.travelservice.internal/v1/auth/token',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      extractions: [{ variable_name: 'auth_token', json_path: 'access_token' }]
    },
    assertions: []
  },
  {
    node_key: 'n-upload',
    node_type: 'API_REQUEST',
    label: 'Upload Document',
    position_x: 260,
    position_y: 200,
    config: {
      url: 'https://api.travelservice.internal/v1/documents/upload',
      method: 'POST',
      headers: { 'Authorization': 'Bearer {{auth_token}}' },
      extractions: [{ variable_name: 'doc_id', json_path: 'document.id' }]
    },
    assertions: []
  },
  {
    node_key: 'n-trigger',
    node_type: 'API_REQUEST',
    label: 'BOD Trigger Russ API',
    position_x: 460,
    position_y: 200,
    config: {
      url: 'https://api.travelservice.internal/v1/bod/trigger',
      method: 'POST',
      headers: { 'Authorization': 'Bearer {{auth_token}}' },
      body: { doc_id: '{{doc_id}}' },
      extractions: [{ variable_name: 'job_id', json_path: 'job.id' }]
    },
    assertions: []
  },
  // 3 Parallel Vertically Stacked API Nodes
  { node_key: 'n-opco', node_type: 'API_REQUEST', label: 'OPCO', position_x: 680, position_y: 80, config: { url: 'https://api.travelservice.internal/v1/opco/process', method: 'GET', headers: { 'Authorization': 'Bearer {{auth_token}}' } }, assertions: [] },
  { node_key: 'n-comp', node_type: 'AGENT', label: 'Comp Agent', position_x: 680, position_y: 200, config: { version: 'v1.0.0' }, assertions: [] },
  { node_key: 'n-news', node_type: 'API_REQUEST', label: 'News Tech', position_x: 680, position_y: 320, config: { url: 'https://api.travelservice.internal/v1/news/fetch', method: 'GET' }, assertions: [] },

  // Join back to sequential pipeline
  { node_key: 'n-job', node_type: 'API_REQUEST', label: 'BOD JOB Start', position_x: 900, position_y: 200, config: { url: 'https://api.travelservice.internal/v1/bod/jobs/start', method: 'POST', headers: { 'Authorization': 'Bearer {{auth_token}}' } }, assertions: [] },
  {
    node_key: 'n-pool',
    node_type: 'POLLING',
    label: 'Pooling BOD',
    position_x: 1080,
    position_y: 200,
    config: {
      url: 'https://api.travelservice.internal/v1/jobs/{{job_id}}/status',
      headers: { 'Authorization': 'Bearer {{auth_token}}' },
      status_key: 'status',
      target_status: 'COMPLETED',
      interval_seconds: 2,
      max_attempts: 10,
      extractions: [{ variable_name: 'final_report_id', json_path: 'report_id' }]
    },
    assertions: []
  },
  { node_key: 'n-report', node_type: 'API_REQUEST', label: 'BOD Report', position_x: 1280, position_y: 200, config: { url: 'https://api.travelservice.internal/v1/bod/report/{{final_report_id}}', method: 'GET', headers: { 'Authorization': 'Bearer {{auth_token}}' } }, assertions: [] },
  { node_key: 'n-end', node_type: 'END' as NodeType, label: 'End', position_x: 1460, position_y: 200, config: {}, assertions: [] },
];

export const DEFAULT_PARALLEL_EDGES: WorkflowEdge[] = [
  { source_node_key: 'n-token', target_node_key: 'n-upload' },
  { source_node_key: 'n-upload', target_node_key: 'n-trigger' },
  { source_node_key: 'n-trigger', target_node_key: 'n-opco' },
  { source_node_key: 'n-trigger', target_node_key: 'n-comp' },
  { source_node_key: 'n-trigger', target_node_key: 'n-news' },
  { source_node_key: 'n-opco', target_node_key: 'n-job' },
  { source_node_key: 'n-comp', target_node_key: 'n-job' },
  { source_node_key: 'n-news', target_node_key: 'n-job' },
  { source_node_key: 'n-job', target_node_key: 'n-pool' },
  { source_node_key: 'n-pool', target_node_key: 'n-report' },
  { source_node_key: 'n-report', target_node_key: 'n-end' },
];
