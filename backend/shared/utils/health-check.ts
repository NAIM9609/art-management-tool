/**
 * Shared Health Check Utilities
 *
 * Provides reusable health check functions for DynamoDB, S3, memory, and
 * external APIs.  Each check resolves to "healthy", "degraded", or
 * "unhealthy" and enforces a configurable timeout (default 5 seconds).
 */

import {
  DynamoDBClient,
  DescribeTableCommand,
  DescribeTableCommandInput,
} from '@aws-sdk/client-dynamodb';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

// ── Types ──────────────────────────────────────────────────────────────────

export type CheckStatus = 'healthy' | 'degraded' | 'unhealthy';
export type OverallStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface CheckResult {
  status: CheckStatus;
  latencyMs?: number;
  error?: string;
}

export interface HealthReport {
  status: OverallStatus;
  service: string;
  version: string;
  timestamp: string;
  checks: Record<string, CheckStatus>;
  uptime: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

/** Maximum time (ms) any single health check is allowed to run. */
export const DEFAULT_TIMEOUT_MS = 5_000;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Race a promise against a timeout.  If the timeout fires first the promise
 * is considered degraded (not unhealthy, because the resource may still be
 * available – just slow).
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Health check timed out')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ── Individual Checks ──────────────────────────────────────────────────────

/**
 * Check DynamoDB connectivity by describing the target table.
 */
export async function checkDynamoDB(
  tableName: string,
  region: string = process.env.AWS_REGION ?? 'us-east-1',
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<CheckResult> {
  const start = Date.now();
  try {
    const client = new DynamoDBClient({ region });
    const input: DescribeTableCommandInput = { TableName: tableName };
    await withTimeout(client.send(new DescribeTableCommand(input)), timeoutMs);
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isDegraded = message.includes('timed out');
    return {
      status: isDegraded ? 'degraded' : 'unhealthy',
      latencyMs: Date.now() - start,
      error: message,
    };
  }
}

/**
 * Check S3 connectivity by calling HeadBucket on the target bucket.
 */
export async function checkS3(
  bucketName: string,
  region: string = process.env.AWS_REGION ?? 'us-east-1',
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<CheckResult> {
  const start = Date.now();
  try {
    const client = new S3Client({ region });
    await withTimeout(client.send(new HeadBucketCommand({ Bucket: bucketName })), timeoutMs);
    return { status: 'healthy', latencyMs: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isDegraded = message.includes('timed out');
    return {
      status: isDegraded ? 'degraded' : 'unhealthy',
      latencyMs: Date.now() - start,
      error: message,
    };
  }
}

/**
 * Check an external HTTP/HTTPS endpoint with a simple GET request.
 * The check is considered healthy when the response status is < 500.
 */
export async function checkExternalApi(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<CheckResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);
      const status: CheckStatus = response.status < 500 ? 'healthy' : 'degraded';
      return { status, latencyMs: Date.now() - start };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isDegraded =
      message.includes('timed out') ||
      message.includes('abort') ||
      message.toLowerCase().includes('aborted');
    return {
      status: isDegraded ? 'degraded' : 'unhealthy',
      latencyMs: Date.now() - start,
      error: message,
    };
  }
}

/**
 * Check process memory usage.
 * Reports "degraded" when heap used exceeds 85 % of heap total.
 * Reports "unhealthy" when heap used exceeds 95 % of heap total.
 */
export function checkMemory(): CheckResult {
  const mem = process.memoryUsage();
  const usedRatio = mem.heapUsed / mem.heapTotal;
  let status: CheckStatus = 'healthy';
  if (usedRatio >= 0.95) {
    status = 'unhealthy';
  } else if (usedRatio >= 0.85) {
    status = 'degraded';
  }
  return { status };
}

// ── Aggregate ──────────────────────────────────────────────────────────────

/**
 * Derive the overall service status from an individual checks map.
 *
 * - Any "unhealthy" check → overall "unhealthy"
 * - Any "degraded" check  → overall "degraded"
 * - All "healthy"         → overall "healthy"
 */
export function aggregateStatus(checks: Record<string, CheckStatus>): OverallStatus {
  const values = Object.values(checks);
  if (values.includes('unhealthy')) return 'unhealthy';
  if (values.includes('degraded')) return 'degraded';
  return 'healthy';
}

/**
 * Build a complete HealthReport from individual check results.
 */
export function buildHealthReport(
  serviceName: string,
  version: string,
  checks: Record<string, CheckStatus>
): HealthReport {
  return {
    status: aggregateStatus(checks),
    service: serviceName,
    version,
    timestamp: new Date().toISOString(),
    checks,
    uptime: Math.floor(process.uptime()),
  };
}
