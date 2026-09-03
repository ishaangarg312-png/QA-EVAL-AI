/**
 * Utilities for parsing cURL commands, browser inspect Network payloads,
 * and repairing Windows CMD caret-escaped or DevTools-mangled form data.
 */

export interface ParsedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: any;
  body_type: 'JSON' | 'MULTIPART_FORM_DATA' | 'FORM_URLENCODED';
  source: 'curl' | 'devtools_form' | 'json';
  detectedFieldsCount: number;
  rawBodyText?: string;
}

/**
 * Categorizes whether a header is generally recommended for API testing
 * or is browser-internal tracking noise (sec-*, origin, referer, priority, etc.).
 */
export function isBrowserNoiseHeader(headerKey: string): boolean {
  const k = headerKey.toLowerCase().trim();
  return (
    k.startsWith('sec-ch-') ||
    k.startsWith('sec-fetch-') ||
    k === 'priority' ||
    k === 'origin' ||
    k === 'referer' ||
    k === 'user-agent' ||
    k === 'accept-encoding' ||
    k === 'connection'
  );
}

/**
 * Unescapes Windows CMD caret escapes (^" -> ", ^\n -> \n, ^^ -> ^, etc.)
 */
export function cleanCmdCarets(str: string): string {
  let s = str.replace(/\^[\r\n]+/g, '\n');
  s = s.replace(/\\?\^"/g, '"');
  s = s.replace(/"\^/g, '"');
  s = s.replace(/\^\^/g, '^');
  // Strip leading/trailing carets around standalone tokens
  s = s.replace(/(?<=\s|^)\^([^\s]+)\^(?=\s|$)/g, '$1');
  return s;
}

/**
 * Converts Windows CMD caret-mangled JSON/strings into valid JSON.
 */
export function unescapeCmdString(str: string): string {
  let s = (str || '').trim();
  if (s.startsWith('^')) s = s.slice(1);
  if (s.endsWith('^')) s = s.slice(0, -1);
  s = s.replace(/\^[\r\n]+/g, '\n');
  // CMD escapes quotes as ^\^" or \^" or ^^" or ^" - replace with single quote "
  s = s.replace(/[\^\\]*\"[\^\\]*/g, '"');
  // Strip duplicate quotes created by mangling: "" -> "
  s = s.replace(/""+/g, '"');
  // Strip carets from structural JSON characters: ^{, ^}, ^[, ^], ^:, ^,, ^&
  s = s.replace(/\^([\{\}\[\]:,\&])/g, '$1');
  s = s.replace(/([\{\}\[\]:,\&])\^/g, '$1');
  // Strip any remaining carets
  s = s.replace(/\^/g, '');
  return s;
}

/**
 * Parses a single field string or key-value entry, handling DevTools tabs,
 * colons, equals, Windows CMD carets, or double spaces.
 */
export function parseFieldString(str: string, fallbackVal: any = ''): { key: string; val: any } | null {
  const trimmed = (str || '').trim();
  if (!trimmed) return null;

  // Match: key, separator (^, :, =, \t, or 2+ spaces), then value
  const match = trimmed.match(/^([a-zA-Z0-9_\-\.]+)(?:\^|\:|=|\\t|\s{2,}|\s)([\s\S]*)$/);
  let key = '';
  let val: any = '';

  if (match) {
    key = match[1].trim().replace(/^\^|\^$/g, '');
    val = match[2].trim();
    val = val.replace(/^\^+\s*/, '');
  } else {
    key = trimmed.replace(/^\^|\^$/g, '').trim();
    val = fallbackVal;
  }

  // If val has carets used as JSON quotes or CMD escapes
  if (typeof val === 'string' && (val.includes('^') || val.includes('""'))) {
    const unescaped = unescapeCmdString(val);
    if (
      (unescaped.startsWith('{') && unescaped.endsWith('}')) ||
      (unescaped.startsWith('[') && unescaped.endsWith(']'))
    ) {
      try {
        val = JSON.parse(unescaped);
      } catch {
        val = unescaped;
      }
    } else {
      val = unescaped;
    }
  }

  // Handle standard JSON strings, booleans, numbers
  if (typeof val === 'string') {
    const lower = val.toLowerCase().trim();
    if (lower === 'true') val = true;
    else if (lower === 'false') val = false;
    else if (
      (val.startsWith('{') && val.endsWith('}')) ||
      (val.startsWith('[') && val.endsWith(']'))
    ) {
      try {
        val = JSON.parse(val);
      } catch {}
    }
  }

  return { key, val };
}

/**
 * Automatically repairs objects where keys were mangled with their values
 * (e.g. { "message^ Confirm company name: Presight": "", "stream^ true": "" })
 */
export function repairMangledFields(obj: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [rawKey, rawVal] of Object.entries(obj)) {
    // If rawKey contains separator artifacts and rawVal is empty string or null
    if (
      (rawKey.includes('^') || rawKey.includes('  ') || rawKey.includes(':') || rawKey.includes('\t') || rawKey.startsWith('message ') || rawKey.startsWith('stream ') || rawKey.startsWith('user_id ') || rawKey.startsWith('dependencies ')) &&
      (!rawVal || rawVal === '')
    ) {
      const parsed = parseFieldString(rawKey, '');
      if (parsed && parsed.key) {
        clean[parsed.key] = parsed.val;
        continue;
      }
    }

    // Normal key/val
    const parsedKey = rawKey.replace(/^\^|\^$/g, '').trim();
    let val = rawVal;
    if (typeof val === 'string') {
      if (val.includes('^') || val.includes('""') || (val.startsWith('{"') && val.includes('\\"'))) {
        val = unescapeCmdString(val);
      }
      if (
        (val.startsWith('{') && val.endsWith('}')) ||
        (val.startsWith('[') && val.endsWith(']'))
      ) {
        try {
          val = JSON.parse(val);
        } catch {}
      }
    }
    clean[parsedKey] = val;
  }
  return clean;
}

/**
 * Directly extracts multipart form fields from raw text before shell tokenization.
 * Works seamlessly on Chrome DevTools cURL exports with WebKitFormBoundary.
 */
export function extractMultipartDirectly(text: string): Record<string, any> | null {
  // Fast check: verify text has multipart indicators
  if (!/boundary|WebKitFormBoundary|Content-Disposition:\s*form-data/i.test(text)) {
    return null;
  }

  // 1. Check if Content-Type header specifies boundary
  const ctBoundary = text.match(/boundary=["']?([A-Za-z0-9_\-\.]+)/i);
  let boundaryCore = ctBoundary ? ctBoundary[1].replace(/^-+/, '') : '';

  // 2. Otherwise check for WebKitFormBoundary or standard dashed boundary
  if (!boundaryCore) {
    const webkitMatch = text.match(/WebKitFormBoundary[A-Za-z0-9_\-]+/);
    if (webkitMatch) {
      boundaryCore = webkitMatch[0];
    } else {
      const dashedMatch = text.match(/-{4,}([A-Za-z0-9_\-]{8,})/);
      if (dashedMatch) {
        boundaryCore = dashedMatch[1];
      }
    }
  }

  if (!boundaryCore) return null;

  const parts = text.split(new RegExp('-*' + boundaryCore + '(?:--)?'));
  const fields: Record<string, any> = {};

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || trimmed === '--') continue;

    const nameMatch = trimmed.match(
      /Content-Disposition:\s*form-data;\s*name=["'\\^]*([^"'\\^;\r\n]+)["'\\^]*/i
    );
    if (!nameMatch) continue;

    const fieldName = nameMatch[1].trim();

    // Value lines follow the Content-Disposition (and optional Content-Type) headers
    const lines = trimmed.split(/\r?\n/);
    const valLines: string[] = [];
    let headersPassed = false;

    for (const line of lines) {
      const cleanLine = line.trim().replace(/^\^|\^$/g, '');
      if (!headersPassed) {
        if (
          cleanLine.toLowerCase().startsWith('content-disposition') ||
          cleanLine.toLowerCase().startsWith('content-type') ||
          !cleanLine
        ) {
          continue;
        } else {
          headersPassed = true;
          valLines.push(cleanLine);
        }
      } else {
        valLines.push(cleanLine);
      }
    }

    let val: any = valLines.join('\n').trim().replace(/^\^|\^$/g, '');

    // Unescape Windows CMD carets and quotes in field value
    val = unescapeCmdString(val);

    if (typeof val === 'string') {
      const lower = val.toLowerCase().trim();
      if (lower === 'true') val = true;
      else if (lower === 'false') val = false;
      else if (
        (val.startsWith('{') && val.endsWith('}')) ||
        (val.startsWith('[') && val.endsWith(']'))
      ) {
        try {
          val = JSON.parse(val);
        } catch {
          // Keep string if JSON parse fails
        }
      }
    }

    fields[fieldName] = val;
  }

  return Object.keys(fields).length > 0 ? fields : null;
}

/**
 * Directly extracts raw payload arguments (--data-raw, --data-binary, --data, -d)
 * directly from cURL command text before shell tokenization.
 * This guarantees massive payloads (88,000+ characters) are never truncated
 * by embedded quotes or line splits.
 */
export function extractRawDataPayload(text: string): string | null {
  const flagRegex = /(?:^|\s)(?:--data-raw|--data-binary|--data-ascii|--data|-d)\s+/g;
  const matches = [...text.matchAll(flagRegex)];
  if (matches.length === 0) return null;

  if (matches.length === 1) {
    const match = matches[0];
    const dataStartIdx = (match.index || 0) + match[0].length;
    let rawData = text.slice(dataStartIdx).trim();

    let quoteType = 'NONE';
    if (rawData.startsWith('^"')) {
      quoteType = 'CMD_DOUBLE';
      rawData = rawData.slice(2);
    } else if (rawData.startsWith('$"')) {
      quoteType = 'BASH_DOUBLE';
      rawData = rawData.slice(2);
    } else if (rawData.startsWith("$'")) {
      quoteType = 'BASH_SINGLE';
      rawData = rawData.slice(2);
    } else if (rawData.startsWith('"')) {
      quoteType = 'DOUBLE';
      rawData = rawData.slice(1);
    } else if (rawData.startsWith("'")) {
      quoteType = 'SINGLE';
      rawData = rawData.slice(1);
    }

    if (quoteType === 'CMD_DOUBLE') {
      const endMatch = rawData.match(/[\^\\]*\"(?:\s*[\r\n]+\s*|\s+)-(?:[a-zA-Z]|-)/);
      if (endMatch && endMatch.index !== undefined) {
        rawData = rawData.slice(0, endMatch.index);
      } else {
        rawData = rawData.replace(/[\^\\]*\"[\^]?\s*$/, '');
      }
    } else if (quoteType === 'SINGLE' || quoteType === 'BASH_SINGLE') {
      const endMatch = rawData.match(/'(?:\s*[\r\n]+\s*|\s+)-(?:[a-zA-Z]|-)/);
      if (endMatch && endMatch.index !== undefined) {
        rawData = rawData.slice(0, endMatch.index);
      } else {
        rawData = rawData.replace(/'\s*$/, '');
      }
    } else if (quoteType === 'DOUBLE' || quoteType === 'BASH_DOUBLE') {
      const endMatch = rawData.match(/(?<!\\)"(?:\s*[\r\n]+\s*|\s+)-(?:[a-zA-Z]|-)/);
      if (endMatch && endMatch.index !== undefined) {
        rawData = rawData.slice(0, endMatch.index);
      } else {
        rawData = rawData.replace(/(?<!\\)"\s*$/, '');
      }
    }

    return rawData.trim();
  }

  // Multiple data flags e.g. -d "a=1" -d "b=2"
  const chunks: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const startIdx = (matches[i].index || 0) + matches[i][0].length;
    const endIdx = i < matches.length - 1 ? (matches[i + 1].index || text.length) : text.length;
    let chunk = text.slice(startIdx, endIdx).trim();
    chunk = chunk.replace(/^[\^]?"|[\^]?"$/g, '').replace(/^'|'$/g, '');
    chunks.push(chunk);
  }

  return chunks.join('&');
}

/**
 * Shell tokenizer that preserves newlines inside quotes.
 */
function tokenize(str: string): string[] {
  const args: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escaped = false;

  // Only normalize line continuations with backslash or caret at line end
  const normalized = str
    .replace(/\\\r?\n/g, ' ')
    .replace(/`\r?\n/g, ' ')
    .replace(/\^\r?\n/g, ' ');

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      escaped = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (/\s/.test(char) && !inSingleQuote && !inDoubleQuote) {
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

/**
 * Parses a cURL command, raw browser DevTools "Form Data" text, or JSON payload.
 */
export function parseCurlOrInspect(input: string): ParsedRequest | null {
  let text = (input || '').trim();
  if (!text) return null;

  // -------------------------------------------------------------
  // Case 1: Pure JSON text (with auto-repair for mangled keys)
  // -------------------------------------------------------------
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      const repaired = repairMangledFields(parsed);
      const isMultipart = Object.keys(repaired).some(
        (k) => k === 'message' || k === 'dependencies' || k === 'stream' || k === 'session_id'
      );

      return {
        url: '',
        method: 'POST',
        headers: { 'Content-Type': isMultipart ? 'multipart/form-data' : 'application/json' },
        body: repaired,
        body_type: isMultipart ? 'MULTIPART_FORM_DATA' : 'JSON',
        source: 'json',
        detectedFieldsCount: Object.keys(repaired).length
      };
    } catch {
      // Continue to other checks
    }
  }

  // -------------------------------------------------------------
  // Priority Check: Direct Multipart Boundary Extraction
  // (Chrome DevTools cURL exports have WebKitFormBoundary)
  // -------------------------------------------------------------
  const directMultipartFields = extractMultipartDirectly(text);

  // -------------------------------------------------------------
  // Case 2: Raw DevTools "Form Data" Key-Value Lines
  // -------------------------------------------------------------
  if (!text.toLowerCase().startsWith('curl') && !directMultipartFields) {
    const rawEntries = text.includes('\n')
      ? text.split(/\r?\n/)
      : text.split('&');

    const formDict: Record<string, any> = {};
    let validCount = 0;

    for (const rawLine of rawEntries) {
      const line = rawLine.trim();
      if (!line || /^(form data|view source|view decoded|payload)$/i.test(line)) {
        continue;
      }

      const parsedField = parseFieldString(line, '');
      if (parsedField && parsedField.key) {
        formDict[parsedField.key] = parsedField.val;
        validCount++;
      }
    }

    if (validCount > 0) {
      return {
        url: '',
        method: 'POST',
        headers: {},
        body: formDict,
        body_type: 'MULTIPART_FORM_DATA',
        source: 'devtools_form',
        detectedFieldsCount: Object.keys(formDict).length
      };
    }
  }

  // -------------------------------------------------------------
  // Case 3: cURL Command (bash / cmd / powershell)
  // -------------------------------------------------------------
  const directRawData = extractRawDataPayload(text);
  const cleanedText = cleanCmdCarets(text);
  const tokens = tokenize(cleanedText);
  if (tokens.length === 0 && !directMultipartFields && !directRawData) return null;

  let url = '';
  let method = '';
  const headers: Record<string, string> = {};
  const formData: Record<string, any> = {};
  let rawBody: any = directRawData;
  let isMultipart = Boolean(directMultipartFields);
  let isUrlEncoded = false;

  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i].trim().replace(/^\^|\^$/g, '');

    // Method flag
    if (token === '-X' || token === '--request') {
      method = (tokens[++i] || '').trim().replace(/^['"\^]|['"\^]$/g, '').toUpperCase();
      continue;
    }

    // Header flag: -H or --header
    if (token === '-H' || token === '--header') {
      let headerStr = (tokens[++i] || '').trim().replace(/^['"\^]|['"\^]$/g, '');
      headerStr = headerStr.replace(/^\^|\^$/g, '');
      const colonIdx = headerStr.indexOf(':');
      if (colonIdx > -1) {
        const hKey = headerStr.slice(0, colonIdx).trim().replace(/^\^|\^$/g, '');
        const hVal = headerStr.slice(colonIdx + 1).trim().replace(/^\^|\^$/g, '');

        if (hKey.toLowerCase() === 'content-type') {
          if (hVal.toLowerCase().includes('multipart/form-data')) {
            isMultipart = true;
            continue;
          } else if (hVal.toLowerCase().includes('application/x-www-form-urlencoded')) {
            isUrlEncoded = true;
          }
        }

        if (hKey) {
          headers[hKey] = hVal;
        }
      }
      continue;
    }

    // Form data flag: -F or --form
    if (token === '-F' || token === '--form') {
      isMultipart = true;
      const formPair = (tokens[++i] || '').trim().replace(/^['"\^]|['"\^]$/g, '');
      const parsed = parseFieldString(formPair);
      if (parsed && parsed.key) {
        formData[parsed.key] = parsed.val;
      }
      continue;
    }

    // Data flags: -d, --data, --data-raw, --data-binary, --data-ascii
    if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii'].includes(token)) {
      if (rawBody === null) {
        rawBody = (tokens[++i] || '').trim();
      } else {
        i++;
      }
      continue;
    }

    // URL detection
    if (
      !token.startsWith('-') &&
      !['curl', 'curl.exe', '--%'].includes(token.toLowerCase())
    ) {
      if (!url && (token.includes('://') || token.startsWith('http') || token.startsWith('^http'))) {
        url = token.replace(/^['"\^]+|['"\^]+$/g, '').trim();
      }
    }
  }

  if (!method) {
    method = isMultipart || rawBody !== null || Object.keys(formData).length > 0 ? 'POST' : 'GET';
  }

  // Determine final body:
  // If direct multipart extraction succeeded, prioritize it
  let body: any = directMultipartFields || null;
  let bodyType: 'JSON' | 'MULTIPART_FORM_DATA' | 'FORM_URLENCODED' = directMultipartFields
    ? 'MULTIPART_FORM_DATA'
    : 'JSON';

  if (!body) {
    if (isMultipart || Object.keys(formData).length > 0) {
      body = formData;
      bodyType = 'MULTIPART_FORM_DATA';
    } else if (rawBody !== null) {
      const unescapedRaw = unescapeCmdString(rawBody);
      let parsed: any = null;
      try {
        parsed = JSON.parse(unescapedRaw);
      } catch {
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          parsed = null;
        }
      }

      if (parsed !== null && typeof parsed === 'object') {
        body = repairMangledFields(parsed);
        bodyType = 'JSON';
      } else {
        const parts = unescapedRaw.includes('&') ? unescapedRaw.split('&') : unescapedRaw.split('\n');
        const parsedItems: Record<string, any> = {};
        let parsedCount = 0;

        for (const p of parts) {
          const item = p.trim();
          if (!item) continue;
          const f = parseFieldString(item);
          if (f && f.key) {
            parsedItems[f.key] = f.val;
            parsedCount++;
          }
        }

        if (parsedCount > 1 || (parsedCount === 1 && isUrlEncoded && !unescapedRaw.includes('{'))) {
          body = parsedItems;
          bodyType = isUrlEncoded ? 'FORM_URLENCODED' : 'MULTIPART_FORM_DATA';
        } else {
          body = unescapedRaw || rawBody;
          bodyType = isUrlEncoded ? 'FORM_URLENCODED' : 'JSON';
        }
      }
    }
  }

  const fieldsCount = body && typeof body === 'object' ? Object.keys(body).length : (body ? 1 : 0);

  return {
    url,
    method,
    headers,
    body,
    body_type: bodyType,
    source: 'curl',
    detectedFieldsCount: fieldsCount,
    rawBodyText: typeof rawBody === 'string' ? rawBody : undefined
  };
}
