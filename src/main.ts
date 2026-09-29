import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  createIcons,
  ExternalLink,
  Play,
  RadioTower,
  RefreshCw,
  ShieldQuestion,
} from 'lucide'
import './style.css'
import { bytesToHex, hexToBytes } from './core/bytes'
import {
  DEFAULT_INPUTS,
  runFamilies,
  runKnownAnswerTests,
  runTwoTimePad,
  type CellularInputs,
  type FamilyId,
  type FamilyOutput,
  type FamilyRun,
  type KatResult,
} from './core/families'
import type { AesEea2Trace } from './aes/eea2'
import type { SnowRoundTrace } from './snow/snow3g'
import type { ZucRoundTrace } from './zuc/zuc'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('Missing #app mount point.')

app.innerHTML = `
  <div class="lab-shell">
    <header class="cl-hero" role="group">
      <div class="cl-hero-main">
        <div class="signal-mark" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
        </div>
        <h1 class="cl-hero-title">Air Stream</h1>
        <p class="cl-hero-sub">3GPP · SNOW · AES · ZUC</p>
        <p class="cl-hero-desc">Compute the three deployed 128-bit cellular keystream families side by side, verify each against implementors’ data, and clock one real internal step.</p>
      </div>
      <aside class="cl-hero-why" aria-label="Why it matters">
        <span class="cl-hero-why-label">WHY IT MATTERS</span>
        <p class="cl-hero-why-text">The cipher protecting a radio link is selected through standards profiles and deployments, not by a claim that one family is strongest. Their internals differ; their obligation never to reuse a keystream does not.</p>
      </aside>
    </header>

    <nav class="pane-nav" aria-label="Air Stream panes">
      <a href="#families"><span>01</span>The three families</a>
      <a href="#mechanism"><span>02</span>The mechanism</a>
      <a href="#evolution"><span>03</span>Reuse + evolution</a>
    </nav>

    <main>
      <section class="pane" id="families" aria-labelledby="families-title">
        <div class="section-heading">
          <p class="section-index">PANE 01 · LIVE CORE</p>
          <h2 id="families-title">Same radio slot. Three designs.</h2>
          <p>Cellular standards define interchangeable confidentiality slots. SNOW 3G uses an LFSR and finite-state machine, AES-CTR encrypts counter blocks, and ZUC clocks a 31-bit finite-field LFSR. The controls below feed the identical tuple to all three.</p>
        </div>

        <form class="control-band" id="stream-form" novalidate>
          <label class="control control-key">
            <span>128-bit key · hex</span>
            <input id="key-input" name="key" type="text" value="d3c5d592327fb11c4035c6680af8c6d1" inputmode="text" autocomplete="off" spellcheck="false" maxlength="32" aria-describedby="key-hint" />
            <small id="key-hint">32 hexadecimal characters</small>
          </label>
          <label class="control">
            <span>COUNT · hex</span>
            <input id="count-input" name="count" type="text" value="398a59b4" inputmode="text" autocomplete="off" spellcheck="false" maxlength="8" />
          </label>
          <label class="control">
            <span>Bearer</span>
            <input id="bearer-input" name="bearer" type="number" value="21" min="0" max="31" step="1" />
          </label>
          <fieldset class="control direction-control">
            <legend>Direction</legend>
            <div class="segmented">
              <input id="direction-0" name="direction" type="radio" value="0" />
              <label for="direction-0">0</label>
              <input id="direction-1" name="direction" type="radio" value="1" checked />
              <label for="direction-1">1</label>
            </div>
          </fieldset>
          <label class="control">
            <span>Bytes</span>
            <input id="length-input" name="length" type="number" value="32" min="1" max="256" step="1" />
          </label>
          <button class="primary-button" id="run-streams" type="submit">
            <i data-lucide="play" aria-hidden="true"></i><span>Generate</span>
          </button>
        </form>
        <p id="input-error" class="inline-error" role="alert" hidden></p>
        <div id="family-summary" class="comparison-status status-neutral" role="status" aria-live="polite">
          <i data-lucide="refresh-cw" aria-hidden="true"></i><span>Computing the three independent streams…</span>
        </div>
        <div id="family-outputs" class="family-grid" role="list" aria-label="Computed family keystreams" hidden></div>
      </section>

      <section class="pane" id="mechanism" aria-labelledby="mechanism-title">
        <div class="section-heading split-heading">
          <div>
            <p class="section-index">PANE 02 · ONE LIVE CLOCK</p>
            <h2 id="mechanism-title">Watch the state move</h2>
          </div>
          <p>Each view is fed by the same computation shown above. Step through input, transform, and output; the diagram reads the generator’s captured state rather than replaying decorative motion.</p>
        </div>
        <div class="mechanism-toolbar" role="group" aria-label="Choose a family mechanism">
          <button type="button" data-mechanism="snow" aria-pressed="true">SNOW 3G</button>
          <button type="button" data-mechanism="aes" aria-pressed="false">AES-CTR</button>
          <button type="button" data-mechanism="zuc" aria-pressed="false">ZUC</button>
        </div>
        <div id="mechanism-view" class="mechanism-view" role="region" aria-live="polite" aria-label="Selected family mechanism"></div>
        <div class="step-controls">
          <button class="icon-text-button" id="step-back" type="button" aria-label="Previous mechanism stage">
            <i data-lucide="chevron-left" aria-hidden="true"></i><span>Previous</span>
          </button>
          <p id="step-label">Stage 1 of 3 · Input state</p>
          <button class="icon-text-button" id="step-forward" type="button" aria-label="Next mechanism stage">
            <span>Next</span><i data-lucide="chevron-right" aria-hidden="true"></i>
          </button>
        </div>
        <details class="depth-note">
          <summary>Open the bit-order notes</summary>
          <div id="mechanism-detail"></div>
        </details>
      </section>

      <section class="pane" id="evolution" aria-labelledby="evolution-title">
        <div class="section-heading">
          <p class="section-index">PANE 03 · SHARED FAILURE</p>
          <h2 id="evolution-title">Reuse the tuple. Recover the message.</h2>
          <p>A stream cipher encrypts by XORing plaintext with a keystream. Reusing the complete tuple repeats that keystream, so XORing two ciphertexts removes the cipher entirely. Pick any family and perform the recovery against its real generator.</p>
        </div>
        <div class="attack-layout">
          <form class="attack-controls" id="attack-form">
            <fieldset>
              <legend>Keystream family</legend>
              <div class="mechanism-toolbar attack-family" role="group" aria-label="Choose attack family">
                <button type="button" data-attack-family="snow" aria-pressed="true">SNOW</button>
                <button type="button" data-attack-family="aes" aria-pressed="false">AES</button>
                <button type="button" data-attack-family="zuc" aria-pressed="false">ZUC</button>
              </div>
            </fieldset>
            <label>
              <span>Known message A</span>
              <input id="message-a" type="text" value="MEET AT THE EAST GATE" maxlength="96" />
            </label>
            <label>
              <span>Secret message B</span>
              <input id="message-b" type="text" value="DELAY LAUNCH BY 2 HRS" maxlength="96" />
            </label>
            <button class="danger-button" type="submit">
              <i data-lucide="radio-tower" aria-hidden="true"></i><span>Reuse tuple</span>
            </button>
          </form>
          <div class="attack-output" id="attack-output" aria-live="polite">
            <div class="equation-row"><span>Ciphertext A</span><code id="cipher-a" tabindex="0" role="region" aria-label="Ciphertext A bytes">Waiting…</code></div>
            <div class="equation-row"><span>Ciphertext B</span><code id="cipher-b" tabindex="0" role="region" aria-label="Ciphertext B bytes">Waiting…</code></div>
            <div class="xor-rule" aria-hidden="true"><span></span><b>XOR</b><span></span></div>
            <div class="equation-row"><span>A XOR B</span><code id="cipher-xor" tabindex="0" role="region" aria-label="XOR of both ciphertexts">Waiting…</code></div>
            <div id="recovery-verdict" class="alarm-verdict" role="status">
              <i data-lucide="alert-triangle" aria-hidden="true"></i>
              <div><b>ALARM · PLAINTEXT RECOVERED</b><span id="recovered-text">Computing…</span></div>
            </div>
            <p id="negative-claim" class="negative-claim">All three KATs can still pass: confidentiality does not survive reusing one key, COUNT, bearer, and direction tuple for two messages.</p>
          </div>
        </div>

        <div class="forward-divider"><span>FORWARD-LOOKING · SEPARATE FROM THE KAT CORE</span></div>
        <section class="forward-panel" aria-labelledby="forward-title">
          <div class="forward-intro">
            <div>
              <p class="status-chip status-unverified"><i data-lucide="shield-question" aria-hidden="true"></i>NOT KAT-VERIFIED HERE</p>
              <h3 id="forward-title">The 256-bit evolution</h3>
            </div>
            <p>This panel maps the named successor sets from 3GPP metadata. It does not generate 256-bit output, reproduce restricted algorithm text, or claim conformance without public vectors.</p>
          </div>
          <div class="evolution-table" role="table" aria-label="Forward-looking 256-bit family mapping" tabindex="0">
            <div class="evolution-row evolution-head" role="row">
              <span role="columnheader">Family</span><span role="columnheader">Confidentiality</span><span role="columnheader">Integrity</span><span role="columnheader">Combined mode</span>
            </div>
            <div class="evolution-row" role="row">
              <b role="cell">SNOW family</b><span role="cell">256-NEA4</span><span role="cell">256-NIA4</span><span role="cell">256-NCA4</span>
            </div>
            <div class="evolution-row" role="row">
              <b role="cell">AES-256</b><span role="cell">256-NEA5</span><span role="cell">256-NIA5</span><span role="cell">256-NCA5</span>
            </div>
            <div class="evolution-row" role="row">
              <b role="cell">ZUC-256</b><span role="cell">256-NEA6</span><span role="cell">256-NIA6</span><span role="cell">256-NCA6</span>
            </div>
          </div>
          <div class="nca-sketch" role="img" aria-label="Illustrative NCA control flow: plaintext is encrypted, then the ciphertext is authenticated to produce ciphertext and a tag">
            <span>Plaintext</span><b>ENCRYPT</b><span>Ciphertext</span><b>MAC</b><span>Ciphertext + tag</span>
          </div>
          <p class="illustrative-note"><i data-lucide="alert-triangle" aria-hidden="true"></i><span>Illustrative only: the brief describes NCA as a one-pass Encrypt-then-MAC AEAD mode with a 256-bit key and 128-bit IV. This lab does not treat that statement as KAT-verified.</span></p>
          <details class="depth-note source-note">
            <summary>Source boundary and non-goals</summary>
            <p>Metadata links: <a href="https://www.etsi.org/deliver/etsi_ts/135200_135299/135240/" target="_blank" rel="noopener">TS 35.240</a>, <a href="https://www.etsi.org/deliver/etsi_ts/135200_135299/135243/" target="_blank" rel="noopener">TS 35.243</a>, and <a href="https://www.etsi.org/deliver/etsi_ts/135200_135299/135246/" target="_blank" rel="noopener">TS 35.246</a>. No full NAS/AS handshake, attach flow, key hierarchy, or relative-strength claim is in scope. This is not production crypto.</p>
          </details>
        </section>

        <div class="real-world">
          <span class="real-world-label">ON THE AIR</span>
          <p>These algorithm families protect cellular radio links in deployed LTE and 5G systems. Air Stream isolates only the confidentiality generators and their shared reuse failure; negotiation, key derivation, and integrity siblings remain outside this lab.</p>
        </div>
      </section>
    </main>

    <footer class="scripture-footer">
      <p class="footer-links">Sources: <a href="https://www.gsma.com/security/security-algorithms/" target="_blank" rel="noopener">GSMA Security Algorithms</a> · <a href="https://www.etsi.org/deliver/etsi_ts/133400_133499/133401/" target="_blank" rel="noopener">3GPP TS 33.401</a> · <a href="https://github.com/li0ard/zuc" target="_blank" rel="noopener">@li0ard/zuc cross-check</a></p>
      <p>So whether you eat or drink or whatever you do, do it all for the glory of God. — 1 Corinthians 10:31</p>
    </footer>
  </div>
`

