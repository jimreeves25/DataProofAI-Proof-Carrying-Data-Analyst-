import Papa from 'papaparse';
import {
  DatasetColumn,
  ColumnType,
  DataQualityReport,
  QualityIssue,
} from './types';

export interface ParsedData {
  columns: string[];
  rows: Record<string, string | number | null>[];
}

export function parseCSV(text: string): ParsedData {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
    transformHeader: (h: string) => h.trim(),
  });

  const columns = result.meta.fields?.map((f) => f.trim()).filter(Boolean) || [];
  const rows = (result.data as Record<string, string>[]).map((row) => {
    const cleanRow: Record<string, string | number | null> = {};
    for (const col of columns) {
      const val = row[col];
      if (val === undefined || val === null || val === '' || val.trim() === '') {
        cleanRow[col] = null;
      } else {
        cleanRow[col] = val.trim();
      }
    }
    return cleanRow;
  });

  return { columns, rows };
}

export function inferColumnType(
  values: (string | number | null)[]
): ColumnType {
  const nonNull = values.filter((v) => v !== null && v !== '') as string[];
  if (nonNull.length === 0) return 'string';

  let allNumbers = true;
  let allDates = true;
  let allBool = true;
  let allCurrency = true;

  const dateRegex =
    /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$|^\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}$/;

  for (const val of nonNull.slice(0, 500)) {
    const s = String(val).trim();
    const num = Number(s.replace(/,/g, ''));
    if (isNaN(num) || s === '') allNumbers = false;
    if (!dateRegex.test(s)) allDates = false;
    if (s !== 'true' && s !== 'false' && s !== '0' && s !== '1') allBool = false;
    if (!/^[\$₹€£¥]?[\d,]+\.?\d*$/.test(s)) allCurrency = false;
  }

  if (allDates) return 'date';
  if (allNumbers) return 'number';
  if (allCurrency && !allNumbers) return 'currency';
  if (allBool) return 'boolean';
  return 'string';
}

function coerceValue(val: string | number | null, type: ColumnType): number | string | null {
  if (val === null || val === '') return null;
  if (type === 'number' || type === 'currency') {
    const cleaned = String(val).replace(/[,$₹€£¥\s]/g, '');
    const num = Number(cleaned);
    return isNaN(num) ? null : num;
  }
  if (type === 'boolean') {
    const s = String(val).toLowerCase();
    if (s === 'true' || s === '1') return 1;
    if (s === 'false' || s === '0') return 0;
    return null;
  }
  return String(val);
}

