'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { updateWorkStatus } from './actions'
import styles from './control-plane.module.css'

const STATUSES = [
  ['backlog', 'Backlog'],
  ['ready', 'Ready'],
  ['active', 'Active'],
  ['waiting', 'Waiting'],
  ['review', 'Review'],
  ['done', 'Done'],
] as const

type WorkStatus = (typeof STATUSES)[number][0]

type WorkItem = {
  id: number
  displayId: string
  title: string
  status: WorkStatus
  priority: string
  risk: string
  ownerName: string
  ownerInitials: string
  objectiveLabel: string | null
  nextAction: string | null
}

const statusClass: Record<WorkStatus, string> = {
  backlog: styles.statusBacklog,
  ready: styles.statusReady,
  active: styles.statusActive,
  waiting: styles.statusWaiting,
  review: styles.statusReview,
  done: styles.statusDone,
}

export default function WorkBoard({
  initialItems,
  actorRole,
}: {
  initialItems: WorkItem[]
  actorRole: string
}) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [draggingId, setDraggingId] = useState<number | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<WorkStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setItems(initialItems)
  }, [initialItems])

  function moveItem(itemId: number, nextStatus: WorkStatus) {
    const item = items.find((candidate) => candidate.id === itemId)
    if (!item || item.status === nextStatus || isPending) return

    const previousItems = items
    setError(null)
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === itemId ? { ...candidate, status: nextStatus } : candidate,
      ),
    )

    const formData = new FormData()
    formData.set('actorRole', actorRole)
    formData.set('workItemId', String(itemId))
    formData.set('status', nextStatus)

    startTransition(async () => {
      try {
        await updateWorkStatus(formData)
        router.refresh()
      } catch {
        setItems(previousItems)
        setError('Status change could not be saved. The board was restored to canonical state.')
      }
    })
  }

  return (
    <section className={styles.board} aria-label="Company work board">
      <div className={styles.boardHeader}>
        <div>
          <h2 className={styles.sectionTitle}>Company work</h2>
          <p className={styles.panelMeta}>
            Drag cards between stages. Changes are persisted to canonical work state and the event ledger.
          </p>
        </div>
        <span className={styles.id}>{items.filter((item) => item.status !== 'done').length} OPEN</span>
      </div>

      {error ? <div className={styles.boardError} role="alert">{error}</div> : null}

      <div className={styles.boardGrid}>
        {STATUSES.map(([status, label]) => {
          const columnItems = items.filter((item) => item.status === status)
          const isTarget = dragOverStatus === status && draggingId !== null

          return (
            <div
              className={`${styles.column} ${statusClass[status]} ${isTarget ? styles.columnDropTarget : ''}`}
              key={status}
              onDragEnter={(event) => {
                if (!isPending) {
                  event.preventDefault()
                  setDragOverStatus(status)
                }
              }}
              onDragOver={(event) => {
                if (!isPending) event.preventDefault()
              }}
              onDrop={(event) => {
                event.preventDefault()
                const rawId = event.dataTransfer.getData('text/plain')
                const itemId = Number.parseInt(rawId, 10)
                setDragOverStatus(null)
                setDraggingId(null)
                if (Number.isFinite(itemId)) moveItem(itemId, status)
              }}
            >
              <div className={styles.columnHeader}>
                <span className={styles.columnLabel}>
                  <span className={styles.statusDot} aria-hidden="true" />
                  {label}
                </span>
                <span>{columnItems.length}</span>
              </div>

              <div className={styles.columnBody}>
                {columnItems.map((item) => (
                  <article
                    className={`${styles.workCard} ${draggingId === item.id ? styles.workCardDragging : ''}`}
                    draggable={!isPending}
                    key={item.id}
                    onDragStart={(event) => {
                      setDraggingId(item.id)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', String(item.id))
                    }}
                    onDragEnd={() => {
                      setDraggingId(null)
                      setDragOverStatus(null)
                    }}
                  >
                    <div className={styles.workTop}>
                      <div className={styles.workIdentity}>
                        <span className={styles.dragHandle} title="Drag to change status" aria-hidden="true">⋮⋮</span>
                        <span className={styles.id}>{item.displayId}</span>
                      </div>
                      <div className={styles.workBadges}>
                        <span
                          className={`${styles.priority} ${
                            item.priority === 'critical'
                              ? styles.priorityCritical
                              : item.priority === 'high'
                                ? styles.priorityHigh
                                : item.priority === 'low'
                                  ? styles.priorityLow
                                  : ''
                          }`}
                        >
                          {item.priority}
                        </span>
                        {item.risk === 'irreversible' ? (
                          <span className={styles.riskBadge}>gated</span>
                        ) : null}
                      </div>
                    </div>

                    <h3 className={styles.workTitle}>{item.title}</h3>

                    <div className={styles.ownerRow}>
                      <span className={styles.ownerAvatar}>{item.ownerInitials}</span>
                      <span>{item.ownerName}</span>
                    </div>

                    {item.objectiveLabel ? (
                      <p className={styles.workObjective}>{item.objectiveLabel}</p>
                    ) : null}

                    {item.nextAction ? (
                      <p className={styles.nextAction}>Next: {item.nextAction}</p>
                    ) : null}

                    <label className={styles.moveFallback}>
                      <span>Move</span>
                      <select
                        aria-label={`Move ${item.title} to another status`}
                        disabled={isPending}
                        value={item.status}
                        onChange={(event) => moveItem(item.id, event.target.value as WorkStatus)}
                      >
                        {STATUSES.map(([next, nextLabel]) => (
                          <option value={next} key={next}>{nextLabel}</option>
                        ))}
                      </select>
                    </label>
                  </article>
                ))}

                {!columnItems.length ? (
                  <div className={styles.emptyDropZone}>Drop work here</div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
