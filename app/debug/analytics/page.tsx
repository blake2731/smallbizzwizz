import fs from "node:fs/promises"
import path from "node:path"
import Link from "next/link"
import {
  parseCypressWorkbook,
  type SheetParse
} from "@/lib/parsers/cypress"
import {
  normalizeWorkbookRecords
} from "@/lib/verticals/nursing-home/financialMappings"
import {
  generateInsightPackets
} from "@/lib/verticals/nursing-home/insights"
import {
  getExpenseMetrics,
  getLaborMetrics,
  getLargestNegativeVariances,
  getLargestPositiveVariances,
  getRevenueMetrics
} from "@/lib/verticals/nursing-home/metricCalculations"
import {
  getTrendData
} from "@/lib/verticals/nursing-home/retrieval"
import type {
  ExpenseMetrics,
  LaborMetrics,
  NormalizedFinancialRecord,
  OperationalInsight,
  RevenueMetrics,
  TopVarianceRecord,
  TrendDataPoint
} from "@/lib/verticals/nursing-home/types"

export const dynamic = "force-dynamic"

export default async function AnalyticsDebugPage() {
  const filePath = path.join(process.cwd(), "app", "debug", "Cypress.xlsx")
  const buffer = await fs.readFile(filePath)

  const sheets = await parseCypressWorkbook(buffer)
  const supportedSheets = sheets.filter((sheet) => sheet.format === "actual_vs_budget")
  const normalizedRecords = normalizeWorkbookRecords(supportedSheets)
  const negativeVariances = getLargestNegativeVariances(normalizedRecords, 12)
  const positiveVariances = getLargestPositiveVariances(normalizedRecords, 12)
  const laborMetrics = getLaborMetrics(normalizedRecords)
  const revenueMetrics = getRevenueMetrics(normalizedRecords)
  const expenseMetrics = getExpenseMetrics(normalizedRecords)
  const revenueTrend = getTrendData(normalizedRecords, { category: "Revenue" })
  const insights = generateInsightPackets(normalizedRecords)

  const totalRecords = sheets.reduce((count, sheet) => count + sheet.records.length, 0)
  const totalIssues = sheets.reduce((count, sheet) => count + sheet.issues.length, 0)
  const supportedIssueFreeSheets = supportedSheets.filter(
    (sheet) => sheet.issues.length === 0
  ).length
  const leafRecords = normalizedRecords.filter(
    (record) =>
      !record.isTotal &&
      (record.actual !== null && record.actual !== undefined ||
        record.budget !== null && record.budget !== undefined ||
        record.variance !== null && record.variance !== undefined ||
        record.actualPpd !== null && record.actualPpd !== undefined ||
        record.budgetPpd !== null && record.budgetPpd !== undefined ||
        record.variancePpd !== null && record.variancePpd !== undefined)
  )

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "ui-monospace, Menlo, monospace",
        color: "#111",
        background: "#fafafa"
      }}
    >
      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
        <Link href="/debug" style={{ color: "#2563eb" }}>
          ← raw inspector
        </Link>
        <Link href="/debug/parsed" style={{ color: "#2563eb" }}>
          parsed records
        </Link>
        <Link href="/debug/narratives" style={{ color: "#2563eb" }}>
          narratives
        </Link>
      </div>

      <h1 style={{ fontSize: 22, marginBottom: 4 }}>
        Normalized analytics — Cypress.xlsx
      </h1>
      <p style={{ fontSize: 12, color: "#555", marginTop: 0, marginBottom: 16 }}>
        Semantic normalization stays strictly downstream of the deterministic parser.
        The mapping layer is driven by real Cypress workbook labels, and every metric
        shown here is computed with deterministic TypeScript helpers.
      </p>

      <ValidationStats
        sheets={sheets}
        supportedIssueFreeSheets={supportedIssueFreeSheets}
        totalRecords={totalRecords}
        normalizedRecords={normalizedRecords.length}
        leafRecords={leafRecords.length}
        totalIssues={totalIssues}
      />

      <InsightsPanel insights={insights} />

      <section
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          marginBottom: 16
        }}
      >
        <SummaryCard title="Labor Summary" metrics={laborMetrics} />
        <SummaryCard title="Revenue Summary" metrics={revenueMetrics} />
        <SummaryCard title="Expense Summary" metrics={expenseMetrics} />
      </section>

      <section
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
          marginBottom: 16
        }}
      >
        <VarianceTable title="Largest Negative Variances" records={negativeVariances} />
        <VarianceTable title="Largest Positive Variances" records={positiveVariances} />
      </section>

      <TrendPanel data={revenueTrend} />

      <RecordsTable records={normalizedRecords} />
    </main>
  )
}

