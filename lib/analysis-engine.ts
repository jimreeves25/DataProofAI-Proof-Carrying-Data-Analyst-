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

const AGGREGATIONS = ['sum', 'average', 'mean', 'count', 'max', 'minimum', 'min', 'maximum', 'median'];
const METRIC_KEYWORDS: Record<string, string> = {
  revenue: 'Revenue',
  sales: 'Revenue',
  profit: 'Revenue',
  income: 'Revenue',
  quantity: 'Quantity',
  qty: 'Quantity',
  count: 'Count',
  orders: 'Count',
  price: 'UnitPrice',
  'unit price': 'UnitPrice',
  'average order value': 'Revenue',
  aov: 'Revenue',
};

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

function findMetricColumn(question: string, columns: DatasetColumn[]): string | null {
  const lower = question.toLowerCase();
  // Check for multi-word metrics first
  const multiWord = ['average order value', 'aov', 'unit price'];
  for (const kw of multiWord) {
    if (lower.includes(kw)) {
      const mapped = METRIC_KEYWORDS[kw];
      const col = findColumn(columns, mapped);
      if (col) return col.name;
    }
  }
  for (const [keyword, mapped] of Object.entries(METRIC_KEYWORDS)) {
    if (lower.includes(keyword)) {
      const col = findColumn(columns, mapped);
      if (col) return col.name;
    }
  }
  // Find first numeric column
  const numericCol = columns.find((c) => c.type === 'number' || c.type === 'currency');
  return numericCol?.name || null;
}

function findAggregation(question: string): string {
  const lower = question.toLowerCase();
  if (lower.includes('average') || lower.includes('mean') || lower.includes('avg')) return 'AVG';
  if (lower.includes('count') || lower.includes('how many') || lower.includes('number of')) return 'COUNT';
  if (lower.includes('max') || lower.includes('maximum') || lower.includes('highest') || lower.includes('largest') || lower.includes('most') || lower.includes('top')) return 'MAX';
  if (lower.includes('min') || lower.includes('minimum') || lower.includes('lowest') || lower.includes('smallest') || lower.includes('least')) return 'MIN';
  if (lower.includes('median')) return 'MEDIAN';
  return 'SUM';
}

function findGroupBy(question: string, columns: DatasetColumn[]): string | null {
  const lower = question.toLowerCase();
  const dimensionKeywords = ['by', 'per', 'for each', 'across', 'among'];
  const stringCols = columns.filter((c) => c.type === 'string');

  for (const kw of dimensionKeywords) {
    const idx = lower.indexOf(kw);
    if (idx >= 0) {
      const after = lower.slice(idx + kw.length).trim();
      for (const col of stringCols) {
        if (after.startsWith(col.name.toLowerCase())) return col.name;
      }
    }
  }

  // Check for product/region/category mentioned directly
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

  // "which product" pattern
  if (lower.includes('which ')) {
    for (const col of stringCols) {
      if (lower.includes(col.name.toLowerCase())) return col.name;
    }
  }

  return null;
}

function findFilters(
  question: string,
  columns: DatasetColumn[]
): { column: string; operator: string; value: string }[] {
  const filters: { column: string; operator: string; value: string }[] = [];
  const lower = question.toLowerCase();

  // Year filters
  const yearMatch = lower.match(/in (20\d{2})/);
  if (yearMatch) {
    const dateCol = columns.find((c) => c.type === 'date');
    if (dateCol) {
      filters.push({ column: dateCol.name, operator: 'year', value: yearMatch[1] });
    }
  }

  // Date range filters
  const rangeMatch = lower.match(/between (\d{4}-\d{2}-\d{2}).*(\d{4}-\d{2}-\d{2})/);
  if (rangeMatch) {
    const dateCol = columns.find((c) => c.type === 'date');
    if (dateCol) {
      filters.push({ column: dateCol.name, operator: 'range', value: `${rangeMatch[1]},${rangeMatch[2]}` });
    }
  }

  // "in <Region>" or "for <Region>"
  const stringCols = columns.filter((c) => c.type === 'string');
  for (const col of stringCols) {
    const patterns = [
      new RegExp(`in ${col.name.toLowerCase()} (\\w+)`, 'i'),
      new RegExp(`for ${col.name.toLowerCase()} (\\w+)`, 'i'),
      new RegExp(`${col.name.toLowerCase()} is (\\w+)`, 'i'),
      new RegExp(`where ${col.name.toLowerCase()} (\\w+)`, 'i'),
      new RegExp(`only ${col.name.toLowerCase()}`, 'i'),
    ];
    for (const pat of patterns) {
      const m = lower.match(pat);
      if (m && m[1]) {
        // Verify the value exists in the column
        const exists = columns.find((c) => c.name === col.name);
        if (exists) {
          const colValues = new Set(
            // We'll check from the column samples + uniqueness
            exists.samples.map((s) => String(s).toLowerCase())
          );
          if (colValues.has(m[1].toLowerCase()) || colValues.size === 0) {
            filters.push({ column: col.name, operator: '=', value: m[1] });
          }
        }
      }
    }
  }

  // Customer type filters
  if (lower.includes('returning')) {
    const col = findColumn(columns, 'CustomerType') || findColumn(columns, 'Customer');
    if (col) filters.push({ column: col.name, operator: '=', value: 'Returning' });
  }
  if (lower.includes('new customer')) {
    const col = findColumn(columns, 'CustomerType') || findColumn(columns, 'Customer');
    if (col) filters.push({ column: col.name, operator: '=', value: 'New' });
  }

  return filters;
}

