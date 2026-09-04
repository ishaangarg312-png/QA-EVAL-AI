import React from 'react';
import {
  FolderKanban,
  GitFork,
  Activity,
  Database,
  GitCompare,
  ShieldCheck,
  FileUp,
  Bot,
  LogOut,
  SlidersHorizontal
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export type NavTab =
  | 'dashboard'
  | 'workflows'
  | 'executions'
  | 'test_management'
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

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  pendingHITLCount = 0,
}) => {
  const { user, logout } = useAuth();
  const mainNavItems = [
    { id: 'dashboard' as NavTab, label: 'Projects & Overview', icon: FolderKanban },
    { id: 'workflows' as NavTab, label: 'Flow Builder', icon: GitFork },
    { id: 'executions' as NavTab, label: 'Result Capture & Traces', icon: Activity, badge: pendingHITLCount > 0 ? `${pendingHITLCount} HITL` : undefined },
    { id: 'test_management' as NavTab, label: 'Datasets & Matrix', icon: Database },
    { id: 'upload_document' as NavTab, label: 'Upload Document', icon: FileUp },
    { id: 'swarm_async' as NavTab, label: 'Swarm & Async Hub', icon: Bot },
  ];

  const insightsNavItems = [
    { id: 'regression' as NavTab, label: 'Reports & Regression', icon: GitCompare },
    { id: 'settings' as NavTab, label: 'Settings & Vault', icon: ShieldCheck },
  ];

  return (
    <aside className="w-64 border-r border-slate-200 bg-white text-slate-700 p-4 flex flex-col justify-between shrink-0 select-none">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="px-3 pt-2 pb-1">
          <h1 className="text-base font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <span>EVAL AI</span>
          </h1>
          <p className="text-[11px] text-slate-500 font-medium">AI Testing Suite</p>
        </div>

        {/* MAIN Section */}
        <div className="space-y-1">
          <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            MAIN
          </p>
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* INSIGHTS Section */}
        <div className="space-y-1">
          <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            INSIGHTS
          </p>
          {insightsNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* ADMINISTRATION Section (RBAC Protected: ADMIN role only) */}
        {user?.role?.toUpperCase() === 'ADMIN' && (
          <div className="space-y-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-purple-600 mb-2 flex items-center justify-between">
              <span>ADMINISTRATION</span>
              <span className="bg-purple-100 text-purple-700 text-[9px] px-1.5 py-0.5 rounded font-bold border border-purple-200">
                ADMIN
              </span>
            </p>
            <button
              onClick={() => onTabChange('admin_panel')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'admin_panel'
                  ? 'bg-purple-950 text-white shadow-xs'
                  : 'text-purple-700 hover:text-purple-900 hover:bg-purple-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <SlidersHorizontal className={`w-4 h-4 ${activeTab === 'admin_panel' ? 'text-purple-300' : 'text-purple-600'}`} />
                <span>Admin Panel</span>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="System Monitor Live" />
            </button>
          </div>
        )}
      </div>

      {/* User / Org Footer & Sign Out */}
      <div className="pt-4 border-t border-slate-200 px-2 flex items-center justify-between text-xs text-slate-600">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shadow-xs shrink-0 ${
            user?.role?.toUpperCase() === 'ADMIN' ? 'bg-purple-700 text-white' : 'bg-indigo-600 text-white'
          }`}>
            {user?.full_name?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 leading-tight truncate">
              {user?.full_name || (user?.role?.toUpperCase() === 'ADMIN' ? 'Administrator' : 'QA Engineer')}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] text-slate-500 font-medium truncate max-w-[90px]">
                {user?.email || 'Authenticated'}
              </span>
              <span className={`text-[9px] font-black uppercase px-1 py-0.2 rounded border ${
                user?.role?.toUpperCase() === 'ADMIN'
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}>
                {user?.role?.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'QA'}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          title="Sign Out"
          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0 ml-1"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
