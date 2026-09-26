import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { Side } from './algorithm.js';

/** 한 쪽(고른 쪽 / 들쭉날쭉한 쪽)의 지금까지 자취. */
export interface JankVsSlowSideScene {
  /** 이 쪽에 새 장이 한 번이라도 나왔는가. false 면 자리가 없다(빈 트랙). */
  hasFrame: boolean;
  pos: number | null;
  interval: number | null;
  moved: number | null;
  count: number;
  /** 마지막 박자에만 채워지는 초당 장 수(전체 구간 기준). */
  fps: number | null;
}

export interface JankVsSlowScene {
  /** 지금 박자 번호(바탕 0 부터). */
  k: number;
  steady: JankVsSlowSideScene;
  uneven: JankVsSlowSideScene;
  /** 이번 걸음에 새 장이 나온 쪽. 처음이거나 아무 쪽도 나오지 않았으면 빈 배열. */
  step: Side[];
}

function emptySide(): JankVsSlowSideScene {
  return { hasFrame: false, pos: null, interval: null, moved: null, count: 0, fps: null };
}

function isSide(v: unknown): v is Side {
  return v === 'steady' || v === 'uneven';
}

function readNumberOrNull(v: unknown, field: string): number | null {
  if (v === null) return null;
  if (typeof v !== 'number') {
    throw new Error(`beat 이벤트의 ${field} 가 number|null 이 아니다: ${JSON.stringify(v)}`);
  }
  return v;
}

export const jankVsSlowScene: ScenePlan<JankVsSlowScene> = {
  initial(): JankVsSlowScene {
    return { k: 0, steady: emptySide(), uneven: emptySide(), step: [] };
  },

  reduce(scene: JankVsSlowScene, event: FacetRuntimeEvent): JankVsSlowScene {
    if (event.type !== 'beat') {
      throw new Error(`jankVsSlowScene: 모르는 이벤트 type "${event.type}"`);
    }
    const payload = event.payload;
    if (typeof payload !== 'object' || payload === null) {
      throw new Error('beat 이벤트에 payload 가 없다');
    }
    const k = (payload as Record<string, unknown>).k;
    if (typeof k !== 'number') {
      throw new Error(`beat 이벤트의 k 가 number 가 아니다: ${JSON.stringify(k)}`);
    }
    const rawSides = (payload as Record<string, unknown>).sides;
    if (!Array.isArray(rawSides)) {
      throw new Error(`beat 이벤트의 sides 가 배열이 아니다: ${JSON.stringify(rawSides)}`);
    }

    const next: JankVsSlowScene = {
      k,
      steady: { ...scene.steady },
      uneven: { ...scene.uneven },
      step: [],
    };

    for (const raw of rawSides) {
      if (typeof raw !== 'object' || raw === null) {
        throw new Error(`sides 항목이 객체가 아니다: ${JSON.stringify(raw)}`);
      }
      const r = raw as Record<string, unknown>;
      if (!isSide(r.side)) {
        throw new Error(`sides 항목의 side 가 'steady'|'uneven' 이 아니다: ${JSON.stringify(r.side)}`);
      }
      if (typeof r.pos !== 'number') {
        throw new Error(`sides 항목의 pos 가 number 가 아니다: ${JSON.stringify(r.pos)}`);
      }
      const interval = readNumberOrNull(r.interval, 'interval');
      const moved = readNumberOrNull(r.moved, 'moved');
      if (typeof r.count !== 'number') {
        throw new Error(`sides 항목의 count 가 number 가 아니다: ${JSON.stringify(r.count)}`);
      }
      const prevFps = next[r.side].fps;
      next[r.side] = { hasFrame: true, pos: r.pos, interval, moved, count: r.count, fps: prevFps };
      next.step.push(r.side);
    }

    const rawSummary = (payload as Record<string, unknown>).summary;
    if (rawSummary !== undefined) {
      if (typeof rawSummary !== 'object' || rawSummary === null) {
        throw new Error(`beat 이벤트의 summary 가 객체가 아니다: ${JSON.stringify(rawSummary)}`);
      }
      const s = rawSummary as Record<string, unknown>;
      if (typeof s.steady !== 'number' || typeof s.uneven !== 'number') {
        throw new Error(`summary.steady/uneven 이 number 가 아니다: ${JSON.stringify(s)}`);
      }
      next.steady = { ...next.steady, fps: s.steady };
      next.uneven = { ...next.uneven, fps: s.uneven };
    }

    return next;
  },
};
