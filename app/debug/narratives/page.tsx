import fs from "node:fs/promises"
import path from "node:path"
import Link from "next/link"
import {
  parseCypressWorkbook
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
  getRevenueMetrics
} from "@/lib/verticals/nursing-home/metricCalculations"
import {
  buildNarrativePromptText,
  generateExecutiveNarrative,
  NARRATIVE_AUDIENCES,
  parseNarrativeAudience,
  type NarrativeAudience,
  type NarrativeHighlight,
  type NarrativeMetricSnapshot,
  type NarrativePromptContext,
  type NarrativeResult,
  type NarrativeSourceData,
  type NarrativeTrendSnapshot
} from "@/lib/verticals/nursing-home/narratives"
import {
  getTrendData
} from "@/lib/verticals/nursing-home/retrieval"

export const dynamic = "force-dynamic"

export default async function NarrativeDebugPage(props: {
  searchParams: Promise<{
    audience?: string | string[]
  }>
}) {
  const searchParams = await props.searchParams
  const audience = parseNarrativeAudience(searchParams.audience)

  const filePath = path.join(process.cwd(), "app", "debug", "Cypress.xlsx")
  const buffer = await fs.readFile(filePath)

  const sheets = await parseCypressWorkbook(buffer)
  const supportedSheets = sheets.filter((sheet) => sheet.format === "actual_vs_budget")
  const normalizedRecords = normalizeWorkbookRecords(supportedSheets)
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

  const narrativeSource: NarrativeSourceData = {
    insights,
    summaryMetrics: {
      labor: getLaborMetrics(normalizedRecords),
      revenue: getRevenueMetrics(normalizedRecords),
      expense: getExpenseMetrics(normalizedRecords)
    },
    trends: {
      revenue: getTrendData(normalizedRecords, {
        category: "Revenue",
        includeHidden: false
      }),
      expenses: getTrendData(normalizedRecords, {
        category: "Operating Expenses",
        includeHidden: false
      }),
      labor: getTrendData(normalizedRecords, {
        category: "Labor",
        includeHidden: false
      }),
      ebitdarm: getTrendData(normalizedRecords, {
        category: "Summary",
        subcategory: "EBITDARM",
        includeHidden: false,
        includeTotals: true
      }),
      netIncome: getTrendData(normalizedRecords, {
        category: "Summary",
        subcategory: "Net Income",
        includeHidden: false,
        includeTotals: true
      }),
      census: getTrendData(normalizedRecords, {
        category: "Census",
        subcategory: "Total Census",
        includeHidden: false,
        includeTotals: true
      }),
      occupancy: getTrendData(normalizedRecords, {
        category: "Census",
        subcategory: "Occupancy %",
        includeHidden: false,
        includeTotals: true
      })
    },
    validation: {
      supportedSheetCount: supportedSheets.length,
      supportedIssueFreeSheetCount: supportedIssueFreeSheets,
      totalRecords,
      normalizedRecordCount: normalizedRecords.length,
      leafRecordCount: leafRecords.length,
      totalIssueCount: totalIssues
    }
  }

  const narrative = await generateExecutiveNarrative(narrativeSource, audience)
  const promptText = buildNarrativePromptText(narrative.promptContext)

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "ui-monospace, Menlo, monospace",
        color: "#111",
        background: "#fafafa"
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 12 }}>
        <Link href="/debug" style={{ color: "#2563eb" }}>
          raw inspector
        </Link>
        <Link href="/debug/parsed" style={{ color: "#2563eb" }}>
          parsed records
        </Link>
        <Link href="/debug/analytics" style={{ color: "#2563eb" }}>
          analytics
        </Link>
      </div>

      <h1 style={{ fontSize: 22, marginBottom: 4 }}>
        AI narratives debug - Cypress.xlsx
      </h1>
      <p style={{ fontSize: 12, color: "#555", marginTop: 0, marginBottom: 16 }}>
        The AI layer only receives validated insight packets, deterministic summary
        metrics, and compact trend context. It does not see workbook rows, parser
        internals, or raw spreadsheet dumps.
      </p>

      <AudienceTabs selected={audience} />

      <NarrativeStatus narrative={narrative} />

      <PromptContextPanel context={narrative.promptContext} />

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
          Generated narrative output
        </h2>
        <p style={{ fontSize: 12, color: "#555", marginTop: 0 }}>
          This is the audience-specific explanation layer generated from the compact
          context below. The deterministic packets remain the source of truth.
        </p>

        <div
          style={{
            whiteSpace: "pre-wrap",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            padding: 12,
            fontSize: 12,
            lineHeight: 1.6,
            minHeight: 120
          }}
        >
          {narrative.narrative ??
            (narrative.status === "skipped"
              ? "Narrative generation skipped because no Anthropic API key is configured in this environment."
              : narrative.status === "error"
                ? "Narrative generation failed in this environment. The deterministic prompt context is still shown below."
                : "No narrative text returned.")}
        </div>
      </section>

      <SupportingInsightsPanel context={narrative.promptContext} />

      <details
        open
        style={{
          background: "white",
          padding: 16,
          border: "1px solid #ddd",
          borderRadius: 6
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: 700, marginBottom: 8 }}>
          Prompt payload sent to AI
        </summary>
        <p style={{ fontSize: 12, color: "#555", marginTop: 8 }}>
          This is the exact compact payload assembled from validated packets and
          metrics for the selected audience.
        </p>
        <pre
          style={{
            fontSize: 11,
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            padding: 12,
            overflow: "auto",
            whiteSpace: "pre-wrap"
          }}
        >
          {promptText}
        </pre>
      </details>
    </main>
  )
}

