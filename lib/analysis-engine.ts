import {
  DatasetColumn,
  AnalysisContract,
  AnalysisAssumptions,
  CalculationResult,
  VerificationRun,
  VerificationStatus,
} from './types';

interface DatasetData {
  columns: DatasetColumn[];
  rows: Record<string, number | string | null>[];
  name: string;
}

// ---------------------------------------------------------------------------
// Binary/categorical value pairs the engine recognises
// ---------------------------------------------------------------------------
const BINARY_PAIRS: [string, string][] = [
  ['true', 'false'],
  ['yes', 'no'],
  ['pass', 'fail'],
  ['passed', 'failed'],
  ['positive', 'negative'],
  ['approved', 'rejected'],
  ['valid', 'invalid'],
  ['success', 'failure'],
  ['completed', 'failed'],
  ['active', 'inactive'],
  ['open', 'closed'],
];

// ---------------------------------------------------------------------------
// Column finder (case-insensitive, partial match)
// ---------------------------------------------------------------------------
function findColumn(columns: DatasetColumn[], name: string): DatasetColumn | undefined {
  const lower = name.toLowerCase();
  return columns.find(
    (c) =>
      c.name.toLowerCase() === lower ||
      c.name.toLowerCase().replace(/[\s_]/g, '') === lower.replace(/[\s_]/g, '') ||
      c.name.toLowerCase().includes(lower) ||
      lower.includes(c.name.toLowerCase())
  );
}

// ---------------------------------------------------------------------------
// Get all unique raw string values from a column across ALL rows
// (samples may be coerced to 0/1 for booleans — we need the real strings)
// ---------------------------------------------------------------------------
function getColumnUniqueValues(
  colName: string,
  rows: Record<string, number | string | null>[]
): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    const v = row[colName];
    if (v !== null && v !== undefined && v !== '') {
      seen.add(String(v).toLowerCase().trim());
    }
  }
  return Array.from(seen);
}

