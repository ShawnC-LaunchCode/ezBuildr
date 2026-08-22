import { randomBytes, randomUUID } from 'crypto';

import type { WorkflowRun } from '@shared/schema';

import { RUN_TOKEN_CONFIG } from '../../config/auth';
import {
  runResumeLinkRepository,
  userRepository,
  workflowRunRepository,
} from '../../repositories';
import { hashToken } from '../../utils/encryption';
import { createError } from '../../utils/errors';
import { auditLogService } from '../AuditLogService';
import { sendRunResumeEmail } from '../emailService';
import { withTenant, withVerifiedIdentifier } from '../../utils/rlsContext';
import { workflowTenantResolver } from '../WorkflowTenantResolver';
import { workflowService } from '../WorkflowService';
import { RunAuthResolver, runAuthResolver } from './RunAuthResolver';

const MIN_EXPIRY_MINUTES = 15;
const MAX_EXPIRY_MINUTES = 7 * 24 * 60;

export interface RunResumeAuthContext {
  userId?: string;
  tokenRunId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface RunResumeDependencies {
  runRepo?: typeof workflowRunRepository;
  resumeRepo?: typeof runResumeLinkRepository;
  userRepo?: typeof userRepository;
  authResolver?: RunAuthResolver;
  auditService?: Pick<typeof auditLogService, 'logRunEvent'>;
  emailSender?: typeof sendRunResumeEmail;
  staffAccessVerifier?: (workflowId: string, userId: string) => Promise<void>;
  now?: () => Date;
  resumeTokenFactory?: () => string;
  runTokenFactory?: () => string;
}

interface AuthorizedRun {
  run: WorkflowRun;
  tenantId: string;
  access: 'owner' | 'creator' | 'assignee' | 'public' | 'none';
}

interface CreatedLink {
  id: string;
  token: string;
  expiresAt: Date;
  recipientEmail: string;
  kind: 'save_resume' | 'handoff';
}

export class RunResumeService {
  private readonly runRepo;
  private readonly resumeRepo;
  private readonly userRepo;
  private readonly authResolver;
  private readonly auditService;
  private readonly emailSender;
  private readonly staffAccessVerifier;
  private readonly now;
  private readonly resumeTokenFactory;
  private readonly runTokenFactory;

  constructor(dependencies: RunResumeDependencies = {}) {
    this.runRepo = dependencies.runRepo ?? workflowRunRepository;
    this.resumeRepo = dependencies.resumeRepo ?? runResumeLinkRepository;
    this.userRepo = dependencies.userRepo ?? userRepository;
    this.authResolver = dependencies.authResolver ?? runAuthResolver;
    this.auditService = dependencies.auditService ?? auditLogService;
    this.emailSender = dependencies.emailSender ?? sendRunResumeEmail;
    this.staffAccessVerifier = dependencies.staffAccessVerifier ?? (async (workflowId, userId) => {
      await workflowService.verifyAccess(workflowId, userId, 'edit');
    });
    this.now = dependencies.now ?? (() => new Date());
    this.resumeTokenFactory = dependencies.resumeTokenFactory ?? (() => randomBytes(32).toString('hex'));
    this.runTokenFactory = dependencies.runTokenFactory ?? randomUUID;
  }

  async requestResumeLink(input: {
    runId: string;
    email: string;
    expiryMinutes: number;
    auth: RunResumeAuthContext;
  }): Promise<{ expiresAt: Date }> {
    const authorized = await this.authorize(input.runId, input.auth, false);
    this.assertIncomplete(authorized.run);
    const recipientEmail = input.email.trim().toLowerCase();
    const expiryMinutes = this.validateExpiry(input.expiryMinutes);
    // `run_resume_links` is RLS-covered and `.transaction()` on a repository is
    // a BARE transaction with no tenant GUC, so every insert here failed WITH
    // CHECK under enforcement.
    const created = await withTenant(authorized.tenantId, async (tx) => {
      const now = this.now();
      await this.resumeRepo.revokeActiveForRun(input.runId, now, tx);
      return this.createLink({
        run: authorized.run,
        tenantId: authorized.tenantId,
        recipientEmail,
        expiryMinutes,
        kind: 'save_resume',
        actorUserId: input.auth.userId,
        auth: input.auth,
      }, tx);
    });

    await this.deliverOrRevoke(authorized.run.id, created);
    return { expiresAt: created.expiresAt };
  }

