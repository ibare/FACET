/**
 * publish-to-many — 한 번 보낸 메시지가 구독자 수만큼 사본으로 갈라진다.
 *
 * 모형: 브로커는 토픽 하나와 지금 구독자 목록(가입 차례)만 든다. 보존 · 되읽기 · 확인 응답 없음.
 * 메시지 하나에 걸음 둘 — (가) 보내는 쪽 → 토픽 (보낸 수 +1)
 *                          (나) 토픽 → 지금 구독자 전부에게 사본 하나씩 (사본 +구독자 수).
 * 시각은 셈하지 않는다. 한 걸음 = 사건 하나.
 *
 * 이벤트
 * - `init`   (silent) { sent: number; copies: number }
 *     셈의 출발점. 보낸 수와 받은 사본 수의 처음 값.
 * - `send`   { message: number; sent: number }
 *     보내는 쪽이 메시지 하나를 토픽으로 보냈다. `sent` 는 보낸 뒤의 보내기 횟수.
 * - `fanOut` { message: number; to: string[]; copies: number }
 *     토픽이 그 순간의 구독자 전부에게 사본을 넣었다. `to` 는 받은 구독자 식별자(가입 차례),
 *     `copies` 는 넣은 뒤 구독자들이 받은 사본의 합.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PublishToManyFacetData = {
  type: 'publish-to-many';
  /** 토픽 이름 — 번역하지 않는 자료 */
  topic: string;
  /** 구독자 식별자. 가입 차례 */
  subscribers: string[];
  /** 보낼 메시지(주문 번호). 보내는 차례 */
  messages: number[];
  stepMs: number;
};

/** 자료의 모양을 검사하고 어긋나면 던진다. 장면 · 그림이 같은 좁히개를 쓴다. */
export function narrowPublishToManyData(raw: unknown): PublishToManyFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('publish-to-many: 자료가 객체가 아니다');
  }
  const d = raw as Record<string, unknown>;
  if (d.type !== 'publish-to-many') {
    throw new Error(`publish-to-many: type 이 publish-to-many 가 아니다 (${String(d.type)})`);
  }
  if (typeof d.topic !== 'string' || d.topic === '') {
    throw new Error('publish-to-many: topic 이 빈 문자열이거나 문자열이 아니다');
  }
  if (!Array.isArray(d.subscribers) || d.subscribers.length === 0) {
    throw new Error('publish-to-many: subscribers 가 비었거나 배열이 아니다');
  }
  const subscribers: string[] = [];
  d.subscribers.forEach((s, i) => {
    if (typeof s !== 'string' || s === '') {
      throw new Error(`publish-to-many: subscribers[${i}] 가 식별자가 아니다`);
    }
    if (subscribers.includes(s)) {
      throw new Error(`publish-to-many: subscribers[${i}] 가 겹친다 (${s})`);
    }
    subscribers.push(s);
  });
  if (!Array.isArray(d.messages) || d.messages.length === 0) {
    throw new Error('publish-to-many: messages 가 비었거나 배열이 아니다');
  }
  const messages: number[] = [];
  d.messages.forEach((m, i) => {
    if (typeof m !== 'number' || !Number.isInteger(m)) {
      throw new Error(`publish-to-many: messages[${i}] 가 정수가 아니다`);
    }
    if (messages.includes(m)) {
      throw new Error(`publish-to-many: messages[${i}] 가 겹친다 (${m})`);
    }
    messages.push(m);
  });
  if (typeof d.stepMs !== 'number' || !(d.stepMs > 0)) {
    throw new Error('publish-to-many: stepMs 가 양수가 아니다');
  }
  return { type: 'publish-to-many', topic: d.topic, subscribers, messages, stepMs: d.stepMs };
}

export async function publishToMany(
  context: FacetContext<PublishToManyFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<PublishToManyFacetData>;
  const data = narrowPublishToManyData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 브로커: 지금 구독자 목록 (처음부터 모두 가입해 있다)
  const subscribed: string[] = [...data.subscribers];
  let sent = 0;
  let copies = 0;

  await ctx.emit({ type: 'init', payload: { sent, copies }, silent: true });

  for (const message of data.messages) {
    // 걸음 0 은 토픽과 구독자가 이미 보이는 화면이라 첫 보내기 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    sent += 1;
    await ctx.emit({ type: 'send', payload: { message, sent } });

    if (!(await pause())) return;
    // 발행된 순간의 구독자에게만 사본이 간다
    const to = [...subscribed];
    copies += to.length;
    await ctx.emit({ type: 'fanOut', payload: { message, to, copies } });
  }
}