function InsightsPanel({ insights }: { insights: OperationalInsight[] }) {
  const severityCounts = {
    high: insights.filter((insight) => insight.severity === "high").length,
    medium: insights.filter((insight) => insight.severity === "medium").length,
    low: insights.filter((insight) => insight.severity === "low").length
  }

  const typeCounts = new Map<string, number>()
  for (const insight of insights) {
    typeCounts.set(insight.type, (typeCounts.get(insight.type) ?? 0) + 1)
  }

  return (
    <section
      style={{
        background: "white",
        padding: 16,
        border: "1px solid #ddd",
        borderRadius: 6,
        marginBottom: 16
      }}
    >
      <h2 style={{ fontSize: 16, marginTop: 0 }}>Insight packets</h2>
      <p style={{ fontSize: 12, color: "#555", marginTop: 0 }}>
        These packets are generated deterministically from normalized analytics, so
        the future AI layer can explain structured operational signals instead of
        guessing from raw workbook rows.
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
          fontSize: 12
        }}
      >
        <StatPill label="Packets" value={String(insights.length)} tone="neutral" />
        <StatPill label="High" value={String(severityCounts.high)} tone="high" />
        <StatPill label="Medium" value={String(severityCounts.medium)} tone="medium" />
        <StatPill label="Low" value={String(severityCounts.low)} tone="low" />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
          fontSize: 11
        }}
      >
        {[...typeCounts.entries()].map(([type, count]) => (
          <span
            key={type}
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              background: "#f8fafc",
              border: "1px solid #e2e8f0"
            }}
          >
            {type}: {count}
          </span>
        ))}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {insights.map((insight, index) => (
          <article
            key={`${insight.type}-${insight.period ?? ""}-${index}`}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: 12,
              background: "#fcfcfd"
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                alignItems: "center",
                marginBottom: 6
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: severityColor(insight.severity),
                  background: severityBackground(insight.severity),
                  padding: "3px 6px",
                  borderRadius: 999
                }}
              >
                {insight.severity}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: "#334155",
                  background: "#f1f5f9",
                  padding: "3px 6px",
                  borderRadius: 999
                }}
              >
                {insight.type}
              </span>
              {insight.period && (
                <span style={{ fontSize: 11, color: "#475569" }}>{insight.period}</span>
              )}
            </div>

            <h3 style={{ fontSize: 14, margin: "0 0 6px 0" }}>{insight.title}</h3>
            <p style={{ fontSize: 12, color: "#374151", marginTop: 0, marginBottom: 10 }}>
              {insight.explanation}
            </p>

            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
              {[insight.category, insight.subcategory, insight.lineItem]
                .filter(Boolean)
                .join(" / ")}
            </div>

            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <tbody>
                {insight.supportingMetrics.map((metricValue) => (
                  <tr key={metricValue.label}>
                    <td
                      style={{
                        ...cellStyle(),
                        fontWeight: 600,
                        background: "#f8fafc"
                      }}
                    >
                      {metricValue.label}
                    </td>
                    <td style={{ ...cellStyle(), textAlign: "right" }}>
                      {fmtInsightMetric(metricValue.value, metricValue.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))}
      </div>
    </section>
  )
}

