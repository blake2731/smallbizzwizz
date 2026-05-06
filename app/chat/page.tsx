'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { UserButton, useUser } from '@clerk/nextjs'

interface Message {
  role: 'user' | 'assistant'
  content: string
  attachmentName?: string
}

interface Attachment {
  name: string
  mediaType: string
  data: string
}

interface Conversation {
  id: string
  title: string
  updatedAt: number
  messages: Message[]
}

function storageKey(userId: string | null | undefined) {
  return userId ? `sbw_chats_${userId}` : null
}

function loadConversations(userId: string | null | undefined): Conversation[] {
  const key = storageKey(userId)
  if (!key) return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistConversations(userId: string | null | undefined, conversations: Conversation[]) {
  const key = storageKey(userId)
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify(conversations))
  } catch {
    // localStorage full — silently drop
  }
}

function PaperclipIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.99 8.84l-8.57 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  )
}

function MenuIcon({ size = 22 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  )
}

function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function CloseIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
          return <strong key={i}>{part.slice(2, -2)}</strong>
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
          return <em key={i}>{part.slice(1, -1)}</em>
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let listType: 'ul' | 'ol' | null = null
  let listItems: string[] = []
  let paraLines: string[] = []

  function flushPara() {
    const joined = paraLines.join(' ').trim()
    if (joined) {
      elements.push(
        <p key={elements.length} style={{ margin: 0, lineHeight: 1.7 }}>
          <InlineText text={joined} />
        </p>
      )
    }
    paraLines = []
  }

  function flushList() {
    if (!listItems.length) return
    const items = listItems.map((item, i) => (
      <li key={i} style={{ lineHeight: 1.6, marginBottom: '0.15rem' }}>
        <InlineText text={item} />
      </li>
    ))
    elements.push(
      listType === 'ul'
        ? <ul key={elements.length} style={{ margin: 0, paddingLeft: '1.2rem' }}>{items}</ul>
        : <ol key={elements.length} style={{ margin: 0, paddingLeft: '1.2rem' }}>{items}</ol>
    )
    listItems = []
    listType = null
  }

  for (const line of lines) {
    const t = line.trim()
    if (/^#{1,3}\s/.test(t)) {
      flushList(); flushPara()
      elements.push(
        <p key={elements.length} style={{ fontWeight: 600, lineHeight: 1.5, margin: 0 }}>
          <InlineText text={t.replace(/^#{1,3}\s/, '')} />
        </p>
      )
    } else if (/^[-*]\s/.test(t)) {
      flushPara()
      if (listType !== 'ul') { flushList(); listType = 'ul' }
      listItems.push(t.replace(/^[-*]\s/, ''))
    } else if (/^\d+\.\s/.test(t)) {
      flushPara()
      if (listType !== 'ol') { flushList(); listType = 'ol' }
      listItems.push(t.replace(/^\d+\.\s/, ''))
    } else if (t === '') {
      flushList(); flushPara()
    } else {
      flushList()
      paraLines.push(line)
    }
  }
  flushList(); flushPara()

  return <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>{elements}</div>
}

export default function ChatPage() {
  const { user } = useUser()
  const userId = user?.id ?? null

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [loading, setLoading] = useState(false)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!userId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConversations(loadConversations(userId))
  }, [userId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const upsertConversation = useCallback((id: string, msgs: Message[]) => {
    if (!userId || msgs.length === 0) return
    setConversations(prev => {
      const existing = prev.find(c => c.id === id)
      let next: Conversation[]
      if (existing) {
        next = [
          { ...existing, messages: msgs, updatedAt: Date.now() },
          ...prev.filter(c => c.id !== id),
        ]
      } else {
        const firstUser = msgs.find(m => m.role === 'user')
        const titleSource = (firstUser?.content?.trim() || firstUser?.attachmentName || 'New chat')
        const title = titleSource.length > 50 ? titleSource.slice(0, 50) + '…' : titleSource
        next = [
          { id, title, updatedAt: Date.now(), messages: msgs },
          ...prev,
        ]
      }
      persistConversations(userId, next)
      return next
    })
  }, [userId])

  const handleTextareaInput = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']
    if (!allowed.includes(file.type)) {
      alert('Unsupported file type. Please upload a PDF or image (PNG, JPG, GIF, WEBP).')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('File too large. Maximum size is 10MB.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setAttachment({ name: file.name, mediaType: file.type, data: base64 })
    }
    reader.readAsDataURL(file)
  }

  const send = async () => {
    const text = input.trim()
    if ((!text && !attachment) || loading) return

    const userMessage: Message = {
      role: 'user',
      content: text,
      ...(attachment ? { attachmentName: attachment.name } : {}),
    }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput('')
    const pendingAttachment = attachment
    setAttachment(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setLoading(true)

    let chatId = currentChatId
    if (!chatId) {
      chatId = crypto.randomUUID()
      setCurrentChatId(chatId)
    }
    upsertConversation(chatId, newMessages)

    try {
      const body: { messages: Message[]; attachment?: Attachment } = { messages: newMessages }
      if (pendingAttachment) body.attachment = pendingAttachment

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      const finalMessages: Message[] = [...newMessages, { role: 'assistant', content: data.message }]
      setMessages(finalMessages)
      upsertConversation(chatId, finalMessages)
    } catch {
      const finalMessages: Message[] = [...newMessages, { role: 'assistant', content: 'Something went wrong. Please try again.' }]
      setMessages(finalMessages)
      upsertConversation(chatId, finalMessages)
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

  const newChat = () => {
    setMessages([])
    setCurrentChatId(null)
    setInput('')
    setAttachment(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setSidebarOpen(false)
  }

  const loadChat = (id: string) => {
    const conv = conversations.find(c => c.id === id)
    if (!conv) return
    setMessages(conv.messages)
    setCurrentChatId(id)
    setInput('')
    setAttachment(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setSidebarOpen(false)
  }

  const deleteChat = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!userId) return
    setConversations(prev => {
      const next = prev.filter(c => c.id !== id)
      persistConversations(userId, next)
      return next
    })
    if (currentChatId === id) {
      setMessages([])
      setCurrentChatId(null)
    }
  }

  const canSend = !loading && (!!input.trim() || !!attachment)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#f7f4ef', fontFamily: "'DM Sans', sans-serif" }}>

      <aside
        aria-hidden={!sidebarOpen}
        style={{
          position: 'fixed', top: 0, left: 0, height: '100vh', width: '280px',
          maxWidth: '85vw',
          background: '#fff',
          borderRight: '1px solid #e4e0d8',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.2s ease',
          zIndex: 30,
          display: 'flex', flexDirection: 'column',
          pointerEvents: sidebarOpen ? 'auto' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #e4e0d8' }}>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.05rem', color: '#0f0e0c' }}>
            Your chats
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Close chats"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#8a8680', display: 'inline-flex', alignItems: 'center', padding: '0.25rem',
            }}
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <button
          onClick={newChat}
          style={{
            margin: '0.75rem', padding: '0.7rem 0.9rem',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
            background: '#0f0e0c', color: '#f7f4ef', border: 'none', borderRadius: '8px',
            cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500,
          }}
        >
          <PlusIcon size={16} />
          New chat
        </button>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.4rem 1rem' }}>
          {conversations.length === 0 && (
            <p style={{ padding: '0.5rem 0.85rem', fontSize: '0.8rem', color: '#9a9690' }}>
              No saved chats yet.
            </p>
          )}
          {conversations.map(c => (
            <div
              key={c.id}
              onClick={() => loadChat(c.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.55rem 0.7rem', margin: '0.1rem 0',
                borderRadius: '6px', cursor: 'pointer',
                background: c.id === currentChatId ? '#f1ede5' : 'transparent',
                fontSize: '0.85rem', color: '#2a2724',
              }}
            >
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.title}
              </span>
              <button
                onClick={(e) => deleteChat(c.id, e)}
                aria-label="Delete chat"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#9a9690', display: 'inline-flex', alignItems: 'center',
                  padding: '0.2rem', flexShrink: 0,
                }}
              >
                <TrashIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      </aside>

      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15, 14, 12, 0.35)',
            zIndex: 25,
          }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid #e4e0d8', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open chats"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#4a4740', display: 'inline-flex', alignItems: 'center',
              padding: '0.25rem',
            }}
          >
            <MenuIcon size={22} />
          </button>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: '1.25rem', fontWeight: 400 }}>
            SmallBizz<span style={{ color: '#c8410a', fontStyle: 'italic' }}>Wizz</span>
          </div>
        </div>
        <UserButton />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 1rem' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {messages.length === 0 && (
            <div style={{ textAlign: 'center', paddingTop: '4rem' }}>
              <p style={{ fontFamily: 'Georgia, serif', fontSize: '1.75rem', color: '#0f0e0c', marginBottom: '0.75rem' }}>
                What&apos;s on your mind?
              </p>
              <p style={{ fontSize: '0.95rem', color: '#8a8680', marginBottom: '2.5rem' }}>
                Ask anything about your business — deals, pricing, clients, contracts, hiring.
              </p>
              <div className="suggested-questions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', textAlign: 'left' }}>
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
                {m.role === 'user' ? (
                  <>
                    {m.attachmentName && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: m.content ? '0.5rem' : 0, fontSize: '0.78rem', color: '#9a9690', background: '#1a1917', borderRadius: '4px', padding: '0.3rem 0.5rem' }}>
                        <PaperclipIcon size={13} />
                        <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.attachmentName}</span>
                      </div>
                    )}
                    {m.content}
                  </>
                ) : (
                  <MarkdownContent text={m.content} />
                )}
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
                      animationDelay: `${i * 0.2}s`,
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
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>
          {attachment && (
            <div style={{ marginBottom: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', background: '#f7f4ef', border: '1px solid #e4e0d8', borderRadius: '6px', padding: '0.3rem 0.5rem 0.3rem 0.6rem', fontSize: '0.8rem', color: '#4a4740' }}>
              <PaperclipIcon size={14} />
              <span style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {attachment.name}
              </span>
              <button
                onClick={() => setAttachment(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8a8680', fontSize: '1.1rem', lineHeight: 1, padding: '0 0 0 0.2rem' }}
              >
                ×
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Attach a file (PDF or image, max 10MB)"
              aria-label="Attach a file"
              style={{
                background: 'none', border: '1px solid #e4e0d8', borderRadius: '8px',
                padding: '0.72rem 0.8rem', cursor: 'pointer', color: '#8a8680',
                flexShrink: 0, lineHeight: 0, display: 'inline-flex', alignItems: 'center',
              }}
            >
              <PaperclipIcon size={18} />
            </button>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleTextareaInput}
              placeholder="Ask anything..."
              rows={1}
              style={{
                flex: 1, padding: '0.75rem 1rem', border: '1px solid #e4e0d8', borderRadius: '8px',
                fontSize: '0.9rem', fontFamily: 'inherit', resize: 'none', outline: 'none',
                background: '#f7f4ef', color: '#0f0e0c', lineHeight: '1.5', overflowY: 'hidden',
              }}
            />
            <button
              onClick={send}
              disabled={!canSend}
              style={{
                background: canSend ? '#c8410a' : '#e4e0d8',
                color: '#fff', border: 'none', borderRadius: '8px',
                padding: '0.75rem 1.25rem', fontSize: '0.85rem', fontWeight: 500,
                cursor: canSend ? 'pointer' : 'not-allowed',
                transition: 'background 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              Ask →
            </button>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept="application/pdf,image/png,image/jpeg,image/gif,image/webp"
            onChange={handleFileChange}
          />
          <p style={{ textAlign: 'center', fontSize: '0.72rem', color: '#8a8680', marginTop: '0.5rem' }}>
            Press Enter to send · Shift+Enter for new line · attach contracts or images
          </p>
        </div>
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
