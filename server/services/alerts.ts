/**
 * Alert Service
 *
 * Evaluates SLIs against targets and sends alerts when violations occur.
 * Supports webhook notifications and email alerts (stub).
 */

import { db } from '../db';
import logger from '../logger';

import sli from './sli';

interface AlertConfig {
  webhookUrl?: string;
  emailRecipients?: string[];
  cooldownMinutes?: number;
}

interface AlertPayload {
  severity: 'warning' | 'critical';
  title: string;
  message: string;
  projectId: string;
  workflowId?: string;
  metrics: {
    successPct: number;
    p95Ms: number;
    errorBudgetBurnPct: number;
  };
  targets: {
    successPct: number;
    p95Ms: number;
  };
  timestamp: string;
}

// In-memory cooldown tracker (in production, use Redis or database)
const alertCooldowns = new Map<string, Date>();

/**
 * Evaluate SLI and send alert if targets are violated
 */
export async function evaluateAndAlert(params: {
  projectId: string;
  workflowId?: string;
  config?: AlertConfig;
}): Promise<void> {
  const config: AlertConfig = {
    cooldownMinutes: 10,
    ...params.config,
  };

  // Get webhook URL from env if not provided
  const webhookUrl = config.webhookUrl ?? process.env.ALERT_WEBHOOK_URL;

  // Compute current SLI
  const sliResult = await sli.computeSLI({
    projectId: params.projectId,
    workflowId: params.workflowId,
    window: '7d',
  });

  // Check if targets are violated
  if (!sliResult.violatesTarget) {
    logger.debug({
      projectId: params.projectId,
      workflowId: params.workflowId,
    }, 'SLI within targets, no alert needed');
    return;
  }

  // Check cooldown
  const cooldownKey = `${params.projectId}:${params.workflowId ?? 'project'}`;
  if (isInCooldown(cooldownKey, config.cooldownMinutes ?? 10)) {
    logger.debug({
      projectId: params.projectId,
      workflowId: params.workflowId,
    }, 'Alert in cooldown period, skipping');
    return;
  }

  // Determine severity
  const severity = getSeverity(sliResult);

  // Build alert payload
  const alert: AlertPayload = {
    severity,
    title: buildAlertTitle(sliResult, params.workflowId),
    message: buildAlertMessage(sliResult),
    projectId: params.projectId,
    workflowId: params.workflowId,
    metrics: {
      successPct: sliResult.successPct,
      p95Ms: sliResult.p95Ms,
      errorBudgetBurnPct: sliResult.errorBudgetBurnPct,
    },
    targets: {
      successPct: sliResult.target.successPct,
      p95Ms: sliResult.target.p95Ms,
    },
    timestamp: new Date().toISOString(),
  };

  // Send notifications
  const promises: Promise<void>[] = [];

  if (webhookUrl) {
    promises.push(sendWebhook(webhookUrl, alert));
  }

  if (config.emailRecipients && config.emailRecipients.length > 0) {
    promises.push(sendEmailAlert(config.emailRecipients, alert));
  }

  await Promise.allSettled(promises);

  // Set cooldown
  setCooldown(cooldownKey);

  logger.info({
    projectId: params.projectId,
    workflowId: params.workflowId,
    severity,
  }, 'Alert sent for SLI violation');
}

/**
 * Send webhook notification
 */
async function sendWebhook(url: string, alert: AlertPayload): Promise<void> {
  try {
    const { safeFetch } = await import('../utils/safeFetch');
    const response = await safeFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ezBuildr-Alerts/1.0',
      },
      body: JSON.stringify(alert),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
    }

    logger.info({ url, severity: alert.severity }, 'Webhook alert sent');
  } catch (error: unknown) {
    logger.error({ error, url }, 'Failed to send webhook alert');
    throw error;
  }
}

/**
 * Send email alert (stub implementation)
 */
async function sendEmailAlert(recipients: string[], alert: AlertPayload): Promise<void> {
  // TODO: Integrate with SendGrid or other email service
  // For now, just log the alert

  logger.info({
    recipients,
    severity: alert.severity,
    title: alert.title,
  }, 'Email alert stub');

  // Example SendGrid integration:
  /*
  import sgMail from '@sendgrid/mail';

  const msg = {
    to: recipients,
    from: process.env.SENDGRID_FROM_EMAIL,
    subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
    text: alert.message,
    html: formatEmailHtml(alert),
  };

  await sgMail.send(msg);
  */
}

/**
 * Check if alert is in cooldown period
 */
