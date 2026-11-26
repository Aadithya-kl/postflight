import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  KeyRound,
  Lock,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import {
  activateKillSwitch,
  auditOAuthTokens,
  canPublish,
  createKillSwitchState,
  detectDuplicatesAndCannibalization,
  listPlatformSpecs,
  recordGovernanceEvent,
  releaseKillSwitch,
  verifyAuditChain,
} from '@postflight/core';
import type {
  DuplicateCheckInput,
  KillSwitchState,
  OAuthConnectionInput,
  PlatformId,
} from '@postflight/core';
import {
  createSampleCampaignCalendar,
  createSampleOAuthConnections,
} from '../data/presets';

interface GovernanceDeckProps {
  onAnnounce: (message: string) => void;
  killSwitchFrozen: boolean;
  onFrozenChange: (frozen: boolean) => void;
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  DRAFT_CREATED: 'Draft created',
  PREFLIGHT_PASSED: 'Pre-flight passed',
  KILL_SWITCH_ACTIVATED: 'Publishing paused',
  KILL_SWITCH_RELEASED: 'Publishing resumed',
  PUBLISH_BLOCKED: 'Publish blocked',
  QUEUED: 'Post queued',
};

function formatAuditAction(action: string): string {
  return (
    AUDIT_ACTION_LABELS[action] ??
    action
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/^./, (c) => c.toUpperCase())
  );
}

function formatTokenStatus(status: string): string {
  if (status === 'expiring-soon') return 'Expiring soon';
  if (status === 'expired') return 'Expired';
  if (status === 'critical') return 'Critical';
  return 'Healthy';
}

function formatRiskLabel(risk: string): string {
  if (risk === 'critical') return 'Critical';
  if (risk === 'high') return 'High';
  if (risk === 'medium') return 'Medium';
  return 'Low';
}

function createSeededKillSwitchState(): KillSwitchState {
  let state = createKillSwitchState();
  state = recordGovernanceEvent(state, {
    actor: 'release-bot',
    action: 'DRAFT_CREATED',
    targetId: 'launch-postflight-v1',
    reason: 'Canonical launch markdown registered in pre-flight workspace.',
  });
  state = recordGovernanceEvent(state, {
    actor: 'ci-preflight',
    action: 'PREFLIGHT_PASSED',
    targetId: 'launch-postflight-v1',
    reason: 'Passed 6/6 target platform rules with score 98/100 (Grade A+).',
  });
  return state;
}

