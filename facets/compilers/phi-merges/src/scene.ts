/**
 * phi-merges 의 장면.
 *
 * - 바탕: 블록과 그 줄 · 간선 · 만나는 블록과 앞선 블록 · 판을 매기는 이름 (`init` 이 한 번 정한다)
 * - 자취: 만나는 블록 머리에 선 파이 · 파이 없이 지나간 판 · 몸의 읽기 바꿈 · 돌림의 결과
 * - 이번 걸음: `step`
 *
 * 명령 글자를 찍는 `insSegments` 와 만나는 블록의 화면 줄을 짜는 `blockLines` 는 장면과 그림이
 * 함께 쓴다 — 두 자리에서 따로 세지 않는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { BinOp, Ins, Operand } from './algorithm.js';

export type { Ins } from './algorithm.js';

export type EdgeKind = 'jump' | 'fall';
export type SceneEdge = { from: string; to: string; kind: EdgeKind };
export type SceneBlock = { id: string; depth: number; lines: Ins[] };
export type Phi = { dst: string; args: [string, string][] };
export type RunValue = { block: string; index: number; value: number | boolean };
export type Run = {
  input: [string, number][];
  path: string[];
  from: string;
  picks: { dst: string; arg: string; row: number; slot: number }[];
  values: RunValue[];
  result: number | boolean;
};

/** 몸의 읽는 자리 하나가 모인 판으로 바뀐 것. `src` 는 판이 온 파이 줄 · 지나간 판의 차례. */
export type Rewrite = { row: number; slot: number; ver: string; was: string; from: 'phi' | 'pass'; src: number };

export type Step =
  | { kind: 'start' }
  | { kind: 'phi'; name: string; inc: [string, string][]; dst: string }
  | { kind: 'pass'; name: string; inc: [string, string][]; ver: string }
  | { kind: 'rename'; rewrites: Rewrite[] }
  | { kind: 'run' };

export type PhiMergesScene = {
  blocks: SceneBlock[];
  edges: SceneEdge[];
  merge: string | null;
  preds: string[];
  names: string[];
  phis: Phi[];
  passes: { name: string; ver: string }[];
  renamed: boolean;
  run: Run | null;
  step: Step;
};

// ───────── 글자 찍기 (장면 · 그림이 함께 쓴다) ─────────

export type SegRole = 'def' | 'use' | 'num' | 'kw' | 'punct' | 'target' | 'block' | 'arg';
/** 명령 한 줄의 조각. `slot` 은 읽는 자리(`use`) · 파이 인자(`arg`, `block`)의 차례. */
export type Seg = { s: string; role: SegRole; slot?: number };

function opnd(o: Operand, slot: number): Seg {
  return 'var' in o ? { s: o.var, role: 'use', slot } : { s: String(o.num), role: 'num' };
}

/** 라벨을 뺀 명령 글자. 라벨은 줄 앞 칸에 따로 선다. */
export function insSegments(ins: Ins): Seg[] {
  const sp = (s: string): Seg => ({ s, role: 'punct' });
  switch (ins.k) {
    case 'bin': {
      const l = opnd(ins.l, 0);
      const r = opnd(ins.r, l.role === 'use' ? 1 : 0);
      return [{ s: ins.dst, role: 'def' }, sp(' = '), l, sp(` ${ins.op} `), r];
    }
    case 'copy':
      return [{ s: ins.dst, role: 'def' }, sp(' = '), opnd(ins.src, 0)];
    case 'ifnot':
      return [
        { s: 'ifnot', role: 'kw' },
        sp(' '),
        { s: ins.cond, role: 'use', slot: 0 },
        sp(' '),
        { s: 'goto', role: 'kw' },
        sp(' '),
        { s: ins.target, role: 'target' },
      ];
    case 'goto':
      return [{ s: 'goto', role: 'kw' }, sp(' '), { s: ins.target, role: 'target' }];
    case 'return':
      return [{ s: 'return', role: 'kw' }, sp(' '), opnd(ins.value, 0)];
    case 'phi': {
      const out: Seg[] = [{ s: ins.dst, role: 'def' }, sp(' = '), { s: 'φ', role: 'kw' }, sp('(')];
      ins.args.forEach(([b, v], i) => {
        if (i > 0) out.push(sp(', '));
        out.push({ s: `${b}:`, role: 'block', slot: i }, sp(' '), { s: v, role: 'arg', slot: i });
      });
      out.push(sp(')'));
      return out;
    }
  }
}

