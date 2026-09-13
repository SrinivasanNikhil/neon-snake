export const MAX_WEBSOCKET_MESSAGE_BYTES = 16 * 1024;

export function isMessageWithinLimit(source: string): boolean {
  return new TextEncoder().encode(source).byteLength <= MAX_WEBSOCKET_MESSAGE_BYTES;
}

export function isAllowedOrigin(
  requestUrl: string,
  origin: string | null,
  configuredOrigins?: string,
): boolean {
  if (!origin) return false;
  const allowed = new Set([
    new URL(requestUrl).origin,
    ...(configuredOrigins ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  ]);
  return allowed.has(origin);
}