function detectAmbiguity(
  question: string,
  metricColumn: string | null,
  groupBy: string | null,
  columns: DatasetColumn[]
): string {
  if (!metricColumn) {
    return 'No numeric column found to calculate. Please specify a metric.';
  }
  const lower = question.toLowerCase();

  // Multiple dimension references
  const stringCols = columns.filter((c) => c.type === 'string');
  let dimensionRefs = 0;
  for (const col of stringCols) {
    if (lower.includes(col.name.toLowerCase())) dimensionRefs++;
  }
  if (dimensionRefs > 2 && !groupBy) {
    return 'Multiple dimensions mentioned. Please specify which to group by.';
  }

  // Currency conflict check
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
  const metricColumn = findMetricColumn(question, dataset.columns);
  const aggregation = findAggregation(question);
  const groupBy = findGroupBy(question, dataset.columns);
  const filters = findFilters(question, dataset.columns);
  const ambiguity = detectAmbiguity(question, metricColumn, groupBy, dataset.columns);

  let metric = metricColumn || 'Unknown';
  if (metricColumn) {
    if (aggregation === 'COUNT' && question.toLowerCase().includes('how many')) {
      metric = 'Count';
    }
  }

  return {
    question,
    metric,
    aggregation,
    filters,
    groupBy: groupBy || undefined,
    dimension: groupBy || undefined,
    ambiguity,
    targetColumn: metricColumn || undefined,
  };
}