const iconSet = {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  ExternalLink,
  Play,
  RadioTower,
  RefreshCw,
  ShieldQuestion,
}

function renderIcons(): void {
  createIcons({ icons: iconSet })
}

function elementById<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing #${id}.`)
  return element as T
}

function parseInputs(): CellularInputs {
  const key = hexToBytes(elementById<HTMLInputElement>('key-input').value)
  if (key.length !== 16) throw new Error('Key must contain exactly 16 bytes.')

  const countText = elementById<HTMLInputElement>('count-input').value.trim()
  if (!/^[0-9a-fA-F]{1,8}$/.test(countText)) throw new Error('COUNT must contain 1 to 8 hexadecimal characters.')
  const count = Number.parseInt(countText, 16)
  const bearer = elementById<HTMLInputElement>('bearer-input').valueAsNumber
  const byteLength = elementById<HTMLInputElement>('length-input').valueAsNumber
  const directionInput = document.querySelector<HTMLInputElement>('input[name="direction"]:checked')
  if (!directionInput) throw new Error('Choose a direction.')
  const direction = Number(directionInput.value)
  if (!Number.isInteger(bearer) || bearer < 0 || bearer > 31) throw new Error('Bearer must be a whole number from 0 to 31.')
  if (!Number.isInteger(byteLength) || byteLength < 1 || byteLength > 256) throw new Error('Length must be a whole number from 1 to 256 bytes.')
  return { key, count, bearer, direction: direction as 0 | 1, byteLength }
}

