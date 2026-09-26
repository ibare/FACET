/**
 * binds-key-to-name — 인증서의 서명은 이름과 열쇠를 한데 이은 요약 하나에 걸린다.
 *
 * CA 가 이름 · 발급자 · 열쇠를 한 줄(tbs)로 이어 장난감 해시 H 로 요약 하나를 만들고,
 * 그 요약에 서명한다. 받는 쪽이 서명을 풀면 그 요약이 돌아온다. 열쇠만 바꿔 끼우면
 * 이름은 그대로인데 다시 이은 줄의 요약이 달라져 푼 값과 어긋난다.
 *
 * 모형 (공통 안내문):
 *   - 장난감 해시 H: 상태 16 비트 · IV 0x6a09 · 덩어리 2 바이트 · 패딩 0x80 · 0 · 길이(비트 16)
 *     f(h, m): x = h 에서 세 라운드 (x ⊕ m → x × 0x9e37 mod 2¹⁶ → rotl16(x, 5)) 뒤 (x + h) mod 2¹⁶
 *   - tbs = `<subject>|<issuer>|<n>|<e>` · 요약 = H(tbs 의 ASCII) mod (CA 의 n)
 *   - 장난감 RSA: n = p × q · d = e⁻¹ mod (p−1)(q−1) · 서명 = 요약^d mod n · 푼 값 = 서명^e mod n
 *
 * 이벤트 (발신 순서대로):
 *   init   (silent) payload {
 *            caN: number, caE: number, caD: number,
 *            subject: string, issuer: string,   (issuer 가 곧 CA 의 이름)
 *            ownerKey: { n: number, e: number }, swapKey: { n: number, e: number }
 *          }                                  — 바탕. 걸음 0 을 갈아 끼운다
 *   digest payload { segs: string[4], h: number, digest: number }
 *                                             — CA 가 이름 · 발급자 · n · e 를 한 줄로 이어 요약한다
 *   sign   payload { digest: number, sig: number }
 *                                             — CA 가 그 요약에 서명한다 (sig = digest^caD mod caN)
 *   verify payload { segs: string[4], same: boolean[4], h: number, digest: number,
 *                    sig: number, unwrapped: number, match: boolean }
 *                                             — 받는 쪽이 인증서의 지금 내용으로 줄을 다시 이어 요약하고,
 *                                               서명을 CA 의 공개 열쇠로 푼다. same 은 CA 가 이은 줄과
 *                                               토막마다 같은가
 *   swap   payload { from: { n: number, e: number }, to: { n: number, e: number } }
 *                                             — 인증서의 열쇠만 바꿔 끼운다. 이름 · 발급자 · 서명은 그대로
 *
 * 걸음: 0 처음(init) · 1 digest · 2 sign · 3 verify · 4 swap · 5 verify (끝)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RsaPrimes = { p: number; q: number; e: number };

export type BindsKeyToNameFacetData = {
  type: 'binds-key-to-name';
  stepMs: number;
  ca: RsaPrimes & { name: string };
  owner: RsaPrimes & { name: string };
  swapper: RsaPrimes;
};

export type PublicKey = { n: number; e: number };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function narrowInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new Error(`binds-key-to-name: ${path} 가 양의 정수가 아니다`);
  }
  return v;
}

function narrowName(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`binds-key-to-name: ${path} 가 빈 문자열이거나 문자열이 아니다`);
  }
  for (let i = 0; i < v.length; i += 1) {
    const c = v.charCodeAt(i);
    if (c > 0x7f || v[i] === '|') throw new Error(`binds-key-to-name: ${path} 에 ASCII 밖 글자나 구분자 | 가 있다`);
  }
  return v;
}

function narrowPrimes(v: unknown, path: string): RsaPrimes {
  if (!isRecord(v)) throw new Error(`binds-key-to-name: ${path} 가 객체가 아니다`);
  return {
    p: narrowInt(v.p, `${path}.p`),
    q: narrowInt(v.q, `${path}.q`),
    e: narrowInt(v.e, `${path}.e`),
  };
}

/** initialData 좁히개 — 알고리즘과 장면이 함께 부른다. */
export function narrowBindsKeyToNameData(raw: unknown): BindsKeyToNameFacetData {
  if (!isRecord(raw)) throw new Error('binds-key-to-name: initialData 가 객체가 아니다');
  if (raw.type !== 'binds-key-to-name') throw new Error('binds-key-to-name: initialData.type 이 맞지 않는다');
  const stepMs = narrowInt(raw.stepMs, 'initialData.stepMs');
  if (!isRecord(raw.ca)) throw new Error('binds-key-to-name: initialData.ca 가 객체가 아니다');
  if (!isRecord(raw.owner)) throw new Error('binds-key-to-name: initialData.owner 가 객체가 아니다');
  return {
    type: 'binds-key-to-name',
    stepMs,
    ca: { ...narrowPrimes(raw.ca, 'initialData.ca'), name: narrowName(raw.ca.name, 'initialData.ca.name') },
    owner: { ...narrowPrimes(raw.owner, 'initialData.owner'), name: narrowName(raw.owner.name, 'initialData.owner.name') },
    swapper: narrowPrimes(raw.swapper, 'initialData.swapper'),
  };
}

