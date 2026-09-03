import React, { useState } from 'react';
import { Modal } from './Modal';
import { Project } from '../types';
import { api } from '../services/api';
import { FolderPlus, Check } from 'lucide-react';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, description?: string) => Promise<void>;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setIsSubmitting(true);
      await onCreate(name.trim(), description.trim() || undefined);
      setName('');
      setDescription('');
      onClose();
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New AI Agent QA Project"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs">
          <FolderPlus className="w-5 h-5 text-indigo-600 shrink-0" />
          <span>Each project organizes test suites, workflows, environments, and quality gates for a specific AI Agent.</span>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-800 block mb-1">
            Project Name <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sage Chatbot Test Suite"
            className="w-full bg-slate-50 border border-slate-300 focus:bg-white rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-800 block mb-1">Description (Optional)</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the agent's responsibilities, tools, and intended workflows..."
            className="w-full bg-slate-50 border border-slate-300 focus:bg-white rounded-xl p-2.5 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{isSubmitting ? 'Creating...' : 'Create Project'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};