function inputsEqual(left: CellularInputs, right: CellularInputs): boolean {
  return left.count === right.count &&
    left.bearer === right.bearer &&
    left.direction === right.direction &&
    left.byteLength === right.byteLength &&
    bytesToHex(left.key) === bytesToHex(right.key)
}

function hexWord(value: number): string {
  return value.toString(16).padStart(8, '0')
}

function hexCells(values: number[], className = ''): string {
  return values.map((value, index) => `<span class="state-cell ${className}" data-index="${index}"><small>s${index}</small>${hexWord(value)}</span>`).join('')
}

let currentInputs: CellularInputs = { ...DEFAULT_INPUTS, key: DEFAULT_INPUTS.key.slice() }
let currentRun: FamilyRun | undefined
let katResults: KatResult[] = []
let mechanismFamily: FamilyId = 'snow'
let mechanismStage = 0
let attackFamily: FamilyId = 'snow'
let requestSequence = 0

function katFor(id: FamilyId): KatResult | undefined {
  return katResults.find((result) => result.id === id)
}

function renderFamilyOutputs(): void {
  const container = elementById<HTMLDivElement>('family-outputs')
  if (!currentRun?.ok) {
    container.innerHTML = ''
    container.hidden = true
    return
  }
  container.hidden = false
  container.innerHTML = currentRun.outputs.map((output) => {
    const kat = katFor(output.id)
    const passed = kat?.pass === true
    return `
      <article class="family-card family-${output.id}" role="listitem" data-family="${output.id}">
        <div class="family-card-head">
          <div><span>${output.algorithm}</span><h3>${output.label}</h3></div>
          <p class="status-chip ${passed ? 'status-pass' : 'status-fail'}" data-testid="kat-${output.id}">
            <i data-lucide="${passed ? 'circle-check' : 'circle-x'}" aria-hidden="true"></i>${passed ? 'KAT MATCH' : 'KAT FAIL'}
          </p>
        </div>
        <code class="stream-output" data-testid="stream-${output.id}" tabindex="0" role="region" aria-label="${output.label} keystream">${output.hex}</code>
        <div class="family-meta"><span>${output.bytes.length} bytes</span><a href="${kat?.sourceUrl ?? '#'}" target="_blank" rel="noopener">${kat?.sourceLabel ?? 'Checking source'}<i data-lucide="external-link" aria-hidden="true"></i></a></div>
      </article>
    `
  }).join('')
  renderIcons()
}

