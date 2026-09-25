/**
 * 베어러 토큰 — 문은 표만 본다.
 *
 * 사건을 적힌 차례대로 하나씩 밟는다. 한 사건 = 한 걸음.
 *
 * 규약 (사양 그대로):
 * - 시각은 발급 시점을 0 으로 둔 초. 시계는 모두 같다고 둔다.
 * - 문의 판정 `judge(token, ledger, nowSec)` 는 **토큰 하나만** 요청에서 받는다.
 *   보낸 쪽 주소 · 역할은 인자에 두지 않는다.
 *   발급 기록에 없으면 401(unknown), 있고 nowSec ≥ 만료면 401(expired), 아니면 200.
 * - 요청하는 쪽이 들지 않은 토큰을 내면 던진다. 발급 기록에 없는 토큰을 발급하려 해도 던진다.
 * - 유출은 어떻게 샜는지 말하지 않는다 — 사본이 넘어갔다는 것만. 넘긴 쪽도 그대로 든다.
 *
 * 이벤트 (모두 silent 아님 — 사건 하나가 걸음 하나):
 * - `issue`   { at: number; to: HolderId; token: string; expiresAt: number }
 *             발급 서버가 토큰을 to 의 손에 건넨다.
 * - `leak`    { at: number; from: HolderId; to: HolderId; token: string; holders: number }
 *             from 의 토큰 사본이 to 에게 넘어간다. holders = 이제 토큰을 든 쪽의 수.
 * - `request` { at: number; from: HolderId; token: string; status: 200 | 401;
 *               reason: 'valid' | 'expired' | 'unknown'; left: number }
 *             from 이 토큰을 실어 요청하고 문이 판정한다. left = 만료 − at (초, 지났으면 음수).
 *             unknown 이면 left 는 0 이다 (기록이 없어 셈할 만료가 없다).
 *
 * init 이벤트는 없다 — 걸음 0(네 역할 · 빈 손)은 장면의 initial() 이 initialData 에서 세운다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HolderId = 'app' | 'attacker';

export type LedgerEntry = {
  token: string;
  subject: string;
  issuedAt: number;
  expiresAt: number;
};

export type BearerEvent =
  | { at: number; kind: 'issue'; token: string; to: HolderId }
  | { at: number; kind: 'leak'; from: HolderId; to: HolderId }
  | { at: number; kind: 'request'; from: HolderId; token: string };

export type TokenBearerFacetData = {
  type: 'token-bearer';
  stepMs: number;
  /** api 가 가진 발급 기록. */
  ledger: LedgerEntry[];
  /** 보낸 쪽 주소 — 화면에만 뜨고 판정에는 들어가지 않는다. */
  addresses: Record<HolderId, string>;
  /** 요청 줄과 인증 머리의 앞부분 — 프로토콜 글자 그대로. */
  requestLine: string;
  authPrefix: string;
  events: BearerEvent[];
};

export type Verdict = {
  status: 200 | 401;
  reason: 'valid' | 'expired' | 'unknown';
  left: number;
};

/** 문의 판정. 요청에서 받는 것은 토큰 하나뿐이다. */
export function judge(token: string, ledger: readonly LedgerEntry[], nowSec: number): Verdict {
  const rec = ledger.find((e) => e.token === token);
  if (rec === undefined) return { status: 401, reason: 'unknown', left: 0 };
  const left = rec.expiresAt - nowSec;
  if (nowSec >= rec.expiresAt) return { status: 401, reason: 'expired', left };
  return { status: 200, reason: 'valid', left };
}

export async function tokenBearer(context: FacetContext<TokenBearerFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<TokenBearerFacetData>;
  const { stepMs, ledger, events } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 누가 무엇을 들고 있는가. 삽입 차례가 곧 든 차례다.
  const held = new Map<HolderId, string>();

  for (const ev of events) {
    // 걸음 0 이 이미 네 역할을 보이므로 첫 사건 앞에도 읽을 틈을 둔다.
    if (!(await pause())) return;

    if (ev.kind === 'issue') {
      const rec = ledger.find((e) => e.token === ev.token);
      if (rec === undefined) throw new Error(`발급 기록에 없는 토큰을 발급한다 (t=${ev.at})`);
      held.set(ev.to, ev.token);
      await ctx.emit({
        type: 'issue',
        payload: { at: ev.at, to: ev.to, token: ev.token, expiresAt: rec.expiresAt },
      });
    } else if (ev.kind === 'leak') {
      const tok = held.get(ev.from);
      if (tok === undefined) throw new Error(`${ev.from} 는 넘길 토큰을 들고 있지 않다 (t=${ev.at})`);
      held.set(ev.to, tok);
      await ctx.emit({
        type: 'leak',
        payload: { at: ev.at, from: ev.from, to: ev.to, token: tok, holders: held.size },
      });
    } else if (ev.kind === 'request') {
      if (held.get(ev.from) !== ev.token) {
        throw new Error(`${ev.from} 가 들지 않은 토큰을 낸다 (t=${ev.at})`);
      }
      const verdict = judge(ev.token, ledger, ev.at);
      await ctx.emit({
        type: 'request',
        payload: {
          at: ev.at,
          from: ev.from,
          token: ev.token,
          status: verdict.status,
          reason: verdict.reason,
          left: verdict.left,
        },
      });
    } else {
      const unknown: never = ev;
      throw new Error(`모르는 사건: ${JSON.stringify(unknown)}`);
    }
  }
}
