import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../../services/api';
import {
  AdminUser,
  SystemMetrics,
  KillSwitchItem,
  AIProviderConfig,
  DiscoveredModel,
  AIProviderKeyItem,
  ModelTestConnectionResult,
  AIUsageSummary,
  UserAIUsage,
  AIUsageLogItem
} from '../../types';
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
  ChevronRight,
  ChevronDown,
  ChevronUp,
  List,
  LayoutGrid,
  X,
  Bot,
  Key,
  Eye,
  EyeOff,
  Sparkles,
  Flame,
  Check,
  ExternalLink,
  Sliders,
  CheckSquare,
  Square,
  Filter,
  Plus,
  Trash2,
  Play,
  Star,
  BarChart3,
  Database,
  Copy,
  TrendingUp,
  Gauge,
} from 'lucide-react';

// Default probe model per provider used for connection testing & dynamic model discovery
const DEFAULT_PROBE_MODELS: Record<string, string> = {
  groq: 'openai/gpt-oss-120b',
  gemini: 'gemini-1.5-flash',
  openai: 'gpt-4o-mini',
};

export const AdminPanelView: React.FC = () => {
  const { user: currentAuthUser } = useAuth();

  // Navigation sub-tab inside Admin Panel
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'ai-providers' | 'usage' | 'users' | 'resources' | 'killswitches'>('overview');

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

  // AI Providers & Multi-Key State
  const [aiProviders, setAiProviders] = useState<AIProviderConfig[]>([]);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [discoveringProvider, setDiscoveringProvider] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [providerKeyInputs, setProviderKeyInputs] = useState<Record<string, string>>({});
  const [showKeyMap, setShowKeyMap] = useState<Record<string, boolean>>({});
  const [modelSearchMap, setModelSearchMap] = useState<Record<string, string>>({});
  const [providerFilterTab, setProviderFilterTab] = useState<'ALL' | 'groq' | 'gemini' | 'openai'>('ALL');

  // Multi-key Pool Form State
  const [addingKeyProvider, setAddingKeyProvider] = useState<string | null>(null);
  const [newKeyForm, setNewKeyForm] = useState<{ name: string; key: string; is_primary: boolean }>({
    name: '',
    key: '',
    is_primary: false,
  });
  const [showNewKeySecret, setShowNewKeySecret] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [isDeletingKeyId, setIsDeletingKeyId] = useState<string | null>(null);

  // Model Connection Test State
  const [testingModel, setTestingModel] = useState<{ provider: string; model_id: string } | null>(null);
  const [testResult, setTestResult] = useState<ModelTestConnectionResult | null>(null);
  const [testModalOpen, setTestModalOpen] = useState(false);

  // Usage Analytics State
  const [usageSummary, setUsageSummary] = useState<AIUsageSummary | null>(null);
  const [userUsageList, setUserUsageList] = useState<UserAIUsage[]>([]);
  const [usageLogs, setUsageLogs] = useState<AIUsageLogItem[]>([]);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [usageUserSearch, setUsageUserSearch] = useState('');
  const [usageProviderFilter, setUsageProviderFilter] = useState<'ALL' | 'groq' | 'gemini' | 'openai'>('ALL');

  // Toast / Status banner
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // Model Catalog Display & Collapse State
  const [collapsedCatalogs, setCollapsedCatalogs] = useState<Record<string, boolean>>({});
  const [catalogViewMode, setCatalogViewMode] = useState<'compact' | 'cards'>('compact');
  const [isPreviewUserModalOpen, setIsPreviewUserModalOpen] = useState(false);
  const [isFinalizingAll, setIsFinalizingAll] = useState(false);

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

  // Load AI Providers
  const loadAIProviders = useCallback(async () => {
    try {
      setIsLoadingProviders(true);
      const data = await api.getAIProviders();
      setAiProviders(data.providers || []);
    } catch (err: any) {
      console.error('Failed to load AI providers', err);
      showToast(err.response?.data?.detail || 'Failed to load AI providers', 'error');
    } finally {
      setIsLoadingProviders(false);
    }
  }, []);

  // Initial Load
  useEffect(() => {
    loadUsers();
    loadMetrics();
    loadKillSwitches();
    loadAIProviders();
  }, [loadUsers, loadMetrics, loadKillSwitches, loadAIProviders]);


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

  // AI Providers Handlers
  const handleDiscoverModels = async (provider: string) => {
    try {
      setDiscoveringProvider(provider);
      const keyVal = providerKeyInputs[provider]?.trim();
      const res = await api.discoverAIModels(provider, keyVal || undefined);
      
      setAiProviders((prev) =>
        prev.map((p) =>
          p.provider === provider
            ? {
                ...p,
                is_configured: res.is_configured,
                masked_key: res.masked_key || p.masked_key,
                available_models: res.available_models,
                selected_models: res.selected_models,
                model_count: res.count,
                selected_count: res.selected_count,
              }
            : p
        )
      );

      if (keyVal) {
        setProviderKeyInputs((prev) => ({ ...prev, [provider]: '' }));
      }

      showToast(`✨ ${res.message}`, 'success');
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || err.message || `Failed to discover models for ${provider}`;
      showToast(errMsg, 'error');
    } finally {
      setDiscoveringProvider(null);
    }
  };

  // Live Test Connection & Discovery Handler
  const handleTestConnectionAndDiscover = async (provider: string, apiKey?: string, keyId?: string) => {
    const prov = aiProviders.find((p) => p.provider === provider);
    const probeModel = DEFAULT_PROBE_MODELS[provider] || 'openai/gpt-oss-120b';
    const keyToUse = (apiKey !== undefined ? apiKey : (providerKeyInputs[provider] || '')).trim();

    // If no key entered and provider has no keys in pool, prompt to enter key
    if (!keyToUse && !keyId && (!prov?.api_keys || prov.api_keys.length === 0) && !prov?.masked_key) {
      setAddingKeyProvider(provider);
      showToast(`Please enter your ${prov?.name || provider} API key first to test connection.`, 'warning');
      return;
    }

    try {
      setDiscoveringProvider(provider);
      setTestingModel({ provider, model_id: probeModel });
      setTestResult(null);
      setTestModalOpen(true);

      const res = await api.testModelConnection(provider, {
        api_key: keyToUse || undefined,
        key_id: keyId || undefined,
        discover_models: true,
      });

      setTestResult(res);

      if (res.success) {
        showToast(
          res.message || `✓ Connected to ${probeModel} in ${res.latency_ms}ms! Discovered ${res.available_models?.length || 0} models.`,
          'success'
        );
        if (apiKey) {
          setNewKeyForm({ name: '', key: '', is_primary: false });
          setAddingKeyProvider(null);
        }
        await loadAIProviders();
      } else {
        showToast(res.error || `Connection test failed for ${provider}`, 'error');
      }
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || err.message || `Connection test failed for ${provider}`;
      setTestResult({
        success: false,
        provider,
        model: probeModel,
        latency_ms: 0,
        response_preview: '',
        tokens_used: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        error: errMsg,
      });
      showToast(errMsg, 'error');
    } finally {
      setDiscoveringProvider(null);
      setTestingModel(null);
    }
  };

  const handleToggleModelSelection = (provider: string, modelId: string) => {
    setAiProviders((prev) =>
      prev.map((p) => {
        if (p.provider !== provider) return p;
        const exists = p.selected_models.includes(modelId);
        const newSelected = exists
          ? p.selected_models.filter((id) => id !== modelId)
          : [...p.selected_models, modelId];
        return {
          ...p,
          selected_models: newSelected,
          selected_count: newSelected.length,
        };
      })
    );
  };

  const handleSelectAllModels = (provider: string, selectAll: boolean) => {
    setAiProviders((prev) =>
      prev.map((p) => {
        if (p.provider !== provider) return p;
        const newSelected = selectAll ? p.available_models.map((m) => m.id) : [];
        return {
          ...p,
          selected_models: newSelected,
          selected_count: newSelected.length,
        };
      })
    );
  };

  const handleSelectRecommendedModels = (provider: string) => {
    setAiProviders((prev) =>
      prev.map((p) => {
        if (p.provider !== provider) return p;
        const recommended = p.available_models
          .filter((m) => m.is_recommended)
          .map((m) => m.id);
        const newSelected = recommended.length > 0 ? recommended : p.available_models.map((m) => m.id);
        return {
          ...p,
          selected_models: newSelected,
          selected_count: newSelected.length,
        };
      })
    );
  };

  const handleToggleProviderEnabled = async (provider: string, currentEnabled: boolean) => {
    const nextEnabled = !currentEnabled;
    try {
      const res = await api.updateAIProvider(provider, { is_enabled: nextEnabled });
      setAiProviders((prev) =>
        prev.map((p) => (p.provider === provider ? { ...p, is_enabled: nextEnabled } : p))
      );
      showToast(res.message || `${provider.toUpperCase()} provider status updated`);
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to update provider status', 'error');
    }
  };

  const handleSaveProviderConfig = async (provider: string) => {
    const prov = aiProviders.find((p) => p.provider === provider);
    if (!prov) return;

    try {
      setSavingProvider(provider);
      const keyVal = providerKeyInputs[provider]?.trim();
      const res = await api.updateAIProvider(provider, {
        api_key: keyVal || undefined,
        is_enabled: prov.is_enabled,
        selected_models: prov.selected_models,
      });

      setAiProviders((prev) =>
        prev.map((p) =>
          p.provider === provider
            ? {
                ...p,
                is_configured: res.is_configured,
                masked_key: res.masked_key || p.masked_key,
                selected_models: res.selected_models,
                available_models: res.available_models,
                selected_count: res.selected_models.length,
                model_count: res.available_models.length,
              }
            : p
        )
      );

      if (keyVal) {
        setProviderKeyInputs((prev) => ({ ...prev, [provider]: '' }));
      }

      showToast(
        `✓ Finalized & saved ${res.selected_models.length} active model${
          res.selected_models.length !== 1 ? 's' : ''
        } for ${prov.name}! Normal users can now use these models.`,
        'success'
      );
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to save configuration', 'error');
    } finally {
      setSavingProvider(null);
    }
  };

  const toggleCatalogCollapse = (provider: string) => {
    setCollapsedCatalogs((prev) => ({
      ...prev,
      [provider]: !prev[provider],
    }));
  };

  const handleFinalizeAllProviders = async () => {
    try {
      setIsFinalizingAll(true);
      const configured = aiProviders.filter((p) => p.is_configured || (p.api_keys && p.api_keys.length > 0));
      if (configured.length === 0) {
        showToast('No configured providers found. Please add API keys first.', 'warning');
        return;
      }

      await Promise.all(
        configured.map((p) =>
          api.updateAIProvider(p.provider, {
            is_enabled: p.is_enabled,
            selected_models: p.selected_models,
          })
        )
      );

      await loadAIProviders();

      const totalSelected = configured.reduce((acc, p) => acc + p.selected_models.length, 0);
      const breakdown = configured
        .filter((p) => p.selected_models.length > 0)
        .map((p) => `${p.name} (${p.selected_models.length})`)
        .join(', ');

      showToast(
        `✓ Finalized ${totalSelected} active model${totalSelected !== 1 ? 's' : ''} for Agents & Normal Users: ${breakdown || 'None selected'}!`,
        'success'
      );
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to finalize provider models', 'error');
    } finally {
      setIsFinalizingAll(false);
    }
  };

  // Load Usage Analytics
  const loadUsageData = useCallback(async () => {
    try {
      setIsLoadingUsage(true);
      const [summaryData, usersData, logsData] = await Promise.all([
        api.getAIUsageSummary(),
        api.getAIUsageByUsers(),
        api.getAIUsageLogs({ limit: 100 }),
      ]);
      setUsageSummary(summaryData);
      setUserUsageList(usersData.users || []);
      setUsageLogs(logsData.logs || []);
    } catch (err: any) {
      console.error('Failed to load AI usage data', err);
      showToast(err.response?.data?.detail || 'Failed to load usage data', 'error');
    } finally {
      setIsLoadingUsage(false);
    }
  }, []);

  // Auto-load usage when switching to 'usage' sub-tab
  useEffect(() => {
    if (activeSubTab === 'usage') {
      loadUsageData();
    }
  }, [activeSubTab, loadUsageData]);

  // Add API key to provider pool (up to 10 keys)
  const handleAddApiKey = async (provider: string) => {
    if (!newKeyForm.key.trim()) {
      showToast('Please enter an API key', 'warning');
      return;
    }
    try {
      setIsSavingKey(true);
      const res = await api.addAIProviderKey(provider, {
        api_key: newKeyForm.key.trim(),
        name: newKeyForm.name.trim() || undefined,
        is_primary: newKeyForm.is_primary,
      });
      showToast(res.message || 'API key added successfully', 'success');
      setNewKeyForm({ name: '', key: '', is_primary: false });
      setAddingKeyProvider(null);
      loadAIProviders();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to add API key', 'error');
    } finally {
      setIsSavingKey(false);
    }
  };

  // Toggle key active state
  const handleToggleKeyActive = async (provider: string, keyItem: AIProviderKeyItem) => {
    try {
      const nextActive = !keyItem.is_active;
      await api.updateAIProviderKey(provider, keyItem.id, { is_active: nextActive });
      showToast(`Key "${keyItem.name}" ${nextActive ? 'activated' : 'paused'}`, 'success');
      loadAIProviders();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to update key status', 'error');
    }
  };

  // Set primary key
  const handleSetPrimaryKey = async (provider: string, keyId: string) => {
    try {
      await api.updateAIProviderKey(provider, keyId, { is_primary: true });
      showToast('Primary API key updated', 'success');
      loadAIProviders();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to set primary key', 'error');
    }
  };

  // Delete API key
  const handleDeleteApiKey = async (provider: string, keyItem: AIProviderKeyItem) => {
    if (!window.confirm(`Are you sure you want to remove the API key "${keyItem.name}" (${keyItem.masked_key})?`)) {
      return;
    }
    try {
      setIsDeletingKeyId(keyItem.id);
      const res = await api.deleteAIProviderKey(provider, keyItem.id);
      showToast(res.message || 'API key removed', 'success');
      loadAIProviders();
    } catch (err: any) {
      showToast(err.response?.data?.detail || 'Failed to delete API key', 'error');
    } finally {
      setIsDeletingKeyId(null);
    }
  };

  // Test Model Connection
  const handleTestModelConnection = async (provider: string, modelId: string) => {
    try {
      setTestingModel({ provider, model_id: modelId });
      setTestResult(null);
      setTestModalOpen(true);
      const res = await api.testModelConnection(provider, { model_id: modelId });
      setTestResult(res);
      if (res.success) {
        showToast(`✓ ${modelId} ping verified in ${res.latency_ms}ms`, 'success');
      } else {
        showToast(res.error || `Connection test failed for ${modelId}`, 'error');
      }
      loadAIProviders();
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || err.message || 'Connection test failed';
      setTestResult({
        success: false,
        provider,
        model: modelId,
        latency_ms: 0,
        response_preview: '',
        tokens_used: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        error: errMsg,
      });
      showToast(errMsg, 'error');
    } finally {
      setTestingModel(null);
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

  // Filtered User AI Usage
  const filteredUserUsage = userUsageList.filter((u) => {
    if (!usageUserSearch.trim()) return true;
    const q = usageUserSearch.toLowerCase();
    return (u.email || '').toLowerCase().includes(q) || (u.full_name || '').toLowerCase().includes(q);
  });

  const activeKillSwitchesCount = killSwitches.filter((s) => !s.is_enabled).length;
  const totalSelectedModels = aiProviders.reduce(
    (acc, p) => (p.is_enabled ? acc + p.selected_models.length : acc),
    0
  );
  const configuredProvidersCount = aiProviders.filter((p) => p.is_configured).length;


  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Toast Notification - High Contrast Solid Alert */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99999,
            backgroundColor:
              toastMessage.type === 'error'
                ? '#991b1b'
                : toastMessage.type === 'warning'
                ? '#92400e'
                : '#064e3b',
            color: '#ffffff',
            border: `1.5px solid ${
              toastMessage.type === 'error'
                ? '#f87171'
                : toastMessage.type === 'warning'
                ? '#fbbf24'
                : '#34d399'
            }`,
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.2)',
            minWidth: '320px',
            maxWidth: '90vw',
          }}
          className="px-5 py-3 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in select-none"
        >
          <div className="flex items-center gap-3">
            {toastMessage.type === 'error' ? (
              <XCircle className="w-5 h-5 text-rose-300 shrink-0" />
            ) : toastMessage.type === 'warning' ? (
              <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
            )}
            <span className="text-white text-xs font-bold tracking-wide leading-snug">{toastMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="w-5 h-5 rounded-full hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center cursor-pointer transition-colors ml-2 shrink-0"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
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
                loadAIProviders();
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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-4 border-t border-slate-100">
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
              <span>Active AI Models</span>
              <Bot className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div className="text-2xl font-extrabold text-indigo-700">
              {totalSelectedModels} <span className="text-xs font-normal text-slate-500">models ({configuredProvidersCount}/3 ready)</span>
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
              <Cpu className="w-3.5 h-3.5 text-slate-700" />
            </div>
            <div className="text-2xl font-extrabold text-slate-800">
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
            { id: 'ai-providers', label: `AI Models & Keys (${totalSelectedModels})`, icon: Bot },
            { id: 'usage', label: 'Token & Request Usage', icon: BarChart3 },
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
      {/* 2. AI PROVIDER ONBOARDING & MODEL DISCOVERY VIEW */}
      {/* ========================================================================= */}
      {activeSubTab === 'ai-providers' && (
        <div className="space-y-6">
          {/* Top Info Banner - High Contrast Enterprise Theme */}
          <div className="bg-slate-900 rounded-3xl p-6 text-white border border-slate-800 shadow-sm relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-2xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-900 text-indigo-200 border border-indigo-700">
                    AI FOUNDATION INFRASTRUCTURE
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-900 text-emerald-200 border border-emerald-700">
                    FERNET AES-256 ENCRYPTED
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-900 text-amber-200 border border-amber-700">
                    UP TO 10 KEYS PER PROVIDER
                  </span>
                </div>
                <h2 className="text-lg font-extrabold tracking-tight text-white">AI Provider Onboarding & Multi-Key Pool</h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Onboard up to 10 API keys per provider (<strong>Groq</strong>, <strong>Google Gemini</strong>, and <strong>OpenAI</strong>) for seamless load balancing and redundancy. Auto-discover available models, run live connection tests with round-trip latency, and select models accessible to team evaluations.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={loadAIProviders}
                  disabled={isLoadingProviders}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all border border-slate-700 flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingProviders ? 'animate-spin' : ''}`} />
                  <span>Reload Providers</span>
                </button>
              </div>
            </div>

            {/* Provider Filter Tabs */}
            <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-800">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mr-1">
                <Filter className="w-3 h-3 text-slate-400" /> Filter:
              </span>
              {[
                { id: 'ALL', label: 'All Providers' },
                { id: 'groq', label: 'Groq Cloud' },
                { id: 'gemini', label: 'Google Gemini' },
                { id: 'openai', label: 'OpenAI' },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setProviderFilterTab(f.id as any)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    providerFilterTab === f.id
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Platform Model Governance & Finalize Bar */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0 shadow-2xs">
                <Bot className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-extrabold text-slate-900">
                    Platform Active Model Governance
                  </h3>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">
                    {totalSelectedModels} Active Model{totalSelectedModels !== 1 ? 's' : ''} for Normal Users
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {aiProviders.filter((p) => p.selected_models.length > 0).length > 0 ? (
                    <span>
                      Active: {aiProviders
                        .filter((p) => p.selected_models.length > 0)
                        .map((p) => `${p.name} (${p.selected_models.length})`)
                        .join(' • ')}
                      {' — Only these models appear to normal users in Agent builders and workflows.'}
                    </span>
                  ) : (
                    'No models finalized yet. Check models in the catalog below and click "Finalize Selected Models" so agents & normal users can use them.'
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => setIsPreviewUserModalOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-300 flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title="Preview the exact model list normal users see"
              >
                <Eye className="w-3.5 h-3.5 text-indigo-600" />
                <span>Preview Normal User View</span>
              </button>

              <button
                type="button"
                onClick={handleFinalizeAllProviders}
                disabled={isFinalizingAll || totalSelectedModels === 0}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                title="Finalize and save all selected models across all providers for normal users"
              >
                <Check className={`w-4 h-4 stroke-[3] ${isFinalizingAll ? 'animate-spin' : ''}`} />
                <span>
                  {isFinalizingAll
                    ? 'Finalizing Models...'
                    : `✓ Finalize All Models for Users (${totalSelectedModels})`}
                </span>
              </button>
            </div>
          </div>

          {/* Provider Cards List */}
          <div className="space-y-6">
            {aiProviders
              .filter((prov) => providerFilterTab === 'ALL' || prov.provider === providerFilterTab)
              .map((prov) => {
                const isGroq = prov.provider === 'groq';
                const isGemini = prov.provider === 'gemini';
                const isOpenAI = prov.provider === 'openai';

                const brandAccent = isGroq
                  ? {
                      border: 'border-orange-200',
                      headerBg: 'bg-orange-50/70 border-b border-orange-100',
                      badge: 'bg-orange-100 text-orange-900 border-orange-300 font-extrabold',
                      button: 'bg-orange-600 hover:bg-orange-700 text-white font-bold',
                      icon: Flame,
                      iconColor: 'text-orange-600',
                      iconBg: 'bg-orange-100 border-orange-300',
                    }
                  : isGemini
                  ? {
                      border: 'border-blue-200',
                      headerBg: 'bg-blue-50/70 border-b border-blue-100',
                      badge: 'bg-blue-100 text-blue-900 border-blue-300 font-extrabold',
                      button: 'bg-blue-600 hover:bg-blue-700 text-white font-bold',
                      icon: Sparkles,
                      iconColor: 'text-blue-600',
                      iconBg: 'bg-blue-100 border-blue-300',
                    }
                  : {
                      border: 'border-emerald-200',
                      headerBg: 'bg-emerald-50/70 border-b border-emerald-100',
                      badge: 'bg-emerald-100 text-emerald-900 border-emerald-300 font-extrabold',
                      button: 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold',
                      icon: Bot,
                      iconColor: 'text-emerald-600',
                      iconBg: 'bg-emerald-100 border-emerald-300',
                    };

                const IconComponent = brandAccent.icon;
                const isDiscovering = discoveringProvider === prov.provider;
                const isSaving = savingProvider === prov.provider;
                const searchFilter = (modelSearchMap[prov.provider] || '').toLowerCase().trim();

                const filteredModels = (prov.available_models || []).filter((m) => {
                  if (!searchFilter) return true;
                  return (
                    m.id.toLowerCase().includes(searchFilter) ||
                    (m.name || '').toLowerCase().includes(searchFilter) ||
                    (m.description || '').toLowerCase().includes(searchFilter)
                  );
                });

                const keyList = prov.api_keys || [];
                const keysCount = keyList.length;
                const isAtKeyLimit = keysCount >= (prov.max_keys || 10);

                return (
                  <div
                    key={prov.provider}
                    className={`bg-white rounded-3xl border ${brandAccent.border} shadow-sm overflow-hidden transition-all`}
                  >
                    {/* Provider Header Strip */}
                    <div className={`p-6 ${brandAccent.headerBg}`}>
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-start gap-3.5">
                          <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center shrink-0 ${brandAccent.iconBg}`}>
                            <IconComponent className={`w-6 h-6 ${brandAccent.iconColor}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-base font-extrabold text-slate-900">{prov.name}</h3>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${brandAccent.badge}`}>
                                {isGroq ? 'LPU INFERENCE' : isGemini ? 'GOOGLE DEEPMIND' : 'OPENAI FRONTIER'}
                              </span>
                              {prov.is_configured ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                                  <Check className="w-3 h-3" /> {keysCount} Key{keysCount === 1 ? '' : 's'} Configured
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
                                  <Key className="w-3 h-3" /> API Key Required
                                </span>
                              )}
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                                prov.is_enabled ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-slate-100 text-slate-600'
                              }`}>
                                {prov.is_enabled ? 'PROVIDER ACTIVE' : 'PROVIDER DISABLED'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mt-1 max-w-2xl">{prov.description}</p>
                          </div>
                        </div>

                        {/* Right Header Action: Enable / Disable Switch + Docs */}
                        <div className="flex items-center gap-4 shrink-0">
                          <a
                            href={prov.docs_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs"
                          >
                            <span>Get Key</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>

                          <div className="flex items-center gap-2.5 border-l border-slate-200/80 pl-3">
                            <div className="text-right">
                              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block leading-tight mb-0.5">Status</span>
                              <span className={`text-xs font-extrabold leading-tight ${prov.is_enabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                                {prov.is_enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleToggleProviderEnabled(prov.provider, prov.is_enabled)}
                              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                prov.is_enabled ? 'bg-emerald-600' : 'bg-slate-300'
                              }`}
                              title={prov.is_enabled ? 'Click to disable provider' : 'Click to enable provider'}
                            >
                              <span
                                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                  prov.is_enabled ? 'translate-x-5' : 'translate-x-0'
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Multi-Key Pool Section (Up to 10 Keys) */}
                    <div className="p-6 bg-slate-50/50 border-b border-slate-100 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Key className="w-4 h-4 text-slate-700" />
                          <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                            API Keys Pool
                          </h4>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            {keysCount} of {prov.max_keys || 10} Keys Added
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {addingKeyProvider !== prov.provider && (
                            <button
                              type="button"
                              onClick={() => {
                                setAddingKeyProvider(prov.provider);
                                setNewKeyForm({ name: `Key #${keysCount + 1}`, key: '', is_primary: keysCount === 0 });
                              }}
                              disabled={isAtKeyLimit}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                                isAtKeyLimit
                                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs'
                              }`}
                              title={isAtKeyLimit ? 'Maximum 10 keys allowed per provider' : 'Add a new API key to pool'}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>{isAtKeyLimit ? 'Key Limit Reached (10/10)' : 'Add API Key'}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleTestConnectionAndDiscover(prov.provider)}
                            disabled={isDiscovering}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${brandAccent.button}`}
                            title={`Test probe model (${DEFAULT_PROBE_MODELS[prov.provider]}) and discover live models`}
                          >
                            <Zap className={`w-3.5 h-3.5 text-amber-300 ${isDiscovering ? 'animate-spin' : ''}`} />
                            <span>{isDiscovering ? 'Discovering Models...' : 'Discover Models'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleSaveProviderConfig(prov.provider)}
                            disabled={isSaving}
                            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title={`Finalize and save ${prov.selected_models.length} model(s) for normal users`}
                          >
                            <Check className={`w-3.5 h-3.5 stroke-[3] ${isSaving ? 'animate-spin' : ''}`} />
                            <span>{isSaving ? 'Finalizing...' : `✓ Finalize & Save (${prov.selected_models.length})`}</span>
                          </button>
                        </div>
                      </div>

                      {/* Add Key Inline Form */}
                      {addingKeyProvider === prov.provider && (
                        <div className="bg-white p-4 rounded-2xl border border-indigo-200 shadow-sm space-y-3 animate-in fade-in duration-200">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                              <Plus className="w-3.5 h-3.5 text-indigo-600" />
                              Add Key to {prov.name} Pool (Max 10)
                            </span>
                            <span className="text-[11px] text-slate-500">
                              AES-256 encrypted at rest
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                                Key Label / Identifier
                              </label>
                              <input
                                type="text"
                                value={newKeyForm.name}
                                onChange={(e) => setNewKeyForm({ ...newKeyForm, name: e.target.value })}
                                placeholder="e.g. Production Cluster, QA Runner, Staging"
                                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                              />
                            </div>

                            <div>
                              <label className="text-[11px] font-bold text-slate-700 block mb-1">
                                API Secret Key (Starts with {prov.key_prefix_hint})
                              </label>
                              <div className="relative flex items-center">
                                <input
                                  type={showNewKeySecret ? 'text' : 'password'}
                                  value={newKeyForm.key}
                                  onChange={(e) => setNewKeyForm({ ...newKeyForm, key: e.target.value })}
                                  placeholder={`Paste ${prov.name} API key...`}
                                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 pr-10 text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowNewKeySecret(!showNewKeySecret)}
                                  className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                                >
                                  {showNewKeySecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-2">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={newKeyForm.is_primary}
                                onChange={(e) => setNewKeyForm({ ...newKeyForm, is_primary: e.target.checked })}
                                className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                              />
                              <span className="text-xs font-bold text-slate-700">Set as Primary Key for Active Requests</span>
                            </label>

                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setAddingKeyProvider(null)}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAddApiKey(prov.provider)}
                                disabled={isSavingKey || isDiscovering}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                title="Save this key to pool without running discovery"
                              >
                                <Check className={`w-3.5 h-3.5 ${isSavingKey ? 'animate-spin' : ''}`} />
                                <span>{isSavingKey ? 'Saving Key...' : 'Save Key Only'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleTestConnectionAndDiscover(prov.provider, newKeyForm.key)}
                                disabled={isDiscovering || isSavingKey || !newKeyForm.key.trim()}
                                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white shadow-xs cursor-pointer flex items-center gap-2 disabled:opacity-50 transition-all"
                                title={`Pings probe model (${DEFAULT_PROBE_MODELS[prov.provider]}) to verify connection and auto-discovers live models`}
                              >
                                <Zap className={`w-3.5 h-3.5 text-amber-300 ${isDiscovering ? 'animate-spin' : ''}`} />
                                <span>
                                  {isDiscovering
                                    ? 'Testing & Discovering...'
                                    : `⚡ Test Connection & Discover Models (${DEFAULT_PROBE_MODELS[prov.provider]})`}
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Keys List */}
                      {keyList.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {keyList.map((keyItem) => (
                            <div
                              key={keyItem.id}
                              className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                                keyItem.is_primary
                                  ? 'bg-amber-50/40 border-amber-300 ring-1 ring-amber-300/60'
                                  : keyItem.is_active
                                  ? 'bg-white border-slate-200 hover:border-slate-300'
                                  : 'bg-slate-100 border-slate-200 opacity-70'
                              }`}
                            >
                              {/* Top Row: Name + Badges + Quick Controls */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                  <span className="text-xs font-extrabold text-slate-900 truncate">{keyItem.name}</span>
                                  {keyItem.is_primary && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shrink-0">
                                      <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> Primary
                                    </span>
                                  )}
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                                    keyItem.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                                  }`}>
                                    {keyItem.is_active ? 'Active' : 'Paused'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleKeyActive(prov.provider, keyItem)}
                                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                                      keyItem.is_active
                                        ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-300'
                                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-300'
                                    }`}
                                    title={keyItem.is_active ? 'Pause this key' : 'Activate this key'}
                                  >
                                    {keyItem.is_active ? 'Pause' : 'Activate'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteApiKey(prov.provider, keyItem)}
                                    disabled={isDeletingKeyId === keyItem.id}
                                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                                    title="Delete this key"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Middle Row: Masked Key Snippet */}
                              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 flex items-center justify-between gap-2 overflow-hidden">
                                <span className="font-mono text-xs text-slate-700 truncate select-all">{keyItem.masked_key}</span>
                                <span className="text-[10px] text-slate-400 shrink-0">{keyItem.request_count || 0} reqs</span>
                              </div>

                              {/* Bottom Row: Actions & Metadata */}
                              <div className="flex items-center justify-between pt-1 border-t border-slate-100 gap-2 flex-wrap">
                                <span className="text-[10px] text-slate-400">
                                  Added: {keyItem.created_at ? new Date(keyItem.created_at).toLocaleDateString() : 'Active'}
                                </span>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {!keyItem.is_primary && (
                                    <button
                                      type="button"
                                      onClick={() => handleSetPrimaryKey(prov.provider, keyItem.id)}
                                      className="px-2 py-1 rounded-lg text-[10px] font-bold text-slate-600 hover:text-amber-800 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 transition-all cursor-pointer"
                                      title="Set this key as primary"
                                    >
                                      Make Primary
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleTestConnectionAndDiscover(prov.provider, undefined, keyItem.id)}
                                    disabled={isDiscovering}
                                    className="px-2.5 py-1 rounded-lg text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                                    title={`Send probe test ping (${DEFAULT_PROBE_MODELS[prov.provider]}) with this key`}
                                  >
                                    <Zap className="w-3 h-3 text-indigo-600" />
                                    <span>Test & Discover</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 rounded-2xl bg-white border border-dashed border-slate-200 text-center space-y-1">
                          <p className="text-xs font-semibold text-slate-600">
                            {prov.masked_key
                              ? `Legacy single key registered (${prov.masked_key}). Click "+ Add API Key" to manage dedicated keys in the pool.`
                              : `No dedicated API keys configured yet for ${prov.name}. Add up to 10 keys above.`}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Discovered Models Catalog with Collapse & Compact View Options */}
                    {(() => {
                      const isCatalogCollapsed = !!collapsedCatalogs[prov.provider];

                      if (isCatalogCollapsed && prov.available_models.length > 0) {
                        return (
                          <div className="p-4 bg-slate-50/90 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                                <Layers className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-extrabold text-xs text-slate-900">
                                    Available Models Catalog ({prov.available_models.length} Discovered Models)
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                    {prov.selected_models.length} of {prov.available_models.length} Enabled for Users
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 truncate mt-0.5">
                                  Enabled for agents: <span className="font-mono text-slate-800 font-bold">{prov.selected_models.length > 0 ? prov.selected_models.join(', ') : 'None selected'}</span>
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleSaveProviderConfig(prov.provider)}
                                disabled={isSaving}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                title="Save model selection for normal users"
                              >
                                <Check className={`w-3.5 h-3.5 stroke-[3] ${isSaving ? 'animate-spin' : ''}`} />
                                <span>{isSaving ? 'Finalizing...' : `Finalize & Save (${prov.selected_models.length})`}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleCatalogCollapse(prov.provider)}
                                className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all"
                                title="Expand to view and edit models"
                              >
                                <span>Expand Catalog ({prov.available_models.length})</span>
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="p-6 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                                Available Models Catalog
                              </h4>
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                {prov.selected_models.length} of {prov.available_models.length} Enabled for Agents
                              </span>
                              {prov.available_models.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => toggleCatalogCollapse(prov.provider)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 cursor-pointer transition-all border border-slate-200"
                                  title="Collapse this catalog to save space"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                  <span>Collapse</span>
                                </button>
                              )}
                            </div>

                            {/* Model Controls */}
                            {prov.available_models.length > 0 && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <div className="relative">
                                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                  <input
                                    type="text"
                                    value={modelSearchMap[prov.provider] || ''}
                                    onChange={(e) =>
                                      setModelSearchMap({ ...modelSearchMap, [prov.provider]: e.target.value })
                                    }
                                    placeholder="Search models..."
                                    className="pl-8 pr-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 w-32 sm:w-40"
                                  />
                                </div>

                                {/* View Mode Toggle */}
                                <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
                                  <button
                                    type="button"
                                    onClick={() => setCatalogViewMode('compact')}
                                    className={`px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                      catalogViewMode === 'compact'
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                    title="Compact list view: high density, less scrolling"
                                  >
                                    <List className="w-3 h-3" />
                                    <span>Compact</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCatalogViewMode('cards')}
                                    className={`px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                                      catalogViewMode === 'cards'
                                        ? 'bg-indigo-600 text-white shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                    title="Card grid view"
                                  >
                                    <LayoutGrid className="w-3 h-3" />
                                    <span>Cards</span>
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleSelectAllModels(prov.provider, true)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
                                >
                                  Select All
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleSelectAllModels(prov.provider, false)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all cursor-pointer"
                                >
                                  Deselect All
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleSelectRecommendedModels(prov.provider)}
                                  className="px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition-all cursor-pointer"
                                >
                                  ★ Recommended
                                </button>

                                {/* Primary Finalize Button in Header */}
                                <button
                                  type="button"
                                  onClick={() => handleSaveProviderConfig(prov.provider)}
                                  disabled={isSaving}
                                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                  title={`Finalize and save ${prov.selected_models.length} model(s) for normal users`}
                                >
                                  <Check className={`w-3.5 h-3.5 stroke-[3] ${isSaving ? 'animate-spin' : ''}`} />
                                  <span>{isSaving ? 'Finalizing...' : `Finalize & Save (${prov.selected_models.length})`}</span>
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Models Grid with Live Connection Test Button */}
                          {prov.available_models.length > 0 ? (
                            catalogViewMode === 'compact' ? (
                              /* Compact High Density List View */
                              <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
                                {filteredModels.map((m) => {
                                  const isSelected = prov.selected_models.includes(m.id);
                                  const isTestingThisModel =
                                    testingModel?.provider === prov.provider && testingModel?.model_id === m.id;

                                  return (
                                    <div
                                      key={m.id}
                                      className={`px-3.5 py-2 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                                        isSelected
                                          ? 'bg-slate-900 text-white border-slate-800 shadow-2xs'
                                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-900'
                                      }`}
                                    >
                                      <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <button
                                          type="button"
                                          onClick={() => handleToggleModelSelection(prov.provider, m.id)}
                                          className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all cursor-pointer shrink-0 ${
                                            isSelected
                                              ? 'bg-emerald-500 border-emerald-500 text-white'
                                              : 'border-slate-300 bg-white hover:border-slate-400'
                                          }`}
                                          title={isSelected ? 'Model enabled. Click to disable' : 'Click to enable model'}
                                        >
                                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                        </button>

                                        <div
                                          className="min-w-0 flex-1 cursor-pointer"
                                          onClick={() => handleToggleModelSelection(prov.provider, m.id)}
                                        >
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-xs truncate max-w-[180px] sm:max-w-[280px]" title={m.name}>
                                              {m.name}
                                            </span>
                                            <span className={`font-mono text-[10px] px-1.5 py-0.2 rounded truncate max-w-[170px] ${
                                              isSelected ? 'bg-white/15 text-slate-300' : 'bg-slate-100 text-slate-500'
                                            }`} title={m.id}>
                                              {m.id}
                                            </span>
                                            {m.is_recommended && (
                                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                                isSelected ? 'bg-amber-400 text-slate-950' : 'bg-amber-100 text-amber-900 border border-amber-200'
                                              }`}>
                                                ★ Recommended
                                              </span>
                                            )}
                                          </div>
                                          {m.description && (
                                            <p className={`text-[10px] truncate max-w-[480px] mt-0.5 ${isSelected ? 'text-slate-400' : 'text-slate-500'}`}>
                                              {m.description}
                                            </p>
                                          )}
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 shrink-0">
                                        {m.context_window && (
                                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold hidden md:inline-block ${
                                            isSelected ? 'bg-white/15 text-slate-200' : 'bg-slate-100 text-slate-700 border border-slate-200'
                                          }`}>
                                            {m.context_window}
                                          </span>
                                        )}

                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                          isSelected
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                            : 'bg-slate-100 text-slate-500'
                                        }`}>
                                          {isSelected ? 'Enabled' : 'Standby'}
                                        </span>

                                        <button
                                          type="button"
                                          onClick={() => handleTestModelConnection(prov.provider, m.id)}
                                          disabled={isTestingThisModel}
                                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all flex items-center gap-1 cursor-pointer shadow-2xs disabled:opacity-50"
                                          title="Send live test ping"
                                        >
                                          <Zap className={`w-3 h-3 ${isTestingThisModel ? 'animate-spin text-amber-300' : ''}`} />
                                          <span className="hidden sm:inline">{isTestingThisModel ? 'Pinging...' : 'Test'}</span>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              /* Cards Grid View */
                              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1">
                                {filteredModels.map((m) => {
                                  const isSelected = prov.selected_models.includes(m.id);
                                  const isTestingThisModel =
                                    testingModel?.provider === prov.provider && testingModel?.model_id === m.id;

                                  return (
                                    <div
                                      key={m.id}
                                      className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-2.5 ${
                                        isSelected
                                          ? 'bg-slate-900 text-white border-slate-800 shadow-xs ring-1 ring-slate-800'
                                          : 'bg-slate-50 hover:bg-slate-100/90 border-slate-200 text-slate-900'
                                      }`}
                                    >
                                      <div className="space-y-1">
                                        <div className="flex items-start justify-between gap-2">
                                          <div
                                            onClick={() => handleToggleModelSelection(prov.provider, m.id)}
                                            className="font-bold text-xs truncate cursor-pointer hover:underline"
                                            title={m.name}
                                          >
                                            {m.name}
                                          </div>
                                          <div className="shrink-0 flex items-center gap-1.5">
                                            {m.is_recommended && (
                                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                                isSelected ? 'bg-amber-400 text-slate-900' : 'bg-amber-100 text-amber-900 border border-amber-200'
                                              }`}>
                                                ★ Recommended
                                              </span>
                                            )}
                                            <button
                                              type="button"
                                              onClick={() => handleToggleModelSelection(prov.provider, m.id)}
                                              className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all cursor-pointer ${
                                                isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white hover:border-slate-400'
                                              }`}
                                              title={isSelected ? 'Model enabled. Click to disable' : 'Click to enable model'}
                                            >
                                              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                                            </button>
                                          </div>
                                        </div>

                                        <div className={`font-mono text-[11px] truncate ${isSelected ? 'text-slate-300' : 'text-slate-500'}`} title={m.id}>
                                          {m.id}
                                        </div>

                                        {m.description && (
                                          <p className={`text-[11px] line-clamp-2 leading-relaxed ${isSelected ? 'text-slate-400' : 'text-slate-600'}`}>
                                            {m.description}
                                          </p>
                                        )}
                                      </div>

                                      {/* Model Details + Action Row */}
                                      <div className="space-y-2 pt-2 border-t border-white/10">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          {m.context_window && (
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                              isSelected ? 'bg-white/15 text-slate-100' : 'bg-slate-200 text-slate-800'
                                            }`}>
                                              {m.context_window}
                                            </span>
                                          )}
                                          {(m.tags || []).slice(0, 2).map((tag, idx) => (
                                            <span
                                              key={idx}
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                                                isSelected ? 'bg-white/10 text-slate-300' : 'bg-slate-200/80 text-slate-700'
                                              }`}
                                            >
                                              {tag}
                                            </span>
                                          ))}
                                        </div>

                                        <div className="flex items-center justify-between pt-1">
                                          <span className={`text-[10px] ${isSelected ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>
                                            {isSelected ? '✓ Ready for Runs' : 'Standby'}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() => handleTestModelConnection(prov.provider, m.id)}
                                            disabled={isTestingThisModel}
                                            className="px-3 py-1 rounded-xl text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                                            title="Send a live test ping to this model"
                                          >
                                            <Zap className={`w-3 h-3 ${isTestingThisModel ? 'animate-spin' : ''}`} />
                                            <span>{isTestingThisModel ? 'Pinging...' : 'Test Connection'}</span>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )
                          ) : (
                            <div className="p-8 rounded-2xl bg-gradient-to-b from-slate-50 to-indigo-50/20 border border-dashed border-indigo-200 text-center space-y-3">
                              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center mx-auto text-indigo-600 shadow-2xs">
                                <Zap className="w-6 h-6" />
                              </div>
                              <div className="space-y-1">
                                <div className="text-sm font-extrabold text-slate-900">No Models Discovered Yet for {prov.name}</div>
                                <p className="text-xs text-slate-600 max-w-lg mx-auto leading-relaxed">
                                  Models are dynamically discovered from {prov.name}'s API based on your API key so decomposed models are never shown.
                                  Enter your API key and click <strong>Test Connection & Discover Models</strong> (probe model: <code className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-900 font-mono text-[11px] font-bold">{DEFAULT_PROBE_MODELS[prov.provider]}</code>) to test connection and list active models.
                                </p>
                              </div>
                              <div className="pt-2 flex items-center justify-center gap-2.5 flex-wrap">
                                {addingKeyProvider !== prov.provider && (
                                  <button
                                    type="button"
                                    onClick={() => setAddingKeyProvider(prov.provider)}
                                    className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer flex items-center gap-2 transition-all"
                                  >
                                    <Plus className="w-4 h-4" />
                                    <span>{keyList.length === 0 ? 'Enter API Key to Test & Discover' : 'Add API Key'}</span>
                                  </button>
                                )}
                                {keyList.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleTestConnectionAndDiscover(prov.provider)}
                                    disabled={isDiscovering}
                                    className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-xs cursor-pointer flex items-center gap-2 transition-all disabled:opacity-50"
                                  >
                                    <Zap className="w-4 h-4 text-amber-400" />
                                    <span>Test Connection & Discover with Primary Key</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2B. API TOKEN & REQUEST USAGE ANALYTICS VIEW */}
      {/* ========================================================================= */}
      {activeSubTab === 'usage' && (
        <div className="space-y-6">
          {/* Top Header Banner */}
          <div className="bg-slate-900 rounded-3xl p-6 text-white border border-slate-800 shadow-sm relative overflow-hidden">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-2xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-900 text-indigo-200 border border-indigo-700">
                    REAL-TIME TELEMETRY
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-900 text-emerald-200 border border-emerald-700">
                    USER-WISE TOKEN AUDIT
                  </span>
                </div>
                <h2 className="text-lg font-extrabold tracking-tight text-white">AI Token & Request Usage Control</h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Track per-user LLM token consumption, total evaluation requests, round-trip latency, and live invocation logs across <strong>Groq</strong>, <strong>Gemini</strong>, and <strong>OpenAI</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={loadUsageData}
                  disabled={isLoadingUsage}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all border border-slate-700 flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUsage ? 'animate-spin' : ''}`} />
                  <span>Reload Usage Data</span>
                </button>
              </div>
            </div>

            {/* Aggregated KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800">
              <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Total AI Requests
                </span>
                <div className="text-2xl font-extrabold text-white">
                  {usageSummary?.total_requests || 0}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  <span className="text-emerald-400 font-bold">{usageSummary?.successful_requests || 0} ok</span>
                  {' • '}
                  <span className="text-rose-400 font-bold">{usageSummary?.failed_requests || 0} err</span>
                </div>
              </div>

              <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Total Token Volume
                </span>
                <div className="text-2xl font-extrabold text-indigo-300 font-mono">
                  {(usageSummary?.total_tokens || 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                  Prompt: {(usageSummary?.total_prompt_tokens || 0).toLocaleString()} | Out: {(usageSummary?.total_completion_tokens || 0).toLocaleString()}
                </div>
              </div>

              <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Active Consumers
                </span>
                <div className="text-2xl font-extrabold text-emerald-400">
                  {userUsageList.filter((u) => u.total_requests > 0).length}{' '}
                  <span className="text-xs text-slate-400 font-normal">/ {userUsageList.length} users</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Authorized team members
                </div>
              </div>

              <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Avg Round-Trip Latency
                </span>
                <div className="text-2xl font-extrabold text-amber-300 font-mono">
                  {usageSummary?.avg_latency_ms || 0} <span className="text-xs text-slate-400 font-normal">ms</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Across all active providers
                </div>
              </div>
            </div>
          </div>

          {/* Provider Breakdown Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                id: 'groq',
                name: 'Groq Cloud',
                color: 'border-orange-200 bg-orange-50/40 text-orange-900',
                badge: 'bg-orange-100 text-orange-800',
                stats: usageSummary?.by_provider?.groq || { requests: 0, tokens: 0 },
              },
              {
                id: 'gemini',
                name: 'Google Gemini',
                color: 'border-blue-200 bg-blue-50/40 text-blue-900',
                badge: 'bg-blue-100 text-blue-800',
                stats: usageSummary?.by_provider?.gemini || { requests: 0, tokens: 0 },
              },
              {
                id: 'openai',
                name: 'OpenAI Frontier',
                color: 'border-emerald-200 bg-emerald-50/40 text-emerald-900',
                badge: 'bg-emerald-100 text-emerald-800',
                stats: usageSummary?.by_provider?.openai || { requests: 0, tokens: 0 },
              },
            ].map((p) => (
              <div key={p.id} className={`p-4 rounded-2xl border ${p.color} flex items-center justify-between`}>
                <div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.badge}`}>
                    {p.name}
                  </span>
                  <div className="text-lg font-extrabold text-slate-900 mt-2">
                    {p.stats.requests} <span className="text-xs font-normal text-slate-500">requests</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-bold text-slate-500 block">Token Volume</span>
                  <span className="text-sm font-extrabold font-mono text-slate-900">
                    {(p.stats.tokens || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* User-Wise Consumption Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">User-Wise Token & Request Consumption</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Granular usage metrics saved per user account. Admin visibility into individual consumption.
                </p>
              </div>

              {/* Search Filter */}
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search user by name or email..."
                  value={usageUserSearch}
                  onChange={(e) => setUsageUserSearch(e.target.value)}
                  style={{ paddingLeft: '34px', paddingRight: '12px' }}
                  className="w-64 bg-slate-50 border border-slate-200 rounded-xl py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-3 px-3">User</th>
                    <th className="py-3 px-3">Role</th>
                    <th className="py-3 px-3 text-right">Total Requests</th>
                    <th className="py-3 px-3 text-right">Prompt Tokens</th>
                    <th className="py-3 px-3 text-right">Completion Tokens</th>
                    <th className="py-3 px-3 text-right">Total Tokens</th>
                    <th className="py-3 px-3 text-center">Success Rate</th>
                    <th className="py-3 px-3 text-right">Last Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredUserUsage.length > 0 ? (
                    filteredUserUsage.map((u) => {
                      const successRate =
                        u.total_requests > 0
                          ? Math.round((u.successful_requests / u.total_requests) * 100)
                          : 100;

                      return (
                        <tr key={u.user_id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{u.full_name || u.email.split('@')[0]}</div>
                            <div className="text-[11px] text-slate-500 font-mono">{u.email}</div>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              u.role === 'ADMIN'
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-extrabold text-slate-900">
                            {u.total_requests}
                            {u.failed_requests > 0 && (
                              <span className="text-[10px] text-rose-600 font-normal ml-1">
                                ({u.failed_requests} err)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600">
                            {u.prompt_tokens.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-slate-600">
                            {u.completion_tokens.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-extrabold text-indigo-700">
                            {u.total_tokens.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              successRate >= 95
                                ? 'bg-emerald-100 text-emerald-800'
                                : successRate >= 80
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {u.total_requests > 0 ? `${successRate}%` : '100%'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right text-[11px] text-slate-500">
                            {u.last_active_at
                              ? new Date(u.last_active_at).toLocaleString()
                              : 'No activity'}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-xs text-slate-400">
                        No user usage activity recorded yet. Run agent tests or model connection pings to generate usage logs.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Recent LLM Request Audit Stream */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4 p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Recent LLM Request Audit Stream</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Chronological trail of model invocations, latency measurements, and token allocations.
                </p>
              </div>
              <span className="text-xs font-bold text-slate-500">
                Latest {usageLogs.length} Events
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3">Provider</th>
                    <th className="py-2.5 px-3">Model</th>
                    <th className="py-2.5 px-3 text-right">Latency</th>
                    <th className="py-2.5 px-3 text-right">Tokens</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {usageLogs.length > 0 ? (
                    usageLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 text-[11px] text-slate-500 font-mono whitespace-nowrap">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {log.user_email}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-800">
                            {log.provider}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">
                          {log.model}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                          {log.latency_ms} ms
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                          {log.total_tokens} <span className="text-[10px] text-slate-400">({log.prompt_tokens}/{log.completion_tokens})</span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            log.status === 'SUCCESS'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {log.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-xs text-slate-400">
                        No LLM invocation logs recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Model Connection Test Result Modal */}
      {testModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">Live Model Connection Test</h3>
                  <span className="text-[11px] text-slate-500">
                    Round-trip latency & token verification
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTestModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {testingModel ? (
              <div className="py-8 text-center space-y-3">
                <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                <div className="text-sm font-bold text-slate-800">
                  Contacting {testingModel.provider.toUpperCase()} API...
                </div>
                <p className="text-xs text-slate-500 font-mono">
                  Target model: {testingModel.model_id}
                </p>
              </div>
            ) : testResult ? (
              <div className="space-y-3.5">
                {testResult.success ? (
                  <div className="space-y-2">
                    <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-1">
                      <div className="flex items-center gap-2 font-extrabold text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>200 OK — Probe Connection Successful</span>
                      </div>
                      <p className="text-[11px] text-emerald-800">
                        {testResult.message || `Successfully established a live connection to probe model ${testResult.model}.`}
                      </p>
                    </div>
                    {testResult.available_models && testResult.available_models.length > 0 && (
                      <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-950 flex items-center justify-between text-xs font-bold">
                        <span className="flex items-center gap-1.5">
                          <Zap className="w-4 h-4 text-indigo-600" />
                          <span>Discovered {testResult.available_models.length} live models for this API key</span>
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-700 text-[11px]">
                          {testResult.selected_count ?? testResult.available_models.length} enabled
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 border-b border-rose-200/80 pb-2.5">
                      <div className="flex items-center gap-2 font-extrabold text-xs text-rose-950">
                        <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Connection Test Failed</span>
                      </div>
                      {testResult.model && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-100 border border-rose-200 text-[10px] font-mono font-bold text-rose-700">
                          {testResult.model}
                        </span>
                      )}
                    </div>
                    {(() => {
                      const raw = testResult.error || 'Unknown error contacting provider API.';
                      let cleanMsg = raw;
                      let techDetails: string | null = null;

                      // Try parsing embedded JSON error if present
                      const jsonMatch = raw.match(/(\{[\s\S]*\})/);
                      if (jsonMatch) {
                        try {
                          const parsed = JSON.parse(jsonMatch[1]);
                          const errObj = parsed?.error || parsed;
                          if (errObj && typeof errObj === 'object') {
                            cleanMsg = errObj.message || errObj.code || cleanMsg;
                            techDetails = raw.substring(0, raw.indexOf('{')).trim();
                            if (errObj.code && !cleanMsg.includes(errObj.code)) {
                              cleanMsg += ` (${errObj.code})`;
                            }
                          }
                        } catch {
                          // keep raw
                        }
                      }

                      return (
                        <div className="space-y-1.5 pl-6">
                          <p className="text-xs text-rose-900 font-medium leading-relaxed">
                            {cleanMsg}
                          </p>
                          {techDetails && (
                            <p className="text-[10px] text-rose-600 font-mono">
                              {techDetails}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Metrics Breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex flex-col items-center justify-center text-center gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Latency</span>
                    <span className="text-sm font-extrabold font-mono text-indigo-700">
                      {testResult.success ? `${testResult.latency_ms} ms` : '—'}
                    </span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex flex-col items-center justify-center text-center gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Prompt</span>
                    <span className="text-sm font-extrabold font-mono text-slate-800">
                      {testResult.success ? testResult.tokens_used.prompt_tokens : '—'}
                    </span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex flex-col items-center justify-center text-center gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Completion</span>
                    <span className="text-sm font-extrabold font-mono text-slate-800">
                      {testResult.success ? testResult.tokens_used.completion_tokens : '—'}
                    </span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 flex flex-col items-center justify-center text-center gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Tokens</span>
                    <span className="text-sm font-extrabold font-mono text-slate-800">
                      {testResult.success ? testResult.tokens_used.total_tokens : '—'}
                    </span>
                  </div>
                </div>

                {/* Response Preview */}
                {testResult.response_preview && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-slate-700 block">
                      Model Response Output Preview:
                    </span>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-800 font-mono leading-relaxed max-h-28 overflow-y-auto">
                      "{testResult.response_preview}"
                    </div>
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setTestModalOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-all cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Normal User Model Availability Preview Modal */}
      {isPreviewUserModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Normal User Model Availability Preview
                  </h3>
                  <p className="text-xs text-slate-500">
                    These are the exact models accessible to non-admin users in Agent Builders, Workflows, and Test Suites.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewUserModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer transition-colors"
                title="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selected Models Summary */}
            {totalSelectedModels === 0 ? (
              <div className="p-8 rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 text-center space-y-2">
                <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
                <h4 className="text-sm font-bold text-slate-900">No Models Finalized for Platform Users</h4>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  Normal users currently see 0 models. Check models in the catalog and click <strong>"Finalize Selected Models"</strong> so agents & users can select them.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Available Models for Users ({totalSelectedModels} total)</span>
                  <span className="text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300 text-[11px] font-mono font-extrabold">
                    ● {totalSelectedModels} Active in System
                  </span>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
                  {aiProviders
                    .filter((p) => p.is_enabled && p.selected_models.length > 0)
                    .map((prov) => (
                      <div key={prov.provider} className="p-3 bg-white space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            {prov.name}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-slate-500">
                            {prov.selected_models.length} model{prov.selected_models.length !== 1 ? 's' : ''} enabled
                          </span>
                        </div>

                        <div className="space-y-1.5 pl-3">
                          {prov.selected_models.map((modelId) => {
                            const modelObj = prov.available_models.find((m) => m.id === modelId);
                            return (
                              <div
                                key={modelId}
                                className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-slate-800 truncate">
                                      {modelObj?.name || modelId}
                                    </span>
                                    <span className="font-mono text-[10px] text-slate-500 truncate">
                                      {modelId}
                                    </span>
                                    {modelObj?.is_recommended && (
                                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                                        ★ Recommended
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {modelObj?.context_window && (
                                    <span className="text-[10px] font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200 font-semibold">
                                      {modelObj.context_window}
                                    </span>
                                  )}
                                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                                    Available
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>

                <div className="p-3 bg-indigo-50/70 rounded-2xl border border-indigo-200 text-xs text-indigo-950 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span>
                    When a normal user selects an LLM, only these {totalSelectedModels} models will appear. All {aiProviders.reduce((acc, p) => acc + p.available_models.length, 0) - totalSelectedModels} other models remain hidden.
                  </span>
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsPreviewUserModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
              >
                Close Preview
              </button>

              <button
                type="button"
                onClick={async () => {
                  await handleFinalizeAllProviders();
                  setIsPreviewUserModalOpen(false);
                }}
                disabled={isFinalizingAll || totalSelectedModels === 0}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Finalize & Deploy to All Users</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. USER MANAGEMENT VIEW */}
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
