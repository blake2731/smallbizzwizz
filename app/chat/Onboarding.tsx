'use client'

import { useState, useEffect, useRef } from 'react'

export type OnboardingAnswers = {
  name: string
  businessType: string
  businessDuration: string
  teamSize: string
  biggestStressor: string
}

type Phase =
  | 'g1-show'
  | 'g1-fade'
  | 'g2-show'
  | 'g2-fade'
  | 'form-show'
  | 'form-fade'
  | 'stressor-show'
  | 'submitting'

const FORM_QUESTIONS = [
  { key: 'name', label: "What's your name?", placeholder: 'Your first name' },
  { key: 'businessType', label: 'What kind of business do you run?', placeholder: 'e.g. a coffee shop, a freelance design studio' },
  { key: 'businessDuration', label: 'How long have you been running it?', placeholder: 'e.g. 3 years, just started last month' },
  { key: 'teamSize', label: 'Do you work alone or do you have a team?', placeholder: 'e.g. just me, me + 4 employees' },
] as const

type QuestionKey = (typeof FORM_QUESTIONS)[number]['key']

const PHASE_TRANSITIONS: Partial<Record<Phase, [Phase, number]>> = {
  'g1-show': ['g1-fade', 2400],
  'g1-fade': ['g2-show', 700],
  'g2-show': ['g2-fade', 2400],
  'g2-fade': ['form-show', 700],
  'form-fade': ['stressor-show', 700],
}

