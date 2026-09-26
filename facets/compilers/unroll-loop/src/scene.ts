/**
 * unroll-loop 장면.
 *
 * 바탕   — loop (init 이 한 번 정한다: 반복 변수 · 시작 · 끝 · 올림 · 배수 · 줄 id)
 * 자취   — lines (지금 프로그램의 줄), copies (몸의 벌 줄 id), offsets (벌마다 읽는 칸 번호 식의 글자),
 *          cond (지금 조건식 글자), sweep (알고리즘이 보낸 지금 프로그램의 훑기 — 조건 셈 자리 · 읽는 칸),
 *          tail (반복 뒤에 붙은 나머지), tally (셈 견줌)
 * 이번   — step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type UnrollSceneLine = { id: string; indent: number; text: string };

export type UnrollSceneLoop = {
  loopVar: string;
  list: string;
  lo: number;
  hi: number;
  s: number;
  n: number;
  factor: number;
  whileId: string;
  workId: string;
  bumpId: string;
  /** 처음 프로그램이 빠져나가는 i 값 — 띠의 칸 수를 정한다 */
  reach: number;
};

export type UnrollSweep = { starts: number[]; exit: number; reads: [number, number][] };

export type UnrollTail = { id: string; k: number; at: number; was: number };

export type UnrollTally = {
  lines: [number, number];
  checks: [number, number];
  bumps: [number, number];
  adds: [number, number];
};

export type UnrollStep =
  | { kind: 'start' }
  | { kind: 'copy'; id: string; from: string; k: number; read: string }
  | {
      kind: 'retune';
      condId: string;
      bumpId: string;
      cond: string;
      bump: string;
      rest: number;
      was: UnrollSweep;
    }
  | { kind: 'peel'; id: string; from: string; k: number; rest: number; text: string; fromIndent: number }
  | { kind: 'compare'; before: number; after: number };

export type UnrollLoopScene = {
  lines: UnrollSceneLine[];
  loop: UnrollSceneLoop | null;
  copies: string[];
  offsets: string[];
  cond: string;
  sweep: UnrollSweep;
  tail: UnrollTail[];
  tally: UnrollTally | null;
  step: UnrollStep;
};

