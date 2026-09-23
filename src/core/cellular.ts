export const MAX_DEMO_KEYSTREAM_BYTES = 256

export function validateKeystreamRequest(
  key: Uint8Array,
  count: number,
  bearer: number,
  direction: number,
  byteLength: number,
): string | undefined {
  if (key.length !== 16) return 'Key must be exactly 16 bytes.'
  if (!Number.isInteger(count) || count < 0 || count > 0xffffffff) return 'COUNT must be a 32-bit unsigned integer.'
  if (!Number.isInteger(bearer) || bearer < 0 || bearer > 31) return 'Bearer must be between 0 and 31.'
  if (direction !== 0 && direction !== 1) return 'Direction must be 0 or 1.'
  if (!Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > MAX_DEMO_KEYSTREAM_BYTES) {
    return `Length must be between 1 and ${MAX_DEMO_KEYSTREAM_BYTES} bytes.`
  }
  return undefined
}