/**
 * never-reuse-keystream — 같은 키스트림으로 두 메시지를 잠그면, 공격자가 두 암호문을
 * 겹치는 것만으로 키스트림이 지워지고 두 평문의 겹침이 남는다.
 *
 * 셈은 두 갈래를 함께 한다.
 *  - 바이트: C1 = P1 ⊕ S · C2 = P2 ⊕ S · C1 ⊕ C2 · 짐작 ⊕ (C1 ⊕ C2)
 *  - 항: 한 줄이 어떤 1차 값(p1 · p2 · s)의 겹침인지. 겹치면 양쪽에 있던 항은 짝으로 지워진다
 *    (x ⊕ x = 0). 바이트 셈과 항 셈이 어긋나면 던진다
 *
 * 걸음 0 은 `initial()` 이 initialData 에서 채운다 (두 평문 · 키스트림 하나). init 이벤트는 없다.
 *
 * 이벤트 (전부 silent 아님 — 한 발신이 한 걸음):
 *  - `lock`    보내는 쪽이 한 메시지를 키스트림으로 잠근다. 두 번 온다 (c1 · c2)
 *      payload { row: 'c1' | 'c2'; from: 'p1' | 'p2'; bytes: number[]; terms: Term[] }
 *  - `overlay` 공격자가 두 암호문을 겹친다
 *      payload { bytes: number[]; terms: Term[]; cancelled: Term[]; zeros: number[] }
 *        zeros — 값이 0 인 바이트의 자리 (0 부터)
 *  - `recover` 공격자가 짐작한 평문을 겹침에 겹친다
 *      payload { guess: number[]; bytes: number[]; terms: Term[]; cancelled: Term[];
 *                samePos: boolean[]; same: number; total: number; keystreamUses: number }
 *        samePos — 자리마다 결과가 P2 와 같은가 · same — 그 가운데 참인 수 · keystreamUses — 공격자의 겹침이 S 를 재료로 쓴 횟수
 *
 * ctx.metric 은 부르지 않는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 한 줄을 이루는 1차 값. p1 · p2 는 평문, s 는 키스트림. */
export type Term = 'p1' | 'p2' | 's';

export type NeverReuseKeystreamFacetData = {
  type: 'never-reuse-keystream';
  stepMs: number;
  /** 첫 평문 — 인쇄 가능한 ASCII. 글자가 곧 바이트 값이다 */
  p1: string;
  /** 둘째 평문 — p1 과 길이가 같다 */
  p2: string;
  /** 키스트림 — 16 진 대문자, 바이트마다 두 자리. 두 메시지에 똑같이 쓴다 */
  keystream: string;
  /** 공격자가 짐작한 한쪽 평문 — ASCII */
  guess: string;
};

/** 좁힌 자료 — 바이트 줄로 바꾼 것. */
export type KeystreamBase = {
  stepMs: number;
  p1: number[];
  p2: number[];
  s: number[];
  guess: number[];
};

function asciiBytes(value: unknown, field: string): number[] {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`never-reuse-keystream: ${field} 는 비지 않은 문자열이어야 한다`);
  }
  const out: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      throw new Error(`never-reuse-keystream: ${field}[${i}] 는 인쇄 가능한 ASCII 가 아니다`);
    }
    out.push(code);
  }
  return out;
}

function hexBytes(value: unknown, field: string): number[] {
  if (typeof value !== 'string' || !/^(?:[0-9A-F]{2})+$/.test(value)) {
    throw new Error(`never-reuse-keystream: ${field} 는 16 진 대문자 두 자리씩이어야 한다`);
  }
  const out: number[] = [];
  for (let i = 0; i < value.length; i += 2) out.push(parseInt(value.slice(i, i + 2), 16));
  return out;
}

/** ctx.data · initialData 의 좁히개. 어긋나면 던진다. */
export function narrowKeystreamData(raw: unknown): KeystreamBase {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('never-reuse-keystream: 자료가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'never-reuse-keystream') {
    throw new Error('never-reuse-keystream: type 이 never-reuse-keystream 가 아니다');
  }
  const stepMs = d.stepMs;
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs < 800) {
    throw new Error('never-reuse-keystream: stepMs 는 800 이상인 수여야 한다');
  }
  const p1 = asciiBytes(d.p1, 'p1');
  const p2 = asciiBytes(d.p2, 'p2');
  const s = hexBytes(d.keystream, 'keystream');
  const guess = asciiBytes(d.guess, 'guess');
  const n = p1.length;
  if (p2.length !== n || s.length !== n || guess.length !== n) {
    throw new Error(`never-reuse-keystream: p1 · p2 · keystream · guess 의 바이트 수가 ${n} 로 같아야 한다`);
  }
  return { stepMs, p1, p2, s, guess };
}

