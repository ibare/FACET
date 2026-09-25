/**
 * store-and-forward — 저장 후 전달.
 *
 * 메일은 한 번에 한 곳이 맡는다. 다음 곳이 `250` 으로 받았다고 말하기 전에는 지금 맡은 곳이
 * 지우지 않는다. 받는 서버가 연결을 받지 않으면 메일은 보내는 서버의 대기열에 머물렀다가
 * 정해진 기다림 뒤에 다시 넘어가 본다.
 *
 * 모형 (실제 SMTP 를 줄인 자리 — 설명 글이 밝힌다):
 *   - 시각은 분 단위 정수. 메시지는 보낸 순간 닿는다. 연결 실패는 받는 서버가 닫힌 구간에서만 일어난다
 *   - 제출은 곧바로 받아들여진다(`250`). 보내는 서버는 받은 그 시각에 첫 시도를 한다 — 같은 시각이면 제출이 먼저
 *   - 실패마다 기다림 목록의 다음 값만큼 뒤에 다시 해 본다. 목록이 다 떨어지면 던진다
 *   - 받는 서버가 받으면 곧 받는 사람의 우편함에 넣는다 — 우편함 전달(로컬 전달)은 따로 걸음을 두지 않는다
 *   - 우편함에서 꺼내 읽는 것(IMAP · POP)은 SMTP 가 아니다 — "받는 사람이 연다" 사건 하나로만 둔다
 *   - 기다림 값은 예로 정한 것이다. 실제 서버는 며칠까지 다시 해 본다
 *   - 한 걸음 = 사건 하나, 시각 차례. 같은 시각이면 아래 셈에서 생긴 차례
 *
 * 발신 이벤트 (전부 silent 아님. 각 하나가 한 걸음):
 *   submit          payload { t: number; from: 'sender'; to: 'relay' }
 *                   — 보내는 쪽이 보내는 서버에 넘기고 `250` 을 받았다. 맡는 곳이 바뀐다
 *   attempt-failed  payload { t: number; n: number; next: number }
 *                   — n 번째 시도가 연결 실패. 메일은 대기열에 남고 next 분에 다시 해 본다
 *   sender-left     payload { t: number }
 *                   — 보내는 쪽이 망을 떠났다
 *   delivered       payload { t: number; n: number; from: 'relay'; to: 'mx'; dwell: number }
 *                   — n 번째 시도가 `250`. 맡는 곳이 받는 서버의 우편함으로 바뀌고 대기열의 사본을 지운다.
 *                     dwell = 대기열에 머문 분
 *   mailbox-opened  payload { t: number; mails: number; offlineFor: number }
 *                   — 받는 사람이 우편함을 열었다. mails = 그때 우편함에 든 메일 수,
 *                     offlineFor = 그때까지 보내는 쪽이 떠나 있던 분
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface StoreAndForwardFacetData {
  type: 'store-and-forward';
  /** 걸음 뒤 머무는 ms (재생 속도 — 모형의 시각이 아니다) */
  stepMs: number;
  /** 보내는 쪽 (메일 주소) */
  sender: string;
  /** 보내는 서버 (호스트 이름) */
  relay: string;
  /** 받는 서버 (호스트 이름) */
  mx: string;
  /** 받는 사람의 우편함 (메일 주소) */
  mailbox: string;
  /** 넘겨받았다는 응답 (프로토콜 글자) */
  reply: string;
  /** 제출 시각 (분) */
  submitAt: number;
  /** 받는 서버가 연결을 받지 않는 구간 [from, until) (분) */
  mxClosedFrom: number;
  mxClosedUntil: number;
  /** 실패마다 차례로 쓰는 다시 해 보기 전 기다림 (분) */
  retryWaits: number[];
  /** 보내는 쪽이 망을 떠나는 시각 (분) */
  senderLeavesAt: number;
  /** 받는 사람이 우편함을 여는 시각 (분) */
  recipientOpensAt: number;
}

type Happening =
  | { kind: 'submit'; t: number }
  | { kind: 'fail'; t: number; n: number; next: number }
  | { kind: 'leave'; t: number }
  | { kind: 'deliver'; t: number; n: number; dwell: number }
  | { kind: 'open'; t: number };