// ---------------------------------------------------------------------------
// Detect if the question is asking about a specific categorical value
// Returns { column, value, rawValue } or null
// rawValue is the actual value as it appears in the data
// ---------------------------------------------------------------------------
function detectCategoricalIntent(
  question: string,
  columns: DatasetColumn[],
  rows: Record<string, number | string | null>[]
): { column: string; value: string; rawValue: string } | null {
  const lower = question.toLowerCase();
  const stringCols = columns.filter((c) => c.type === 'string' || c.type === 'boolean');

  // 1. Check known binary pairs against actual row data
  for (const [pos, neg] of BINARY_PAIRS) {
    const matched = lower.includes(pos) ? pos : lower.includes(neg) ? neg : null;
    if (!matched) continue;

    for (const col of stringCols) {
      const uniqueVals = getColumnUniqueValues(col.name, rows);
      // Find the actual value in the data that matches the keyword
      const rawMatch = uniqueVals.find((v) => v === matched || v.startsWith(matched));
      if (rawMatch) {
        return { column: col.name, value: matched, rawValue: rawMatch };
      }
      // If column has both pos and neg values, it's the right column even if sample didn't match
      const hasPos = uniqueVals.some((v) => v === pos || v.startsWith(pos));
      const hasNeg = uniqueVals.some((v) => v === neg || v.startsWith(neg));
      if (hasPos || hasNeg) {
        return { column: col.name, value: matched, rawValue: matched };
      }
    }

    // Also check boolean columns (stored as 0/1) — map true→1, false→0
    const boolCols = columns.filter((c) => c.type === 'boolean');
    for (const col of boolCols) {
      const numericVal = matched === 'true' || matched === 'yes' || matched === 'pass' || matched === 'passed' || matched === 'positive' || matched === 'approved' || matched === 'valid' || matched === 'success' || matched === 'completed' || matched === 'active' || matched === 'open' ? '1' : '0';
      return { column: col.name, value: numericVal, rawValue: numericVal };
    }
  }

  // 2. Check actual unique values from all rows against the question
  for (const col of stringCols) {
    const uniqueVals = getColumnUniqueValues(col.name, rows);
    for (const uv of uniqueVals) {
      if (uv.length > 1 && lower.includes(uv)) {
        return { column: col.name, value: uv, rawValue: uv };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Detect aggregation intent
// ---------------------------------------------------------------------------
function findAggregation(question: string): string {
  const lower = question.toLowerCase();
  if (
    lower.includes('recently added') || lower.includes('what are the') ||
    lower.includes('list') || lower.includes('show me all') ||
    lower.includes('what products') || lower.includes('which products are')
  ) return 'LIST';
  if (lower.includes('average') || lower.includes('mean') || lower.includes('avg')) return 'AVG';
  if (lower.includes('percent') || lower.includes('percentage') || lower.includes('ratio') || lower.includes('proportion')) return 'PCT';
  if (lower.includes('count') || lower.includes('how many') || lower.includes('number of')) return 'COUNT';
  if (lower.includes('max') || lower.includes('maximum') || lower.includes('highest') || lower.includes('largest') || lower.includes('most') || lower.includes('top')) return 'MAX';
  if (lower.includes('min') || lower.includes('minimum') || lower.includes('lowest') || lower.includes('smallest') || lower.includes('least')) return 'MIN';
  if (lower.includes('median')) return 'MEDIAN';
  return 'SUM';
}

// ---------------------------------------------------------------------------
// Find the numeric column the question is about
// ---------------------------------------------------------------------------
function findMetricColumn(
  question: string,
  columns: DatasetColumn[],
  aggregation: string,
  rows: Record<string, number | string | null>[]
): string | null {
  const lower = question.toLowerCase();
  const numericCols = columns.filter((c) => c.type === 'number' || c.type === 'currency');

  // If it's a pure count/percentage of categorical values, no numeric column needed
  if (aggregation === 'COUNT' || aggregation === 'PCT') {
    const catIntent = detectCategoricalIntent(question, columns, rows);
    if (catIntent) return null;
  }

  // Try to match a column name mentioned in the question
  for (const col of numericCols) {
    if (lower.includes(col.name.toLowerCase())) return col.name;
  }

  // Keyword → column name mapping
  const keywordMap: Record<string, string[]> = {
    revenue: ['revenue', 'sales', 'income', 'turnover'],
    amount: ['amount', 'total', 'value'],
    quantity: ['quantity', 'qty', 'units'],
    price: ['price', 'unitprice', 'rate', 'cost'],
    profit: ['profit', 'margin', 'gain'],
    expense: ['expense', 'cost', 'spend'],
  };
  for (const col of numericCols) {
    const colLower = col.name.toLowerCase();
    for (const aliases of Object.values(keywordMap)) {
      if (aliases.some((a) => colLower.includes(a)) && aliases.some((a) => lower.includes(a))) {
        return col.name;
      }
    }
  }

  // For SUM/AVG/MAX/MIN — fall back to first numeric column
  if (['SUM', 'AVG', 'MAX', 'MIN', 'MEDIAN'].includes(aggregation) && numericCols.length > 0) {
    return numericCols[0].name;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Find GROUP BY column
// ---------------------------------------------------------------------------
function findGroupBy(question: string, columns: DatasetColumn[]): string | null {
  const lower = question.toLowerCase();
  const stringCols = columns.filter((c) => c.type === 'string');

  const dimensionKeywords = ['by', 'per', 'for each', 'across', 'among'];
  for (const kw of dimensionKeywords) {
    const idx = lower.indexOf(kw);
    if (idx >= 0) {
      const after = lower.slice(idx + kw.length).trim();
      for (const col of stringCols) {
        if (after.startsWith(col.name.toLowerCase())) return col.name;
      }
    }
  }

  const directMatches: Record<string, string[]> = {
    product: ['Product', 'Item', 'Name'],
    region: ['Region', 'City', 'State', 'Location'],
    category: ['Category', 'Type', 'Segment'],
    channel: ['Channel', 'Source'],
    customer: ['CustomerType', 'Customer'],
    month: ['Date', 'Month'],
  };
  for (const [keyword, colNames] of Object.entries(directMatches)) {
    if (lower.includes(`by ${keyword}`) || lower.includes(`per ${keyword}`) || lower.includes(`each ${keyword}`)) {
      for (const cn of colNames) {
        const col = findColumn(columns, cn);
        if (col) return col.name;
      }
    }
  }

  if (lower.includes('which ')) {
    for (const col of stringCols) {
      if (lower.includes(col.name.toLowerCase())) return col.name;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Find filters — only add filters that are clearly supported by actual data
// ---------------------------------------------------------------------------
function findFilters(
  question: string,
  columns: DatasetColumn[],
  rows: Record<string, number | string | null>[]
): { column: string; operator: string; value: string }[] {
  const filters: { column: string; operator: string; value: string }[] = [];
  const lower = question.toLowerCase();

  // Year filters
  const yearMatch = lower.match(/in (20\d{2})/);
  if (yearMatch) {
    const dateCol = columns.find((c) => c.type === 'date');
    if (dateCol) filters.push({ column: dateCol.name, operator: 'year', value: yearMatch[1] });
  }

  // Date range filters
  const rangeMatch = lower.match(/between (\d{4}-\d{2}-\d{2}).*(\d{4}-\d{2}-\d{2})/);
  if (rangeMatch) {
    const dateCol = columns.find((c) => c.type === 'date');
    if (dateCol) filters.push({ column: dateCol.name, operator: 'range', value: `${rangeMatch[1]},${rangeMatch[2]}` });
  }

  // Match actual unique values from rows against the question
  const stringCols = columns.filter((c) => c.type === 'string');
  for (const col of stringCols) {
    if (filters.some((f) => f.column === col.name)) continue;
    const uniqueVals = getColumnUniqueValues(col.name, rows);
    for (const uv of uniqueVals) {
      if (uv.length > 1 && lower.includes(uv)) {
        filters.push({ column: col.name, operator: '=', value: uv });
        break;
      }
    }
  }

  // Fallback: column-name-based patterns
  for (const col of stringCols) {
    if (filters.some((f) => f.column === col.name)) continue;
    const patterns = [
      new RegExp(`in ${col.name.toLowerCase()} (\\w+)`, 'i'),
      new RegExp(`for ${col.name.toLowerCase()} (\\w+)`, 'i'),
      new RegExp(`${col.name.toLowerCase()} is (\\w+)`, 'i'),
      new RegExp(`where ${col.name.toLowerCase()} (\\w+)`, 'i'),
    ];
    for (const pat of patterns) {
      const m = lower.match(pat);
      if (m?.[1]) {
        filters.push({ column: col.name, operator: '=', value: m[1] });
        break;
      }
    }
  }

  // CustomerType shortcuts
  if (lower.includes('returning')) {
    const col = findColumn(columns, 'CustomerType') || findColumn(columns, 'Customer');
    if (col && !filters.some((f) => f.column === col.name))
      filters.push({ column: col.name, operator: '=', value: 'Returning' });
  }
  if (lower.includes('new customer')) {
    const col = findColumn(columns, 'CustomerType') || findColumn(columns, 'Customer');
    if (col && !filters.some((f) => f.column === col.name))
      filters.push({ column: col.name, operator: '=', value: 'New' });
  }

  return filters;
}

// ---------------------------------------------------------------------------
// Ambiguity detection
// ---------------------------------------------------------------------------
function detectAmbiguity(
  question: string,
  metricColumn: string | null,
  aggregation: string,
  columns: DatasetColumn[],
  rows: Record<string, number | string | null>[]
): string {
  if (aggregation === 'LIST') return 'None';
  const catIntent = detectCategoricalIntent(question, columns, rows);
  if (aggregation === 'COUNT' || aggregation === 'PCT') {
    if (catIntent || columns.length > 0) return 'None';
  }
  if (!metricColumn && !catIntent) {
    return 'No numeric column found to calculate. Please specify a metric.';
  }
  const currencyCols = columns.filter((c) => c.type === 'currency');
  if (currencyCols.length > 1) {
    return 'Multiple currency columns detected. Confirm which currency to use.';
  }
  return 'None';
}

export function generateAnalysisContract(
  question: string,
  dataset: DatasetData
): AnalysisContract {
  const aggregation = findAggregation(question);
  const groupBy = findGroupBy(question, dataset.columns);
  const filters = findFilters(question, dataset.columns, dataset.rows);
  const catIntent = detectCategoricalIntent(question, dataset.columns, dataset.rows);
  const metricColumn = findMetricColumn(question, dataset.columns, aggregation, dataset.rows);
  const ambiguity = detectAmbiguity(question, metricColumn, aggregation, dataset.columns, dataset.rows);

  let metric: string;
  let targetColumn: string | undefined;

  if (catIntent && (aggregation === 'COUNT' || aggregation === 'PCT')) {
    metric = `${aggregation === 'PCT' ? 'Percentage' : 'Count'} of ${catIntent.value} in ${catIntent.column}`;
    targetColumn = undefined;
    // Add the categorical filter using the rawValue (actual data value)
    if (!filters.some((f) => f.column === catIntent.column)) {
      filters.push({ column: catIntent.column, operator: '=', value: catIntent.rawValue });
    }
  } else if (metricColumn) {
    metric = metricColumn;
    targetColumn = metricColumn;
  } else {
    metric = 'RowCount';
    targetColumn = undefined;
  }

  return {
    question,
    metric,
    aggregation,
    filters,
    groupBy: groupBy || undefined,
    dimension: groupBy || undefined,
    ambiguity,
    targetColumn,
  };
}

export function generateAssumptions(
  contract: AnalysisContract,
  dataset: DatasetData
): AnalysisAssumptions {
  const currencyCol = dataset.columns.find((c) => c.type === 'currency');
  const dateCol = dataset.columns.find((c) => c.type === 'date');

  // Only claim currency if the target column is actually a currency column
  const targetIsCurrency = contract.targetColumn
    ? dataset.columns.find((c) => c.name === contract.targetColumn)?.type === 'currency'
    : false;

  const excludedRecords: string[] = [];
  if (contract.filters.length === 0) {
    excludedRecords.push('No filters applied — all rows included');
  } else {
    contract.filters.forEach((f) => excludedRecords.push(`Filter: ${f.column} ${f.operator} '${f.value}'`));
  }

  let formula: string;
  if (contract.aggregation === 'LIST') {
    formula = `SELECT * FROM ${dataset.name} ORDER BY date DESC LIMIT 10`;
  } else if (contract.aggregation === 'PCT') {
    formula = `COUNT(${contract.metric}) / COUNT(*) × 100`;
  } else if (contract.aggregation === 'COUNT') {
    formula = contract.targetColumn ? `COUNT(${contract.targetColumn})` : `COUNT(*)`;
  } else {
    formula = `${contract.aggregation}(${contract.metric})`;
  }

  return {
    currency: targetIsCurrency ? 'INR (₹)' : 'Not applicable',
    dateInterpretation: dateCol ? 'YYYY-MM-DD format' : 'No date columns',
    excludedRecords,
    aggregation: contract.aggregation,
    missingValueTreatment: 'Rows with null values in the target column are excluded',
    formula,
  };
}

function applyFilters(
  rows: Record<string, number | string | null>[],
  filters: { column: string; operator: string; value: string }[]
): Record<string, number | string | null>[] {
  if (filters.length === 0) return rows;
  return rows.filter((row) => {
    return filters.every((f) => {
      const val = row[f.column];
      if (val === null || val === undefined || val === '') return false;
      if (f.operator === '=') {
        // Compare as lowercase strings — handles both string and numeric stored values
        return String(val).toLowerCase().trim() === f.value.toLowerCase().trim();
      }
      if (f.operator === 'year') {
        const date = new Date(String(val));
        return !isNaN(date.getTime()) && String(date.getFullYear()) === f.value;
      }
      if (f.operator === 'range') {
        const [start, end] = f.value.split(',');
        const date = new Date(String(val));
        return date >= new Date(start) && date <= new Date(end);
      }
      return true;
    });
  });
}

// PRIMARY CALCULATION: Iterative approach (simulating SQL aggregation)
function primaryCalculation(
  contract: AnalysisContract,
  dataset: DatasetData
): CalculationResult {
  const filteredRows = applyFilters(dataset.rows, contract.filters);
  const targetCol = contract.targetColumn || '';
  const groupBy = contract.groupBy;
  const agg = contract.aggregation;

  // --- LIST: return raw rows sorted by date desc ---
  if (agg === 'LIST') {
    const dateCol = dataset.columns.find((c) => c.type === 'date')?.name;
    const sorted = dateCol
      ? [...filteredRows].sort((a, b) => String(b[dateCol]).localeCompare(String(a[dateCol])))
      : filteredRows;
    const top10 = sorted.slice(0, 10);
    const code =
      `-- Primary SQL-style calculation\n` +
      `SELECT * FROM ${dataset.name}\n` +
      (dateCol ? `ORDER BY ${dateCol} DESC\n` : '') +
      `LIMIT 10;`;
    return {
      value: top10,
      code,
      method: 'SQL Row Listing',
      rowsUsed: filteredRows.length,
      details: { aggregation: 'LIST', returned: top10.length },
    };
  }

  // --- PERCENTAGE of filtered rows vs total ---
  if (agg === 'PCT') {
    const total = dataset.rows.length;
    const matching = filteredRows.length;
    const pct = total > 0 ? (matching / total) * 100 : 0;
    const filterDesc = contract.filters.map((f) => `${f.column} = '${f.value}'`).join(' AND ');
    const code =
      `-- Primary SQL-style calculation\n` +
      `SELECT COUNT(*) * 100.0 / (SELECT COUNT(*) FROM ${dataset.name}) AS percentage\n` +
      `FROM ${dataset.name}\n` +
      (filterDesc ? `WHERE ${filterDesc};` : ';');
    return {
      value: Math.round(pct * 10000) / 10000,
      code,
      method: 'SQL Percentage Calculation',
      rowsUsed: total,
      details: { matching, total, aggregation: 'PCT' },
    };
  }

  // --- COUNT of filtered rows (categorical filter count) ---
  if (agg === 'COUNT' && !targetCol) {
    const count = filteredRows.length;
    const filterDesc = contract.filters.map((f) => `${f.column} = '${f.value}'`).join(' AND ');
    const code =
      `-- Primary SQL-style calculation\n` +
      `SELECT COUNT(*) FROM ${dataset.name}\n` +
      (filterDesc ? `WHERE ${filterDesc};` : ';');
    return {
      value: count,
      code,
      method: 'SQL Iterative Aggregation',
      rowsUsed: filteredRows.length,
      details: { aggregation: 'COUNT' },
    };
  }

  // --- GROUP BY numeric aggregation ---
  if (groupBy) {
    const groups = new Map<string, number[]>();
    for (const row of filteredRows) {
      const key = String(row[groupBy] || 'Unknown');
      const val = Number(row[targetCol]);
      if (!isNaN(val)) {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(val);
      }
    }

    let code = `-- Primary SQL-style calculation\n`;
    code += `SELECT ${groupBy}, ${agg}(${targetCol})\n`;
    code += `FROM ${dataset.name}\n`;
    if (contract.filters.length > 0) {
      code += `WHERE ${contract.filters.map((f) => `${f.column} ${f.operator} '${f.value}'`).join(' AND ')}\n`;
    }
    code += `GROUP BY ${groupBy}\nORDER BY ${agg}(${targetCol}) DESC;`;

    const results: { label: string; value: number }[] = [];
    for (const [label, values] of groups) {
      results.push({ label, value: aggregateValues(values, agg) });
    }
    results.sort((a, b) => b.value - a.value);

    return {
      value: results,
      code,
      method: 'SQL Iterative Aggregation',
      rowsUsed: filteredRows.length,
      details: { groupCount: results.length, aggregation: agg },
    };
  }

  // --- Scalar numeric aggregation ---
  const values = filteredRows
    .map((r) => Number(r[targetCol]))
    .filter((v) => !isNaN(v));

  let code = `-- Primary SQL-style calculation\n`;
  code += `SELECT ${agg}(${targetCol})\nFROM ${dataset.name}\n`;
  if (contract.filters.length > 0) {
    code += `WHERE ${contract.filters.map((f) => `${f.column} ${f.operator} '${f.value}'`).join(' AND ')}\n`;
  }
  code += `;`;

  return {
    value: aggregateValues(values, agg),
    code,
    method: 'SQL Iterative Aggregation',
    rowsUsed: filteredRows.length,
    details: { aggregation: agg, count: values.length },
  };
}

// INDEPENDENT CALCULATION: Functional/reduce-based approach (different code path)
function independentCalculation(
  contract: AnalysisContract,
  dataset: DatasetData
): CalculationResult {
  const filteredRows = applyFilters(dataset.rows, contract.filters);
  const targetCol = contract.targetColumn || '';
  const groupBy = contract.groupBy;
  const agg = contract.aggregation;

  // --- LIST ---
  if (agg === 'LIST') {
    const dateCol = dataset.columns.find((c) => c.type === 'date')?.name;
    const sorted = dateCol
      ? [...filteredRows].sort((a, b) => String(b[dateCol]).localeCompare(String(a[dateCol])))
      : filteredRows;
    const top10 = sorted.slice(0, 10);
    const code =
      `# Independent Python/Pandas calculation\nimport pandas as pd\n` +
      `df = pd.read_csv('${dataset.name}')\n` +
      (dateCol ? `result = df.sort_values('${dateCol}', ascending=False).head(10)\n` : `result = df.head(10)\n`) +
      `print(result.to_string())`;
    return {
      value: top10,
      code,
      method: 'Python/Pandas Row Listing',
      rowsUsed: filteredRows.length,
      details: { aggregation: 'LIST', returned: top10.length },
    };
  }

  // --- PERCENTAGE ---
  if (agg === 'PCT') {
    const total = dataset.rows.length;
    const matching = filteredRows.length;
    const pct = total > 0 ? (matching / total) * 100 : 0;
    const filterDesc = contract.filters.map((f) => `df['${f.column}'].str.lower() == '${f.value}'`).join(' & ');
    const code =
      `# Independent Python/Pandas calculation\nimport pandas as pd\n` +
      `df = pd.read_csv('${dataset.name}')\n` +
      (filterDesc ? `mask = ${filterDesc}\nresult = round(mask.sum() / len(df) * 100, 4)\n` : `result = 100.0\n`) +
      `print(result)`;
    return {
      value: Math.round(pct * 10000) / 10000,
      code,
      method: 'Python/Pandas Reduce-Based',
      rowsUsed: total,
      details: { matching, total, aggregation: 'PCT' },
    };
  }

  // --- COUNT of filtered rows ---
  if (agg === 'COUNT' && !targetCol) {
    const count = filteredRows.length;
    const filterDesc = contract.filters.map((f) => `df['${f.column}'].astype(str).str.lower() == '${f.value}'`).join(' & ');
    const code =
      `# Independent Python/Pandas calculation\nimport pandas as pd\n` +
      `df = pd.read_csv('${dataset.name}')\n` +
      (filterDesc ? `result = len(df[${filterDesc}])\n` : `result = len(df)\n`) +
      `print(result)`;
    return {
      value: count,
      code,
      method: 'Python/Pandas Reduce-Based',
      rowsUsed: filteredRows.length,
      details: { aggregation: 'COUNT' },
    };
  }

  // --- GROUP BY ---
  if (groupBy) {
    const grouped = filteredRows.reduce<Record<string, number[]>>((acc, row) => {
      const key = String(row[groupBy] || 'Unknown');
      const val = Number(row[targetCol]);
      if (!isNaN(val)) (acc[key] = acc[key] || []).push(val);
      return acc;
    }, {});

    const aggFn = agg.toLowerCase() === 'avg' ? 'mean' : agg.toLowerCase() === 'sum' ? 'sum' :
      agg.toLowerCase() === 'count' ? 'count' : agg.toLowerCase() === 'max' ? 'max' :
      agg.toLowerCase() === 'min' ? 'min' : 'median';
    let code = `# Independent Python/Pandas calculation\nimport pandas as pd\n`;
    code += `df = pd.read_csv('${dataset.name}')\n`;
    if (contract.filters.length > 0) {
      code += contract.filters.map((f) => `df = df[df['${f.column}'].astype(str).str.lower() == '${f.value}']`).join('\n') + '\n';
    }
    code += `result = df.groupby('${groupBy}')['${targetCol}'].${aggFn}().sort_values(ascending=False)`;

    const results: { label: string; value: number }[] = Object.entries(grouped)
      .map(([label, vals]) => ({ label, value: aggregateValues(vals, agg) }))
      .sort((a, b) => b.value - a.value);

    return {
      value: results,
      code,
      method: 'Python/Pandas Reduce-Based',
      rowsUsed: filteredRows.length,
      details: { groupCount: results.length, aggregation: agg },
    };
  }

  // --- Scalar numeric ---
  const values = filteredRows.map((r) => Number(r[targetCol])).filter((v) => !isNaN(v));
  const aggFn = agg.toLowerCase() === 'avg' ? 'mean' : agg.toLowerCase() === 'sum' ? 'sum' :
    agg.toLowerCase() === 'count' ? 'count' : agg.toLowerCase() === 'max' ? 'max' :
    agg.toLowerCase() === 'min' ? 'min' : 'median';
  let code = `# Independent Python/Pandas calculation\nimport pandas as pd\n`;
  code += `df = pd.read_csv('${dataset.name}')\n`;
  if (contract.filters.length > 0) {
    code += contract.filters.map((f) => `df = df[df['${f.column}'].astype(str).str.lower() == '${f.value}']`).join('\n') + '\n';
  }
  code += `result = df['${targetCol}'].${aggFn}()`;

  return {
    value: aggregateValues(values, agg),
    code,
    method: 'Python/Pandas Reduce-Based',
    rowsUsed: filteredRows.length,
    details: { aggregation: agg, count: values.length },
  };
}

function aggregateValues(values: number[], aggregation: string): number {
  if (values.length === 0) return 0;
  switch (aggregation) {
    case 'SUM':
      return values.reduce((a, b) => a + b, 0);
    case 'AVG':
    case 'MEAN':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'COUNT':
      return values.length;
    case 'MAX':
      return Math.max(...values);
    case 'MIN':
      return Math.min(...values);
    case 'MEDIAN': {
      const sorted = [...values].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
    }
    default:
      return values.reduce((a, b) => a + b, 0);
  }
}

function resultsMatch(
  primary: number | { label: string; value: number }[] | Record<string, string | number | null>[],
  independent: number | { label: string; value: number }[] | Record<string, string | number | null>[]
): { match: boolean; details: string } {
  // LIST mode — both are row arrays, match if same row count
  if (
    Array.isArray(primary) && Array.isArray(independent) &&
    primary.length > 0 && typeof (primary[0] as Record<string, unknown>).label === 'undefined' &&
    !('value' in (primary[0] as object))
  ) {
    const match = primary.length === independent.length;
    return {
      match,
      details: match
        ? `Both methods returned ${primary.length} rows`
        : `MISMATCH: ${primary.length} vs ${independent.length} rows`,
    };
  }
  if (typeof primary === 'number' && typeof independent === 'number') {
    const match = Math.abs(primary - independent) < 0.01;
    return {
      match,
      details: match
        ? `Primary: ${primary} = Independent: ${independent}`
        : `MISMATCH: Primary: ${primary} vs Independent: ${independent}`,
    };
  }

  if (Array.isArray(primary) && Array.isArray(independent)) {
    if (primary.length !== independent.length) {
      return {
        match: false,
        details: `MISMATCH: Different result counts (${primary.length} vs ${independent.length})`,
      };
    }
    const pMap = new Map(primary.map((r) => [r.label, r.value]));
    const iMap = new Map(independent.map((r) => [r.label, r.value]));
    let allMatch = true;
    const mismatches: string[] = [];
    for (const key of pMap.keys()) {
      const pVal = pMap.get(key)!;
      const iVal = iMap.get(key);
      if (iVal === undefined || Math.abs(pVal - iVal) > 0.01) {
        allMatch = false;
        mismatches.push(`${key}: ${pVal} vs ${iVal ?? 'missing'}`);
      }
    }
    return {
      match: allMatch,
      details: allMatch
        ? `All ${primary.length} groups matched`
        : `MISMATCH in: ${mismatches.join(', ')}`,
    };
  }

  return { match: false, details: 'Result type mismatch' };
}

export function runVerification(
  contract: AnalysisContract,
  dataset: DatasetData
): VerificationRun {
  const primaryResult = primaryCalculation(contract, dataset);
  const independentResult = independentCalculation(contract, dataset);
  const { match, details } = resultsMatch(primaryResult.value, independentResult.value);

  let status: VerificationStatus;
  if (match) status = 'verified';
  else status = 'verification_failed';

  // PCT uses total rows, COUNT uses filtered rows — both valid
  const effectiveRowsUsed = contract.aggregation === 'PCT'
    ? dataset.rows.length
    : primaryResult.rowsUsed;

  if (effectiveRowsUsed === 0) {
    status = 'cannot_verify';
  }

  return {
    primaryResult,
    independentResult,
    match,
    status,
    matchDetails: details,
  };
}

export function formatResultValue(
  value: number | { label: string; value: number }[] | Record<string, string | number | null>[],
  isCurrency = false
): string {
  if (typeof value === 'number') {
    if (isCurrency) {
      if (value >= 10000000) return `\u20b9${(value / 10000000).toFixed(2)} Cr`;
      if (value >= 100000) return `\u20b9${(value / 100000).toFixed(2)} L`;
      if (value >= 1000) return `\u20b9${value.toLocaleString('en-IN')}`;
      return `\u20b9${value.toFixed(2)}`;
    }
    if (value % 1 !== 0) return value.toFixed(2);
    return value.toLocaleString('en-IN');
  }
  if (Array.isArray(value) && value.length > 0) {
    const first = value[0] as Record<string, unknown>;
    // LIST rows — no label/value shape
    if (!('label' in first) && !('value' in first)) {
      return `${value.length} rows`;
    }
    // grouped result
    const top = value[0] as { label: string; value: number };
    return `${top.label}: ${formatResultValue(top.value, isCurrency)}`;
  }
  return 'N/A';
}

export function generateProofId(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 90000) + 10000;
  return `DP-${year}-${String(random).padStart(5, '0')}`;
}

// Analytics functions for charts
export function computeTimeSeries(
  rows: Record<string, number | string | null>[],
  dateCol: string,
  valueCol: string,
  aggregation: string = 'SUM'
): { date: string; value: number }[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const dateVal = row[dateCol];
    const val = Number(row[valueCol]);
    if (dateVal !== null && !isNaN(val)) {
      const date = new Date(String(dateVal));
      if (!isNaN(date.getTime())) {
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(val);
      }
    }
  }
  const result: { date: string; value: number }[] = [];
  for (const [date, values] of groups) {
    result.push({ date, value: aggregateValues(values, aggregation) });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date));
}

export function computeGroupAggregation(
  rows: Record<string, number | string | null>[],
  groupCol: string,
  valueCol: string,
  aggregation: string = 'SUM'
): { label: string; value: number }[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = String(row[groupCol] || 'Unknown');
    const val = Number(row[valueCol]);
    if (!isNaN(val)) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(val);
    }
  }
  const result: { label: string; value: number }[] = [];
  for (const [label, values] of groups) {
    result.push({ label, value: aggregateValues(values, aggregation) });
  }
  return result.sort((a, b) => b.value - a.value);
}

export function computeDistribution(
  rows: Record<string, number | string | null>[],
  valueCol: string
): {
  mean: number;
  median: number;
  min: number;
  max: number;
  range: number;
  stdDev: number;
  quartiles: { q1: number; q3: number };
  percentiles: { p90: number; p95: number };
  histogram: { bucket: string; count: number; range: [number, number] }[];
} {
  const values = rows.map((r) => Number(r[valueCol])).filter((v) => !isNaN(v));
  if (values.length === 0) {
    return {
      mean: 0, median: 0, min: 0, max: 0, range: 0, stdDev: 0,
      quartiles: { q1: 0, q3: 0 }, percentiles: { p90: 0, p95: 0 }, histogram: [],
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const range = max - min;
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  const percentile = (p: number) => {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  };

  // Histogram with ~10 buckets
  const bucketCount = Math.min(10, Math.max(5, Math.ceil(Math.sqrt(values.length))));
  const bucketSize = range / bucketCount;
  const histogram: { bucket: string; count: number; range: [number, number] }[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const start = min + i * bucketSize;
    const end = i === bucketCount - 1 ? max : min + (i + 1) * bucketSize;
    const count = values.filter(
      (v) => v >= start && (i === bucketCount - 1 ? v <= end : v < end)
    ).length;
    histogram.push({
      bucket: `${Math.round(start)}–${Math.round(end)}`,
      count,
      range: [start, end],
    });
  }

  return {
    mean, median, min, max, range, stdDev,
    quartiles: { q1: percentile(25), q3: percentile(75) },
    percentiles: { p90: percentile(90), p95: percentile(95) },
    histogram,
  };
}

export function computeCorrelation(
  rows: Record<string, number | string | null>[],
  col1: string,
  col2: string
): number {
  const pairs = rows
    .map((r) => [Number(r[col1]), Number(r[col2])])
    .filter(([a, b]) => !isNaN(a) && !isNaN(b));
  if (pairs.length < 2) return 0;

  const x = pairs.map((p) => p[0]);
  const y = pairs.map((p) => p[1]);
  const meanX = x.reduce((a, b) => a + b, 0) / x.length;
  const meanY = y.reduce((a, b) => a + b, 0) / y.length;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : numerator / denom;
}

export function detectAnomalies(
  rows: Record<string, number | string | null>[],
  valueCol: string,
  labelCols: string[] = []
): { row: Record<string, number | string | null>; value: number; zScore: number; reason: string }[] {
  const values = rows.map((r) => Number(r[valueCol])).filter((v) => !isNaN(v));
  if (values.length < 3) return [];

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return [];

  const anomalies: { row: Record<string, number | string | null>; value: number; zScore: number; reason: string }[] = [];
  for (const row of rows) {
    const val = Number(row[valueCol]);
    if (isNaN(val)) continue;
    const zScore = Math.abs((val - mean) / stdDev);
    if (zScore > 2.5) {
      const reason = labelCols
        .map((c) => `${c}: ${row[c]}`)
        .join(', ');
      anomalies.push({
        row,
        value: val,
        zScore,
        reason: reason || `Unusual value in ${valueCol}`,
      });
    }
  }
  return anomalies.sort((a, b) => b.zScore - a.zScore);
}

export function computeRootCause(
  rows: Record<string, number | string | null>[],
  valueCol: string,
  dimensionCol: string,
  baseline: 'all' | 'first_half' = 'all'
): {
  dimension: string;
  contribution: number;
  totalValue: number;
  share: number;
}[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = String(row[dimensionCol] || 'Unknown');
    const val = Number(row[valueCol]);
    if (!isNaN(val)) {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(val);
    }
  }

  const total = [...groups.values()].flat().reduce((a, b) => a + b, 0);
  const result: { dimension: string; contribution: number; totalValue: number; share: number }[] = [];

  for (const [dim, vals] of groups) {
    const dimTotal = vals.reduce((a, b) => a + b, 0);
    const share = total > 0 ? (dimTotal / total) * 100 : 0;
    result.push({
      dimension: dim,
      contribution: dimTotal,
      totalValue: dimTotal,
      share,
    });
  }

  return result.sort((a, b) => b.contribution - a.contribution);
}
