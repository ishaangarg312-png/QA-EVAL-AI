import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Sparkles,
  FileSpreadsheet,
  Layers,
  Upload,
  FileText,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Download,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  Copy,
  ChevronDown,
  Eye,
  X,
  FileCode,
  Sliders,
  Check,
  RefreshCw,
  Edit3,
  RotateCcw,
  GitBranch,
  Network,
  CornerDownRight,
  Code2
} from 'lucide-react';
import { apiService } from '../../services/api';
import {
  GeneratorMode,
  GeneratorColumnConfig,
  GeneratedTestCaseItem,
  GenerateTestResponse,
  ActivePlatformModel,
  Project,
  EntityLevel
} from '../../types';

interface TestGeneratorViewProps {
  currentProject: Project | null;
}

// Preset template configurations with pure dynamic N-Level Entity Trees
export const PRESET_TEMPLATES: {
  id: string;
  name: string;
  description: string;
  entity_levels: EntityLevel[];
}[] = [
  {
    id: 'four_level_tree',
    name: '4-Level QA Tree (Recommended)',
    description: 'Module → Test Case → Test Data → Follow-up Prompts with multi-level recursive cell merges',
    entity_levels: [
      {
        id: 'lvl_module',
        name: 'Module / Service',
        description: 'System microservice or architectural component',
        max_items_per_parent: 2,
        columns: [
          { id: 'module_id', name: 'Module ID', scope: 'lvl_module', entity_id: 'lvl_module', merge_rows: true, description: 'MOD-01' },
          { id: 'module_name', name: 'Module Name', scope: 'lvl_module', entity_id: 'lvl_module', merge_rows: true, description: 'Authentication Service' }
        ]
      },
      {
        id: 'lvl_case',
        name: 'Test Case Scenario',
        description: 'Business scenario under the module',
        max_items_per_parent: 2,
        columns: [
          { id: 'tc_id', name: 'Test Case ID', scope: 'lvl_case', entity_id: 'lvl_case', merge_rows: true, description: 'TC-AUTH-001' },
          { id: 'scenario_title', name: 'Scenario Title', scope: 'lvl_case', entity_id: 'lvl_case', merge_rows: true, description: 'User Login Flow' }
        ]
      },
      {
        id: 'lvl_data',
        name: 'Test Data Variant',
        description: 'Specific data inputs and primary expected behavior',
        max_items_per_parent: 2,
        columns: [
          { id: 'input_data', name: 'Test Input Data', scope: 'lvl_data', entity_id: 'lvl_data', merge_rows: true, description: 'email="user@test.com", password="***"' },
          { id: 'expected_behavior', name: 'Expected Behavior', scope: 'lvl_data', entity_id: 'lvl_data', merge_rows: true, description: '200 OK - Redirect to Dashboard' }
        ]
      },
      {
        id: 'lvl_followup',
        name: 'Follow-up Prompts & Edge Cases',
        description: 'Follow-up probe questions and edge assertions for this data variant',
        max_items_per_parent: 2,
        columns: [
          { id: 'followup_prompt', name: 'Follow-up Prompt / Turn', scope: 'lvl_followup', entity_id: 'lvl_followup', merge_rows: false, description: 'What if network times out during OTP?' },
          { id: 'edge_assertion', name: 'Assertion & State Check', scope: 'lvl_followup', entity_id: 'lvl_followup', merge_rows: false, description: 'Displays countdown retry banner' },
          { id: 'severity', name: 'Severity', scope: 'lvl_followup', entity_id: 'lvl_followup', merge_rows: false, description: 'High / Critical' }
        ]
      }
    ]
  },
  {
    id: 'standard_qa',
    name: '3-Level QA Matrix (Standard)',
    description: 'Module → Test Case → Test Data with merged Case IDs across data variants',
    entity_levels: [
      {
        id: 'lvl_module',
        name: 'Module / Feature',
        description: 'Feature component under test',
        max_items_per_parent: 3,
        columns: [
          { id: 'module', name: 'Module / Feature', scope: 'lvl_module', entity_id: 'lvl_module', merge_rows: true, description: 'Authentication' }
        ]
      },
      {
        id: 'lvl_case',
        name: 'Test Case',
        description: 'Test scenario definition',
        max_items_per_parent: 3,
        columns: [
          { id: 'tc_id', name: 'Test Case ID', scope: 'lvl_case', entity_id: 'lvl_case', merge_rows: true, description: 'TC-001' },
          { id: 'title', name: 'Scenario Title', scope: 'lvl_case', entity_id: 'lvl_case', merge_rows: true, description: 'Sign-in verification' },
          { id: 'preconditions', name: 'Pre-conditions', scope: 'lvl_case', entity_id: 'lvl_case', merge_rows: true, description: 'Account registered' }
        ]
      },
      {
        id: 'lvl_data',
        name: 'Test Data Variant',
        description: 'Input parameters and expected outcomes',
        max_items_per_parent: 3,
        columns: [
          { id: 'input_data', name: 'Test Input Data', scope: 'lvl_data', entity_id: 'lvl_data', merge_rows: false, description: 'email="valid@test.com"' },
          { id: 'expected', name: 'Expected Result', scope: 'lvl_data', entity_id: 'lvl_data', merge_rows: false, description: '200 OK' },
          { id: 'type', name: 'Test Type', scope: 'lvl_data', entity_id: 'lvl_data', merge_rows: false, description: 'Positive' }
        ]
      }
    ]
  },
  {
    id: 'api_matrix',
    name: 'API & Microservices Matrix',
    description: 'Endpoint Specification → Payload, Status & Assertion Variations',
    entity_levels: [
      {
        id: 'lvl_endpoint',
        name: 'Endpoint Specification',
        description: 'Route and protocol details',
        max_items_per_parent: 3,
        columns: [
          { id: 'api_id', name: 'Endpoint ID', scope: 'lvl_endpoint', entity_id: 'lvl_endpoint', merge_rows: true, description: 'API-001' },
          { id: 'endpoint', name: 'Endpoint & Method', scope: 'lvl_endpoint', entity_id: 'lvl_endpoint', merge_rows: true, description: 'POST /api/v1/auth/login' },
          { id: 'headers_auth', name: 'Auth & Headers', scope: 'lvl_endpoint', entity_id: 'lvl_endpoint', merge_rows: true, description: 'Bearer JWT or Public' }
        ]
      },
      {
        id: 'lvl_payload',
        name: 'Payload Variations',
        description: 'Payload states and assertions',
        max_items_per_parent: 3,
        columns: [
          { id: 'payload', name: 'Request Payload', scope: 'lvl_payload', entity_id: 'lvl_payload', merge_rows: false, description: 'JSON body or params' },
          { id: 'status_code', name: 'Expected Status', scope: 'lvl_payload', entity_id: 'lvl_payload', merge_rows: false, description: '200, 400, 401, 404' },
          { id: 'schema_assertion', name: 'Assertion Logic', scope: 'lvl_payload', entity_id: 'lvl_payload', merge_rows: false, description: 'Field checks & error keys' }
        ]
      }
    ]
  },
  {
    id: 'boundary_matrix',
    name: 'Boundary Value & Edge Cases',
    description: 'Field Under Test → Boundary Values & Error Messages',
    entity_levels: [
      {
        id: 'lvl_field',
        name: 'Field Under Test',
        description: 'Target input field or parameter',
        max_items_per_parent: 4,
        columns: [
          { id: 'tc_id', name: 'Case ID', scope: 'lvl_field', entity_id: 'lvl_field', merge_rows: true, description: 'BV-001' },
          { id: 'field_name', name: 'Field Name', scope: 'lvl_field', entity_id: 'lvl_field', merge_rows: true, description: 'Password, Age, Amount' }
        ]
      },
      {
        id: 'lvl_bv',
        name: 'Boundary Variations',
        description: 'Min/Max and edge state inputs',
        max_items_per_parent: 4,
        columns: [
          { id: 'test_boundary', name: 'Test Value (Boundary)', scope: 'lvl_bv', entity_id: 'lvl_bv', merge_rows: false, description: 'Min-1, Min, Max, Null' },
          { id: 'error_message', name: 'Expected Error Message', scope: 'lvl_bv', entity_id: 'lvl_bv', merge_rows: false, description: 'Exact validation string' },
          { id: 'severity', name: 'Severity Level', scope: 'lvl_bv', entity_id: 'lvl_bv', merge_rows: false, description: 'Critical, High, Medium' }
        ]
      }
    ]
  },
  {
    id: 'blank',
    name: 'Custom N-Level Hierarchy',
    description: 'Build your own infinite-level entity hierarchy with custom columns and merge rules',
    entity_levels: [
      {
        id: 'lvl_1',
        name: 'Parent Entity',
        description: 'Root level component',
        max_items_per_parent: 3,
        columns: [
          { id: 'col_1', name: 'Parent ID', scope: 'lvl_1', entity_id: 'lvl_1', merge_rows: true },
          { id: 'col_2', name: 'Parent Name', scope: 'lvl_1', entity_id: 'lvl_1', merge_rows: true }
        ]
      },
      {
        id: 'lvl_2',
        name: 'Child Entity',
        description: 'Child level component',
        max_items_per_parent: 3,
        columns: [
          { id: 'col_3', name: 'Child Input', scope: 'lvl_2', entity_id: 'lvl_2', merge_rows: false },
          { id: 'col_4', name: 'Child Expected', scope: 'lvl_2', entity_id: 'lvl_2', merge_rows: false }
        ]
      }
    ]
  }
];