function mustInt(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`store-and-forward: ${what} 가 0 이상의 정수가 아니다 (${String(v)})`);
  }
  return v;
}

/** 데이터에서 사건들을 셈한다. 시각 차례, 같은 시각이면 셈한 차례. */
function plan(data: StoreAndForwardFacetData): Happening[] {
  const submitAt = mustInt(data.submitAt, 'submitAt');
  const closedFrom = mustInt(data.mxClosedFrom, 'mxClosedFrom');
  const closedUntil = mustInt(data.mxClosedUntil, 'mxClosedUntil');
  const leavesAt = mustInt(data.senderLeavesAt, 'senderLeavesAt');
  const opensAt = mustInt(data.recipientOpensAt, 'recipientOpensAt');
  if (!Array.isArray(data.retryWaits)) throw new Error('store-and-forward: retryWaits 가 배열이 아니다');
  const waits = data.retryWaits.map((w, i) => mustInt(w, `retryWaits[${i}]`));
  if (leavesAt < submitAt) {
    // 제출 전에 떠나면 메일이 보내는 쪽과 함께 사라진다 — 이 조각의 모형 밖이다
    throw new Error(`store-and-forward: 보내는 쪽이 제출(${submitAt}) 전에 떠난다(${leavesAt})`);
  }
  if (opensAt < leavesAt) {
    throw new Error(`store-and-forward: 받는 사람이 보내는 쪽이 떠나기(${leavesAt}) 전에 연다(${opensAt})`);
  }

  const list: Happening[] = [{ kind: 'submit', t: submitAt }];
  let t = submitAt;
  let n = 0;
  for (;;) {
    if (n > waits.length) {
      throw new Error(`store-and-forward: 시도 ${n} 번이 다 실패했고 기다림 목록이 떨어졌다`);
    }
    n += 1;
    const accepts = !(closedFrom <= t && t < closedUntil);
    if (accepts) {
      list.push({ kind: 'deliver', t, n, dwell: t - submitAt });
      break;
    }
    const next = t + waits[n - 1];
    list.push({ kind: 'fail', t, n, next });
    t = next;
  }
  list.push({ kind: 'leave', t: leavesAt });
  list.push({ kind: 'open', t: opensAt });
  // 안정 정렬 — 같은 시각이면 위에서 넣은 차례 (제출 → 시도)
  return list
    .map((h, i) => ({ h, i }))
    .sort((a, b) => a.h.t - b.h.t || a.i - b.i)
    .map((x) => x.h);
}

export async function storeAndForward(ctx: FacetContext<StoreAndForwardFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<StoreAndForwardFacetData>;
  const data = ctx.data;
  const stepMs = mustInt(data.stepMs, 'stepMs');
  const happenings = plan(data);

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  let leftAt: number | null = null;
  let mails = 0;

  // 걸음 0 은 바탕(세 곳 · 시간 띠)이 이미 선 화면이라, 첫 사건 앞에도 읽을 틈을 둔다
  for (const h of happenings) {
    if (!(await pause())) return;
    switch (h.kind) {
      case 'submit':
        await ctx.emit({ type: 'submit', payload: { t: h.t, from: 'sender', to: 'relay' } });
        break;
      case 'fail':
        await ctx.emit({ type: 'attempt-failed', payload: { t: h.t, n: h.n, next: h.next } });
        break;
      case 'leave':
        leftAt = h.t;
        await ctx.emit({ type: 'sender-left', payload: { t: h.t } });
        break;
      case 'deliver':
        mails += 1;
        await ctx.emit({
          type: 'delivered',
          payload: { t: h.t, n: h.n, from: 'relay', to: 'mx', dwell: h.dwell },
        });
        break;
      case 'open': {
        if (leftAt === null) throw new Error('store-and-forward: 우편함을 열 때 보내는 쪽이 떠난 시각이 없다');
        await ctx.emit({
          type: 'mailbox-opened',
          payload: { t: h.t, mails, offlineFor: h.t - leftAt },
        });
        break;
      }
    }
  }
}
