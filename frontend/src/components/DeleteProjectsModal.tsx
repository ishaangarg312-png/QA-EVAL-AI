import React, { useState, useMemo, useEffect } from 'react';
import { Project } from '../types';
import { Trash2, AlertTriangle, Search, CheckSquare, Square, X, Calendar, Server } from 'lucide-react';

interface DeleteProjectsModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  onDeleteProjects: (projectIds: string[]) => Promise<void>;
  initialSelectedId?: string;
}

export const DeleteProjectsModal: React.FC<DeleteProjectsModalProps> = ({
  isOpen,
  onClose,
  projects,
  onDeleteProjects,
  initialSelectedId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialSelectedId) {
        setSelectedIds(new Set([initialSelectedId]));
      } else {
        setSelectedIds(new Set());
      }
      setSearchQuery('');
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, initialSelectedId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }, [projects, searchQuery]);

  const allFilteredSelected =
    filteredProjects.length > 0 &&
    filteredProjects.every((p) => selectedIds.has(p.id));

  const toggleSelectAll = () => {
    const next = new Set(selectedIds);
    if (allFilteredSelected) {
      filteredProjects.forEach((p) => next.delete(p.id));
    } else {
      filteredProjects.forEach((p) => next.add(p.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectProject = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;
    const count = selectedIds.size;
    const confirmMsg = `Are you sure you want to permanently delete ${count} project${count > 1 ? 's' : ''}? All workflows, test suites, datasets, and execution traces will be erased.`;

    if (window.confirm(confirmMsg)) {
      setIsDeleting(true);
      try {
        await onDeleteProjects(Array.from(selectedIds));
        onClose();
      } catch (err) {
        console.error('Error deleting projects:', err);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        padding: '16px'
      }}
    >
      {/* Backdrop click to close */}
      <div
        style={{ position: 'absolute', inset: 0 }}
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '760px',
          maxWidth: '95vw',
          height: '620px',
          maxHeight: '90vh',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 10
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #f1f5f9',
            backgroundColor: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                backgroundColor: '#ffe4e6',
                color: '#e11d48',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <Trash2 style={{ width: '20px', height: '20px' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                Delete Projects (Permanent)
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                Select one or multiple projects to permanently remove from the platform
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              padding: '6px',
              borderRadius: '8px',
              color: '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X style={{ width: '20px', height: '20px' }} />
          </button>
        </div>

        {/* Body Content with guaranteed flex scroll */}
        <div
          style={{
            flex: '1 1 0%',
            minHeight: 0,
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            backgroundColor: '#ffffff'
          }}
        >
          {/* Danger Warning Banner */}
          <div
            style={{
              padding: '12px 16px',
              borderRadius: '12px',
              backgroundColor: '#fff1f2',
              border: '1px solid #fecdd3',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              flexShrink: 0
            }}
          >
            <AlertTriangle style={{ width: '18px', height: '18px', color: '#e11d48', flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: '12px', color: '#881337', lineHeight: 1.4 }}>
              <strong style={{ fontWeight: 800, color: '#4c0519' }}>Irreversible Action: </strong>
              Deleting selected projects permanently erases all associated workflows, test suites, datasets, traces, and execution history.
            </div>
          </div>

          {/* Search & Select-All Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: '16px',
                  height: '16px',
                  color: '#94a3b8'
                }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search projects by name or description..."
                style={{
                  width: '100%',
                  paddingLeft: '36px',
                  paddingRight: '12px',
                  paddingTop: '9px',
                  paddingBottom: '9px',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  fontSize: '13px',
                  color: '#0f172a',
                  fontWeight: 600,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              type="button"
              onClick={toggleSelectAll}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                borderRadius: '12px',
                backgroundColor: allFilteredSelected ? '#fee2e2' : '#f1f5f9',
                color: allFilteredSelected ? '#991b1b' : '#334155',
                border: `1px solid ${allFilteredSelected ? '#fca5a5' : '#cbd5e1'}`,
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              {allFilteredSelected ? (
                <CheckSquare style={{ width: '16px', height: '16px', color: '#dc2626' }} />
              ) : (
                <Square style={{ width: '16px', height: '16px', color: '#64748b' }} />
              )}
              <span>{allFilteredSelected ? 'Deselect All' : 'Select All'}</span>
            </button>
          </div>

          {/* Project List with Visible Scrollbar */}
          <div
            style={{
              flex: '1 1 0%',
              minHeight: 0,
              overflowY: 'auto',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              backgroundColor: '#ffffff'
            }}
          >
            {filteredProjects.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b', fontSize: '13px', fontWeight: 500 }}>
                No matching projects found.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filteredProjects.map((p, idx) => {
                  const isChecked = selectedIds.has(p.id);
                  return (
                    <div
                      key={p.id}
                      onClick={() => toggleSelectProject(p.id)}
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        backgroundColor: isChecked ? '#fff1f2' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc'),
                        borderLeft: isChecked ? '4px solid #e11d48' : '4px solid transparent',
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background-color 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: 1, paddingRight: '12px' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectProject(p.id)}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: '18px',
                            height: '18px',
                            cursor: 'pointer',
                            accentColor: '#dc2626',
                            flexShrink: 0
                          }}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                              {p.name}
                            </span>
                            {p.environments && (
                              <span
                                style={{
                                  fontSize: '10px',
                                  fontFamily: 'monospace',
                                  fontWeight: 700,
                                  backgroundColor: '#e2e8f0',
                                  color: '#334155',
                                  padding: '2px 6px',
                                  borderRadius: '6px'
                                }}
                              >
                                {p.environments.length} Envs
                              </span>
                            )}
                          </div>
                          <p
                            style={{
                              margin: '2px 0 0 0',
                              fontSize: '11px',
                              color: '#64748b',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {p.description || 'No description provided'}
                          </p>
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          color: '#94a3b8',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Calendar style={{ width: '12px', height: '12px' }} />
                        <span>{p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Active'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #f1f5f9',
            backgroundColor: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}
        >
          <div style={{ fontSize: '13px', color: '#334155', fontWeight: 700 }}>
            <span style={{ color: '#dc2626', fontWeight: 900, fontSize: '15px' }}>{selectedIds.size}</span> of{' '}
            <span style={{ color: '#0f172a', fontWeight: 800 }}>{projects.length}</span> projects selected
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              style={{
                padding: '9px 18px',
                borderRadius: '12px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#475569',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || selectedIds.size === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 20px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: selectedIds.size === 0 ? '#fda4af' : '#dc2626',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 800,
                cursor: selectedIds.size === 0 || isDeleting ? 'not-allowed' : 'pointer',
                boxShadow: selectedIds.size > 0 ? '0 4px 6px -1px rgba(220, 38, 38, 0.2)' : 'none',
                opacity: isDeleting ? 0.7 : 1
              }}
            >
              <Trash2 style={{ width: '15px', height: '15px' }} />
              <span>
                {isDeleting
                  ? 'Deleting...'
                  : `Permanently Delete Selected (${selectedIds.size})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
