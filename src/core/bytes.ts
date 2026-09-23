export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.replaceAll(/\s/g, '').toLowerCase()
  if (!/^[0-9a-f]*$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error('Hex must contain complete bytes using only 0-9 and a-f.')
  }

  return Uint8Array.from(
    normalized.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? [],
  )
}

export function wordsToBytes(words: Uint32Array, byteLength = words.length * 4): Uint8Array {
  const output = new Uint8Array(byteLength)
  for (let index = 0; index < byteLength; index += 1) {
    output[index] = (words[index >>> 2] >>> (24 - (index & 3) * 8)) & 0xff
  }
  return output
}