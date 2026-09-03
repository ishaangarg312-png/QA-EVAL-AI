import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface JsonViewerProps {
  data: any;
  title?: string;
  maxHeight?: string;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ data, title, maxHeight = '320px' }) => {
  const [copied, setCopied] = useState(false);

  const jsonString = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/80 overflow-hidden font-mono text-xs">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900/80 border-b border-slate-800/80 text-slate-400">
        <span className="font-semibold text-slate-300">{title || 'JSON Payload'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors px-2 py-0.5 rounded hover:bg-slate-800"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre
        className="p-3 text-slate-300 overflow-auto whitespace-pre-wrap selection:bg-indigo-500/30"
        style={{ maxHeight }}
      >
        {jsonString}
      </pre>
    </div>
  );
};
