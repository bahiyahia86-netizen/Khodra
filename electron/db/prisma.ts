/**
 * Database bootstrap (historically named prisma).
 */
import { initPool, closePool, getEngineKind } from './pool'
import { getEngineMode } from './mysql-manager'

export async function initPrisma(): Promise<void> {
  const mode = getEngineMode() || 'sqlite'
  await initPool(mode)
  console.log('[DB] المحرك:', getEngineKind())
}

export async function disconnectPrisma(): Promise<void> {
  await closePool()
}

export { getEngineKind }
