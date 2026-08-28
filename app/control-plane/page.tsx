import type { Metadata } from 'next'
import Link from 'next/link'
import CopyBriefButton from './CopyBriefButton'
import WorkBoard from './WorkBoard'
import styles from './control-plane.module.css'
import {
  acceptHandoff,
  completeHandoff,
  createDecision,
  createHandoff,
  createObjective,
  createWorkItem,
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

const VIEWS = [
  ['command', 'Command'],
  ['work', 'Work'],
  ['decisions', 'Decisions'],
  ['company', 'Company'],
] as const

type View = (typeof VIEWS)[number][0]
type WorkStatus = 'backlog' | 'ready' | 'active' | 'waiting' | 'review' | 'done'

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
  searchParams: Promise<{ role?: string | string[]; view?: string | string[] }>
}) {
  const params = await searchParams
  const state = await getControlPlaneState()

  const requestedRole = Array.isArray(params.role) ? params.role[0] : params.role
  const selectedRole = state.roles.some((role) => role.slug === requestedRole)
    ? requestedRole!
    : 'ceo'

  const requestedView = Array.isArray(params.view) ? params.view[0] : params.view
  const selectedView: View = VIEWS.some(([view]) => view === requestedView)
    ? (requestedView as View)
    : 'command'

  const station = await getRoleStation(selectedRole)
  if (!station) throw new Error('Control Plane role bootstrap failed')

  const roleBySlug = new Map(state.roles.map((role) => [role.slug, role]))
  const objectiveById = new Map(state.objectives.map((objective) => [objective.id, objective]))
  const brief = buildRoleBrief(station)
  const activeWork = state.work.filter((item) => item.status !== 'done')
  const openHandoffs = state.handoffs.filter((item) => item.status === 'open')
  const activeObjectives = state.objectives.filter((item) => item.status === 'active')
  const selectedOwnedWork = state.work.filter(
    (item) => item.ownerRole === selectedRole && item.status !== 'done',
  )

  const boardItems = state.work.map((item) => {
    const ownerName = roleBySlug.get(item.ownerRole)?.name ?? item.ownerRole
    return {
      id: item.id,
      displayId: workId(item.id),
      title: item.title,
      status: item.status as WorkStatus,
      priority: item.priority,
      risk: item.risk,
      ownerName,
      ownerInitials: initials(ownerName),
      objectiveLabel: item.objectiveId
        ? `${objectiveId(item.objectiveId)} · ${objectiveById.get(item.objectiveId)?.title ?? 'Objective'}`
        : null,
      nextAction: item.nextAction || null,
    }
  })

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.eyebrow}>Company operating system · UX v1</p>
            <h1 className={styles.title}>Control Plane</h1>
            <p className={styles.subtitle}>
              Shared company state organized by the job you need to do. Choose a role for acting context,
              then choose a workspace for command, execution, decisions, or company structure.
            </p>
          </div>
          <div className={styles.liveBadge}>
            <span className={styles.liveDot} />
            Persistent state online
          </div>
        </header>

        <nav className={styles.taskTabs} aria-label="Control Plane workspace">
          {VIEWS.map(([view, label]) => (
            <Link
              className={`${styles.taskTab} ${selectedView === view ? styles.taskTabActive : ''}`}
              href={`/control-plane?role=${selectedRole}&view=${view}`}
              key={view}
            >
              {label}
            </Link>
          ))}
        </nav>

        <section className={styles.metricGrid} aria-label="Company state summary">
          <div className={`${styles.metric} ${styles.metricInfo}`}>
            <span className={styles.metricLabel}>Active objectives</span>
            <strong className={styles.metricValue}>{activeObjectives.length}</strong>
          </div>
          <div className={`${styles.metric} ${styles.metricActive}`}>
            <span className={styles.metricLabel}>Open work</span>
            <strong className={styles.metricValue}>{activeWork.length}</strong>
          </div>
          <div className={`${styles.metric} ${styles.metricAttention}`}>
            <span className={styles.metricLabel}>Open handoffs</span>
            <strong className={styles.metricValue}>{openHandoffs.length}</strong>
          </div>
          <div className={`${styles.metric} ${styles.metricHealthy}`}>
            <span className={styles.metricLabel}>Recorded decisions</span>
            <strong className={styles.metricValue}>{state.decisions.length}</strong>
          </div>
        </section>

        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            <div className={styles.sidebarHeader}>Acting role</div>
            <nav className={styles.roleList}>
              {state.roles.map((role) => (
                <Link
                  key={role.slug}
                  href={`/control-plane?role=${role.slug}&view=${selectedView}`}
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
            {selectedView === 'command' ? (
              <>
                <section className={styles.station}>
                  <article className={styles.panel}>
                    <div className={styles.panelHeader}>
                      <div>
                        <p className={styles.panelKicker}>Role station</p>
                        <h2 className={styles.panelTitle}>{station.role.name}</h2>
                        <p className={styles.panelMeta}>
                          {station.role.title} · {station.role.department}
                        </p>
                      </div>
                      <span className={styles.id}>ROLE-{station.role.slug.toUpperCase()}</span>
                    </div>

                    <div className={styles.roleHeroCompact}>
                      <div className={styles.avatar}>{initials(station.role.name)}</div>
                      <div>
                        <span className={styles.ruleLabel}>Mission</span>
                        <p className={styles.heroMission}>{station.role.mission}</p>
                      </div>
                    </div>

                    <div className={styles.ruleGridCompact}>
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
                        <p className={styles.panelKicker}>Resume context</p>
                        <h2 className={styles.panelTitle}>Invocation packet</h2>
                        <p className={styles.panelMeta}>Use only when starting a fresh role instance.</p>
                      </div>
                    </div>
                    <details className={styles.disclosure}>
                      <summary>Preview packet</summary>
                      <pre className={styles.brief}>{brief}</pre>
                    </details>
                    <CopyBriefButton brief={brief} className={styles.copyButton} />
                  </article>
                </section>

                <section className={styles.activityLayout}>
                  <article className={styles.panel}>
                    <div className={styles.sectionHeader}>
                      <div>
                        <h2 className={styles.sectionTitle}>Incoming handoffs</h2>
                        <p className={styles.panelMeta}>Requests specifically waiting for this role.</p>
                      </div>
                      <span className={`${styles.count} ${station.incomingHandoffs.length ? styles.countAttention : ''}`}>
                        {station.incomingHandoffs.length}
                      </span>
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
                            {handoff.context ? <p className={styles.cardText}>{handoff.context}</p> : null}
                            <div className={styles.cardActions}>
                              <form action={acceptHandoff}>
                                <input type="hidden" name="actorRole" value={selectedRole} />
                                <input type="hidden" name="handoffId" value={handoff.id} />
                                <button className={styles.button} type="submit">Accept</button>
                              </form>
                              <form action={completeHandoff}>
                                <input type="hidden" name="actorRole" value={selectedRole} />
                                <input type="hidden" name="handoffId" value={handoff.id} />
                                <button className={styles.secondaryButton} type="submit">Complete</button>
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
                          <p className={styles.objectiveText}><strong>Success:</strong> {objective.successCriteria}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                </section>

                <article className={styles.panel}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <h2 className={styles.sectionTitle}>Recent changes</h2>
                      <p className={styles.panelMeta}>What materially changed in company state.</p>
                    </div>
                  </div>
                  <div className={styles.eventList}>
                    {state.events.slice(0, 8).map((event) => (
                      <div className={styles.eventRow} key={event.id}>
                        <span className={styles.id}>{event.actorRole.toUpperCase()}</span>
                        <div>
                          <div className={styles.eventAction}>{event.action.replaceAll('_', ' ')}</div>
                          <div className={styles.eventObject}>{event.objectType} · {event.objectId}</div>
                        </div>
                        <span className={styles.eventTime}>{timeLabel(event.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                </article>
              </>
            ) : null}

            {selectedView === 'work' ? (
              <>
                <WorkBoard initialItems={boardItems} actorRole={selectedRole} />

                <section className={styles.actionGrid}>
                  <details className={styles.actionPanel}>
                    <summary>+ Create work item</summary>
                    <form action={createWorkItem} className={styles.form}>
                      <input type="hidden" name="actorRole" value={selectedRole} />
                      <input className={styles.field} name="title" placeholder="Work item title" required />
                      <textarea className={styles.textarea} name="description" placeholder="What needs to happen and why?" />
                      <div className={styles.twoCol}>
                        <select className={styles.select} name="ownerRole" defaultValue={selectedRole}>
                          {state.roles.map((role) => (
                            <option value={role.slug} key={role.slug}>{role.name} — {role.title}</option>
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
                      <input className={styles.field} name="nextAction" placeholder="Explicit next action" />
                      <button className={styles.button} type="submit">Create work item</button>
                    </form>
                  </details>

                  <details className={styles.actionPanel}>
                    <summary>Hand work to another role</summary>
                    <form action={createHandoff} className={styles.form}>
                      <input type="hidden" name="actorRole" value={selectedRole} />
                      <div className={styles.twoCol}>
                        <select className={styles.select} name="toRole" required defaultValue="">
                          <option value="" disabled>Receiving role</option>
                          {state.roles.filter((role) => role.slug !== selectedRole).map((role) => (
                            <option value={role.slug} key={role.slug}>{role.name} — {role.title}</option>
                          ))}
                        </select>
                        <select className={styles.select} name="workItemId" defaultValue="">
                          <option value="">No linked work item</option>
                          {selectedOwnedWork.map((item) => (
                            <option value={item.id} key={item.id}>{workId(item.id)} — {item.title}</option>
                          ))}
                        </select>
                      </div>
                      <input className={styles.field} name="summary" placeholder="What are you handing off?" required />
                      <textarea className={styles.textarea} name="context" placeholder="Context the receiving role must know" />
                      <input className={styles.field} name="requiredOutput" placeholder="Required output / definition of response" />
                      <button className={styles.button} type="submit">Create handoff</button>
                    </form>
                  </details>
                </section>
              </>
            ) : null}

            {selectedView === 'decisions' ? (
              <section className={styles.activityLayout}>
                <article className={styles.panel}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <h2 className={styles.sectionTitle}>Decision record</h2>
                      <p className={styles.panelMeta}>Material choices survive the conversation that produced them.</p>
                    </div>
                  </div>
                  <div className={styles.decisionList}>
                    {state.decisions.length ? state.decisions.map((decision) => (
                      <div className={styles.decisionCard} key={decision.id}>
                        <span className={styles.id}>{decisionId(decision.id)}</span>
                        <h3 className={styles.cardTitle}>{decision.title}</h3>
                        <p className={styles.cardText}>{decision.decision}</p>
                        <p className={styles.cardText}>Owner: {roleBySlug.get(decision.ownerRole)?.name ?? decision.ownerRole}</p>
                        {decision.rationale ? <p className={styles.cardText}>Rationale: {decision.rationale}</p> : null}
                      </div>
                    )) : <div className={styles.empty}>No decisions recorded yet.</div>}
                  </div>
                </article>

                <article className={styles.panel}>
                  <h2 className={styles.formTitle}>Record a decision</h2>
                  <form action={createDecision} className={styles.form}>
                    <input type="hidden" name="actorRole" value={selectedRole} />
                    <input className={styles.field} name="title" placeholder="Decision title" required />
                    <textarea className={styles.textarea} name="decision" placeholder="What was decided?" required />
                    <textarea className={styles.textarea} name="rationale" placeholder="Why was this decision made?" />
                    <input className={styles.field} name="evidence" placeholder="Evidence, references, or links considered" />
                    <button className={styles.button} type="submit">Record decision</button>
                  </form>
                </article>
              </section>
            ) : null}

            {selectedView === 'company' ? (
              <>
                <section className={styles.activityLayout}>
                  <article className={styles.panel}>
                    <div className={styles.sectionHeader}>
                      <div>
                        <h2 className={styles.sectionTitle}>Company objectives</h2>
                        <p className={styles.panelMeta}>Structural intent and success criteria.</p>
                      </div>
                    </div>
                    <div className={styles.decisionList}>
                      {activeObjectives.map((objective) => (
                        <div className={styles.objectiveCard} key={objective.id}>
                          <span className={styles.id}>{objectiveId(objective.id)}</span>
                          <h3 className={styles.objectiveTitle}>{objective.title}</h3>
                          <p className={styles.objectiveText}>{objective.description}</p>
                          <p className={styles.objectiveText}><strong>Success:</strong> {objective.successCriteria}</p>
                          <p className={styles.objectiveText}>
                            Owner: {roleBySlug.get(objective.ownerRole)?.name ?? objective.ownerRole}
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className={styles.panel}>
                    <h2 className={styles.formTitle}>Create company objective</h2>
                    <form action={createObjective} className={styles.form}>
                      <input type="hidden" name="actorRole" value={selectedRole} />
                      <input className={styles.field} name="title" placeholder="Objective" required />
                      <textarea className={styles.textarea} name="description" placeholder="What outcome are we pursuing?" required />
                      <textarea className={styles.textarea} name="successCriteria" placeholder="What would count as success?" required />
                      <select className={styles.select} name="ownerRole" defaultValue={selectedRole}>
                        {state.roles.map((role) => (
                          <option value={role.slug} key={role.slug}>{role.name} — {role.title}</option>
                        ))}
                      </select>
                      <button className={styles.button} type="submit">Create objective</button>
                    </form>
                  </article>
                </section>

                <article className={styles.panel}>
                  <div className={styles.sectionHeader}>
                    <div>
                      <h2 className={styles.sectionTitle}>Event ledger</h2>
                      <p className={styles.panelMeta}>Append-only trace of material company actions.</p>
                    </div>
                  </div>
                  <div className={styles.eventList}>
                    {state.events.length ? state.events.slice(0, 24).map((event) => (
                      <div className={styles.eventRow} key={event.id}>
                        <span className={styles.id}>{event.actorRole.toUpperCase()}</span>
                        <div>
                          <div className={styles.eventAction}>{event.action.replaceAll('_', ' ')}</div>
                          <div className={styles.eventObject}>{event.objectType} · {event.objectId}</div>
                        </div>
                        <span className={styles.eventTime}>{timeLabel(event.createdAt)}</span>
                      </div>
                    )) : <div className={styles.empty}>The ledger begins when the first action is recorded.</div>}
                  </div>
                </article>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  )
}