export const flattenColumnsFromLevels = (levels: EntityLevel[]): GeneratorColumnConfig[] => {
  const flat: GeneratorColumnConfig[] = [];
  (levels || []).forEach(lvl => {
    (lvl.columns || []).forEach(col => {
      flat.push({
        ...col,
        entity_id: lvl.id,
        scope: lvl.id
      });
    });
  });
  return flat;
};

// Validation: Prevent invalid hierarchies, circular loops, duplicate columns/levels, and explosive multipliers
export interface HierarchyValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  estimatedRows: number;
}

export const validateHierarchyAndBudget = (
  levels: EntityLevel[],
  columns: GeneratorColumnConfig[],
  mode: GeneratorMode,
  maxCases?: number,
  maxDataPerCase?: number
): HierarchyValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  let estimatedRows = 1;

  if (!columns || columns.length === 0) {
    errors.push('Configure at least 1 column for the template.');
  }

  // 1. Check duplicate and blank column names (case-insensitive)
  const seenCols = new Set<string>();
  let hasBlankCol = false;
  columns.forEach(c => {
    const clean = (c.name || '').trim().toLowerCase();
    if (!clean) {
      hasBlankCol = true;
    } else if (seenCols.has(clean)) {
      const msg = `Duplicate column name "${c.name}" detected. Column names must be unique to avoid data loss.`;
      if (!errors.includes(msg)) errors.push(msg);
    } else {
      seenCols.add(clean);
    }
  });
  if (hasBlankCol) {
    errors.push('Column name cannot be blank.');
  }

  // 2. Check Entity Levels if in 'both' (hierarchical) mode
  if (mode === 'both' && levels && levels.length > 0) {
    const seenLevelNames = new Set<string>();
    const seenLevelIds = new Set<string>();

    levels.forEach((lvl, idx) => {
      const cleanName = (lvl.name || '').trim().toLowerCase();
      if (!cleanName) {
        errors.push(`Level ${idx + 1} must have a name.`);
      } else if (seenLevelNames.has(cleanName)) {
        const msg = `Duplicate entity level name "${lvl.name}". Each level must have a unique name.`;
        if (!errors.includes(msg)) errors.push(msg);
      } else {
        seenLevelNames.add(cleanName);
      }

      if (seenLevelIds.has(lvl.id)) {
        const msg = `Duplicate level ID detected (${lvl.id}).`;
        if (!errors.includes(msg)) errors.push(msg);
      } else {
        seenLevelIds.add(lvl.id);
      }

      // Check empty level
      const cols = lvl.columns || [];
      if (cols.length === 0) {
        errors.push(`Level "${lvl.name || `L${idx + 1}`}" has 0 columns. Every level must have at least 1 column.`);
      }

      // Multiplier bounds
      const mult = Number(lvl.max_items_per_parent) || 1;
      if (mult < 1 || mult > 15) {
        errors.push(`Level "${lvl.name || `L${idx + 1}`}" has invalid branching ratio (${mult}). Must be between 1 and 15.`);
      }
      estimatedRows *= mult;
    });

    // Combinatorial explosion check
    if (estimatedRows > 80) {
      errors.push(
        `Combinatorial explosion: Current multipliers will generate ~${estimatedRows} rows (safe ceiling is 80). Please lower your "Max / Parent" branching ratios.`
      );
    } else if (estimatedRows > 40) {
      warnings.push(
        `High token budget: Generating ~${estimatedRows} leaf rows will consume more AI tokens and take longer.`
      );
    }
  } else {
    // Flat modes: row budget estimation
    if (mode === 'test_case') {
      estimatedRows = Math.max(1, maxCases || 5);
    } else if (mode === 'test_data') {
      estimatedRows = Math.max(1, maxDataPerCase || 3);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    estimatedRows
  };
};

// Helper: Calculate leaf row span for any node in an N-level tree
export const getNodeLeafSpan = (node: any): number => {
  const children = node.children || node.data_rows || [];
  if (!children || children.length === 0) return 1;
  return children.reduce((acc: number, c: any) => acc + getNodeLeafSpan(c), 0);
};

// Helper: Build dynamic realistic mock tree for any N-level hierarchy (Zero AI cost)
export const generateMockPreviewTree = (levels: EntityLevel[]): any[] => {
  if (!levels || levels.length === 0) return [];

  const getMockFields = (lvl: EntityLevel, itemIdx: number) => {
    const fields: Record<string, string> = {};
    (lvl.columns || []).forEach(col => {
      const lower = col.name.toLowerCase();
      if (lower.includes('module id') || lower.includes('service id')) {
        fields[col.name] = `MOD-0${itemIdx + 1}`;
      } else if (lower.includes('module') || lower.includes('service') || lower.includes('feature')) {
        fields[col.name] = itemIdx === 0 ? 'Authentication Service' : 'Checkout & Payment';
      } else if (lower.includes('tc_id') || lower.includes('test case id') || lower.includes('case id')) {
        fields[col.name] = `TC-00${itemIdx + 1}`;
      } else if (lower.includes('scenario') || lower.includes('title')) {
        fields[col.name] = itemIdx === 0 ? 'Verify User Sign-In Flow' : 'Two-Factor OTP Verification';
      } else if (lower.includes('precondition')) {
        fields[col.name] = 'User account is registered';
      } else if (lower.includes('input') || lower.includes('data') || lower.includes('payload')) {
        fields[col.name] = itemIdx === 0 ? 'email="valid@test.com", otp="123456"' : 'email="invalid-format", otp="999999"';
      } else if (lower.includes('expected') || lower.includes('status')) {
        fields[col.name] = itemIdx === 0 ? '200 OK - Redirect to Dashboard' : '400 Bad Request - Format Error';
      } else if (lower.includes('followup') || lower.includes('follow-up') || lower.includes('prompt')) {
        fields[col.name] = itemIdx === 0 ? '"What if network times out during OTP?"' : '"Retry with expired session token"';
      } else if (lower.includes('assertion')) {
        fields[col.name] = itemIdx === 0 ? 'Displays retry countdown banner' : 'Redirects to /login?expired=1';
      } else if (lower.includes('type') || lower.includes('severity')) {
        fields[col.name] = itemIdx === 0 ? 'Positive / High' : 'Boundary / Medium';
      } else {
        fields[col.name] = `${lvl.name} ${itemIdx + 1} (${col.name})`;
      }
    });
    return fields;
  };

  const buildNodesAtLevel = (depth: number, parentPath: string): any[] => {
    if (depth >= levels.length) return [];
    const lvl = levels[depth];
    const isLeaf = depth === levels.length - 1;
    // 2 items per level for crisp visual preview
    const count = depth === 0 ? 2 : 2;

    const nodes = [];
    for (let i = 0; i < count; i++) {
      const nodePath = `${parentPath}_${i}`;
      const fields = getMockFields(lvl, i);
      const node: any = {
        id: `mock-${lvl.id}-${nodePath}`,
        level_id: lvl.id,
        level_name: lvl.name,
        fields,
        case_fields: fields
      };
      if (!isLeaf) {
        node.children = buildNodesAtLevel(depth + 1, nodePath);
        node.data_rows = node.children;
      }
      nodes.push(node);
    }
    return nodes;
  };

  return buildNodesAtLevel(0, 'root');
};

// Spreadsheet Grid Row and Cell representation matching openpyxl recursive merges
export interface SpreadsheetRowCell {
  colId: string;
  colName: string;
  value: string;
  shouldRender: boolean;
  rowSpan: number;
  isMerged: boolean;
  levelName?: string;
  nodeRef?: any;
}

export interface SpreadsheetRow {
  key: string;
  leafIndex: number;
  rootIndex: number;
  cells: SpreadsheetRowCell[];
}