function AudienceTabs({ selected }: { selected: NarrativeAudience }) {
  return (
    <section style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {NARRATIVE_AUDIENCES.map((audience) => (
          <Link
            key={audience}
            href={`/debug/narratives?audience=${audience}`}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: `1px solid ${selected === audience ? "#1d4ed8" : "#cbd5e1"}`,
              background: selected === audience ? "#dbeafe" : "white",
              color: selected === audience ? "#1d4ed8" : "#334155",
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 12
            }}
          >
            {audience}
          </Link>
        ))}
      </div>
    </section>
  )
}

function NarrativeStatus({ narrative }: { narrative: NarrativeResult }) {
  const tone =
    narrative.status === "generated"
      ? {
          background: "#f0fdf4",
          border: "#86efac",
          color: "#166534"
        }
      : narrative.status === "skipped"
        ? {
            background: "#fff7ed",
            border: "#fdba74",
            color: "#c2410c"
          }
        : {
            background: "#fef2f2",
            border: "#fca5a5",
            color: "#b91c1c"
          }

  return (
    <section
      style={{
        background: tone.background,
        border: `1px solid ${tone.border}`,
        color: tone.color,
        padding: 12,
        borderRadius: 6,
        marginBottom: 16
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        Narrative status: {narrative.status}
      </div>
      <div style={{ fontSize: 12 }}>
        Model: {narrative.model ?? "n/a"}
        {narrative.error ? ` | ${narrative.error}` : ""}
      </div>
    </section>
  )
}

function PromptContextPanel({ context }: { context: NarrativePromptContext }) {
  return (
    <>
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
          Prompt context
        </h2>
        <p style={{ fontSize: 12, color: "#555", marginTop: 0 }}>
          The AI context is structured, compact, and traceable. Each highlight below
          points back to a deterministic packet rather than raw workbook rows.
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            fontSize: 12,
            marginBottom: 12
          }}
        >
          <StatPill label="Audience" value={context.audienceLabel} />
          <StatPill
            label="Timeframe"
            value={context.timeframe.join(", ") || "n/a"}
          />
          <StatPill
            label="Packets"
            value={String(context.validation.insightCount)}
          />
          <StatPill
            label="Selected"
            value={String(context.insights.length)}
          />
          <StatPill
            label="Issues"
            value={String(context.validation.totalIssueCount)}
          />
        </div>

        <div style={{ fontSize: 12, color: "#334155", marginBottom: 12 }}>
          {context.objective}
        </div>

        <h3 style={{ fontSize: 14, marginBottom: 8 }}>Operational highlights</h3>
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          {context.operationalHighlights.map((highlight) => (
            <article
              key={`${highlight.supportingInsightIds.join("|")}-${highlight.label}`}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                padding: 10,
                background: "#fcfcfd"
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 4
                }}
              >
                <span
                  style={{
                    padding: "3px 6px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    color: severityColor(highlight.severity),
                    background: severityBackground(highlight.severity)
                  }}
                >
                  {highlight.severity}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{highlight.label}</span>
              </div>
              <div style={{ fontSize: 11, color: "#475569" }}>{highlight.detail}</div>
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 4 }}>
                packets: {highlight.supportingInsightIds.join(", ")}
              </div>
            </article>
          ))}
        </div>

        <SummaryMetricsTable metrics={context.summaryMetrics} />
        <TrendMetricsTable metrics={context.trendMetrics} />
      </section>
    </>
  )
}

