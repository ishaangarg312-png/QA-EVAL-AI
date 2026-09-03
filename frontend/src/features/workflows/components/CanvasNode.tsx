import React from 'react';
import { WorkflowNode, NodeType } from '../../../types';
import {
  MessageSquare,
  Bot,
  Globe,
  Variable,
  UserCheck,
  Mail,
  Scale,
  CheckCircle2,
  Zap,
  RefreshCw,
  Edit3,
  Play,
  Sparkles,
  FileUp,
  Link,
  GitBranch
} from 'lucide-react';

export const getNodeIcon = (nodeOrType: NodeType | WorkflowNode): React.ReactNode => {
  if (typeof nodeOrType === 'object') {
    if (nodeOrType.node_type === 'API_REQUEST' && nodeOrType.config?.api_type === 'UPLOAD') {
      return <FileUp className="w-4 h-4 text-amber-600" />;
    }
    return getNodeIcon(nodeOrType.node_type);
  }
  const type = nodeOrType;
  switch (type) {
    case 'PROMPT':
    case 'FOLLOWUP_PROMPT':
      return <MessageSquare className="w-4 h-4 text-indigo-500" />;
    case 'AGENT':
      return <Bot className="w-4 h-4 text-indigo-600" />;
    case 'API_REQUEST':
      return <Globe className="w-4 h-4 text-blue-500" />;
    case 'POLLING':
      return <RefreshCw className="w-4 h-4 text-cyan-600" />;
    case 'EXTRACT_VARIABLE':
      return <Variable className="w-4 h-4 text-amber-500" />;
    case 'CAPTURE_RESULT':
      return <Sparkles className="w-4 h-4 text-teal-600" />;
    case 'CHAT_URL_CREATOR':
      return <Link className="w-4 h-4 text-violet-600" />;
    case 'HUMAN_APPROVAL':
    case 'HUMAN_INPUT':
      return <UserCheck className="w-4 h-4 text-rose-500" />;
    case 'OUTLOOK':
    case 'GMAIL':
      return <Mail className="w-4 h-4 text-purple-500" />;
    case 'EVALUATION':
    case 'ASSERTION':
      return <Scale className="w-4 h-4 text-emerald-600" />;
    case 'CONDITION':
      return <GitBranch className="w-4 h-4 text-amber-600" />;
    default:
      return <CheckCircle2 className="w-4 h-4 text-slate-500" />;
  }
};

export const getNodeBadge = (node: WorkflowNode | NodeType) => {
  const type = typeof node === 'string' ? node : node.node_type;
  if (typeof node === 'object' && node.node_type === 'API_REQUEST') {
    if (node.config?.api_type === 'UPLOAD') return 'UPLOAD API';
    if (node.config?.api_type === 'FOLLOWUP') return 'FOLLOW-UP';
    return 'HTTP';
  }
  switch (type) {
    case 'API_REQUEST': return 'HTTP';
    case 'POLLING': return 'POOL';
    case 'AGENT': return 'AGENT';
    case 'PROMPT': return 'PROMPT';
    case 'FOLLOWUP_PROMPT': return 'FOLLOW-UP';
    case 'EXTRACT_VARIABLE': return 'EXTRACT';
    case 'CAPTURE_RESULT': return 'CAPTURE';
    case 'CHAT_URL_CREATOR': return 'CHAT URL';
    case 'CONDITION': return 'IF / GATE';
    case 'HUMAN_APPROVAL': return 'HITL';
    case 'OUTLOOK': return 'EMAIL';
    case 'EVALUATION': return 'EVAL';
    case 'END': return 'END';
    default: return 'STEP';
  }
};

interface CanvasNodeProps {
  node: WorkflowNode;
  idx: number;
  isSelected: boolean;
  isSimActive: boolean;
  testResult?: { status: string; code?: number; time?: number; duration_ms?: number };
  isTestingThis: boolean;
  isConnectingFromThis: boolean;
  isConnectTarget: boolean;
  connectingSource: string | null;
  onMouseDown: (node: WorkflowNode, e: React.MouseEvent) => void;
  onToggleConnect: (nodeKey: string, e: React.MouseEvent) => void;
  onOpenEditModal: (node: WorkflowNode, e: React.MouseEvent) => void;
  onExecuteNodeTest: (node: WorkflowNode, e: React.MouseEvent) => void;
}

