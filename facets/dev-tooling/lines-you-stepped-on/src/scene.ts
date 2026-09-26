import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { countedLines, narrowLinesData } from './algorithm.js';

/** 이번 걸음 — 무엇이 일어났는지 종류와 인자만. */
export type LinesStep =
  | { kind: 'start' }
  /** `from` 은 실행 자리가 앞서 있던 줄 (처음이면 null) — 커서가 거기서 내려온다 */
  | { kind: 'step'; line: number; count: number; from: number | null }
  | { kind: 'tally' };

export type LinesScene = {
  /** 바탕 — 코드 줄과 시험 입력, 센 줄 */
  code: string[];
  input: number[];
  counted: number[];
  /** 자취 — 줄 번호마다 쌓인 표시 (센 줄만 키로 가진다, 센 줄 차례대로) */
  marks: Array<{ line: number; count: number }>;
  marked: number;
  /** 실행 자리 — 끝나면 null */
  cursor: number | null;
  /** 끝 걸음에만 선다 */
  tally: { marked: number; counted: number; returned: number; unmarked: number[] } | null;
  step: LinesStep;
};

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`linesYouSteppedOnScene: ${type} 의 ${key} 가 수가 아니다`);
  }
  return v;
}

function fields(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`linesYouSteppedOnScene: ${event.type} 에 payload 가 없다`);
  }
  return p as Record<string, unknown>;
}

export const linesYouSteppedOnScene: ScenePlan<LinesScene> = {
  initial(initialData: unknown): LinesScene {
    const data = narrowLinesData(initialData);
    const counted = countedLines(data.code);
    return {
      code: data.code.slice(),
      input: data.input.slice(),
      counted,
      marks: counted.map((line) => ({ line, count: 0 })),
      marked: 0,
      cursor: null,
      tally: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: LinesScene, event: FacetRuntimeEvent): LinesScene {
    if (event.type === 'step') {
      const p = fields(event);
      const line = num(p, 'line', 'step');
      const count = num(p, 'count', 'step');
      const marked = num(p, 'marked', 'step');
      if (!scene.marks.some((m) => m.line === line)) {
        throw new Error(`linesYouSteppedOnScene: 줄 ${line} 은 센 줄이 아니다`);
      }
      return {
        ...scene,
        marks: scene.marks.map((m) => (m.line === line ? { line, count } : m)),
        marked,
        cursor: line,
        step: { kind: 'step', line, count, from: scene.cursor },
      };
    }
    if (event.type === 'tally') {
      const p = fields(event);
      const rawUnmarked = p.unmarked;
      if (!Array.isArray(rawUnmarked) || !rawUnmarked.every((v) => typeof v === 'number')) {
        throw new Error('linesYouSteppedOnScene: tally 의 unmarked 가 수 목록이 아니다');
      }
      return {
        ...scene,
        cursor: null,
        tally: {
          marked: num(p, 'marked', 'tally'),
          counted: num(p, 'counted', 'tally'),
          returned: num(p, 'returned', 'tally'),
          unmarked: (rawUnmarked as number[]).slice(),
        },
        step: { kind: 'tally' },
      };
    }
    throw new Error(`linesYouSteppedOnScene: 모르는 이벤트 ${event.type}`);
  },
};
