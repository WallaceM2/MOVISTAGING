function randomId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (v) => v.toString(16).padStart(2, '0')).join('');
}

export function createIdempotencyKey(prefix: string): string {
  const normalized = prefix.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32);
  return `${normalized}-${Date.now().toString(36)}-${randomId()}`.slice(0, 120);
}
