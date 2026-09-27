/// <reference types="vite/client" />

declare module 'sql.js' {
  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database
  }
  export interface Database {
    run(sql: string, params?: unknown[]): Database
    exec(sql: string): { columns: string[]; values: unknown[][] }[]
    prepare(sql: string): Statement
    export(): Uint8Array
    close(): void
    getRowsModified(): number
  }
  export interface Statement {
    bind(params?: unknown[]): boolean
    step(): boolean
    getAsObject(params?: unknown[]): Record<string, unknown>
    run(params?: unknown[]): void
    free(): boolean
  }
  export default function initSqlJs(config?: {
    wasmBinary?: ArrayBuffer | Uint8Array
    locateFile?: (file: string) => string
  }): Promise<SqlJsStatic>
}