export function generateAssumptions(
  contract: AnalysisContract,
  dataset: DatasetData
): AnalysisAssumptions {
  const currencyCol = dataset.columns.find((c) => c.type === 'currency');
  const dateCol = dataset.columns.find((c) => c.type === 'date');

  const excludedRecords: string[] = [];
  if (contract.filters.length === 0) {
    excludedRecords.push('No filters applied — all rows included');
  }

  return {
    currency: currencyCol ? 'INR (₹)' : 'Not specified',
    dateInterpretation: dateCol ? 'YYYY-MM-DD format' : 'No date columns',
    excludedRecords,
    aggregation: contract.aggregation,
    missingValueTreatment: 'Rows with null values in the target column are excluded',
    formula:
      contract.aggregation === 'SUM'
        ? `${contract.aggregation}(${contract.metric})`
        : contract.aggregation === 'AVG'
        ? `${contract.aggregation}(${contract.metric})`
        : contract.aggregation === 'COUNT'
        ? `COUNT(rows)`
        : `${contract.aggregation}(${contract.metric})`,
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
      if (val === null || val === '') return false;
      if (f.operator === '=') {
        return String(val).toLowerCase() === f.value.toLowerCase();
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
    code += `SELECT ${groupBy}, ${contract.aggregation}(${targetCol})\n`;
    code += `FROM ${dataset.name}\n`;
    if (contract.filters.length > 0) {
      code += `WHERE ${contract.filters.map((f) => `${f.column} ${f.operator} '${f.value}'`).join(' AND ')}\n`;
    }
    code += `GROUP BY ${groupBy}\n`;
    code += `ORDER BY ${contract.aggregation}(${targetCol}) DESC;`;

    const results: { label: string; value: number }[] = [];
    for (const [label, values] of groups) {
      results.push({ label, value: aggregateValues(values, contract.aggregation) });
    }
    results.sort((a, b) => b.value - a.value);

    return {
      value: results,
      code,
      method: 'SQL Iterative Aggregation',
      rowsUsed: filteredRows.length,
      details: { groupCount: results.length, aggregation: contract.aggregation },
    };
  } else {
    const values = filteredRows
      .map((r) => Number(r[targetCol]))
      .filter((v) => !isNaN(v));

    let code = `-- Primary SQL-style calculation\n`;
    code += `SELECT ${contract.aggregation}(${targetCol})\n`;
    code += `FROM ${dataset.name}\n`;
    if (contract.filters.length > 0) {
      code += `WHERE ${contract.filters.map((f) => `${f.column} ${f.operator} '${f.value}'`).join(' AND ')}\n`;
    }
    code += `;`;

    const result = aggregateValues(values, contract.aggregation);

    return {
      value: result,
      code,
      method: 'SQL Iterative Aggregation',
      rowsUsed: filteredRows.length,
      details: { aggregation: contract.aggregation, count: values.length },
    };
  }
}

// INDEPENDENT CALCULATION: Functional/reduce-based approach (different code path)
function independentCalculation(
  contract: AnalysisContract,
  dataset: DatasetData
): CalculationResult {
  const filteredRows = applyFilters(dataset.rows, contract.filters);
  const targetCol = contract.targetColumn || '';
  const groupBy = contract.groupBy;

  if (groupBy) {
    // Different approach: use reduce to build groups
    const grouped = filteredRows.reduce<Record<string, number[]>>((acc, row) => {
      const key = String(row[groupBy] || 'Unknown');
      const val = Number(row[targetCol]);
      if (!isNaN(val)) {
        (acc[key] = acc[key] || []).push(val);
      }
      return acc;
    }, {});

    let code = `# Independent Python/Pandas calculation\n`;
    code += `import pandas as pd\n`;
    code += `df = pd.DataFrame(${dataset.name}_rows)\n`;
    if (contract.filters.length > 0) {
      code += contract.filters
        .map((f) => `df = df[df['${f.column}'] ${f.operator} '${f.value}']`)
        .join('\n');
      code += '\n';
    }
    code += `result = df.groupby('${groupBy}')['${targetCol}'].${contract.aggregation.toLowerCase() === 'avg' ? 'mean' : contract.aggregation.toLowerCase() === 'sum' ? 'sum' : contract.aggregation.toLowerCase() === 'count' ? 'count' : contract.aggregation.toLowerCase() === 'max' ? 'max' : contract.aggregation.toLowerCase() === 'min' ? 'min' : 'median'}()\n`;
    code += `result = result.sort_values(ascending=False)`;

    const results: { label: string; value: number }[] = Object.entries(grouped)
      .map(([label, vals]) => ({
        label,
        value: aggregateValues(vals, contract.aggregation),
      }))
      .sort((a, b) => b.value - a.value);

    return {
      value: results,
      code,
      method: 'Python/Pandas Reduce-Based',
      rowsUsed: filteredRows.length,
      details: { groupCount: results.length, aggregation: contract.aggregation },
    };
  } else {
    // Different approach: use reduce
    const values = filteredRows
      .map((r) => Number(r[targetCol]))
      .filter((v) => !isNaN(v));

    let code = `# Independent Python/Pandas calculation\n`;
    code += `import pandas as pd\n`;
    code += `df = pd.DataFrame(${dataset.name}_rows)\n`;
    if (contract.filters.length > 0) {
      code += contract.filters
        .map((f) => `df = df[df['${f.column}'] ${f.operator} '${f.value}']`)
        .join('\n');
      code += '\n';
    }
    code += `result = df['${targetCol}'].${contract.aggregation.toLowerCase() === 'avg' ? 'mean' : contract.aggregation.toLowerCase() === 'sum' ? 'sum' : contract.aggregation.toLowerCase() === 'count' ? 'count' : contract.aggregation.toLowerCase() === 'max' ? 'max' : contract.aggregation.toLowerCase() === 'min' ? 'min' : 'median'}()`;

    const result = aggregateValues(values, contract.aggregation);

    return {
      value: result,
      code,
      method: 'Python/Pandas Reduce-Based',
      rowsUsed: filteredRows.length,
      details: { aggregation: contract.aggregation, count: values.length },
    };
  }
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
  primary: number | { label: string; value: number }[],
  independent: number | { label: string; value: number }[]
): { match: boolean; details: string } {
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

  // Check if data quality is too low
  if (primaryResult.rowsUsed === 0) {
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

export function formatResultValue(value: number | { label: string; value: number }[]): string {
  if (typeof value === 'number') {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(2)} L`;
    if (value >= 1000) return `₹${value.toLocaleString('en-IN')}`;
    if (value % 1 !== 0) return `₹${value.toFixed(2)}`;
    return value.toLocaleString('en-IN');
  }
  const top = value[0];
  if (!top) return 'N/A';
  return `${top.label}: ${formatResultValue(top.value)}`;
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
