import React, { useState, useMemo, useEffect } from 'react';
import {
  Terminal,
  Clipboard,
  Check,
  X,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Filter,
  CheckSquare,
  Square,
  Globe,
  Layers,
  Code
} from 'lucide-react';
import { parseCurlOrInspect, ParsedRequest, isBrowserNoiseHeader } from '../utils/curlParser';

interface CurlImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (parsed: ParsedRequest) => void;
}

export const CurlImportModal: React.FC<CurlImportModalProps> = ({
  isOpen,
  onClose,
  onImport
}) => {
  const [rawInput, setRawInput] = useState('');
  const [pasteSuccess, setPasteSuccess] = useState(false);

  // Selected options states
  const [importUrl, setImportUrl] = useState(true);
  const [importHeaders, setImportHeaders] = useState(true);
  const [selectedHeaders, setSelectedHeaders] = useState<Record<string, boolean>>({});
  const [importBody, setImportBody] = useState(true);
  const [selectedBodyType, setSelectedBodyType] = useState<'JSON' | 'MULTIPART_FORM_DATA' | 'FORM_URLENCODED'>('MULTIPART_FORM_DATA');

  const parsed = useMemo(() => {
    return parseCurlOrInspect(rawInput);
  }, [rawInput]);

  // When a new snippet is parsed, initialize selected headers and body format intelligently
  useEffect(() => {
    if (parsed) {
      const initialSelected: Record<string, boolean> = {};
      Object.keys(parsed.headers).forEach((hKey) => {
        // Pre-check recommended headers (auth, accept, etc.) and pre-uncheck browser tracking noise
        initialSelected[hKey] = !isBrowserNoiseHeader(hKey);
      });
      setSelectedHeaders(initialSelected);
      setSelectedBodyType(parsed.body_type || 'JSON');
      setImportUrl(Boolean(parsed.url));
      setImportBody(Boolean(parsed.body));
    }
  }, [parsed]);

  if (!isOpen) return null;

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setRawInput(text);
        setPasteSuccess(true);
        setTimeout(() => setPasteSuccess(false), 1500);
      }
    } catch {
      // Clipboard permission denied or unsupported
    }
  };

  const toggleHeader = (key: string) => {
    setSelectedHeaders((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSelectAllHeaders = () => {
    if (!parsed) return;
    const all: Record<string, boolean> = {};
    Object.keys(parsed.headers).forEach((k) => (all[k] = true));
    setSelectedHeaders(all);
  };

  const handleSelectRecommendedHeaders = () => {
    if (!parsed) return;
    const rec: Record<string, boolean> = {};
    Object.keys(parsed.headers).forEach((k) => (rec[k] = !isBrowserNoiseHeader(k)));
    setSelectedHeaders(rec);
  };

  const handleClearAllHeaders = () => {
    if (!parsed) return;
    const none: Record<string, boolean> = {};
    Object.keys(parsed.headers).forEach((k) => (none[k] = false));
    setSelectedHeaders(none);
  };

  const handleApply = () => {
    if (!parsed) return;

    // Filter headers according to user checkboxes
    const finalHeaders: Record<string, string> = {};
    if (importHeaders) {
      Object.entries(parsed.headers).forEach(([k, v]) => {
        if (selectedHeaders[k]) {
          finalHeaders[k] = v;
        }
      });
    }

    const payloadToImport: ParsedRequest = {
      ...parsed,
      url: importUrl ? parsed.url : '',
      method: importUrl ? parsed.method : '',
      headers: finalHeaders,
      body: importBody ? parsed.body : null,
      body_type: selectedBodyType
    };

    onImport(payloadToImport);
    onClose();
  };

  const selectedHeaderCount = Object.values(selectedHeaders).filter(Boolean).length;
  const totalHeaderCount = parsed ? Object.keys(parsed.headers).length : 0;

  return (
    <div
      style={{
        zIndex: 99999,
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem'
      }}
      className="z-9999 animate-in fade-in"
    >
      <div
        style={{
          zIndex: 100000,
          maxHeight: '85vh',
          height: '700px',
          width: '100%',
          maxWidth: '44rem',
          backgroundColor: '#ffffff',
          borderRadius: '1rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200"
      >
        {/* Sticky Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Import from cURL / Browser Inspect</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-100 text-blue-800">
                  Interactive
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Copy from Chrome DevTools (Right-click request ➔ Copy as cURL) or paste raw Form Data.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body Content */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1 min-h-0">
          {/* Action Row & Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Paste cURL Command or DevTools Payload
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200 shadow-2xs"
                >
                  {pasteSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">Pasted!</span>
                    </>
                  ) : (
                    <>
                      <Clipboard className="w-3.5 h-3.5" />
                      <span>Paste from Clipboard</span>
                    </>
                  )}
                </button>

                {rawInput && (
                  <button
                    type="button"
                    onClick={() => setRawInput('')}
                    className="text-xs text-slate-400 hover:text-rose-600 font-bold cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <textarea
              rows={5}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={`curl 'https://api.example.com/v1/chat' \\
  -H 'Authorization: Bearer eyJhbGci...' \\
  -F 'message=Confirm company name: Presight' \\
  -F 'stream=true' \\
  -F 'dependencies={"company_name":"Presight"}'`}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs font-mono text-emerald-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-inner resize-y leading-relaxed"
            />
          </div>

          {/* Interactive Parameters Selection Card */}
          {parsed && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4 animate-in fade-in">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-blue-600" />
                  <span>Select Parameters to Import</span>
                </span>
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-200">
                  {selectedBodyType === 'MULTIPART_FORM_DATA' ? '📦 Multipart Form' : '📄 JSON Body'}
                </span>
              </div>

              {/* Option 1: URL & Method */}
              <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={importUrl}
                    onChange={(e) => setImportUrl(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-slate-500" />
                      <span className="text-xs font-bold text-slate-800">Target URL & Method</span>
                      <span className="font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        {parsed.method || 'POST'}
                      </span>
                    </div>
                    <div className="text-xs font-mono font-bold text-slate-700 break-all mt-1 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      {parsed.url || <span className="text-slate-400 italic">No URL found in snippet</span>}
                    </div>
                  </div>
                </label>
              </div>

              {/* Option 2: Headers Selection */}
              {totalHeaderCount > 0 && (
                <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={importHeaders}
                        onChange={(e) => setImportHeaders(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                      />
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-xs font-bold text-slate-800">
                          Import Headers ({selectedHeaderCount}/{totalHeaderCount} selected)
                        </span>
                      </div>
                    </label>

                    {importHeaders && (
                      <div className="flex items-center gap-1.5 text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={handleSelectRecommendedHeaders}
                          className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 cursor-pointer transition-colors"
                          title="Keep auth & custom headers; deselect browser tracking"
                        >
                          Recommended
                        </button>
                        <button
                          type="button"
                          onClick={handleSelectAllHeaders}
                          className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 cursor-pointer transition-colors"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={handleClearAllHeaders}
                          className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200 cursor-pointer transition-colors"
                        >
                          None
                        </button>
                      </div>
                    )}
                  </div>

                  {importHeaders && (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200">
                      {Object.entries(parsed.headers).map(([hKey, hVal], idx) => {
                        const isNoise = isBrowserNoiseHeader(hKey);
                        const isChecked = Boolean(selectedHeaders[hKey]);

                        return (
                          <label
                            key={idx}
                            className={`flex items-center justify-between p-1.5 rounded-md text-xs font-mono transition-colors cursor-pointer ${
                              isChecked ? 'bg-white text-slate-900 shadow-2xs border border-slate-200' : 'text-slate-400 hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-2 overflow-hidden mr-2">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleHeader(hKey)}
                                className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                              />
                              <strong className={isChecked ? 'text-blue-900' : 'text-slate-400'}>
                                {hKey}:
                              </strong>
                              <span className="truncate max-w-[280px]">
                                {hVal}
                              </span>
                            </div>

                            {isNoise && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 text-slate-500 font-sans font-semibold shrink-0">
                                browser
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Option 3: Payload / Body Selection */}
              {parsed.body && (
                <div className="p-3 rounded-xl bg-white border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={importBody}
                        onChange={(e) => setImportBody(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                      />
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Code className="w-3.5 h-3.5 text-slate-500" />
                        <span className="text-xs font-bold text-slate-800">
                          Import Payload / Body ({parsed.detectedFieldsCount} fields)
                        </span>
                        {(() => {
                          const charLen =
                            typeof parsed.body === 'object'
                              ? JSON.stringify(parsed.body).length
                              : String(parsed.body).length;
                          return charLen > 80 ? (
                            <span className="text-[10px] text-slate-500 font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                              {charLen.toLocaleString()} chars
                            </span>
                          ) : null;
                        })()}
                      </div>
                    </label>

                    {importBody && (
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] font-bold text-slate-500 mr-1">Format:</span>
                        <select
                          value={selectedBodyType}
                          onChange={(e) => setSelectedBodyType(e.target.value as any)}
                          className="bg-slate-100 border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-800 cursor-pointer focus:outline-none focus:border-blue-500"
                        >
                          <option value="MULTIPART_FORM_DATA">📦 Multipart Form Data</option>
                          <option value="JSON">📄 JSON Body</option>
                          <option value="FORM_URLENCODED">🔗 URL-Encoded</option>
                        </select>
                      </div>
                    )}
                  </div>

                  {importBody && (
                    <pre className="text-[11px] font-mono bg-slate-50 p-2.5 rounded-lg border border-slate-200 max-h-56 overflow-y-auto text-slate-800 leading-relaxed">
                      {typeof parsed.body === 'object'
                        ? JSON.stringify(parsed.body, null, 2)
                        : String(parsed.body)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {rawInput && !parsed && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Could not detect a valid cURL command or key-value payload. Please check your pasted text.</span>
            </div>
          )}
        </div>

        {/* Sticky Always-Visible Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50/95 shrink-0 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-semibold">
            {parsed && (
              <span>
                {importUrl ? '1 URL' : '0 URL'}, {importHeaders ? `${selectedHeaderCount} Headers` : '0 Headers'}, {importBody ? `${parsed.detectedFieldsCount} Fields` : '0 Body'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-all cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={!parsed || (!importUrl && !importHeaders && !importBody)}
              onClick={handleApply}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span>Apply Selected Options to Step</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
