import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Upload,
  Download,
  Save,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  Copy,
  ChevronDown,
  Eye,
  X,
  FileCode,
  Sliders,
  Check,
  RefreshCw,
  Edit3,
  RotateCcw,
  Presentation,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Shield,
  Briefcase,
  FileCheck
} from 'lucide-react';
import { apiService } from '../../services/api';
import {
  Project,
  ActivePlatformModel,
  DocGeneratorFormat,
  DocumentContentModel,
  GenerateDocResponse,
  PptxSlide,
  DocSection
} from '../../types';

interface TestDocGeneratorViewProps {
  currentProject: Project | null;
}

export const DOC_PRESETS = [
  {
    id: 'test_strategy',
    name: 'Test Strategy & V&V Plan',
    description: 'Executive QA strategy, verification & validation gates, risk coverage matrix, and acceptance criteria.',
    defaultCount: 6,
    icon: Briefcase,
    samplePrompt: 'Create a comprehensive Test Strategy and Verification & Validation (V&V) Plan for an enterprise Core Banking and Payment Gateway Microservice with zero-downtime requirements.'
  },
  {
    id: 'exec_summary',
    name: 'Executive QA & Release Briefing',
    description: 'Release sign-off briefing, key quality metrics, defect distribution, and executive deployment verdict.',
    defaultCount: 5,
    icon: Presentation,
    samplePrompt: 'Generate an Executive QA and Release Sign-Off Presentation Deck summarizing test execution results for Sprint 42 release of the E-Commerce Mobile App.'
  },
  {
    id: 'compliance_audit',
    name: 'Compliance & Security Audit Report',
    description: 'Regulatory audit traceability, ISO/IEC/IEEE 29119 standards check, SOC2/HIPAA compliance verification.',
    defaultCount: 7,
    icon: Shield,
    samplePrompt: 'Produce a formal Security and Regulatory Compliance Audit Verification Document for a Cloud Healthcare Patient Records management platform.'
  },
  {
    id: 'defect_triage',
    name: 'Defect Triage & Root Cause Report',
    description: 'Severity breakdown, blocker analysis, RCA breakdown, and engineering mitigation action items.',
    defaultCount: 4,
    icon: FileCheck,
    samplePrompt: 'Compile a Sprint Defect Triage and Root Cause Analysis (RCA) review analyzing payment processing timeouts under high concurrent load.'
  }
];

export const THEME_OPTIONS = [
  { id: 'corporate_blue', name: 'Corporate Blue & Indigo', primary: '#1E3A8A', secondary: '#4F46E5' },
  { id: 'slate_dark', name: 'Executive Slate & Obsidian', primary: '#0F172A', secondary: '#334155' },
  { id: 'emerald_teal', name: 'Emerald & Modern Teal', primary: '#065F46', secondary: '#0D9488' }
];