export const buildSpreadsheetRows = (
  treeData: any[],
  levels: EntityLevel[],
  flatColumns: GeneratorColumnConfig[]
): SpreadsheetRow[] => {
  const rows: SpreadsheetRow[] = [];
  let globalLeafIdx = 0;

  const traverse = (
    node: any,
    levelIdx: number,
    rootIdx: number,
    ancestorStack: { node: any; levelIdx: number; isFirstLeaf: boolean; leafSpan: number }[]
  ) => {
    const leafSpan = getNodeLeafSpan(node);
    const children = node.children || node.data_rows || [];
    const isLeaf = !children || children.length === 0;

    if (isLeaf) {
      const currentStack = [...ancestorStack, { node, levelIdx, isFirstLeaf: true, leafSpan: 1 }];
      const cells: SpreadsheetRowCell[] = [];

      flatColumns.forEach(col => {
        let ownerEntry = currentStack.find(entry => {
          const lvl = levels[entry.levelIdx];
          return lvl && (col.entity_id === lvl.id || (lvl.columns || []).some(c => c.id === col.id || c.name === col.name));
        });

        if (!ownerEntry) {
          ownerEntry = currentStack.find(entry => {
            const f = entry.node.fields || entry.node.case_fields || entry.node;
            return f && (f[col.name] !== undefined || f[col.id] !== undefined);
          }) || currentStack[currentStack.length - 1];
        }

        const f = ownerEntry.node.fields || ownerEntry.node.case_fields || ownerEntry.node || {};
        const val = f[col.name] ?? f[col.id] ?? '';
        const isMerged = Boolean(col.merge_rows && ownerEntry.leafSpan > 1);

        if (isMerged) {
          if (ownerEntry.isFirstLeaf) {
            cells.push({
              colId: col.id,
              colName: col.name,
              value: String(val),
              shouldRender: true,
              rowSpan: ownerEntry.leafSpan,
              isMerged: true,
              levelName: levels[ownerEntry.levelIdx]?.name,
              nodeRef: ownerEntry.node
            });
          } else {
            cells.push({
              colId: col.id,
              colName: col.name,
              value: '',
              shouldRender: false,
              rowSpan: 1,
              isMerged: true,
              levelName: levels[ownerEntry.levelIdx]?.name,
              nodeRef: ownerEntry.node
            });
          }
        } else {
          cells.push({
            colId: col.id,
            colName: col.name,
            value: String(val),
            shouldRender: true,
            rowSpan: 1,
            isMerged: false,
            levelName: levels[ownerEntry.levelIdx]?.name,
            nodeRef: ownerEntry.node
          });
        }
      });

      rows.push({
        key: `row-${globalLeafIdx++}`,
        leafIndex: globalLeafIdx,
        rootIndex: rootIdx,
        cells
      });
    } else {
      children.forEach((child: any, childIdx: number) => {
        const isFirst = childIdx === 0;
        const parentFirst = ancestorStack.length === 0 ? isFirst : (ancestorStack[ancestorStack.length - 1].isFirstLeaf && isFirst);
        traverse(
          child,
          levelIdx + 1,
          rootIdx,
          [...ancestorStack, { node, levelIdx, isFirstLeaf: parentFirst, leafSpan }]
        );
      });
    }
  };

  (treeData || []).forEach((rootNode, rIdx) => {
    traverse(rootNode, 0, rIdx, []);
  });

  return rows;
};

// Helper: Build exact JSON output schema sent to LLM prompt
export const buildJsonSchemaPreview = (levels: EntityLevel[]): string => {
  const buildRecursive = (idx: number): any => {
    if (idx >= levels.length) return {};
    const lvl = levels[idx];
    const fields: Record<string, string> = {};
    (lvl.columns || []).forEach(c => {
      fields[c.name] = `<${c.name} for ${lvl.name}>`;
    });
    const obj: any = { fields };
    if (idx + 1 < levels.length) {
      obj.children = [buildRecursive(idx + 1)];
    }
    return obj;
  };

  const sampleTree = [buildRecursive(0)];
  return JSON.stringify(sampleTree, null, 2);
};

const SAMPLE_PROMPTS = [
  {
    label: 'User Auth & 2FA',
    text: 'User Authentication with Email, Password, and 6-digit SMS OTP verification. Include account lock after 5 failed attempts, password reset with expiring tokens, and session expiry.'
  },
  {
    label: 'E-Commerce Checkout',
    text: 'E-commerce cart checkout with multi-currency support, discount promo codes (single-use, percentage, fixed discount), out-of-stock validation, and credit card / UPI payment processing.'
  },
  {
    label: 'Flight Reservation',
    text: 'Flight booking engine with one-way and round-trip searches, passenger count limits (max 9), infant-to-adult ratio rules, promo fare seat availability, and baggage allowance selection.'
  }
];