function isInCooldown(key: string, cooldownMinutes: number): boolean {
  const lastAlert = alertCooldowns.get(key);
  if (!lastAlert) {
    return false;
  }

  const cooldownMs = cooldownMinutes * 60 * 1000;
  const elapsed = Date.now() - lastAlert.getTime();

  return elapsed < cooldownMs;
}

/**
 * Set cooldown for alert key
 */
function setCooldown(key: string): void {
  alertCooldowns.set(key, new Date());
}

/**
 * Determine alert severity based on SLI violations
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SLI result structure varies by computation
function getSeverity(sliResult: any): 'warning' | 'critical' {
  // Critical if error budget is burned > 100%
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
  if (sliResult.errorBudgetBurnPct > 100) {
    return 'critical';
  }

  // Critical if success rate is very low
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
  if (sliResult.successPct < sliResult.target.successPct - 5) {
    return 'critical';
  }

  // Critical if p95 is way over target
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
  if (sliResult.p95Ms > sliResult.target.p95Ms * 2) {
    return 'critical';
  }

  return 'warning';
}

/**
 * Build alert title
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SLI result structure varies by computation
function buildAlertTitle(sliResult: any, workflowId?: string): string {
  const scope = workflowId ? 'Workflow' : 'Project';
  const violations: string[] = [];

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
  if (sliResult.successPct < sliResult.target.successPct) {
    violations.push('Success Rate');
  }

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
  if (sliResult.p95Ms > sliResult.target.p95Ms) {
    violations.push('P95 Latency');
  }

  return `${scope} SLI Violation: ${violations.join(', ')}`;
}

/**
 * Build alert message
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- SLI result structure varies by computation
function buildAlertMessage(sliResult: any): string {
  const lines: string[] = [];

  lines.push('Service Level Indicator (SLI) targets have been violated:');
  lines.push('');

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
  if (sliResult.successPct < sliResult.target.successPct) {
    lines.push(
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
      `❌ Success Rate: ${sliResult.successPct.toFixed(2)}% (target: ${sliResult.target.successPct}%)`
    );
  } else {
    lines.push(
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
      `✅ Success Rate: ${sliResult.successPct.toFixed(2)}% (target: ${sliResult.target.successPct}%)`
    );
  }

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
  if (sliResult.p95Ms > sliResult.target.p95Ms) {
    lines.push(
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
      `❌ P95 Latency: ${sliResult.p95Ms}ms (target: ${sliResult.target.p95Ms}ms)`
    );
  } else {
    lines.push(
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
      `✅ P95 Latency: ${sliResult.p95Ms}ms (target: ${sliResult.target.p95Ms}ms)`
    );
  }

  lines.push('');
  lines.push(
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
    `Error Budget Burn: ${sliResult.errorBudgetBurnPct.toFixed(2)}% (${sliResult.target.errorBudgetPct}% allowed)`
  );
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
  lines.push(`Total Runs: ${sliResult.totalRuns}`);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
  lines.push(`Failed Runs: ${sliResult.failedRuns}`);
  lines.push('');
  lines.push(
// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
    `Window: ${sliResult.windowStart.toISOString()} - ${sliResult.windowEnd.toISOString()}`
  );

  return lines.join('\n');
}

/**
 * Batch evaluate SLIs for all projects/workflows
 * Typically called by rollup job after aggregation
 */
export async function batchEvaluateAlerts(): Promise<void> {
  try {
    // Get all unique project/workflow combinations from recent rollups
    const query = `
      SELECT DISTINCT
        project_id,
        workflow_id
      FROM metrics_rollups
      WHERE bucket_start >= NOW() - INTERVAL '7 days'
    `;


// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment -- SLI query results are dynamically typed.
    const result = await db.execute({ sql: query, args: [] } as any) as any;


// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
    for (const row of result.rows as any[]) {
      try {
        await evaluateAndAlert({
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
          projectId: row.project_id as string,
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
          workflowId: row.workflow_id as string | undefined,
        });
      } catch (error: unknown) {
        logger.error({
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
          projectId: row.project_id,
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- SLI query results are dynamically typed.
          workflowId: row.workflow_id,
          error,
        }, 'Failed to evaluate alert');
      }
    }

    logger.info('Batch alert evaluation completed');
  } catch (error: unknown) {
    logger.error({ error }, 'Batch alert evaluation failed');
  }
}

/**
 * Export alert functions
 */
export default {
  evaluateAndAlert,
  batchEvaluateAlerts,
};
