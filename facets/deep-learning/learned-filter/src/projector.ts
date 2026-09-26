/**
 * learned-filter projector — 알고리즘 이벤트를 무대 · 코드 패널 호출로 옮긴다.
 * payload 는 typeof 로 좁히고 어긋나면 던진다. 운동 길이는 재생 속도를 그때그때 읽어 건넨다.
 */
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';
import type {
  LearnedFilterStage,
  LearnedFilterStageResponses,
  LearnedFilterStageRound,
  LearnedFilterStageSetup,
  LearnedFilterStageWindow,
} from './learned-filter-stage.js';

/** 한 걸음의 운동 길이 (재생 속도 1 에서). 걸음 = stepMs + 이것. */
const MOTION_MS = 500;

type CodePanel = { highlightPhase(phase: string | null): void };

function fail(msg: string): never {
  throw new Error(`[learned-filter-projector] ${msg}`);
}

function obj(v: unknown, name: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(`${name} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${name} 가 수가 아니다`);
  return v;
}
function int(v: unknown, name: string): number {
  const n = num(v, name);
  if (!Number.isInteger(n)) fail(`${name} 가 정수가 아니다`);
  return n;
}
function nums(v: unknown, name: string, len?: number): number[] {
  if (!Array.isArray(v)) fail(`${name} 가 목록이 아니다`);
  if (len !== undefined && v.length !== len) fail(`${name} 의 길이가 ${len} 가 아니다`);
  return v.map((x, i) => num(x, `${name}[${i}]`));
}
function bools(v: unknown, name: string, len: number): boolean[] {
  if (!Array.isArray(v) || v.length !== len) fail(`${name} 는 길이 ${len} 의 목록이어야 한다`);
  return v.map((x, i) => (typeof x === 'boolean' ? x : fail(`${name}[${i}] 가 참거짓이 아니다`)));
}

function readSetup(raw: unknown): LearnedFilterStageSetup {
  const p = obj(raw, 'setup');
  if (!Array.isArray(p.patterns) || p.patterns.length === 0) fail('setup.patterns 가 비었다');
  const patterns = p.patterns.map((x, j) => {
    const q = obj(x, `patterns[${j}]`);
    if (typeof q.id !== 'string') fail(`patterns[${j}].id 가 문자열이 아니다`);
    return { id: q.id, cells: nums(q.cells, `patterns[${j}].cells`, 9) };
  });
  if (!Array.isArray(p.pieces) || p.pieces.length === 0) fail('setup.pieces 가 비었다');
  const pieces = p.pieces.map((x, n) => {
    const q = obj(x, `pieces[${n}]`);
    return { pattern: int(q.pattern, `pieces[${n}].pattern`), cells: nums(q.cells, `pieces[${n}].cells`, 9) };
  });
  const range = nums(p.similarityRange, 'setup.similarityRange', 2);
  const shadeScale = num(p.shadeScale, 'setup.shadeScale');
  if (shadeScale <= 0) fail('setup.shadeScale 가 양수가 아니다');
  return { patterns, pieces, epochs: int(p.epochs, 'setup.epochs'), shadeScale, similarityRange: [range[0], range[1]] };
}

function readRound(raw: unknown): LearnedFilterStageRound {
  const p = obj(raw, 'round');
  return {
    target: int(p.target, 'round.target'),
    pattern: int(p.pattern, 'round.pattern'),
    ys: nums(p.ys, 'round.ys'),
    weights: nums(p.weights, 'round.weights', 9),
    bias: num(p.bias, 'round.bias'),
  };
}

function readWindow(raw: unknown): LearnedFilterStageWindow {
  const p = obj(raw, 'window');
  return {
    epoch: int(p.epoch, 'window.epoch'),
    weights: nums(p.weights, 'window.weights', 9),
    bias: num(p.bias, 'window.bias'),
    similarity: num(p.similarity, 'window.similarity'),
    signMatch: int(p.signMatch, 'window.signMatch'),
    matches: bools(p.matches, 'window.matches', 9),
  };
}

function readResponses(raw: unknown): LearnedFilterStageResponses {
  const p = obj(raw, 'responses');
  return { values: nums(p.values, 'responses.values'), strongest: int(p.strongest, 'responses.strongest') };
}

export const learnedFilterProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as LearnedFilterStage | undefined;
  const codePanel = views.codePanel as unknown as CodePanel | undefined;
  const motion = (): number => {
    const speed = runtime?.getSpeed() ?? 1;
    return MOTION_MS / Math.max(0.01, speed);
  };
  const need = (): LearnedFilterStage => stage ?? fail('stage 블록이 없다');

  return {
    onReset() {
      stage?.reset();
      codePanel?.highlightPhase(null);
    },
    async onEvent(event: FacetRuntimeEvent) {
      switch (event.type) {
        case 'phase': {
          const p = obj(event.payload, 'phase');
          if (typeof p.phase !== 'string') fail('phase 이름이 문자열이 아니다');
          codePanel?.highlightPhase(p.phase);
          return;
        }
        case 'setup':
          need().setup(readSetup(event.payload));
          return;
        case 'round':
          codePanel?.highlightPhase(null);
          await need().round(readRound(event.payload), motion());
          return;
        case 'window':
          await need().showWindow(readWindow(event.payload), motion());
          return;
        case 'responses':
          await need().showResponses(readResponses(event.payload), motion());
          return;
        default:
          fail(`모르는 이벤트 ${event.type}`);
      }
    },
  };
};