export function GovernanceDeck({
  onAnnounce,
  onFrozenChange,
}: GovernanceDeckProps) {
  const idPrefix = useId();
  const specs = useMemo(() => listPlatformSpecs(), []);

  // 1. Crisis Kill-Switch & SHA-256 Ledger state
  const [killState, setKillState] = useState<KillSwitchState>(createSeededKillSwitchState);
  const [modalMode, setModalMode] = useState<'activate' | 'release'>('activate');
  const [modalActor, setModalActor] = useState('comms-lead@acme.dev');
  const [modalReason, setModalReason] = useState(
    'Checkout 500 outage reported on X — holding all scheduled promotional posts until engineering clears incident.',
  );
  const [lastVerifyMessage, setLastVerifyMessage] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const pointerDownOutsideRef = useRef(false);

  // Sync frozen state up to App header badge
  useEffect(() => {
    onFrozenChange(killState.frozen);
  }, [killState.frozen, onFrozenChange]);

  // 2. OAuth Token Decay Radar state
  const [connections, setConnections] = useState<OAuthConnectionInput[]>(() =>
    createSampleOAuthConnections(),
  );
  const tokenAudit = useMemo(() => auditOAuthTokens(connections), [connections]);

  // 3. Duplicate & LinkedIn 24h Cannibalization Calendar state
  const [calendarDrafts, setCalendarDrafts] = useState<DuplicateCheckInput[]>(() =>
    createSampleCampaignCalendar(),
  );
  const collisions = useMemo(
    () => detectDuplicatesAndCannibalization(calendarDrafts),
    [calendarDrafts],
  );

  const publishStatus = useMemo(() => canPublish(killState), [killState]);
  const chainIntegrity = useMemo(
    () => verifyAuditChain(killState.auditLog),
    [killState.auditLog],
  );

  function openConfirmDialog(mode: 'activate' | 'release') {
    setModalMode(mode);
    setModalReason(
      mode === 'activate'
        ? 'Checkout 500 outage reported on X — holding all scheduled promotional posts until engineering clears incident.'
        : 'Incident #INC-402 resolved and verified by engineering; resuming scheduled queues.',
    );
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }

  function handleDialogClose() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Reset returnValue on close per modern-web-guidance dialog spec
    dialog.returnValue = '';
  }

  function isPointOutsideDialog(dialog: HTMLDialogElement, clientX: number, clientY: number): boolean {
    const rect = dialog.getBoundingClientRect();
    return (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    );
  }

  function handleDialogPointerDown(e: React.PointerEvent<HTMLDialogElement>) {
    const dialog = dialogRef.current;
    if (!dialog || e.target !== dialog) {
      pointerDownOutsideRef.current = false;
      return;
    }
    pointerDownOutsideRef.current = isPointOutsideDialog(dialog, e.clientX, e.clientY);
  }

  function handleDialogPointerUp(e: React.PointerEvent<HTMLDialogElement>) {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const supportsClosedBy = 'closedBy' in dialog;
    if (
      !supportsClosedBy &&
      pointerDownOutsideRef.current &&
      e.target === dialog &&
      isPointOutsideDialog(dialog, e.clientX, e.clientY)
    ) {
      dialog.close('dismiss');
    }
    pointerDownOutsideRef.current = false;
  }

  function handleConfirmKillSwitch(e: React.FormEvent) {
    e.preventDefault();
    const actor = modalActor.trim() || 'operator';
    const reason =
      modalReason.trim() ||
      (modalMode === 'activate'
        ? 'Publishing paused due to an active incident.'
        : 'Publishing resumed after review.');

    if (modalMode === 'activate') {
      setKillState((prev) => activateKillSwitch(prev, actor, reason));
      onAnnounce(`Publishing paused by ${actor}. All scheduled posts are on hold.`);
    } else {
      setKillState((prev) => releaseKillSwitch(prev, actor, reason));
      onAnnounce(`Publishing resumed by ${actor}. Scheduled posts can go out again.`);
    }
    setLastVerifyMessage(null);
    dialogRef.current?.close('confirm');
  }

  function handleSimulatePublishAttempt() {
    const gate = canPublish(killState);
    if (!gate.allowed) {
      setKillState((prev) =>
        recordGovernanceEvent(prev, {
          actor: 'scheduler-worker-01',
          action: 'PUBLISH_BLOCKED',
          targetId: 'scheduled-promo-slot',
          reason: gate.reason,
        }),
      );
      onAnnounce('Publish attempt blocked while publishing is paused and recorded in the audit log.');
    } else {
      setKillState((prev) =>
        recordGovernanceEvent(prev, {
          actor: 'scheduler-worker-01',
          action: 'QUEUED',
          targetId: 'scheduled-promo-slot',
          reason: 'Publishing active — post dispatched to publishing queue.',
        }),
      );
      onAnnounce('Test publish permitted and recorded in the audit log.');
    }
    setLastVerifyMessage(null);
  }

  function handleVerifyChainClick() {
    const check = verifyAuditChain(killState.auditLog);
    if (check.valid) {
      const msg = `Verified ${killState.auditLog.length} of ${killState.auditLog.length} SHA-256 log entries intact.`;
      setLastVerifyMessage(msg);
      onAnnounce(msg);
    } else {
      const msg = `Tampering detected at entry #${check.brokenAtSeq}. Hash chain does not match.`;
      setLastVerifyMessage(msg);
      onAnnounce(msg);
    }
  }

  function handleSimulateTamper() {
    setKillState((prev) => {
      if (prev.auditLog.length === 0) return prev;
      const cloned = prev.auditLog.map((entry, idx) =>
        idx === prev.auditLog.length - 1
          ? { ...entry, reason: `${entry.reason} [edited without re-hashing]` }
          : entry,
      );
      return { ...prev, auditLog: cloned };
    });
    const msg = 'Simulated an unauthorized edit on the latest entry — click Verify integrity to check.';
    setLastVerifyMessage(msg);
    onAnnounce(msg);
  }

  function updateConnection(id: string, patch: Partial<OAuthConnectionInput>) {
    setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function updateCalendarDraft(id: string, patch: Partial<DuplicateCheckInput>) {
    setCalendarDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function addCalendarDraft() {
    const idx = calendarDrafts.length + 1;
    setCalendarDrafts((prev) => [
      ...prev,
      {
        id: `draft-slot-${idx}`,
        platform: 'linkedin',
        publishedAt: new Date(Date.now() + 10 * 3_600_000).toISOString(),
        text: 'We analyzed 9 social platforms and found why great posts silently fail across LinkedIn and Instagram.',
      },
    ]);
    onAnnounce(`Added campaign calendar slot draft-slot-${idx}.`);
  }

  return (
    <div className="lab-stack">
      <div className="section-header">
        <div>
          <h2 className="section-title">Publishing safety &amp; account health</h2>
          <p className="section-desc">
            Pause all scheduled posts during an incident, monitor expiring social tokens, and catch
            duplicate posts.
          </p>
        </div>
      </div>

      {/* 1. Publishing Pause Banner */}
      <section
        className={`killswitch-banner ${killState.frozen ? 'killswitch-banner--frozen' : ''}`}
        aria-labelledby={`${idPrefix}-ks-heading`}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', maxWidth: '70ch' }}>
          {killState.frozen ? (
            <Lock size={26} style={{ color: 'var(--hazard)', flex: 'none', marginTop: 2 }} aria-hidden="true" />
          ) : (
            <ShieldCheck size={26} style={{ color: 'var(--cleared)', flex: 'none', marginTop: 2 }} aria-hidden="true" />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div className="btn-row">
              <h3 id={`${idPrefix}-ks-heading`} style={{ fontSize: 'var(--text-lg)' }}>
                {killState.frozen ? 'Publishing is paused' : 'Publishing is active'}
              </h3>
              <span
                className={`badge tabular ${killState.frozen ? 'badge--error' : 'badge--cleared'}`}
              >
                Blocked attempts: {killState.blockedAttemptCount}
              </span>
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>
              {publishStatus.reason}
            </p>
          </div>
        </div>

        <div className="btn-row">
          <button
            type="button"
            className="btn"
            onClick={handleSimulatePublishAttempt}
          >
            Test publish block
          </button>
          {killState.frozen ? (
            <button
              type="button"
              className="btn btn-cleared"
              onClick={() => openConfirmDialog('release')}
            >
              <Unlock size={16} aria-hidden="true" />
              Resume publishing
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-hazard"
              onClick={() => openConfirmDialog('activate')}
            >
              <Lock size={16} aria-hidden="true" />
              Pause all publishing
            </button>
          )}
        </div>
      </section>

      {/* Native <dialog> Confirmation Modal (modern-web-guidance compliant) */}
      <dialog
        ref={dialogRef}
        className="pf-dialog"
        aria-labelledby={`${idPrefix}-dlg-title`}
        aria-describedby={`${idPrefix}-dlg-desc`}
        onClose={handleDialogClose}
        onPointerDown={handleDialogPointerDown}
        onPointerUp={handleDialogPointerUp}
        {...({ closedby: 'any' } as Record<string, string>)}
      >
        <div className="pf-dialog-header">
          <div>
            <h3 id={`${idPrefix}-dlg-title`} className="card-title">
              {modalMode === 'activate'
                ? 'Pause all scheduled publishing?'
                : 'Resume scheduled publishing?'}
            </h3>
            <p id={`${idPrefix}-dlg-desc`} className="card-subtitle">
              {modalMode === 'activate'
                ? 'This stops all scheduled posts immediately and records a signed SHA-256 entry in the audit log.'
                : 'Scheduled posts will be allowed to publish again, and this change will be logged.'}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-label="Close confirmation dialog"
            onClick={() => dialogRef.current?.close('cancel')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleConfirmKillSwitch}>
          <div className="pf-dialog-body">
            <div className="field-group">
              <label className="field-label" htmlFor={`${idPrefix}-dlg-actor`}>
                Authorized by
              </label>
              <input
                id={`${idPrefix}-dlg-actor`}
                type="text"
                required
                className="input mono"
                value={modalActor}
                onChange={(e) => setModalActor(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor={`${idPrefix}-dlg-reason`}>
                Reason
              </label>
              <textarea
                id={`${idPrefix}-dlg-reason`}
                required
                className="textarea"
                style={{ minHeight: '88px' }}
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
              />
            </div>
          </div>

          <div className="pf-dialog-footer">
            {/* autoFocus strictly on Cancel for safe destructive confirmation */}
            <button
              type="button"
              className="btn"
              autoFocus
              onClick={() => dialogRef.current?.close('cancel')}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`btn ${modalMode === 'activate' ? 'btn-hazard' : 'btn-cleared'}`}
            >
              {modalMode === 'activate' ? (
                <>
                  <Lock size={15} aria-hidden="true" />
                  Pause all publishing
                </>
              ) : (
                <>
                  <Unlock size={15} aria-hidden="true" />
                  Resume publishing
                </>
              )}
            </button>
          </div>
        </form>
      </dialog>

      {/* SHA-256 Tamper-Evident Audit Log */}
      <section className="instrument-card" aria-labelledby={`${idPrefix}-ledger-heading`}>
        <div className="card-header">
          <div className="card-title-group">
            <ShieldCheck size={18} aria-hidden="true" />
            <div>
              <h3 id={`${idPrefix}-ledger-heading`} className="card-title">
                Audit log
              </h3>
              <p className="card-subtitle tabular">
                {killState.auditLog.length} SHA-256 chained{' '}
                {killState.auditLog.length === 1 ? 'entry' : 'entries'}
              </p>
            </div>
          </div>
          <div className="btn-row">
            <span className={`badge ${chainIntegrity.valid ? 'badge--cleared' : 'badge--error'}`}>
              {chainIntegrity.valid
                ? 'Chain verified'
                : `Tampered at #${chainIntegrity.brokenAtSeq}`}
            </span>
            <button type="button" className="btn btn-sm btn-primary" onClick={handleVerifyChainClick}>
              <CheckCircle2 size={14} aria-hidden="true" />
              Verify integrity
            </button>
            <button type="button" className="btn btn-sm" onClick={handleSimulateTamper}>
              <AlertTriangle size={14} aria-hidden="true" />
              Test tamper check
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setKillState(createSeededKillSwitchState());
                setLastVerifyMessage(null);
                onAnnounce('Reset audit log to clean state.');
              }}
            >
              <RotateCcw size={14} aria-hidden="true" />
              Reset log
            </button>
          </div>
        </div>

        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {lastVerifyMessage && (
            <div
              className={`diag-item ${chainIntegrity.valid ? '' : 'diag-item--error'}`}
              style={{
                borderInlineStartColor: chainIntegrity.valid ? 'var(--cleared)' : 'var(--hazard)',
              }}
            >
              <p className="diag-msg">{lastVerifyMessage}</p>
            </div>
          )}

          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Action</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Reason</th>
                  <th scope="col">SHA-256 hash</th>
                </tr>
              </thead>
              <tbody>
                {killState.auditLog.map((entry) => (
                  <tr key={`${entry.seq}-${entry.hash}`}>
                    <td className="mono tabular" style={{ fontWeight: 700 }}>
                      #{entry.seq}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          entry.action === 'KILL_SWITCH_ACTIVATED' ||
                          entry.action === 'PUBLISH_BLOCKED'
                            ? 'badge--error'
                            : entry.action === 'KILL_SWITCH_RELEASED' ||
                                entry.action === 'PREFLIGHT_PASSED'
                              ? 'badge--cleared'
                              : 'badge--accent'
                        }`}
                      >
                        {formatAuditAction(entry.action)}
                      </span>
                    </td>
                    <td className="mono">{entry.actor}</td>
                    <td>
                      <div>{entry.reason}</div>
                      <div className="mono field-hint" style={{ fontSize: '0.68rem' }}>
                        {entry.timestamp}
                      </div>
                    </td>
                    <td>
                      <span className="hash-chip" title={entry.hash}>
                        {entry.hash.slice(0, 16)}&hellip;{entry.hash.slice(-8)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 2. Connected account tokens */}
      <section className="instrument-card" aria-labelledby={`${idPrefix}-oauth-heading`}>
        <div className="card-header">
          <div className="card-title-group">
            <KeyRound size={18} aria-hidden="true" />
            <div>
              <h3 id={`${idPrefix}-oauth-heading`} className="card-title">
                Connected account tokens
              </h3>
              <p className="card-subtitle">
                Monitor expiring social OAuth tokens, refresh limits, and platform-specific access
                rules
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setConnections(createSampleOAuthConnections());
              onAnnounce('Reset connected account tokens to sample state.');
            }}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Reset connections
          </button>
        </div>

        <div className="card-body">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Status</th>
                  <th scope="col">Token expiry</th>
                  <th scope="col">Simulation controls</th>
                  <th scope="col">Risks &amp; next step</th>
                </tr>
              </thead>
              <tbody>
                {tokenAudit.map((health) => {
                  const rawConn = connections.find((c) => c.id === health.connectionId);
                  const statusClass =
                    health.status === 'expired' || health.status === 'critical'
                      ? 'badge--error'
                      : health.status === 'expiring-soon'
                        ? 'badge--warning'
                        : 'badge--cleared';

                  return (
                    <tr key={health.connectionId}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{health.accountHandle}</div>
                        <div className="mono field-hint">{health.platform}</div>
                      </td>
                      <td>
                        <span className={`badge ${statusClass}`}>
                          {formatTokenStatus(health.status)}
                        </span>
                        <div className="field-hint" style={{ marginTop: 4 }}>
                          Auto-refresh: <strong>{health.canAutoRefresh ? 'Yes' : 'No'}</strong>
                        </div>
                      </td>
                      <td className="mono tabular">
                        <div>
                          Access:{' '}
                          {health.accessHoursRemaining === null
                            ? 'non-expiring'
                            : `${health.accessHoursRemaining.toFixed(1)}h`}
                        </div>
                        <div className="field-hint">
                          Refresh:{' '}
                          {health.refreshDaysRemaining === null
                            ? 'n/a'
                            : `${health.refreshDaysRemaining.toFixed(1)}d`}
                        </div>
                      </td>
                      <td>
                        {rawConn && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {rawConn.platform === 'x' && (
                              <>
                                <label className="checkbox-pill" style={{ padding: '4px 8px' }}>
                                  <input
                                    type="checkbox"
                                    checked={Boolean(rawConn.hasOfflineAccess)}
                                    onChange={(e) =>
                                      updateConnection(rawConn.id, {
                                        hasOfflineAccess: e.target.checked,
                                      })
                                    }
                                  />
                                  offline.access
                                </label>
                                <label className="checkbox-pill" style={{ padding: '4px 8px' }}>
                                  <input
                                    type="checkbox"
                                    checked={(rawConn.concurrentWorkers ?? 1) === 1}
                                    onChange={(e) =>
                                      updateConnection(rawConn.id, {
                                        concurrentWorkers: e.target.checked ? 1 : 3,
                                      })
                                    }
                                  />
                                  Single-flight lock
                                </label>
                              </>
                            )}
                            {rawConn.platform === 'linkedin' && (
                              <label className="checkbox-pill" style={{ padding: '4px 8px' }}>
                                <input
                                  type="checkbox"
                                  checked={Boolean(rawConn.isMarketingPartner)}
                                  onChange={(e) =>
                                    updateConnection(rawConn.id, {
                                      isMarketingPartner: e.target.checked,
                                    })
                                  }
                                />
                                Marketing partner
                              </label>
                            )}
                            {rawConn.platform === 'tiktok' && (
                              <label className="checkbox-pill" style={{ padding: '4px 8px' }}>
                                <input
                                  type="checkbox"
                                  checked={rawConn.isAppAudited !== false}
                                  onChange={(e) =>
                                    updateConnection(rawConn.id, {
                                      isAppAudited: e.target.checked,
                                    })
                                  }
                                />
                                App audited (public)
                              </label>
                            )}
                            {rawConn.platform === 'instagram-feed' && (
                              <button
                                type="button"
                                className="btn btn-sm"
                                onClick={() =>
                                  updateConnection(rawConn.id, {
                                    accessTokenIssuedAt: new Date(
                                      Date.now() - 48 * 3_600_000,
                                    ).toISOString(),
                                  })
                                }
                              >
                                Age past 24h
                              </button>
                            )}
                            {rawConn.platform === 'bluesky' && (
                              <span className="badge badge--cleared">Healthy</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ maxWidth: '420px' }}>
                        <ul style={{ margin: 0, paddingInlineStart: '1.1rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {health.risks.map((risk) => (
                            <li key={risk}>{risk}</li>
                          ))}
                        </ul>
                        <p style={{ marginTop: '6px', color: 'var(--accent)', fontWeight: 600 }}>
                          Next step: {health.actionRequired}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 3. Duplicate & overlap check */}
      <section className="instrument-card" aria-labelledby={`${idPrefix}-dup-heading`}>
        <div className="card-header">
          <div className="card-title-group">
            <CalendarClock size={18} aria-hidden="true" />
            <div>
              <h3 id={`${idPrefix}-dup-heading`} className="card-title">
                Duplicate &amp; overlap check
              </h3>
              <p className="card-subtitle tabular">
                {calendarDrafts.length} scheduled{' '}
                {calendarDrafts.length === 1 ? 'post' : 'posts'}, {collisions.length}{' '}
                {collisions.length === 1 ? 'overlap' : 'overlaps'} found
              </p>
            </div>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-sm btn-primary" onClick={addCalendarDraft}>
              <Plus size={14} aria-hidden="true" />
              Add post
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setCalendarDrafts(createSampleCampaignCalendar());
                onAnnounce('Restored sample campaign calendar.');
              }}
            >
              <RotateCcw size={14} aria-hidden="true" />
              Reset calendar
            </button>
          </div>
        </div>

        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Collision Findings */}
          <div className="diag-list" aria-label="Detected duplicate and overlap warnings">
            {collisions.length === 0 ? (
              <div className="telemetry-pill telemetry-pill--cleared">
                <CheckCircle2 size={15} aria-hidden="true" />
                No duplicate posts or LinkedIn 24-hour posting overlaps found.
              </div>
            ) : (
              collisions.map((col) => (
                <div
                  key={`${col.draftA}-${col.draftB}`}
                  className={`diag-item ${
                    col.risk === 'critical'
                      ? 'diag-item--error'
                      : col.risk === 'high'
                        ? 'diag-item--warning'
                        : ''
                  }`}
                >
                  <div className="diag-head">
                    <span className="btn-row">
                      <span
                        className={`badge ${
                          col.risk === 'critical'
                            ? 'badge--error'
                            : col.risk === 'high'
                              ? 'badge--warning'
                              : 'badge--accent'
                        }`}
                      >
                        {formatRiskLabel(col.risk)}
                      </span>
                      <span className="mono" style={{ fontWeight: 700, fontSize: '0.78rem' }}>
                        {col.draftA} &harr; {col.draftB}
                      </span>
                    </span>
                    <span className="btn-row">
                      <span className="badge tabular">
                        {col.exactMatch
                          ? 'Exact duplicate'
                          : `${Math.round(col.jaccardSimilarity * 100)}% similar`}
                      </span>
                      {col.hoursApart !== undefined && (
                        <span className="badge badge--warning tabular">
                          {col.hoursApart}h apart
                        </span>
                      )}
                    </span>
                  </div>
                  {col.cannibalizationWarning && (
                    <p className="diag-msg" style={{ color: 'var(--hazard-text)' }}>
                      {col.cannibalizationWarning}
                    </p>
                  )}
                  <p className="diag-hint">{col.recommendation}</p>
                </div>
              ))
            )}
          </div>

          {/* Editable Calendar Rows */}
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            {calendarDrafts.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  background: 'var(--canvas)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <span className="mono" style={{ fontWeight: 700, fontSize: '0.8rem' }}>
                    {item.id}
                  </span>
                  <div className="btn-row">
                    <select
                      className="select"
                      style={{ width: 'auto', padding: '5px 8px', fontSize: 'var(--text-xs)' }}
                      value={item.platform ?? 'linkedin'}
                      aria-label={`Platform for ${item.id}`}
                      onChange={(e) =>
                        updateCalendarDraft(item.id, { platform: e.target.value as PlatformId })
                      }
                    >
                      {specs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.shortName}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      className="input mono tabular"
                      style={{ width: '215px', padding: '5px 8px', fontSize: 'var(--text-xs)' }}
                      value={item.publishedAt ?? ''}
                      aria-label={`Scheduled ISO timestamp for ${item.id}`}
                      onChange={(e) =>
                        updateCalendarDraft(item.id, { publishedAt: e.target.value })
                      }
                    />
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      aria-label={`Remove ${item.id}`}
                      onClick={() =>
                        setCalendarDrafts((prev) => prev.filter((d) => d.id !== item.id))
                      }
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <textarea
                  className="textarea"
                  style={{ minHeight: '64px', fontSize: 'var(--text-xs)' }}
                  aria-label={`Copy text for ${item.id}`}
                  value={item.text}
                  onChange={(e) => updateCalendarDraft(item.id, { text: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
