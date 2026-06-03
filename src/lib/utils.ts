import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Human-readable task reference. Uses the project prefix when set
 * (e.g. "NT-1"), otherwise falls back to "#<number>" so prefixless
 * projects still render a number instead of nothing or a stray dash.
 * Mirrors the MCP server's formatTaskId convention.
 */
export function formatTaskRef(prefix: string | null | undefined, taskNumber: number) {
  return prefix ? `${prefix}-${taskNumber}` : `#${taskNumber}`
}
