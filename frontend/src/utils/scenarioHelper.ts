import { DatasetExecutionStrategy } from '../types';

/**
 * Production-ready utility to group raw matrix/dataset rows into cohesive test scenarios.
 * For conversational and multi-turn workflows (with initial queries/attachments and subsequent follow-up turns),
 * subsequent rows without a new initial message/attachment belong to the preceding scenario session.
 */

export interface ScenarioTurn {
  rowIndex: number;
  rowData: Record<string, any>;
}

export interface GroupedScenario {
  scenarioIndex: number;
  scenarioId: string;
  scenarioTitle: string;
  initialRowIndex: number;
  rows: ScenarioTurn[];
  turns: Record<string, any>[];
  rowData: Record<string, any>;
}

export const groupDatasetIntoScenarios = (
  headers: string[] = [],
  rows: any[] = [],
  strategy?: DatasetExecutionStrategy,
  selectedRowIndices?: number[]
): GroupedScenario[] => {
  if (!rows || rows.length === 0) return [];

  const stratMode = strategy?.mode;
  // Default to FLAT_ROW_BY_ROW unless headers clearly indicate multi-turn followup questions
  let mode: 'FLAT_ROW_BY_ROW' | 'MULTI_TURN' | 'COMBINATORIAL_GRID' = stratMode || 'FLAT_ROW_BY_ROW';
  if (!stratMode) {
    const hasFollowup = headers.some((h) => {
      const lh = h.toLowerCase();
      return lh.includes('follow') || lh.includes('turn');
    });
    if (hasFollowup) {
      mode = 'MULTI_TURN';
    }
  }

  const forwardFill = strategy?.forward_fill_blanks ?? true;

  const rowToDict = (r: any): Record<string, any> => {
    const dict: Record<string, any> = {};
    if (r && typeof r === 'object' && !Array.isArray(r)) {
      Object.assign(dict, r);
    } else if (Array.isArray(r)) {
      headers.forEach((h, i) => {
        dict[h] = i < r.length ? r[i] : '';
      });
    }
    // Also populate lowercase keys for case-insensitive lookup
    Object.keys(dict).forEach((k) => {
      const lk = k.toLowerCase().trim();
      if (!(lk in dict)) {
        dict[lk] = dict[k];
      }
    });
    return dict;
  };

  // STRATEGY 1: FLAT_ROW_BY_ROW (Every row executes independently)
  if (mode === 'FLAT_ROW_BY_ROW') {
    const scenarios: GroupedScenario[] = [];
    const lastSeen: Record<string, any> = {};

    rows.forEach((rawRow, rIdx) => {
      const rDict = rowToDict(rawRow);

      if (forwardFill) {
        headers.forEach((h) => {
          const val = rDict[h];
          if (val !== null && val !== undefined && String(val).trim().length > 0) {
            lastSeen[h] = val;
          } else if (h in lastSeen) {
            rDict[h] = lastSeen[h];
            const lh = String(h).toLowerCase().trim();
            rDict[lh] = lastSeen[h];
          }
        });
      }

      if (selectedRowIndices && selectedRowIndices.length > 0 && !selectedRowIndices.includes(rIdx)) {
        return;
      }

      const scIdx = scenarios.length + 1;
      const titleParts: string[] = [];

      for (const col of ['TEST ID', 'test_id', 'Test ID', 'TEST CASE NAME', 'test_case_name', 'Test Case Name', 'scenario', 'Scenario', 'query', 'message']) {
        if (rDict[col] && String(rDict[col]).trim().length > 0) {
          titleParts.push(String(rDict[col]).trim());
          break;
        }
      }

      for (const compCol of ['COMPANY', 'company', 'Company', 'org', 'Organization']) {
        if (rDict[compCol] && String(rDict[compCol]).trim().length > 0) {
          titleParts.push(`(${rDict[compCol]})`);
          break;
        }
      }

      const scenarioTitle = titleParts.length > 0 ? titleParts.join(' ') : `Scenario #${scIdx}`;

      scenarios.push({
        scenarioIndex: scIdx,
        scenarioId: `scenario-${scIdx}`,
        scenarioTitle,
        initialRowIndex: rIdx,
        rows: [{ rowIndex: rIdx + 1, rowData: rDict }],
        turns: [rDict],
        rowData: rDict,
      });
    });

    return scenarios;
  }

  // STRATEGY 2: MULTI_TURN (Sage chat pattern or explicit group key)
  const explicitGroupCol = strategy?.group_by_column;
  let scenarioCol: string | null = null;
  if (explicitGroupCol && headers.includes(explicitGroupCol)) {
    scenarioCol = explicitGroupCol;
  } else {
    for (const h of headers) {
      const clean = h.toLowerCase().replace(/[_ -]/g, '');
      if (['scenario', 'scenarioid', 'scenarioname', 'testcase', 'caseid', 'sessionid', 'conversationid'].includes(clean)) {
        scenarioCol = h;
        break;
      }
    }
  }

  const primaryCols: string[] = [];
  const followupCols: string[] = [];
  const attachmentCols: string[] = [];

  headers.forEach((h) => {
    const lh = h.toLowerCase().replace(/[_ -]/g, '');
    if (lh.includes('follow') || lh.includes('turn')) {
      followupCols.push(h);
    } else if (lh.includes('attach') || lh.includes('file') || lh.includes('doc')) {
      attachmentCols.push(h);
    } else if (['message', 'query', 'prompt', 'input', 'question', 'text', 'userquery'].some((k) => lh.includes(k))) {
      primaryCols.push(h);
    }
  });

  if (primaryCols.length === 0 && headers.length > 0) {
    primaryCols.push(headers[0]);
  }

  const scenarios: GroupedScenario[] = [];
  let currentScenario: GroupedScenario | null = null;

  rows.forEach((rawRow, rIdx) => {
    const rDict = rowToDict(rawRow);

    let isNewScenario = false;

    if (scenarioCol) {
      const scVal = String(rDict[scenarioCol] ?? '').trim();
      if (!currentScenario || scVal !== currentScenario.scenarioId) {
        isNewScenario = true;
      }
    } else {
      if (!currentScenario) {
        isNewScenario = true;
      } else {
        const hasPrimaryContent = primaryCols.some((col) => String(rDict[col] ?? '').trim().length > 0);
        const hasAttachmentContent = attachmentCols.some((col) => String(rDict[col] ?? '').trim().length > 0);

        if (hasPrimaryContent || hasAttachmentContent) {
          isNewScenario = true;
        } else {
          isNewScenario = false;
        }
      }
    }

    if (isNewScenario) {
      const scIdx = scenarios.length + 1;
      let title = '';

      for (const col of primaryCols) {
        const val = String(rDict[col] ?? '').trim();
        if (val) {
          title = val;
          break;
        }
      }
      if (!title) {
        for (const col of followupCols) {
          const val = String(rDict[col] ?? '').trim();
          if (val) {
            title = val;
            break;
          }
        }
      }
      if (!title) {
        title = `Scenario #${scIdx}`;
      }

      currentScenario = {
        scenarioIndex: scIdx,
        scenarioId: scenarioCol ? String(rDict[scenarioCol]) : `scenario-${scIdx}`,
        scenarioTitle: title,
        initialRowIndex: rIdx,
        rows: [],
        turns: [],
        rowData: rDict,
      };
      scenarios.push(currentScenario);
    }

    if (currentScenario) {
      currentScenario.rows.push({
        rowIndex: rIdx + 1,
        rowData: rDict,
      });
      currentScenario.turns.push(rDict);
    }
  });

  if (selectedRowIndices && selectedRowIndices.length > 0) {
    const filtered = scenarios.filter((sc) =>
      (sc.rows || []).some((r) => selectedRowIndices.includes(r.rowIndex - 1))
    );
    filtered.forEach((sc, idx) => {
      sc.scenarioIndex = idx + 1;
    });
    return filtered;
  }

  return scenarios;
};