export function OnboardingFlow({
  onComplete,
}: {
  onComplete: (answers: OnboardingAnswers) => Promise<void>
}) {
  const [phase, setPhase] = useState<Phase>('g1-show')
  const [revealed, setRevealed] = useState(1)
  const [answers, setAnswers] = useState<Record<QuestionKey, string>>({
    name: '',
    businessType: '',
    businessDuration: '',
    teamSize: '',
  })
  const [stressor, setStressor] = useState('')

  const inputRefs = useRef<Record<QuestionKey, HTMLInputElement | null>>({
    name: null,
    businessType: null,
    businessDuration: null,
    teamSize: null,
  })
  const stressorRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const next = PHASE_TRANSITIONS[phase]
    if (!next) return
    const t = setTimeout(() => setPhase(next[0]), next[1])
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase === 'form-show') {
      const current = FORM_QUESTIONS[revealed - 1]
      inputRefs.current[current.key]?.focus()
    }
    if (phase === 'stressor-show') {
      stressorRef.current?.focus()
    }
  }, [phase, revealed])

  const submitQuestion = (idx: number) => {
    const q = FORM_QUESTIONS[idx]
    if (!answers[q.key].trim()) return
    if (idx === FORM_QUESTIONS.length - 1) {
      setPhase('form-fade')
    } else if (idx + 1 >= revealed) {
      setRevealed(idx + 2)
    } else {
      inputRefs.current[FORM_QUESTIONS[idx + 1].key]?.focus()
    }
  }

  const submitStressor = async () => {
    const trimmed = stressor.trim()
    if (!trimmed) return
    setPhase('submitting')
    await onComplete({
      name: answers.name.trim(),
      businessType: answers.businessType.trim(),
      businessDuration: answers.businessDuration.trim(),
      teamSize: answers.teamSize.trim(),
      biggestStressor: trimmed,
    })
  }

  const personalizedName = answers.name.trim().split(/\s+/)[0]
  const lastAnswered = answers[FORM_QUESTIONS[FORM_QUESTIONS.length - 1].key].trim()

  const fadeInStyle: React.CSSProperties = { animation: 'sbw-fade-in 700ms ease both' }
  const fadeOutStyle: React.CSSProperties = { animation: 'sbw-fade-out 700ms ease both' }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#f7f4ef',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem 1.5rem',
        zIndex: 100,
        fontFamily: "'DM Sans', sans-serif",
        overflowY: 'auto',
      }}
    >
      {(phase === 'g1-show' || phase === 'g1-fade') && (
        <p
          style={{
            ...(phase === 'g1-show' ? fadeInStyle : fadeOutStyle),
            fontFamily: 'Georgia, serif',
            fontSize: 'clamp(1.4rem, 4vw, 2rem)',
            color: '#0f0e0c',
            textAlign: 'center',
            maxWidth: '640px',
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          Hello! I&apos;m Small<span style={{ color: '#c8410a', fontStyle: 'italic' }}>Bizz</span>Wizz, here to help make running a small business easier for you!
        </p>
      )}

      {(phase === 'g2-show' || phase === 'g2-fade') && (
        <p
          style={{
            ...(phase === 'g2-show' ? fadeInStyle : fadeOutStyle),
            fontFamily: 'Georgia, serif',
            fontSize: 'clamp(1.3rem, 3.6vw, 1.8rem)',
            color: '#0f0e0c',
            textAlign: 'center',
            maxWidth: '600px',
            lineHeight: 1.4,
            margin: 0,
          }}
        >
          First, let me get to know you and your business!
        </p>
      )}

      {(phase === 'form-show' || phase === 'form-fade') && (
        <div
          style={{
            ...(phase === 'form-show' ? fadeInStyle : fadeOutStyle),
            width: '100%',
            maxWidth: '520px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
          }}
        >
          {FORM_QUESTIONS.map((q, idx) => {
            const visible = idx < revealed
            if (!visible) return null
            return (
              <div key={q.key} style={{ animation: 'sbw-fade-in 600ms ease both' }}>
                <label
                  htmlFor={`onboarding-${q.key}`}
                  style={{
                    display: 'block',
                    fontFamily: 'Georgia, serif',
                    fontSize: '1.1rem',
                    color: '#0f0e0c',
                    marginBottom: '0.6rem',
                  }}
                >
                  {q.label}
                </label>
                <input
                  id={`onboarding-${q.key}`}
                  ref={(el) => {
                    inputRefs.current[q.key] = el
                  }}
                  type="text"
                  value={answers[q.key]}
                  onChange={(e) =>
                    setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      submitQuestion(idx)
                    }
                  }}
                  placeholder={q.placeholder}
                  maxLength={200}
                  style={{
                    width: '100%',
                    padding: '0.85rem 1rem',
                    border: '1px solid #e4e0d8',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                    background: '#fff',
                    color: '#0f0e0c',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )
          })}

          {revealed >= FORM_QUESTIONS.length && (
            <button
              onClick={() => submitQuestion(FORM_QUESTIONS.length - 1)}
              disabled={!lastAnswered}
              style={{
                alignSelf: 'flex-end',
                background: lastAnswered ? '#c8410a' : '#e4e0d8',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.7rem 1.6rem',
                fontSize: '0.92rem',
                fontWeight: 500,
                cursor: lastAnswered ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s',
                animation: 'sbw-fade-in 500ms ease both',
              }}
            >
              Continue →
            </button>
          )}
        </div>
      )}

      {(phase === 'stressor-show' || phase === 'submitting') && (
        <div
          style={{
            animation: 'sbw-fade-in 700ms ease both',
            width: '100%',
            maxWidth: '560px',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          <p
            style={{
              fontFamily: 'Georgia, serif',
              fontSize: 'clamp(1.2rem, 3.4vw, 1.65rem)',
              color: '#0f0e0c',
              lineHeight: 1.4,
              margin: 0,
            }}
          >
            So {personalizedName || 'there'}, what&apos;s the biggest thing stressing you out about your business right now?
          </p>
          <textarea
            ref={stressorRef}
            value={stressor}
            onChange={(e) => setStressor(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                submitStressor()
              }
            }}
            placeholder="Tell me what's on your mind…"
            rows={5}
            maxLength={2000}
            disabled={phase === 'submitting'}
            style={{
              width: '100%',
              padding: '0.9rem 1rem',
              border: '1px solid #e4e0d8',
              borderRadius: '8px',
              fontSize: '1rem',
              fontFamily: 'inherit',
              outline: 'none',
              background: '#fff',
              color: '#0f0e0c',
              boxSizing: 'border-box',
              resize: 'vertical',
              lineHeight: 1.6,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={submitStressor}
              disabled={phase === 'submitting' || !stressor.trim()}
              style={{
                background:
                  phase === 'submitting' || !stressor.trim() ? '#e4e0d8' : '#c8410a',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.75rem 1.7rem',
                fontSize: '0.95rem',
                fontWeight: 500,
                cursor:
                  phase === 'submitting' || !stressor.trim() ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {phase === 'submitting' ? 'Starting…' : 'Send →'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes sbw-fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes sbw-fade-out {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-4px); }
        }
      `}</style>
    </div>
  )
}
