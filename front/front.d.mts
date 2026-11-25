// Types for the front door's pure helpers (tests/front.test.ts imports them; the server itself is plain JS).
type H = Record<string, string | string[] | undefined>;
export const VERSION: number;
export function upstreamHeaders(inHeaders: H, o: { origin: string; publicOrigin: string; key: string; ip: string }): Record<string, string | string[]>;
export function downstreamHeaders(upHeaders: H, o: { origin: string; publicOrigin: string }): Record<string, string | string[]>;
export function cacheable(method: string, pathname: string, status: number, headers: H): boolean;
export function askCacheable(method: string, pathname: string): boolean;
