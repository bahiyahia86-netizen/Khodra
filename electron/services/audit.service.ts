import { execute, query } from '../db/pool'
import type { RowDataPacket } from 'mysql2'
import type { SessionUser } from './types'

export async function logAudit(
  user: SessionUser | null,
  action: string,
  entityType?: string,
  entityId?: number,
  details?: string,
): Promise<void> {
  try {
    await execute(
      `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        user?.id ?? null,
        user?.username ?? 'system',
        action,
        entityType ?? null,
        entityId ?? null,
        details ?? null,
      ],
    )
  } catch (err) {
    console.error('[Audit]', err)
  }
}

export async function getAuditLogs(limit = 100) {
  const rows = await query<RowDataPacket[]>(
    `SELECT id, user_id AS userId, username, action, entity_type AS entityType,
            entity_id AS entityId, details, created_at AS createdAt
     FROM audit_logs ORDER BY created_at DESC LIMIT ?`,
    [limit],
  )
  return rows.map((l) => ({
    id: l.id as number,
    userId: (l.userId as number | null) ?? null,
    username: String(l.username),
    action: String(l.action),
    entityType: (l.entityType as string | null) ?? null,
    entityId: (l.entityId as number | null) ?? null,
    details: (l.details as string | null) ?? null,
    createdAt: new Date(l.createdAt as Date).toISOString(),
  }))
}