function renderSummary(): void {
  const summary = elementById<HTMLDivElement>('family-summary')
  const allKatsPass = katResults.length === 3 && katResults.every((result) => result.pass)
  if (currentRun?.ok && currentRun.allDifferent && allKatsPass) {
    summary.className = 'comparison-status status-pass'
    summary.innerHTML = '<i data-lucide="circle-check" aria-hidden="true"></i><span><b>EXECUTED</b> · all 3 KATs match, and this tuple produced 3 different keystreams.</span>'
  } else {
    summary.className = 'comparison-status status-fail'
    summary.innerHTML = `<i data-lucide="circle-x" aria-hidden="true"></i><span><b>CHECK FAILED</b> · ${currentRun?.error ?? 'A KAT failed or two outputs matched.'}</span>`
  }
  renderIcons()
}

function mechanismOutput(): FamilyOutput | undefined {
  return currentRun?.outputs.find((output) => output.id === mechanismFamily)
}

function renderSnowMechanism(output: FamilyOutput): string {
  const trace = output.trace as SnowRoundTrace
  return `
    <div class="mechanism-canvas family-snow stage-${mechanismStage}" data-testid="mechanism-snow">
      <div class="mechanism-caption"><span>16 × 32-bit LFSR</span><b>word ${trace.wordIndex + 1}</b></div>
      <div class="state-grid snow-grid">${hexCells(trace.lfsrBefore)}</div>
      <div class="fsm-row">
        <span class="fsm-box"><small>R1</small>${hexWord(trace.fsmBefore[0])}</span>
        <b class="operator">+</b>
        <span class="fsm-box"><small>R2</small>${hexWord(trace.fsmBefore[1])}</span>
        <b class="operator">→ F</b>
        <span class="result-box"><small>F XOR s0</small>${hexWord(trace.keystreamWord)}</span>
      </div>
      <div class="feedback-line"><span>feedback</span><code>${hexWord(trace.feedback)}</code><span>s15 receives feedback; every register shifts left</span></div>
    </div>`
}