function computeStats(values: number[]) {
  if (values.length === 0)
    return { min: 0, max: 0, mean: 0, median: 0, stdDev: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
  const variance =
    values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return { min: sorted[0], max: sorted[sorted.length - 1], mean, median, stdDev };
}

export function analyzeColumns(
  columns: string[],
  rows: Record<string, string | number | null>[]
): DatasetColumn[] {
  return columns.map((colName) => {
    const rawValues = rows.map((r) => r[colName]);
    const inferredType = inferColumnType(rawValues);
    const coerced = rawValues.map((v) => coerceValue(v, inferredType));
    const nonNull = coerced.filter((v) => v !== null);
    const missingCount = rawValues.length - nonNull.length;
    const missingPercent = rawValues.length > 0 ? (missingCount / rawValues.length) * 100 : 0;
    const uniqueValues = new Set(nonNull.map((v) => String(v)));
    const uniqueness =
      nonNull.length > 0 ? (uniqueValues.size / nonNull.length) * 100 : 0;

    const stats =
      inferredType === 'number' || inferredType === 'currency'
        ? computeStats(nonNull as number[])
        : {};

    return {
      name: colName,
      type: inferredType,
      inferredType,
      missingCount,
      missingPercent,
      uniqueCount: uniqueValues.size,
      uniqueness,
      min: stats.min,
      max: stats.max,
      mean: stats.mean,
      median: stats.median,
      stdDev: stats.stdDev,
      samples: nonNull.slice(0, 5).map((v) => v as string | number),
    };
  });
}

export function coerceRows(
  columns: DatasetColumn[],
  rows: Record<string, string | number | null>[]
): Record<string, number | string | null>[] {
  const typeMap = new Map(columns.map((c) => [c.name, c.type]));
  return rows.map((row) => {
    const newRow: Record<string, number | string | null> = {};
    for (const [key, val] of Object.entries(row)) {
      const type = typeMap.get(key) || 'string';
      newRow[key] = coerceValue(val, type);
    }
    return newRow;
  });
}

export function computeDataQuality(
  columns: DatasetColumn[],
  rows: Record<string, number | string | null>[]
): DataQualityReport {
  const issues: QualityIssue[] = [];
  const totalCells = rows.length * columns.length;

  // Completeness: non-missing cells
  let filledCells = 0;
  for (const row of rows) {
    for (const col of columns) {
      if (row[col.name] !== null && row[col.name] !== '') filledCells++;
    }
  }
  const completeness = totalCells > 0 ? (filledCells / totalCells) * 100 : 0;

  // Identify missing columns
  for (const col of columns) {
    if (col.missingPercent > 50) {
      issues.push({
        type: 'missing_values',
        severity: 'high',
        column: col.name,
        description: `Column "${col.name}" has ${col.missingPercent.toFixed(1)}% missing values`,
        count: col.missingCount,
      });
    } else if (col.missingPercent > 20) {
      issues.push({
        type: 'missing_values',
        severity: 'medium',
        column: col.name,
        description: `Column "${col.name}" has ${col.missingPercent.toFixed(1)}% missing values`,
        count: col.missingCount,
      });
    }
  }

  // Validity: check for type coercion failures
  let validCells = filledCells;
  for (const col of columns) {
    if (col.type === 'number' || col.type === 'currency') {
      const vals = rows.map((r) => r[col.name]);
      const invalid = vals.filter((v) => v !== null && v !== '' && isNaN(Number(v))).length;
      if (invalid > 0) {
        validCells -= invalid;
        issues.push({
          type: 'invalid_type',
          severity: 'medium',
          column: col.name,
          description: `${invalid} values in "${col.name}" could not be parsed as numbers`,
          count: invalid,
        });
      }
    }
  }
  const validity = filledCells > 0 ? (validCells / filledCells) * 100 : 100;

  // Uniqueness: duplicate rows
  const rowStrings = rows.map((r) => JSON.stringify(r));
  const uniqueRows = new Set(rowStrings);
  const duplicateCount = rows.length - uniqueRows.size;
  const uniqueness = rows.length > 0 ? (uniqueRows.size / rows.length) * 100 : 100;
  if (duplicateCount > 0) {
    issues.push({
      type: 'duplicates',
      severity: duplicateCount > rows.length * 0.1 ? 'high' : 'low',
      description: `${duplicateCount} duplicate rows found (${(100 - uniqueness).toFixed(1)}%)`,
      count: duplicateCount,
    });
  }

  // Consistency: check for mixed date formats or currency symbols
  let consistencyIssues = 0;
  for (const col of columns) {
    if (col.type === 'currency') {
      const symbols = new Set(
        rows
          .map((r) => String(r[col.name] || ''))
          .filter((s) => s.match(/[\$₹€£¥]/))
          .map((s) => s.match(/[\$₹€£¥]/)?.[0])
      );
      if (symbols.size > 1) {
        consistencyIssues++;
        issues.push({
          type: 'currency_conflict',
          severity: 'high',
          column: col.name,
          description: `Multiple currency symbols detected in "${col.name}"`,
        });
      }
    }
  }
  const consistency = consistencyIssues > 0 ? 100 - consistencyIssues * 15 : 100;

  // Freshness: based on date columns
  let freshness = 90;
  const dateCol = columns.find((c) => c.type === 'date');
  if (dateCol) {
    const dates = rows
      .map((r) => r[dateCol.name])
      .filter((v) => v !== null)
      .map((v) => new Date(String(v)))
      .filter((d) => !isNaN(d.getTime()));
    if (dates.length > 0) {
      const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
      const daysOld = (Date.now() - maxDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysOld < 7) freshness = 100;
      else if (daysOld < 30) freshness = 95;
      else if (daysOld < 90) freshness = 85;
      else if (daysOld < 365) freshness = 70;
      else freshness = 50;
    }
  }

  const overallScore = Math.round(
    (completeness * 0.3 + validity * 0.25 + consistency * 0.2 + uniqueness * 0.15 + freshness * 0.1)
  );

  return {
    completeness: Math.round(completeness),
    validity: Math.round(validity),
    consistency: Math.round(consistency),
    uniqueness: Math.round(uniqueness),
    freshness: Math.round(freshness),
    overallScore,
    issues,
  };
}

export function generateSampleSalesData(): ParsedData {
  const products = [
    'Chicken Burger', 'Veg Burger', 'French Fries', 'Cola',
    'Chocolate Shake', 'Paneer Wrap', 'Chicken Wings', 'Veg Nuggets',
  ];
  const regions = ['North', 'South', 'East', 'West', 'Central'];
  const channels = ['Online', 'In-Store', 'Delivery'];
  const customerTypes = ['New', 'Returning'];

  const rows: Record<string, string>[] = [];
  const startDate = new Date('2025-01-01');
  let orderCounter = 1000;

  for (let month = 0; month < 12; month++) {
    const monthlyOrders = 40 + Math.floor(Math.random() * 20);
    for (let i = 0; i < monthlyOrders; i++) {
      const product = products[Math.floor(Math.random() * products.length)];
      const region = regions[Math.floor(Math.random() * regions.length)];
      const channel = channels[Math.floor(Math.random() * channels.length)];
      const customerType = customerTypes[Math.floor(Math.random() * customerTypes.length)];
      const quantity = Math.floor(Math.random() * 20) + 1;
      const basePrice =
        product.includes('Burger') ? 120 :
        product.includes('Wings') ? 180 :
        product.includes('Wrap') ? 150 :
        product.includes('Shake') ? 90 :
        product.includes('Nuggets') ? 110 :
        product.includes('Fries') ? 80 : 50;
      const price = basePrice + Math.floor(Math.random() * 30);
      const revenue = quantity * price;

      const day = Math.floor(Math.random() * 28) + 1;
      const date = new Date(2025, month, day);
      orderCounter++;

      rows.push({
        OrderID: `ORD-${orderCounter}`,
        Date: date.toISOString().split('T')[0],
        Product: product,
        Category: product.includes('Chicken') ? 'Non-Veg' : 'Veg',
        Region: region,
        Channel: channel,
        CustomerType: customerType,
        Quantity: String(quantity),
        UnitPrice: String(price),
        Revenue: String(revenue),
      });
    }
  }

  // Add a couple of anomalies
  rows.push({
    OrderID: `ORD-${orderCounter + 1}`,
    Date: '2025-06-15',
    Product: 'Chicken Burger',
    Category: 'Non-Veg',
    Region: 'North',
    Channel: 'Online',
    CustomerType: 'Returning',
    Quantity: '500',
    UnitPrice: '120',
    Revenue: '60000',
  });

  // Add one row with missing data
  rows.push({
    OrderID: `ORD-${orderCounter + 2}`,
    Date: '2025-07-20',
    Product: '',
    Category: 'Veg',
    Region: 'South',
    Channel: 'In-Store',
    CustomerType: 'New',
    Quantity: '5',
    UnitPrice: '90',
    Revenue: '450',
  });

  const columns = ['OrderID', 'Date', 'Product', 'Category', 'Region', 'Channel', 'CustomerType', 'Quantity', 'UnitPrice', 'Revenue'];
  return { columns, rows: rows as unknown as Record<string, string | number | null>[] };
}