/** 바이트마다 XOR. */
export function xorBytes(a: readonly number[], b: readonly number[]): number[] {
  if (a.length !== b.length) throw new Error('never-reuse-keystream: 겹치는 두 줄의 길이가 다르다');
  return a.map((x, i) => x ^ (b[i] as number));
}

/** 항 겹침 — 양쪽에 있는 항은 짝으로 지워진다. */
export function xorTerms(a: readonly Term[], b: readonly Term[]): { terms: Term[]; cancelled: Term[] } {
  const order: Term[] = ['p1', 'p2', 's'];
  const terms: Term[] = [];
  const cancelled: Term[] = [];
  for (const term of order) {
    const inA = a.includes(term);
    const inB = b.includes(term);
    if (inA && inB) cancelled.push(term);
    else if (inA || inB) terms.push(term);
  }
  return { terms, cancelled };
}

/** 항 목록이 가리키는 바이트 — 바이트 셈의 검산용. */
function termBytes(base: KeystreamBase, terms: readonly Term[]): number[] {
  let out = base.p1.map(() => 0);
  for (const term of terms) out = xorBytes(out, base[term]);
  return out;
}

function sameBytes(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function check(base: KeystreamBase, bytes: readonly number[], terms: readonly Term[], where: string): void {
  if (!sameBytes(bytes, termBytes(base, terms))) {
    throw new Error(`never-reuse-keystream: ${where} 의 바이트 셈과 항 셈이 어긋난다`);
  }
}

/** 바이트 표기 — 16 진 두 자리 대문자. */
export function hex2(byte: number): string {
  if (!Number.isInteger(byte) || byte < 0 || byte > 255) {
    throw new Error(`never-reuse-keystream: 바이트가 아니다 (${byte})`);
  }
  return byte.toString(16).toUpperCase().padStart(2, '0');
}

/** 바이트 표기 — 2 진 여덟 자리, 큰 자리부터. */
export function bin8(byte: number): string {
  hex2(byte);
  return byte.toString(2).padStart(8, '0');
}

export async function neverReuseKeystream(
  ctx: FacetContext<NeverReuseKeystreamFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<NeverReuseKeystreamFacetData>;
  const base = narrowKeystreamData(rctx.data);
  const stepMs = base.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 보내는 쪽 — 같은 키스트림 한 벌로 두 메시지를 잠근다
  async function lock(row: 'c1' | 'c2', from: 'p1' | 'p2'): Promise<{ bytes: number[]; terms: Term[] }> {
    const bytes = xorBytes(base[from], base.s);
    const { terms } = xorTerms([from], ['s']);
    check(base, bytes, terms, row);
    await rctx.emit({ type: 'lock', payload: { row, from, bytes, terms } });
    return { bytes, terms };
  }

  // 걸음 0 은 두 평문과 키스트림이 놓인 화면이라 첫 발신 앞에서도 읽을 틈을 둔다
  if (!(await pause())) return;
  const c1 = await lock('c1', 'p1');
  if (!(await pause())) return;
  const c2 = await lock('c2', 'p2');

  // 공격자 — 가진 것은 C1 · C2 뿐이다. 겹침마다 재료를 적어 둔다
  const attackerOperands: string[][] = [];

  if (!(await pause())) return;
  attackerOperands.push(['c1', 'c2']);
  const xBytes = xorBytes(c1.bytes, c2.bytes);
  const x = xorTerms(c1.terms, c2.terms);
  check(base, xBytes, x.terms, 'C1 ⊕ C2');
  const zeros: number[] = [];
  xBytes.forEach((b, i) => {
    if (b === 0) zeros.push(i);
  });
  await rctx.emit({
    type: 'overlay',
    payload: { bytes: xBytes, terms: x.terms, cancelled: x.cancelled, zeros },
  });

  if (!(await pause())) return;
  // 짐작은 한쪽 평문의 꼴을 안다는 가정이다. 짐작이 P1 과 같을 때만 항 p1 로 친다
  if (!sameBytes(base.guess, base.p1)) {
    throw new Error('never-reuse-keystream: 짐작이 P1 과 같지 않다 — 이 조각은 맞힌 짐작을 보인다');
  }
  attackerOperands.push(['guess', 'x']);
  const rBytes = xorBytes(base.guess, xBytes);
  const r = xorTerms(['p1'], x.terms);
  check(base, rBytes, r.terms, '짐작 ⊕ (C1 ⊕ C2)');
  const samePos = rBytes.map((b, i) => b === base.p2[i]);
  const same = samePos.filter((hit) => hit).length;
  const keystreamUses = attackerOperands.flat().filter((operand) => operand === 's').length;
  await rctx.emit({
    type: 'recover',
    payload: {
      guess: [...base.guess],
      bytes: rBytes,
      terms: r.terms,
      cancelled: r.cancelled,
      samePos,
      same,
      total: rBytes.length,
      keystreamUses,
    },
  });
}
