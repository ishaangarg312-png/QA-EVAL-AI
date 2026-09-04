import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api';
import { AdminUser, SystemMetrics, KillSwitchItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  ShieldAlert,
  Users,
  Cpu,
  HardDrive,
  Activity,
  Server,
  Zap,
  Power,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lock,
  Unlock,
  Radio,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  UserCheck,
  UserX,
  Layers,
  ChevronRight
} from 'lucide-react';

export const AdminPanelView: React.FC = () => {
  const { user: currentAuthUser } = useAuth();

  // Navigation sub-tab inside Admin Panel
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'users' | 'resources' | 'killswitches'>('overview');

  // Users State
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'QA'>('ALL');
  const [userStats, setUserStats] = useState({ total: 0, online: 0, admins: 0, qas: 0 });
  const [isUpdatingUser, setIsUpdatingUser] = useState<string | null>(null);

  // Metrics State
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [metricsAutoRefresh, setMetricsAutoRefresh] = useState(true);

  // Kill Switches State
  const [killSwitches, setKillSwitches] = useState<KillSwitchItem[]>([]);
  const [isTogglingSwitch, setIsTogglingSwitch] = useState<string | null>(null);
  const [isEmergencyHalting, setIsEmergencyHalting] = useState(false);

  // Toast / Status banner
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Load Users
  const loadUsers = useCallback(async () => {
    try {
      const data = await api.getAdminUsers();
      setUsers(data.users || []);
      setUserStats({
        total: data.total || 0,
        online: data.online_count || 0,
        admins: data.admin_count || 0,
        qas: data.qa_count || 0,
      });
    } catch (err: any) {
      console.error('Failed to load admin users', err);
      showToast(err.response?.data?.detail || 'Failed to load user directory', 'error');
    }
  }, []);

  // Load System Metrics
  const loadMetrics = useCallback(async () => {
    try {
      setIsLoadingMetrics(true);
      const data = await api.getSystemMetrics();
      setMetrics(data);
    } catch (err: any) {
      console.error('Failed to load system metrics', err);
    } finally {
      setIsLoadingMetrics(false);
    }
  }, []);

  // Load Kill Switches
  const loadKillSwitches = useCallback(async () => {
    try {
      const data = await api.getKillSwitches();
      setKillSwitches(data.switches || []);
    } catch (err: any) {
      console.error('Failed to load kill switches', err);
      showToast(err.response?.data?.detail || 'Failed to load kill switches', 'error');
    }
  }, []);

  // Initial Load
  useEffect(() => {
    loadUsers();
    loadMetrics();
    loadKillSwitches();
  }, [loadUsers, loadMetrics, loadKillSwitches]);

  // Polling for metrics & active user heartbeats
  useEffect(() => {
    if (!metricsAutoRefresh) return;
    const interval = setInterval(() => {
      loadMetrics();
      loadUsers();
    }, 5000);
    return () => clearInterval(interval);
  }, [metricsAutoRefresh, loadMetrics, loadUsers]);

  // Promote / Demote Role
  const handleRoleChange = async (userId: string, newRole: 'ADMIN' | 'QA') => {
    try {
      setIsUpdatingUser(userId);
      const res = await api.updateUserRole(userId, newRole);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: res.role } : u))
      );
      showToast(res.message || `User role successfully updated to ${newRole}`);
      loadUsers();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to update user role', 'error');
    } finally {
      setIsUpdatingUser(null);
    }
  };

  // Activate / Deactivate Account
  const handleStatusChange = async (user: AdminUser) => {
    const nextStatus = !user.is_active;
    const confirmPrompt = nextStatus
      ? `Activate account for ${user.email}?`
      : `Deactivate account for ${user.email}? They will be immediately blocked and logged out.`;

    if (!window.confirm(confirmPrompt)) return;

    try {
      setIsUpdatingUser(user.id);
      const res = await api.updateUserStatus(user.id, nextStatus);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, is_active: nextStatus } : u))
      );
      showToast(res.message || `User account status updated`);
      loadUsers();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to update account status', 'error');
    } finally {
      setIsUpdatingUser(null);
    }
  };

  // Toggle Kill Switch
  const handleToggleSwitch = async (featureKey: string, currentEnabled: boolean) => {
    const nextState = !currentEnabled;
    const actionWord = nextState ? 'Enable' : 'KILL / Disable';
    if (!nextState) {
      const confirmKill = window.confirm(
        `Are you sure you want to activate the KILL SWITCH for "${featureKey}"? This will block all incoming requests for this feature immediately.`
      );
      if (!confirmKill) return;
    }

    try {
      setIsTogglingSwitch(featureKey);
      const res = await api.toggleKillSwitch(featureKey, nextState, `Toggled via Admin Panel by ${currentAuthUser?.email}`);
      setKillSwitches((prev) =>
        prev.map((s) => (s.key === featureKey ? { ...s, is_enabled: nextState } : s))
      );
      showToast(res.message || `Feature ${actionWord} successful`, nextState ? 'success' : 'warning');
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to toggle kill switch', 'error');
    } finally {
      setIsTogglingSwitch(null);
    }
  };

  // Emergency Platform Halt
  const handleEmergencyHalt = async () => {
    const reason = window.prompt(
      'EMERGENCY PLATFORM HALT:\nThis will immediately kill Flow Execution, Distributed Queue, Document Uploads, and User Registration.\n\nEnter reason for emergency halt:'
    );
    if (reason === null) return;

    try {
      setIsEmergencyHalting(true);
      const res = await api.triggerEmergencyKill(reason || 'Emergency platform halt triggered by Administrator');
      showToast(`🚨 ${res.message}`, 'warning');
      loadKillSwitches();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to trigger emergency halt', 'error');
    } finally {
      setIsEmergencyHalting(false);
    }
  };

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      (u.email || '').toLowerCase().includes(userSearch.toLowerCase()) ||
      (u.full_name || '').toLowerCase().includes(userSearch.toLowerCase());
    const matchesRole =
      roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const activeKillSwitchesCount = killSwitches.filter((s) => !s.is_enabled).length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 border text-xs font-semibold animate-in slide-in-from-top-4 ${
            toastMessage.type === 'error'
              ? 'bg-rose-900/90 text-rose-100 border-rose-700'
              : toastMessage.type === 'warning'
              ? 'bg-amber-900/90 text-amber-100 border-amber-700'
              : 'bg-emerald-900/90 text-emerald-100 border-emerald-700'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : toastMessage.type === 'warning' ? (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Header Banner - High Contrast Enterprise Theme */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h1 className="text-xl font-extrabold tracking-tight font-display text-slate-900">
                Admin & Platform Control Center
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-100 text-purple-700 border border-purple-200">
                RBAC PROTECTED
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-2xl">
              Real-time user authorization management, live AWS infrastructure monitoring, and dynamic API circuit breakers.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => {
                loadUsers();
                loadMetrics();
                loadKillSwitches();
                showToast('Telemetry refreshed');
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 transition-all flex items-center gap-2 cursor-pointer"
              title="Refresh all metrics"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingMetrics ? 'animate-spin' : ''}`} />
              <span>Refresh Telemetry</span>
            </button>

            <button
              onClick={handleEmergencyHalt}
              disabled={isEmergencyHalting}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              title="Emergency halt all APIs"
            >
              <Power className="w-3.5 h-3.5 fill-current" />
              <span>Emergency Halt All APIs</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1">
              <span>Active Users Now</span>
              <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            </div>
            <div className="text-2xl font-extrabold text-slate-900">
              {userStats.online} <span className="text-xs font-normal text-slate-500">/ {userStats.total} registered</span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1">
              <span>Administrators</span>
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
            </div>
            <div className="text-2xl font-extrabold text-purple-700">
              {userStats.admins} <span className="text-xs font-normal text-slate-500">admins</span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1">
              <span>CPU / System Load</span>
              <Cpu className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div className="text-2xl font-extrabold text-indigo-600">
              {metrics ? `${metrics.cpu.usage_percent}%` : '--'}
              <span className="text-xs font-normal text-slate-500 ml-1.5">
                {metrics ? `${metrics.cpu.load_avg_1m} load` : ''}
              </span>
            </div>
          </div>

          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1">
              <span>API Circuit Breakers</span>
              <Zap className={`w-3.5 h-3.5 ${activeKillSwitchesCount > 0 ? 'text-rose-500' : 'text-emerald-500'}`} />
            </div>
            <div className={`text-2xl font-extrabold ${activeKillSwitchesCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {activeKillSwitchesCount > 0 ? `${activeKillSwitchesCount} Killed` : 'All Active'}
            </div>
          </div>
        </div>
      </div>

      {/* Admin Tab Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-1">
        <div className="flex items-center gap-2">
          {[
            { id: 'overview', label: 'Platform Overview', icon: Layers },
            { id: 'users', label: `User Management (${users.length})`, icon: Users },
            { id: 'resources', label: 'AWS EC2 & Server Telemetry', icon: Server },
            { id: 'killswitches', label: `Kill Switches & Circuit Breakers (${killSwitches.length})`, icon: Zap },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={metricsAutoRefresh}
              onChange={(e) => setMetricsAutoRefresh(e.target.checked)}
              className="rounded text-purple-600 focus:ring-purple-500"
            />
            <span>Auto-poll (5s)</span>
          </label>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. OVERVIEW VIEW */}
      {/* ========================================================================= */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Active Kill Switches Alert if any are killed */}
          {activeKillSwitchesCount > 0 && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between text-rose-900">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold">Caution: {activeKillSwitchesCount} API Switch(es) Active</h4>
                  <p className="text-[11px] text-rose-700">
                    Certain endpoints are returning 503 Service Unavailable because an administrator disabled them.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveSubTab('killswitches')}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer"
              >
                Manage Switches
              </button>
            </div>
          )}

          {/* Quick 2-Column Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Live Infrastructure Widget */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5 lg:col-span-2">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                    <Server className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Host & AWS Infrastructure</h3>
                    <p className="text-[11px] text-slate-500">
                      {metrics?.aws_ec2?.is_ec2 ? 'Amazon EC2 Instance' : 'Dedicated Host Server'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveSubTab('resources')}
                  className="text-xs font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 cursor-pointer"
                >
                  <span>Detailed Telemetry</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {metrics ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* CPU Meter */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">CPU Usage</span>
                      <span className="font-extrabold text-indigo-600">{metrics.cpu.usage_percent}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          metrics.cpu.usage_percent > 85 ? 'bg-rose-500' : metrics.cpu.usage_percent > 65 ? 'bg-amber-500' : 'bg-indigo-600'
                        }`}
                        style={{ width: `${Math.min(100, metrics.cpu.usage_percent)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-500 flex justify-between">
                      <span>{metrics.cpu.core_count} Physical Cores</span>
                      <span>{metrics.cpu.logical_cpu_count} Logical CPUs</span>
                    </div>
                  </div>

                  {/* RAM Meter */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">Memory (RAM)</span>
                      <span className="font-extrabold text-purple-600">{metrics.memory.percent}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          metrics.memory.percent > 85 ? 'bg-rose-500' : metrics.memory.percent > 70 ? 'bg-amber-500' : 'bg-purple-600'
                        }`}
                        style={{ width: `${Math.min(100, metrics.memory.percent)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-500 flex justify-between">
                      <span>{(metrics.memory.used_mb / 1024).toFixed(1)} GB Used</span>
                      <span>{(metrics.memory.total_mb / 1024).toFixed(1)} GB Total</span>
                    </div>
                  </div>

                  {/* Disk Meter */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700">Disk Storage</span>
                      <span className="font-extrabold text-blue-600">{metrics.disk.percent}%</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          metrics.disk.percent > 90 ? 'bg-rose-500' : 'bg-blue-600'
                        }`}
                        style={{ width: `${Math.min(100, metrics.disk.percent)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-500 flex justify-between">
                      <span>{metrics.disk.used_gb} GB Used</span>
                      <span>{metrics.disk.free_gb} GB Free</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">Loading system metrics...</div>
              )}

              {/* AWS EC2 Metadata Summary */}
              {metrics?.aws_ec2?.is_ec2 && (
                <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-indigo-900">AWS EC2:</span>
                    <span className="font-mono text-indigo-700">{metrics.aws_ec2.instance_id}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600">{metrics.aws_ec2.instance_type}</span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600">{metrics.aws_ec2.region}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-indigo-200/60 text-indigo-900">
                    {metrics.aws_ec2.public_ip || metrics.aws_ec2.private_ip || 'Connected'}
                  </span>
                </div>
              )}
            </div>

            {/* Quick Live Users Card */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-600" />
                  <h3 className="text-sm font-bold text-slate-900">Live User Activity</h3>
                </div>
                <button
                  onClick={() => setActiveSubTab('users')}
                  className="text-xs font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 cursor-pointer"
                >
                  <span>All Users ({users.length})</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2.5">
                {users.slice(0, 5).map((u) => (
                  <div
                    key={u.id}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="relative flex h-2 w-2">
                        {u.is_online ? (
                          <>
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </>
                        ) : (
                          <span className="inline-flex rounded-full h-2 w-2 bg-slate-300"></span>
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{u.full_name || u.email}</div>
                        <div className="text-[10px] text-slate-500 truncate">{u.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        u.role === 'ADMIN'
                          ? 'bg-purple-100 text-purple-700 border border-purple-200'
                          : 'bg-slate-200 text-slate-700'
                      }`}>
                        {u.role}
                      </span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Kill Switches Summary Grid */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-slate-900">API Circuit Breaker Switches</h3>
              </div>
              <button
                onClick={() => setActiveSubTab('killswitches')}
                className="text-xs font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 cursor-pointer"
              >
                <span>Manage All Switches</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {killSwitches.slice(0, 3).map((sw) => (
                <div
                  key={sw.key}
                  className={`p-4 rounded-2xl border transition-all ${
                    sw.is_enabled
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-rose-50 border-rose-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs text-slate-900">{sw.name}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                      sw.is_enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800 animate-pulse'
                    }`}>
                      {sw.is_enabled ? 'OPERATIONAL' : 'KILLED'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 line-clamp-2">{sw.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. USER MANAGEMENT VIEW */}
      {/* ========================================================================= */}
      {activeSubTab === 'users' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">User Access & Role Control</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Grant or revoke Administrator privileges, monitor online presence, and deactivate accounts.
              </p>
            </div>

            {/* Filter and Search */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search user or email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  style={{ paddingLeft: '34px', paddingRight: '12px' }}
                  className="w-56 bg-slate-50 border border-slate-200 rounded-xl py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all shadow-2xs"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="ALL">All Roles</option>
                <option value="ADMIN">ADMIN Only</option>
                <option value="QA">QA Only</option>
              </select>
            </div>
          </div>

          {/* User Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Status & Presence</th>
                  <th className="py-3 px-4">Current Role</th>
                  <th className="py-3 px-4">Role Action</th>
                  <th className="py-3 px-4">Account Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                      No users found matching filter criteria.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = currentAuthUser?.id === u.id;
                    const isBusy = isUpdatingUser === u.id;

                    return (
                      <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* User info */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs text-white shrink-0 ${
                              u.role === 'ADMIN' ? 'bg-purple-700' : 'bg-slate-700'
                            }`}>
                              {u.full_name?.charAt(0).toUpperCase() || u.email.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                <span>{u.full_name || 'QA Member'}</span>
                                {isSelf && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                    YOU
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500 font-mono">{u.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Status & Presence */}
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="relative flex h-2.5 w-2.5">
                                {u.is_online ? (
                                  <>
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                  </>
                                ) : (
                                  <span className="inline-flex rounded-full h-2.5 w-2.5 bg-slate-300"></span>
                                )}
                              </span>
                              <span className="font-semibold text-slate-800">
                                {u.is_online ? 'Online now' : 'Offline'}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {u.last_active_at
                                ? `Last active: ${new Date(u.last_active_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                                : 'No recorded activity'}
                            </div>
                          </div>
                        </td>

                        {/* Current Role */}
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold border ${
                            u.role === 'ADMIN'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {u.role === 'ADMIN' ? <ShieldCheck className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                            <span>{u.role}</span>
                          </span>
                        </td>

                        {/* Change Role (Promote / Demote) */}
                        <td className="py-3.5 px-4">
                          {u.role === 'ADMIN' ? (
                            <button
                              type="button"
                              onClick={() => handleRoleChange(u.id, 'QA')}
                              disabled={isBusy}
                              className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                              title="Demote to standard QA role"
                            >
                              <span>Demote to QA</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRoleChange(u.id, 'ADMIN')}
                              disabled={isBusy}
                              className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                              title="Promote to Administrator"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Make Admin</span>
                            </button>
                          )}
                        </td>

                        {/* Account Status (Activate / Deactivate) */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {u.is_active ? 'Active' : 'Deactivated'}
                            </span>

                            {!isSelf && (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(u)}
                                disabled={isBusy}
                                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                                  u.is_active
                                    ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                                    : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                }`}
                              >
                                {u.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. AWS EC2 & SERVER RESOURCE MONITOR */}
      {/* ========================================================================= */}
      {activeSubTab === 'resources' && (
        <div className="space-y-6">
          {/* AWS EC2 Metadata Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {metrics?.aws_ec2?.is_ec2 ? 'AWS EC2 Instance Telemetry (IMDSv2)' : 'Host Server Environment'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Host: <strong>{metrics?.hostname || 'eval-ai-host'}</strong> • Platform: {metrics?.platform || 'Linux'}
                  </p>
                </div>
              </div>

              <span className={`px-3 py-1 rounded-full text-xs font-mono font-bold ${
                metrics?.aws_ec2?.is_ec2
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                  : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}>
                {metrics?.aws_ec2?.is_ec2 ? 'AWS EC2 RUNNING' : 'LOCAL / BARE METAL'}
              </span>
            </div>

            {metrics?.aws_ec2?.is_ec2 ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono text-xs">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-sans text-slate-400 uppercase font-bold block">Instance ID</span>
                  <span className="font-bold text-slate-900">{metrics.aws_ec2.instance_id || 'i-aws-ec2'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-sans text-slate-400 uppercase font-bold block">Instance Type</span>
                  <span className="font-bold text-slate-900">{metrics.aws_ec2.instance_type || 't3.small'}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-sans text-slate-400 uppercase font-bold block">Region & AZ</span>
                  <span className="font-bold text-slate-900">
                    {metrics.aws_ec2.region || 'us-east-1'} ({metrics.aws_ec2.availability_zone || 'zone-a'})
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-sans text-slate-400 uppercase font-bold block">Public / Private IP</span>
                  <span className="font-bold text-indigo-700 truncate block">
                    {metrics.aws_ec2.public_ip || metrics.aws_ec2.private_ip || '127.0.0.1'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Currently running in local development mode. When deployed to AWS EC2, instance IDs, types, and AWS availability zones will be discovered automatically via IMDSv2.
                </span>
              </div>
            )}
          </div>

          {/* Hardware Resource Usage Meters */}
          {metrics && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* CPU Meter */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <Cpu className="w-4 h-4 text-indigo-600" />
                    <span>CPU Performance</span>
                  </div>
                  <span className="text-lg font-extrabold text-indigo-600">{metrics.cpu.usage_percent}%</span>
                </div>

                <div className="w-full bg-slate-100 h-3.5 rounded-full overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      metrics.cpu.usage_percent > 80 ? 'bg-rose-500' : 'bg-indigo-600'
                    }`}
                    style={{ width: `${Math.min(100, metrics.cpu.usage_percent)}%` }}
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Physical Cores:</span>
                    <strong className="text-slate-900">{metrics.cpu.core_count}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Logical Processors:</span>
                    <strong className="text-slate-900">{metrics.cpu.logical_cpu_count}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Load Avg (1m, 5m, 15m):</span>
                    <strong className="font-mono text-slate-900">
                      {metrics.cpu.load_avg_1m}, {metrics.cpu.load_avg_5m}, {metrics.cpu.load_avg_15m}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Memory (RAM) Meter */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <Activity className="w-4 h-4 text-purple-600" />
                    <span>Memory (RAM)</span>
                  </div>
                  <span className="text-lg font-extrabold text-purple-600">{metrics.memory.percent}%</span>
                </div>

                <div className="w-full bg-slate-100 h-3.5 rounded-full overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      metrics.memory.percent > 85 ? 'bg-rose-500' : 'bg-purple-600'
                    }`}
                    style={{ width: `${Math.min(100, metrics.memory.percent)}%` }}
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Total RAM:</span>
                    <strong className="text-slate-900">{(metrics.memory.total_mb / 1024).toFixed(2)} GB</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Used RAM:</span>
                    <strong className="text-slate-900">{(metrics.memory.used_mb / 1024).toFixed(2)} GB</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Available RAM:</span>
                    <strong className="text-slate-900">{(metrics.memory.available_mb / 1024).toFixed(2)} GB</strong>
                  </div>
                </div>
              </div>

              {/* Disk Storage Meter */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                    <HardDrive className="w-4 h-4 text-blue-600" />
                    <span>Disk Storage</span>
                  </div>
                  <span className="text-lg font-extrabold text-blue-600">{metrics.disk.percent}%</span>
                </div>

                <div className="w-full bg-slate-100 h-3.5 rounded-full overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      metrics.disk.percent > 90 ? 'bg-rose-500' : 'bg-blue-600'
                    }`}
                    style={{ width: `${Math.min(100, metrics.disk.percent)}%` }}
                  />
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Total Storage:</span>
                    <strong className="text-slate-900">{metrics.disk.total_gb} GB</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Used Space:</span>
                    <strong className="text-slate-900">{metrics.disk.used_gb} GB</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Free Space:</span>
                    <strong className="text-slate-900">{metrics.disk.free_gb} GB</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* System Process Uptime */}
          <div className="p-4 rounded-2xl bg-slate-100/70 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <span>
                Backend Uptime: <strong>{metrics ? Math.floor(metrics.uptime_seconds / 60) : 0} minutes</strong> • Python {metrics?.python_version}
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              Timestamp: {metrics?.timestamp ? new Date(metrics.timestamp).toLocaleTimeString() : '--'}
            </span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. KILL SWITCHES & CIRCUIT BREAKERS */}
      {/* ========================================================================= */}
      {activeSubTab === 'killswitches' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" />
                  <h2 className="text-base font-extrabold text-slate-900">API Circuit Breaker Switches</h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Selectively kill or resume backend API endpoints instantly without restarting the EC2 instance or nginx.
                </p>
              </div>

              <button
                type="button"
                onClick={handleEmergencyHalt}
                disabled={isEmergencyHalting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 shadow-xs"
              >
                <Power className="w-4 h-4 fill-current" />
                <span>Emergency Halt All</span>
              </button>
            </div>

            {/* Kill Switches Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {killSwitches.map((sw) => {
                const isToggling = isTogglingSwitch === sw.key;

                return (
                  <div
                    key={sw.key}
                    className={`rounded-3xl p-5 border transition-all space-y-4 ${
                      sw.is_enabled
                        ? 'bg-white border-slate-200 hover:border-slate-300'
                        : 'bg-rose-50/50 border-rose-300 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{sw.name}</h3>
                          <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {sw.key}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">{sw.description}</p>
                      </div>

                      {/* Power Switch Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleSwitch(sw.key, sw.is_enabled)}
                        disabled={isToggling}
                        className={`w-12 h-7 rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                          sw.is_enabled ? 'bg-emerald-500' : 'bg-rose-600'
                        }`}
                        title={sw.is_enabled ? 'Click to KILL API' : 'Click to ENABLE API'}
                      >
                        <div
                          className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform ${
                            sw.is_enabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${sw.is_enabled ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`} />
                        <span className={`font-bold ${sw.is_enabled ? 'text-emerald-700' : 'text-rose-700 font-black'}`}>
                          {sw.is_enabled ? 'API Operational' : 'API KILLED (503 Blocked)'}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleSwitch(sw.key, sw.is_enabled)}
                        disabled={isToggling}
                        className={`px-3 py-1 rounded-xl font-bold transition-all text-xs cursor-pointer border ${
                          sw.is_enabled
                            ? 'border-rose-300 text-rose-700 hover:bg-rose-50'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                        }`}
                      >
                        {sw.is_enabled ? 'Kill Switch' : 'Enable Switch'}
                      </button>
                    </div>

                    {sw.reason && !sw.is_enabled && (
                      <div className="p-2.5 rounded-xl bg-rose-100/70 border border-rose-200 text-[11px] text-rose-800">
                        <strong>Kill Reason:</strong> {sw.reason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
