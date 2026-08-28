import type { Metadata } from 'next'
import Link from 'next/link'
import CopyBriefButton from './CopyBriefButton'
import styles from './control-plane.module.css'
import {
  acceptHandoff,
  completeHandoff,
  createDecision,
  createHandoff,
  createObjective,
  createWorkItem,
  updateWorkStatus,
} from './actions'
import {
  buildRoleBrief,
  decisionId,
  getControlPlaneState,
  getRoleStation,
  handoffId,
  objectiveId,
  workId,
} from '@/lib/control-plane'

export const metadata: Metadata = {
  title: 'Control Plane | SmallBizzWizz',
  description: 'Private company coordination workspace.',
  robots: { index: false, follow: false },
}

const STATUSES = [
  ['backlog', 'Backlog'],
  ['ready', 'Ready'],
  ['active', 'Active'],
  ['waiting', 'Waiting'],
  ['review', 'Review'],
  ['done', 'Done'],
] as const

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function timeLabel(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  }).format(value)
}

export default async function ControlPlanePage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string | string[] }>
}) {
  const params = await searchParams
  const state = await getControlPlaneState()
  const requestedRole = Array.isArray(params.role) ? params.role[0] : params.role
  const selectedRole = state.roles.some((role) => role.slug === requestedRole)
    ? requestedRole!
    : 'ceo'
  const station = await getRoleStation(selectedRole)

  if (!station) {
    throw new Error('Control Plane role bootstrap failed')
  }

  const roleBySlug = new Map(state.roles.map((role) => [role.slug, role]))
  const brief = buildRoleBrief(station)
  const activeWork = state.work.filter((item) => item.status !== 'done')
  const openHandoffs = state.handoffs.filter((item) => item.status === 'open')
  const activeObjectives = state.objectives.filter((item) => item.status === 'active')
  const selectedOwnedWork = state.work.filter(
    (item) => item.ownerRole === selectedRole && item.status !== 'done',
  )

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>Company operating system · Prototype 0</p>
            <h1 className={styles.title}>Control Plane</h1>
            <p className={styles.subtitle}>
              Persistent shared state for a company that communicates serially. Select a role to
              see exactly what that seat owns, what is waiting for it, and the context required to
              continue without reconstructing old conversations.
            </p>
          </div>
          <div className={styles.liveBadge}>
            <span className={styles.liveDot} />
            Persistent state online
          </div>
        </header>

        <section className={styles.metricGrid} aria-label="Company state summary">
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Active objectives</span>
            <strong className={styles.metricValue}>{activeObjectives.length}</strong>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Open work</span>
            <strong className={styles.metricValue}>{activeWork.length}</strong>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Open handoffs</span>
            <strong className={styles.metricValue}>{openHandoffs.length}</strong>
          </div>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Recorded decisions</span>
            <strong className={styles.metricValue}>{state.decisions.length}</strong>
          </div>
        </section>

        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>Role stations</div>
            <nav className={styles.roleList}>
              {state.roles.map((role) => (
                <Link
                  key={role.slug}
                  href={`/control-plane?role=${role.slug}`}
                  className={`${styles.roleLink} ${
                    role.slug === selectedRole ? styles.roleLinkActive : ''
                  }`}
                >
                  <span className={styles.roleName}>{role.name}</span>
                  <span className={styles.roleTitle}>{role.title}</span>
                </Link>
              ))}
            </nav>
          </aside>

          <div className={styles.main}>
            <section className={styles.station}>
              <article className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Role Station</h2>
                    <p className={styles.panelMeta}>The durable operating contract for this seat.</p>
                  </div>
                  <span className={styles.id}>ROLE-{station.role.slug.toUpperCase()}</span>
                </div>

                <div className={styles.roleHero}>
                  <div className={styles.avatar}>{initials(station.role.name)}</div>
                  <div>
                    <h3 className={styles.heroName}>{station.role.name}</h3>
                    <p className={styles.heroDept}>
                      {station.role.title} · {station.role.department}
                    </p>
                  </div>
                </div>

                <div className={styles.ruleGrid}>
                  <div className={styles.ruleCard}>
                    <span className={styles.ruleLabel}>Mission</span>
                    <p className={styles.ruleText}>{station.role.mission}</p>
                  </div>
                  <div className={styles.ruleCard}>
                    <span className={styles.ruleLabel}>Authority</span>
                    <p className={styles.ruleText}>{station.role.authority}</p>
                  </div>
                  <div className={styles.ruleCard}>
                    <span className={styles.ruleLabel}>Restrictions</span>
                    <p className={styles.ruleText}>{station.role.restrictions}</p>
                  </div>
                </div>
              </article>

              <article className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Invocation Packet</h2>
                    <p className={styles.panelMeta}>
                      Copy this into a fresh role instance to resume from recorded state.
                    </p>
                  </div>
                </div>
                <pre className={styles.brief}>{brief}</pre>
                <CopyBriefButton brief={brief} className={styles.copyButton} />
              </article>
            </section>

            <section className={styles.activityLayout}>
              <article className={styles.panel}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>Incoming handoffs</h2>
                    <p className={styles.panelMeta}>Requests that specifically require this role.</p>
                  </div>
                  <span className={styles.count}>{station.incomingHandoffs.length}</span>
                </div>
                <div className={styles.inboxList}>
                  {station.incomingHandoffs.length ? (
                    station.incomingHandoffs.map((handoff) => (
                      <div className={styles.inboxCard} key={handoff.id}>
                        <span className={styles.id}>{handoffId(handoff.id)}</span>
                        <h3 className={styles.cardTitle}>{handoff.summary}</h3>
                        <p className={styles.cardText}>
                          From {roleBySlug.get(handoff.fromRole)?.name ?? handoff.fromRole}
                          {handoff.workItemId ? ` · ${workId(handoff.workItemId)}` : ''}
                        </p>
                        {handoff.context ? (
                          <p className={styles.cardText}>Context: {handoff.context}</p>
                        ) : null}
                        {handoff.requiredOutput ? (
                          <p className={styles.cardText}>
                            Required output: {handoff.requiredOutput}
                          </p>
                        ) : null}
                        <div className={styles.cardActions}>
                          <form action={acceptHandoff}>
                            <input type="hidden" name="actorRole" value={selectedRole} />
                            <input type="hidden" name="handoffId" value={handoff.id} />
                            <button className={styles.button} type="submit">
                              Accept
                            </button>
                          </form>
                          <form action={completeHandoff}>
                            <input type="hidden" name="actorRole" value={selectedRole} />
                            <input type="hidden" name="handoffId" value={handoff.id} />
                            <button className={styles.secondaryButton} type="submit">
                              Complete
                            </button>
                          </form>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className={styles.empty}>No open handoffs for this role.</div>
                  )}
                </div>
              </article>

              <article className={styles.panel}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>Active objectives</h2>
                    <p className={styles.panelMeta}>Why the company is spending effort.</p>
                  </div>
                  <span className={styles.count}>{activeObjectives.length}</span>
                </div>
                <div className={styles.decisionList}>
                  {activeObjectives.map((objective) => (
                    <div className={styles.objectiveCard} key={objective.id}>
                      <span className={styles.id}>{objectiveId(objective.id)}</span>
                      <h3 className={styles.objectiveTitle}>{objective.title}</h3>
                      <p className={styles.objectiveText}>{objective.description}</p>
                      <p className={styles.objectiveText}>
                        <strong>Success:</strong> {objective.successCriteria}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className={styles.board}>
              <div className={styles.boardHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Company work</h2>
                  <p className={styles.panelMeta}>
                    Kanban is a projection of canonical work state, not the source of truth itself.
                  </p>
                </div>
                <span className={styles.id}>{activeWork.length} OPEN</span>
              </div>
              <div className={styles.boardGrid}>
                {STATUSES.map(([status, label]) => {
                  const items = state.work.filter((item) => item.status === status)
                  return (
                    <div className={styles.column} key={status}>
                      <div className={styles.columnHeader}>
                        <span>{label}</span>
                        <span>{items.length}</span>
                      </div>
                      {items.map((item) => (
                        <article className={styles.workCard} key={item.id}>
                          <div className={styles.workTop}>
                            <span className={styles.id}>{workId(item.id)}</span>
                            <span
                              className={`${styles.priority} ${
                                item.priority === 'critical'
                                  ? styles.priorityCritical
                                  : item.priority === 'high'
                                    ? styles.priorityHigh
                                    : ''
                              }`}
                            >
                              {item.priority}
                            </span>
                          </div>
                          <h3 className={styles.workTitle}>{item.title}</h3>
                          <p className={styles.workOwner}>
                            Owner: {roleBySlug.get(item.ownerRole)?.name ?? item.ownerRole}
                            {item.objectiveId ? ` · ${objectiveId(item.objectiveId)}` : ''}
                          </p>
                          {item.nextAction ? (
                            <p className={styles.nextAction}>Next: {item.nextAction}</p>
                          ) : null}
                          <div className={styles.statusRow}>
                            {STATUSES.filter(([next]) => next !== item.status).map(
                              ([next, nextLabel]) => (
                                <form action={updateWorkStatus} key={next}>
                                  <input type="hidden" name="actorRole" value={selectedRole} />
                                  <input type="hidden" name="workItemId" value={item.id} />
                                  <input type="hidden" name="status" value={next} />
                                  <button className={styles.statusButton} type="submit">
                                    {nextLabel}
                                  </button>
                                </form>
                              ),
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )
                })}
              </div>
            </section>

            <section className={styles.formGrid}>
              <article className={styles.formPanel}>
                <h2 className={styles.formTitle}>Create work</h2>
                <form action={createWorkItem} className={styles.form}>
                  <input type="hidden" name="actorRole" value={selectedRole} />
                  <input className={styles.field} name="title" placeholder="Work item title" required />
                  <textarea
                    className={styles.textarea}
                    name="description"
                    placeholder="What needs to happen and why?"
                  />
                  <div className={styles.twoCol}>
                    <select className={styles.select} name="ownerRole" defaultValue={selectedRole}>
                      {state.roles.map((role) => (
                        <option value={role.slug} key={role.slug}>
                          {role.name} — {role.title}
                        </option>
                      ))}
                    </select>
                    <select className={styles.select} name="objectiveId" defaultValue="">
                      <option value="">No objective</option>
                      {activeObjectives.map((objective) => (
                        <option value={objective.id} key={objective.id}>
                          {objectiveId(objective.id)} — {objective.title}
                        </option>
                      ))}
                    </select>
                    <select className={styles.select} name="priority" defaultValue="medium">
                      <option value="low">Low priority</option>
                      <option value="medium">Medium priority</option>
                      <option value="high">High priority</option>
                      <option value="critical">Critical priority</option>
                    </select>
                    <select className={styles.select} name="risk" defaultValue="normal">
                      <option value="normal">Normal risk</option>
                      <option value="high">High risk</option>
                      <option value="irreversible">Irreversible / gated</option>
                    </select>
                  </div>
                  <input
                    className={styles.field}
                    name="nextAction"
                    placeholder="Explicit next action"
                  />
                  <button className={styles.button} type="submit">
                    Create work item
                  </button>
                </form>
              </article>

              <article className={styles.formPanel}>
                <h2 className={styles.formTitle}>Hand work to another role</h2>
                <form action={createHandoff} className={styles.form}>
                  <input type="hidden" name="actorRole" value={selectedRole} />
                  <div className={styles.twoCol}>
                    <select className={styles.select} name="toRole" required defaultValue="">
                      <option value="" disabled>
                        Receiving role
                      </option>
                      {state.roles
                        .filter((role) => role.slug !== selectedRole)
                        .map((role) => (
                          <option value={role.slug} key={role.slug}>
                            {role.name} — {role.title}
                          </option>
                        ))}
                    </select>
                    <select className={styles.select} name="workItemId" defaultValue="">
                      <option value="">No linked work item</option>
                      {selectedOwnedWork.map((item) => (
                        <option value={item.id} key={item.id}>
                          {workId(item.id)} — {item.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input className={styles.field} name="summary" placeholder="What are you handing off?" required />
                  <textarea
                    className={styles.textarea}
                    name="context"
                    placeholder="Context the receiving role must know"
                  />
                  <input
                    className={styles.field}
                    name="requiredOutput"
                    placeholder="Required output / definition of response"
                  />
                  <button className={styles.button} type="submit">
                    Create handoff
                  </button>
                </form>
              </article>

              <article className={styles.formPanel}>
                <h2 className={styles.formTitle}>Record a decision</h2>
                <form action={createDecision} className={styles.form}>
                  <input type="hidden" name="actorRole" value={selectedRole} />
                  <input className={styles.field} name="title" placeholder="Decision title" required />
                  <textarea
                    className={styles.textarea}
                    name="decision"
                    placeholder="What was decided?"
                    required
                  />
                  <textarea
                    className={styles.textarea}
                    name="rationale"
                    placeholder="Why was this decision made?"
                  />
                  <input
                    className={styles.field}
                    name="evidence"
                    placeholder="Evidence, references, or links considered"
                  />
                  <button className={styles.button} type="submit">
                    Record decision
                  </button>
                </form>
              </article>

              <article className={styles.formPanel}>
                <h2 className={styles.formTitle}>Create company objective</h2>
                <form action={createObjective} className={styles.form}>
                  <input type="hidden" name="actorRole" value={selectedRole} />
                  <input className={styles.field} name="title" placeholder="Objective" required />
                  <textarea
                    className={styles.textarea}
                    name="description"
                    placeholder="What outcome are we pursuing?"
                    required
                  />
                  <textarea
                    className={styles.textarea}
                    name="successCriteria"
                    placeholder="What would count as success?"
                    required
                  />
                  <select className={styles.select} name="ownerRole" defaultValue={selectedRole}>
                    {state.roles.map((role) => (
                      <option value={role.slug} key={role.slug}>
                        {role.name} — {role.title}
                      </option>
                    ))}
                  </select>
                  <button className={styles.button} type="submit">
                    Create objective
                  </button>
                </form>
              </article>
            </section>

            <section className={styles.activityLayout}>
              <article className={styles.panel}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>Decision record</h2>
                    <p className={styles.panelMeta}>Material choices survive the conversation that produced them.</p>
                  </div>
                </div>
                <div className={styles.decisionList}>
                  {state.decisions.length ? (
                    state.decisions.slice(0, 10).map((decision) => (
                      <div className={styles.decisionCard} key={decision.id}>
                        <span className={styles.id}>{decisionId(decision.id)}</span>
                        <h3 className={styles.cardTitle}>{decision.title}</h3>
                        <p className={styles.cardText}>{decision.decision}</p>
                        <p className={styles.cardText}>
                          Owner: {roleBySlug.get(decision.ownerRole)?.name ?? decision.ownerRole}
                        </p>
                        {decision.rationale ? (
                          <p className={styles.cardText}>Rationale: {decision.rationale}</p>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className={styles.empty}>No decisions recorded yet.</div>
                  )}
                </div>
              </article>

              <article className={styles.panel}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>Event ledger</h2>
                    <p className={styles.panelMeta}>Append-only trace of material company actions.</p>
                  </div>
                </div>
                <div className={styles.eventList}>
                  {state.events.length ? (
                    state.events.slice(0, 16).map((event) => (
                      <div className={styles.eventRow} key={event.id}>
                        <span className={styles.id}>{event.actorRole.toUpperCase()}</span>
                        <div>
                          <div className={styles.eventAction}>{event.action.replaceAll('_', ' ')}</div>
                          <div className={styles.eventObject}>
                            {event.objectType} · {event.objectId}
                          </div>
                        </div>
                        <span className={styles.eventTime}>{timeLabel(event.createdAt)}</span>
                      </div>
                    ))
                  ) : (
                    <div className={styles.empty}>
                      The ledger begins when the first human action is recorded.
                    </div>
                  )}
                </div>
              </article>
            </section>
          </div>
        </div>
      </div>
    </main>
  )
}
