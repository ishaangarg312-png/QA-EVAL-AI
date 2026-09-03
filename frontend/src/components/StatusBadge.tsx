import React from 'react';
import { ExecutionStatus, EvaluationVerdict } from '../types';
import { CheckCircle2, XCircle, Clock, AlertTriangle, UserCheck, Play } from 'lucide-react';

interface StatusBadgeProps {
  status: ExecutionStatus | EvaluationVerdict | string;
  size?: 'sm' | 'md' | 'lg';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const normalized = (status || '').toUpperCase();

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  }[size];

  if (normalized === 'PASSED' || normalized === 'PASS' || normalized === 'GO' || normalized === 'SUCCESS') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 ${sizeClasses}`}>
        <CheckCircle2 className="w-3 h-3 text-emerald-700" />
        {normalized}
      </span>
    );
  }

  if (normalized === 'FAILED' || normalized === 'FAIL' || normalized === 'NO-GO') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full font-bold bg-rose-50 text-rose-800 border border-rose-300 ${sizeClasses}`}>
        <XCircle className="w-3 h-3 text-rose-700" />
        {normalized}
      </span>
    );
  }

  if (normalized === 'WAITING_FOR_HUMAN' || normalized === 'PENDING') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full font-bold bg-amber-50 text-amber-900 border border-amber-300 animate-pulse ${sizeClasses}`}>
        <UserCheck className="w-3 h-3 text-amber-700" />
        HITL REQUIRED
      </span>
    );
  }

  if (normalized === 'RUNNING') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full font-bold bg-blue-50 text-blue-800 border border-blue-300 ${sizeClasses}`}>
        <Play className="w-3 h-3 text-blue-700 animate-spin" />
        RUNNING
      </span>
    );
  }

  if (normalized === 'WARNING') {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full font-bold bg-amber-50 text-amber-900 border border-amber-300 ${sizeClasses}`}>
        <AlertTriangle className="w-3 h-3 text-amber-700" />
        WARNING
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-bold bg-slate-100 text-slate-800 border border-slate-300 ${sizeClasses}`}>
      <Clock className="w-3 h-3 text-slate-600" />
      {normalized || 'QUEUED'}
    </span>
  );
};
