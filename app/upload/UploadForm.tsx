"use client"

import Link from "next/link"
import { useRef, useState } from "react"

type UploadFormProps = {
  facilities: Array<{
    id: string
    name: string
  }>
  defaultReportingMonth: string
}

const SUPPORTED_EXTENSIONS = [".xlsx", ".xlsm"]

function isSupportedFile(file: File): boolean {
  const lower = file.name.toLowerCase()
  return SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function UploadForm(props: UploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  const acceptFile = (file: File | undefined) => {
    if (!file) return
    if (!isSupportedFile(file)) {
      setSelectedFile(null)
      setClientError(
        `${file.name} is not a supported workbook. The deterministic parser needs .xlsx or .xlsm — re-save it from Excel/Sheets and try again.`
      )
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }
    setClientError(null)
    setSelectedFile(file)
  }

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0])
  }

  const onDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file && fileInputRef.current) {
      // Sync the dropped file into the form so the submit picks it up.
      const dt = new DataTransfer()
      dt.items.add(file)
      fileInputRef.current.files = dt.files
    }
    acceptFile(file)
  }

  const onDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragActive(true)
  }

  const onDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    setDragActive(false)
  }

  return (
    <form
      action="/api/uploads"
      method="POST"
      encType="multipart/form-data"
      onSubmit={() => setSubmitting(true)}
      style={{ display: "grid", gap: 18 }}
    >
      <section style={cardStyle}>
        <div>
          <div style={labelStyle}>Existing facility</div>
          <select
            name="facilityId"
            defaultValue=""
            style={inputStyle}
            disabled={submitting}
          >
            <option value="">Create a new facility instead</option>
            {props.facilities.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <div style={hintStyle}>
            Select an existing facility or leave this blank and create a new one below.
          </div>
        </div>

        <div>
          <div style={labelStyle}>New facility name</div>
          <input
            name="facilityName"
            type="text"
            placeholder="Cypress Skilled Nursing"
            style={inputStyle}
            disabled={submitting}
          />
          <div style={hintStyle}>
            Only used when no existing facility is selected.
          </div>
        </div>

        <div>
          <div style={labelStyle}>Reporting period</div>
          <input
            name="reportingMonth"
            type="month"
            defaultValue={props.defaultReportingMonth}
            style={inputStyle}
            disabled={submitting}
            required
          />
          <div style={hintStyle}>
            This snapshot month becomes the facility reporting period shown on the dashboard.
          </div>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div style={labelStyle}>Workbook</div>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={pillStyle(true)}>.xlsx</span>
              <span style={pillStyle(true)}>.xlsm</span>
            </div>
          </div>

          <label
            htmlFor="workbook-input"
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            style={{
              ...dropZoneStyle,
              borderColor: dragActive ? "#17497a" : "#c8d4e0",
              background: dragActive ? "#eef5fb" : "#fbfdff",
            }}
          >
            <input
              ref={fileInputRef}
              id="workbook-input"
              name="workbook"
              type="file"
              accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
              onChange={onFileInputChange}
              style={{ display: "none" }}
              disabled={submitting}
              required
            />
            {selectedFile ? (
              <div style={{ display: "grid", gap: 4 }}>
                <div style={{ fontWeight: 700, color: "#12324a", fontSize: 14 }}>
                  {selectedFile.name}
                </div>
                <div style={{ fontSize: 12, color: "#5b6b7d" }}>
                  {formatBytes(selectedFile.size)} · ready to process
                </div>
                <div style={{ fontSize: 12, color: "#17497a", marginTop: 4 }}>
                  Click to swap file or drop a different one.
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6, justifyItems: "center" }}>
                <UploadGlyph />
                <div style={{ fontWeight: 700, color: "#12324a", fontSize: 14 }}>
                  Drop your workbook here, or click to browse
                </div>
                <div style={{ fontSize: 12, color: "#5b6b7d", maxWidth: 380, textAlign: "center", lineHeight: 1.5 }}>
                  Cypress-style Actual-vs-Budget exports. The parser keeps outline level, bolds, and fills — full fidelity only ships with .xlsx/.xlsm.
                </div>
              </div>
            )}
          </label>

          {clientError && (
            <div style={errorStyle}>{clientError}</div>
          )}

          <div style={{ ...hintStyle, marginTop: 10 }}>
            Need to ask questions about an .xls, .csv, or PDF report?{" "}
            <Link href="/chat" style={{ color: "#17497a", fontWeight: 700, textDecoration: "underline" }}>
              Use the SmallBizzWizz chat
            </Link>
            {" "}— it parses those formats for general Q&amp;A.
          </div>
        </div>
      </section>

      <section style={pipelineCardStyle}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#12324a", marginBottom: 4 }}>
          What happens when you upload
        </div>
        <PipelineStep n={1} title="Parse" body="ExcelJS walks the workbook, keeping outline levels, bolds, fills, and merged cells." />
        <PipelineStep n={2} title="Validate" body="Section totals are cross-checked against their children. Mismatches are surfaced, not hidden." />
        <PipelineStep n={3} title="Normalize" body="Rows are mapped to canonical financial categories before any analytics run." />
        <PipelineStep n={4} title="Insight packets" body="Deterministic math produces auditable insights with citations back to source rows." />
        <PipelineStep n={5} title="Narrative" body="Only validated packets and compact metrics reach the LLM — numbers are never invented." />
      </section>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 13, color: "#5b6b7d" }}>
          {submitting
            ? "Processing workbook. This can take a moment while the facility snapshot is created."
            : "Upload starts a persisted facility snapshot and redirects to the operator dashboard."}
        </div>
        <button
          type="submit"
          disabled={submitting || !selectedFile}
          style={{
            border: "none",
            borderRadius: 999,
            background: submitting || !selectedFile ? "#8da3b9" : "#17497a",
            color: "white",
            padding: "13px 22px",
            fontSize: 14,
            fontWeight: 700,
            cursor: submitting ? "wait" : !selectedFile ? "not-allowed" : "pointer",
            minWidth: 220,
            transition: "background 0.15s",
          }}
        >
          {submitting ? "Processing workbook..." : "Upload and build dashboard"}
        </button>
      </div>
    </form>
  )
}

