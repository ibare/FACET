/**
 * 느슨한 결합 — 받는 쪽이 늘고 줄 때 보내는 쪽이 아는 것.
 *
 * 브로커는 토픽 하나의 지금 구독자 목록만 든다. 사건 열을 차례대로 한 걸음씩 돈다.
 * 발행된 **순간의** 구독자에게만 사본이 간다 (보존 없음 · 되읽기 없음). 구독자가 없으면
 * 메시지는 버려진다. 보내는 쪽이 아는 것은 토픽 이름뿐이고, 걸음마다 그 목록을 셈해 싣는다.
 *
 * 이벤트 (전부 algorithm 이 셈한 값):
 *   init     (silent) { known: string[]; subscribers: string[]; inbox: { id: string; got: number[] }[]; publishTotal: number }
 *            — 보내는 쪽이 아는 것 · 처음 구독자 목록 · 구독자 후보마다 받은 사본 · 사건 열의 발행 수
 *   publish  { nth: number; value: number; known: string[]; reached: string[] }
 *            — nth 번째 발행. reached 는 발행 순간의 구독자(가입 차례). 비면 버려진 것
 *   join     { id: string; subscribers: string[] }   — 가입 뒤 구독자 목록
 *   leave    { id: string; subscribers: string[] }   — 탈퇴 뒤 구독자 목록
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DecoupleEvent =
  | { kind: 'publish'; value: number }
  | { kind: 'join'; id: string }
  | { kind: 'leave'; id: string };

export type DecoupleSenderReceiverFacetData = {
  type: 'decouple-sender-receiver';
  topic: string;
  candidates: string[];
  events: DecoupleEvent[];
  stepMs: number;
};

function fail(path: string, why: string): never {
  throw new Error(`decouple-sender-receiver: ${path} — ${why}`);
}

/** 모양을 검사하고 어긋나면 던지는 좁히개. 알고리즘과 장면이 함께 쓴다. */
export function narrowDecoupleData(raw: unknown): DecoupleSenderReceiverFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData', '객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'decouple-sender-receiver') fail('initialData.type', `모르는 값 ${String(r.type)}`);
  if (typeof r.topic !== 'string' || r.topic === '') fail('initialData.topic', '비었거나 문자열이 아니다');
  if (typeof r.stepMs !== 'number' || !(r.stepMs > 0)) fail('initialData.stepMs', '양수가 아니다');
  if (!Array.isArray(r.candidates) || r.candidates.length === 0) fail('initialData.candidates', '비었거나 배열이 아니다');
  const candidates: string[] = [];
  r.candidates.forEach((c, i) => {
    if (typeof c !== 'string' || c === '') fail(`initialData.candidates[${i}]`, '식별자가 아니다');
    if (candidates.includes(c)) fail(`initialData.candidates[${i}]`, `겹친 식별자 ${c}`);
    candidates.push(c);
  });
  if (!Array.isArray(r.events) || r.events.length === 0) fail('initialData.events', '비었거나 배열이 아니다');
  const events: DecoupleEvent[] = r.events.map((e, i): DecoupleEvent => {
    const path = `initialData.events[${i}]`;
    if (typeof e !== 'object' || e === null) fail(path, '객체가 아니다');
    const ev = e as Record<string, unknown>;
    if (ev.kind === 'publish') {
      if (typeof ev.value !== 'number' || !Number.isFinite(ev.value)) fail(`${path}.value`, '수가 아니다');
      return { kind: 'publish', value: ev.value };
    }
    if (ev.kind === 'join' || ev.kind === 'leave') {
      if (typeof ev.id !== 'string' || !candidates.includes(ev.id)) fail(`${path}.id`, `후보에 없는 구독자 ${String(ev.id)}`);
      return ev.kind === 'join' ? { kind: 'join', id: ev.id } : { kind: 'leave', id: ev.id };
    }
    return fail(`${path}.kind`, `모르는 사건 ${String(ev.kind)}`);
  });
  return { type: 'decouple-sender-receiver', topic: r.topic, candidates, events, stepMs: r.stepMs };
}

export async function decoupleSenderReceiver(
  context: FacetContext<DecoupleSenderReceiverFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<DecoupleSenderReceiverFacetData>;
  const data = narrowDecoupleData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 보내는 쪽 — 아는 것은 토픽 이름 하나. 구독자 목록은 브로커만 든다.
  const known: string[] = [data.topic];
  const subscribers: string[] = [];
  const inbox = new Map<string, number[]>(data.candidates.map((id) => [id, []]));
  const publishTotal = data.events.filter((e) => e.kind === 'publish').length;

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      known: [...known],
      subscribers: [...subscribers],
      inbox: data.candidates.map((id) => ({ id, got: [] as number[] })),
      publishTotal,
    },
  });

  let nth = 0;
  for (const ev of data.events) {
    // 걸음 0 이 이미 읽을 것(보내는 쪽 · 토픽 · 후보)을 보이므로 첫 사건 앞에도 머문다
    if (!(await pause())) return;
    if (ev.kind === 'publish') {
      if (!known.includes(data.topic)) throw new Error('decouple-sender-receiver: 보내는 쪽이 토픽을 모른다');
      nth += 1;
      const reached = [...subscribers];
      for (const id of reached) {
        const got = inbox.get(id);
        if (!got) throw new Error(`decouple-sender-receiver: 받은 칸이 없는 구독자 ${id}`);
        got.push(ev.value);
      }
      await ctx.emit({ type: 'publish', payload: { nth, value: ev.value, known: [...known], reached } });
    } else if (ev.kind === 'join') {
      if (subscribers.includes(ev.id)) throw new Error(`decouple-sender-receiver: 이미 구독 ${ev.id}`);
      subscribers.push(ev.id);
      await ctx.emit({ type: 'join', payload: { id: ev.id, subscribers: [...subscribers] } });
    } else {
      const at = subscribers.indexOf(ev.id);
      if (at < 0) throw new Error(`decouple-sender-receiver: 구독 안 한 탈퇴 ${ev.id}`);
      subscribers.splice(at, 1);
      await ctx.emit({ type: 'leave', payload: { id: ev.id, subscribers: [...subscribers] } });
    }
  }
}