// ── 장난감 해시 H ────────────────────────────────────────────

export const TOY_IV = 0x6a09;

function rotl16(x: number, r: number): number {
  return ((x << r) | (x >>> (16 - r))) & 0xffff;
}

/** 압축 f(h, m) — 세 라운드 뒤 앞 상태를 더해 넘긴다. */
export function compress(h: number, m: number): number {
  let x = h;
  for (let round = 0; round < 3; round += 1) {
    x = (x ^ m) & 0xffff;
    x = Math.imul(x, 0x9e37) & 0xffff;
    x = rotl16(x, 5);
  }
  return (x + h) & 0xffff;
}

/** 메시지 바이트 뒤에 0x80 · 0x00(z 개) · 길이(비트, 16 비트 큰 쪽 먼저) 를 붙인다. */
export function pad(bytes: readonly number[]): number[] {
  const bits = bytes.length * 8;
  if (bits > 0xffff) throw new Error('binds-key-to-name: 메시지가 길이 필드 16 비트를 넘는다');
  const z = bytes.length % 2 === 1 ? 0 : 1;
  const out = [...bytes, 0x80];
  for (let i = 0; i < z; i += 1) out.push(0x00);
  out.push((bits >>> 8) & 0xff, bits & 0xff);
  return out;
}

export function toyHash(bytes: readonly number[]): number {
  const padded = pad(bytes);
  let h = TOY_IV;
  for (let i = 0; i < padded.length; i += 2) {
    const a = padded[i];
    const b = padded[i + 1];
    if (a === undefined || b === undefined) throw new Error('binds-key-to-name: 패딩 뒤 길이가 짝수가 아니다');
    h = compress(h, (a << 8) | b);
  }
  return h;
}

export function asciiBytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c > 0x7f) throw new Error(`binds-key-to-name: ASCII 밖 글자 ${i} 번째`);
    out.push(c);
  }
  return out;
}

// ── 장난감 RSA ──────────────────────────────────────────────

export function modPow(base: number, exp: number, mod: number): number {
  let b = BigInt(base) % BigInt(mod);
  let x = BigInt(exp);
  const m = BigInt(mod);
  let r = 1n;
  while (x > 0n) {
    if (x & 1n) r = (r * b) % m;
    b = (b * b) % m;
    x >>= 1n;
  }
  return Number(r);
}

function modInverse(e: number, phi: number): number {
  let [oldR, r] = [e, phi];
  let [oldS, s] = [1, 0];
  while (r !== 0) {
    const q = Math.floor(oldR / r);
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1) throw new Error(`binds-key-to-name: e ${e} 가 φ ${phi} 와 서로소가 아니다`);
  return ((oldS % phi) + phi) % phi;
}

/** tbs 의 네 토막 — 이름 · 발급자 · n · e (수는 십진). 이을 때 구분자는 `|`. */
export function tbsSegments(subject: string, issuer: string, key: PublicKey): string[] {
  return [subject, issuer, String(key.n), String(key.e)];
}

export const TBS_SEPARATOR = '|';

// ── 알고리즘 ───────────────────────────────────────────────

export async function bindsKeyToName(
  ctxBase: FacetContext<BindsKeyToNameFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<BindsKeyToNameFacetData>;
  const data = narrowBindsKeyToNameData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const caN = data.ca.p * data.ca.q;
  const caE = data.ca.e;
  const caD = modInverse(caE, (data.ca.p - 1) * (data.ca.q - 1));
  const subject = data.owner.name;
  const issuer = data.ca.name;
  const ownerKey: PublicKey = { n: data.owner.p * data.owner.q, e: data.owner.e };
  const swapKey: PublicKey = { n: data.swapper.p * data.swapper.q, e: data.swapper.e };

  function summarize(key: PublicKey): { segs: string[]; h: number; digest: number } {
    const segs = tbsSegments(subject, issuer, key);
    const h = toyHash(asciiBytes(segs.join(TBS_SEPARATOR)));
    return { segs, h, digest: h % caN };
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { caN, caE, caD, subject, issuer, ownerKey, swapKey },
  });

  // 걸음 0 은 서명 없는 인증서가 이미 서 있다 — 읽을 틈을 준다
  if (!(await pause())) return;

  const signed = summarize(ownerKey);
  await ctx.emit({ type: 'digest', payload: signed });
  if (!(await pause())) return;

  const sig = modPow(signed.digest, caD, caN);
  await ctx.emit({ type: 'sign', payload: { digest: signed.digest, sig } });
  if (!(await pause())) return;

  async function verify(key: PublicKey): Promise<void> {
    const now = summarize(key);
    const unwrapped = modPow(sig, caE, caN);
    await ctx.emit({
      type: 'verify',
      payload: {
        segs: now.segs,
        same: now.segs.map((s, i) => s === signed.segs[i]),
        h: now.h,
        digest: now.digest,
        sig,
        unwrapped,
        match: now.digest === unwrapped,
      },
    });
  }

  await verify(ownerKey);
  if (!(await pause())) return;

  await ctx.emit({ type: 'swap', payload: { from: ownerKey, to: swapKey } });
  if (!(await pause())) return;

  await verify(swapKey);
}
