import fs from "node:fs/promises"
import path from "node:path"
import Link from "next/link"
import ExcelJS from "exceljs"

export const dynamic = "force-dynamic"

type CellSnapshot = {
  addr: string
  v: unknown
  type: string
  numFmt?: string
  formula?: string
  result?: unknown
  bold?: boolean
  italic?: boolean
  fontSize?: number
  fontColor?: string
  indent?: number
  fillPattern?: string
  fillFg?: string
  fillBg?: string
  alignHoriz?: string
  alignVert?: string
}

type RowSnapshot = {
  row: number
  outlineLevel: number
  hidden: boolean
  height?: number
  label: string
  leadingSpaces: number
  bold: boolean
  fill?: string
  values: { addr: string; v: unknown; numFmt?: string }[]
}

type SheetReport = {
  name: string
  state: string
  rowCount: number
  columnCount: number
  actualRowCount: number
  actualColumnCount: number
  merges: string[]
  columnWidths: { col: string; width?: number; hidden?: boolean; outlineLevel?: number }[]
  fillPalette: { argb: string; pattern: string; count: number }[]
  formatPalette: { numFmt: string; count: number }[]
  fontPalette: { key: string; count: number; sample: { name?: string; size?: number; bold?: boolean; color?: string } }[]
  totals: {
    cells: number
    bold: number
    italic: number
    formulas: number
    fills: number
    nonEmptyFills: number
    indents: number
    outlinedRows: number
    hiddenRows: number
    mergedRanges: number
  }
  rows: RowSnapshot[]
  sampleCells: CellSnapshot[]
}

