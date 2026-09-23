# Air Stream

## What It Is

Air Stream is a browser lab for the three deployed 128-bit 3GPP confidentiality families: 128-EEA1 with SNOW 3G, 128-EEA2 with AES-CTR, and 128-EEA3 with ZUC. It computes each keystream from the same key, COUNT, bearer, direction, and length, then checks each family against published implementors' data. The demo isolates confidentiality generation and keystream reuse; it does not model cellular attachment, key derivation, or a complete NAS/AS protocol. It is not production crypto.

## Exhibits

1. **The Three Families** runs all three generators from one cellular input tuple and reports their independent KAT verdicts.
2. **The Mechanism** steps through a captured SNOW 3G LFSR/FSM clock, an AES-CTR counter encryption, or a ZUC LFSR/FSM clock.
3. **Reuse + Evolution** performs a real two-time-pad recovery with any family, then separately maps the 256-bit successor names without claiming KAT verification.

## When to Use It

Use this lab to study 3GPP confidentiality input packing, compare three different keystream constructions, or demonstrate why tuple reuse breaks every stream cipher family shown. Do not use it to secure traffic, assess relative algorithm strength, implement a cellular stack, or claim conformance for the 256-bit successor algorithms.

## Live Demo

[Open Air Stream](https://systemslibrarian.github.io/crypto-lab-air-stream/) to change the shared cellular tuple, inspect each first internal step, and recover a second plaintext after deliberately reusing the tuple.

## What Can Go Wrong

- Reusing a key, COUNT, bearer, and direction repeats the keystream and exposes the XOR of both plaintexts.
- Reversing key words or packing COUNT/bearer/direction in the wrong bit order breaks interoperability.
- Treating the fenced 256-bit panel as verified output would overstate what this repository tests.
- Passing a KAT proves agreement on that fixture, not production hardening, side-channel resistance, or protocol security.

## Real-World Usage

The EEA/NEA families are confidentiality algorithms for 3GPP radio and network security profiles. This lab shows only their keystream-generating core. Integrity siblings, negotiation, key hierarchy, replay handling, and deployment policy remain outside its boundary.

## How to Run Locally

```bash
npm ci
npm run dev
```

Vite prints the local development URL. All cryptographic operations remain client-side and no key material is persisted.

## Related Demos

- [AES Modes](https://systemslibrarian.github.io/crypto-lab-aes-modes/)
- [ChaCha20 Stream](https://systemslibrarian.github.io/crypto-lab-chacha20-stream/)
- [Nonce Guard](https://systemslibrarian.github.io/crypto-lab-nonce-guard/)
- [TLS Handshake](https://systemslibrarian.github.io/crypto-lab-tls-handshake/)
- [PQ TLS Handshake](https://systemslibrarian.github.io/crypto-lab-pq-tls-handshake/)

## Build & Verify

```bash
npm test
npm run build
npx playwright install chromium
npm run test:a11y
npm run test:e2e
```

The unit suite contains 17 tests. The KAT fixtures live beside their implementations in `src/snow/snow3g.test.ts`, `src/aes/eea2.test.ts`, and `src/zuc/zuc.test.ts`; sources are identified in the tests and rendered UI. ZUC is additionally cross-checked against `@li0ard/zuc`, AES-CTR against an independent WebCrypto path, and the browser claims suite re-derives AES with Node/OpenSSL. The Playwright gate runs 2 accessibility traversals and 26 claims checks across desktop and mobile projects.

## Performance

The teaching UI deliberately caps requests at 256 bytes so state inspection stays immediate and readable. No throughput claim or benchmark is made.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*