/** 블록의 화면 줄. 만나는 블록은 파이가 먼저 서고, 머리의 라벨은 첫 파이 줄로 옮겨 붙는다. */
export function blockLines(scene: PhiMergesScene, id: string): Ins[] {
  const b = scene.blocks.find((x) => x.id === id);
  if (!b) throw new Error(`phi-merges: 없는 블록 ${id}`);
  if (id !== scene.merge || scene.phis.length === 0) return b.lines;
  const lab = b.lines[0]?.label ?? null;
  const phis: Ins[] = scene.phis.map((p, i) => ({
    label: i === 0 ? lab : null,
    k: 'phi',
    dst: p.dst,
    args: p.args.map(([q, x]) => [q, x] as [string, string]),
  }));
  return [...phis, ...b.lines.map((x, i) => (i === 0 ? { ...x, label: null } : x))];
}

// ───────── payload 좁히기 ─────────

function rec(x: unknown, what: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error(`phi-merges 장면: ${what} 가 객체가 아니다`);
  return x as Record<string, unknown>;
}
function str(x: unknown, what: string): string {
  if (typeof x !== 'string') throw new Error(`phi-merges 장면: ${what} 가 글자가 아니다`);
  return x;
}
function numv(x: unknown, what: string): number {
  if (typeof x !== 'number') throw new Error(`phi-merges 장면: ${what} 가 수가 아니다`);
  return x;
}
function arr(x: unknown, what: string): unknown[] {
  if (!Array.isArray(x)) throw new Error(`phi-merges 장면: ${what} 가 목록이 아니다`);
  return x;
}
function strs(x: unknown, what: string): string[] {
  return arr(x, what).map((v) => str(v, what));
}
function pairs(x: unknown, what: string): [string, string][] {
  return arr(x, what).map((p) => {
    const a = arr(p, what);
    return [str(a[0], what), str(a[1], what)];
  });
}
function value(x: unknown, what: string): number | boolean {
  if (typeof x === 'number' || typeof x === 'boolean') return x;
  throw new Error(`phi-merges 장면: ${what} 가 값이 아니다`);
}

const OPS: readonly string[] = ['+', '-', '*', '/', '<', '<=', '>', '>=', '==', '!='];

function operand(x: unknown): Operand {
  const o = rec(x, '피연산자');
  if (typeof o.var === 'string') return { var: o.var };
  if (typeof o.num === 'number') return { num: o.num };
  throw new Error('phi-merges 장면: 모르는 피연산자');
}

function ins(x: unknown): Ins {
  const o = rec(x, '명령');
  const label = o.label === null ? null : str(o.label, '라벨');
  switch (o.k) {
    case 'bin': {
      const op = str(o.op, '연산');
      if (!OPS.includes(op)) throw new Error(`phi-merges 장면: 모르는 연산 ${op}`);
      return { label, k: 'bin', dst: str(o.dst, '넣는 이름'), l: operand(o.l), op: op as BinOp, r: operand(o.r) };
    }
    case 'copy':
      return { label, k: 'copy', dst: str(o.dst, '넣는 이름'), src: operand(o.src) };
    case 'ifnot':
      return { label, k: 'ifnot', cond: str(o.cond, '조건'), target: str(o.target, '목적지') };
    case 'goto':
      return { label, k: 'goto', target: str(o.target, '목적지') };
    case 'return':
      return { label, k: 'return', value: operand(o.value) };
    case 'phi':
      return { label, k: 'phi', dst: str(o.dst, '넣는 이름'), args: pairs(o.args, '파이 인자') };
    default:
      throw new Error(`phi-merges 장면: 모르는 명령 ${String(o.k)}`);
  }
}

// ───────── 장면 ─────────

