"use client"

import { useState } from "react"

type UploadFormProps = {
  facilities: Array<{
    id: string
    name: string
  }>
  defaultReportingMonth: string
}

export default function UploadForm(props: UploadFormProps) {
  const [submitting, setSubmitting] = useState(false)

  return (
    <form
      action="/api/uploads"
      method="POST"
      encType="multipart/form-data"
      onSubmit={() => setSubmitting(true)}
      style={{
        display: "grid",
        gap: 18
      }}
    >
      <section
        style={{
          background: "white",
          border: "1px solid #dbe3ee",
          borderRadius: 18,
          padding: 20,
          display: "grid",
          gap: 16
        }}
      >
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
          <div style={labelStyle}>Workbook</div>
          <input
            name="workbook"
            type="file"
            accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
            style={fileInputStyle}
            disabled={submitting}
            required
          />
          <div style={hintStyle}>
            Upload the facility workbook export. The deterministic pipeline will parse,
            validate, normalize, generate insights, and create narratives from the
            validated outputs only.
          </div>
        </div>
      </section>

      <section
        style={{
          background: "#f8fbff",
          border: "1px solid #dbe3ee",
          borderRadius: 18,
          padding: 20,
          display: "grid",
          gap: 10
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: "#12324a" }}>
          Processing behavior
        </div>
        <div style={bulletStyle}>
          Workbook rows stay in the deterministic parser and normalization pipeline.
        </div>
        <div style={bulletStyle}>
          AI only receives validated insight packets, compact metrics, and small prompt
          context.
        </div>
        <div style={bulletStyle}>
          Processing diagnostics, validation stats, insights, and narratives are all
          persisted to the facility snapshot.
        </div>
      </section>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap"
        }}
      >
        <div style={{ fontSize: 13, color: "#5b6b7d" }}>
          {submitting
            ? "Processing workbook. This can take a moment while the facility snapshot is created."
            : "Upload starts a persisted facility snapshot and redirects to the operator dashboard."}
        </div>
        <button
          type="submit"
          disabled={submitting}
          style={{
            border: "none",
            borderRadius: 999,
            background: submitting ? "#8da3b9" : "#17497a",
            color: "white",
            padding: "13px 22px",
            fontSize: 14,
            fontWeight: 700,
            cursor: submitting ? "wait" : "pointer",
            minWidth: 190
          }}
        >
          {submitting ? "Processing workbook..." : "Upload and build dashboard"}
        </button>
      </div>
    </form>
  )
}

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#12324a",
  marginBottom: 8
}

const hintStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#6b7b8c",
  marginTop: 6,
  lineHeight: 1.5
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
  fontFamily: "inherit"
}

const fileInputStyle: React.CSSProperties = {
  ...inputStyle,
  padding: 10
}

const bulletStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#31485e",
  lineHeight: 1.6
}
