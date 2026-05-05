'use client'

import { useState, useRef, useEffect } from 'react'
import { UserButton } from '@clerk/nextjs'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return

    const newMessages: Message[] = [...messages, { role: 'user', content: text }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })

      const data = await res.json()
      setMessages([...newMessages, { role: 'assistant', content: data.message }])
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f7f4ef', fontFamily: "'DM Sans', sans-serif" }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid #e4e0d8', background: '#fff' }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', fontWeight: 400 }}>
          SmallBizz<span style={{ color: '#c8410a', fontStyle: 'italic' }}>Wizz</span>
        </div>
        <UserButton />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 1rem' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {messages.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: '4rem' }}>
              <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.75rem', color: '#0f0e0c', marginBottom: '0.75rem' }}>
                What's on your mind?
              </p>
              <p style={{ fontSize: '0.95rem', color: '#8a8680', marginBottom: '2.5rem' }}>
                Ask anything about your business — deals, pricing, clients, contracts, hiring.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', textAlign: 'left' }}>
                {[
                  'Is this business deal fair or am I being taken advantage of?',
                  'What should I charge for my services?',
                  "My client hasn't paid in 60 days. What do I do?",
                  'Should I hire someone or keep doing it myself?',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    style={{ background: '#fff', border: '1px solid #e4e0d8', borderRadius: '4px', padding: '0.85rem 1rem', fontSize: '0.82rem', color: '#4a4740', cursor: 'pointer', textAlign: 'left', lineHeight: '1.5' }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '85%',
                padding: '0.85rem 1.1rem',
                borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: m.role === 'user' ? '#0f0e0c' : '#fff',
                color: m.role === 'user' ? '#f7f4ef' : '#0f0e0c',
                fontSize: '0.9rem',
                lineHeight: '1.7',
                border: m.role === 'assistant' ? '1px solid #e4e0d8' : 'none',
              }}>
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{ background: '#fff', border: '1px solid #e4e0d8', borderRadius: '12px 12px 12px 2px', padding: '0.85rem 1.1rem' }}>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{
                      width: '6px', height: '6px', borderRadius: '50%', background: '#c8410a',
                      animation: 'bounce 1.2s infinite',
                      animationDelay: `${i * 0.2}s`
                    }} />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div style={{ borderTop: '1px solid #e4e0d8', background: '#fff', padding: '1rem 1.5rem' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your business..."
            rows={1}
            style={{
              flex: 1, padding: '0.75rem 1rem', border: '1px solid #e4e0d8', borderRadius: '8px',
              fontSize: '0.9rem', fontFamily: 'inherit', resize: 'none', outline: 'none',
              background: '#f7f4ef', color: '#0f0e0c', lineHeight: '1.5',
            }}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            style={{
              background: loading || !input.trim() ? '#e4e0d8' : '#c8410a',
              color: '#fff', border: 'none', borderRadius: '8px',
              padding: '0.75rem 1.25rem', fontSize: '0.85rem', fontWeight: 500,
              cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s', whiteSpace: 'nowrap',
            }}
          >
            Ask →
          </button>
        </div>
        <p style={{ textAlign: 'center', fontSize: '0.72rem', color: '#8a8680', marginTop: '0.5rem' }}>
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  )
}