function byteGrid(bytes: Uint8Array, prefix: string): string {
  return Array.from(bytes, (byte, index) => `<span class="byte-cell"><small>${prefix}${index.toString().padStart(2, '0')}</small>${byte.toString(16).padStart(2, '0')}</span>`).join('')
}

function renderAesMechanism(output: FamilyOutput): string {
  const trace = output.trace as AesEea2Trace
  return `
    <div class="mechanism-canvas family-aes stage-${mechanismStage}" data-testid="mechanism-aes">
      <div class="mechanism-caption"><span>128-bit counter block</span><b>low 64 bits increment</b></div>
      <div class="counter-path">
        <div><small>COUNT · BEARER · DIRECTION · ZEROES</small><div class="byte-grid">${byteGrid(trace.firstCounter, 'b')}</div></div>
        <b class="aes-core">AES<small>WebCrypto block</small></b>
        <div><small>ENCRYPTED COUNTER = KEYSTREAM</small><div class="byte-grid">${byteGrid(trace.firstEncryptedCounter, 'z')}</div></div>
      </div>
      <div class="feedback-line"><span>next counter</span><code>${bytesToHex(trace.nextCounter)}</code><span>high cellular fields stay fixed</span></div>
    </div>`
}

function renderZucMechanism(output: FamilyOutput): string {
  const trace = output.trace as ZucRoundTrace
  return `
    <div class="mechanism-canvas family-zuc stage-${mechanismStage}" data-testid="mechanism-zuc">
      <div class="mechanism-caption"><span>16 × 31-bit LFSR over GF(2³¹−1)</span><b>word ${trace.wordIndex + 1}</b></div>
      <div class="state-grid zuc-grid">${hexCells(trace.lfsrBefore)}</div>
      <div class="fsm-row">
        <span class="fsm-box"><small>X0</small>${hexWord(trace.bitReconstruction[0])}</span>
        <span class="fsm-box"><small>X1</small>${hexWord(trace.bitReconstruction[1])}</span>
        <span class="fsm-box"><small>X2</small>${hexWord(trace.bitReconstruction[2])}</span>
        <span class="result-box"><small>W XOR X3</small>${hexWord(trace.keystreamWord)}</span>
      </div>
      <div class="feedback-line"><span>modular feedback</span><code>${hexWord(trace.feedback)}</code><span>zero maps to 7fffffff</span></div>
    </div>`
}

