/**
 * mix-and-cannot-unmix 장면.
 *
 * 바탕(given · derived) — p · g 는 initialData 에서, A · 두 사다리의 칸은 silent init 이 채운다.
 * 자취(trail)   — 지수마다 두 쪽의 값과 방향이 쌓인다.
 * 이번 걸음(step) — 방금 올린 지수. 그림이 이 걸음의 뜀만 흘린다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowMixData, type Direction, type MixSummary, type SideTally } from './algorithm.js';

export type MixVisit = {
  k: number;
  plain: number;
  mixed: number;
  plainDir: Direction;
  mixedDir: Direction;
  met: boolean;
  /** 이 걸음까지의 오름 · 내림 누계 — 알고리즘이 셈해 보낸다 */
  ups: SideTally;
  downs: SideTally;
};

export type MixScene = {
  given: { p: number; g: number };
  derived: {
    A: number;
    plainRungs: number[];
    mixedSlots: number[];
    /** 걸음 0 의 누계 */
    startUps: SideTally;
    startDowns: SideTally;
  } | null;
  trail: MixVisit[];
  step: { kind: 'visit'; k: number } | null;
  summary: MixSummary | null;
};

function field(payload: Record<string, unknown>, key: string): number {
  const v = payload[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`mixAndCannotUnmixScene: payload.${key} 가 정수가 아니다`);
  }
  return v;
}

function intList(payload: Record<string, unknown>, key: string): number[] {
  const v = payload[key];
  if (!Array.isArray(v) || v.length === 0) {
    throw new Error(`mixAndCannotUnmixScene: payload.${key} 가 빈 배열이거나 배열이 아니다`);
  }
  return v.map((x, i) => {
    if (typeof x !== 'number' || !Number.isInteger(x)) {
      throw new Error(`mixAndCannotUnmixScene: payload.${key}[${i}] 가 정수가 아니다`);
    }
    return x;
  });
}

function dir(payload: Record<string, unknown>, key: string): Direction {
  const v = payload[key];
  if (v === 'none' || v === 'up' || v === 'down') return v;
  throw new Error(`mixAndCannotUnmixScene: payload.${key} 가 방향이 아니다 (${String(v)})`);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const pl = event.payload;
  if (typeof pl !== 'object' || pl === null) {
    throw new Error(`mixAndCannotUnmixScene: ${event.type} 의 payload 가 객체가 아니다`);
  }
  return pl as Record<string, unknown>;
}

function tally(payload: Record<string, unknown>, key: string): SideTally {
  const raw = payload[key];
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`mixAndCannotUnmixScene: payload.${key} 가 객체가 아니다`);
  }
  const o = raw as Record<string, unknown>;
  return { plain: field(o, 'plain'), mixed: field(o, 'mixed') };
}

/** 누계가 앞 걸음에서 이 걸음의 방향만큼 이어지는지 본다. 어긋나면 필드 경로를 담아 던진다. */
function checkTally(key: 'ups' | 'downs', before: SideTally, now: SideTally, v: MixVisit): void {
  const want: Direction = key === 'ups' ? 'up' : 'down';
  const plain = before.plain + (v.plainDir === want ? 1 : 0);
  const mixed = before.mixed + (v.mixedDir === want ? 1 : 0);
  if (now.plain !== plain || now.mixed !== mixed) {
    throw new Error(`mixAndCannotUnmixScene: payload.${key} 가 앞 걸음의 누계와 이어지지 않는다 (k ${v.k})`);
  }
}

function readSummary(raw: unknown): MixSummary {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('mixAndCannotUnmixScene: payload.summary 가 객체가 아니다');
  }
  const s = raw as Record<string, unknown>;
  return {
    rankA: field(s, 'rankA'),
    count: field(s, 'count'),
    metK: field(s, 'metK'),
    plainAtMet: field(s, 'plainAtMet'),
    plainRank: field(s, 'plainRank'),
  };
}

export const mixAndCannotUnmixScene: ScenePlan<MixScene> = {
  initial(initialData: unknown): MixScene {
    const { p, g } = narrowMixData(initialData);
    return { given: { p, g }, derived: null, trail: [], step: null, summary: null };
  },

  reduce(scene: MixScene, event: FacetRuntimeEvent): MixScene {
    switch (event.type) {
      case 'init': {
        const pl = payloadOf(event);
        const A = field(pl, 'A');
        const plainRungs = intList(pl, 'plainRungs');
        const mixedSlots = intList(pl, 'mixedSlots');
        const startUps = tally(pl, 'ups');
        const startDowns = tally(pl, 'downs');
        if (mixedSlots.length !== scene.given.p - 1) {
          throw new Error('mixAndCannotUnmixScene: payload.mixedSlots 의 수가 p − 1 과 다르다');
        }
        if (!mixedSlots.includes(A)) {
          throw new Error(`mixAndCannotUnmixScene: payload.A ${A} 가 섞은 값의 자리에 없다`);
        }
        return {
          given: { ...scene.given },
          derived: { A, plainRungs, mixedSlots, startUps, startDowns },
          trail: [],
          step: null,
          summary: null,
        };
      }
      case 'visit': {
        const base = scene.derived;
        if (base === null) throw new Error('mixAndCannotUnmixScene: init 앞에 visit 이 왔다');
        const pl = payloadOf(event);
        const visit: MixVisit = {
          k: field(pl, 'k'),
          plain: field(pl, 'plain'),
          mixed: field(pl, 'mixed'),
          plainDir: dir(pl, 'plainDir'),
          mixedDir: dir(pl, 'mixedDir'),
          met: pl.met === true,
          ups: tally(pl, 'ups'),
          downs: tally(pl, 'downs'),
        };
        const prevVisit = scene.trail[scene.trail.length - 1];
        checkTally('ups', prevVisit ? prevVisit.ups : base.startUps, visit.ups, visit);
        checkTally('downs', prevVisit ? prevVisit.downs : base.startDowns, visit.downs, visit);
        if (typeof pl.met !== 'boolean') throw new Error('mixAndCannotUnmixScene: payload.met 가 참거짓이 아니다');
        if (visit.k !== scene.trail.length + 1) {
          throw new Error(`mixAndCannotUnmixScene: payload.k ${visit.k} 가 차례와 다르다`);
        }
        if (!base.plainRungs.includes(visit.plain)) {
          throw new Error(`mixAndCannotUnmixScene: payload.plain ${visit.plain} 가 사다리에 없다`);
        }
        if (!base.mixedSlots.includes(visit.mixed)) {
          throw new Error(`mixAndCannotUnmixScene: payload.mixed ${visit.mixed} 가 자리에 없다`);
        }
        if (visit.met !== (visit.mixed === base.A)) {
          throw new Error('mixAndCannotUnmixScene: payload.met 가 A 와 맞지 않다');
        }
        const summary = pl.summary === undefined ? null : readSummary(pl.summary);
        return {
          given: { ...scene.given },
          derived: {
            A: base.A,
            plainRungs: [...base.plainRungs],
            mixedSlots: [...base.mixedSlots],
            startUps: { ...base.startUps },
            startDowns: { ...base.startDowns },
          },
          trail: [
            ...scene.trail.map((v) => ({ ...v, ups: { ...v.ups }, downs: { ...v.downs } })),
            visit,
          ],
          step: { kind: 'visit', k: visit.k },
          summary,
        };
      }
      default:
        throw new Error(`mixAndCannotUnmixScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
