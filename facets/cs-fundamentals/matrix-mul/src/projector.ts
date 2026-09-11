/**
 * matrix-mul projector — algorithm 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 이 파일은 그리지 않고 셈하지도 않는다. `event.payload` 를 가드로 좁혀 정형
 * 객체로 만든 뒤 넘기는 것이 전부다 (C9). 화면 문안은 선언에 있고 여기에는 키와
 * en 원본만 남는다 (C10).
 *
 * `phase` 는 코드 패널로 간다. silent 는 **걸음의 경계가 아니다**라는 뜻이지
 * projector 에 오지 않는다는 뜻이 아니다 — mechanism 은 projector 갱신을 마친
 * 뒤에야 silent 를 보고 후처리를 건너뛴다. 그 주석을 "여기 오지 않는다" 로 적어
 * 두고 `case 'phase'` 를 통째로 빠뜨린 projector 가 넷 있었고, 화면에는 코드가
 * 뜨는데 재생하는 동안 아무 줄도 짚지 않았다.
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

import type { Combine, Pair, Term } from './algorithm.js';

/** 코드 패널이 내주는 계약. 없는 메서드를 부르지 않도록 optional 로 둔다. */
type CodePanel = {
  highlightPhase?: (phase: string | null) => void;
  clearHighlight?: () => void;
};

type Stage = {
  showStandard?: (v: {
    a: number[][];
    b: number[][];
    pairs: Pair[];
    c: number[][];
    mults: number;
    adds: number;
    caption: string;
  }) => void;
  showStrassen?: (v: { terms: Term[]; mults: number; adds: number; caption: string }) => void;
  showCombine?: (v: {
    c: number[][];
    combines: Combine[];
    same: boolean;
    caption: string;
  }) => void;
  showDepth?: (v: {
    level: number;
    size: number;
    standard: number;
    fast: number;
    saved: number;
    top: number;
    caption: string;
  }) => void;
  showTally?: (v: {
    depth: number;
    size: number;
    standard: number;
    fast: number;
    saved: number;
    caption: string;
  }) => void;
  resetToInitial?: () => void;
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readMatrix(v: unknown): number[][] | null {
  if (!Array.isArray(v)) return null;
  const out: number[][] = [];
  for (const raw of v) {
    if (!Array.isArray(raw)) return null;
    const line: number[] = [];
    for (const cell of raw) {
      const n = num(cell);
      if (n === null) return null;
      line.push(n);
    }
    out.push(line);
  }
  return out;
}

function readParts(v: unknown): { row: number; col: number; sign: number }[] | null {
  if (!Array.isArray(v)) return null;
  const out: { row: number; col: number; sign: number }[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) return null;
    const p = raw as Record<string, unknown>;
    const row = num(p.row);
    const col = num(p.col);
    const sign = num(p.sign);
    if (row === null || col === null || sign === null) return null;
    out.push({ row, col, sign });
  }
  return out;
}

function readPairs(v: unknown): Pair[] | null {
  if (!Array.isArray(v)) return null;
  const out: Pair[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) return null;
    const p = raw as Record<string, unknown>;
    const row = num(p.row);
    const col = num(p.col);
    const k = num(p.k);
    const left = num(p.left);
    const right = num(p.right);
    const value = num(p.value);
    if (row === null || col === null || k === null || left === null || right === null || value === null) {
      return null;
    }
    out.push({ row, col, k, left, right, value });
  }
  return out;
}

function readTerms(v: unknown): Term[] | null {
  if (!Array.isArray(v)) return null;
  const out: Term[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) return null;
    const t = raw as Record<string, unknown>;
    const index = num(t.index);
    const left = num(t.left);
    const right = num(t.right);
    const value = num(t.value);
    const leftParts = readParts(t.leftParts);
    const rightParts = readParts(t.rightParts);
    if (
      index === null ||
      left === null ||
      right === null ||
      value === null ||
      leftParts === null ||
      rightParts === null
    ) {
      return null;
    }
    out.push({ index, leftParts, rightParts, left, right, value });
  }
  return out;
}

function readCombines(v: unknown): Combine[] | null {
  if (!Array.isArray(v)) return null;
  const out: Combine[] = [];
  for (const raw of v) {
    if (typeof raw !== 'object' || raw === null) return null;
    const c = raw as Record<string, unknown>;
    const row = num(c.row);
    const col = num(c.col);
    const value = num(c.value);
    if (row === null || col === null || value === null) return null;
    if (!Array.isArray(c.parts)) return null;
    const parts: { index: number; sign: number }[] = [];
    for (const rawPart of c.parts) {
      if (typeof rawPart !== 'object' || rawPart === null) return null;
      const p = rawPart as Record<string, unknown>;
      const index = num(p.index);
      const sign = num(p.sign);
      if (index === null || sign === null) return null;
      parts.push({ index, sign });
    }
    out.push({ row, col, parts, value });
  }
  return out;
}