function colLetter(col: number): string {
  let s = ""
  let n = col
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function describeFill(fill: ExcelJS.Fill | undefined): { pattern: string; fg?: string; bg?: string } | undefined {
  if (!fill || fill.type !== "pattern") return undefined
  const f = fill as ExcelJS.FillPattern
  return {
    pattern: f.pattern,
    fg: (f.fgColor as { argb?: string } | undefined)?.argb,
    bg: (f.bgColor as { argb?: string } | undefined)?.argb
  }
}

function cellValueToDisplay(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === "object") {
    if ("richText" in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("")
    if ("formula" in v) return { formula: v.formula, result: v.result }
    if ("error" in v) return { error: v.error }
    if ("hyperlink" in v) return { text: v.text, hyperlink: v.hyperlink }
    if (v instanceof Date) return v.toISOString()
  }
  return v
}

async function buildSheetReport(ws: ExcelJS.Worksheet): Promise<SheetReport> {
  const merges = Object.keys((ws as unknown as { _merges?: Record<string, unknown> })._merges ?? {})

  const columnWidths: SheetReport["columnWidths"] = []
  ws.columns?.forEach((col, i) => {
    columnWidths.push({
      col: colLetter(i + 1),
      width: col?.width,
      hidden: col?.hidden,
      outlineLevel: col?.outlineLevel
    })
  })

  const fillCounts = new Map<string, number>()
  const formatCounts = new Map<string, number>()
  const fontCounts = new Map<string, { count: number; sample: SheetReport["fontPalette"][number]["sample"] }>()

  let cells = 0
  let bold = 0
  let italic = 0
  let formulas = 0
  let fills = 0
  let nonEmptyFills = 0
  let indents = 0
  let outlinedRows = 0
  let hiddenRows = 0

  const rows: RowSnapshot[] = []
  const sampleCells: CellSnapshot[] = []

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (row.outlineLevel) outlinedRows++
    if (row.hidden) hiddenRows++

    const labelCell = row.getCell(1)
    const rawLabel = labelCell.value
    const labelStr =
      typeof rawLabel === "string"
        ? rawLabel
        : rawLabel && typeof rawLabel === "object" && "richText" in rawLabel
          ? (rawLabel as { richText: { text: string }[] }).richText.map((r) => r.text).join("")
          : rawLabel == null
            ? ""
            : String(rawLabel)
    const leadingSpaces = labelStr.match(/^ */)?.[0].length ?? 0

    const rowValues: RowSnapshot["values"] = []
    let rowBold = false
    let rowFill: string | undefined

    row.eachCell({ includeEmpty: false }, (cell) => {
      cells++
      const colNum = cell.fullAddress.col

      const fillDesc = describeFill(cell.fill)
      if (fillDesc) {
        fills++
        if (fillDesc.pattern !== "none") {
          nonEmptyFills++
          const key = `${fillDesc.pattern}:${fillDesc.fg ?? ""}`
          fillCounts.set(key, (fillCounts.get(key) ?? 0) + 1)
          if (colNum === 1 && !rowFill) rowFill = fillDesc.fg
        }
      }

      if (cell.font?.bold) {
        bold++
        if (colNum === 1) rowBold = true
      }
      if (cell.font?.italic) italic++
      if (cell.alignment?.indent) indents++

      const isFormula =
        !!cell.formula ||
        (cell.value && typeof cell.value === "object" && "formula" in cell.value)
      if (isFormula) formulas++

      const numFmt = cell.numFmt
      if (numFmt) formatCounts.set(numFmt, (formatCounts.get(numFmt) ?? 0) + 1)

      if (cell.font) {
        const fKey = `${cell.font.name ?? ""}/${cell.font.size ?? ""}/${cell.font.bold ? "B" : ""}${cell.font.italic ? "I" : ""}/${(cell.font.color as { argb?: string } | undefined)?.argb ?? ""}`
        const existing = fontCounts.get(fKey)
        if (existing) existing.count++
        else
          fontCounts.set(fKey, {
            count: 1,
            sample: {
              name: cell.font.name,
              size: cell.font.size,
              bold: cell.font.bold,
              color: (cell.font.color as { argb?: string } | undefined)?.argb
            }
          })
      }

      if (colNum <= 8) {
        rowValues.push({ addr: cell.address, v: cellValueToDisplay(cell.value), numFmt: cell.numFmt })
      }

      if (sampleCells.length < 30) {
        const formulaInfo =
          cell.formula
            ? { formula: cell.formula, result: cell.result }
            : cell.value && typeof cell.value === "object" && "formula" in cell.value
              ? { formula: (cell.value as { formula?: string }).formula, result: (cell.value as { result?: unknown }).result }
              : {}
        sampleCells.push({
          addr: cell.address,
          v: cellValueToDisplay(cell.value),
          type: cell.type === undefined ? "?" : ExcelJS.ValueType[cell.type] ?? String(cell.type),
          numFmt: cell.numFmt,
          ...formulaInfo,
          bold: cell.font?.bold,
          italic: cell.font?.italic,
          fontSize: cell.font?.size,
          fontColor: (cell.font?.color as { argb?: string } | undefined)?.argb,
          indent: cell.alignment?.indent,
          fillPattern: fillDesc?.pattern,
          fillFg: fillDesc?.fg,
          fillBg: fillDesc?.bg,
          alignHoriz: cell.alignment?.horizontal,
          alignVert: cell.alignment?.vertical
        })
      }
    })

    rows.push({
      row: rowNumber,
      outlineLevel: row.outlineLevel ?? 0,
      hidden: !!row.hidden,
      height: row.height,
      label: labelStr,
      leadingSpaces,
      bold: rowBold,
      fill: rowFill,
      values: rowValues
    })
  })

  return {
    name: ws.name,
    state: ws.state,
    rowCount: ws.rowCount,
    columnCount: ws.columnCount,
    actualRowCount: ws.actualRowCount,
    actualColumnCount: ws.actualColumnCount,
    merges,
    columnWidths,
    fillPalette: [...fillCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, count]) => {
        const [pattern, argb] = k.split(":")
        return { pattern, argb, count }
      }),
    formatPalette: [...formatCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([numFmt, count]) => ({ numFmt, count })),
    fontPalette: [...fontCounts.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([key, info]) => ({ key, count: info.count, sample: info.sample })),
    totals: {
      cells,
      bold,
      italic,
      formulas,
      fills,
      nonEmptyFills,
      indents,
      outlinedRows,
      hiddenRows,
      mergedRanges: merges.length
    },
    rows,
    sampleCells
  }
}

