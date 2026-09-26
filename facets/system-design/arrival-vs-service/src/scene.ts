/**
 * arrival-vs-service 의 장면.
 *
 * 바탕 — 요청 목록 · 마지막 시각 (initialData 에서 베낀다)
 * 자취 — 기다리는 줄 · 처리 중 · 떠난 요청 · 시각마다의 들어옴/나감 셈
 * 이번 걸음 — 이 시각에 떠난 · 선 · 처리에 들어간 요청
 *
 * 셈은 알고리즘이 한다. 장면은 tick 을 잇고, 앞 장면과 어긋나면 던진다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { lastSecOf, readArrivalVsService } from './algorithm.js';

export type ArrivalVsServiceStep = {
  sec: number;
  left: string | null;
  came: string[];
  started: string | null;
};

export type CountAt = { sec: number; arrived: number; departed: number };

export type ArrivalVsServiceScene = {
  /** 바탕 */
  requestIds: string[];
  arriveAt: Record<string, number>;
  lastSec: number;
  /** 자취 */
  waiting: string[];
  serving: string | null;
  gone: string[];
  counts: CountAt[];
  /** 이번 걸음 (tick 전이면 null) */
  step: ArrivalVsServiceStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(path: string, msg: string): never {
  throw new Error(`arrival-vs-service scene: ${path} — ${msg}`);
}

function readInt(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(`payload.${key}`, '0 이상의 정수가 아니다');
  return v;
}

function readIdOrNull(p: Record<string, unknown>, key: string): string | null {
  const v = p[key];
  if (v === null) return null;
  if (typeof v !== 'string' || v === '') fail(`payload.${key}`, '식별자 또는 null 이 아니다');
  return v;
}

function reduceTick(scene: ArrivalVsServiceScene, payload: unknown): ArrivalVsServiceScene {
  if (!isRecord(payload)) fail('payload', '객체가 아니다');
  const p = payload;
  const sec = readInt(p, 'sec');
  const expectedSec = scene.step === null ? 0 : scene.step.sec + 1;
  if (sec !== expectedSec) fail('payload.sec', `${expectedSec} 이어야 하는데 ${sec}`);
  if (sec > scene.lastSec) fail('payload.sec', `마지막 시각 ${scene.lastSec} 을 넘는다`);

  const left = readIdOrNull(p, 'left');
  const started = readIdOrNull(p, 'started');
  const cameRaw = p.came;
  if (!Array.isArray(cameRaw)) fail('payload.came', '배열이 아니다');
  const came = cameRaw.map((c: unknown, i: number) => {
    if (typeof c !== 'string') fail(`payload.came[${i}]`, '식별자가 아니다');
    return c;
  });
  const arrived = readInt(p, 'arrived');
  const departed = readInt(p, 'departed');

  const prevCount = scene.counts.length > 0 ? scene.counts[scene.counts.length - 1] : null;
  const prevArrived = prevCount === null ? 0 : prevCount.arrived;
  const prevDeparted = prevCount === null ? 0 : prevCount.departed;

  // (1) 떠남 — 처리 중이던 요청이어야 한다
  let serving = scene.serving;
  const gone = [...scene.gone];
  if (left !== null) {
    if (serving !== left) fail('payload.left', `처리 중인 것은 ${String(serving)} 인데 ${left} 가 떠난다`);
    gone.push(left);
    serving = null;
  }
  if (departed !== prevDeparted + (left === null ? 0 : 1)) {
    fail('payload.departed', `앞 셈 ${prevDeparted} 과 떠남이 맞지 않는다`);
  }

  // (2) 도착 — 바탕에 있고 이 시각에 오는 요청이어야 한다
  const waiting = [...scene.waiting];
  for (const [i, id] of came.entries()) {
    const at = scene.arriveAt[id];
    if (at === undefined) fail(`payload.came[${i}]`, `바탕에 없는 요청 ${id}`);
    if (at !== sec) fail(`payload.came[${i}]`, `${id} 의 도착 시각은 ${at}`);
    waiting.push(id);
  }
  if (arrived !== prevArrived + came.length) {
    fail('payload.arrived', `앞 셈 ${prevArrived} 과 도착이 맞지 않는다`);
  }

  // (3) 처리 시작 — 빈 서버에 줄 머리가 들어간다
  if (started !== null) {
    if (serving !== null) fail('payload.started', `서버에 ${serving} 가 아직 있다`);
    if (waiting[0] !== started) fail('payload.started', `줄 머리는 ${String(waiting[0])} 인데 ${started}`);
    waiting.shift();
    serving = started;
  }

  return {
    requestIds: scene.requestIds,
    arriveAt: scene.arriveAt,
    lastSec: scene.lastSec,
    waiting,
    serving,
    gone,
    counts: [...scene.counts, { sec, arrived, departed }],
    step: { sec, left, came, started },
  };
}

export const arrivalVsServiceScene: ScenePlan<ArrivalVsServiceScene> = {
  initial(initialData: unknown): ArrivalVsServiceScene {
    const data = readArrivalVsService(initialData);
    const arriveAt: Record<string, number> = {};
    for (const r of data.requests) arriveAt[r.id] = r.arriveAt;
    return {
      requestIds: data.requests.map((r) => r.id),
      arriveAt,
      lastSec: lastSecOf(data),
      waiting: [],
      serving: null,
      gone: [],
      counts: [],
      step: null,
    };
  },
  reduce(scene: ArrivalVsServiceScene, event: FacetRuntimeEvent): ArrivalVsServiceScene {
    switch (event.type) {
      case 'tick':
        return reduceTick(scene, event.payload);
      default:
        throw new Error(`arrival-vs-service scene: 모르는 이벤트 ${event.type}`);
    }
  },
};