export const matrixMulProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(): void {
      // initialData 를 여기서 좁혀 밀어 넣지 않는다 — 처음 그림은 stage 의 mount 가
      // 자기 initialData 로 이미 세웠다. reactive 의 reset 은 데이터를 되돌린 뒤
      // onInit 을 다시 부르므로 (S-runtime), 여기서는 처음 자리로 돌려놓기만 한다.
      stage?.resetToInitial?.();
      panel?.clearHighlight?.();
    },

    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'phase': {
          if (typeof event.payload !== 'object' || event.payload === null) return;
          const p = event.payload as Record<string, unknown>;
          if (typeof p.phase !== 'string') return;
          panel?.highlightPhase?.(p.phase);
          return;
        }
        case 'standard-layer': {
          if (typeof event.payload !== 'object' || event.payload === null) return;
          const p = event.payload as Record<string, unknown>;
          const a = readMatrix(p.a);
          const b = readMatrix(p.b);
          const c = readMatrix(p.c);
          const pairs = readPairs(p.pairs);
          const mults = num(p.mults);
          const adds = num(p.adds);
          if (!a || !b || !c || !pairs || mults === null || adds === null) return;
          stage?.showStandard?.({
            a,
            b,
            pairs,
            c,
            mults,
            adds,
            caption: tr(
              'caption.standard',
              'Each cell of C takes one product per pair — {count} block products in a layer.',
              { count: mults },
            ),
          });
          return;
        }
        case 'strassen-layer': {
          if (typeof event.payload !== 'object' || event.payload === null) return;
          const p = event.payload as Record<string, unknown>;
          const terms = readTerms(p.terms);
          const mults = num(p.mults);
          const adds = num(p.adds);
          if (!terms || mults === null || adds === null) return;
          stage?.showStrassen?.({
            terms,
            mults,
            adds,
            caption: tr(
              'caption.strassen',
              '{count} products instead. Operands are sums and differences, not single blocks.',
              { count: mults },
            ),
          });
          return;
        }
        case 'combine-layer': {
          if (typeof event.payload !== 'object' || event.payload === null) return;
          const p = event.payload as Record<string, unknown>;
          const c = readMatrix(p.c);
          const combines = readCombines(p.combines);
          const standardMults = num(p.standardMults);
          const fastMults = num(p.fastMults);
          const standardAdds = num(p.standardAdds);
          const fastAdds = num(p.fastAdds);
          if (
            !c ||
            !combines ||
            standardMults === null ||
            fastMults === null ||
            standardAdds === null ||
            fastAdds === null
          ) {
            return;
          }
          stage?.showCombine?.({
            c,
            combines,
            same: p.same === true,
            caption: tr(
              'caption.combine',
              'Same C either way: {fast} multiplications instead of {standard}, paid for with {adds} additions instead of {plain}.',
              { fast: fastMults, standard: standardMults, adds: fastAdds, plain: standardAdds },
            ),
          });
          return;
        }
        case 'depth': {
          if (typeof event.payload !== 'object' || event.payload === null) return;
          const p = event.payload as Record<string, unknown>;
          const level = num(p.level);
          const size = num(p.size);
          const standard = num(p.standard);
          const fast = num(p.fast);
          const saved = num(p.saved);
          const top = num(p.top);
          if (
            level === null ||
            size === null ||
            standard === null ||
            fast === null ||
            saved === null ||
            top === null
          ) {
            return;
          }
          // 밑바닥은 블록이 수 하나라 둘이 같다. 그 사실이 곧 이 걸음의 캡션이다.
          const caption =
            level === 0
              ? tr(
                  'caption.base',
                  'At the bottom a block is a single number — one multiplication either way.',
                )
              : tr('caption.depth', 'Depth {level}: {standard} against {fast}. Saved {saved}.', {
                  level,
                  standard,
                  fast,
                  saved,
                });
          stage?.showDepth?.({ level, size, standard, fast, saved, top, caption });
          return;
        }
        case 'tally': {
          if (typeof event.payload !== 'object' || event.payload === null) return;
          const p = event.payload as Record<string, unknown>;
          const depth = num(p.depth);
          const size = num(p.size);
          const standard = num(p.standard);
          const fast = num(p.fast);
          const saved = num(p.saved);
          if (depth === null || size === null || standard === null || fast === null || saved === null) {
            return;
          }
          stage?.showTally?.({
            depth,
            size,
            standard,
            fast,
            saved,
            caption: tr(
              'caption.tally',
              'One layer always saves exactly one. At depth {level} that becomes {saved}.',
              { level: depth, saved },
            ),
          });
          return;
        }
        case 'done':
          // 한 바퀴의 끝. 화면은 이미 마지막 상태를 보이고 있으므로 할 일이 없다.
          return;
        default:
          // 그 밖의 이벤트는 의도적으로 흘려보낸다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.resetToInitial?.();
      panel?.clearHighlight?.();
    },
  };
};
