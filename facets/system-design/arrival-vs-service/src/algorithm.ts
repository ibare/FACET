/**
 * arrival-vs-service — 들어오는 쪽이 빠르면 줄이 는다.
 *
 * 서버 하나가 먼저 온 차례(FIFO)로 요청을 하나씩 처리한다. 시각의 단위는 초이고
 * 정수 초에만 일이 일어난다. 걸음 하나 = 1 초 (걸음 k = 시각 k).
 *
 * 같은 시각의 차례:
 *   (1) 처리가 끝난 요청이 떠난다
 *   (2) 그 시각에 도착한 요청이 데이터 차례대로 줄 끝에 선다
 *   (3) 서버가 비었으면 줄 머리가 처리에 들어간다
 *
 * 줄 = 기다리는 요청 (처리 중인 하나는 세지 않는다).
 * 재생은 시각 0 부터 마지막 요청이 도착한 시각까지.
 *
 * 이벤트
 *   tick   시각 하나에 일어난 일.
 *          payload {
 *            sec: number            — 시각 (초)
 *            left: string | null    — 처리를 마치고 떠난 요청 식별자
 *            came: string[]         — 줄 끝에 선 요청 식별자 (데이터 차례)
 *            started: string | null — 처리에 들어간 요청 식별자
 *            arrived: number        — 지금까지 들어온 수
 *            departed: number       — 지금까지 나간 수
 *          }
 *          시각 0 의 tick 은 silent — 걸음 0 을 갈아 끼운다 (걸음 0 = 시각 0).
 *          시각 1 부터는 silent 가 아니다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ArrivalRequest = { id: string; arriveAt: number };

export type ArrivalVsServiceFacetData = {
  type: 'arrival-vs-service';
  stepMs: number;
  /** 요청 하나를 처리하는 데 드는 초 */
  serviceSec: number;
  /** 도착 차례대로. 식별자는 번역하지 않는 자료다 */
  requests: ArrivalRequest[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function naturalInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`arrival-vs-service: ${path} 는 0 이상의 정수여야 한다 (받은 값 ${String(v)})`);
  }
  return v;
}

/** 자료의 모양을 검사하고 어긋나면 던진다. 알고리즘과 장면이 함께 부른다. */
export function readArrivalVsService(data: unknown): ArrivalVsServiceFacetData {
  if (!isRecord(data)) throw new Error('arrival-vs-service: 자료가 객체가 아니다');
  if (data.type !== 'arrival-vs-service') {
    throw new Error(`arrival-vs-service: type 이 다르다 (${String(data.type)})`);
  }
  const stepMs = data.stepMs;
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs <= 0) {
    throw new Error('arrival-vs-service: stepMs 는 양수여야 한다');
  }
  const serviceSec = naturalInt(data.serviceSec, 'serviceSec');
  if (serviceSec === 0) throw new Error('arrival-vs-service: serviceSec 는 1 이상이어야 한다');
  if (!Array.isArray(data.requests) || data.requests.length === 0) {
    throw new Error('arrival-vs-service: requests 는 비지 않은 배열이어야 한다');
  }
  const seen = new Set<string>();
  const requests: ArrivalRequest[] = data.requests.map((r: unknown, i: number) => {
    if (!isRecord(r)) throw new Error(`arrival-vs-service: requests[${i}] 가 객체가 아니다`);
    if (typeof r.id !== 'string' || r.id === '') {
      throw new Error(`arrival-vs-service: requests[${i}].id 가 비었다`);
    }
    if (seen.has(r.id)) throw new Error(`arrival-vs-service: requests[${i}].id 가 겹친다 (${r.id})`);
    seen.add(r.id);
    return { id: r.id, arriveAt: naturalInt(r.arriveAt, `requests[${i}].arriveAt`) };
  });
  for (let i = 1; i < requests.length; i += 1) {
    if (requests[i].arriveAt < requests[i - 1].arriveAt) {
      throw new Error(`arrival-vs-service: requests[${i}].arriveAt 가 앞 요청보다 이르다`);
    }
  }
  return { type: 'arrival-vs-service', stepMs, serviceSec, requests };
}

/** 재생의 마지막 시각 — 마지막 요청이 도착한 초. 바탕에서 정해지는 셈이라 장면·그림도 부른다. */
export function lastSecOf(data: ArrivalVsServiceFacetData): number {
  return data.requests[data.requests.length - 1].arriveAt;
}

export async function arrivalVsService(
  context: FacetContext<ArrivalVsServiceFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<ArrivalVsServiceFacetData>;
  const data = readArrivalVsService(ctx.data);
  const stepMs = data.stepMs;
  const lastSec = lastSecOf(data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const waiting: string[] = [];
  let serving: { id: string; until: number } | null = null;
  let arrived = 0;
  let departed = 0;
  let next = 0;

  /** 한 시각에 일어나는 일을 차례대로 셈한다. */
  function advance(sec: number) {
    // (1) 처리가 끝난 요청이 떠난다
    let left: string | null = null;
    if (serving !== null && serving.until === sec) {
      left = serving.id;
      serving = null;
      departed += 1;
    }
    // (2) 이 시각에 온 요청이 데이터 차례대로 줄 끝에 선다
    const came: string[] = [];
    while (next < data.requests.length && data.requests[next].arriveAt === sec) {
      const id = data.requests[next].id;
      waiting.push(id);
      came.push(id);
      arrived += 1;
      next += 1;
    }
    // (3) 서버가 비었으면 줄 머리가 처리에 들어간다
    let started: string | null = null;
    if (serving === null && waiting.length > 0) {
      const head = waiting.shift();
      if (head === undefined) throw new Error('arrival-vs-service: 줄 머리가 없다');
      serving = { id: head, until: sec + data.serviceSec };
      started = head;
    }
    return { sec, left, came, started, arrived, departed };
  }

  // 걸음 0 = 시각 0. 문 없이 곧바로 세운다
  await ctx.emit({ type: 'tick', payload: advance(0), silent: true });

  for (let sec = 1; sec <= lastSec; sec += 1) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'tick', payload: advance(sec) });
  }
}
