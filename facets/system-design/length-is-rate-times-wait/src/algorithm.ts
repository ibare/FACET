/**
 * length-is-rate-times-wait — 리틀의 법칙 조각의 알고리즘.
 *
 * 서버 하나가 먼저 온 차례(FIFO)로 요청을 처리한다. 요청마다 처리 시작 · 떠남 · 머묾을
 * 온 차례로 셈해 머묾의 합에 보태고, 끝에 같은 합을 두 번 나눈다 — 요청 수로 나누면
 * 평균 머묾 W, 관측 시간으로 나누면 평균 줄 길이 L. 들어오는 빠르기 λ = 요청 수 / 관측 시간.
 *
 * 이벤트 (발신 차례):
 *   init (silent: true)
 *     payload: { maxStay: number, maxInSystem: number, sum: number }
 *       maxStay      가장 긴 머묾 (초). 요청마다 쌓는 칸의 높이 상한
 *       maxInSystem  한 시각에 시스템 안에 있던 가장 많은 요청 수. 시각마다 쌓는 칸의 높이 상한
 *       sum          머묾의 합의 출발값 (0)
 *   stay (걸음 1..n, 요청 온 차례)
 *     payload: { id: string, start: number, leave: number, stay: number, sum: number }
 *       start  처리 시작 = max(도착, 앞 요청의 떠남)
 *       leave  떠남 = start + 처리 시간
 *       stay   머묾 = leave − 도착 (기다림 + 처리)
 *       sum    이 요청을 보탠 뒤 머묾의 합
 *   balance (마지막 걸음)
 *     payload: { count: number, window: number, sum: number, area: number,
 *                columns: string[][], rate: number, meanStay: number,
 *                meanLength: number, product: number }
 *       columns    시각 0..window−1 마다 시스템 안(도착 ≤ 시각 < 떠남)에 있던 요청 식별자, 온 차례
 *       area       columns 길이의 합 (시각마다 센 시스템 안 요청 수의 합)
 *       rate       λ = count / window
 *       meanStay   W = sum / count
 *       meanLength L = area / window
 *       product    λ × W
 *
 * 자료가 어긋나면(도착이 뒤로 가는 차례 · 관측 구간을 넘는 떠남 · 두 합의 불일치) 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type QueueRequest = { id: string; arrive: number; service: number };

export type LengthIsRateTimesWaitFacetData = {
  type: 'length-is-rate-times-wait';
  /** 관측 구간 [0, window) 초 */
  window: number;
  requests: QueueRequest[];
  stepMs: number;
};

function fail(path: string, why: string): never {
  throw new Error(`length-is-rate-times-wait: ${path} — ${why}`);
}

function wholeAt(value: unknown, path: string, min: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    fail(path, `정수 ${min} 이상이어야 한다 (받은 값 ${String(value)})`);
  }
  return value;
}

/** 좁히개 — 알고리즘 · 장면 · 그림이 같은 것을 부른다. 값을 베껴 돌려준다. */
export function narrowLengthIsRateTimesWait(raw: unknown): LengthIsRateTimesWaitFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData', '객체가 아니다');
  const rec = raw as Record<string, unknown>;
  if (rec.type !== 'length-is-rate-times-wait') fail('initialData.type', `알 수 없는 type ${String(rec.type)}`);
  const window = wholeAt(rec.window, 'initialData.window', 1);
  const stepMs = wholeAt(rec.stepMs, 'initialData.stepMs', 1);
  if (!Array.isArray(rec.requests) || rec.requests.length === 0) fail('initialData.requests', '요청이 없다');
  const seen = new Set<string>();
  let lastArrive = 0;
  const requests = rec.requests.map((item: unknown, i: number): QueueRequest => {
    const path = `initialData.requests[${i}]`;
    if (typeof item !== 'object' || item === null) fail(path, '객체가 아니다');
    const r = item as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id === '') fail(`${path}.id`, '식별자가 없다');
    if (seen.has(r.id)) fail(`${path}.id`, `식별자 ${r.id} 가 겹친다`);
    seen.add(r.id);
    const arrive = wholeAt(r.arrive, `${path}.arrive`, 0);
    if (arrive < lastArrive) fail(`${path}.arrive`, '온 차례가 도착 시각 순이 아니다');
    if (arrive >= window) fail(`${path}.arrive`, '관측 구간 밖에 도착한다');
    lastArrive = arrive;
    const service = wholeAt(r.service, `${path}.service`, 1);
    return { id: r.id, arrive, service };
  });
  return { type: 'length-is-rate-times-wait', window, requests, stepMs };
}

export type ScheduledRequest = QueueRequest & { start: number; leave: number; stay: number };

/** 먼저 온 차례로 처리 시작 · 떠남 · 머묾을 셈한다. */
export function scheduleRequests(data: LengthIsRateTimesWaitFacetData): ScheduledRequest[] {
  let free = 0;
  return data.requests.map((r, i) => {
    const start = Math.max(r.arrive, free);
    const leave = start + r.service;
    if (leave > data.window) {
      fail(`initialData.requests[${i}]`, `떠남 ${leave} 이 관측 구간 ${data.window} 을 넘는다 — 끝에 시스템이 비지 않는다`);
    }
    free = leave;
    return { ...r, start, leave, stay: leave - r.arrive };
  });
}

export async function lengthIsRateTimesWait(ctxBase: FacetContext<LengthIsRateTimesWaitFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<LengthIsRateTimesWaitFacetData>;
  const data = narrowLengthIsRateTimesWait(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const scheduled = scheduleRequests(data);

  // 시각마다 시스템 안에 있던 요청 — 반열린 구간 [도착, 떠남)
  const columns: string[][] = [];
  for (let sec = 0; sec < data.window; sec += 1) {
    if (ctx.cancelled) return;
    columns.push(scheduled.filter((r) => r.arrive <= sec && sec < r.leave).map((r) => r.id));
  }
  const maxInSystem = Math.max(...columns.map((c) => c.length));
  const maxStay = Math.max(...scheduled.map((r) => r.stay));

  await ctx.emit({ type: 'init', silent: true, payload: { maxStay, maxInSystem, sum: 0 } });

  let sum = 0;
  for (const r of scheduled) {
    // 걸음 0(도착 · 처리 시간)에도 읽을 틈을 두고, 걸음마다 머문다
    if (!(await pause())) return;
    sum += r.stay;
    await ctx.emit({
      type: 'stay',
      target: `queue:${r.id}`,
      payload: { id: r.id, start: r.start, leave: r.leave, stay: r.stay, sum },
    });
  }

  if (!(await pause())) return;
  const count = scheduled.length;
  const area = columns.reduce((acc, c) => acc + c.length, 0);
  if (area !== sum) fail('balance', `시각마다 센 합 ${area} 과 머묾의 합 ${sum} 이 다르다`);
  const rate = count / data.window;
  const meanStay = sum / count;
  const meanLength = area / data.window;
  await ctx.emit({
    type: 'balance',
    payload: {
      count,
      window: data.window,
      sum,
      area,
      columns,
      rate,
      meanStay,
      meanLength,
      product: rate * meanStay,
    },
  });
}
