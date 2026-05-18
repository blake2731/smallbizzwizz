import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { notFound, redirect } from "next/navigation"
import {
  loadFacilityDashboardData,
  type DashboardTrendPoint,
  type FacilityDashboardData,
  type PersistedInsightView,
  type PersistedNarrativeView
} from "@/lib/verticals/nursing-home/dashboard"

export const dynamic = "force-dynamic"

export default async function FacilityDashboardPage(props: {
  params: Promise<{
    facilityId: string
  }>
  searchParams: Promise<{
    uploadId?: string | string[]
  }>
}) {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const params = await props.params
  const searchParams = await props.searchParams
  const uploadId = firstValue(searchParams.uploadId)

  const data = await loadFacilityDashboardData({
    userId,
    facilityId: params.facilityId,
    uploadId
  })

  if (!data) notFound()

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(26, 94, 150, 0.08), transparent 28%), linear-gradient(180deg, #f3f7fb 0%, #f8fafc 48%, #ffffff 100%)",
        color: "#12283b",
        fontFamily: "'DM Sans', system-ui, sans-serif",
        padding: "28px 18px 48px"
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 18 }}>
        <TopBar />

        <DashboardHeader data={data} />

        <StatusBanner data={data} />

        <ExecutiveSummarySection narratives={data.narratives} />

        <InsightsSection
          title="Critical Insights"
          subtitle="Highest-severity insight packets are surfaced first, with deterministic triggers and metric traceability."
          insights={data.criticalInsights}
        />

        <FinancialPerformanceSection trends={data.trends} />

        <InsightsSection
          title="Operational Risks"
          subtitle="Focused on census softening, labor pressure, abnormal expenses, margin compression, and deterioration signals."
          insights={data.operationalRisks}
        />
      </div>
    </main>
  )
}

function TopBar() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12
      }}
    >
      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 1.1,
            textTransform: "uppercase",
            color: "#55728f"
          }}
        >
          Skilled Nursing Operational Intelligence
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Link href="/upload" style={topLinkStyle}>
          Upload workbook
        </Link>
        <Link href="/chat" style={topLinkStyle}>
          Back to app
        </Link>
      </div>
    </div>
  )
}

function DashboardHeader({ data }: { data: FacilityDashboardData }) {
  if (!data.selectedSnapshot) {
    return (
      <section style={panelStyle}>
        <h1 style={headerTitleStyle}>{data.facility.name}</h1>
        <p style={subtleTextStyle}>
          No reporting snapshots are available yet for this facility.
        </p>
        <Link href="/upload" style={primaryLinkStyle}>
          Upload first workbook
        </Link>
      </section>
    )
  }

  const snapshot = data.selectedSnapshot
  const integrityScore = snapshot.integrityScore ?? 0
  const validationStats = snapshot.validationStats

  return (
    <section style={panelStyle}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.5fr) minmax(260px, 0.9fr)",
          gap: 20
        }}
      >
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            <Badge label={snapshot.status.replace(/_/g, " ")} tone={statusTone(snapshot.status)} />
            <Badge label={`${integrityScore}/100 integrity`} tone={integrityTone(integrityScore)} />
          </div>

          <h1 style={headerTitleStyle}>{data.facility.name}</h1>
          <div style={{ fontSize: 16, color: "#395670", marginBottom: 12 }}>
            {snapshot.label} snapshot
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              fontSize: 13,
              color: "#55728f",
              marginBottom: 18
            }}
          >
            <span>Uploaded {formatDateTime(snapshot.uploadedAt)}</span>
            <span>Workbook period {snapshot.sourcePeriodLabel ?? snapshot.label}</span>
            <span>{validationStats?.supportedSheetCount ?? 0} supported sheet(s)</span>
            <span>{validationStats?.totalIssueCount ?? 0} validation issue(s)</span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {data.snapshots.map((entry) => (
              <Link
                key={entry.uploadId}
                href={`/facilities/${data.facility.id}?uploadId=${entry.uploadId}`}
                style={{
                  textDecoration: "none",
                  padding: "8px 12px",
                  borderRadius: 999,
                  background:
                    entry.uploadId === snapshot.uploadId ? "#dbeafe" : "#f8fbff",
                  color:
                    entry.uploadId === snapshot.uploadId ? "#1d4ed8" : "#31506a",
                  border:
                    entry.uploadId === snapshot.uploadId
                      ? "1px solid #93c5fd"
                      : "1px solid #dbe3ee",
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {entry.label}
              </Link>
            ))}
          </div>
        </div>

        <div
          style={{
            background: "#f8fbff",
            border: "1px solid #dbe3ee",
            borderRadius: 18,
            padding: 18,
            display: "grid",
            gap: 12
          }}
        >
          <MetricLine
            label="Workbook integrity"
            value={`${integrityScore}/100`}
            detail="Deterministic score from supported sheets, validation issues, and normalized output completeness."
          />
          <MetricLine
            label="Issue-free supported sheets"
            value={`${validationStats?.supportedIssueFreeSheetCount ?? 0}/${validationStats?.supportedSheetCount ?? 0}`}
            detail="Higher is better."
          />
          <MetricLine
            label="Normalized records"
            value={String(validationStats?.normalizedRecordCount ?? 0)}
            detail={`${validationStats?.leafRecordCount ?? 0} leaf records carried into analytics.`}
          />
          <MetricLine
            label="Snapshot state"
            value={snapshot.status.replace(/_/g, " ")}
            detail="Operators can see when processing succeeded, partially succeeded, or failed."
          />
        </div>
      </div>
    </section>
  )
}