function ValidationStats(props: {
  sheets: SheetParse[]
  supportedIssueFreeSheets: number
  totalRecords: number
  normalizedRecords: number
  leafRecords: number
  totalIssues: number
}) {
  const supportedSheets = props.sheets.filter((sheet) => sheet.format === "actual_vs_budget")
  const unsupportedSheets = props.sheets.length - supportedSheets.length

  const cells = [
    ["Supported sheets", String(supportedSheets.length)],
    ["Unsupported sheets", String(unsupportedSheets)],
    ["Parsed records", props.totalRecords.toLocaleString()],
    ["Normalized records", props.normalizedRecords.toLocaleString()],
    ["Leaf records", props.leafRecords.toLocaleString()],
    ["Validation issues", props.totalIssues.toLocaleString()],
    ["Issue-free supported sheets", String(props.supportedIssueFreeSheets)]
  ]

  return (
    <section
      style={{
        background: "white",
        padding: 16,
        border: "1px solid #ddd",
        borderRadius: 6,
        marginBottom: 16
      }}
    >
      <h2 style={{ fontSize: 16, marginTop: 0 }}>Validation stats</h2>
      <table style={{ fontSize: 12, borderCollapse: "collapse" }}>
        <tbody>
          {cells.map(([label, value]) => (
            <tr key={label}>
              <td style={{ ...cellStyle(), fontWeight: 600, background: "#f8fafc" }}>
                {label}
              </td>
              <td
                style={{
                  ...cellStyle(),
                  textAlign: "right",
                  color:
                    label === "Validation issues" && props.totalIssues > 0
                      ? "#b91c1c"
                      : undefined
                }}
              >
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function SummaryCard(props: {
  title: string
  metrics: LaborMetrics | RevenueMetrics | ExpenseMetrics
}) {
  const rows = Object.values(props.metrics)

  return (
    <section
      style={{
        background: "white",
        padding: 16,
        border: "1px solid #ddd",
        borderRadius: 6
      }}
    >
      <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 8 }}>{props.title}</h2>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {["Metric", "Actual", "Budget", "Variance", "%", "Rows"].map((heading) => (
              <th key={heading} style={{ ...cellStyle(), textAlign: heading === "Metric" ? "left" : "right" }}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((metric) => (
            <tr key={metric.label}>
              <td style={{ ...cellStyle(), fontWeight: metric.label.startsWith("Total") ? 700 : 500 }}>
                {metric.label}
              </td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>{fmt(metric.actual)}</td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>{fmt(metric.budget)}</td>
              <td
                style={{
                  ...cellStyle(),
                  textAlign: "right",
                  color: varianceColor(metric.variance)
                }}
              >
                {fmt(metric.variance)}
              </td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>
                {fmtPercent(metric.percentChange)}
              </td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>
                {metric.recordCount.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function VarianceTable(props: {
  title: string
  records: TopVarianceRecord[]
}) {
  return (
    <section
      style={{
        background: "white",
        padding: 16,
        border: "1px solid #ddd",
        borderRadius: 6
      }}
    >
      <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 8 }}>{props.title}</h2>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {["Period", "Category", "Subcategory", "Line item", "Variance", "%"].map(
              (heading) => (
                <th key={heading} style={{ ...cellStyle(), textAlign: heading === "Variance" || heading === "%" ? "right" : "left" }}>
                  {heading}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {props.records.map((record) => (
            <tr key={`${record.sheetName}-${record.rowNumber}`}>
              <td style={cellStyle()}>{record.period ?? record.sheetName}</td>
              <td style={cellStyle()}>{record.category ?? ""}</td>
              <td style={cellStyle()}>{record.subcategory ?? ""}</td>
              <td style={cellStyle()}>{record.lineItem}</td>
              <td
                style={{
                  ...cellStyle(),
                  textAlign: "right",
                  color: varianceColor(record.varianceAmount)
                }}
              >
                {fmt(record.varianceAmount)}
              </td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>
                {fmtPercent(record.percentChange)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function StatPill(props: {
  label: string
  value: string
  tone: "neutral" | "high" | "medium" | "low"
}) {
  const colors = {
    neutral: { background: "#f8fafc", border: "#e2e8f0", color: "#0f172a" },
    high: { background: "#fef2f2", border: "#fecaca", color: "#b91c1c" },
    medium: { background: "#fff7ed", border: "#fdba74", color: "#c2410c" },
    low: { background: "#f0fdf4", border: "#bbf7d0", color: "#166534" }
  }

  const color = colors[props.tone]

  return (
    <span
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${color.border}`,
        background: color.background,
        color: color.color,
        fontWeight: 600
      }}
    >
      {props.label}: {props.value}
    </span>
  )
}

function TrendPanel({ data }: { data: TrendDataPoint[] }) {
  return (
    <section
      style={{
        background: "white",
        padding: 16,
        border: "1px solid #ddd",
        borderRadius: 6,
        marginBottom: 16
      }}
    >
      <h2 style={{ fontSize: 16, marginTop: 0, marginBottom: 8 }}>
        Revenue trend snapshot
      </h2>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {["Period", "Actual", "Budget", "Variance", "Actual PPD", "Budget PPD", "Rows"].map(
              (heading) => (
                <th key={heading} style={{ ...cellStyle(), textAlign: heading === "Period" ? "left" : "right" }}>
                  {heading}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.period}>
              <td style={cellStyle()}>{point.period}</td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>{fmt(point.actual)}</td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>{fmt(point.budget)}</td>
              <td
                style={{
                  ...cellStyle(),
                  textAlign: "right",
                  color: varianceColor(point.variance)
                }}
              >
                {fmt(point.variance)}
              </td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>{fmt(point.actualPpd)}</td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>{fmt(point.budgetPpd)}</td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>
                {point.recordCount.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function RecordsTable({ records }: { records: NormalizedFinancialRecord[] }) {
  return (
    <section
      style={{
        background: "white",
        padding: 16,
        border: "1px solid #ddd",
        borderRadius: 6
      }}
    >
      <h2 style={{ fontSize: 16, marginTop: 0 }}>Normalized records</h2>
      <p style={{ fontSize: 12, color: "#555", marginTop: 0 }}>
        Real Cypress rows after canonical label normalization. Hidden rows are preserved,
        total rows are flagged, and the page renders the actual helper output rather than
        ad hoc page-local transformations.
      </p>
      <div style={{ maxHeight: 680, overflow: "auto", border: "1px solid #ddd" }}>
        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, background: "#f0f0f0", zIndex: 1 }}>
            <tr>
              {[
                "Period",
                "Sheet",
                "Row",
                "Category",
                "Subcategory",
                "Section",
                "Subsection",
                "Line item",
                "Actual",
                "Budget",
                "Variance",
                "Actual PPD",
                "Budget PPD",
                "Variance PPD",
                "Flags"
              ].map((heading) => (
                <th key={heading} style={{ ...cellStyle(), textAlign: "left" }}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr
                key={`${record.sheetName}-${record.rowNumber}`}
                style={{
                  background: record.isTotal
                    ? "#fefce8"
                    : record.isHidden
                      ? "#fafafa"
                      : undefined,
                  opacity: record.isHidden ? 0.72 : 1
                }}
              >
                <td style={cellStyle()}>{record.period ?? ""}</td>
                <td style={cellStyle()}>{record.sheetName}</td>
                <td style={{ ...cellStyle(), color: "#666" }}>{record.rowNumber}</td>
                <td style={cellStyle()}>{record.category ?? ""}</td>
                <td style={cellStyle()}>{record.subcategory ?? ""}</td>
                <td style={cellStyle()}>{record.section ?? ""}</td>
                <td style={cellStyle()}>{record.subsection ?? ""}</td>
                <td style={{ ...cellStyle(), fontWeight: record.isTotal ? 700 : 400 }}>
                  {record.lineItem}
                </td>
                <td style={{ ...cellStyle(), textAlign: "right" }}>{fmt(record.actual)}</td>
                <td style={{ ...cellStyle(), textAlign: "right" }}>{fmt(record.budget)}</td>
                <td
                  style={{
                    ...cellStyle(),
                    textAlign: "right",
                    color: varianceColor(record.variance)
                  }}
                >
                  {fmt(record.variance)}
                </td>
                <td style={{ ...cellStyle(), textAlign: "right" }}>{fmt(record.actualPpd)}</td>
                <td style={{ ...cellStyle(), textAlign: "right" }}>{fmt(record.budgetPpd)}</td>
                <td
                  style={{
                    ...cellStyle(),
                    textAlign: "right",
                    color: varianceColor(record.variancePpd)
                  }}
                >
                  {fmt(record.variancePpd)}
                </td>
                <td style={cellStyle()}>{flagText(record)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function cellStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return {
    padding: "4px 6px",
    border: "1px solid #e5e7eb",
    whiteSpace: "nowrap",
    ...extra
  }
}

function flagText(record: NormalizedFinancialRecord): string {
  const flags: string[] = []
  if (record.isTotal) flags.push("TOT")
  if (record.isHidden) flags.push("hid")
  return flags.join(" ")
}

function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined) return ""
  return value.toLocaleString(undefined, {
    minimumFractionDigits: Math.abs(value) >= 1000 ? 0 : 0,
    maximumFractionDigits: 2
  })
}

function fmtPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return ""
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  })}%`
}

function fmtInsightMetric(
  value: number | string | null | undefined,
  unit?: "currency" | "percent" | "ppd" | "count"
): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value

  if (unit === "currency") {
    return value.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    })
  }

  if (unit === "percent") {
    return `${value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })}%`
  }

  if (unit === "ppd") {
    return `${value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    })} ppd`
  }

  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

function varianceColor(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined || value === 0) return undefined
  return value > 0 ? "#15803d" : "#b91c1c"
}

function severityColor(severity: OperationalInsight["severity"]): string {
  if (severity === "high") return "#b91c1c"
  if (severity === "medium") return "#c2410c"
  return "#166534"
}

function severityBackground(severity: OperationalInsight["severity"]): string {
  if (severity === "high") return "#fef2f2"
  if (severity === "medium") return "#fff7ed"
  return "#f0fdf4"
}
