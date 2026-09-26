/**
 * 바꾸기와 섞기의 장면.
 *
 * 바탕   perm(π) · flipPos — init 이 한 번 정한다
 * 자취   trace — 층마다 다른 칸의 목록이 쌓인다
 * 지금   a · b · diffBits · diffCells — 이번 층을 지난 두 상태
 * 걸음   step — 이번 층의 종류와 계기값(층 앞의 두 상태 · 다른 칸)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { BLOCK_BITS, CELL_BITS, ROUNDS, narrowSubstituteAndPermuteData } from './algorithm.js';

export type LayerKind = 'start' | 's' | 'p';

export type TraceEntry = { kind: LayerKind; round: number; diffCells: number[] };

export type SapStep =
  | { kind: 'start'; flipPos: number }
  | {
      kind: 's' | 'p';
      round: number;
      /** 이 층 앞의 두 상태와 다른 자리 · 칸 */
      fromA: number[];
      fromB: number[];
      fromDiffBits: number[];
      fromDiffCells: number[];
    };

export type SubstituteAndPermuteScene = {
  base: { perm: number[]; movedBits: number; flipPos: number } | null;
  a: number[];
  b: number[];
  diffBits: number[];
  diffCells: number[];
  trace: TraceEntry[];
  step: SapStep | null;
};

function bitsField(p: Record<string, unknown>, name: string, type: string): number[] {
  const v = p[name];
  if (!Array.isArray(v) || v.length !== BLOCK_BITS || !v.every((x) => x === 0 || x === 1)) {
    throw new Error(`substituteAndPermuteScene: ${type}.payload.${name} 는 0 / 1 이 ${BLOCK_BITS} 개인 배열이어야 한다`);
  }
  return v.slice() as number[];
}

function posList(p: Record<string, unknown>, name: string, type: string, max: number): number[] {
  const v = p[name];
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'number' && Number.isInteger(x) && x >= 1 && x <= max)) {
    throw new Error(`substituteAndPermuteScene: ${type}.payload.${name} 는 1..${max} 정수 배열이어야 한다`);
  }
  return v.slice() as number[];
}

function intField(p: Record<string, unknown>, name: string, type: string, lo: number, hi: number): number {
  const v = p[name];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) {
    throw new Error(`substituteAndPermuteScene: ${type}.payload.${name} 는 ${lo}..${hi} 정수여야 한다`);
  }
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`substituteAndPermuteScene: ${event.type}.payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

/** 이 층 다음에 와야 할 층 — 자취의 끝에서 정한다 */
function expectedNext(trace: TraceEntry[]): { kind: 's' | 'p'; round: number } | null {
  const last = trace[trace.length - 1];
  if (!last) return null;
  if (last.kind === 'start') return { kind: 's', round: 1 };
  if (last.kind === 's') return last.round === ROUNDS ? null : { kind: 'p', round: last.round };
  return { kind: 's', round: last.round + 1 };
}

export const substituteAndPermuteScene: ScenePlan<SubstituteAndPermuteScene> = {
  initial(initialData) {
    // 자료 모양만 확인한다 — B · 다른 자리 · π 는 알고리즘이 silent init 으로 보낸다
    narrowSubstituteAndPermuteData(initialData);
    return { base: null, a: [], b: [], diffBits: [], diffCells: [], trace: [], step: null };
  },

  reduce(scene, event) {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const perm = posList(p, 'perm', 'init', BLOCK_BITS);
        if (perm.length !== BLOCK_BITS || new Set(perm).size !== BLOCK_BITS) {
          throw new Error('substituteAndPermuteScene: init.payload.perm 이 1..16 의 순열이 아니다');
        }
        const flipPos = intField(p, 'flipPos', 'init', 1, BLOCK_BITS);
        const movedBits = intField(p, 'movedBits', 'init', 0, BLOCK_BITS);
        const diffCells = posList(p, 'diffCells', 'init', BLOCK_BITS / CELL_BITS);
        return {
          base: { perm, movedBits, flipPos },
          a: bitsField(p, 'a', 'init'),
          b: bitsField(p, 'b', 'init'),
          diffBits: posList(p, 'diffBits', 'init', BLOCK_BITS),
          diffCells,
          trace: [{ kind: 'start', round: 0, diffCells: diffCells.slice() }],
          step: { kind: 'start', flipPos },
        };
      }
      case 'substitute':
      case 'permute': {
        if (!scene.base) throw new Error(`substituteAndPermuteScene: ${event.type} 가 init 보다 먼저 왔다`);
        const p = payloadOf(event);
        const kind = event.type === 'substitute' ? 's' : 'p';
        const round = intField(p, 'round', event.type, 1, ROUNDS);
        const want = expectedNext(scene.trace);
        if (!want || want.kind !== kind || want.round !== round) {
          throw new Error(`substituteAndPermuteScene: ${event.type}.payload.round ${round} 가 층 차례와 어긋났다`);
        }
        const diffCells = posList(p, 'diffCells', event.type, BLOCK_BITS / CELL_BITS);
        return {
          base: scene.base,
          a: bitsField(p, 'a', event.type),
          b: bitsField(p, 'b', event.type),
          diffBits: posList(p, 'diffBits', event.type, BLOCK_BITS),
          diffCells,
          trace: [...scene.trace, { kind, round, diffCells: diffCells.slice() }],
          step: {
            kind,
            round,
            fromA: scene.a.slice(),
            fromB: scene.b.slice(),
            fromDiffBits: scene.diffBits.slice(),
            fromDiffCells: scene.diffCells.slice(),
          },
        };
      }
      default:
        throw new Error(`substituteAndPermuteScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