function StatusBanner({ data }: { data: FacilityDashboardData }) {
  const snapshot = data.selectedSnapshot
  if (!snapshot) return null

  const warnings = snapshot.diagnostics?.warnings ?? []
  const processingErrors = snapshot.processingErrors ?? []
  if (
    snapshot.status === "completed" &&
    warnings.length === 0 &&
    processingErrors.length === 0
  ) {
    return null
  }

  const tone =
    snapshot.status === "failed_validation" ||
    snapshot.status === "failed_normalization" ||
    snapshot.status === "failed_processing"
      ? {
          background: "#fff1f2",
          border: "#fecdd3",
          color: "#9f1239"
        }
      : snapshot.status === "processing"
        ? {
            background: "#eff6ff",
            border: "#bfdbfe",
            color: "#1d4ed8"
          }
        : {
            background: "#fff7ed",
            border: "#fdba74",
            color: "#c2410c"
          }

  return (
    <section
      style={{
        ...panelStyle,
        background: tone.background,
        border: `1px solid ${tone.border}`,
        color: tone.color
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
        {statusHeadline(snapshot.status)}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.7 }}>
        {warnings.length > 0 || processingErrors.length > 0
          ? [...processingErrors, ...warnings].map((warning, index) => (
              <div key={`${warning.stage}-${index}`}>
                {warning.message}
                {warning.detail ? ` ${warning.detail}` : ""}
              </div>
            ))
          : "This snapshot is still processing or encountered a visible issue. Diagnostics are preserved so operators can trust what is available and what is not."}
      </div>
    </section>
  )
}

function ExecutiveSummarySection({
  narratives
}: {
  narratives: PersistedNarrativeView[]
}) {
  const byAudience = new Map(narratives.map((entry) => [entry.audience, entry]))
  const audiences = [
    ["administrator", "Administrator summary"],
    ["finance", "Finance summary"],
    ["operations", "Operations summary"]
  ] as const

  return (
    <section style={panelStyle}>
      <SectionHeading
        title="Executive Summary"
        subtitle="AI narratives sit on top of persisted insight packets and validated metrics rather than raw workbook rows."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14
        }}
      >
        {audiences.map(([audience, label]) => (
          <NarrativeCard
            key={audience}
            label={label}
            narrative={byAudience.get(audience) ?? null}
          />
        ))}
      </div>
    </section>
  )
}

