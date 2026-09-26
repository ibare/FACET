/**
 * trust-anchor — 이름이 같은 뿌리 둘을 제 서명으로는 가르지 못하고, 미리 들여놓은
 * 신뢰 저장소의 열쇠와 견줄 때에야 가른다.
 *
 * 모형 (장난감 RSA · 장난감 해시 H):
 *   n = p × q · d = e⁻¹ mod (p−1)(q−1)
 *   tbs = `<subject>|<issuer>|<n>|<e>` (제 서명이라 issuer = subject)
 *   요약 = H(tbs 의 ASCII 바이트) mod n · 서명 = 요약^d mod n · 푼 값 = 서명^e mod n
 *   H: 상태 16 비트, IV 0x6a09, 덩어리 2 바이트, 패딩 0x80 · 0x00×z · 비트 길이 16 비트,
 *      f(h, m) = 세 라운드 (x ⊕ m → x × 0x9e37 mod 2¹⁶ → rotl16(x, 5)) 뒤 (x + h) mod 2¹⁶
 *   저장소 판정: subject 가 글자 그대로 같은 항목을 찾아 (n, e) 가 둘 다 같으면 믿는다
 *
 * 이벤트 (발신 차례대로):
 *   init       silent: true
 *              payload { keys: { id: RootId; n: number; e: number; sig: number }[];
 *                        store: { subject: string; n: number; e: number }[] }
 *              — 알고리즘이 셈한 바탕 (각 뿌리의 공개 열쇠와 제 서명 · 저장소 항목의 열쇠)
 *   selfSig    payload { root: RootId; digest: number; recovered: number; holds: boolean }
 *              — 뿌리 하나의 제 서명을 제 열쇠로 푼다. 뿌리마다 한 걸음, 데이터 차례대로
 *   storeCheck payload { root: RootId; storeN: number; storeE: number; trusted: boolean }
 *              — 뿌리 하나를 이름으로 저장소에서 찾아 열쇠를 견준다. 뿌리마다 한 걸음
 *
 * ctx.metric 은 부르지 않는다 (S-piece).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RootId = 'genuine' | 'fake';

export type RootSpec = {
  id: RootId;
  subject: string;
  issuer: string;
  p: number;
  q: number;
  e: number;
};

export type StoreSpec = {
  subject: string;
  /** 저장소 항목이 들여놓은 열쇠의 출처 뿌리 */
  root: RootId;
};

export type TrustAnchorFacetData = {
  type: 'trust-anchor';
  stepMs: number;
  roots: RootSpec[];
  store: StoreSpec[];
};

function fail(path: string, why: string): never {
  throw new Error(`trust-anchor: ${path} — ${why}`);
}

function field(obj: Record<string, unknown>, key: string, path: string): unknown {
  if (!(key in obj)) fail(`${path}.${key}`, '없다');
  return obj[key];
}

function asRecord(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, '객체가 아니다');
  return v as Record<string, unknown>;
}

function asInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(path, '정수가 아니다');
  return v;
}

function asText(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(path, '빈 글자이거나 글자가 아니다');
  return v;
}

export function asRootId(v: unknown, path: string): RootId {
  if (v === 'genuine' || v === 'fake') return v;
  fail(path, `모르는 뿌리 식별자 ${String(v)}`);
}

function isPrime(x: number): boolean {
  if (x < 2) return false;
  for (let k = 2; k * k <= x; k += 1) {
    if (x % k === 0) return false;
  }
  return true;
}

/** `ctx.data` 와 장면의 `initial` 이 함께 쓰는 좁히개. 어긋나면 필드 경로를 담아 던진다. */
export function narrowTrustAnchorData(raw: unknown): TrustAnchorFacetData {
  const o = asRecord(raw, 'data');
  if (field(o, 'type', 'data') !== 'trust-anchor') fail('data.type', 'trust-anchor 가 아니다');
  const stepMs = asInt(field(o, 'stepMs', 'data'), 'data.stepMs');
  if (stepMs <= 0) fail('data.stepMs', '양수가 아니다');
  const rootsRaw = field(o, 'roots', 'data');
  if (!Array.isArray(rootsRaw) || rootsRaw.length === 0) fail('data.roots', '빈 배열이거나 배열이 아니다');
  const seen = new Set<RootId>();
  const roots = rootsRaw.map((r, i): RootSpec => {
    const path = `data.roots[${i}]`;
    const ro = asRecord(r, path);
    const id = asRootId(field(ro, 'id', path), `${path}.id`);
    if (seen.has(id)) fail(`${path}.id`, `겹친 식별자 ${id}`);
    seen.add(id);
    const p = asInt(field(ro, 'p', path), `${path}.p`);
    const q = asInt(field(ro, 'q', path), `${path}.q`);
    if (!isPrime(p)) fail(`${path}.p`, '소수가 아니다');
    if (!isPrime(q)) fail(`${path}.q`, '소수가 아니다');
    if (p === q) fail(`${path}.q`, 'p 와 같다');
    return {
      id,
      subject: asText(field(ro, 'subject', path), `${path}.subject`),
      issuer: asText(field(ro, 'issuer', path), `${path}.issuer`),
      p,
      q,
      e: asInt(field(ro, 'e', path), `${path}.e`),
    };
  });
  const storeRaw = field(o, 'store', 'data');
  if (!Array.isArray(storeRaw) || storeRaw.length === 0) fail('data.store', '빈 배열이거나 배열이 아니다');
  const store = storeRaw.map((s, i): StoreSpec => {
    const path = `data.store[${i}]`;
    const so = asRecord(s, path);
    const root = asRootId(field(so, 'root', path), `${path}.root`);
    if (!seen.has(root)) fail(`${path}.root`, `roots 에 없는 뿌리 ${root}`);
    return { subject: asText(field(so, 'subject', path), `${path}.subject`), root };
  });
  return { type: 'trust-anchor', stepMs, roots, store };
}