function renderMechanism(): void {
  const view = elementById<HTMLDivElement>('mechanism-view')
  const output = mechanismOutput()
  if (!output) {
    view.innerHTML = '<p class="mechanism-empty">Generate streams to inspect a clock.</p>'
    return
  }
  view.innerHTML = mechanismFamily === 'snow'
    ? renderSnowMechanism(output)
    : mechanismFamily === 'aes'
      ? renderAesMechanism(output)
      : renderZucMechanism(output)

  const stages = ['Input state', 'Nonlinear transform', 'Output + state update']
  elementById<HTMLParagraphElement>('step-label').textContent = `Stage ${mechanismStage + 1} of 3 · ${stages[mechanismStage]}`
  elementById<HTMLButtonElement>('step-back').disabled = mechanismStage === 0
  elementById<HTMLButtonElement>('step-forward').disabled = mechanismStage === 2
  const details = {
    snow: '<p>EEA1 reverses the four 32-bit key words before SNOW initialization. The IV words are bearer/direction, COUNT, bearer/direction, COUNT. The shown word is <code>F XOR s0</code>.</p>',
    aes: '<p>EEA2 packs COUNT into bytes 0–3 and bearer/direction into byte 4. Only the low 64 counter bits advance; WebCrypto encrypts each visible block while this module performs the CTR wiring.</p>',
    zuc: '<p>EEA3 duplicates its first eight IV bytes into the second half. LFSR additions reduce modulo <code>2³¹−1</code>; when the result is zero, the register stores <code>7fffffff</code>.</p><p>The same algorithm is standardised in China as GM/T 0001-2012, the Zu Chongzhi (祖冲之) stream cipher; the vectors checked here are the ETSI/SAGE ones.</p>',
  }
  elementById<HTMLDivElement>('mechanism-detail').innerHTML = details[mechanismFamily]
}

async function refreshFamilies(inputs: CellularInputs): Promise<void> {
  const sequence = ++requestSequence
  const submit = elementById<HTMLButtonElement>('run-streams')
  const error = elementById<HTMLParagraphElement>('input-error')
  submit.disabled = true
  submit.innerHTML = '<i data-lucide="refresh-cw" aria-hidden="true"></i><span>Computing</span>'
  error.hidden = true
  renderIcons()
  const result = await runFamilies(inputs)
  if (sequence !== requestSequence) return
  currentInputs = inputs
  currentRun = result
  submit.disabled = false
  submit.innerHTML = '<i data-lucide="play" aria-hidden="true"></i><span>Generate</span>'
  renderFamilyOutputs()
  renderSummary()
  renderMechanism()
  renderIcons()
}