  async handoffRun(input: {
    runId: string;
    assigneeUserId?: string;
    clientEmail?: string;
    expiryMinutes: number;
    auth: RunResumeAuthContext;
  }): Promise<{ assignedToUserId: string | null; clientEmail: string; expiresAt: Date }> {
    const authorized = await this.authorize(input.runId, input.auth, true);
    this.assertIncomplete(authorized.run);
    const target = await this.resolveHandoffTarget(
      authorized.tenantId,
      input.assigneeUserId,
      input.clientEmail,
    );
    const expiryMinutes = this.validateExpiry(input.expiryMinutes);
    const created = await withTenant(authorized.tenantId, async (tx) => {
      const now = this.now();
      await this.runRepo.updateIfIncomplete(input.runId, {
        assignedToUserId: target.userId,
        clientEmail: target.email,
        accessMode: 'portal',
        assignmentUpdatedAt: now,
        tokenExpiresAt: new Date(now.getTime() - 1000),
      }, tx);
      await this.resumeRepo.revokeActiveForRun(input.runId, now, tx);
      const link = await this.createLink({
        run: authorized.run,
        tenantId: authorized.tenantId,
        recipientEmail: target.email,
        expiryMinutes,
        kind: 'handoff',
        actorUserId: input.auth.userId,
        auth: input.auth,
      }, tx);
      await this.auditService.logRunEvent({
        runId: input.runId,
        tenantId: authorized.tenantId,
        eventType: 'run_handoff',
        actorUserId: input.auth.userId,
        details: {
          previousAssignedToUserId: authorized.run.assignedToUserId,
          previousClientEmail: authorized.run.clientEmail,
          assignedToUserId: target.userId,
          clientEmail: target.email,
          expiresAt: link.expiresAt.toISOString(),
        },
        ipAddress: input.auth.ipAddress,
        userAgent: input.auth.userAgent,
      }, tx);
      return link;
    });

    await this.deliverOrRevoke(input.runId, created);
    return {
      assignedToUserId: target.userId,
      clientEmail: target.email,
      expiresAt: created.expiresAt,
    };
  }