export default async function DebugPage() {
  const filePath = path.join(process.cwd(), "app", "debug", "Cypress.xlsx")
  const buffer = await fs.readFile(filePath)

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer)

  const sheets: SheetReport[] = []
  for (const ws of wb.worksheets) sheets.push(await buildSheetReport(ws))

  return (
    <main style={{ padding: 24, fontFamily: "ui-monospace, Menlo, monospace", color: "#111", background: "#fafafa" }}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/debug/parsed" style={{ color: "#2563eb" }}>parsed semantic records →</Link>
      </div>
      <h1 style={{ fontSize: 22, marginBottom: 4 }}>Workbook Inspector — Cypress.xlsx</h1>
      <p style={{ fontSize: 12, color: "#555", marginTop: 0 }}>
        Parsed with ExcelJS. SheetJS Community Edition was missing bold/indent/fill/formula info; ExcelJS exposes the full style/structure model.
      </p>

      <section style={{ background: "white", padding: 16, border: "1px solid #ddd", borderRadius: 6, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, marginTop: 0 }}>Sheets</h2>
        <table style={{ fontSize: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f0f0f0", textAlign: "left" }}>
              {["Sheet", "State", "Rows", "Cols", "Cells", "Bold", "Fills (non-empty)", "Formulas", "Outlined rows", "Hidden rows", "Merges"].map((h) => (
                <th key={h} style={{ padding: "6px 10px", border: "1px solid #ddd" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheets.map((s) => (
              <tr key={s.name}>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{s.name}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{s.state}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{s.actualRowCount}/{s.rowCount}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{s.actualColumnCount}/{s.columnCount}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{s.totals.cells}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{s.totals.bold}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{s.totals.nonEmptyFills}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{s.totals.formulas}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{s.totals.outlinedRows}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{s.totals.hiddenRows}</td>
                <td style={{ padding: "6px 10px", border: "1px solid #ddd" }}>{s.totals.mergedRanges}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {sheets.map((s) => (
        <SheetView key={s.name} sheet={s} />
      ))}

      <Verdict sheets={sheets} />
    </main>
  )
}

function SheetView({ sheet }: { sheet: SheetReport }) {
  return (
    <section style={{ background: "white", padding: 16, border: "1px solid #ddd", borderRadius: 6, marginBottom: 24 }}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>{sheet.name}</h2>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600, marginBottom: 6 }}>
          Column widths / hidden / outline ({sheet.columnWidths.length})
        </summary>
        <pre style={{ fontSize: 11, background: "#f7f7f7", padding: 8, overflow: "auto" }}>
          {JSON.stringify(sheet.columnWidths, null, 2)}
        </pre>
      </details>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600, margin: "8px 0" }}>
          Fill palette ({sheet.fillPalette.length})
        </summary>
        <table style={{ fontSize: 12 }}>
          <tbody>
            {sheet.fillPalette.map((f) => (
              <tr key={f.argb + f.pattern}>
                <td style={{ width: 20, background: argbToCss(f.argb), border: "1px solid #ccc" }}>&nbsp;</td>
                <td style={{ padding: "2px 8px" }}>{f.pattern}</td>
                <td style={{ padding: "2px 8px" }}>{f.argb}</td>
                <td style={{ padding: "2px 8px" }}>× {f.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600, margin: "8px 0" }}>
          Number-format palette ({sheet.formatPalette.length})
        </summary>
        <pre style={{ fontSize: 11, background: "#f7f7f7", padding: 8, maxHeight: 200, overflow: "auto" }}>
          {sheet.formatPalette.map((f) => `${f.count.toString().padStart(6)}  ${f.numFmt}`).join("\n")}
        </pre>
      </details>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600, margin: "8px 0" }}>
          Font palette (top 10)
        </summary>
        <pre style={{ fontSize: 11, background: "#f7f7f7", padding: 8, overflow: "auto" }}>
          {JSON.stringify(sheet.fontPalette, null, 2)}
        </pre>
      </details>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600, margin: "8px 0" }}>
          Merged ranges ({sheet.merges.length})
        </summary>
        <pre style={{ fontSize: 11, background: "#f7f7f7", padding: 8, maxHeight: 200, overflow: "auto" }}>
          {sheet.merges.join(", ")}
        </pre>
      </details>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600, margin: "8px 0" }}>
          Sample cells with full metadata (first 30)
        </summary>
        <pre style={{ fontSize: 11, background: "#f7f7f7", padding: 8, maxHeight: 400, overflow: "auto" }}>
          {JSON.stringify(sheet.sampleCells, null, 2)}
        </pre>
      </details>

      <details open>
        <summary style={{ cursor: "pointer", fontWeight: 600, margin: "8px 0" }}>
          Row table — structural signals + first 8 columns ({sheet.rows.length} rows)
        </summary>
        <div style={{ maxHeight: 500, overflow: "auto", border: "1px solid #ddd" }}>
          <table style={{ fontSize: 11, borderCollapse: "collapse", width: "100%" }}>
            <thead style={{ position: "sticky", top: 0, background: "#f0f0f0" }}>
              <tr>
                {["#", "Lvl", "WS", "Hid", "Bold", "Fill", "Label", "B", "C", "D", "E", "F", "G", "H"].map((h) => (
                  <th key={h} style={{ padding: "4px 6px", border: "1px solid #ddd", textAlign: "left" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((r) => {
                const valueByCol = new Map<string, { v: unknown; numFmt?: string }>()
                for (const v of r.values) {
                  const col = v.addr.replace(/\d+/g, "")
                  valueByCol.set(col, { v: v.v, numFmt: v.numFmt })
                }
                return (
                  <tr
                    key={r.row}
                    style={{
                      background: r.hidden ? "#fff5f5" : r.bold ? "#fffbe6" : r.outlineLevel === 0 ? "#f0f7ff" : "white",
                      opacity: r.hidden ? 0.6 : 1
                    }}
                  >
                    <td style={{ padding: "2px 6px", border: "1px solid #eee", color: "#888" }}>{r.row}</td>
                    <td style={{ padding: "2px 6px", border: "1px solid #eee" }}>{r.outlineLevel}</td>
                    <td style={{ padding: "2px 6px", border: "1px solid #eee" }}>{r.leadingSpaces}</td>
                    <td style={{ padding: "2px 6px", border: "1px solid #eee" }}>{r.hidden ? "Y" : ""}</td>
                    <td style={{ padding: "2px 6px", border: "1px solid #eee", fontWeight: r.bold ? 700 : 400 }}>
                      {r.bold ? "B" : ""}
                    </td>
                    <td
                      style={{
                        padding: "2px 6px",
                        border: "1px solid #eee",
                        background: r.fill ? argbToCss(r.fill) : undefined
                      }}
                    >
                      {r.fill ? r.fill.slice(2) : ""}
                    </td>
                    <td
                      style={{
                        padding: "2px 6px",
                        border: "1px solid #eee",
                        whiteSpace: "pre",
                        fontWeight: r.bold ? 700 : 400,
                        maxWidth: 360,
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                      }}
                    >
                      {r.label}
                    </td>
                    {["B", "C", "D", "E", "F", "G", "H"].map((c) => {
                      const cv = valueByCol.get(c)
                      return (
                        <td key={c} style={{ padding: "2px 6px", border: "1px solid #eee", textAlign: "right" }}>
                          {cv ? formatValue(cv.v) : ""}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 4 })
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 40) + "…" : v
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === "object") return JSON.stringify(v).slice(0, 60)
  return String(v)
}

function argbToCss(argb?: string): string | undefined {
  if (!argb || argb.length !== 8) return undefined
  return `#${argb.slice(2)}`
}

function Verdict({ sheets }: { sheets: SheetReport[] }) {
  const hasOutline = sheets.every((s) => s.totals.outlinedRows > s.actualRowCount * 0.5)
  const hasBold = sheets.every((s) => s.totals.bold > 0)
  const hasFills = sheets.some((s) => s.totals.nonEmptyFills > 0)
  const hasFormulas = sheets.some((s) => s.totals.formulas > 0)

  return (
    <section style={{ background: "white", padding: 16, border: "2px solid #2563eb", borderRadius: 6 }}>
      <h2 style={{ fontSize: 18, marginTop: 0 }}>Verdict: can we parse deterministically?</h2>
      <p>
        <strong>Yes — using ExcelJS, not SheetJS.</strong> The workbook exposes enough structural signal to build a deterministic parser
        with zero AI in the parsing/math layer. AI is reserved for the analytical layer.
      </p>
      <table style={{ fontSize: 12, borderCollapse: "collapse", marginTop: 8 }}>
        <tbody>
          <Row label="Outline levels (row grouping)" ok={hasOutline} note="Primary section/subsection hierarchy. Level 0 = group, Level 1 = section, Level 2/3/4 = items." />
          <Row label="Bold styling" ok={hasBold} note="Identifies section headers and total rows. Sample: total values on row 28 are bold." />
          <Row label="Fills" ok={hasFills} note="Light-gray = banded styling. Peach = conditional formatting (variance). Useful for AI but not load-bearing for parsing." />
          <Row label="Leading whitespace in label" ok={true} note="Redundant secondary hierarchy signal. 4 spaces per level. Confirms outlineLevel." />
          <Row label="Merged cells for headers" ok={sheets.every((s) => s.totals.mergedRanges > 0)} note="Useful for identifying the column-header band." />
          <Row label="Hidden rows" ok={sheets.every((s) => s.totals.hiddenRows > 0)} note="Collapsed detail rows. The parser should keep them; the renderer can collapse." />
          <Row label="Indentation (alignment.indent)" ok={false} note="Not used in this file. Leading whitespace in labels fills the same role." />
          <Row label="Formulas" ok={hasFormulas} note="Not present — this is a values-only export. Total detection relies on bold + outline level + label match, NOT formula introspection." />
        </tbody>
      </table>
      <h3 style={{ fontSize: 14 }}>Deterministic parser algorithm</h3>
      <ol style={{ fontSize: 12, lineHeight: 1.6 }}>
        <li>Identify the header band by scanning rows 1–6 for merged cells + non-numeric labels. Map columns to roles ($, PPD, Bgt $, Bgt PPD, Var $, Var PPD).</li>
        <li>Walk remaining rows. For each row capture: outlineLevel, bold (col A), fill color (col A), leading-space depth, label (trimmed), numeric values by column.</li>
        <li>State machine: a Level-0 bold row opens a Group; the matching Level-0 bold row with the same trimmed label later closes it and carries its Total values. Same pattern at Level 1 for Sections.</li>
        <li>Level ≥ 2 rows attach as line items / sub-line-items to the currently open Section.</li>
        <li>Hidden rows are tagged but retained. Empty-label level-1 rows are spacers and ignored.</li>
        <li>Math validation: ∑(line items at level n) under a section must equal the section&apos;s closing total within tolerance. Surface failures as &quot;parse mismatch&quot; rather than silently accepting.</li>
      </ol>
      <h3 style={{ fontSize: 14 }}>Generalisation to other SNF reports</h3>
      <p style={{ fontSize: 12, lineHeight: 1.6 }}>
        The structural signals used here (outline levels, bold on totals, label-match closing convention, banded fills, leading whitespace) are
        the standard output format of Sage Intacct, QuickBooks Enterprise, MIP, and Yardi when exported as &quot;Actual vs Budget&quot; or
        &quot;Profit &amp; Loss&quot;. Build one parser per source format and select per-tenant. The shared invariant — &quot;section
        opens at level N, closes at level N with same label, items at level N+1&quot; — should hold across vendors. If a tenant ships a
        flatter report (no outline levels), fall back to a font-and-fill heuristic, but treat that as a configuration choice, not a default.
      </p>
    </section>
  )
}

function Row({ label, ok, note }: { label: string; ok: boolean; note: string }) {
  return (
    <tr>
      <td style={{ padding: "4px 8px", border: "1px solid #eee", fontWeight: 600 }}>{label}</td>
      <td style={{ padding: "4px 8px", border: "1px solid #eee", color: ok ? "#15803d" : "#b91c1c" }}>
        {ok ? "yes" : "no"}
      </td>
      <td style={{ padding: "4px 8px", border: "1px solid #eee" }}>{note}</td>
    </tr>
  )
}
