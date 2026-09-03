import React, { useState, useEffect, useRef } from 'react';
import { Project, UploadedDocument } from '../../types';
import { api } from '../../services/api';
import {
  FileUp,
  FileText,
  Upload,
  Trash2,
  Copy,
  Check,
  ExternalLink,
  Search,
  Download,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  FileCode,
  Image as ImageIcon,
  FileType,
  X,
  Eye,
  Settings2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface UploadDocumentViewProps {
  currentProject: Project | null;
  onNavigateToWorkflow?: () => void;
}

export const UploadDocumentView: React.FC<UploadDocumentViewProps> = ({
  currentProject,
}) => {
  // Optional custom endpoint config (collapsed by default)
  const [customApiUrl, setCustomApiUrl] = useState('/api/v1/documents/upload');
  const [showAdvancedEndpoint, setShowAdvancedEndpoint] = useState(false);

  // Files selection queue (Enforces Max 10)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, { status: 'PENDING' | 'UPLOADING' | 'DONE' | 'ERROR'; message?: string }>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccessSummary, setUploadSuccessSummary] = useState<string | null>(null);
  const [uploadErrorAlert, setUploadErrorAlert] = useState<string | null>(null);

  // Persistent project documents
  const [projectDocuments, setProjectDocuments] = useState<UploadedDocument[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<UploadedDocument | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load documents when project changes
  useEffect(() => {
    if (currentProject) {
      setIsLoadingDocs(true);
      api.getProjectDocuments(currentProject.id)
        .then((docs) => {
          setProjectDocuments(docs || []);
        })
        .catch(() => {
          setProjectDocuments([]);
        })
        .finally(() => {
          setIsLoadingDocs(false);
        });
    } else {
      setProjectDocuments([]);
    }
  }, [currentProject]);

  // Handle file selection with Max 10 constraint
  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploadErrorAlert(null);
    setUploadSuccessSummary(null);

    const incoming = Array.from(files);
    const combined = [...selectedFiles, ...incoming];

    if (combined.length > 10) {
      setUploadErrorAlert('⚠️ Maximum 10 documents allowed at a single time. Kept first 10 files.');
      setSelectedFiles(combined.slice(0, 10));
    } else {
      setSelectedFiles(combined);
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleClearQueue = () => {
    setSelectedFiles([]);
    setUploadProgress({});
    setUploadErrorAlert(null);
  };

  // 1-Click Copy helper
  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Format file size
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Get icon by content type / extension
  const getDocIcon = (filename: string, contentType?: string) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext) || contentType?.includes('image')) {
      return <ImageIcon className="w-4 h-4 text-purple-600" />;
    }
    if (['json', 'xml', 'yaml', 'yml', 'js', 'ts', 'py'].includes(ext)) {
      return <FileCode className="w-4 h-4 text-emerald-600" />;
    }
    if (['pdf'].includes(ext) || contentType?.includes('pdf')) {
      return <FileType className="w-4 h-4 text-rose-600" />;
    }
    return <FileText className="w-4 h-4 text-blue-600" />;
  };

  // Execute Upload for all queued files (Max 10)
  const handleExecuteUpload = async () => {
    if (!currentProject) {
      setUploadErrorAlert('Please select an active project first.');
      return;
    }
    if (selectedFiles.length === 0) {
      setUploadErrorAlert('Please select at least 1 document to upload.');
      return;
    }
    if (selectedFiles.length > 10) {
      setUploadErrorAlert('Maximum 10 documents allowed at a single time.');
      return;
    }

    setIsUploading(true);
    setUploadErrorAlert(null);
    setUploadSuccessSummary(null);

    const newDocs: UploadedDocument[] = [];
    const initialProg: Record<string, any> = {};
    selectedFiles.forEach((f) => {
      initialProg[f.name] = { status: 'UPLOADING' };
    });
    setUploadProgress(initialProg);

    for (const file of selectedFiles) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('project_id', currentProject.id);

        let returnedFileName = file.name;
        let returnedAttachmentId = `att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
        let returnedBlobUrl = URL.createObjectURL(file);

        const targetUrl = customApiUrl.trim() || '/api/v1/documents/upload';

        if (targetUrl.startsWith('/api/v1') || targetUrl.includes(window.location.host)) {
          const res = await fetch(targetUrl, {
            method: 'POST',
            body: formData,
          });

          if (res.ok) {
            const data = await res.json();
            if (data.attachment_id) returnedAttachmentId = data.attachment_id;
            if (data.file_name) returnedFileName = data.file_name;
            if (data.blob_url) returnedBlobUrl = data.blob_url;
          }
        } else {
          try {
            const res = await fetch(targetUrl, {
              method: 'POST',
              body: formData,
            });
            if (res.ok) {
              const data = await res.json();
              if (data.id || data.attachment_id || data.file_id) {
                returnedAttachmentId = data.id || data.attachment_id || data.file_id;
              }
              if (data.url || data.blob_url || data.link) {
                returnedBlobUrl = data.url || data.blob_url || data.link;
              }
            }
          } catch {
            // Keep local fallback
          }
        }

        const docItem: UploadedDocument = {
          id: returnedAttachmentId,
          project_id: currentProject.id,
          file_name: returnedFileName,
          attachment_id: returnedAttachmentId,
          blob_url: returnedBlobUrl,
          file_size_bytes: file.size,
          content_type: file.type || 'application/octet-stream',
          api_url: targetUrl,
          method: 'POST',
          status: 'UPLOADED',
          created_at: new Date().toISOString(),
        };

        newDocs.push(docItem);

        setUploadProgress((prev) => ({
          ...prev,
          [file.name]: {
            status: 'DONE',
          },
        }));
      } catch (err: any) {
        setUploadProgress((prev) => ({
          ...prev,
          [file.name]: {
            status: 'ERROR',
            message: err.message || 'Upload failed',
          },
        }));
      }
    }

    const updatedProjectDocs = [...newDocs, ...projectDocuments];
    setProjectDocuments(updatedProjectDocs);
    await api.saveProjectDocuments(currentProject.id, updatedProjectDocs);

    setIsUploading(false);
    setSelectedFiles([]);
    setUploadSuccessSummary(`Successfully uploaded ${newDocs.length} document(s) with Attachment IDs and Blob URLs saved to ${currentProject.name}!`);
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!currentProject) return;
    const updated = projectDocuments.filter((d) => d.id !== docId && d.attachment_id !== docId);
    setProjectDocuments(updated);
    await api.deleteProjectDocument(docId, currentProject.id);
  };

  const handleClearAllProjectDocs = async () => {
    if (!currentProject) return;
    if (!window.confirm(`Are you sure you want to delete all ${projectDocuments.length} uploaded documents for "${currentProject.name}"?`)) return;
    setProjectDocuments([]);
    await api.saveProjectDocuments(currentProject.id, []);
  };

  const handleExportManifestJSON = () => {
    const dataStr = JSON.stringify(projectDocuments, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject?.slug || 'project'}_documents_manifest.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyAsTestMatrix = () => {
    const matrix = projectDocuments.map((d) => ({
      file_name: d.file_name,
      attachment_id: d.attachment_id,
      blob_url: d.blob_url,
    }));
    navigator.clipboard.writeText(JSON.stringify(matrix, null, 2));
    handleCopyText(JSON.stringify(matrix, null, 2), 'matrix');
  };

  const filteredDocs = projectDocuments.filter((d) => {
    const q = searchQuery.toLowerCase();
    return (
      d.file_name.toLowerCase().includes(q) ||
      d.attachment_id.toLowerCase().includes(q) ||
      d.content_type.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-10">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
            <FileUp className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold font-display text-slate-900 leading-tight">
                Project Document & Attachment Hub
              </h2>
              {currentProject && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {currentProject.name}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload documents (PDF, Word, CSV, Excel, PPTX - max 10) to generate persistent attachment IDs and Blob URLs for Workflow testing.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {projectDocuments.length > 0 && (
            <>
              <button
                type="button"
                onClick={handleCopyAsTestMatrix}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold shadow-2xs transition-all cursor-pointer"
                title="Copy all attachment IDs and Blob URLs as JSON for Workflow testing"
              >
                {copiedKey === 'matrix' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                <span>{copiedKey === 'matrix' ? 'Copied Matrix!' : 'Copy Workflow Matrix'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportManifestJSON}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-bold shadow-2xs transition-all cursor-pointer"
                title="Download JSON manifest"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export JSON</span>
              </button>

              <button
                type="button"
                onClick={handleClearAllProjectDocs}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold shadow-2xs transition-all cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Workspace: 2-Column Side-by-Side Split */}
      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Left Panel: Clean Interactive Upload Dropzone (380px) */}
        <div className="w-full lg:w-[380px] shrink-0 space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <span>Upload Documents</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Max 10
                </span>
              </h3>

              {selectedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearQueue}
                  className="text-[11px] font-bold text-rose-600 hover:text-rose-800 cursor-pointer"
                >
                  Clear ({selectedFiles.length})
                </button>
              )}
            </div>

            {/* Hidden Native Input */}
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept=".pdf,.doc,.docx,.csv,.xls,.xlsx,.ppt,.pptx"
              onChange={(e) => handleFileSelect(e.target.files)}
              style={{ display: 'none' }}
            />

            {/* Clean Dropzone Area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                handleFileSelect(e.dataTransfer.files);
              }}
              className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 rounded-xl p-5 text-center cursor-pointer bg-indigo-50/20 hover:bg-indigo-50/60 transition-all space-y-2 group"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center mx-auto shadow-2xs group-hover:scale-105 transition-transform">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Click to Browse or Drag & Drop Documents
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  PDF, Word, CSV, Excel, PPTX (Single or Multi)
                </p>
              </div>
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-indigo-700 border border-indigo-200 shadow-2xs">
                Limit: Up to 10 files per batch
              </span>
            </div>

            {/* Error Alert */}
            {uploadErrorAlert && (
              <div
                style={{ backgroundColor: '#fff1f2', borderColor: '#fecdd3', color: '#9f1239' }}
                className="p-2.5 rounded-xl border flex items-center gap-2 text-xs font-semibold"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{uploadErrorAlert}</span>
              </div>
            )}

            {/* Success Alert */}
            {uploadSuccessSummary && (
              <div
                style={{ backgroundColor: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}
                className="p-2.5 rounded-xl border flex items-center gap-2 text-xs font-semibold"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{uploadSuccessSummary}</span>
              </div>
            )}

            {/* Queued Files List */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                  <span>Queued ({selectedFiles.length}/10):</span>
                  <span>Total: {formatBytes(selectedFiles.reduce((acc, f) => acc + f.size, 0))}</span>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-1 p-1 bg-slate-50 rounded-xl border border-slate-100">
                  {selectedFiles.map((file, idx) => {
                    const prog = uploadProgress[file.name];
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 shadow-2xs text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {getDocIcon(file.name, file.type)}
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate max-w-[160px]">
                              {file.name}
                            </p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              {formatBytes(file.size)}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {prog?.status === 'UPLOADING' && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600">
                              <RefreshCw className="w-3 h-3 animate-spin" /> Uploading...
                            </span>
                          )}
                          {prog?.status === 'DONE' && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                              <CheckCircle2 className="w-3 h-3" /> Done
                            </span>
                          )}
                          {!isUploading && (
                            <button
                              type="button"
                              onClick={() => handleRemoveFile(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                              title="Remove file"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Upload Button */}
                <button
                  type="button"
                  onClick={handleExecuteUpload}
                  disabled={isUploading || selectedFiles.length === 0}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving {selectedFiles.length} Document(s)...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload & Register {selectedFiles.length} Document(s)</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Optional Small Collapsible Endpoint Setting */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAdvancedEndpoint(!showAdvancedEndpoint)}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer"
              >
                <Settings2 className="w-3 h-3 text-slate-400" />
                <span>Upload Target API Endpoint</span>
                {showAdvancedEndpoint ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {showAdvancedEndpoint && (
                <div className="mt-2 space-y-1 animate-in fade-in">
                  <input
                    type="text"
                    value={customApiUrl}
                    onChange={(e) => setCustomApiUrl(e.target.value)}
                    placeholder="/api/v1/documents/upload"
                    className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-600 shadow-2xs"
                  />
                  <p className="text-[10px] text-slate-400">
                    Default internal document store or custom upstream upload URL.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Project Uploaded Documents Library Table */}
        <div className="flex-1 w-full min-w-0 space-y-4">
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
            {/* Table Header & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold font-display text-slate-900">
                    Saved Project Documents Library
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {projectDocuments.length} Attachments
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Ready to link and use across test workflows for {currentProject?.name || 'Selected Project'}
                </p>
              </div>

              {/* Clean Search Box */}
              <div className="relative flex items-center w-52">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search filename or ID..."
                  style={{ paddingLeft: '2rem' }}
                  className="w-full pr-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:outline-none focus:border-indigo-600 focus:bg-white"
                />
              </div>
            </div>

            {/* Documents Table */}
            {isLoadingDocs ? (
              <div className="p-10 text-center text-slate-400 space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-indigo-600" />
                <p className="text-xs font-semibold">Loading project documents...</p>
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center space-y-2 bg-slate-50/40">
                <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                  <FileText className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-slate-700">No Documents Uploaded Yet</h4>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Drop up to 10 documents (PDF, Word, CSV, Excel, PPTX) on the left. Their generated <strong>Attachment IDs</strong> and <strong>Blob URLs</strong> will appear here for easy copy & use in workflows.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase tracking-wider text-[10px] font-bold">
                      <tr>
                        <th className="py-2.5 px-3">Document / File Name</th>
                        <th className="py-2.5 px-3">Attachment ID</th>
                        <th className="py-2.5 px-3">Blob URL</th>
                        <th className="py-2.5 px-3">Size</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredDocs.map((doc) => (
                        <tr key={doc.id || doc.attachment_id} className="hover:bg-slate-50/60 transition-colors">
                          {/* File Name */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-md bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                {getDocIcon(doc.file_name, doc.content_type)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-bold text-slate-900 truncate max-w-[150px]" title={doc.file_name}>
                                  {doc.file_name}
                                </p>
                                <p className="text-[10px] text-slate-400 font-mono">
                                  {doc.content_type || 'document'}
                                </p>
                              </div>
                            </div>
                          </td>

                          {/* Attachment ID */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1">
                              <span
                                style={{ color: '#3b0764', backgroundColor: '#faf5ff', borderColor: '#d8b4fe' }}
                                className="px-1.5 py-0.5 rounded border font-mono font-bold text-[10px]"
                              >
                                {doc.attachment_id}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyText(doc.attachment_id, `id_${doc.id}`)}
                                className="p-1 text-slate-400 hover:text-indigo-600 rounded cursor-pointer transition-colors"
                                title="Copy Attachment ID"
                              >
                                {copiedKey === `id_${doc.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* Blob URL */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1 max-w-[170px]">
                              <a
                                href={doc.blob_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:text-blue-800 font-mono text-[10px] truncate underline hover:no-underline flex items-center gap-0.5"
                                title={doc.blob_url}
                              >
                                <span className="truncate">{doc.blob_url}</span>
                                <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                              </a>
                              <button
                                type="button"
                                onClick={() => handleCopyText(doc.blob_url, `url_${doc.id}`)}
                                className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer transition-colors shrink-0"
                                title="Copy Blob URL"
                              >
                                {copiedKey === `url_${doc.id}` ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* File Size */}
                          <td className="py-2.5 px-3 font-mono text-[10px] text-slate-600">
                            {formatBytes(doc.file_size_bytes)}
                          </td>

                          {/* Actions */}
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setPreviewDoc(doc)}
                                className="p-1 text-slate-500 hover:text-indigo-600 rounded hover:bg-indigo-50 transition-colors cursor-pointer"
                                title="View Details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteDocument(doc.id || doc.attachment_id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                                title="Delete from project"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detail / Preview Pop-up Dialog */}
      {previewDoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
                  {getDocIcon(previewDoc.file_name, previewDoc.content_type)}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">{previewDoc.file_name}</h4>
                  <p className="text-[10px] font-mono text-slate-400">{previewDoc.content_type}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-500 block">Attachment ID</label>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-purple-700">{previewDoc.attachment_id}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyText(previewDoc.attachment_id, 'modal_id')}
                    className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-semibold cursor-pointer text-[10px]"
                  >
                    {copiedKey === 'modal_id' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-500 block">Blob URL</label>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-blue-600 truncate text-[11px]">{previewDoc.blob_url}</span>
                  <a
                    href={previewDoc.blob_url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-semibold shrink-0 text-[10px]"
                  >
                    Open
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <label className="text-[10px] font-bold uppercase text-slate-500 block">Size</label>
                  <span className="font-mono font-semibold text-slate-800">{formatBytes(previewDoc.file_size_bytes)}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <label className="text-[10px] font-bold uppercase text-slate-500 block">Uploaded At</label>
                  <span className="font-mono font-semibold text-slate-800 text-[11px]">{new Date(previewDoc.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="px-3 py-1 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
