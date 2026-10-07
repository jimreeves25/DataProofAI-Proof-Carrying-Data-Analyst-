export type ColumnType = 'number' | 'string' | 'date' | 'boolean' | 'currency';

export interface DatasetColumn {
  name: string;
  type: ColumnType;
  inferredType: ColumnType;
  missingCount: number;
  missingPercent: number;
  uniqueCount: number;
  uniqueness: number;
  min?: number | string;
  max?: number | string;
  mean?: number;
  median?: number;
  stdDev?: number;
  samples: (string | number | null)[];
  unit?: string;
  meaning?: string;
}

export interface Dataset {
  id: string;
  name: string;
  sourceType: string;
  sourceLabel?: string;
  rowCount: number;
  columnCount: number;
  columns: DatasetColumn[];
  rows: Record<string, string | number | null>[];
  isSample: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataQualityReport {
  completeness: number;
  validity: number;
  consistency: number;
  uniqueness: number;
  freshness: number;
  overallScore: number;
  issues: QualityIssue[];
}

export interface QualityIssue {
  type: string;
  severity: 'low' | 'medium' | 'high';
  column?: string;
  description: string;
  count?: number;
}

export type VerificationStatus =
  | 'verified'
  | 'needs_review'
  | 'cannot_verify'
  | 'verification_failed';

export interface AnalysisContract {
  question: string;
  metric: string;
  aggregation: string;
  filters: { column: string; operator: string; value: string }[];
  groupBy?: string;
  dimension?: string;
  ambiguity: string;
  targetColumn?: string;
}

export interface AnalysisAssumptions {
  currency: string;
  dateInterpretation: string;
  excludedRecords: string[];
  aggregation: string;
  missingValueTreatment: string;
  formula?: string;
}

export interface CalculationResult {
  value: number | { label: string; value: number }[];
  code: string;
  method: string;
  rowsUsed: number;
  details: Record<string, unknown>;
}

export interface VerificationRun {
  primaryResult: CalculationResult;
  independentResult: CalculationResult;
  match: boolean;
  status: VerificationStatus;
  matchDetails: string;
}

export interface Proof {
  id: string;
  proofIdSerial: string;
  question: string;
  answer: string;
  answerValue: number | { label: string; value: number }[];
  sourceDataset: string;
  datasetVersion: string;
  calculation: string;
  executionMethod: string;
  independentMethod: string;
  match: boolean;
  reproducible: boolean;
  verificationStatus: string;
  evidence: EvidenceItem[];
  createdAt: string;
}

export interface EvidenceItem {
  label: string;
  status: 'pass' | 'fail' | 'warn';
  detail: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}
