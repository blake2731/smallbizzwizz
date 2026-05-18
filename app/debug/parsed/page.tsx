import fs from "node:fs/promises"
import path from "node:path"
import Link from "next/link"
import {
  parseCypressWorkbook,
  type FinancialRecord,
  type SheetParse,
  type ValidationIssue
} from "@/lib/parsers/cypress"

export const dynamic = "force-dynamic"

export default async function ParsedDebugPage() {
  const filePath = path.join(process.cwd(), "app", "debug", "Cypress.xlsx")
  const buffer = await fs.readFile(filePath)

  const sheets = await parseCypressWorkbook(buffer)

  const totalIssues = sheets.reduce((n, s) => n + s.issues.length, 0)
  const totalRecords = sheets.reduce((n, s) => n + s.records.length, 0)

  return (
    <main style={{ padding: 24, fontFamily: "ui-monospace, Menlo, monospace", color: "#111", background: "#fafafa" }}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/debug" style={{ color: "#2563eb" }}>← raw inspector</Link>
      </div>

      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Parsed semantic records — Cypress.xlsx</h1>
      <p style={{ fontSize: 12, color: "#555", marginTop: 0 }}>
        Deterministic parser output. {totalRecords} records, {totalIssues} validation issues.
        Hierarchy keyed off outline level + label-presence + value-presence. No AI in the parsing or math layer.
      </p>

      <SheetSummary sheets={sheets} />

      {sheets.map((s) => (
        <SheetView key={s.sheetName} sheet={s} />
      ))}
    </main>
  )
}

