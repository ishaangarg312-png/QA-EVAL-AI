export interface ResponseKeyOption {
  path: string;
  type: string;
  exampleValue: any;
}

export const getCleanExt = (name?: string, type?: string): string => {
  const filename = (name || '').trim();
  if (filename.includes('.')) {
    const ext = filename.split('.').pop()?.toUpperCase() || '';
    if (ext.length <= 5 && !ext.includes('/') && !ext.includes(' ')) return ext;
  }
  const rawType = (type || '').toLowerCase();
  if (rawType.includes('pdf')) return 'PDF';
  if (rawType.includes('word') || rawType.includes('docx') || rawType.includes('doc') || rawType.includes('officedocument.word')) return 'DOCX';
  if (rawType.includes('sheet') || rawType.includes('excel') || rawType.includes('xls') || rawType.includes('xlsx') || rawType.includes('spreadsheet')) return 'XLSX';
  if (rawType.includes('presentation') || rawType.includes('powerpoint') || rawType.includes('ppt') || rawType.includes('pptx')) return 'PPTX';
  if (rawType.includes('csv')) return 'CSV';
  if (rawType.includes('json')) return 'JSON';
  if (rawType.includes('image') || rawType.includes('png') || rawType.includes('jpg')) return 'IMG';
  return 'FILE';
};

export const getExtBadgeClass = (ext: string): string => {
  switch (ext) {
    case 'PDF':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'DOCX':
    case 'DOC':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'XLSX':
    case 'XLS':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'PPTX':
    case 'PPT':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'CSV':
      return 'bg-teal-100 text-teal-800 border-teal-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

export const cleanAndFormatJson = (rawInput: string): { cleaned: string; error?: string } => {
  if (!rawInput || !rawInput.trim()) return { cleaned: '' };
  let str = rawInput.trim();

  // Strip curl or CLI data wrappers if present
  if (str.includes('--data') || str.includes("-d '") || str.includes('-d "')) {
    const match = str.match(/-d\s+['"]([\s\S]*?)['"](\s+--|$)/) || str.match(/-d\s+(['"][\s\S]*)/);
    if (match && match[1]) str = match[1];
  }

  // 1. Direct standard parse
  try {
    const parsed = JSON.parse(str);
    return { cleaned: JSON.stringify(parsed, null, 2) };
  } catch {
    // 2. Heuristic clean
    try {
      let candidate = str
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '  ')
        .replace(/^[^{[]*/, '')
        .replace(/[^}\]]*$/, '')
        .replace(/'/g, '"')
        .replace(/,\s*([\}\]])/g, '$1')
        .replace(/([{\[,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');

      const parsed = JSON.parse(candidate);
      return { cleaned: JSON.stringify(parsed, null, 2) };
    } catch (e2: any) {
      return { cleaned: str, error: `Invalid JSON syntax: ${e2.message || 'Check quotes and brackets'}` };
    }
  }
};

export const extractResponseKeys = (obj: any, prefix = ''): ResponseKeyOption[] => {
  if (!obj || typeof obj !== 'object') return [];
  const keys: ResponseKeyOption[] = [];

  for (const [k, v] of Object.entries(obj)) {
    const currentPath = prefix ? `${prefix}.${k}` : k;
    if (v === null) {
      keys.push({ path: currentPath, type: 'null', exampleValue: 'null' });
    } else if (Array.isArray(v)) {
      keys.push({ path: currentPath, type: 'array', exampleValue: `[${v.length} items]` });
      if (v.length > 0 && typeof v[0] === 'object') {
        keys.push(...extractResponseKeys(v[0], `${currentPath}[0]`));
      } else if (v.length > 0) {
        keys.push({ path: `${currentPath}[0]`, type: typeof v[0], exampleValue: v[0] });
      }
    } else if (typeof v === 'object') {
      keys.push(...extractResponseKeys(v, currentPath));
    } else {
      keys.push({ path: currentPath, type: typeof v, exampleValue: v });
    }
  }

  return keys;
};