function NarrativeCard({
  label,
  narrative
}: {
  label: string
  narrative: PersistedNarrativeView | null
}) {
  const generated = narrative?.status === "generated" && narrative.narrativeText

  return (
    <article
      style={{
        border: "1px solid #dbe3ee",
        borderRadius: 18,
        background: "#fbfdff",
        padding: 18,
        display: "grid",
        gap: 10
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{label}</div>
        <Badge
          label={narrative?.status ?? "missing"}
          tone={
            narrative?.status === "generated"
              ? "positive"
              : narrative?.status === "skipped" || narrative?.status === "error"
                ? "warning"
                : "neutral"
          }
        />
      </div>

      <div style={{ fontSize: 14, lineHeight: 1.8, color: "#24384b", whiteSpace: "pre-wrap" }}>
        {generated
          ? narrative.narrativeText
          : narrative?.status === "skipped"
            ? "Narrative unavailable for this audience in the current environment. Deterministic insights and metrics remain available below."
            : narrative?.status === "error"
              ? narrative.errorMessage ?? "Narrative generation failed for this audience."
              : "Narrative has not been generated for this snapshot."}
      </div>
    </article>
  )
}

function InsightsSection(props: {
  title: string
  subtitle: string
  insights: PersistedInsightView[]
}) {
  return (
    <section style={panelStyle}>
      <SectionHeading title={props.title} subtitle={props.subtitle} />

      {props.insights.length === 0 ? (
        <div style={emptyStateStyle}>
          No persisted insight packets are available for this section.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {props.insights.map((insight, index) => (
            <InsightCard key={insight.id} insight={insight} defaultOpen={index === 0} />
          ))}
        </div>
      )}
    </section>
  )
}

function InsightCard({
  insight,
  defaultOpen
}: {
  insight: PersistedInsightView
  defaultOpen: boolean
}) {
  return (
    <details
      open={defaultOpen}
      style={{
        border: "1px solid #dbe3ee",
        borderRadius: 18,
        background: "#fbfdff",
        overflow: "hidden"
      }}
    >
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          padding: 18
        }}
      >
        <div style={{ display: "grid", gap: 10 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap"
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Badge label={insight.severity} tone={severityTone(insight.severity)} />
              <Badge label={insight.trendDirection} tone={trendTone(insight.trendDirection)} />
            </div>
            <div style={{ fontSize: 12, color: "#58748f" }}>
              {insight.period ?? "Current snapshot"}
            </div>
          </div>

          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.4 }}>
            {insight.title}
          </div>

          <div style={{ fontSize: 14, lineHeight: 1.8, color: "#38546c" }}>
            {insight.explanation}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {insight.supportingMetrics.slice(0, 3).map((metric) => (
              <MetricChip
                key={`${insight.id}-${metric.label}`}
                label={metric.label}
                value={formatMetricValue(metric.value, metric.unit)}
              />
            ))}
          </div>
        </div>
      </summary>

      <div
        style={{
          borderTop: "1px solid #e4ebf3",
          padding: 18,
          display: "grid",
          gap: 18
        }}
      >
        <MetadataGrid
          rows={[
            ["Why it triggered", insight.triggerReason ?? insight.explanation],
            [
              "Normalized financial categories",
              [insight.category, insight.subcategory].filter(Boolean).join(" / ") || "n/a"
            ],
            [
              "Source path",
              [insight.section, insight.subsection, insight.lineItem]
                .filter(Boolean)
                .join(" / ") || "n/a"
            ],
            [
              "Periods involved",
              insight.periodsInvolved.length > 0
                ? insight.periodsInvolved.join(", ")
                : insight.period ?? "n/a"
            ]
          ]}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 18
          }}
        >
          <div>
            <div style={miniHeadingStyle}>Thresholds exceeded</div>
            {insight.thresholdsExceeded.length === 0 ? (
              <div style={miniEmptyStyle}>
                Threshold metadata is not available for this packet.
              </div>
            ) : (
              <table style={compactTableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeadStyle}>Rule</th>
                    <th style={{ ...tableHeadStyle, textAlign: "right" }}>Actual</th>
                    <th style={{ ...tableHeadStyle, textAlign: "right" }}>Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {insight.thresholdsExceeded.map((entry) => (
                    <tr key={`${insight.id}-${entry.label}`}>
                      <td style={tableCellStyle}>{entry.label}</td>
                      <td style={{ ...tableCellStyle, textAlign: "right" }}>
                        {formatMetricValue(entry.actual, entry.unit)}
                      </td>
                      <td style={{ ...tableCellStyle, textAlign: "right" }}>
                        {entry.comparator} {formatMetricValue(entry.threshold, entry.unit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <div style={miniHeadingStyle}>Supporting metrics</div>
            <table style={compactTableStyle}>
              <tbody>
                {insight.supportingMetrics.map((metric) => (
                  <tr key={`${insight.id}-${metric.label}`}>
                    <td style={tableCellStyle}>{metric.label}</td>
                    <td style={{ ...tableCellStyle, textAlign: "right" }}>
                      {formatMetricValue(metric.value, metric.unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </details>
  )
}

function FinancialPerformanceSection({
  trends
}: {
  trends: FacilityDashboardData["trends"]
}) {
  const cards: Array<[string, string, DashboardTrendPoint[]]> = [
    [
      "Revenue trends",
      "Current reporting-period revenue across recent facility snapshots.",
      trends.revenue
    ],
    [
      "Labor trends",
      "Labor movement across recent facility snapshots.",
      trends.labor
    ],
    [
      "Margin trends",
      "Net income or EBITDARM trend carried through persisted reporting snapshots.",
      trends.margin
    ],
    [
      "Expense trends",
      "Operating expense movement across recent facility snapshots.",
      trends.expenses
    ]
  ]

  return (
    <section style={panelStyle}>
      <SectionHeading
        title="Financial Performance"
        subtitle="Each trend card uses persisted facility snapshots and reporting-period-aligned records, not debug-only workbook state."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: 14
        }}
      >
        {cards.map(([title, subtitle, points]) => (
          <TrendCard key={title} title={title} subtitle={subtitle} points={points} />
        ))}
      </div>
    </section>
  )
}

function TrendCard({
  title,
  subtitle,
  points
}: {
  title: string
  subtitle: string
  points: DashboardTrendPoint[]
}) {
  const latest = points.at(-1) ?? null
  const previous = points.length > 1 ? points.at(-2) ?? null : null
  const periodDelta = latest
    ? calculateDelta(latest.actual, previous?.actual ?? null)
    : null

  return (
    <article
      style={{
        border: "1px solid #dbe3ee",
        borderRadius: 18,
        background: "#fbfdff",
        padding: 18,
        display: "grid",
        gap: 12
      }}
    >
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "#5b748b" }}>{subtitle}</div>
      </div>

      {latest ? (
        <>
          <div
            style={{
              display: "grid",
              gap: 6,
              padding: 14,
              background: "#f5f9fd",
              borderRadius: 14,
              border: "1px solid #e1eaf3"
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: "#57748e" }}>
              {latest.label}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em" }}>
              {formatFinancialNumber(latest.actual)}
            </div>
            <div style={{ fontSize: 13, color: "#4b657d" }}>
              Budget {formatFinancialNumber(latest.budget)} · Variance{" "}
              <span style={{ color: varianceColor(latest.variance) }}>
                {formatFinancialNumber(latest.variance)}
              </span>
            </div>
            <div style={{ fontSize: 13, color: "#4b657d" }}>
              Budget delta {formatPercent(latest.percentChange)} · Period change{" "}
              <span style={{ color: varianceColor(periodDelta) }}>
                {formatFinancialNumber(periodDelta)}
              </span>
            </div>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {points.slice(-4).map((point) => (
              <div
                key={`${title}-${point.label}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  alignItems: "center"
                }}
              >
                <div style={{ fontSize: 13, color: "#4b657d" }}>{point.label}</div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {formatFinancialNumber(point.actual)}
                  </div>
                  <div style={{ fontSize: 12, color: varianceColor(point.variance) }}>
                    {formatFinancialNumber(point.variance)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={emptyStateStyle}>No persisted trend data is available yet.</div>
      )}
    </article>
  )
}

function MetricLine(props: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 4
        }}
      >
        <div style={{ fontSize: 13, color: "#58748f" }}>{props.label}</div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{props.value}</div>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6, color: "#6a8197" }}>{props.detail}</div>
    </div>
  )
}

function SectionHeading(props: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h2
        style={{
          fontFamily: "Georgia, serif",
          fontSize: "1.55rem",
          fontWeight: 400,
          letterSpacing: "-0.03em",
          margin: "0 0 8px 0"
        }}
      >
        {props.title}
      </h2>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: "#5b748b" }}>{props.subtitle}</div>
    </div>
  )
}

function MetadataGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 12
      }}
    >
      {rows.map(([label, value]) => (
        <div
          key={label}
          style={{
            background: "#f8fbff",
            border: "1px solid #e1eaf3",
            borderRadius: 14,
            padding: 12
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "#5a7690", marginBottom: 6 }}>
            {label}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: "#24384b" }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "7px 10px",
        borderRadius: 999,
        background: "#eef5fb",
        border: "1px solid #d6e6f5",
        fontSize: 12
      }}
    >
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span style={{ color: "#4d6982" }}>{value}</span>
    </div>
  )
}

function Badge({
  label,
  tone
}: {
  label: string
  tone: "critical" | "warning" | "positive" | "neutral" | "info"
}) {
  const colors = {
    critical: { background: "#fff1f2", border: "#fecdd3", color: "#9f1239" },
    warning: { background: "#fff7ed", border: "#fdba74", color: "#c2410c" },
    positive: { background: "#ecfdf5", border: "#a7f3d0", color: "#047857" },
    neutral: { background: "#f5f8fb", border: "#dbe3ee", color: "#46627a" },
    info: { background: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8" }
  }
  const color = colors[tone]

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        border: `1px solid ${color.border}`,
        background: color.background,
        color: color.color,
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        padding: "5px 8px"
      }}
    >
      {label}
    </span>
  )
}

function firstValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function statusHeadline(status: string): string {
  if (status === "processing") return "Facility snapshot is processing"
  if (status === "failed_validation") return "Validation failure"
  if (status === "failed_normalization") return "Normalization failure"
  if (status === "failed_processing") return "Processing failure"
  if (status === "partial") return "Partial success"
  return "Snapshot complete"
}

function statusTone(status: string): "critical" | "warning" | "positive" | "info" | "neutral" {
  if (status === "completed") return "positive"
  if (status === "processing") return "info"
  if (status === "partial") return "warning"
  if (status.startsWith("failed")) return "critical"
  return "neutral"
}

function integrityTone(score: number): "critical" | "warning" | "positive" {
  if (score >= 90) return "positive"
  if (score >= 70) return "warning"
  return "critical"
}

function severityTone(severity: string): "critical" | "warning" | "positive" {
  if (severity === "high") return "critical"
  if (severity === "medium") return "warning"
  return "positive"
}

function trendTone(
  trend: string
): "critical" | "warning" | "positive" | "neutral" {
  if (trend === "deteriorating") return "critical"
  if (trend === "mixed") return "warning"
  if (trend === "improving") return "positive"
  return "neutral"
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value)
}

function formatFinancialNumber(value: number | null): string {
  if (value === null || value === undefined) return "n/a"
  if (Math.abs(value) <= 1 && value !== 0) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  }

  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  })
}

function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return "n/a"
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  })}%`
}

function formatMetricValue(
  value: number | string | null,
  unit?: "currency" | "percent" | "ppd" | "count"
): string {
  if (value === null || value === undefined) return "n/a"
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

function calculateDelta(
  current: number | null,
  previous: number | null
): number | null {
  if (current === null && previous === null) return null
  return (current ?? 0) - (previous ?? 0)
}

function varianceColor(value: number | null | undefined): string | undefined {
  if (value === null || value === undefined || value === 0) return undefined
  return value > 0 ? "#0f766e" : "#b91c1c"
}

const topLinkStyle: React.CSSProperties = {
  textDecoration: "none",
  color: "#17497a",
  fontWeight: 700,
  fontSize: 14
}

const primaryLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  borderRadius: 999,
  background: "#17497a",
  color: "white",
  padding: "12px 18px",
  fontSize: 14,
  fontWeight: 700,
  width: "fit-content"
}

const panelStyle: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.88)",
  border: "1px solid #dbe3ee",
  borderRadius: 24,
  padding: 22,
  backdropFilter: "blur(10px)"
}

const headerTitleStyle: React.CSSProperties = {
  fontFamily: "Georgia, serif",
  fontSize: "2.15rem",
  fontWeight: 400,
  letterSpacing: "-0.035em",
  margin: "0 0 6px 0"
}

const subtleTextStyle: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.7,
  color: "#5b748b"
}

const emptyStateStyle: React.CSSProperties = {
  border: "1px dashed #c9d8e7",
  borderRadius: 18,
  padding: 18,
  background: "#f9fbfd",
  fontSize: 14,
  color: "#5b748b"
}

const miniHeadingStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#4d6a84",
  marginBottom: 8
}

const miniEmptyStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#60798f",
  lineHeight: 1.6,
  padding: "10px 0"
}

const compactTableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12
}

const tableHeadStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #dbe3ee",
  color: "#5a7690",
  fontWeight: 700,
  textAlign: "left"
}

const tableCellStyle: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: "1px solid #edf2f7",
  color: "#22384a"
}