function rec(v: unknown): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error('payload 가 객체가 아니다');
  return v as Record<string, unknown>;
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`payload.${key} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`payload.${key} 가 글자가 아니다`);
  return v;
}

function pair(p: Record<string, unknown>, key: string): [number, number] {
  const v = p[key];
  if (!Array.isArray(v) || v.length !== 2 || typeof v[0] !== 'number' || typeof v[1] !== 'number') {
    throw new Error(`payload.${key} 가 [앞, 뒤] 가 아니다`);
  }
  return [v[0], v[1]];
}

/** 줄 `after` 바로 뒤에 넣은 새 줄 목록. */
function nums(v: unknown, key: string): number[] {
  if (!Array.isArray(v) || !v.every((x): x is number => typeof x === 'number')) {
    throw new Error(`payload.${key} 가 수 목록이 아니다`);
  }
  return [...v];
}

function sweepOf(p: Record<string, unknown>): UnrollSweep {
  const sw = rec(p['sweep']);
  const raw = sw['reads'];
  if (!Array.isArray(raw)) throw new Error('payload.sweep.reads 가 목록이 아니다');
  const reads = raw.map((r: unknown): [number, number] => {
    const pr = nums(r, 'sweep.reads[]');
    const k = pr[0];
    const cell = pr[1];
    if (pr.length !== 2 || k === undefined || cell === undefined) throw new Error('payload.sweep.reads[] 가 [벌, 칸] 이 아니다');
    return [k, cell];
  });
  return { starts: nums(sw['starts'], 'sweep.starts'), exit: num(sw, 'exit'), reads };
}

function insertAfter(lines: UnrollSceneLine[], after: string, line: UnrollSceneLine): UnrollSceneLine[] {
  const at = lines.findIndex((l) => l.id === after);
  if (at < 0) throw new Error(`줄 ${after} 가 없다`);
  return [...lines.slice(0, at + 1), line, ...lines.slice(at + 1)];
}

function initialLines(data: unknown): UnrollSceneLine[] {
  if (typeof data !== 'object' || data === null) throw new Error('initialData 가 객체가 아니다');
  const raw = (data as Record<string, unknown>)['lines'];
  if (!Array.isArray(raw)) throw new Error('initialData.lines 가 목록이 아니다');
  return raw.map((ln: unknown, i) => {
    const r = rec(ln);
    return { id: `L${i + 1}`, indent: num(r, 'indent'), text: str(r, 'text') };
  });
}

export const unrollLoopScene: ScenePlan<UnrollLoopScene> = {
  initial(initialData: unknown): UnrollLoopScene {
    return {
      lines: initialLines(initialData),
      loop: null,
      copies: [],
      offsets: [],
      cond: '',
      sweep: { starts: [], exit: 0, reads: [] },
      tail: [],
      tally: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: UnrollLoopScene, event: FacetRuntimeEvent): UnrollLoopScene {
    switch (event.type) {
      case 'init': {
        const p = rec(event.payload);
        const loop: UnrollSceneLoop = {
          loopVar: str(p, 'loopVar'),
          list: str(p, 'list'),
          lo: num(p, 'lo'),
          hi: num(p, 'hi'),
          s: num(p, 's'),
          n: num(p, 'n'),
          factor: num(p, 'factor'),
          whileId: str(p, 'whileId'),
          workId: str(p, 'workId'),
          bumpId: str(p, 'bumpId'),
          reach: 0,
        };
        const sweep = sweepOf(p);
        loop.reach = sweep.exit;
        return {
          ...scene,
          loop,
          copies: [loop.workId],
          offsets: [str(p, 'at')],
          cond: str(p, 'cond'),
          sweep,
          step: { kind: 'start' },
        };
      }
      case 'copy': {
        const p = rec(event.payload);
        const line = { id: str(p, 'id'), indent: num(p, 'indent'), text: str(p, 'text') };
        const read = str(p, 'read');
        return {
          ...scene,
          lines: insertAfter(scene.lines, str(p, 'after'), line),
          copies: [...scene.copies, line.id],
          offsets: [...scene.offsets, str(p, 'at')],
          sweep: sweepOf(p),
          step: { kind: 'copy', id: line.id, from: str(p, 'from'), k: num(p, 'k'), read },
        };
      }
      case 'retune': {
        const p = rec(event.payload);
        const condId = str(p, 'condId');
        const bumpId = str(p, 'bumpId');
        const condText = str(p, 'condText');
        const bumpText = str(p, 'bumpText');
        return {
          ...scene,
          lines: scene.lines.map((l) =>
            l.id === condId ? { ...l, text: condText } : l.id === bumpId ? { ...l, text: bumpText } : l,
          ),
          cond: str(p, 'cond'),
          sweep: sweepOf(p),
          step: {
            kind: 'retune',
            condId,
            bumpId,
            cond: str(p, 'cond'),
            bump: str(p, 'bump'),
            rest: num(p, 'rest'),
            was: scene.sweep,
          },
        };
      }
      case 'peel': {
        const p = rec(event.payload);
        const from = str(p, 'from');
        const src = scene.lines.find((l) => l.id === from);
        if (!src) throw new Error(`줄 ${from} 가 없다`);
        const line = { id: str(p, 'id'), indent: num(p, 'indent'), text: str(p, 'text') };
        const k = num(p, 'k');
        return {
          ...scene,
          lines: insertAfter(scene.lines, str(p, 'after'), line),
          tail: [...scene.tail, { id: line.id, k, at: num(p, 'at'), was: num(p, 'was') }],
          step: { kind: 'peel', id: line.id, from, k, rest: num(p, 'rest'), text: line.text, fromIndent: src.indent },
        };
      }
      case 'compare': {
        const p = rec(event.payload);
        const tally: UnrollTally = {
          lines: pair(p, 'lines'),
          checks: pair(p, 'checks'),
          bumps: pair(p, 'bumps'),
          adds: pair(p, 'adds'),
        };
        return {
          ...scene,
          tally,
          step: {
            kind: 'compare',
            before: tally.checks[0] + tally.bumps[0],
            after: tally.checks[1] + tally.bumps[1],
          },
        };
      }
      default:
        return scene;
    }
  },
};
