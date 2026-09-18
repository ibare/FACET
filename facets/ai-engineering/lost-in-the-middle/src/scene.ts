/**
 * lost-in-the-middle 장면.
 *
 * 바탕 — 질문 · 조각 글 · 답 식별자 · 나머지 차례 (initial 이 값을 베낀다)
 * 자취 — 답 조각을 끼워 본 자리와 그 거리 (`visits`)
 * 지금 — 지금 맥락의 차례와 답 조각의 자리 (`order` · `p` · `d`)
 * 이번 걸음 — `step`. 옮김이면 앞 차례(`before`)와 앞 자리(`from`)를 싣는다
 *
 * 좌표 · 문안 · DOM 은 담지 않는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { distanceToEnd, orderWithAnswerAt } from './algorithm.js';

export type LostInTheMiddleVisit = { p: number; d: number };

export type LostInTheMiddleStep =
  | { kind: 'place'; from: number | null; to: number; before: string[] }
  | { kind: 'settle' };

export type LostInTheMiddleScene = {
  question: string;
  chunks: { id: string; text: string }[];
  answer: string;
  rest: string[];
  /** 슬롯 수 n */
  n: number;
  /** 지금 맥락의 차례. 답 조각이 아직 없으면 나머지 차례 그대로 */
  order: string[];
  /** 답 조각의 지금 자리 (1 부터). 아직 없으면 null */
  p: number | null;
  /** 지금 자리의 가까운 끝까지 거리 */
  d: number | null;
  visits: LostInTheMiddleVisit[];
  settled: boolean;
  step: LostInTheMiddleStep | null;
};

function emptyScene(): LostInTheMiddleScene {
  return {
    question: '',
    chunks: [],
    answer: '',
    rest: [],
    n: 0,
    order: [],
    p: null,
    d: null,
    visits: [],
    settled: false,
    step: null,
  };
}

function isChunk(v: unknown): v is { id: string; text: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { id?: unknown }).id === 'string' &&
    typeof (v as { text?: unknown }).text === 'string'
  );
}

export const lostInTheMiddleScene: ScenePlan<LostInTheMiddleScene> = {
  initial(initialData: unknown): LostInTheMiddleScene {
    if (typeof initialData !== 'object' || initialData === null) return emptyScene();
    const d = initialData as Record<string, unknown>;
    const chunks = Array.isArray(d.chunks) ? d.chunks.filter(isChunk) : [];
    const rest = Array.isArray(d.rest) ? d.rest.filter((x): x is string => typeof x === 'string') : [];
    const answer = typeof d.answer === 'string' ? d.answer : '';
    const question = typeof d.question === 'string' ? d.question : '';
    if (chunks.length === 0 || answer === '') return emptyScene();
    return {
      question,
      chunks: chunks.map((c) => ({ id: c.id, text: c.text })),
      answer,
      rest: [...rest],
      n: rest.length + 1,
      order: [...rest],
      p: null,
      d: null,
      visits: [],
      settled: false,
      step: null,
    };
  },

  reduce(scene: LostInTheMiddleScene, event: FacetRuntimeEvent): LostInTheMiddleScene {
    if (event.type === 'place') {
      const payload = event.payload as { p?: unknown } | undefined;
      const p = typeof payload?.p === 'number' ? payload.p : NaN;
      if (!Number.isInteger(p) || p < 1 || p > scene.n) return scene;
      const d = distanceToEnd(p, scene.n);
      return {
        ...scene,
        order: orderWithAnswerAt(scene.rest, scene.answer, p),
        p,
        d,
        visits: [...scene.visits, { p, d }],
        settled: false,
        step: { kind: 'place', from: scene.p, to: p, before: [...scene.order] },
      };
    }
    if (event.type === 'settle') {
      return { ...scene, visits: [...scene.visits], settled: true, step: { kind: 'settle' } };
    }
    return scene;
  },
};
