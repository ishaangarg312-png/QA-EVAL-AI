import React, { useState } from 'react';
import { ExecutionRun } from '../../types';
import { Modal } from '../../components/Modal';
import { UserCheck, ShieldAlert, Check, X } from 'lucide-react';

interface HITLModalProps {
  isOpen: boolean;
  onClose: () => void;
  execution: ExecutionRun | null;
  onResolve: (approved: boolean, comments: string) => Promise<void>;
}

export const HITLModal: React.FC<HITLModalProps> = ({
  isOpen,
  onClose,
  execution,
  onResolve,
}) => {
  const [comments, setComments] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAction = async (approved: boolean) => {
    setIsSubmitting(true);
    try {
      await onResolve(approved, comments || (approved ? 'Approved by QA Lead' : 'Rejected by QA Lead'));
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!execution) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Human-in-the-Loop (HITL) Gate Approval"
    >
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 flex items-start gap-3">
          <UserCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-amber-950">Policy Authorization Required</h4>
            <p className="text-xs text-amber-900 mt-1 leading-relaxed">
              The Agent requested an action requiring elevated permission or QA review.
              Company policy requires authorization before proceeding.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
          <div className="flex justify-between text-slate-600">
            <span className="font-semibold">Execution Correlation:</span>
            <span className="font-mono font-bold text-indigo-700">{execution.correlation_id}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span className="font-semibold">Status:</span>
            <span className="font-bold text-amber-700">{execution.status}</span>
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-800 mb-1 block">Reviewer Notes / Comments</label>
          <input
            type="text"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="e.g., Authorized per test matrix requirement"
            className="w-full bg-slate-50 border border-slate-300 focus:bg-white rounded-xl p-2.5 text-xs text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            disabled={isSubmitting}
            onClick={() => handleAction(false)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span>Reject Execution</span>
          </button>
          <button
            disabled={isSubmitting}
            onClick={() => handleAction(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Approve & Continue</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
