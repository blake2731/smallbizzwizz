export type NormalizedFinancialRecord = {
  sheetName: string
  rowNumber: number

  section?: string
  subsection?: string

  category?: string
  subcategory?: string

  lineItem: string

  period?: string
  reportType?: string

  actual?: number | null
  budget?: number | null
  variance?: number | null

  actualPpd?: number | null
  budgetPpd?: number | null
  variancePpd?: number | null

  isTotal: boolean
  isHidden: boolean
}

export type MetricSummary = {
  label: string
  actual: number | null
  budget: number | null
  variance: number | null
  actualPpd: number | null
  budgetPpd: number | null
  variancePpd: number | null
  percentChange: number | null
  recordCount: number
}

export type TopVarianceRecord = NormalizedFinancialRecord & {
  varianceAmount: number
  percentChange: number | null
}

export type LaborMetrics = {
  total: MetricSummary
  wages: MetricSummary
  payrollTaxes: MetricSummary
  employeeBenefits: MetricSummary
  agencyStaffing: MetricSummary
}

export type RevenueMetrics = {
  total: MetricSummary
  medicarePartA: MetricSummary
  medicaid: MetricSummary
  privatePay: MetricSummary
  therapy: MetricSummary
}

export type ExpenseMetrics = {
  total: MetricSummary
  dietary: MetricSummary
  therapy: MetricSummary
  utilities: MetricSummary
  otherOperating: MetricSummary
}

export type RecordFilter = {
  category?: string
  subcategory?: string
  section?: string
  subsection?: string
  lineItem?: string
  period?: string
  reportType?: string
  includeHidden?: boolean
  includeTotals?: boolean
  metricsOnly?: boolean
}

export type TrendDataPoint = {
  period: string
  actual: number | null
  budget: number | null
  variance: number | null
  actualPpd: number | null
  budgetPpd: number | null
  variancePpd: number | null
  recordCount: number
}

export type InsightType =
  | "negative_variance"
  | "positive_variance"
  | "labor_spike"
  | "revenue_decline"
  | "census_decline"
  | "abnormal_expense_increase"
  | "margin_compression"
  | "trend_deterioration"
  | "outlier"

export type InsightSeverity = "low" | "medium" | "high"

export type InsightTrendDirection =
  | "improving"
  | "deteriorating"
  | "stable"
  | "mixed"

export type InsightMetricUnit = "currency" | "percent" | "ppd" | "count"

export type InsightSupportingMetric = {
  label: string
  value: number | string | null
  unit?: InsightMetricUnit
}

export type InsightThreshold = {
  label: string
  actual: number | string | null
  threshold: number | string
  comparator: ">=" | "<="
  unit?: InsightMetricUnit
}

export type OperationalInsight = {
  type: InsightType
  severity: InsightSeverity
  category?: string
  subcategory?: string
  section?: string
  subsection?: string
  title: string
  explanation: string
  triggerReason?: string
  supportingMetrics: InsightSupportingMetric[]
  thresholdsExceeded?: InsightThreshold[]
  periodsInvolved?: string[]
  trendDirection: InsightTrendDirection
  period?: string
  lineItem?: string
}
