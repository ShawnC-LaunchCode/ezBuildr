/**
 * Alert Service
 *
 * Evaluates SLIs against targets and sends alerts when violations occur.
 * Supports webhook notifications and email alerts (stub).
 */

import sli from './sli';
import logger from '../utils/logger';
import { db } from '../db';

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
  const webhookUrl = config.webhookUrl || process.env.ALERT_WEBHOOK_URL;

  // Compute current SLI
  const sliResult = await sli.computeSLI({
    projectId: params.projectId,
    workflowId: params.workflowId,
    window: '7d',
  });

  // Check if targets are violated
  if (!sliResult.violatesTarget) {
    logger.debug('SLI within targets, no alert needed', {
      projectId: params.projectId,
      workflowId: params.workflowId,
    });
    return;
  }

  // Check cooldown
  const cooldownKey = `${params.projectId}:${params.workflowId || 'project'}`;
  if (isInCooldown(cooldownKey, config.cooldownMinutes || 10)) {
    logger.debug('Alert in cooldown period, skipping', {
      projectId: params.projectId,
      workflowId: params.workflowId,
    });
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

  logger.info('Alert sent for SLI violation', {
    projectId: params.projectId,
    workflowId: params.workflowId,
    severity,
  });
}

/**
 * Send webhook notification
 */
async function sendWebhook(url: string, alert: AlertPayload): Promise<void> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'VaultLogic-Alerts/1.0',
      },
      body: JSON.stringify(alert),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
    }

    logger.info('Webhook alert sent', { url, severity: alert.severity });
  } catch (error) {
    logger.error('Failed to send webhook alert', { error, url });
    throw error;
  }
}

/**
 * Send email alert (stub implementation)
 */
async function sendEmailAlert(recipients: string[], alert: AlertPayload): Promise<void> {
  // TODO: Integrate with SendGrid or other email service
  // For now, just log the alert

  logger.info('Email alert stub', {
    recipients,
    severity: alert.severity,
    title: alert.title,
  });

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
function getSeverity(sliResult: any): 'warning' | 'critical' {
  // Critical if error budget is burned > 100%
  if (sliResult.errorBudgetBurnPct > 100) {
    return 'critical';
  }

  // Critical if success rate is very low
  if (sliResult.successPct < sliResult.target.successPct - 5) {
    return 'critical';
  }

  // Critical if p95 is way over target
  if (sliResult.p95Ms > sliResult.target.p95Ms * 2) {
    return 'critical';
  }

  return 'warning';
}

/**
 * Build alert title
 */
function buildAlertTitle(sliResult: any, workflowId?: string): string {
  const scope = workflowId ? 'Workflow' : 'Project';
  const violations: string[] = [];

  if (sliResult.successPct < sliResult.target.successPct) {
    violations.push('Success Rate');
  }

  if (sliResult.p95Ms > sliResult.target.p95Ms) {
    violations.push('P95 Latency');
  }

  return `${scope} SLI Violation: ${violations.join(', ')}`;
}

/**
 * Build alert message
 */
function buildAlertMessage(sliResult: any): string {
  const lines: string[] = [];

  lines.push('Service Level Indicator (SLI) targets have been violated:');
  lines.push('');

  if (sliResult.successPct < sliResult.target.successPct) {
    lines.push(
      `❌ Success Rate: ${sliResult.successPct.toFixed(2)}% (target: ${sliResult.target.successPct}%)`
    );
  } else {
    lines.push(
      `✅ Success Rate: ${sliResult.successPct.toFixed(2)}% (target: ${sliResult.target.successPct}%)`
    );
  }

  if (sliResult.p95Ms > sliResult.target.p95Ms) {
    lines.push(
      `❌ P95 Latency: ${sliResult.p95Ms}ms (target: ${sliResult.target.p95Ms}ms)`
    );
  } else {
    lines.push(
      `✅ P95 Latency: ${sliResult.p95Ms}ms (target: ${sliResult.target.p95Ms}ms)`
    );
  }

  lines.push('');
  lines.push(
    `Error Budget Burn: ${sliResult.errorBudgetBurnPct.toFixed(2)}% (${sliResult.target.errorBudgetPct}% allowed)`
  );
  lines.push(`Total Runs: ${sliResult.totalRuns}`);
  lines.push(`Failed Runs: ${sliResult.failedRuns}`);
  lines.push('');
  lines.push(
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

    const result = await db.execute({ sql: query, args: [] });

    for (const row of result.rows as any[]) {
      try {
        await evaluateAndAlert({
          projectId: row.project_id,
          workflowId: row.workflow_id,
        });
      } catch (error) {
        logger.error('Failed to evaluate alert', {
          projectId: row.project_id,
          workflowId: row.workflow_id,
          error,
        });
      }
    }

    logger.info('Batch alert evaluation completed');
  } catch (error) {
    logger.error('Batch alert evaluation failed', { error });
  }
}

/**
 * Export alert functions
 */
export default {
  evaluateAndAlert,
  batchEvaluateAlerts,
};
