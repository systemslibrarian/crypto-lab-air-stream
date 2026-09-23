# BUILD BRIEF — crypto-lab-air-stream

Binding spec: ./CRYPTO-LAB-TEMPLATE.md (gitignored copy of _MASTER-TEMPLATE.md).
Catalog root CLAUDE.md wins where they touch.
Lifecycle: Build → Teach → Look → Accessibility → README → Deploy.

## KEY FACTS PINNED (verify each before it enters shipped copy)

- The deployed 4G/5G air-interface confidentiality+integrity algorithms come in
  three keystream families, each with a European, an AES, and a Chinese member:
  128-EEA1/128-EIA1 = SNOW 3G; 128-EEA2/128-EIA2 = AES (CTR / CMAC);
  128-EEA3/128-EIA3 = ZUC. This deployed 128-bit trio is the KAT-able CORE.
- The 256-bit successor set is 3GPP TS 35.240 (SNOW 5G, 256-NEA4/NIA4/NCA4),
  TS 35.243 (AES-256, 256-NEA5/NIA5/NCA5), TS 35.246 (ZUC-256, 256-NEA6/NIA6/
  NCA6). Key 256-bit, IV 128-bit. NCA is a NEW one-pass AEAD mode (Encrypt-
  then-MAC). Confirm each TS number and the NEA/NIA/NCA naming before pinning —
  parts of these specs are export-restricted, so treat the 256-bit set as the
  FORWARD-LOOKING panel, not the KAT core, unless public vectors are found.
- SNOW 5G derives from SNOW-V; ZUC-256 has a public design-team spec. Do not
  assert either provenance in copy without confirming the primary source.

## NEW DEMO BRIEF

repo name      : crypto-lab-air-stream
short name (H1): Air Stream
subtitle       : 3GPP · SNOW · AES · ZUC
one-liner      : The three keystream families that encrypt every cellular call —
                 SNOW, AES, and ZUC side by side, KAT-verified, with the 256-bit
                 next-gen set and its new one-pass AEAD mode.
concept        : Every phone call rides one of three interchangeable keystream
                 ciphers chosen by geopolitics, not math. Same slot, three
                 designs; the move to 256-bit adds a combined confidentiality+
                 integrity pass.
primitives/spec: SNOW 3G / SNOW 5G, AES-CTR/CMAC / AES-256, ZUC / ZUC-256;
                 3GPP TS 35.215-218 (128-bit) and TS 35.240/243/246 (256-bit).
--accent       : #ffb84d   (assigned centrally — do not change here)
favicon        : 📡
in scope       : The three deployed 128-bit keystream generators built and
                 KAT-verified; a keystream/round visualizer for each; the 256-bit
                 evolution and the NCA one-pass AEAD mode as a forward panel.
non-goals      : No full NAS/AS handshake or key hierarchy. No LTE/5G attach
                 flow. No claim that any of the three is stronger than the others.
                 No unredacted reproduction of any export-restricted 256-bit spec
                 — build only from public sources; label what is not public.

## §1.1 SCOPE

Three panes.
1. THE THREE FAMILIES — SNOW 3G, AES-CTR, ZUC generating keystream from the same
   (key, count, bearer, direction) inputs, KAT-verified against implementer test
   data. The core interactive.
2. THE MECHANISM — one representative internal step per family shown live: SNOW's
   LFSR+FSM clocking, AES-CTR's counter block, ZUC's LFSR over GF(2^31−1).
3. THE EVOLUTION — the 256-bit set and the new NCA AEAD (Encrypt-then-MAC in one
   pass) as a forward-looking panel, honest about what is and isn't public.

## §1.2 SECURITY / CORRECTNESS INVARIANTS (beat features on conflict)

INV-1  Each 128-bit generator matches its official implementer test-data vector
       (SNOW 3G, AES, ZUC). Pin as fixtures; confirm each vector's document and
       set before pinning — do not assert a location from memory.
INV-2  Same-input agreement is executed, not asserted: identical (key, count,
       bearer, direction, length) inputs produce each family's keystream
       independently and the page shows all three differ while each self-checks.
INV-3  Keystream ciphers: encrypting twice under the same (key, count) reuses
       keystream. Demonstrate the two-time-pad recovery as the shared failure
       mode of ALL THREE — this is the honest cross-family lesson.
INV-4  MUTATION GATE (§4.1c/§4.1d): perturbing any generator's state update must
       make INV-1 FAIL in CI for that family only.
INV-5  Any 256-bit content that cannot be KAT-verified from a public source is
       labelled on-screen as unverified/illustrative and is visibly separated
       from the KAT-verified 128-bit core. A §4.1d negative claim covers this.

## §1.3 ARCHITECTURE