export const CanvasNode: React.FC<CanvasNodeProps> = ({
  node,
  idx,
  isSelected,
  isSimActive,
  testResult,
  isTestingThis,
  isConnectingFromThis,
  isConnectTarget,
  connectingSource,
  onMouseDown,
  onToggleConnect,
  onOpenEditModal,
  onExecuteNodeTest,
}) => {
  const posX = typeof node.position_x === 'number' && !isNaN(node.position_x) ? node.position_x : (idx * 240 + 80);
  const posY = typeof node.position_y === 'number' && !isNaN(node.position_y) ? node.position_y : 180;

  return (
    <div
      onMouseDown={(e) => onMouseDown(node, e)}
      onMouseUp={(e) => {
        if (connectingSource && connectingSource !== node.node_key) {
          onToggleConnect(node.node_key, e);
        }
      }}
      onClick={(e) => {
        if (connectingSource && connectingSource !== node.node_key) {
          onToggleConnect(node.node_key, e);
        }
      }}
      onDoubleClick={(e) => onOpenEditModal(node, e)}
      style={{
        position: 'absolute',
        left: `${posX}px`,
        top: `${posY}px`,
      }}
      className={`w-44 bg-white rounded-xl border p-2.5 shadow-sm cursor-grab active:cursor-grabbing transition-all z-20 group ${
        isConnectingFromThis
          ? 'border-blue-600 ring-4 ring-blue-500/30 shadow-lg scale-105'
          : isConnectTarget
            ? 'border-emerald-500 ring-2 ring-emerald-400/50 shadow-md cursor-pointer hover:border-emerald-600 hover:scale-102'
            : isSelected
              ? 'border-blue-600 ring-2 ring-blue-500/20 shadow-md'
              : isSimActive || isTestingThis
                ? 'border-blue-600 ring-4 ring-blue-400/40 shadow-lg scale-102 animate-pulse'
                : testResult?.status === 'SUCCESS'
                  ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                  : testResult?.status === 'FAILED'
                    ? 'border-rose-500 ring-2 ring-rose-500/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-md'
      }`}
    >
      {/* Left Input Port Handle (+) */}
      <button
        type="button"
        title={connectingSource ? "Click to connect wire here" : "Click to start connecting wire"}
        onClick={(e) => onToggleConnect(node.node_key, e)}
        style={{
          position: 'absolute',
          left: '-12px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 30,
        }}
        className={`port-handle w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold shadow-xs transition-all cursor-pointer ${
          isConnectingFromThis
            ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300'
            : isConnectTarget
              ? 'bg-emerald-500 text-white border-emerald-500 animate-pulse ring-2 ring-emerald-200'
              : 'bg-white hover:bg-blue-50 border-blue-400 text-blue-600 hover:scale-110'
        }`}
      >
        +
      </button>

      {/* Node Card Content */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div className="w-5 h-5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
            {getNodeIcon(node)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-slate-900 truncate leading-tight">
              {node.label}
            </div>
            <div className="text-[9px] font-mono text-slate-400 uppercase font-semibold">
              {getNodeBadge(node)}
            </div>
          </div>
        </div>

        {/* Quick Node Action Buttons */}
        <div className="flex items-center gap-0.5">
          <button
            title="Link wire to another node"
            onClick={(e) => onToggleConnect(node.node_key, e)}
            className={`node-action-btn p-1 rounded transition-all ${
              isConnectingFromThis
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
            }`}
          >
            <Zap className="w-3 h-3" />
          </button>

          <button
            title="Execute & Test this node"
            onClick={(e) => onExecuteNodeTest(node, e)}
            disabled={isTestingThis}
            className="node-action-btn p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-all"
          >
            <Play className={`w-3 h-3 text-emerald-600 ${isTestingThis ? 'animate-spin' : ''}`} />
          </button>

          <button
            title="Edit node properties in pop-up"
            onClick={(e) => onOpenEditModal(node, e)}
            className="node-action-btn p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
          >
            <Edit3 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Live Running Indicator Badge */}
      {isTestingThis && (
        <div className="mt-1 pt-1 border-t border-blue-100 flex items-center justify-between text-[9px] font-mono text-blue-700 bg-blue-50/80 px-1.5 py-0.5 rounded-md">
          <span className="flex items-center gap-1 font-bold">
            <RefreshCw className="w-2.5 h-2.5 animate-spin" /> RUNNING...
          </span>
        </div>
      )}

      {/* Test Status Indicator Badge */}
      {!isTestingThis && testResult && (
        <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-between text-[9px] font-mono">
          <span
            className={`px-1.5 py-0.5 rounded font-bold ${
              testResult.status === 'SUCCESS' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}
          >
            {testResult.status === 'SUCCESS' ? '✓' : '✗'}{' '}
            {testResult.code ? `${testResult.code} OK` : testResult.status === 'SUCCESS' ? '200 OK' : 'FAILED'}
          </span>
          <span className="text-slate-400 font-semibold">
            {testResult.duration_ms ? `${testResult.duration_ms}ms` : testResult.time ? `${testResult.time}ms` : ''}
          </span>
        </div>
      )}

      {/* Right Output Port Handle (+) */}
      <button
        type="button"
        title={connectingSource ? "Click to connect wire here" : "Click to start connecting wire"}
        onClick={(e) => onToggleConnect(node.node_key, e)}
        style={{
          position: 'absolute',
          right: '-12px',
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 30,
        }}
        className={`port-handle w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold shadow-xs transition-all cursor-pointer ${
          isConnectingFromThis
            ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300'
            : isConnectTarget
              ? 'bg-emerald-500 text-white border-emerald-500 animate-pulse ring-2 ring-emerald-200'
              : 'bg-white hover:bg-blue-50 border-blue-400 text-blue-600 hover:scale-110'
        }`}
      >
        +
      </button>
    </div>
  );
};