export const phiMergesScene: ScenePlan<PhiMergesScene> = {
  initial(): PhiMergesScene {
    return {
      blocks: [],
      edges: [],
      merge: null,
      preds: [],
      names: [],
      phis: [],
      passes: [],
      renamed: false,
      run: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: PhiMergesScene, event: FacetRuntimeEvent): PhiMergesScene {
    const p = event.payload;
    switch (event.type) {
      case 'init': {
        const o = rec(p, 'init');
        return {
          blocks: arr(o.blocks, '블록').map((b) => {
            const r = rec(b, '블록');
            return { id: str(r.id, '블록 이름'), depth: numv(r.depth, '블록 깊이'), lines: arr(r.lines, '줄').map(ins) };
          }),
          edges: arr(o.edges, '간선').map((e) => {
            const r = rec(e, '간선');
            const kind = r.kind === 'jump' ? 'jump' : r.kind === 'fall' ? 'fall' : null;
            if (kind === null) throw new Error('phi-merges 장면: 모르는 간선');
            return { from: str(r.from, '간선'), to: str(r.to, '간선'), kind };
          }),
          merge: str(o.merge, '만나는 블록'),
          preds: strs(o.preds, '앞선 블록'),
          names: strs(o.names, '이름'),
          phis: [],
          passes: [],
          renamed: false,
          run: null,
          step: { kind: 'start' },
        };
      }
      case 'phi': {
        const o = rec(p, 'phi');
        const name = str(o.name, '이름');
        const inc = pairs(o.inc, '들어오는 판');
        const dst = str(o.dst, '새 판');
        return {
          ...scene,
          phis: [...scene.phis, { dst, args: inc.map(([q, x]) => [q, x] as [string, string]) }],
          step: { kind: 'phi', name, inc, dst },
        };
      }
      case 'pass': {
        const o = rec(p, 'pass');
        const name = str(o.name, '이름');
        const inc = pairs(o.inc, '들어오는 판');
        const ver = str(o.ver, '판');
        return { ...scene, passes: [...scene.passes, { name, ver }], step: { kind: 'pass', name, inc, ver } };
      }
      case 'rename': {
        const o = rec(p, 'rename');
        const id = str(o.block, '블록');
        const lines = arr(o.lines, '줄').map(ins);
        const was = scene.blocks.find((b) => b.id === id);
        if (!was) throw new Error(`phi-merges 장면: 없는 블록 ${id}`);
        const rewrites: Rewrite[] = arr(o.rewrites, '바뀐 자리').map((x) => {
          const r = rec(x, '바뀐 자리');
          const from = r.from === 'phi' ? 'phi' : r.from === 'pass' ? 'pass' : null;
          if (from === null) throw new Error('phi-merges 장면: 판이 온 곳을 모른다');
          return {
            row: numv(r.row, '바뀐 줄'),
            slot: numv(r.slot, '바뀐 자리'),
            ver: str(r.ver, '새 판'),
            was: str(r.was, '옛 이름'),
            from,
            src: numv(r.src, '판이 온 자리'),
          };
        });
        return {
          ...scene,
          blocks: scene.blocks.map((b) => (b.id === id ? { id, depth: was.depth, lines } : b)),
          renamed: true,
          step: { kind: 'rename', rewrites },
        };
      }
      case 'run': {
        const o = rec(p, 'run');
        const input = arr(o.input, '인자').map((x) => {
          const a = arr(x, '인자');
          return [str(a[0], '인자 이름'), numv(a[1], '인자 값')] as [string, number];
        });
        const run: Run = {
          input,
          path: strs(o.path, '길'),
          from: str(o.from, '들어온 블록'),
          picks: arr(o.picks, '고름').map((x) => {
            const r = rec(x, '고름');
            return { dst: str(r.dst, '고름'), arg: str(r.arg, '고름'), row: numv(r.row, '고름'), slot: numv(r.slot, '고름') };
          }),
          values: arr(o.values, '값').map((x) => {
            const r = rec(x, '값');
            return { block: str(r.block, '값의 블록'), index: numv(r.index, '값의 줄'), value: value(r.value, '값') };
          }),
          result: value(o.result, '돌려준 값'),
        };
        return { ...scene, run, step: { kind: 'run' } };
      }
      default:
        throw new Error(`phi-merges 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
