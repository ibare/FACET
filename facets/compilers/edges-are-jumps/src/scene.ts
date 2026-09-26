/**
 * edges-are-jumps 의 장면.
 *
 * 바탕  code (명령 목록 · initialData 에서 베낀다) · blocks (init 이 한 번 정한다)
 * 자취  edges — 지금까지 선 간선. 걸음마다 뒤에 붙는다
 * 이번  step — 시작이거나, 블록 하나가 간선을 낸 걸음 (그 걸음에 붙은 간선 수 added)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readProgram, type BlockSpan, type Instr, type Operand } from './algorithm.js';

export type SceneEdge = {
  from: number;
  to: number;
  kind: 'jump' | 'fall';
  when: 'false' | 'true' | null;
  back: boolean;
};

export type { Instr } from './algorithm.js';

export type EdgesAreJumpsStep =
  | { kind: 'start' }
  | { kind: 'emit'; block: number; line: number; added: number };

export type EdgesAreJumpsScene = {
  code: Instr[];
  blocks: BlockSpan[];
  /** 코드에 적힌 뜀 명령 수 — 알고리즘이 셈해 init 에 싣는다. init 앞에는 null */
  written: number | null;
  edges: SceneEdge[];
  step: EdgesAreJumpsStep;
};

function operandText(o: Operand): string {
  return 'var' in o ? o.var : String(o.num);
}

/** 명령 하나의 글자 (라벨을 앞에 붙인다). 장면과 그림이 이 함수 하나로 글자를 찍는다. */
export function instrText(ins: Instr): string {
  let body: string;
  switch (ins.k) {
    case 'bin':
      body = [ins.dst, '=', operandText(ins.l), ins.op, operandText(ins.r)].join(' ');
      break;
    case 'copy':
      body = [ins.dst, '=', operandText(ins.src)].join(' ');
      break;
    case 'ifnot':
      body = ['ifnot', ins.cond, 'goto', ins.target].join(' ');
      break;
    case 'goto':
      body = ['goto', ins.target].join(' ');
      break;
    case 'return':
      body = ['return', operandText(ins.value)].join(' ');
      break;
  }
  return ins.label === null ? body : [ins.label + ':', body].join(' ');
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isIndex(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function readSpans(v: unknown): BlockSpan[] {
  if (!Array.isArray(v)) throw new Error('edges-are-jumps 장면: init 의 blocks 가 배열이 아니다');
  return v.map((b: unknown) => {
    if (!isRecord(b) || !isIndex(b.first) || !isIndex(b.last)) {
      throw new Error('edges-are-jumps 장면: 블록 경계 모양을 모른다');
    }
    return { first: b.first, last: b.last };
  });
}

function readOut(v: unknown, from: number): SceneEdge[] {
  if (!Array.isArray(v)) throw new Error('edges-are-jumps 장면: edges 의 out 이 배열이 아니다');
  return v.map((e: unknown) => {
    if (!isRecord(e) || !isIndex(e.to) || typeof e.back !== 'boolean') {
      throw new Error('edges-are-jumps 장면: 간선 모양을 모른다');
    }
    const kind = e.kind === 'jump' || e.kind === 'fall' ? e.kind : null;
    if (kind === null) throw new Error('edges-are-jumps 장면: 간선 종류를 모른다');
    const when = e.when === 'false' || e.when === 'true' ? e.when : e.when === null ? null : undefined;
    if (when === undefined) throw new Error('edges-are-jumps 장면: 간선 조건을 모른다');
    return { from, to: e.to, kind, when, back: e.back };
  });
}

export const edgesAreJumpsScene: ScenePlan<EdgesAreJumpsScene> = {
  initial(initialData: unknown): EdgesAreJumpsScene {
    if (!isRecord(initialData)) throw new Error('edges-are-jumps 장면: initialData 가 없다');
    return { code: readProgram(initialData.code), blocks: [], written: null, edges: [], step: { kind: 'start' } };
  },
  reduce(scene: EdgesAreJumpsScene, event: FacetRuntimeEvent): EdgesAreJumpsScene {
    const p = event.payload;
    if (event.type === 'init') {
      if (!isRecord(p) || !isIndex(p.written)) throw new Error('edges-are-jumps 장면: init 의 payload 모양을 모른다');
      return { ...scene, blocks: readSpans(p.blocks), written: p.written, edges: [], step: { kind: 'start' } };
    }
    if (event.type === 'edges') {
      if (!isRecord(p) || !isIndex(p.block) || !isIndex(p.line)) {
        throw new Error('edges-are-jumps 장면: edges 의 payload 모양을 모른다');
      }
      const out = readOut(p.out, p.block);
      return {
        ...scene,
        edges: [...scene.edges, ...out],
        step: { kind: 'emit', block: p.block, line: p.line, added: out.length },
      };
    }
    throw new Error(`edges-are-jumps 장면: 모르는 이벤트 ${event.type}`);
  },
};
