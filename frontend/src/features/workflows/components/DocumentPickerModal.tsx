import React, { useState } from 'react';
import { UploadedDocument } from '../../../types';
import { getCleanExt, getExtBadgeClass } from '../utils/workflowHelpers';
import {
  FileUp,
  FileText,
  Search,
  X
} from 'lucide-react';

interface DocumentPickerModalProps {
  isOpen: boolean;
  projectDocuments: UploadedDocument[];
  attachedFiles: any[];
  onUpdateAttachedFiles: (updatedFiles: any[]) => void;
  onClose: () => void;
}

export const DocumentPickerModal: React.FC<DocumentPickerModalProps> = ({
  isOpen,
  projectDocuments,
  attachedFiles,
  onUpdateAttachedFiles,
  onClose,
}) => {
  const [docPickerSearch, setDocPickerSearch] = useState<string>('');

  if (!isOpen) return null;

  const filteredDocs = projectDocuments.filter(
    (d) =>
      d.file_name.toLowerCase().includes(docPickerSearch.toLowerCase()) ||
      d.attachment_id.toLowerCase().includes(docPickerSearch.toLowerCase())
  );

  return (
    <div className="absolute inset-0 bg-white z-50 flex flex-col p-6 animate-in fade-in space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-2xs">
            <FileUp className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold font-display text-slate-900">
              Select Documents from Project Library
            </h4>
            <p className="text-xs text-slate-500">
              Choose documents to attach to this node (Max 5 total)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search Filter */}
      <div className="relative flex items-center shrink-0">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
        <input
          type="text"
          value={docPickerSearch}
          onChange={(e) => setDocPickerSearch(e.target.value)}
          placeholder="Search saved documents by filename or ID..."
          style={{ paddingLeft: '2.2rem' }}
          className="w-full pr-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-900 focus:outline-none focus:border-amber-600 focus:bg-white"
        />
      </div>

      {/* Documents List */}
      <div className="flex-1 overflow-y-auto space-y-2 p-1.5 bg-slate-50/60 rounded-2xl border border-slate-200">
        {filteredDocs.length === 0 ? (
          <div className="p-12 text-center space-y-2 text-slate-400">
            <FileText className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-xs font-semibold">No matching documents found in project library.</p>
            <p className="text-[11px] text-slate-400">Upload documents in the "Upload Document" sidebar tab first.</p>
          </div>
        ) : (
          filteredDocs.map((doc) => {
            const isSelected = attachedFiles.some(
              (f: any) => f.attachment_id === doc.attachment_id || f.name === doc.file_name
            );
            const ext = getCleanExt(doc.file_name, doc.content_type);

            return (
              <div
                key={doc.id || doc.attachment_id}
                onClick={() => {
                  if (isSelected) {
                    const updated = attachedFiles.filter(
                      (f: any) => f.attachment_id !== doc.attachment_id && f.name !== doc.file_name
                    );
                    onUpdateAttachedFiles(updated);
                  } else {
                    if (attachedFiles.length >= 5) {
                      alert('Maximum 5 documents can be attached to this node.');
                      return;
                    }
                    const newDocItem = {
                      name: doc.file_name,
                      size: doc.file_size_bytes,
                      type: ext,
                      blob_url: doc.blob_url,
                      attachment_id: doc.attachment_id,
                    };
                    onUpdateAttachedFiles([...attachedFiles, newDocItem]);
                  }
                }}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-amber-50/90 border-amber-400 ring-2 ring-amber-300 shadow-2xs'
                    : 'bg-white border-slate-200 hover:border-amber-300 hover:bg-amber-50/30'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer accent-amber-600 shrink-0"
                  />
                  <span className={`px-1.5 py-0.5 rounded font-mono font-bold text-[9px] border shrink-0 ${getExtBadgeClass(ext)}`}>
                    {ext}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900 truncate max-w-[360px]" title={doc.file_name}>
                      {doc.file_name}
                    </p>
                    <p className="text-[10px] font-mono text-purple-700 mt-0.5">
                      {doc.attachment_id} • {(doc.file_size_bytes / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>

                <span
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900'
                  }`}
                >
                  {isSelected ? '✓ Selected' : '+ Select'}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-700">
            Attached to Node:
          </span>
          <span className="px-2 py-0.5 rounded-full font-mono text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
            {attachedFiles.length} / 5
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-xs cursor-pointer transition-all"
        >
          Done Attaching
        </button>
      </div>
    </div>
  );
};
