/**
 * 고정 창과 미는 창의 장면.
 *
 * 바탕  — 한도 · 창 길이 · 요청 여덟의 시각 (initialData 에서 베낀다)
 * 자취  — 요청마다 두 제한기의 판정, 두 계기(고정 칸의 셈 · 미는 창의 셈)
 * 이번 걸음 — 판정한 요청 하나와, 운동이 출발할 계기값(앞 창 끝 · 앞 칸 · 앞 셈)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  cellOf,
  narrowSlidingWindowCountData,
  type SlidingWindowRequest,
  type Verdict,
} from './algorithm.js';

export type FixedMark = { before: number; verdict: Verdict; after: number; recent: number };
export type SlideMark = { before: number; verdict: Verdict; after: number };

export type SlidingWindowCountStep = {
  kind: 'judge';
  index: number;
  /** 앞 걸음의 미는 창 끝 시각. 첫 판정이면 null (창이 처음 선다) */
  fromAt: number | null;
  fromCell: number;
  fromFixedCount: number;
  fromSlideCount: number;
};

export type SlidingWindowCountScene = {
  limit: number;
  windowSec: number;
  requests: SlidingWindowRequest[];
  /** 고정 창의 지금 칸과 그 칸의 셈. silent init 이 채운다 */
  fixedGauge: { cell: number; count: number } | null;
  /** 미는 창 안의 셈. silent init 이 채운다 */
  slideGauge: number | null;
  fixed: (FixedMark | null)[];
  slide: (SlideMark | null)[];
  /** 마지막으로 판정한 요청의 차례 */
  current: number | null;
  step: SlidingWindowCountStep | null;
};

function fail(msg: string): never {
  throw new Error(`sliding-window-count scene: ${msg}`);
}

function readInt(obj: Record<string, unknown>, key: string, path: string): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(`${path}.${key} 가 0 이상의 정수가 아니다`);
  return v;
}

function readVerdict(obj: Record<string, unknown>, path: string): Verdict {
  const v = obj.verdict;
  if (v !== 'accept' && v !== 'reject') fail(`${path}.verdict 를 모른다 (${String(v)})`);
  return v;
}

function readRecord(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(`${path} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

export const slidingWindowCountScene: ScenePlan<SlidingWindowCountScene> = {
  initial(initialData: unknown): SlidingWindowCountScene {
    const data = narrowSlidingWindowCountData(initialData);
    return {
      limit: data.limit,
      windowSec: data.windowSec,
      requests: data.requests.map((r) => ({ id: r.id, at: r.at })),
      fixedGauge: null,
      slideGauge: null,
      fixed: data.requests.map(() => null),
      slide: data.requests.map(() => null),
      current: null,
      step: null,
    };
  },

  reduce(scene: SlidingWindowCountScene, event: FacetRuntimeEvent): SlidingWindowCountScene {
    switch (event.type) {
      case 'init': {
        const p = readRecord(event.payload, 'init.payload');
        return {
          ...scene,
          fixedGauge: {
            cell: readInt(p, 'fixedCell', 'init.payload'),
            count: readInt(p, 'fixedCount', 'init.payload'),
          },
          slideGauge: readInt(p, 'slideCount', 'init.payload'),
          step: null,
        };
      }
      case 'judge': {
        const p = readRecord(event.payload, 'judge.payload');
        const index = readInt(p, 'index', 'judge.payload');
        const expected = scene.current === null ? 0 : scene.current + 1;
        if (index !== expected) fail(`judge.payload.index ${index} — 다음 차례는 ${expected}`);
        const req = scene.requests[index];
        if (!req) fail(`judge.payload.index ${index} 인 요청이 바탕에 없다`);
        if (p.id !== req.id) fail(`judge.payload.id 가 바탕의 ${req.id} 와 다르다 (${String(p.id)})`);
        if (scene.fixedGauge === null || scene.slideGauge === null) fail('init 앞에 judge 가 왔다');

        const f = readRecord(p.fixed, 'judge.payload.fixed');
        const s = readRecord(p.slide, 'judge.payload.slide');
        const fixedMark: FixedMark = {
          before: readInt(f, 'before', 'judge.payload.fixed'),
          verdict: readVerdict(f, 'judge.payload.fixed'),
          after: readInt(f, 'after', 'judge.payload.fixed'),
          recent: readInt(f, 'recent', 'judge.payload.fixed'),
        };
        const slideMark: SlideMark = {
          before: readInt(s, 'before', 'judge.payload.slide'),
          verdict: readVerdict(s, 'judge.payload.slide'),
          after: readInt(s, 'after', 'judge.payload.slide'),
        };

        const prevReq = scene.current === null ? null : scene.requests[scene.current];
        if (scene.current !== null && !prevReq) fail(`앞 요청 ${scene.current} 가 바탕에 없다`);

        const fixed = scene.fixed.slice();
        const slide = scene.slide.slice();
        fixed[index] = fixedMark;
        slide[index] = slideMark;
        return {
          ...scene,
          fixedGauge: { cell: cellOf(req.at, scene.windowSec), count: fixedMark.after },
          slideGauge: slideMark.after,
          fixed,
          slide,
          current: index,
          step: {
            kind: 'judge',
            index,
            fromAt: prevReq ? prevReq.at : null,
            fromCell: scene.fixedGauge.cell,
            fromFixedCount: scene.fixedGauge.count,
            fromSlideCount: scene.slideGauge,
          },
        };
      }
      default:
        fail(`모르는 이벤트 ${event.type}`);
    }
  },
};