export const TestGeneratorView: React.FC<TestGeneratorViewProps> = ({ currentProject }) => {
  // Generation Options
  const [mode, setMode] = useState<GeneratorMode>('both');
  const [masterPrompt, setMasterPrompt] = useState<string>('');
  const [instructions, setInstructions] = useState<string>('');
  const [maxCases, setMaxCases] = useState<number>(5);
  const [maxDataPerCase, setMaxDataPerCase] = useState<number>(3);

  // Columns & Template (Dynamic N-Level Entity Tree)
  const [entityLevels, setEntityLevels] = useState<EntityLevel[]>(PRESET_TEMPLATES[0].entity_levels);
  const [columns, setColumns] = useState<GeneratorColumnConfig[]>(
    flattenColumnsFromLevels(PRESET_TEMPLATES[0].entity_levels)
  );
  const [activePresetId, setActivePresetId] = useState<string>('four_level_tree');
  const [previewActiveTab, setPreviewActiveTab] = useState<'visual' | 'json'>('visual');
  const [schemaCopied, setSchemaCopied] = useState<boolean>(false);

  // Model Selection
  const [activeModels, setActiveModels] = useState<ActivePlatformModel[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState<string>('');
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);

  // Ingested Document
  const [uploadedDoc, setUploadedDoc] = useState<{
    filename: string;
    text: string;
    char_count: number;
    word_count: number;
  } | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState<boolean>(false);
  const [isPreviewDocModalOpen, setIsPreviewDocModalOpen] = useState<boolean>(false);
  const [isPreviewTemplateModalOpen, setIsPreviewTemplateModalOpen] = useState<boolean>(false);

  // Generation State & Output
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [generationResult, setGenerationResult] = useState<GenerateTestResponse | null>(null);
  const [editableData, setEditableData] = useState<GeneratedTestCaseItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Export State
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [isSavingDataset, setIsSavingDataset] = useState<boolean>(false);

  // Project-Level Persistence States
  const [isSavingPrompt, setIsSavingPrompt] = useState<boolean>(false);
  const [isSavingInstructions, setIsSavingInstructions] = useState<boolean>(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState<boolean>(false);
  const [promptSavedSuccess, setPromptSavedSuccess] = useState<boolean>(false);
  const [instructionsSavedSuccess, setInstructionsSavedSuccess] = useState<boolean>(false);
  const [templateSavedSuccess, setTemplateSavedSuccess] = useState<boolean>(false);

  // Template Import / Export States
  const [isExportingTemplateExcel, setIsExportingTemplateExcel] = useState<boolean>(false);
  const [isImportingTemplate, setIsImportingTemplate] = useState<boolean>(false);
  const [isExportTemplateMenuOpen, setIsExportTemplateMenuOpen] = useState<boolean>(false);
  const templateFileInputRef = useRef<HTMLInputElement>(null);

  // Real-time hierarchy & row budget validation
  const validation = useMemo(() => {
    return validateHierarchyAndBudget(entityLevels, columns, mode, maxCases, maxDataPerCase);
  }, [entityLevels, columns, mode, maxCases, maxDataPerCase]);

  // Fetch available AI models on mount
  useEffect(() => {
    loadActiveModels();
  }, []);

  // Load project-level saved configuration when currentProject changes
  useEffect(() => {
    if (currentProject?.id) {
      loadProjectConfig(currentProject.id);
    }
  }, [currentProject?.id]);

  const loadProjectConfig = async (projectId: string) => {
    try {
      const res = await apiService.getGeneratorProjectConfig(projectId);
      if (res) {
        if (res.master_prompt) {
          setMasterPrompt(res.master_prompt);
        }
        if (res.instructions) {
          setInstructions(res.instructions);
        }
        if (res.template_design) {
          if (res.template_design.entity_levels && res.template_design.entity_levels.length > 0) {
            setEntityLevels(res.template_design.entity_levels);
            setColumns(flattenColumnsFromLevels(res.template_design.entity_levels));
            setActivePresetId('custom');
          } else if (res.template_design.columns && res.template_design.columns.length > 0) {
            setColumns(res.template_design.columns);
            setActivePresetId('custom');
          }
          if (res.template_design.mode) {
            setMode(res.template_design.mode as GeneratorMode);
          }
          if (res.template_design.max_test_cases) {
            setMaxCases(res.template_design.max_test_cases);
          }
          if (res.template_design.max_test_data_per_case) {
            setMaxDataPerCase(res.template_design.max_test_data_per_case);
          }
        }
      }
    } catch (err) {
      console.warn('Could not load project generator config:', err);
    }
  };

  const handleSavePrompt = async () => {
    if (!currentProject) {
      setErrorMsg('Please select an active project first.');
      return;
    }
    if (!masterPrompt.trim()) {
      setErrorMsg('Prompt cannot be empty to save.');
      return;
    }
    setIsSavingPrompt(true);
    try {
      await apiService.saveGeneratorProjectPrompt(currentProject.id, masterPrompt);
      setPromptSavedSuccess(true);
      setTimeout(() => setPromptSavedSuccess(false), 3000);
      showToast(`Master prompt saved to project: "${currentProject.name}"`);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to save prompt');
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleSaveInstructions = async () => {
    if (!currentProject) {
      setErrorMsg('Please select an active project first.');
      return;
    }
    if (!instructions.trim()) {
      setErrorMsg('Instructions cannot be empty to save.');
      return;
    }
    setIsSavingInstructions(true);
    try {
      await apiService.saveGeneratorProjectInstructions(currentProject.id, instructions);
      setInstructionsSavedSuccess(true);
      setTimeout(() => setInstructionsSavedSuccess(false), 3000);
      showToast(`Instructions saved to project: "${currentProject.name}"`);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to save instructions');
    } finally {
      setIsSavingInstructions(false);
    }
  };

  const handleSaveTemplateDesign = async () => {
    if (!currentProject) {
      setErrorMsg('Please select an active project first.');
      return;
    }
    if (!validation.isValid) {
      setErrorMsg(validation.errors[0]);
      return;
    }
    setIsSavingTemplate(true);
    try {
      await apiService.saveGeneratorProjectTemplate(currentProject.id, {
        columns,
        entity_levels: mode === 'both' && entityLevels && entityLevels.length > 0 ? entityLevels : undefined,
        mode,
        max_test_cases: maxCases,
        max_test_data_per_case: maxDataPerCase
      });
      setTemplateSavedSuccess(true);
      setTimeout(() => setTemplateSavedSuccess(false), 3000);
      showToast(`Excel template design saved to project: "${currentProject.name}"`);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to save template design');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  // Export Blank Excel Template (.xlsx)
  const handleExportBlankExcelTemplate = async () => {
    setIsExportingTemplateExcel(true);
    setIsExportTemplateMenuOpen(false);
    try {
      const filename = `Blank_Test_Template_${Date.now()}.xlsx`;
      const blob = await apiService.exportGeneratorExcel({
        columns,
        data: [],
        entity_levels: mode === 'both' && entityLevels && entityLevels.length > 0 ? entityLevels : undefined,
        mode,
        sheet_name: 'Test Template',
        filename
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      showToast('Blank Excel template (.xlsx) downloaded successfully!');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to download blank template');
    } finally {
      setIsExportingTemplateExcel(false);
    }
  };

  // Export Template Configuration as JSON
  const handleExportTemplateConfigJSON = () => {
    setIsExportTemplateMenuOpen(false);
    const templateConfig = {
      name: activePresetId !== 'custom'
        ? PRESET_TEMPLATES.find(p => p.id === activePresetId)?.name || 'Custom Template'
        : 'Custom Template',
      exported_at: new Date().toISOString(),
      mode,
      entity_levels: entityLevels,
      columns,
      max_test_cases: maxCases,
      max_test_data_per_case: maxDataPerCase
    };
    const jsonStr = JSON.stringify(templateConfig, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Test_Template_Config_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Template configuration exported as JSON!');
  };

  // Import Template from File (.json or .xlsx / .csv)
  const handleImportTemplateFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingTemplate(true);
    setErrorMsg(null);

    const ext = file.name.split('.').pop()?.toLowerCase();

    if (ext === 'json') {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (parsed.entity_levels && Array.isArray(parsed.entity_levels) && parsed.entity_levels.length > 0) {
            setEntityLevels(parsed.entity_levels);
            setColumns(flattenColumnsFromLevels(parsed.entity_levels));
            setActivePresetId('custom');
          } else if (parsed.columns && Array.isArray(parsed.columns) && parsed.columns.length > 0) {
            setColumns(parsed.columns);
            setActivePresetId('custom');
          } else {
            setErrorMsg('Invalid template JSON: missing columns or entity_levels.');
            return;
          }

          if (parsed.mode) {
            setMode(parsed.mode as GeneratorMode);
          }
          if (parsed.max_test_cases) {
            setMaxCases(Number(parsed.max_test_cases));
          }
          if (parsed.max_test_data_per_case) {
            setMaxDataPerCase(Number(parsed.max_test_data_per_case));
          }
          showToast(`Template successfully imported from JSON: "${file.name}"!`);
        } catch (err: any) {
          setErrorMsg(`Failed to parse template JSON file: ${err.message}`);
        } finally {
          setIsImportingTemplate(false);
          if (templateFileInputRef.current) templateFileInputRef.current.value = '';
        }
      };
      reader.onerror = () => {
        setErrorMsg('Failed to read file from disk.');
        setIsImportingTemplate(false);
      };
      reader.readAsText(file);
    } else if (ext === 'xlsx' || ext === 'csv' || ext === 'xls') {
      try {
        const res = await apiService.importGeneratorTemplateExcel(file);
        if (res.entity_levels && res.entity_levels.length > 0) {
          setEntityLevels(res.entity_levels);
          setColumns(res.columns || flattenColumnsFromLevels(res.entity_levels));
          setActivePresetId('custom');
        } else if (res.columns && res.columns.length > 0) {
          setColumns(res.columns);
          setActivePresetId('custom');
        }
        if (res.mode) {
          setMode(res.mode as GeneratorMode);
        }
        showToast(`Template successfully imported from ${file.name} (${res.columns.length} columns detected)!`);
      } catch (err: any) {
        setErrorMsg(err.response?.data?.detail || err.message || 'Failed to import template from Excel file');
      } finally {
        setIsImportingTemplate(false);
        if (templateFileInputRef.current) templateFileInputRef.current.value = '';
      }
    } else {
      setErrorMsg('Unsupported template format. Please select a .json, .xlsx, or .csv file.');
      setIsImportingTemplate(false);
      if (templateFileInputRef.current) templateFileInputRef.current.value = '';
    }
  };

  const loadActiveModels = async () => {
    setIsLoadingModels(true);
    try {
      const res = await apiService.getActiveAIModels();
      if (res && res.models && res.models.length > 0) {
        setActiveModels(res.models);
        const groq = res.models.find((m: ActivePlatformModel) => m.provider === 'groq');
        const recommended = res.models.find((m: ActivePlatformModel) => m.is_recommended);
        const defaultModel = groq || recommended || res.models[0];
        setSelectedModelKey(`${defaultModel.provider}::${defaultModel.model_id}`);
      }
    } catch (err) {
      console.warn('Could not load active models from admin:', err);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  // Switch Template Preset
  const handlePresetSelect = (presetId: string) => {
    setActivePresetId(presetId);
    const preset = PRESET_TEMPLATES.find(p => p.id === presetId);
    if (preset) {
      const clonedLevels: EntityLevel[] = JSON.parse(JSON.stringify(preset.entity_levels));
      setEntityLevels(clonedLevels);
      setColumns(flattenColumnsFromLevels(clonedLevels));
    }
  };

  const updateEntityLevelsState = (newLevels: EntityLevel[]) => {
    setEntityLevels(newLevels);
    setColumns(flattenColumnsFromLevels(newLevels));
    setActivePresetId('custom');
  };

  // Level Management Functions (Pure Dynamic N-Level)
  const handleAddLevel = () => {
    const lvlNum = entityLevels.length + 1;
    const newId = `lvl_${Date.now()}`;
    const newLvl: EntityLevel = {
      id: newId,
      name: `Level ${lvlNum} Entity`,
      description: `Child level ${lvlNum}`,
      max_items_per_parent: 2,
      columns: [
        {
          id: `col_${Date.now()}_1`,
          name: `Field ${columns.length + 1}`,
          scope: newId,
          entity_id: newId,
          merge_rows: false
        }
      ]
    };
    updateEntityLevelsState([...entityLevels, newLvl]);
  };

  const handleRemoveLevel = (lvlIdx: number) => {
    if (entityLevels.length <= 1) {
      alert('Template hierarchy must have at least 1 entity level.');
      return;
    }
    const next = entityLevels.filter((_, i) => i !== lvlIdx);
    updateEntityLevelsState(next);
  };

  const handleMoveLevel = (lvlIdx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? lvlIdx - 1 : lvlIdx + 1;
    if (targetIdx < 0 || targetIdx >= entityLevels.length) return;
    const next = [...entityLevels];
    const temp = next[lvlIdx];
    next[lvlIdx] = next[targetIdx];
    next[targetIdx] = temp;
    updateEntityLevelsState(next);
  };

  const handleUpdateLevel = (lvlIdx: number, updates: Partial<EntityLevel>) => {
    const next = [...entityLevels];
    next[lvlIdx] = { ...next[lvlIdx], ...updates };
    updateEntityLevelsState(next);
  };

  const handleAddColumnToLevel = (lvlIdx: number) => {
    const next = [...entityLevels];
    const target = next[lvlIdx];
    const newId = `col_${Date.now()}`;
    const isParent = lvlIdx < entityLevels.length - 1;
    const newCol: GeneratorColumnConfig = {
      id: newId,
      name: `${target.name} Column ${(target.columns || []).length + 1}`,
      scope: target.id,
      entity_id: target.id,
      merge_rows: isParent
    };
    target.columns = [...(target.columns || []), newCol];
    updateEntityLevelsState(next);
  };

  const handleUpdateLevelColumn = (lvlIdx: number, colIdx: number, updates: Partial<GeneratorColumnConfig>) => {
    const next = [...entityLevels];
    const cols = [...(next[lvlIdx].columns || [])];
    cols[colIdx] = { ...cols[colIdx], ...updates };
    next[lvlIdx].columns = cols;
    updateEntityLevelsState(next);
  };

  const handleRemoveLevelColumn = (lvlIdx: number, colIdx: number) => {
    const totalCols = entityLevels.reduce((acc, l) => acc + (l.columns?.length || 0), 0);
    if (totalCols <= 1) {
      alert('At least 1 column is required in your template.');
      return;
    }
    const next = [...entityLevels];
    next[lvlIdx].columns = (next[lvlIdx].columns || []).filter((_, i) => i !== colIdx);
    updateEntityLevelsState(next);
  };

  const handleMoveLevelColumn = (lvlIdx: number, colIdx: number, direction: 'up' | 'down') => {
    const next = [...entityLevels];
    const cols = [...(next[lvlIdx].columns || [])];
    const targetIdx = direction === 'up' ? colIdx - 1 : colIdx + 1;
    if (targetIdx < 0 || targetIdx >= cols.length) return;
    const temp = cols[colIdx];
    cols[colIdx] = cols[targetIdx];
    cols[targetIdx] = temp;
    next[lvlIdx].columns = cols;
    updateEntityLevelsState(next);
  };

  // Fallback Add Column for flat mode
  const handleAddColumn = () => {
    if (entityLevels.length > 0) {
      handleAddColumnToLevel(entityLevels.length - 1);
      return;
    }
    const newId = `col_${Date.now()}`;
    const newCol: GeneratorColumnConfig = {
      id: newId,
      name: `Column ${columns.length + 1}`,
      scope: mode === 'test_data' ? 'data' : 'case',
      merge_rows: false
    };
    setColumns([...columns, newCol]);
    setActivePresetId('custom');
  };

  // Handle Document Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDoc(true);
    setErrorMsg(null);
    try {
      const res = await apiService.parseGeneratorDocument(file);
      setUploadedDoc({
        filename: res.filename,
        text: res.text,
        char_count: res.char_count,
        word_count: res.word_count
      });
      showToast(`Document parsed: ${res.word_count.toLocaleString()} words extracted`);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to upload document');
    } finally {
      setIsUploadingDoc(false);
      e.target.value = '';
    }
  };

  // Trigger Generation
  const handleGenerate = async () => {
    if (!validation.isValid) {
      setErrorMsg(validation.errors[0]);
      return;
    }
    if (!masterPrompt.trim() && !uploadedDoc?.text) {
      setErrorMsg('Please enter a Master Prompt or upload a requirement document.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);
    setGenerationStep('Formatting prompt & dynamic column schema...');

    let provider: string | undefined;
    let model_id: string | undefined;

    if (selectedModelKey) {
      const parts = selectedModelKey.split('::');
      provider = parts[0];
      model_id = parts[1];
    }

    try {
      setGenerationStep('Calling AI Model for structured JSON test data...');
      const response = await apiService.generateTestSuite({
        mode,
        master_prompt: masterPrompt,
        instructions: instructions.trim() || undefined,
        columns,
        entity_levels: mode === 'both' && entityLevels && entityLevels.length > 0 ? entityLevels : undefined,
        max_test_cases: maxCases,
        max_test_data_per_case: maxDataPerCase,
        document_text: uploadedDoc?.text,
        model_id,
        provider
      });

      setGenerationResult(response);
      setEditableData(response.data);
      setGenerationStep('');
      showToast(`Generated ${response.total_cases} test cases with ${response.total_data_rows} test data rows in ${response.latency_ms}ms!`);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'AI Generation failed');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  // Update Cell Inline in Interactive Preview
  const handleEditCell = (nodeRef: any, colName: string, newValue: string) => {
    if (!nodeRef) return;
    if (nodeRef.fields) nodeRef.fields[colName] = newValue;
    if (nodeRef.case_fields) nodeRef.case_fields[colName] = newValue;
    nodeRef[colName] = newValue;
    setEditableData([...editableData]);
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = async () => {
    if (!editableData || editableData.length === 0) {
      setErrorMsg('No generated data to export. Please run generation first.');
      return;
    }

    setIsExportingExcel(true);
    try {
      const safeProjectName = (currentProject?.name || 'QA_Suite').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${safeProjectName}_Test_Matrix_${Date.now()}.xlsx`;

      const blob = await apiService.exportGeneratorExcel({
        columns,
        data: editableData,
        entity_levels: mode === 'both' && entityLevels && entityLevels.length > 0 ? entityLevels : undefined,
        mode,
        sheet_name: 'Test Cases & Data',
        filename
      });

      // Trigger native download
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToast(`Excel spreadsheet successfully downloaded: ${filename}`);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to export Excel spreadsheet');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Save as Platform Dataset
  const handleSaveDataset = async () => {
    if (!editableData || editableData.length === 0) return;

    setIsSavingDataset(true);
    try {
      const res = await apiService.saveGeneratorDataset({
        project_id: currentProject?.id || 'proj-travel-01',
        name: `AI Generated Matrix - ${new Date().toLocaleDateString()}`,
        description: `Generated from master prompt: "${masterPrompt.slice(0, 80)}..."`,
        data: editableData,
        columns
      });

      showToast(`Saved as Platform Dataset: "${res.name}" with ${res.total_rows} rows!`);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to save dataset');

    } finally {
      setIsSavingDataset(false);
    }
  };

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50 text-slate-900"
      style={{ height: '100%', flex: 1, minHeight: 0, overflow: 'hidden' }}
    >
      {/* Toast notification */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-700 text-white font-medium text-xs shadow-2xl border border-emerald-500 animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
            <Sparkles className="w-5 h-5 text-indigo-100" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>Test Case & Test Data Generator</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                AI + Python Engine
              </span>
            </h1>
            <p className="text-[11px] text-slate-500">
              Generate structured test cases & test data with dynamic Excel cell merging and multi-format document ingestion
            </p>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setMode('both')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              mode === 'both'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Test Cases + Test Data (Merged Matrix)</span>
          </button>
          <button
            onClick={() => setMode('test_case')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              mode === 'test_case'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Test Cases Only</span>
          </button>
          <button
            onClick={() => setMode('test_data')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              mode === 'test_data'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Test Data Only</span>
          </button>
        </div>
      </header>

      {/* Main Studio Body: Split View (Left Config & Ingestion, Right Preview & Export) */}
      <div
        className="flex-1 flex overflow-hidden"
        style={{ width: '100%', maxWidth: '100%', height: '100%', flex: 1, minHeight: 0, overflow: 'hidden' }}
      >
        {/* Left Side: Configuration & Ingestion Workspace (70% Width) */}
        <div
          className="w-[70%] border-r border-slate-200 bg-white flex flex-col shrink-0 overflow-hidden"
          style={{ width: '70%', height: '100%', overflow: 'hidden' }}
        >
          {/* Header Action Bar for Left Pane (Pixel-aligned with Right Pane Export Studio Header) */}
          <div className="h-14 border-b border-slate-200 bg-white px-5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-800">Generation Setup</span>
            </div>
            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
              {mode === 'both' ? 'Merged Matrix' : mode === 'test_cases' ? 'Cases Only' : 'Data Only'}
            </span>
          </div>

          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6 min-h-0">
            {/* Error Alert */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Generation Error</p>
                  <p className="mt-0.5 text-rose-700 leading-relaxed">{errorMsg}</p>
                </div>
                <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* AI Model Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  AI Generation Model
                </span>
                {isLoadingModels && <span className="text-[10px] text-slate-400">Loading models...</span>}
              </label>
              <select
                value={selectedModelKey}
                onChange={(e) => setSelectedModelKey(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {activeModels.map((m) => (
                  <option key={`${m.provider}::${m.model_id}`} value={`${m.provider}::${m.model_id}`}>
                    [{m.provider.toUpperCase()}] {m.display_name || m.model_id} {m.is_recommended ? '★ Recommended' : ''}
                  </option>
                ))}
                {activeModels.length === 0 && (
                  <option value="">Auto Provider Selection (Groq / OpenAI / Gemini)</option>
                )}
              </select>
            </div>

            {/* Master Prompt Section */}
            <div className="space-y-2">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Master Prompt / Requirement Spec</span>
                  <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 flex-wrap">
                  <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Presets:</span>
                  {SAMPLE_PROMPTS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setMasterPrompt(p.text)}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 font-medium cursor-pointer transition-colors border border-slate-200/60"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={masterPrompt}
                onChange={(e) => setMasterPrompt(e.target.value)}
                placeholder="Describe user stories, business rules, acceptance criteria, workflows, or validation rules..."
                rows={4}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none placeholder:text-slate-400 placeholder:font-sans"
              />

              {/* Master Prompt Persistence Bar */}
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[10px] text-slate-400">
                  {currentProject ? `Project: ${currentProject.name}` : 'Select a project to persist'}
                </span>
                <div className="flex items-center gap-1.5">
                  {masterPrompt && (
                    <button
                      onClick={() => setMasterPrompt('')}
                      className="px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors flex items-center gap-1 cursor-pointer"
                      title="Clear prompt to enter new requirement"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Clear Input</span>
                    </button>
                  )}
                  <button
                    onClick={handleSavePrompt}
                    disabled={isSavingPrompt || !masterPrompt.trim()}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      promptSavedSuccess
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                    }`}
                    title="Save master prompt for this project"
                  >
                    {isSavingPrompt ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : promptSavedSuccess ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Save className="w-3 h-3 text-indigo-600" />
                    )}
                    <span>{promptSavedSuccess ? 'Prompt Saved!' : 'Save Prompt'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Document Ingestion Hub */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-emerald-600" />
                  Ingest Specification Document
                </span>
                <span className="text-[10px] text-slate-400">PDF, DOCX, PPTX, XLSX, CSV, TXT</span>
              </label>

              {!uploadedDoc ? (
                <label className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-xl p-4 flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors bg-slate-50/50 hover:bg-indigo-50/20">
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isUploadingDoc}
                  />
                  {isUploadingDoc ? (
                    <div className="flex items-center gap-2 text-xs text-indigo-600 font-semibold">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Parsing file & extracting text...</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 text-slate-400" />
                      <span className="text-xs font-semibold text-slate-700">Click or drag document here</span>
                      <span className="text-[10px] text-slate-400">Extracted text will automatically feed AI context</span>
                    </>
                  )}
                </label>
              ) : (
                <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-emerald-700 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-slate-800 truncate max-w-[200px]">{uploadedDoc.filename}</p>
                      <p className="text-[10px] text-emerald-700 font-medium">
                        {uploadedDoc.word_count.toLocaleString()} words ({uploadedDoc.char_count.toLocaleString()} chars)
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setIsPreviewDocModalOpen(true)}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-emerald-100 transition-colors cursor-pointer"
                      title="Preview extracted plaintext"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setUploadedDoc(null)}
                      className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
                      title="Remove document"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Custom Instructions */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                  Additional Instructions & Constraints (Optional)
                </label>
                <div className="flex items-center gap-1.5">
                  {instructions && (
                    <button
                      onClick={() => setInstructions('')}
                      className="px-2 py-0.5 rounded-md text-[10px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors flex items-center gap-1 cursor-pointer"
                      title="Clear instructions to enter new instructions"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Clear</span>
                    </button>
                  )}
                  <button
                    onClick={handleSaveInstructions}
                    disabled={isSavingInstructions || !instructions.trim()}
                    className={`px-2 py-0.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                      instructionsSavedSuccess
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                    }`}
                    title="Save instructions for this project"
                  >
                    {isSavingInstructions ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : instructionsSavedSuccess ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Save className="w-3 h-3 text-indigo-600" />
                    )}
                    <span>{instructionsSavedSuccess ? 'Instructions Saved!' : 'Save Instructions'}</span>
                  </button>
                </div>
              </div>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Focus on SQL injection, boundary values for leap year dates, negative authorization checks, and empty strings..."
                rows={2}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none placeholder:text-slate-400"
              />
            </div>

            {/* Row Limits & Budget */}
            <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-100/70 border border-slate-200">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">
                  {mode === 'test_data' ? 'Max Total Rows' : 'Max Test Cases'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={maxCases}
                  onChange={(e) => setMaxCases(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {mode === 'both' ? (
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">
                    Max Variations / Case
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={maxDataPerCase}
                    onChange={(e) => setMaxDataPerCase(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              ) : (
                <div className="flex flex-col justify-center">
                  <span className="text-[10px] text-slate-500">Mode is Flat</span>
                  <span className="text-xs font-semibold text-slate-700">1 Row per Entity</span>
                </div>
              )}
            </div>

            {/* Dynamic Template & Columns Builder (N-Level Entity Tree) */}
            <div className="space-y-3 pt-1 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Network className="w-3.5 h-3.5 text-indigo-600" />
                    <span>N-Level Hierarchy & Columns</span>
                  </label>
                  <p className="text-[10px] text-slate-500">
                    {mode === 'both'
                      ? `${entityLevels.length} Entity Levels · ${columns.length} Total Columns`
                      : `${columns.length} Dynamic Columns`}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {/* Hidden Template File Input */}
                  <input
                    type="file"
                    ref={templateFileInputRef}
                    className="hidden"
                    accept=".json,.xlsx,.csv,.xls"
                    onChange={handleImportTemplateFile}
                  />

                  {/* Import Template Button */}
                  <button
                    onClick={() => templateFileInputRef.current?.click()}
                    disabled={isImportingTemplate}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                    title="Import template from .xlsx, .csv, or .json file"
                  >
                    {isImportingTemplate ? (
                      <RefreshCw className="w-3 h-3 animate-spin text-slate-500" />
                    ) : (
                      <Upload className="w-3 h-3 text-slate-600" />
                    )}
                    <span>Import</span>
                  </button>

                  {/* Export Template Dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setIsExportTemplateMenuOpen(!isExportTemplateMenuOpen)}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                      title="Export template design to Excel (.xlsx) or JSON"
                    >
                      {isExportingTemplateExcel ? (
                        <RefreshCw className="w-3 h-3 animate-spin text-slate-500" />
                      ) : (
                        <Download className="w-3 h-3 text-slate-600" />
                      )}
                      <span>Export</span>
                      <ChevronDown className="w-2.5 h-2.5 text-slate-400" />
                    </button>

                    {isExportTemplateMenuOpen && (
                      <div className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-xl border border-slate-200 z-50 py-1 animate-in fade-in zoom-in-95">
                        <button
                          onClick={handleExportBlankExcelTemplate}
                          disabled={isExportingTemplateExcel}
                          className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">Blank Excel (.xlsx)</p>
                            <p className="text-[10px] text-slate-400">Headers & cell styling</p>
                          </div>
                        </button>
                        <button
                          onClick={handleExportTemplateConfigJSON}
                          className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer border-t border-slate-100"
                        >
                          <FileCode className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">Template JSON (.json)</p>
                            <p className="text-[10px] text-slate-400">Hierarchy & merge rules</p>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Preview Template Button */}
                  <button
                    onClick={() => setIsPreviewTemplateModalOpen(true)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1 transition-all cursor-pointer shadow-2xs"
                    title="Preview Excel merged rows & LLM JSON prompt schema"
                  >
                    <Eye className="w-3 h-3 text-indigo-600" />
                    <span>Preview</span>
                  </button>

                  {/* Save Design Button */}
                  <button
                    onClick={handleSaveTemplateDesign}
                    disabled={isSavingTemplate || !validation.isValid}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 shadow-2xs transition-all cursor-pointer ${
                      templateSavedSuccess
                        ? 'bg-emerald-600 text-white'
                        : !validation.isValid
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                    title={!validation.isValid ? validation.errors[0] : 'Save Excel template column layout and merge rules for this project'}
                  >
                    {isSavingTemplate ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : templateSavedSuccess ? (
                      <Check className="w-3 h-3 text-emerald-200" />
                    ) : (
                      <Save className="w-3 h-3 text-slate-300" />
                    )}
                    <span>{templateSavedSuccess ? 'Saved!' : 'Save'}</span>
                  </button>
                </div>
              </div>

              {/* Preset Selector */}
              <div className="flex flex-wrap gap-1.5">
                {PRESET_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => handlePresetSelect(tpl.id)}
                    className={`text-[10px] px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                      activePresetId === tpl.id
                        ? 'bg-slate-900 text-white font-bold shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tpl.name.split(' (')[0]}
                  </button>
                ))}
              </div>

              {/* Real-time Hierarchy & Row Budget Status Badge */}
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      !validation.isValid
                        ? 'bg-rose-500 animate-pulse'
                        : validation.warnings.length > 0
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                  />
                  <span className="font-semibold text-slate-700">
                    Est. Output: ~{validation.estimatedRows} {mode === 'both' ? 'leaf rows' : 'rows'}
                  </span>
                </div>

                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    !validation.isValid
                      ? 'bg-rose-100 text-rose-700'
                      : validation.warnings.length > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {!validation.isValid
                    ? 'Validation Error'
                    : validation.warnings.length > 0
                    ? 'High Token Budget'
                    : 'Hierarchy Safe'}
                </span>
              </div>

              {/* Validation Errors Callout */}
              {!validation.isValid && (
                <div className="p-2.5 bg-rose-50/90 border border-rose-200 rounded-xl text-rose-800 text-xs space-y-1 shadow-2xs">
                  <div className="flex items-center gap-1.5 font-bold text-rose-700">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Hierarchy Issues Detected:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-rose-600 pl-1">
                    {validation.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Validation Warnings Callout */}
              {validation.isValid && validation.warnings.length > 0 && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <span>{validation.warnings[0]}</span>
                </div>
              )}

              {/* N-Level Hierarchy Tree Builder */}
              {mode === 'both' ? (
                <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                  {entityLevels.map((lvl, lvlIdx) => {
                    const isRoot = lvlIdx === 0;
                    const isLeaf = lvlIdx === entityLevels.length - 1;

                    return (
                      <div key={lvl.id || lvlIdx} className="space-y-1.5">
                        {/* Entity Level Header Card */}
                        <div className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
                          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5">
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <span
                                className={`text-[9px] font-mono px-1.5 py-0.5 rounded font-bold uppercase tracking-wider shrink-0 ${
                                  isRoot
                                    ? 'bg-indigo-600 text-white'
                                    : isLeaf
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-700 text-white'
                                }`}
                              >
                                L{lvlIdx + 1}: {isRoot ? 'Root' : isLeaf ? 'Leaf' : 'Parent'}
                              </span>
                              <input
                                type="text"
                                value={lvl.name}
                                onChange={(e) => handleUpdateLevel(lvlIdx, { name: e.target.value })}
                                className="font-bold text-xs text-slate-900 bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded px-1 flex-1 min-w-0"
                                placeholder="Entity Name (e.g. Module, Case)"
                              />
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <div className="flex items-center gap-1 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 text-[10px] text-slate-600">
                                <span>Max/Parent:</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={15}
                                  value={lvl.max_items_per_parent || 2}
                                  onChange={(e) =>
                                    handleUpdateLevel(lvlIdx, {
                                      max_items_per_parent: Math.max(1, parseInt(e.target.value) || 1)
                                    })
                                  }
                                  className="w-7 text-center font-bold text-indigo-700 bg-transparent focus:outline-none"
                                />
                              </div>

                              <button
                                onClick={() => handleMoveLevel(lvlIdx, 'up')}
                                disabled={lvlIdx === 0}
                                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                title="Move Level Up"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleMoveLevel(lvlIdx, 'down')}
                                disabled={lvlIdx === entityLevels.length - 1}
                                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                                title="Move Level Down"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleAddColumnToLevel(lvlIdx)}
                                className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded cursor-pointer"
                                title="Add Column to this Level"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => handleRemoveLevel(lvlIdx)}
                                disabled={entityLevels.length <= 1}
                                className="p-1 text-rose-400 hover:text-rose-600 disabled:opacity-25 cursor-pointer"
                                title="Delete Level"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Columns assigned to this level */}
                          <div className="space-y-1.5 pl-2 border-l-2 border-indigo-200">
                            {(lvl.columns || []).map((col, colIdx) => (
                              <div
                                key={col.id || colIdx}
                                className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                              >
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <span className="text-[9px] font-mono text-slate-400 w-3 text-center">{colIdx + 1}</span>
                                  <input
                                    type="text"
                                    value={col.name}
                                    onChange={(e) => handleUpdateLevelColumn(lvlIdx, colIdx, { name: e.target.value })}
                                    className="flex-1 bg-white border border-slate-200 rounded px-2 py-0.5 font-medium text-slate-800 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    placeholder="Column Name"
                                  />
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {/* Merge Toggle */}
                                  <label
                                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-pointer transition-colors ${
                                      col.merge_rows
                                        ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                    title={
                                      col.merge_rows
                                        ? 'Vertically merged across all child items of this level in Excel'
                                        : 'Row is not merged'
                                    }
                                  >
                                    <input
                                      type="checkbox"
                                      checked={col.merge_rows}
                                      onChange={(e) => handleUpdateLevelColumn(lvlIdx, colIdx, { merge_rows: e.target.checked })}
                                      className="rounded text-indigo-600 focus:ring-indigo-500 w-3 h-3 cursor-pointer"
                                    />
                                    <span>Merge</span>
                                  </label>

                                  <button
                                    onClick={() => handleMoveLevelColumn(lvlIdx, colIdx, 'up')}
                                    disabled={colIdx === 0}
                                    className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                                    title="Move Column Up"
                                  >
                                    <ArrowUp className="w-2.5 h-2.5" />
                                  </button>
                                  <button
                                    onClick={() => handleMoveLevelColumn(lvlIdx, colIdx, 'down')}
                                    disabled={colIdx === (lvl.columns?.length || 0) - 1}
                                    className="p-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                                    title="Move Column Down"
                                  >
                                    <ArrowDown className="w-2.5 h-2.5" />
                                  </button>
                                  <button
                                    onClick={() => handleRemoveLevelColumn(lvlIdx, colIdx)}
                                    className="p-0.5 text-rose-400 hover:text-rose-600 cursor-pointer"
                                    title="Delete Column"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Visual Connector to next level */}
                        {!isLeaf && (
                          <div className="flex items-center gap-1 pl-4 text-slate-400">
                            <CornerDownRight className="w-3 h-3 text-indigo-500" />
                            <span className="text-[10px] font-mono text-slate-500">
                              Child of {lvl.name} (1:{lvl.max_items_per_parent || 2} ratio)
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <button
                    onClick={handleAddLevel}
                    className="w-full py-2 rounded-xl border border-dashed border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50 text-indigo-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Add Entity Level (Depth {entityLevels.length + 1})</span>
                  </button>
                </div>
              ) : (
                /* Flat Column List (When mode is single case or single data) */
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {columns.map((col, idx) => (
                    <div
                      key={col.id || idx}
                      className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400 w-4 text-center">{idx + 1}</span>
                        <input
                          type="text"
                          value={col.name}
                          onChange={(e) => {
                            const next = [...columns];
                            next[idx] = { ...next[idx], name: e.target.value };
                            setColumns(next);
                            setActivePresetId('custom');
                          }}
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1 font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="Column Name"
                        />
                        <button
                          onClick={() => handleMoveLevelColumn(0, idx, 'up')}
                          disabled={idx === 0}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleMoveLevelColumn(0, idx, 'down')}
                          disabled={idx === columns.length - 1}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleRemoveLevelColumn(0, idx)}
                          className="p-1 text-rose-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={handleAddColumn}
                    className="w-full py-2 rounded-xl border border-dashed border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50 text-indigo-700 font-semibold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Column</span>
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Sticky Generate Button at Bottom */}
          <div className="p-4 border-t border-slate-200 bg-white shrink-0 shadow-xs">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !validation.isValid}
              title={!validation.isValid ? validation.errors[0] : 'Generate structured test cases and data matrix'}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{generationStep || 'Generating Test Cases & Data...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Generate Test Suite & Matrix</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Side: Results & Export Studio (30% Width) */}
        <div
          className="w-[30%] flex-1 flex flex-col overflow-hidden bg-slate-50"
          style={{ width: '30%', minWidth: '340px', height: '100%', flex: 1, minHeight: 0, overflow: 'hidden' }}
        >
          {/* Header Action Bar */}
          <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${editableData.length > 0 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <span className="text-xs font-bold text-slate-800 truncate">
                {editableData.length > 0 ? `Generated: ${editableData.length} Root Entities` : 'Export Studio'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleExportExcel}
                disabled={isExportingExcel || editableData.length === 0}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                  editableData.length > 0
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md ring-2 ring-emerald-400/30'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
                title="Download Test Cases & Data (.xlsx)"
              >
                {isExportingExcel ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-emerald-100" />}
                <span className="hidden 2xl:inline">Download Test Cases &amp; Data (.xlsx)</span>
                <span className="2xl:hidden">Excel (.xlsx)</span>
              </button>
              <button
                onClick={handleSaveDataset}
                disabled={isSavingDataset || editableData.length === 0}
                className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                title="Save to Platform Datasets"
              >
                {isSavingDataset ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-slate-300" />}
                <span className="hidden 2xl:inline">Save to Platform Datasets</span>
                <span className="2xl:hidden">Save</span>
              </button>
            </div>
          </div>

          {/* Results Content */}
          <div
            className="flex-1 overflow-y-auto p-6"
            style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: '3.5rem' }}
          >
            {editableData.length === 0 ? (
              <div className="h-full border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-8 text-center bg-white/50">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">No Test Cases Generated Yet</h3>
                <p className="text-xs text-slate-500 max-w-md mb-4">
                  Configure your N-Level entity hierarchy on the left, then click "Generate Test Suite". Download as Excel (.xlsx) when done.
                </p>
                <button
                  onClick={() => { setMasterPrompt(SAMPLE_PROMPTS[0].text); handleGenerate(); }}
                  className="px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  Load Sample User Story &amp; Generate
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Stats Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Root Entities</span>
                    <span className="text-2xl font-bold text-indigo-700">{editableData.length}</span>
                    <span className="text-[11px] text-slate-500">{entityLevels[0]?.name || 'Top Level'}</span>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Columns</span>
                    <span className="text-2xl font-bold text-emerald-700">{columns.length}</span>
                    <span className="text-[11px] text-slate-500">{entityLevels.length} hierarchy levels</span>
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tokens Used</span>
                    <span className="text-2xl font-bold text-slate-700">{generationResult?.total_tokens?.toLocaleString() ?? '—'}</span>
                    <span className="text-[11px] text-slate-500">{generationResult?.latency_ms ?? 0} ms latency</span>
                  </div>
                </div>

                {/* Column Layout */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-800">Excel Column Layout</span>
                    <span className="ml-auto text-[11px] text-slate-400">{columns.length} columns · {entityLevels.length} levels</span>
                  </div>
                  <div className="p-4 flex flex-wrap gap-2">
                    {columns.map((col, i) => {
                      const lvlIdx = entityLevels.findIndex(
                        (l) => l.id === col.entity_id || (l.columns || []).some((c) => c.id === col.id)
                      );
                      return (
                        <div key={col.id || i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium ${col.merge_rows ? 'bg-indigo-50 border-indigo-200 text-indigo-800' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                          <span className="text-[9px] font-bold font-mono text-slate-400">L{lvlIdx + 1}</span>
                          <span>{col.name}</span>
                          {col.merge_rows && <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-500 text-white font-bold">M</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Content Summary */}
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-800">Generated Content Summary</span>
                    <span className="ml-auto text-[11px] text-emerald-600 font-semibold">Ready to download</span>
                  </div>
                  <div className="p-4 overflow-auto max-h-72 space-y-2">
                    {editableData.slice(0, 15).map((entity: any, i: number) => {
                      const fields = entity.fields || entity.case_fields || {};
                      const children = entity.children || entity.data_rows || [];
                      const entityName = (Object.values(fields)[0] as string) || `Entity ${i + 1}`;
                      return (
                        <div key={entity.id || i} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{entityName}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {children.length > 0 ? `${children.length} child ${entityLevels[1]?.name || 'records'}` : 'Leaf record'}
                              {' · '}{Object.keys(fields).length} fields
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    {editableData.length > 15 && (
                      <p className="text-center text-[11px] text-slate-400 py-2">+ {editableData.length - 15} more — all included in the Excel download</p>
                    )}
                  </div>
                </div>

                {/* Download CTA */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold text-emerald-900">Your test suite is ready!</p>
                    <p className="text-[11px] text-emerald-700 mt-0.5">All {editableData.length} entities with merged-cell formatting — click Download.</p>
                  </div>
                  <button onClick={handleExportExcel} disabled={isExportingExcel} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md flex items-center gap-2 transition-all cursor-pointer shrink-0">
                    {isExportingExcel ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    Download .xlsx
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Extracted Document Plaintext Preview Modal */}
      {isPreviewDocModalOpen && uploadedDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 px-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>{uploadedDoc.filename}</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Extracted plaintext: {uploadedDoc.word_count.toLocaleString()} words ({uploadedDoc.char_count.toLocaleString()} characters)
                </p>
              </div>
              <button
                onClick={() => setIsPreviewDocModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50/50 flex-1">
              {uploadedDoc.text}
            </div>
            <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
              <button
                onClick={() => setIsPreviewDocModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UPGRADED DUAL-TAB TEMPLATE & JSON SCHEMA PREVIEW MODAL */}
      {isPreviewTemplateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 sm:p-6 pt-8 animate-in fade-in duration-150 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-[96vw] w-full max-h-[90vh] flex flex-col border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 my-auto">
            {/* Modal Header */}
            <div className="p-4 px-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Network className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <span>Excel Layout & AI Schema Preview</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200 uppercase">
                      Pure Dynamic N-Level Tree
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Dual preview: inspect recursive merged spreadsheet cells & review the LLM output contract
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setIsPreviewTemplateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Dual Tab Navigator */}
            <div className="px-6 border-b border-slate-200 bg-white flex items-center justify-between">
              <div className="flex items-center gap-2 -mb-px">
                <button
                  onClick={() => setPreviewActiveTab('visual')}
                  className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                    previewActiveTab === 'visual'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Visual Spreadsheet Grid (Mockup)</span>
                </button>
                <button
                  onClick={() => setPreviewActiveTab('json')}
                  className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                    previewActiveTab === 'json'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>JSON Output Schema Preview (LLM Contract)</span>
                </button>
              </div>

              <span className="text-[11px] font-mono text-slate-500">
                Depth: {entityLevels.length} Levels · {columns.length} Cols
              </span>
            </div>

            {/* TAB 1: VISUAL SPREADSHEET GRID (MOCKUP) */}
            {previewActiveTab === 'visual' && (
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
                {/* Entity Breadcrumb Hierarchy Bar */}
                <div className="px-6 py-2.5 bg-indigo-50/80 border-b border-indigo-100 flex items-center justify-between text-xs text-indigo-950">
                  <div className="flex items-center gap-2 overflow-x-auto">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="font-semibold shrink-0">Recursive Hierarchy:</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {entityLevels.map((lvl, idx) => (
                        <React.Fragment key={lvl.id || idx}>
                          <span className="px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-900 font-medium text-[11px]">
                            L{idx + 1}: {lvl.name} (Max {lvl.max_items_per_parent || 2})
                          </span>
                          {idx < entityLevels.length - 1 && (
                            <span className="text-indigo-400 font-bold">→</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                    Zero AI Cost
                  </span>
                </div>

                {/* Table Mockup Container */}
                <div className="p-4 overflow-auto flex-1">
                  <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
                    <div className="overflow-x-auto w-full">
                    <table className="min-w-max w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-800 text-white border-b border-slate-700">
                          {columns.map((col, cIdx) => {
                            const parentLvl = entityLevels.find(
                              (l) => l.id === col.entity_id || (l.columns || []).some((c) => c.id === col.id)
                            );
                            const lvlIdx = parentLvl ? entityLevels.indexOf(parentLvl) + 1 : 1;

                            return (
                              <th
                                key={col.id || cIdx}
                                className="px-3 py-3 font-bold tracking-wide border-r border-slate-700/60 last:border-r-0 min-w-[140px] w-[160px] max-w-[200px]"
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="truncate block max-w-[100px]" title={col.name}>{col.name}</span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono bg-slate-700 text-slate-300">
                                      L{lvlIdx}
                                    </span>
                                    {col.merge_rows && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-indigo-500 text-white">
                                        Merged
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const N = entityLevels.length;
                          if (N === 0 || columns.length === 0) return null;
                          // 2 items per parent — deterministic, no tree traversal
                          const ITEMS = 2;
                          const totalRows = Math.min(Math.pow(ITEMS, N), 16);

                          // Span size for a column at levelIdx: how many leaf rows does one item at that level cover
                          const getSpan = (levelIdx: number) =>
                            Math.pow(ITEMS, N - 1 - levelIdx);

                          // Which entityLevel owns this column?
                          const getLevelIdx = (col: GeneratorColumnConfig): number => {
                            const idx = entityLevels.findIndex(
                              (l) => l.id === col.entity_id || (l.columns || []).some((c) => c.id === col.id)
                            );
                            return idx >= 0 ? idx : 0;
                          };

                          return Array.from({ length: totalRows }, (_, rowIdx) => {
                            // Zebra stripe keyed to root-level item index
                            const rootItemIdx = Math.floor(rowIdx / getSpan(0));
                            const rowBg = rootItemIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50';

                            return (
                              <tr key={rowIdx} className={`${rowBg} hover:bg-indigo-50/30 transition-colors`}>
                                {columns.map((col, colIdx) => {
                                  const levelIdx = getLevelIdx(col);
                                  const span = getSpan(levelIdx);
                                  // Which item (0 or 1) within this level does this row belong to?
                                  const itemNum = Math.floor(rowIdx / span) % ITEMS + 1;
                                  const isMerged = Boolean(col.merge_rows) && span > 1;

                                  // For merged cols: only render the first row of each span block
                                  if (isMerged && rowIdx % span !== 0) return null;

                                  const label = `${col.name} ${itemNum}`;

                                  return (
                                    <td
                                      key={col.id || colIdx}
                                      rowSpan={isMerged ? span : 1}
                                      className={`px-3 py-2 text-[11px] border-r border-slate-200 last:border-r-0 align-top min-w-[130px] w-[155px] max-w-[190px] ${
                                        isMerged
                                          ? 'bg-indigo-50 border-b border-indigo-200 font-medium'
                                          : 'border-b border-slate-100'
                                      }`}
                                    >
                                      <div className="flex items-start gap-1.5">
                                        {isMerged && (
                                          <span
                                            className="mt-[3px] w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0"
                                            title={`Merged across ${span} rows`}
                                          />
                                        )}
                                        <span
                                          className={`leading-snug break-words ${
                                            col.name.toLowerCase().includes('id')
                                              ? 'font-mono font-bold text-indigo-700'
                                              : 'text-slate-700'
                                          }`}
                                        >
                                          {label}
                                        </span>
                                      </div>
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </div>

                {/* Footer notes */}
                <div className="p-3.5 px-6 border-t border-slate-200 bg-white flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    Parent levels tagged <strong className="text-indigo-600">Merged</strong> calculate dynamic leaf spans and merge vertically across all descendant rows in Excel.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExportBlankExcelTemplate}
                      disabled={isExportingTemplateExcel}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
                      title="Download clean Excel template file formatted with headers and styles"
                    >
                      {isExportingTemplateExcel ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5 text-emerald-100" />
                      )}
                      <span>Download Blank Template (.xlsx)</span>
                    </button>
                    <button
                      onClick={() => setIsPreviewTemplateModalOpen(false)}
                      className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-xs cursor-pointer"
                    >
                      Close Preview
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: JSON OUTPUT SCHEMA PREVIEW (LLM CONTRACT) */}
            {previewActiveTab === 'json' && (
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-900 text-slate-100">
                {/* Banner & Action Controls */}
                <div className="px-6 py-3 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-slate-300">
                    <Code2 className="w-4 h-4 text-emerald-400" />
                    <span>
                      Prompt Instruction Contract: AI outputs compact tree objects without repetitive column duplication.
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(buildJsonSchemaPreview(entityLevels));
                      setSchemaCopied(true);
                      setTimeout(() => setSchemaCopied(false), 2500);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                      schemaCopied
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                    }`}
                  >
                    {schemaCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{schemaCopied ? 'Schema Copied!' : 'Copy JSON Schema'}</span>
                  </button>
                </div>

                {/* Syntax-highlighted formatted JSON */}
                <div className="flex-1 overflow-auto">
                  <pre className="p-6 font-mono text-[12px] text-emerald-300 bg-slate-950 leading-relaxed selection:bg-indigo-600 selection:text-white min-h-full">
                    {buildJsonSchemaPreview(entityLevels)}
                  </pre>
                </div>

                {/* Footer notes */}
                <div className="p-3.5 px-6 border-t border-slate-800 bg-slate-900 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-400 font-bold">• Zero Token Waste</span>
                    <span>• Python Engine flattens and styles rows in openpyxl automatically</span>
                  </div>
                  <button
                    onClick={() => setIsPreviewTemplateModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs shadow-xs cursor-pointer"
                  >
                    Close Preview
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