function PipelineStep({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div
        style={{
          flexShrink: 0,
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: "#17497a",
          color: "white",
          fontSize: 12,
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {n}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#12324a" }}>{title}</div>
        <div style={{ fontSize: 13, color: "#31485e", lineHeight: 1.55 }}>{body}</div>
      </div>
    </div>
  )
}

function UploadGlyph() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#17497a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#12324a",
  marginBottom: 8,
}

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7b8c",
  marginTop: 6,
  lineHeight: 1.5,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #c8d4e0",
  borderRadius: 12,
  background: "#fbfdff",
  color: "#10263a",
  padding: "12px 14px",
  fontSize: 14,
  fontFamily: "inherit",
}

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #dbe3ee",
  borderRadius: 18,
  padding: 20,
  display: "grid",
  gap: 16,
}

const pipelineCardStyle: React.CSSProperties = {
  background: "#f8fbff",
  border: "1px solid #dbe3ee",
  borderRadius: 18,
  padding: 20,
  display: "grid",
  gap: 14,
}

const dropZoneStyle: React.CSSProperties = {
  marginTop: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "2px dashed #c8d4e0",
  borderRadius: 14,
  padding: "26px 18px",
  cursor: "pointer",
  transition: "background 0.15s, border-color 0.15s",
  minHeight: 130,
}

const errorStyle: React.CSSProperties = {
  marginTop: 10,
  background: "#fff1f2",
  border: "1px solid #fecdd3",
  color: "#9f1239",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  lineHeight: 1.5,
}

function pillStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    color: active ? "#0d3a66" : "#7a8a9b",
    background: active ? "#e1edf8" : "#eef2f6",
    border: `1px solid ${active ? "#bcd3ea" : "#dbe3ee"}`,
    borderRadius: 999,
    padding: "3px 8px",
    textTransform: "lowercase",
  }
}