async function refreshAttack(): Promise<void> {
  const messageA = elementById<HTMLInputElement>('message-a').value
  const messageB = elementById<HTMLInputElement>('message-b').value
  const result = await runTwoTimePad(attackFamily, currentInputs, messageA, messageB)
  if ('error' in result) {
    elementById<HTMLSpanElement>('recovered-text').textContent = result.error
    return
  }
  elementById<HTMLElement>('cipher-a').textContent = bytesToHex(result.ciphertextA)
  elementById<HTMLElement>('cipher-b').textContent = bytesToHex(result.ciphertextB)
  elementById<HTMLElement>('cipher-xor').textContent = bytesToHex(result.ciphertextXor)
  elementById<HTMLSpanElement>('recovered-text').textContent = `“${result.recoveredText}”`
  elementById<HTMLDivElement>('recovery-verdict').dataset.recovered = String(result.recovered)
}

function retireStaleResult(): void {
  if (!currentRun) return
  let stillCurrent = false
  try {
    stillCurrent = inputsEqual(parseInputs(), currentInputs)
  } catch {
    stillCurrent = false
  }
  if (stillCurrent) return

  currentRun = undefined
  const outputs = elementById<HTMLDivElement>('family-outputs')
  outputs.innerHTML = ''
  outputs.hidden = true
  const summary = elementById<HTMLDivElement>('family-summary')
  summary.className = 'comparison-status status-neutral'
  summary.innerHTML = '<i data-lucide="refresh-cw" aria-hidden="true"></i><span><b>RETIRED</b> · inputs changed; generate again before trusting a verdict.</span>'
  renderMechanism()
  renderIcons()
}

elementById<HTMLFormElement>('stream-form').addEventListener('submit', (event) => {
  event.preventDefault()
  try {
    void refreshFamilies(parseInputs()).then(refreshAttack)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid input.'
    const alert = elementById<HTMLParagraphElement>('input-error')
    alert.textContent = message
    alert.hidden = false
  }
})

elementById<HTMLFormElement>('stream-form').querySelectorAll<HTMLInputElement>('input').forEach((input) => {
  input.addEventListener('input', retireStaleResult)
  input.addEventListener('change', retireStaleResult)
})

document.querySelectorAll<HTMLButtonElement>('[data-mechanism]').forEach((button) => {
  button.addEventListener('click', () => {
    mechanismFamily = button.dataset.mechanism as FamilyId
    mechanismStage = 0
    document.querySelectorAll<HTMLButtonElement>('[data-mechanism]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button))
    })
    renderMechanism()
  })
})

elementById<HTMLButtonElement>('step-back').addEventListener('click', () => {
  mechanismStage = Math.max(0, mechanismStage - 1)
  renderMechanism()
})

elementById<HTMLButtonElement>('step-forward').addEventListener('click', () => {
  mechanismStage = Math.min(2, mechanismStage + 1)
  renderMechanism()
})

document.querySelectorAll<HTMLButtonElement>('[data-attack-family]').forEach((button) => {
  button.addEventListener('click', () => {
    attackFamily = button.dataset.attackFamily as FamilyId
    document.querySelectorAll<HTMLButtonElement>('[data-attack-family]').forEach((item) => {
      item.setAttribute('aria-pressed', String(item === button))
    })
    void refreshAttack()
  })
})

elementById<HTMLFormElement>('attack-form').addEventListener('submit', (event) => {
  event.preventDefault()
  void refreshAttack()
})

async function initialize(): Promise<void> {
  renderIcons()
  const [kats, run] = await Promise.all([runKnownAnswerTests(), runFamilies(currentInputs)])
  katResults = kats
  currentRun = run
  renderFamilyOutputs()
  renderSummary()
  renderMechanism()
  await refreshAttack()
  renderIcons()
}

void initialize()