// ── 장난감 해시 H ──────────────────────────────────────────────

const IV = 0x6a09;
const MUL = 0x9e37;

function rotl16(x: number, s: number): number {
  return ((x << s) | (x >>> (16 - s))) & 0xffff;
}

/** 압축 f(h, m) — 세 라운드 뒤 앞 상태를 더해 넘긴다. */
export function compress(h: number, m: number): number {
  let x = h;
  for (let round = 0; round < 3; round += 1) {
    x = (x ^ m) & 0xffff;
    x = Math.imul(x, MUL) & 0xffff;
    x = rotl16(x, 5);
  }
  return (x + h) & 0xffff;
}

export function asciiBytes(text: string): number[] {
  return Array.from(text, (ch, i) => {
    const code = ch.charCodeAt(0);
    if (ch.length !== 1 || code > 0x7f) fail(`text[${i}]`, `ASCII 가 아니다: ${ch}`);
    return code;
  });
}

/** 장난감 해시 H — IV 에서 (msg ‖ 패딩) 의 2 바이트 덩어리를 차례로 접은 끝 상태. */
export function toyHash(bytes: readonly number[]): number {
  const bits = bytes.length * 8;
  if (bits > 0xffff) fail('toyHash', '길이가 16 비트 길이 필드를 넘는다');
  const padded = [...bytes, 0x80];
  if (bytes.length % 2 === 0) padded.push(0x00);
  padded.push((bits >>> 8) & 0xff, bits & 0xff);
  let h = IV;
  for (let i = 0; i < padded.length; i += 2) {
    const a = padded[i];
    const b = padded[i + 1];
    if (a === undefined || b === undefined) fail('toyHash', `덩어리 ${i / 2} 가 모자란다`);
    h = compress(h, (a << 8) | b);
  }
  return h;
}

// ── 장난감 RSA ─────────────────────────────────────────────────

export function modPow(base: number, exp: number, mod: number): number {
  let result = 1n;
  let b = BigInt(base) % BigInt(mod);
  let x = BigInt(exp);
  const m = BigInt(mod);
  while (x > 0n) {
    if (x & 1n) result = (result * b) % m;
    b = (b * b) % m;
    x >>= 1n;
  }
  return Number(result);
}

export function modInverse(a: number, mod: number): number {
  let [oldR, r] = [a, mod];
  let [oldS, s] = [1, 0];
  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1) fail('modInverse', `${a} 는 mod ${mod} 에서 역이 없다`);
  return ((oldS % mod) + mod) % mod;
}

export function tbsOf(subject: string, issuer: string, n: number, e: number): string {
  return `${subject}|${issuer}|${n}|${e}`;
}

/** 요약 = H(tbs) mod n */
export function digestOf(subject: string, issuer: string, n: number, e: number): number {
  return toyHash(asciiBytes(tbsOf(subject, issuer, n, e))) % n;
}

type MadeRoot = { id: RootId; subject: string; issuer: string; n: number; e: number; sig: number };

/** 뿌리를 만든 쪽이 하는 일 — 제 d 로 제 인증서에 서명한다. d 는 밖으로 나가지 않는다. */
function makeRoot(spec: RootSpec, path: string): MadeRoot {
  if (spec.issuer !== spec.subject) fail(`${path}.issuer`, '제 서명이 아니다 (issuer ≠ subject)');
  const n = spec.p * spec.q;
  const phi = (spec.p - 1) * (spec.q - 1);
  const d = modInverse(spec.e, phi);
  const digest = digestOf(spec.subject, spec.issuer, n, spec.e);
  const sig = modPow(digest, d, n);
  return { id: spec.id, subject: spec.subject, issuer: spec.issuer, n, e: spec.e, sig };
}

export async function trustAnchor(context: FacetContext<TrustAnchorFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<TrustAnchorFacetData>;
  const data = narrowTrustAnchorData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const made = data.roots.map((spec, i) => makeRoot(spec, `data.roots[${i}]`));
  const storeKeys = data.store.map((entry, i) => {
    const src = made.find((m) => m.id === entry.root);
    if (!src) fail(`data.store[${i}].root`, `없는 뿌리 ${entry.root}`);
    return { subject: entry.subject, n: src.n, e: src.e };
  });

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      keys: made.map((m) => ({ id: m.id, n: m.n, e: m.e, sig: m.sig })),
      store: storeKeys,
    },
  });

  // 앞 절반 — 건너온 뿌리마다 제 서명을 제 열쇠로 푼다
  for (const root of made) {
    if (!(await pause())) return;
    const digest = digestOf(root.subject, root.issuer, root.n, root.e);
    const recovered = modPow(root.sig, root.e, root.n);
    await ctx.emit({
      type: 'selfSig',
      payload: { root: root.id, digest, recovered, holds: recovered === digest },
    });
  }

  // 뒤 절반 — 이름으로 저장소 항목을 찾아 열쇠를 견준다
  for (const root of made) {
    if (!(await pause())) return;
    const entry = storeKeys.find((s) => s.subject === root.subject);
    if (!entry) fail(`store`, `이름 ${root.subject} 인 항목이 없다`);
    await ctx.emit({
      type: 'storeCheck',
      payload: {
        root: root.id,
        storeN: entry.n,
        storeE: entry.e,
        trusted: entry.n === root.n && entry.e === root.e,
      },
    });
  }
}