  async redeemResumeLink(input: {
    runId: string;
    token: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<{ runId: string; runToken: string; tokenExpiresAt: Date; currentSectionId: string | null }> {
    const runToken = this.runTokenFactory();
    const runTokenHash = hashToken(runToken);
    const now = this.now();
    const tokenExpiresAt = new Date(now.getTime() + RUN_TOKEN_CONFIG.EXPIRY_MS);

    // Redemption is the ANONYMOUS path — the holder presents a token and no
    // session, so there is no ambient tenant and `authorize` is not called.
    // `run_resume_links` is RLS-covered, so this needs one anyway. Resolve it
    // from the run: `workflow_runs` carries no policy, so reading it needs no
    // scope, and the workflow's tenant then comes from the shared resolver
    // under migration 0030's clause. No new policy is required.
    const redeemTenantId = await this.resolveTenantForRunId(input.runId);
    if (!redeemTenantId) {
      throw createError.unauthorized('Resume link is invalid or expired');
    }
    const restored = await withTenant(redeemTenantId, async (tx) => {
      const link = await this.resumeRepo.consumeActive(input.runId, hashToken(input.token), now, tx);
      if (!link) {
        throw createError.unauthorized('Resume link is invalid or expired');
      }
      const run = await this.runRepo.findById(input.runId, tx);
      if (!run) {
        throw createError.notFound('Run');
      }
      this.assertIncomplete(run);
      const updated = await this.runRepo.updateIfIncomplete(input.runId, {
        runToken: runTokenHash,
        tokenExpiresAt,
      }, tx);
      await this.auditService.logRunEvent({
        runId: input.runId,
        tenantId: link.tenantId,
        eventType: 'run_resume_link_accessed',
        details: {
          linkId: link.id,
          kind: link.kind,
          recipientEmail: link.recipientEmail,
        },
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      }, tx);
      return updated;
    });

    return {
      runId: restored.id,
      runToken,
      tokenExpiresAt,
      currentSectionId: restored.currentSectionId,
    };
  }

  async revokeRunAccess(runId: string, userId: string): Promise<void> {
    const revokeAuth = await this.authorize(runId, { userId }, true);
    await withTenant(revokeAuth.tenantId, async (tx) => {
      const now = this.now();
      await this.runRepo.revokeToken(runId, tx);
      await this.resumeRepo.revokeActiveForRun(runId, now, tx);
    });
  }

  private async authorize(
    runId: string,
    auth: RunResumeAuthContext,
    staffOnly: boolean,
  ): Promise<AuthorizedRun> {
    if (auth.tokenRunId && auth.tokenRunId !== runId) {
      throw createError.forbidden('Access denied - run mismatch');
    }
    const resolved = await this.authResolver.resolveRun(runId, auth.userId);
    if (!resolved.run) {
      throw createError.notFound('Run');
    }
    if (!resolved.tenantId) {
      throw createError.forbidden('Access denied - run has no tenant');
    }
    if (auth.tokenRunId) {
      return { run: resolved.run, tenantId: resolved.tenantId, access: resolved.access };
    }
    if (!auth.userId) {
      throw createError.unauthorized('Unauthorized - authentication required');
    }
    if (resolved.access === 'none' || resolved.access === 'public') {
      throw createError.forbidden('Access denied - insufficient permissions for this run');
    }
    if (staffOnly) {
      try {
        await this.staffAccessVerifier(resolved.run.workflowId, auth.userId);
      } catch {
        throw createError.forbidden('Access denied - workflow edit access is required to hand off a run');
      }
    }
    return { run: resolved.run, tenantId: resolved.tenantId, access: resolved.access };
  }

  private assertIncomplete(run: WorkflowRun): void {
    if (run.completed) {
      throw createError.runCompleted();
    }
  }

  private validateExpiry(expiryMinutes: number): number {
    if (!Number.isInteger(expiryMinutes) || expiryMinutes < MIN_EXPIRY_MINUTES || expiryMinutes > MAX_EXPIRY_MINUTES) {
      throw createError.validation(
        `Resume link expiry must be between ${MIN_EXPIRY_MINUTES} and ${MAX_EXPIRY_MINUTES} minutes`,
      );
    }
    return expiryMinutes;
  }

  /**
   * Discover the tenant that owns a run, with nothing in context. Used by the
   * anonymous resume-redemption path — see the note at its call site.
   */
  private async resolveTenantForRunId(runId: string): Promise<string | undefined> {
    const run = await this.runRepo.findById(runId);
    if (!run) { return undefined; }
    const tenantId = await withVerifiedIdentifier(
      'app.current_workflow_id',
      run.workflowId,
      (tx) => workflowTenantResolver.resolveForWorkflowId(run.workflowId, tx)
    );
    return tenantId ?? undefined;
  }

  private async resolveHandoffTarget(
    tenantId: string,
    assigneeUserId?: string,
    clientEmail?: string,
  ): Promise<{ userId: string | null; email: string }> {
    if ((assigneeUserId ? 1 : 0) + (clientEmail ? 1 : 0) !== 1) {
      throw createError.validation('Choose exactly one assignee user or client email');
    }
    if (assigneeUserId) {
      // `users` is RLS-covered — unscoped this found nobody and every handoff
      // answered "Assignee user not found" for a colleague who plainly exists.
      // Scoped to `tenantId`, which is also the tenant the check below requires,
      // so an assignee outside it is invisible AND rejected.
      const user = await withTenant(tenantId, (tx) => this.userRepo.findById(assigneeUserId, tx));
      if (!user) {
        throw createError.notFound('Assignee user');
      }
      if (user.tenantId !== tenantId || !user.isActive) {
        throw createError.forbidden('Access denied - assignee user is outside this tenant');
      }
      return { userId: user.id, email: user.email.toLowerCase() };
    }
    return { userId: null, email: clientEmail!.trim().toLowerCase() };
  }

  private async createLink(input: {
    run: WorkflowRun;
    tenantId: string;
    recipientEmail: string;
    expiryMinutes: number;
    kind: 'save_resume' | 'handoff';
    actorUserId?: string;
    auth: RunResumeAuthContext;
  }, tx: import('../../repositories').DbTransaction): Promise<CreatedLink> {
    const token = this.resumeTokenFactory();
    const expiresAt = new Date(this.now().getTime() + input.expiryMinutes * 60_000);
    const link = await this.resumeRepo.create({
      tenantId: input.tenantId,
      runId: input.run.id,
      tokenHash: hashToken(token),
      recipientEmail: input.recipientEmail,
      kind: input.kind,
      createdByUserId: input.actorUserId,
      expiresAt,
    }, tx);
    await this.auditService.logRunEvent({
      runId: input.run.id,
      tenantId: input.tenantId,
      eventType: 'run_resume_link_created',
      actorUserId: input.actorUserId,
      details: {
        linkId: link.id,
        kind: input.kind,
        recipientEmail: input.recipientEmail,
        expiresAt: expiresAt.toISOString(),
      },
      ipAddress: input.auth.ipAddress,
      userAgent: input.auth.userAgent,
    }, tx);
    return { id: link.id, token, expiresAt, recipientEmail: input.recipientEmail, kind: input.kind };
  }

  private async deliverOrRevoke(runId: string, link: CreatedLink): Promise<void> {
    const baseUrl = (
      process.env.BASE_URL
      ?? process.env.VITE_BASE_URL
      ?? process.env.PUBLIC_URL
      ?? 'http://localhost:5000'
    ).replace(/\/+$/, '');
    const resumeUrl = `${baseUrl}/run/${encodeURIComponent(runId)}?resume=${encodeURIComponent(link.token)}`;
    try {
      await this.emailSender(link.recipientEmail, resumeUrl, link.expiresAt, link.kind);
    } catch (error) {
      await this.resumeRepo.revokeById(link.id, this.now());
      throw error;
    }
  }
}

export const runResumeService = new RunResumeService();
