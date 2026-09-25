/**
 * certificate-chain — 잎 인증서에서 발급자를 따라 한 칸씩 거슬러 올라, 신뢰 저장소의 뿌리에 닿으면 멈춘다.
 *
 * 규약 (사양 그대로):
 *   - 잎 = 서버가 보낸 꾸러미의 첫 인증서.
 *   - 한 칸 오르기 = 걸음 둘 — 찾기 한 걸음 + 서명 확인 한 걸음.
 *   - 찾기: 지금 칸의 issuer 와 subject 가 글자 그대로 같은 인증서를 찾는다.
 *     꾸러미 먼저(이미 사슬에 든 것은 빼고, 꾸러미 차례대로), 없으면 신뢰 저장소(저장소 차례대로).
 *     처음 맞는 것에서 멈춘다. 어디에도 없으면 던진다.
 *   - 서명 확인 (장난감 RSA):
 *       tbs    = `<subject>|<issuer>|<n>|<e>` — 아래 칸 자신의 값, 수는 십진
 *       요약   = (tbs 글자의 코드값 합) mod (찾은 칸의 n)
 *       푼 값  = sig ^ (찾은 칸의 e) mod (찾은 칸의 n)
 *       푼 값 = 요약 이면 맞다. 다르면 던지지 않고 "틀리다" 로 멈춘다.
 *   - 찾은 칸이 신뢰 저장소에서 왔으면 그 서명을 확인한 다음 걸음에서 멈춘다 (믿는다).
 *     뿌리 자신의 서명은 확인하지 않는다.
 *   - 유효 기간 · 폐기 · 호스트 이름 일치는 보지 않는다.
 *
 * 걸음: 첫 장면(꾸러미가 서버 쪽)에서 stepMs 를 머문 뒤 발신한다. 모두 silent 가 아니다.
 *
 * 이벤트
 *   receive  { bundle: string[] }
 *            꾸러미가 서버에서 클라이언트로 건너온다.
 *   find     { from: string; issuer: string; to: string; where: 'bundle' | 'store'; looked: string[] }
 *            from 의 issuer 로 다음 칸 to 를 찾았다. looked 는 견준 차례 (to 를 끝으로 담는다).
 *   verify   { lower: string; upper: string; digest: number; recovered: number; ok: boolean }
 *            upper 의 공개 열쇠로 lower 의 서명을 풀었다. digest · recovered 는 셈한 수 (화면에는 ok 만).
 *            ok 가 거짓이면 이 걸음 뒤 멈춘다.
 *   anchor   { root: string; chain: string[] }
 *            root 가 신뢰 저장소에서 왔다 — 멈추고 믿는다. chain 은 잎부터 뿌리까지.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CertificateEntry = {
  id: string;
  subject: string;
  /** 저장소의 뿌리는 두지 않아도 된다 — 쓰지 않는다. */
  issuer?: string;
  n: number;
  e: number;
  /** 발급자가 단 서명. 저장소의 뿌리는 두지 않는다. */
  sig?: number;
};

export type CertificateChainFacetData = {
  type: 'certificate-chain';
  stepMs: number;
  certs: CertificateEntry[];
  /** 서버가 보내는 꾸러미의 차례 — 첫 것이 잎 */
  bundle: string[];
  /** 클라이언트의 신뢰 저장소 차례 */
  store: string[];
};

/** tbs 문자열 — 아래 칸 자신의 값을 `|` 로 잇는다. */
export function toBeSigned(c: CertificateEntry): string {
  if (c.issuer === undefined) throw new Error(`certificate-chain: ${c.id} 에 issuer 가 없다`);
  return `${c.subject}|${c.issuer}|${String(c.n)}|${String(c.e)}`;
}

/** 장난감 요약 — 글자 코드값 합 mod n. */
export function toyDigest(tbs: string, n: number): number {
  let sum = 0;
  for (const ch of tbs) {
    const code = ch.codePointAt(0);
    if (code === undefined) throw new Error('certificate-chain: 코드값을 읽지 못했다');
    sum += code;
  }
  return sum % n;
}

/** base ^ exp mod m — 곱할 때마다 줄인다 (이 수들은 2^53 안쪽). */
export function modPow(base: number, exp: number, m: number): number {
  if (!Number.isInteger(base) || !Number.isInteger(exp) || !Number.isInteger(m) || m <= 1 || exp < 0) {
    throw new Error(`certificate-chain: 셈할 수 없는 거듭제곱 ${String(base)}^${String(exp)} mod ${String(m)}`);
  }
  let result = 1;
  let b = base % m;
  let k = exp;
  while (k > 0) {
    if (k % 2 === 1) result = (result * b) % m;
    b = (b * b) % m;
    k = Math.floor(k / 2);
  }
  return result;
}

export async function certificateChain(ctx0: FacetContext<CertificateChainFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<CertificateChainFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  const byId = new Map<string, CertificateEntry>();
  for (const c of data.certs) byId.set(c.id, c);
  const cert = (id: string): CertificateEntry => {
    const c = byId.get(id);
    if (c === undefined) throw new Error(`certificate-chain: 인증서 ${id} 가 데이터에 없다`);
    return c;
  };
  const leafId = data.bundle[0];
  if (leafId === undefined) throw new Error('certificate-chain: 꾸러미가 비었다');

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 앞 — 서버 쪽 꾸러미와 클라이언트 쪽 저장소를 읽을 틈
  if (!(await pause())) return;
  await ctx.emit({ type: 'receive', payload: { bundle: [...data.bundle] } });
  if (!(await pause())) return;

  const chain: string[] = [leafId];
  let cur = cert(leafId);
  for (;;) {
    if (ctx.cancelled) return;
    const issuer = cur.issuer;
    if (issuer === undefined) throw new Error(`certificate-chain: ${cur.id} 에 issuer 가 없다`);

    // 찾기 — 꾸러미 먼저(사슬에 든 것 제외), 없으면 저장소
    const looked: string[] = [];
    let found: CertificateEntry | null = null;
    let where: 'bundle' | 'store' | null = null;
    for (const id of data.bundle) {
      if (chain.includes(id)) continue;
      looked.push(id);
      if (cert(id).subject === issuer) {
        found = cert(id);
        where = 'bundle';
        break;
      }
    }
    if (found === null) {
      for (const id of data.store) {
        looked.push(id);
        if (cert(id).subject === issuer) {
          found = cert(id);
          where = 'store';
          break;
        }
      }
    }
    if (found === null || where === null) {
      throw new Error(`certificate-chain: 발급자 ${issuer} 를 꾸러미에서도 저장소에서도 찾지 못했다`);
    }
    await ctx.emit({
      type: 'find',
      payload: { from: cur.id, issuer, to: found.id, where, looked },
    });
    if (!(await pause())) return;

    // 서명 확인 — 찾은 칸의 공개 열쇠로 아래 칸의 서명을 푼다
    if (cur.sig === undefined) throw new Error(`certificate-chain: ${cur.id} 에 서명이 없다`);
    const digest = toyDigest(toBeSigned(cur), found.n);
    const recovered = modPow(cur.sig, found.e, found.n);
    const ok = recovered === digest;
    await ctx.emit({
      type: 'verify',
      payload: { lower: cur.id, upper: found.id, digest, recovered, ok },
    });
    if (!(await pause())) return;
    if (!ok) return;

    chain.push(found.id);
    if (where === 'store') {
      await ctx.emit({ type: 'anchor', payload: { root: found.id, chain: [...chain] } });
      await pause();
      return;
    }
    cur = found;
  }
}
