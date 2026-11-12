// Types for the relay's pure helpers (tests/relay.test.ts imports them; the relay itself is plain JS).
export const VERSION: number;
export function privateAddress(ip: string): boolean;
export function hostAllowed(host: string, hosts?: string[]): boolean;
export function targetOf(pathname: string, search: string, sites?: Record<string, string>, hosts?: string[]): { url: URL; label: string; named: boolean } | null;