export const TestDocGeneratorView: React.FC<TestDocGeneratorViewProps> = ({ currentProject }) => {
  // Config & Ingestion States
  const [docFormat, setDocFormat] = useState<DocGeneratorFormat>('all');
  const [activePresetId, setActivePresetId] = useState<string>('test_strategy');
  const [targetCount, setTargetCount] = useState<number>(5);
  const [selectedTheme, setSelectedTheme] = useState<string>('corporate_blue');
  const [masterPrompt, setMasterPrompt] = useState<string>(DOC_PRESETS[0].samplePrompt);
  const [instructions, setInstructions] = useState<string>('Include executive summary, concrete verification matrices, risk mitigations, and clear sign-off criteria.');
  const [docTitle, setDocTitle] = useState<string>('Enterprise QA & Testing Specification');

  // Model Selection
  const [activeModels, setActiveModels] = useState<ActivePlatformModel[]>([]);
  const [selectedModelKey, setSelectedModelKey] = useState<string>('');
  const [isLoadingModels, setIsLoadingModels] = useState<boolean>(false);

  // Ingested Document
  const [uploadedDoc, setUploadedDoc] = useState<{
    filename: string;
    text: string;
    char_count: number;
    word_count: number;
  } | null>(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState<boolean>(false);
  const [isPreviewDocModalOpen, setIsPreviewDocModalOpen] = useState<boolean>(false);

  // Generation States
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [generationResult, setGenerationResult] = useState<GenerateDocResponse | null>(null);
  const [generatedDoc, setGeneratedDoc] = useState<DocumentContentModel | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Export States
  const [isExportingDocx, setIsExportingDocx] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingPptx, setIsExportingPptx] = useState<boolean>(false);
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);

  // Project Persistence States
  const [isSavingPrompt, setIsSavingPrompt] = useState<boolean>(false);
  const [isSavingInstructions, setIsSavingInstructions] = useState<boolean>(false);
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);
  const [promptSavedSuccess, setPromptSavedSuccess] = useState<boolean>(false);
  const [instructionsSavedSuccess, setInstructionsSavedSuccess] = useState<boolean>(false);
  const [configSavedSuccess, setConfigSavedSuccess] = useState<boolean>(false);

  // Preview Navigation States
  const [previewTab, setPreviewTab] = useState<'visual_doc' | 'visual_slides' | 'json'>('visual_doc');
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [schemaCopied, setSchemaCopied] = useState<boolean>(false);

  useEffect(() => {
    loadActiveModels();
  }, []);

  useEffect(() => {
    if (currentProject?.id) {
      loadProjectConfig(currentProject.id);
    }
  }, [currentProject?.id]);

  const showToast = (msg: string) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const loadActiveModels = async () => {
    setIsLoadingModels(true);
    try {
      const res = await apiService.getActiveAIModels();
      if (res && res.models && res.models.length > 0) {
        setActiveModels(res.models);
        const groq = res.models.find((m: ActivePlatformModel) => m.provider === 'groq');
        const recommended = res.models.find((m: ActivePlatformModel) => m.is_recommended);
        const defaultModel = groq || recommended || res.models[0];
        setSelectedModelKey(`${defaultModel.provider}::${defaultModel.model_id}`);
      }
    } catch (err) {
      console.warn('Could not load active models:', err);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const loadProjectConfig = async (projectId: string) => {
    try {
      const res = await apiService.getDocGeneratorProjectConfig(projectId);
      if (res) {
        if (res.master_prompt) setMasterPrompt(res.master_prompt);
        if (res.instructions) setInstructions(res.instructions);
        if (res.config) {
          if (res.config.document_type) setDocFormat(res.config.document_type as DocGeneratorFormat);
          if (res.config.template_preset) setActivePresetId(res.config.template_preset);
          if (res.config.target_count) setTargetCount(res.config.target_count);
          if (res.config.theme) setSelectedTheme(res.config.theme);
        }
      }
    } catch (err) {
      console.warn('Could not load project doc generator config:', err);
    }
  };

  const handlePresetSelect = (presetId: string) => {
    setActivePresetId(presetId);
    const preset = DOC_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setDocTitle(preset.name);
      setMasterPrompt(preset.samplePrompt);
      setTargetCount(preset.defaultCount);
    }
  };

  // Ingest Document
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingDoc(true);
    setErrorMsg(null);
    try {
      const res = await apiService.parseGeneratorDocument(file);
      setUploadedDoc({
        filename: res.filename,
        text: res.text,
        char_count: res.char_count,
        word_count: res.word_count
      });
      showToast(`Document parsed: ${res.word_count.toLocaleString()} words extracted`);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to upload document');
    } finally {
      setIsUploadingDoc(false);
      e.target.value = '';
    }
  };

  // Save Project Configuration Handlers
  const handleSavePrompt = async () => {
    if (!currentProject) {
      setErrorMsg('Please select an active project first.');
      return;
    }
    if (!masterPrompt.trim()) {
      setErrorMsg('Prompt cannot be empty to save.');
      return;
    }
    setIsSavingPrompt(true);
    try {
      await apiService.saveDocGeneratorProjectPrompt(currentProject.id, masterPrompt);
      setPromptSavedSuccess(true);
      setTimeout(() => setPromptSavedSuccess(false), 3000);
      showToast(`Master prompt saved to project: "${currentProject.name}"`);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to save prompt');
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleSaveInstructions = async () => {
    if (!currentProject) {
      setErrorMsg('Please select an active project first.');
      return;
    }
    if (!instructions.trim()) {
      setErrorMsg('Instructions cannot be empty to save.');
      return;
    }
    setIsSavingInstructions(true);
    try {
      await apiService.saveDocGeneratorProjectInstructions(currentProject.id, instructions);
      setInstructionsSavedSuccess(true);
      setTimeout(() => setInstructionsSavedSuccess(false), 3000);
      showToast(`Instructions saved to project: "${currentProject.name}"`);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to save instructions');
    } finally {
      setIsSavingInstructions(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!currentProject) {
      setErrorMsg('Please select an active project first.');
      return;
    }
    setIsSavingConfig(true);
    try {
      await apiService.saveDocGeneratorProjectConfig(currentProject.id, {
        document_type: docFormat,
        template_preset: activePresetId,
        target_count: targetCount,
        theme: selectedTheme,
        master_prompt: masterPrompt,
        instructions
      });
      setConfigSavedSuccess(true);
      setTimeout(() => setConfigSavedSuccess(false), 3000);
      showToast(`Document generator configuration saved to "${currentProject.name}"`);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Failed to save config');
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Generate Document Action
  const handleGenerate = async () => {
    if (!masterPrompt.trim() && !uploadedDoc?.text) {
      setErrorMsg('Please enter a Master Prompt or upload a requirement document.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);
    setGenerationStep('Formatting document prompt & executive schemas...');

    let provider: string | undefined;
    let model_id: string | undefined;

    if (selectedModelKey) {
      const parts = selectedModelKey.split('::');
      provider = parts[0];
      model_id = parts[1];
    }

    try {
      setGenerationStep('Calling AI Model for structured Word, PDF & Slide content...');
      const response = await apiService.generateTestDocument({
        document_type: docFormat,
        template_preset: activePresetId,
        master_prompt: masterPrompt,
        instructions: instructions.trim() || undefined,
        target_count: targetCount,
        document_text: uploadedDoc?.text,
        model_id,
        provider,
        title: docTitle,
        theme: selectedTheme
      });

      setGenerationResult(response);
      setGeneratedDoc(response.content);
      setActiveSlideIndex(0);
      setPreviewTab(docFormat === 'pptx' ? 'visual_slides' : 'visual_doc');
      setGenerationStep('');
      showToast(`Generated "${response.title}" with ${response.total_sections} sections & ${response.total_slides} slides in ${response.latency_ms}ms!`);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Document generation failed');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  // File Download Handlers
  const handleDownloadFile = async (format: 'docx' | 'pdf' | 'pptx' | 'all_zip') => {
    if (!generatedDoc) {
      setErrorMsg('Please generate a document first before exporting.');
      return;
    }

    if (format === 'docx') setIsExportingDocx(true);
    if (format === 'pdf') setIsExportingPdf(true);
    if (format === 'pptx') setIsExportingPptx(true);
    if (format === 'all_zip') setIsExportingZip(true);

    try {
      const safeName = (generatedDoc.meta.title || 'QA_Test_Specification').replace(/[^a-zA-Z0-9_-]/g, '_');
      const ext = format === 'all_zip' ? 'zip' : format;
      const filename = `${safeName}_${Date.now()}.${ext}`;

      const blob = await apiService.exportTestDocument({
        document_type: format,
        content: generatedDoc,
        filename,
        theme: selectedTheme
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      showToast(`File successfully downloaded: ${filename}`);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || `Failed to export ${format.toUpperCase()}`);
    } finally {
      setIsExportingDocx(false);
      setIsExportingPdf(false);
      setIsExportingPptx(false);
      setIsExportingZip(false);
    }
  };

  return (
    <div
      className="flex-1 flex flex-col h-full overflow-hidden bg-slate-100"
      style={{ height: '100%', flex: 1, minHeight: 0, overflow: 'hidden' }}
    >
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center shadow-xs">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Test Document Generator</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                DOCX • PDF • PPTX
              </span>
            </h1>
            <p className="text-xs text-slate-500">
              Generate executive-grade Word docs, formatted PDFs, and 16:9 PowerPoint decks from QA requirements
            </p>
          </div>
        </div>

        {/* Target Format Selector */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setDocFormat('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              docFormat === 'all'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All Formats (Doc + PDF + PPT)</span>
          </button>
          <button
            onClick={() => setDocFormat('docx')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              docFormat === 'docx'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span>Word (.docx)</span>
          </button>
          <button
            onClick={() => setDocFormat('pdf')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              docFormat === 'pdf'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-rose-600" />
            <span>PDF (.pdf)</span>
          </button>
          <button
            onClick={() => setDocFormat('pptx')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
              docFormat === 'pptx'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Presentation className="w-3.5 h-3.5 text-amber-600" />
            <span>PowerPoint (.pptx)</span>
          </button>
        </div>
      </header>

      {/* Main Studio Body: Split View */}
      <div
        className="flex-1 flex overflow-hidden"
        style={{ width: '100%', maxWidth: '100%', height: '100%', flex: 1, minHeight: 0, overflow: 'hidden' }}
      >
        {/* Left Side: Configuration & Ingestion (70% Width) */}
        <div
          className="w-[70%] border-r border-slate-200 bg-white flex flex-col shrink-0 overflow-hidden"
          style={{ width: '70%', height: '100%', overflow: 'hidden' }}
        >
          {/* Header Action Bar for Left Pane (Pixel-aligned with Right Pane Studio Header) */}
          <div className="h-14 border-b border-slate-200 bg-white px-5 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-800">Document Specification</span>
            </div>
            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
              {DOC_PRESETS.find(p => p.id === activePresetId)?.name || 'Executive QA'}
            </span>
          </div>

          {/* Scrollable Form Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 min-h-0">
            {/* Error Alert */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Document Error</p>
                  <p className="mt-0.5 text-rose-700 leading-relaxed">{errorMsg}</p>
                </div>
                <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Template Presets */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>Document Template Preset</span>
                <span className="text-[10px] text-slate-400 font-normal">Executive QA archetypes</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {DOC_PRESETS.map((p) => {
                  const Icon = p.icon;
                  const isSelected = activePresetId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => handlePresetSelect(p.id)}
                      className={`p-2.5 text-left rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-400 text-indigo-950'
                          : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-600' : 'text-slate-500'}`} />
                        <span className="text-xs font-bold truncate">{p.name}</span>
                      </div>
                      <p className="text-[10px] text-slate-500 line-clamp-2 leading-tight">
                        {p.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Document Title & Target Count */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-800">Document Title</label>
                <input
                  type="text"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  placeholder="e.g. Core Banking QA Specification"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Pages/Slides</span>
                  <span className="text-indigo-600 font-mono text-[11px]">{targetCount}</span>
                </label>
                <input
                  type="number"
                  min={2}
                  max={15}
                  value={targetCount}
                  onChange={(e) => setTargetCount(Math.max(2, Math.min(15, parseInt(e.target.value) || 5)))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 font-mono font-bold text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Document Ingestion Card */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Ingest Requirement Document</span>
                </span>
                {uploadedDoc && (
                  <button
                    onClick={() => setUploadedDoc(null)}
                    className="text-[10px] text-rose-600 hover:text-rose-700 font-semibold cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </label>

              {!uploadedDoc ? (
                <label className="border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all group">
                  <Upload className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 mb-1.5" />
                  <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-900">
                    {isUploadingDoc ? 'Parsing text...' : 'Upload .pdf, .docx, .pptx, .xlsx, .csv'}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    Extracts requirements to ground document content
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt"
                    onChange={handleFileUpload}
                    disabled={isUploadingDoc}
                  />
                </label>
              ) : (
                <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div className="truncate">
                      <p className="text-xs font-bold text-emerald-900 truncate">{uploadedDoc.filename}</p>
                      <p className="text-[10px] text-emerald-700">
                        {uploadedDoc.word_count.toLocaleString()} words extracted
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsPreviewDocModalOpen(true)}
                    className="px-2 py-1 rounded-lg text-xs font-bold bg-white text-emerald-700 border border-emerald-300 shadow-2xs hover:bg-emerald-100 cursor-pointer shrink-0"
                  >
                    View Text
                  </button>
                </div>
              )}
            </div>

            {/* Master Prompt & Guidelines with Project Save */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">Master Requirement Prompt</label>
                  <button
                    onClick={handleSavePrompt}
                    disabled={isSavingPrompt || !masterPrompt.trim()}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 transition-all cursor-pointer ${
                      promptSavedSuccess
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                    title="Save Master Prompt to active project"
                  >
                    {promptSavedSuccess ? <Check className="w-2.5 h-2.5" /> : <Save className="w-2.5 h-2.5" />}
                    <span>{promptSavedSuccess ? 'Saved to Project' : 'Save Prompt'}</span>
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={masterPrompt}
                  onChange={(e) => setMasterPrompt(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none font-medium"
                  placeholder="Specify system under test, architecture components, critical paths, and test objectives..."
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">Document Guidelines & Instructions</label>
                  <button
                    onClick={handleSaveInstructions}
                    disabled={isSavingInstructions || !instructions.trim()}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 transition-all cursor-pointer ${
                      instructionsSavedSuccess
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                    title="Save Instructions to active project"
                  >
                    {instructionsSavedSuccess ? <Check className="w-2.5 h-2.5" /> : <Save className="w-2.5 h-2.5" />}
                    <span>{instructionsSavedSuccess ? 'Saved to Project' : 'Save Instructions'}</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none font-medium"
                  placeholder="Additional constraints, compliance frameworks, or specific tables..."
                />
              </div>
            </div>

            {/* AI Model Selection & Theme */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  <span>AI Engine</span>
                </label>
                <select
                  value={selectedModelKey}
                  onChange={(e) => setSelectedModelKey(e.target.value)}
                  disabled={isLoadingModels}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                >
                  {activeModels.map((m) => {
                    const modelId = m.model_id || m.id || m.name || 'default';
                    return (
                      <option key={`${m.provider}::${modelId}`} value={`${m.provider}::${modelId}`}>
                        {m.provider.toUpperCase()} • {modelId.replace(/^.*\//, '')}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Branding Theme</span>
                </label>
                <select
                  value={selectedTheme}
                  onChange={(e) => setSelectedTheme(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                >
                  {THEME_OPTIONS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Save Entire Config to Project */}
            <div className="flex justify-end">
              <button
                onClick={handleSaveConfig}
                disabled={isSavingConfig}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  configSavedSuccess
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                }`}
              >
                {configSavedSuccess ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                <span>{configSavedSuccess ? 'Config Saved!' : 'Save Project Document Config'}</span>
              </button>
            </div>

          </div>

          {/* Sticky Generate Button at Bottom */}
          <div className="p-4 border-t border-slate-200 bg-white shrink-0 shadow-xs">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{generationStep || 'Generating Test Document & Slides...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Generate Test Document & Presentation</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Side: Interactive Preview & Download Studio (30% Width) */}
        <div
          className="w-[30%] flex-1 flex flex-col overflow-hidden bg-slate-50"
          style={{ width: '30%', minWidth: '340px', height: '100%', flex: 1, minHeight: 0, overflow: 'hidden' }}
        >
          {/* Header Action Bar */}
          <div className="h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="text-xs font-bold text-slate-800 truncate">
                {generatedDoc ? generatedDoc.meta.title : 'Document & Slide Studio'}
              </span>
            </div>

            {/* Download Buttons Group */}
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              <button
                onClick={() => handleDownloadFile('docx')}
                disabled={isExportingDocx || !generatedDoc}
                className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-xs flex items-center gap-1 transition-all cursor-pointer"
                title="Download formatted Microsoft Word Document (.docx)"
              >
                {isExportingDocx ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span className="hidden 2xl:inline">Word</span>
                <span>(.docx)</span>
              </button>

              <button
                onClick={() => handleDownloadFile('pdf')}
                disabled={isExportingPdf || !generatedDoc}
                className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-xs flex items-center gap-1 transition-all cursor-pointer"
                title="Download formatted PDF Document with Page Numbers (.pdf)"
              >
                {isExportingPdf ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span className="hidden 2xl:inline">PDF</span>
                <span>(.pdf)</span>
              </button>

              <button
                onClick={() => handleDownloadFile('pptx')}
                disabled={isExportingPptx || !generatedDoc}
                className="px-2.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-xs flex items-center gap-1 transition-all cursor-pointer"
                title="Download 16:9 Widescreen PowerPoint Slide Deck (.pptx)"
              >
                {isExportingPptx ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span className="hidden 2xl:inline">PowerPoint</span>
                <span>(.pptx)</span>
              </button>

              <button
                onClick={() => handleDownloadFile('all_zip')}
                disabled={isExportingZip || !generatedDoc}
                className="px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-xs flex items-center gap-1 transition-all cursor-pointer"
                title="Download all formats in a single ZIP bundle"
              >
                {isExportingZip ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-slate-300" />}
                <span>ZIP</span>
              </button>
            </div>
          </div>

          {/* Dual Tab Navigator */}
          {generatedDoc && (
            <div className="px-6 border-b border-slate-200 bg-white flex items-center justify-between">
              <div className="flex items-center gap-2 -mb-px">
                <button
                  onClick={() => setPreviewTab('visual_doc')}
                  className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                    previewTab === 'visual_doc'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Document View (Executive Spec)</span>
                </button>
                <button
                  onClick={() => setPreviewTab('visual_slides')}
                  className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                    previewTab === 'visual_slides'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Presentation className="w-3.5 h-3.5" />
                  <span>Slide Deck (16:9 Presentation)</span>
                </button>
                <button
                  onClick={() => setPreviewTab('json')}
                  className={`py-3 px-3.5 text-xs font-bold border-b-2 flex items-center gap-2 transition-all cursor-pointer ${
                    previewTab === 'json'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>JSON Contract Data</span>
                </button>
              </div>

              <span className="text-[11px] font-mono text-slate-500">
                {generatedDoc.sections.length} Sections · {generatedDoc.slides.length} Slides
              </span>
            </div>
          )}

          {/* Main Preview Container */}
          <div
            className="flex-1 overflow-y-auto p-6"
            style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingBottom: '3.5rem' }}
          >
            {!generatedDoc ? (
              <div className="h-full border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center p-8 text-center bg-white/50">
                <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
                  <FileText className="w-7 h-7" />
                </div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">No Document Generated Yet</h3>
                <p className="text-xs text-slate-500 max-w-md mb-4">
                  Select a document preset on the left, customize your master requirements, and click "Generate Test Document" to produce native Word, PDF, and PowerPoint decks.
                </p>
                <button
                  onClick={handleGenerate}
                  className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-xs hover:bg-indigo-700 transition-all cursor-pointer"
                >
                  Generate Sample V&V Plan
                </button>
              </div>
            ) : previewTab === 'visual_doc' ? (
              /* TAB 1: VISUAL DOCUMENT VIEW (Paginated Sheet Style) */
              <div className="max-w-4xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-10 space-y-8 text-slate-800">
                {/* Document Cover Header */}
                <div className="border-b-2 border-indigo-600 pb-6 space-y-3">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
                    {generatedDoc.meta.classification || 'QA Specification'}
                  </span>
                  <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                    {generatedDoc.meta.title}
                  </h1>
                  {generatedDoc.meta.subtitle && (
                    <p className="text-sm text-indigo-700 font-medium">{generatedDoc.meta.subtitle}</p>
                  )}

                  {/* Meta Bar */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Author:</span>
                      <span className="font-semibold text-slate-700">{generatedDoc.meta.author || 'EVAL AI'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Organization:</span>
                      <span className="font-semibold text-slate-700">{generatedDoc.meta.organization || 'Quality Assurance'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Date:</span>
                      <span className="font-semibold text-slate-700">{generatedDoc.meta.date_str || 'Today'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Version:</span>
                      <span className="font-semibold text-slate-700">{generatedDoc.meta.version || '1.0.0'}</span>
                    </div>
                  </div>
                </div>

                {/* Executive Summary */}
                {generatedDoc.executive_summary && (
                  <div className="p-4 bg-slate-50 border-l-4 border-indigo-600 rounded-r-xl space-y-1.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900">Executive Summary</h3>
                    <p className="text-xs text-slate-700 leading-relaxed">{generatedDoc.executive_summary}</p>
                  </div>
                )}

                {/* Sections */}
                <div className="space-y-8 divide-y divide-slate-100">
                  {generatedDoc.sections.map((sec, sIdx) => (
                    <div key={sIdx} className="pt-6 space-y-4">
                      <div>
                        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                          <span className="text-indigo-600 font-mono text-sm">{sIdx + 1}.</span>
                          <span>{sec.heading}</span>
                        </h2>
                        {sec.summary && (
                          <p className="text-xs text-slate-500 italic mt-0.5">{sec.summary}</p>
                        )}
                      </div>

                      {/* Paragraphs */}
                      {(sec.paragraphs || []).map((p, pIdx) => (
                        <p key={pIdx} className="text-xs text-slate-700 leading-relaxed">
                          {p}
                        </p>
                      ))}

                      {/* Bullet points */}
                      {(sec.bullet_points || []).length > 0 && (
                        <ul className="space-y-1.5 pl-4">
                          {(sec.bullet_points || []).map((b, bIdx) => (
                            <li key={bIdx} className="text-xs text-slate-700 list-disc leading-relaxed">
                              {b}
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Callout Cards */}
                      {(sec.callouts || []).map((c, cIdx) => (
                        <div
                          key={cIdx}
                          className={`p-3 rounded-xl border text-xs space-y-1 ${
                            c.type === 'warning'
                              ? 'bg-amber-50 border-amber-200 text-amber-900'
                              : 'bg-indigo-50/70 border-indigo-200 text-indigo-950'
                          }`}
                        >
                          {c.title && <p className="font-bold">{c.title}</p>}
                          <p className="leading-relaxed">{c.content}</p>
                        </div>
                      ))}

                      {/* Tables */}
                      {(sec.tables || []).map((tbl, tIdx) => (
                        <div key={tIdx} className="space-y-1.5 pt-2">
                          {tbl.caption && (
                            <p className="text-xs font-bold text-slate-700">Table: {tbl.caption}</p>
                          )}
                          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                            <table className="w-full text-left border-collapse text-xs">
                              {tbl.headers.length > 0 && (
                                <thead>
                                  <tr className="bg-slate-900 text-white">
                                    {tbl.headers.map((h, hIdx) => (
                                      <th key={hIdx} className="px-3.5 py-2 font-semibold">
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                              )}
                              <tbody className="divide-y divide-slate-200">
                                {tbl.rows.map((row, rIdx) => (
                                  <tr key={rIdx} className={rIdx % 2 === 1 ? 'bg-slate-50' : 'bg-white'}>
                                    {row.map((cellVal, cIdx) => (
                                      <td key={cIdx} className="px-3.5 py-2 text-slate-700">
                                        {cellVal}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : previewTab === 'visual_slides' ? (
              /* TAB 2: VISUAL SLIDE DECK (16:9 Presentation Studio) */
              <div className="max-w-5xl mx-auto space-y-4">
                {/* Slide Controls Bar */}
                <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      Slide {activeSlideIndex + 1} of {generatedDoc.slides.length}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold uppercase">
                      {generatedDoc.slides[activeSlideIndex]?.layout_type.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setActiveSlideIndex(Math.max(0, activeSlideIndex - 1))}
                      disabled={activeSlideIndex === 0}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setActiveSlideIndex(Math.min(generatedDoc.slides.length - 1, activeSlideIndex + 1))}
                      disabled={activeSlideIndex === generatedDoc.slides.length - 1}
                      className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 16:9 Slide Canvas Mockup */}
                {(() => {
                  const slide = generatedDoc.slides[activeSlideIndex] || generatedDoc.slides[0];
                  const isTitle = slide.layout_type === 'title_slide' || activeSlideIndex === 0;

                  return (
                    <div className="aspect-video w-full bg-slate-900 rounded-2xl shadow-xl overflow-hidden flex flex-col justify-between p-8 text-white relative border border-slate-800">
                      {/* Top Accent Strip */}
                      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-sky-400 to-indigo-600" />

                      {/* Slide Header */}
                      {!isTitle && (
                        <div className="space-y-1">
                          <h2 className="text-xl font-black tracking-tight text-white">{slide.title}</h2>
                          {slide.subtitle && (
                            <p className="text-xs text-indigo-300 font-medium">{slide.subtitle}</p>
                          )}
                        </div>
                      )}

                      {/* Slide Content Body */}
                      <div className="flex-1 flex flex-col justify-center my-4">
                        {isTitle ? (
                          <div className="bg-indigo-950/80 p-8 rounded-2xl border border-indigo-800/60 space-y-4 my-auto">
                            <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded bg-indigo-600 text-white uppercase tracking-wider">
                              Executive QA Presentation
                            </span>
                            <h1 className="text-3xl font-black text-white leading-tight">{slide.title}</h1>
                            {slide.subtitle && (
                              <p className="text-base text-indigo-200">{slide.subtitle}</p>
                            )}
                            <div className="pt-4 border-t border-indigo-800/80 flex items-center justify-between text-xs text-indigo-300 font-mono">
                              <span>{generatedDoc.meta.author}</span>
                              <span>{generatedDoc.meta.organization}</span>
                            </div>
                          </div>
                        ) : slide.cards && slide.cards.length > 0 ? (
                          <div className={`grid gap-4 ${slide.cards.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                            {slide.cards.map((card, cIdx) => (
                              <div
                                key={cIdx}
                                className="bg-slate-800/90 border border-slate-700 p-4 rounded-xl space-y-2 flex flex-col justify-between"
                              >
                                <div className="space-y-1.5">
                                  <div className="h-1 w-8 bg-indigo-500 rounded-full mb-2" />
                                  <h4 className="text-xs font-bold text-white">{card.title}</h4>
                                  <p className="text-[11px] text-slate-300 leading-relaxed">{card.content}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <ul className="space-y-3 pl-4">
                            {(slide.bullet_points || []).map((bp, bpIdx) => (
                              <li key={bpIdx} className="text-sm text-slate-200 list-disc leading-relaxed">
                                {bp}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Slide Footer */}
                      <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                        <span>EVAL AI Enterprise</span>
                        <span>Slide {slide.slide_number}</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Presenter Speaker Notes Drawer */}
                {generatedDoc.slides[activeSlideIndex]?.speaker_notes && (
                  <div className="bg-amber-50/80 border border-amber-200 p-3.5 rounded-xl text-xs text-amber-900 space-y-1 shadow-2xs">
                    <p className="font-bold flex items-center gap-1.5 text-amber-800">
                      <Presentation className="w-3.5 h-3.5" />
                      <span>Presenter Speaker Notes:</span>
                    </p>
                    <p className="text-[11px] text-amber-800 leading-relaxed font-mono">
                      {generatedDoc.slides[activeSlideIndex].speaker_notes}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* TAB 3: RAW JSON CONTRACT INSPECTOR */
              <div className="bg-slate-900 rounded-2xl p-6 text-emerald-400 font-mono text-xs overflow-auto max-h-[75vh] shadow-xl relative border border-slate-800">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(JSON.stringify(generatedDoc, null, 2));
                    setSchemaCopied(true);
                    setTimeout(() => setSchemaCopied(false), 2000);
                  }}
                  className="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
                >
                  {schemaCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{schemaCopied ? 'Copied JSON!' : 'Copy JSON'}</span>
                </button>
                <pre>{JSON.stringify(generatedDoc, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Extracted Document Plaintext Preview Modal */}
      {isPreviewDocModalOpen && uploadedDoc && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-6">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 px-6 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" />
                  <span>{uploadedDoc.filename}</span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  Extracted plaintext: {uploadedDoc.word_count.toLocaleString()} words ({uploadedDoc.char_count.toLocaleString()} characters)
                </p>
              </div>
              <button
                onClick={() => setIsPreviewDocModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto font-mono text-xs text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50/50 flex-1">
              {uploadedDoc.text}
            </div>
            <div className="p-4 border-t border-slate-200 bg-white flex justify-end">
              <button
                onClick={() => setIsPreviewDocModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer shadow-xs"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
