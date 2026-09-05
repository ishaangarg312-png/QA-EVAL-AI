import React from 'react';
import {
  LayoutDashboard,
  GitFork,
  Activity,
  CheckCircle,
  FileSpreadsheet,
  UploadCloud,
  Layers,
  Settings,
  ShieldAlert,
  Sparkles,
  FileText,
  Bot,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type NavTab =
  | 'dashboard'
  | 'workflows'
  | 'executions'
  | 'test_management'
  | 'test_generator'
  | 'test_document'
  | 'upload_document'
  | 'swarm_async'
  | 'regression'
  | 'settings'
  | 'admin_panel';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  pendingHITLCount?: number;
}

interface NavItem {
  id: NavTab;
  label: string;
  icon: React.FC<any>;
  badge?: string;
  count?: number;
  adminOnly?: boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, pendingHITLCount = 0 }) => {
  const { user } = useAuth();
  const isAdmin = user?.role?.toUpperCase() === 'ADMIN';

  const navSections: NavSection[] = [
    {
      title: 'CORE PLATFORM',
      items: [
        { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard },
        { id: 'workflows', label: 'Visual Workflow Studio', icon: GitFork },
      ],
    },
    {
      title: 'AI GENERATORS',
      items: [
        { id: 'test_generator', label: 'Test Case & Data Gen', icon: Sparkles, badge: 'AI' },
        { id: 'test_document', label: 'Test Document Gen', icon: FileText, badge: 'AI' },
        { id: 'upload_document', label: 'Document Attachments', icon: UploadCloud },
      ],
    },
    {
      title: 'EXECUTION & TRACING',
      items: [
        { id: 'executions', label: 'Live Traces & Runs', icon: Activity, count: pendingHITLCount },
        { id: 'test_management', label: 'Test Suites & Matrix', icon: CheckCircle },
        { id: 'swarm_async', label: 'Swarm Hub', icon: Layers },
        { id: 'regression', label: 'Regression Matrix', icon: FileSpreadsheet },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'settings', label: 'Quality Policies', icon: Settings },
        { id: 'admin_panel', label: 'Admin Telemetry', icon: ShieldAlert, badge: 'ADMIN', adminOnly: true },
      ],
    },
  ];

  return (
    <aside
      className="figma-sidebar-root"
      style={{
        backgroundColor: '#0b0f19',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        color: '#f8fafc',
        width: '260px',
        minWidth: '260px',
        maxWidth: '260px',
        height: '100%',
        maxHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        userSelect: 'none',
        position: 'relative',
        zIndex: 30,
        overflowX: 'hidden',
      }}
    >
      {/* Brand Header */}
      <div
        className="figma-sidebar-header"
        style={{
          padding: '12px 14px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#0b0f19',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          height: '56px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #38bdf8 100%)',
              padding: '1px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: '#0b0f19',
                borderRadius: '9px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bot style={{ width: '16px', height: '16px', color: '#818cf8' }} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
                EVAL AI
              </span>
              <span
                style={{
                  fontSize: '9px',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '9999px',
                  backgroundColor: 'rgba(99, 102, 241, 0.2)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(99, 102, 241, 0.35)',
                }}
              >
                v2.4
              </span>
            </div>
            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 500 }}>
              Enterprise QA Platform
            </span>
          </div>
        </div>
      </div>

      {/* Nav List with Sections */}
      <nav
        className="figma-sidebar-nav"
        style={{
          flex: '1 1 0%',
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {navSections.map((section) => {
          const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.title} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div
                className="figma-nav-section-title"
                style={{
                  fontSize: '9.5px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: '#64748b',
                  padding: '2px 8px',
                  marginBottom: '1px',
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                {section.title}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onTabChange(item.id)}
                      className={`figma-nav-btn ${isActive ? 'active' : ''}`}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 9px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: isActive ? 600 : 500,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        border: isActive
                          ? '1px solid rgba(255, 255, 255, 0.15)'
                          : '1px solid transparent',
                        color: isActive ? '#ffffff' : '#94a3b8',
                        background: isActive
                          ? 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 60%, #a855f7 100%)'
                          : 'transparent',
                        boxShadow: isActive ? '0 4px 14px -2px rgba(99, 102, 241, 0.5)' : 'none',
                        textAlign: 'left',
                        height: '33px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          minWidth: 0,
                          overflow: 'hidden',
                        }}
                      >
                        <Icon
                          style={{
                            width: '15px',
                            height: '15px',
                            flexShrink: 0,
                            color: isActive ? '#ffffff' : '#94a3b8',
                          }}
                        />
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            letterSpacing: '-0.01em',
                          }}
                        >
                          {item.label}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          flexShrink: 0,
                          marginLeft: '6px',
                        }}
                      >
                        {item.count !== undefined && item.count > 0 && (
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: '9999px',
                              backgroundColor: isActive ? '#fbbf24' : 'rgba(245, 158, 11, 0.2)',
                              color: isActive ? '#0f172a' : '#fcd34d',
                              border: isActive ? 'none' : '1px solid rgba(245, 158, 11, 0.35)',
                            }}
                          >
                            {item.count}
                          </span>
                        )}
                        {item.badge && (
                          <span
                            style={{
                              fontSize: '8.5px',
                              fontFamily: 'JetBrains Mono, monospace',
                              padding: '1px 5px',
                              borderRadius: '9999px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                              backgroundColor: isActive
                                ? 'rgba(255, 255, 255, 0.25)'
                                : item.badge === 'ADMIN'
                                ? 'rgba(16, 185, 129, 0.2)'
                                : 'rgba(139, 92, 246, 0.25)',
                              color: isActive
                                ? '#ffffff'
                                : item.badge === 'ADMIN'
                                ? '#6ee7b7'
                                : '#c4b5fd',
                              border: isActive
                                ? 'none'
                                : item.badge === 'ADMIN'
                                ? '1px solid rgba(16, 185, 129, 0.35)'
                                : '1px solid rgba(139, 92, 246, 0.4)',
                            }}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer / User Profile Card (Exact Figma Spec) */}
      <div
        className="figma-sidebar-footer"
        style={{
          padding: '10px 10px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: '#070a12',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: '8px 10px',
            borderRadius: '10px',
            backgroundColor: '#0f172a',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '9999px',
                  background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#ffffff',
                  flexShrink: 0,
                }}
              >
                {user?.email?.charAt(0).toUpperCase() || 'I'}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 600,
                    color: '#f1f5f9',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    margin: 0,
                    lineHeight: '1.2',
                  }}
                >
                  {user?.full_name || user?.email || 'Ishaan Garg'}
                </p>
                <p
                  style={{
                    fontSize: '9.5px',
                    color: '#64748b',
                    margin: 0,
                    lineHeight: '1.2',
                  }}
                >
                  {user?.role ? `${user.role.toUpperCase()}` : 'Admin'}
                </p>
              </div>
            </div>

            {/* Online Status Dot */}
            <div
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '9999px',
                backgroundColor: '#10b981',
                boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)',
                flexShrink: 0,
              }}
            />
          </div>

          <div
            style={{
              paddingTop: '6px',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '9.5px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div
                style={{
                  width: '5px',
                  height: '5px',
                  borderRadius: '9999px',
                  backgroundColor: '#10b981',
                }}
              />
              <span style={{ color: '#94a3b8', fontWeight: 500 }}>System Healthy</span>
            </div>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#475569', fontSize: '9px' }}>
              v2.4
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};