function SheetSummary({ sheets }: { sheets: SheetParse[] }) {
  return (
    <section style={{ background: "white", padding: 16, border: "1px solid #ddd", borderRadius: 6, marginBottom: 16 }}>
      <h2 style={{ fontSize: 16, marginTop: 0 }}>Per-sheet summary</h2>
      <table style={{ fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
            {["Sheet", "Format", "Records", "Headers", "Totals", "Line items", "Hidden", "Issues"].map((h) => (
              <th key={h} style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sheets.map((s) => {
            const headers = s.records.filter((r) => r.isHeader).length
            const totals = s.records.filter((r) => r.isTotal).length
            const items = s.records.filter((r) => !r.isHeader && !r.isTotal).length
            const hidden = s.records.filter((r) => r.isHidden).length
            return (
              <tr key={s.sheetName}>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{s.sheetName}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{s.format}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{s.records.length}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{headers}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{totals}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{items}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{hidden}</td>
                <td
                  style={{
                    padding: "6px 10px",
                    border: "1px solid #ddd",
                    color: s.issues.length === 0 ? "#15803d" : "#b91c1c",
                    fontWeight: 600
                  }}
                >
                  {s.issues.length}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function SheetView({ sheet }: { sheet: SheetParse }) {
  return (
    <section style={{ background: "white", padding: 16, border: "1px solid #ddd", borderRadius: 6, marginBottom: 24 }}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>{sheet.sheetName}</h2>

      {sheet.notes.length > 0 && (
        <div
          style={{
            background: "#fff7ed",
            border: "1px solid #fdba74",
            padding: 10,
            borderRadius: 4,
            fontSize: 12,
            marginBottom: 12
          }}
        >
          {sheet.notes.map((n, i) => (
            <div key={i}>{n}</div>
          ))}
        </div>
      )}

      {sheet.format !== "actual_vs_budget" ? null : (
        <>
          <IssuesPanel issues={sheet.issues} />
          <RecordsTable records={sheet.records} />
        </>
      )}
    </section>
  )
}

function IssuesPanel({ issues }: { issues: ValidationIssue[] }) {
  if (issues.length === 0) {
    return (
      <div
        style={{
          background: "#f0fdf4",
          border: "1px solid #86efac",
          color: "#15803d",
          padding: 10,
          borderRadius: 4,
          fontSize: 12,
          marginBottom: 12,
          fontWeight: 600
        }}
      >
        All child sums reconcile to totals within $0.50 tolerance.
      </div>
    )
  }

  return (
    <details
      open
      style={{
        background: "#fef2f2",
        border: "1px solid #fca5a5",
        padding: 10,
        borderRadius: 4,
        marginBottom: 12
      }}
    >
      <summary style={{ cursor: "pointer", fontWeight: 600, color: "#b91c1c" }}>
        {issues.length} validation issue{issues.length === 1 ? "" : "s"} — child sums do not match the bold-total row
      </summary>
      <table style={{ fontSize: 11, borderCollapse: "collapse", marginTop: 8, width: "100%" }}>
        <thead>
          <tr style={{ background: "#fee2e2", textAlign: "left" }}>
            {["Row", "Field", "Expected", "Child sum", "Diff", "n", "Path"].map((h) => (
              <th key={h} style={{ padding: "4px 8px", border: "1px solid #fca5a5" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {issues.map((i, idx) => (
            <tr key={idx}>
              <td style={{ padding: "4px 8px", border: "1px solid #fecaca" }}>{i.totalRowNumber}</td>
              <td style={{ padding: "4px 8px", border: "1px solid #fecaca" }}>{i.field}</td>
              <td style={{ padding: "4px 8px", border: "1px solid #fecaca", textAlign: "right" }}>{fmt(i.expected)}</td>
              <td style={{ padding: "4px 8px", border: "1px solid #fecaca", textAlign: "right" }}>{fmt(i.childSum)}</td>
              <td style={{ padding: "4px 8px", border: "1px solid #fecaca", textAlign: "right", fontWeight: 600 }}>{fmt(i.diff)}</td>
              <td style={{ padding: "4px 8px", border: "1px solid #fecaca", textAlign: "right" }}>{i.childCount}</td>
              <td style={{ padding: "4px 8px", border: "1px solid #fecaca" }}>
                {[i.section, i.subsection, i.lineItem].filter(Boolean).join(" / ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

function RecordsTable({ records }: { records: FinancialRecord[] }) {
  return (
    <details open>
      <summary style={{ cursor: "pointer", fontWeight: 600, margin: "8px 0" }}>
        Semantic records ({records.length})
      </summary>
      <div style={{ maxHeight: 600, overflow: "auto", border: "1px solid #ddd" }}>
        <table style={{ fontSize: 11, borderCollapse: "collapse", width: "100%" }}>
          <thead style={{ position: "sticky", top: 0, background: "#f0f0f0", zIndex: 1 }}>
            <tr>
              {[
                "Row", "Lvl", "Flag", "Section", "Subsection", "Line item",
                "Actual", "PPD", "Budget", "Bgt PPD", "Var", "Var PPD"
              ].map((h) => (
                <th key={h} style={{ padding: "4px 6px", border: "1px solid #ddd", textAlign: "left" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={`${r.rowNumber}-${r.outlineLevel}`} style={rowStyle(r)}>
                <td style={cellStyle({ color: "#888" })}>{r.rowNumber}</td>
                <td style={cellStyle()}>{r.outlineLevel}</td>
                <td style={cellStyle({ fontWeight: 600 })}>{flagText(r)}</td>
                <td style={cellStyle()}>{r.section ?? ""}</td>
                <td style={cellStyle()}>{r.subsection ?? ""}</td>
                <td style={cellStyle({
                  fontWeight: r.isHeader || r.isTotal ? 700 : 400,
                  paddingLeft: 6 + r.outlineLevel * 12
                })}>{r.lineItem}</td>
                <td style={cellStyle({ textAlign: "right" })}>{fmt(r.actual)}</td>
                <td style={cellStyle({ textAlign: "right" })}>{fmt(r.actualPpd)}</td>
                <td style={cellStyle({ textAlign: "right" })}>{fmt(r.budget)}</td>
                <td style={cellStyle({ textAlign: "right" })}>{fmt(r.budgetPpd)}</td>
                <td style={cellStyle({ textAlign: "right", color: varianceColor(r.variance) })}>{fmt(r.variance)}</td>
                <td style={cellStyle({ textAlign: "right", color: varianceColor(r.variancePpd) })}>{fmt(r.variancePpd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function rowStyle(r: FinancialRecord): React.CSSProperties {
  if (r.isHeader) return { background: "#eff6ff" }
  if (r.isTotal && r.outlineLevel === 0) return { background: "#fef3c7" }
  if (r.isTotal) return { background: "#fefce8" }
  if (r.isHidden) return { background: "#fafafa", opacity: 0.55 }
  return {}
}

function cellStyle(extra: React.CSSProperties = {}): React.CSSProperties {
  return { padding: "2px 6px", border: "1px solid #eee", whiteSpace: "nowrap", ...extra }
}

function flagText(r: FinancialRecord): string {
  const parts: string[] = []
  if (r.isHeader) parts.push("HDR")
  if (r.isTotal) parts.push("TOT")
  if (r.isHidden) parts.push("hid")
  return parts.join(" ")
}

function fmt(v: number | null | undefined): string {
  if (v === null || v === undefined) return ""
  return v.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function varianceColor(v: number | null | undefined): string | undefined {
  if (v === null || v === undefined || v === 0) return undefined
  return v > 0 ? "#15803d" : "#b91c1c"
}