function SummaryMetricsTable({
  metrics
}: {
  metrics: NarrativeMetricSnapshot[]
}) {
  return (
    <section style={{ marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Summary metrics</h3>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {["Metric", "Period", "Actual", "Budget", "Variance", "%", "Note"].map(
              (heading) => (
                <th
                  key={heading}
                  style={{
                    ...cellStyle(),
                    textAlign: heading === "Metric" || heading === "Note" || heading === "Period"
                      ? "left"
                      : "right"
                  }}
                >
                  {heading}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={`${metric.label}-${metric.period ?? ""}`}>
              <td style={{ ...cellStyle(), fontWeight: 700 }}>{metric.label}</td>
              <td style={cellStyle()}>{metric.period ?? ""}</td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>
                {fmtContextValue(metric.value, metric.unit)}
              </td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>
                {fmtContextValue(metric.baseline, metric.unit)}
              </td>
              <td
                style={{
                  ...cellStyle(),
                  textAlign: "right",
                  color: varianceColor(metric.variance)
                }}
              >
                {fmtContextValue(metric.variance, metric.unit)}
              </td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>
                {fmtPercent(metric.percentChange)}
              </td>
              <td style={{ ...cellStyle(), whiteSpace: "normal" }}>
                {metric.note ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function TrendMetricsTable({
  metrics
}: {
  metrics: NarrativeTrendSnapshot[]
}) {
  return (
    <section>
      <h3 style={{ fontSize: 14, marginBottom: 8 }}>Trend metrics</h3>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8fafc" }}>
            {[
              "Metric",
              "Previous",
              "Current",
              "Delta",
              "Change %",
              "Direction",
              "Note"
            ].map((heading) => (
              <th
                key={heading}
                style={{
                  ...cellStyle(),
                  textAlign:
                    heading === "Metric" || heading === "Direction" || heading === "Note"
                      ? "left"
                      : "right"
                }}
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => (
            <tr key={`${metric.label}-${metric.currentPeriod}`}>
              <td style={{ ...cellStyle(), fontWeight: 700 }}>{metric.label}</td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>
                {metric.previousPeriod}: {fmtContextValue(metric.previousValue, metric.unit)}
              </td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>
                {metric.currentPeriod}: {fmtContextValue(metric.currentValue, metric.unit)}
              </td>
              <td
                style={{
                  ...cellStyle(),
                  textAlign: "right",
                  color: varianceColor(metric.delta)
                }}
              >
                {fmtContextValue(metric.delta, metric.unit)}
              </td>
              <td style={{ ...cellStyle(), textAlign: "right" }}>
                {fmtPercent(metric.percentChange)}
              </td>
              <td style={cellStyle()}>{metric.trendDirection}</td>
              <td style={{ ...cellStyle(), whiteSpace: "normal" }}>
                {metric.note ?? ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function SupportingInsightsPanel({ context }: { context: NarrativePromptContext }) {
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
        Linked supporting insight packets
      </h2>
      <p style={{ fontSize: 12, color: "#555", marginTop: 0 }}>
        These are the exact deterministic packets linked into the selected prompt
        context, with preserved section, line-item, period, and metric references.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        {context.insights.map((insight) => (
          <article
            key={insight.insightId}
            style={{
              border: "1px solid #e2e8f0",
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
              <span style={{ fontSize: 10, color: "#475569" }}>{insight.insightId}</span>
            </div>

            <h3 style={{ fontSize: 14, margin: "0 0 6px 0" }}>{insight.title}</h3>
            <p style={{ fontSize: 12, color: "#374151", marginTop: 0, marginBottom: 8 }}>
              {insight.explanation}
            </p>

            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>
              {[insight.category, insight.subcategory, insight.section, insight.subsection, insight.lineItem, insight.period]
                .filter(Boolean)
                .join(" / ")}
            </div>

            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <tbody>
                {insight.supportingMetrics.map((metric) => (
                  <tr key={`${insight.insightId}-${metric.label}`}>
                    <td
                      style={{
                        ...cellStyle(),
                        fontWeight: 600,
                        background: "#f8fafc"
                      }}
                    >
                      {metric.label}
                    </td>
                    <td style={{ ...cellStyle(), textAlign: "right" }}>
                      {fmtContextValue(metric.value, metric.unit)}
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

function StatPill(props: { label: string; value: string }) {
  return (
    <span
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid #cbd5e1",
        background: "#f8fafc",
        color: "#0f172a",
        fontWeight: 600
      }}
    >
      {props.label}: {props.value}
    </span>
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

function fmtContextValue(
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

function fmtPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return ""
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}%`
}

function varianceColor(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined || value === 0) return undefined
  return value > 0 ? "#15803d" : "#b91c1c"
}

function severityColor(severity: NarrativeHighlight["severity"]): string {
  if (severity === "high") return "#b91c1c"
  if (severity === "medium") return "#c2410c"
  return "#166534"
}

function severityBackground(severity: NarrativeHighlight["severity"]): string {
  if (severity === "high") return "#fef2f2"
  if (severity === "medium") return "#fff7ed"
  return "#f0fdf4"
}
