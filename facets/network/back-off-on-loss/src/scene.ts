/**
 * back-off-on-loss 장면.
 *
 * 바탕 — 처음 창 · 중복 문턱 · 확인 글자 (initialData 에서 베낀다)
 * 자취 — 지금 창 · 문턱 · 보낸 조각 · 길 위의 조각 · 받은 조각 · 돌아온 확인 더미
 * 이번 걸음 — `step`. 흐르는 운동의 계기값(`was` · `thWas` · `cleared`)을 싣는다.
 *
 * 셈(확인 번호 · 중복 수 · 새 창)은 알고리즘이 한다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type BackOffArrival = { segment: number; ack: number; dup: number };

export type BackOffBase = {
  cwnd0: number;
  dupThreshold: number;
  ackGlyph: string;
};

export type BackOffLaneChip = { segment: number; resent: boolean };

/** 사라진 확인 더미 — 새 번호가 오면 앞 더미가 흩어진다 */
export type BackOffCleared = { ack: number; count: number };

export type BackOffStep =
  | { kind: 'ready' }
  | { kind: 'send'; lost: number }
  | {
      kind: 'arrive';
      arrivals: BackOffArrival[];
      was: number;
      thWas: number;
      resent: number | null;
      resentArrived: boolean;
      cleared: BackOffCleared | null;
    }
  | {
      kind: 'round';
      segments: number[];
      ack: number;
      was: number;
      cleared: BackOffCleared | null;
    };

export type BackOffScene = {
  base: BackOffBase;
  cwnd: number;
  ssthresh: number;
  /** 첫 왕복에 보낸 조각 */
  segments: number[];
  /** 길에서 사라진 조각 (보내기 전엔 null) */
  lost: number | null;
  /** 길 위에 있는 조각 */
  lane: BackOffLaneChip[];
  /** 받는 쪽에 닿은 조각 (닿은 차례) */
  received: number[];
  /** 더미의 확인 번호 — 아직 돌아온 것이 없으면 null */
  ack: number | null;
  /** 더미에 얹힌 중복 수 (첫 확인은 세지 않는다) */
  dups: number;
  step: BackOffStep;
};

function num(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${name} 이 수가 아니다`);
  return v;
}

function field(o: unknown, key: string): unknown {
  if (typeof o !== 'object' || o === null) throw new Error(`${key} 을 읽을 자리가 객체가 아니다`);
  return (o as Record<string, unknown>)[key];
}

function numList(v: unknown, name: string): number[] {
  if (!Array.isArray(v)) throw new Error(`${name} 이 배열이 아니다`);
  return v.map((x, i) => num(x, `${name}[${i}]`));
}

function arrivalList(v: unknown): BackOffArrival[] {
  if (!Array.isArray(v)) throw new Error('arrivals 가 배열이 아니다');
  return v.map((a, i) => ({
    segment: num(field(a, 'segment'), `arrivals[${i}].segment`),
    ack: num(field(a, 'ack'), `arrivals[${i}].ack`),
    dup: num(field(a, 'dup'), `arrivals[${i}].dup`),
  }));
}

function clearedFrom(scene: BackOffScene, nextAck: number): BackOffCleared | null {
  if (scene.ack === null || scene.ack === nextAck) return null;
  return { ack: scene.ack, count: scene.dups + 1 };
}

export const backOffOnLossScene: ScenePlan<BackOffScene> = {
  initial(initialData: unknown): BackOffScene {
    const glyph = field(initialData, 'ackGlyph');
    if (typeof glyph !== 'string' || glyph === '') throw new Error('ackGlyph 가 없다');
    return {
      base: {
        cwnd0: num(field(initialData, 'cwnd'), 'cwnd'),
        dupThreshold: num(field(initialData, 'dupThreshold'), 'dupThreshold'),
        ackGlyph: glyph,
      },
      cwnd: num(field(initialData, 'cwnd'), 'cwnd'),
      ssthresh: num(field(initialData, 'ssthresh'), 'ssthresh'),
      segments: [],
      lost: null,
      lane: [],
      received: [],
      ack: null,
      dups: 0,
      step: { kind: 'ready' },
    };
  },

  reduce(scene: BackOffScene, event: FacetRuntimeEvent): BackOffScene {
    const p = event.payload;
    switch (event.type) {
      case 'send': {
        const segments = numList(field(p, 'segments'), 'segments');
        const lost = num(field(p, 'lost'), 'lost');
        return {
          ...scene,
          cwnd: num(field(p, 'cwnd'), 'cwnd'),
          ssthresh: num(field(p, 'ssthresh'), 'ssthresh'),
          segments,
          lost,
          lane: segments.filter((s) => s !== lost).map((segment) => ({ segment, resent: false })),
          step: { kind: 'send', lost },
        };
      }
      case 'arrive': {
        const arrivals = arrivalList(field(p, 'arrivals'));
        const last = arrivals[arrivals.length - 1];
        if (last === undefined) throw new Error('도착이 비었다');
        const resentRaw = field(p, 'resent');
        const resent = resentRaw === null ? null : num(resentRaw, 'resent');
        const arrivedSet = new Set(arrivals.map((a) => a.segment));
        for (const s of arrivedSet) {
          if (!scene.lane.some((c) => c.segment === s)) throw new Error(`길 위에 없는 조각 ${s} 이 닿았다`);
        }
        const resentArrived = scene.lane.some((c) => c.resent && arrivedSet.has(c.segment));
        const lane = scene.lane.filter((c) => !arrivedSet.has(c.segment));
        if (resent !== null) lane.push({ segment: resent, resent: true });
        return {
          ...scene,
          cwnd: num(field(p, 'cwnd'), 'cwnd'),
          ssthresh: num(field(p, 'ssthresh'), 'ssthresh'),
          lane,
          received: [...scene.received, ...arrivals.map((a) => a.segment)],
          ack: last.ack,
          dups: last.dup,
          step: {
            kind: 'arrive',
            arrivals,
            was: num(field(p, 'was'), 'was'),
            thWas: num(field(p, 'thWas'), 'thWas'),
            resent,
            resentArrived,
            cleared: clearedFrom(scene, last.ack),
          },
        };
      }
      case 'round': {
        const ack = num(field(p, 'ack'), 'ack');
        return {
          ...scene,
          cwnd: num(field(p, 'cwnd'), 'cwnd'),
          ssthresh: num(field(p, 'ssthresh'), 'ssthresh'),
          ack,
          dups: 0,
          step: {
            kind: 'round',
            segments: numList(field(p, 'segments'), 'segments'),
            ack,
            was: num(field(p, 'was'), 'was'),
            cleared: clearedFrom(scene, ack),
          },
        };
      }
      default:
        throw new Error(`모르는 이벤트 ${event.type}`);
    }
  },
};