ALGORITHM SOURCE (normative):
- AES-CTR / AES-256: WebCrypto SubtleCrypto for the block, hand-roll the CTR
  counter wiring so it is inspectable.
- ZUC: hand-roll the inspectable generator; cross-check against @li0ard/zuc.
- SNOW 3G: hand-roll from the public SNOW 3G spec; cross-check against a named
  reference if one is found, else rely on the KAT fixture.
- 256-bit set: build only what a public spec supports (SNOW-V-based core,
  ZUC-256, AES-256); everything else is the labelled forward panel.
KAT source: the ETSI/GSMA implementer test data for 128-EEA1/EEA2/EEA3. Port the
fixtures; INV-1 byte equality is the acceptance test, not a hand-copied string.

Modules: src/snow/, src/aes/, src/zuc/ (each isolated), src/ui/. Client-side,
no build step beyond the catalog default.

## §1.4 UI

PANE 1 — The Three Families
  One input row (key, count, bearer, direction, length); three keystream outputs
  computed live, each with its own KAT badge. Plain-language intro ("why a phone
  call has three interchangeable ciphers") above the first hex.
PANE 2 — The Mechanism
  A per-family stepper showing one representative internal round; SHOW the
  clocking/counter, never assert it in prose. Progressive-disclosure depth in
  <details>.
PANE 3 — Two-Time-Pad + Evolution
  Reuse one (key, count) across two messages; XOR the ciphertexts; crib-drag —
  the shared failure of all three keystream ciphers. Then the 256-bit panel:
  the NEA4/5/6 mapping and the NCA one-pass AEAD, with the unverified parts
  clearly fenced off.

REAL-WORLD box: these are the algorithms protecting the radio link on billions of
LTE/5G connections; the 256-bit set is 3GPP's quantum-era symmetric hedge (add H1
to REAL_WORLD_TITLES).

HERO — three roles distinct:
  subtitle    : spec label only
  description : three keystream families computed side by side and KAT-verified
  why it matters: the cipher on your call is chosen by jurisdiction, not strength

## §1.5 VISUAL SEMANTICS

green = KAT matches / self-check passes.  red, sticky = KAT fail or reused-
keystream recovery.  alarm = recovered plaintext in the two-time-pad pane reads
as ALARM, not green.  unverified = a distinct neutral treatment for any 256-bit
content not KAT-backed. Icon+text+color always; no decorative motion.

## §1.6 EDGE CASES

- Endianness/bit-order between the three specs is the top interop hazard; wire a
  cross-check.
- Count/bearer/direction packing into the IV differs per family — get each right
  or the KAT fails.
- Zero-length / max-length keystream requests: fail closed, don't throw.
- ZUC over GF(2^31−1): the modular add carry is the easy off-by-one.

## §1.7 EXTENSION SEAMS

- The integrity siblings (128-EIA1/2/3, 256-NIA4/5/6) as a fourth pane.
- The full NCA AEAD round-trip once a public vector exists. Mark // [extension].
- A link to the tls-handshake / pq-tls-handshake labs for the key hierarchy.

## VERIFY BEFORE WRITING COPY — do not assert, grep

- grep CATEGORIES; propose placement from {ENCRYPTION}. Do not state a category
  is new.
- grep the catalog for existing SNOW / ZUC / AES-CTR / cellular coverage and
  report overlaps before any "first"/"only" phrasing.
- grep for crypto-lab-air-* / crypto-lab-nea-* name collisions before creating.
- Confirm the TS numbers (35.240/243/246), the NEA/NIA/NCA naming, and each
  128-bit implementer-test-data vector against the primary document before
  pinning. Record which 256-bit material is public here.

## CI GATES (existing mechanisms — reference, do not reinvent)

- e2e/claims.spec.ts — §4.1b cross-checks (hand-rolled vs @li0ard/zuc vs pinned
  KAT), §4.1c mutation discipline, §4.1d negative claims (the unverified-256
  fence and the shared two-time-pad failure).
- §4 axe/WCAG gate. §5 README. §6.1/6.2 dependabot + deploy dispatch.
- §4.1d names CLAIMS.yaml / THREAT-MODEL.md / a second-language verifier as the
  things NOT to build.

## CITATIONS (verify each against the primary source before it ships)

- 3GPP TS 35.215-218 (128-EEA1/EIA1 SNOW 3G), the 128-EEA2/EIA2 AES spec, and
  TS 35.221-223 (128-EEA3/EIA3 ZUC) — plus their ETSI/GSMA implementer test data.
- 3GPP TS 35.240 (SNOW 5G), TS 35.243 (AES-256), TS 35.246 (ZUC-256), 256-bit
  algorithm sets, incl. the NCA AEAD mode.
- SNOW-V: Ekdahl, Johansson, Maximov, Yang, IACR ToSC 2019(3).
- @li0ard/zuc — independent ZUC cross-check.