/**
 * pattern-to-instruction — 가장 큰 무늬 먼저 (maximal munch) 로 중간 표현 나무를 기계 명령으로 덮는다.
 *
 * 두 번 훑는다.
 *   1. 고르기 — 뿌리에서 아래로(전위). 마디마다 무늬를 크기 큰 것부터(같으면 목록 차례) 대 보고
 *      처음 맞는 하나를 고른다. 고른 무늬의 `e` 자리를 왼쪽부터 같은 방식으로 덮는다.
 *   2. 내기 — 아래에서 위로(후위). 덮인 조각마다 `e` 자리 조각의 명령을 모두 낸 뒤 자기 명령을 낸다.
 *      새 값의 이름은 명령이 나오는 차례로 t1 · t2 … (레지스터 할당 전).
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음):
 *   pick  { pick: number,        // 고른 차례 (0 부터)
 *           tile: number,        // 무늬 목록의 자리
 *           at: number,          // 무늬가 내려앉은 마디 id (전위 번호)
 *           covered: number[],   // 무늬가 삼킨 마디 id
 *           holes: number[],     // 덮이지 않고 남은 아래 가지의 뿌리 마디 id (왼쪽부터)
 *           missed: number[] }   // 이 마디에서 먼저 대 보고 안 맞은 무늬 자리 (대 본 차례)
 *   emit  { emit: number,        // 낸 차례 (0 부터)
 *           pick: number,        // 이 명령을 낸 조각의 고른 차례
 *           instr: Instr }       // 명령 구조 { op, dst, srcs, mem, off, imm }
 *
 * 걸음 0 은 나무와 무늬 목록이 이미 보이는 화면이라 첫 발신 앞에 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

// ── 자료 ────────────────────────────────────────────────────

/** 나무 마디 (initialData 모양). NAME · NUM 은 잎, 나머지는 kids 를 가진다. */
export type TreeData =
  | { op: 'NAME'; name: string }
  | { op: 'NUM'; num: number }
  | { op: string; kids: TreeData[] };

/** 무늬. 'e' = 따로 덮을 아래 나무, 'k' = 무늬가 삼키는 NUM 마디, { op: 'NAME' } = 이름 하나 (삼킨다). */
export type Pattern = 'e' | 'k' | { op: 'NAME' } | { op: string; kids: Pattern[] };

/** 칸 값 — 무늬가 삼킨 k 의 자리, 또는 고정된 수. */
export type Operand = { k: number } | { num: number };

/** 무늬가 내는 명령의 틀. srcs 는 e 자리 번호, mem 이 'name' 이면 무늬가 삼킨 NAME 의 이름. */
export type EmitTemplate = {
  op: string;
  dst: boolean;
  srcs: number[];
  mem?: 'name';
  off?: Operand;
  imm?: Operand;
};

export type TileDef = { name: string; pattern: Pattern; emit: EmitTemplate };

export type PatternToInstructionFacetData = {
  type: 'pattern-to-instruction';
  stepMs: number;
  source: string;
  tree: TreeData;
  tiles: TileDef[];
};

/** 할당 전 기계 명령 구조. off 가 있으면 주소 칸 [srcs[0]+off]. */
export type Instr = {
  op: string;
  dst: string | null;
  srcs: string[];
  mem: string | null;
  off: number | null;
  imm: number | null;
};

/** 펼친 마디. id 는 전위 번호. */
export type FlatNode = {
  id: number;
  op: string;
  name: string | null;
  num: number | null;
  kids: number[];
  parent: number | null;
  depth: number;
};

// ── 좁히개 (자료가 틀리면 던진다) ──────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readTree(v: unknown, where: string): TreeData {
  if (!isRecord(v) || typeof v.op !== 'string') throw new Error(`나무 마디 모양이 아니다: ${where}`);
  if (v.op === 'NAME') {
    if (typeof v.name !== 'string' || v.name === '') throw new Error(`NAME 에 이름이 없다: ${where}`);
    return { op: 'NAME', name: v.name };
  }
  if (v.op === 'NUM') {
    if (typeof v.num !== 'number' || !Number.isFinite(v.num)) throw new Error(`NUM 에 수가 없다: ${where}`);
    return { op: 'NUM', num: v.num };
  }
  if (!Array.isArray(v.kids) || v.kids.length === 0) throw new Error(`${v.op} 에 아래 마디가 없다: ${where}`);
  const op = v.op;
  return { op, kids: v.kids.map((k, i) => readTree(k, `${where}/${op}[${i}]`)) };
}

function readPattern(v: unknown, where: string): Pattern {
  if (v === 'e' || v === 'k') return v;
  if (!isRecord(v) || typeof v.op !== 'string') throw new Error(`무늬 모양이 아니다: ${where}`);
  if (v.op === 'NAME') return { op: 'NAME' };
  if (v.op === 'NUM') throw new Error(`무늬에 NUM 마디는 k 로 쓴다: ${where}`);
  if (!Array.isArray(v.kids) || v.kids.length === 0) throw new Error(`무늬 ${v.op} 에 아래가 없다: ${where}`);
  const op = v.op;
  return { op, kids: v.kids.map((k, i) => readPattern(k, `${where}/${op}[${i}]`)) };
}

function readOperand(v: unknown, where: string): Operand | undefined {
  if (v === undefined) return undefined;
  if (isRecord(v) && typeof v.k === 'number') return { k: v.k };
  if (isRecord(v) && typeof v.num === 'number') return { num: v.num };
  throw new Error(`칸 값 모양이 아니다: ${where}`);
}

function readEmit(v: unknown, where: string): EmitTemplate {
  if (!isRecord(v) || typeof v.op !== 'string' || typeof v.dst !== 'boolean' || !Array.isArray(v.srcs)) {
    throw new Error(`명령 틀 모양이 아니다: ${where}`);
  }
  const srcs = v.srcs.map((s) => {
    if (typeof s !== 'number') throw new Error(`명령 틀의 srcs 는 e 자리 번호다: ${where}`);
    return s;
  });
  if (v.mem !== undefined && v.mem !== 'name') throw new Error(`명령 틀의 mem 은 'name' 뿐이다: ${where}`);
  const out: EmitTemplate = { op: v.op, dst: v.dst, srcs };
  if (v.mem === 'name') out.mem = 'name';
  const off = readOperand(v.off, `${where}.off`);
  if (off !== undefined) out.off = off;
  const imm = readOperand(v.imm, `${where}.imm`);
  if (imm !== undefined) out.imm = imm;
  return out;
}

/** initialData 를 좁혀 새 객체로 베낀다. */
export function readData(raw: unknown): PatternToInstructionFacetData {
  if (!isRecord(raw)) throw new Error('pattern-to-instruction: initialData 가 없다');
  if (typeof raw.stepMs !== 'number') throw new Error('pattern-to-instruction: stepMs 가 없다');
  if (typeof raw.source !== 'string') throw new Error('pattern-to-instruction: source 가 없다');
  if (!Array.isArray(raw.tiles) || raw.tiles.length === 0) throw new Error('pattern-to-instruction: 무늬 목록이 없다');
  const tiles = raw.tiles.map((t, i): TileDef => {
    if (!isRecord(t) || typeof t.name !== 'string') throw new Error(`무늬 ${i} 에 이름이 없다`);
    return { name: t.name, pattern: readPattern(t.pattern, t.name), emit: readEmit(t.emit, t.name) };
  });
  return {
    type: 'pattern-to-instruction',
    stepMs: raw.stepMs,
    source: raw.source,
    tree: readTree(raw.tree, 'root'),
    tiles,
  };
}

// ── 바탕 셈 (장면 · 그림이 같은 함수를 부른다) ───────────────

/** 나무를 전위 번호로 펼친다. */
export function flattenTree(tree: TreeData): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (n: TreeData, parent: number | null, depth: number): number => {
    const id = out.length;
    const flat: FlatNode = {
      id,
      op: n.op,
      name: 'name' in n ? n.name : null,
      num: 'num' in n ? n.num : null,
      kids: [],
      parent,
      depth,
    };
    out.push(flat);
    if ('kids' in n) flat.kids = n.kids.map((k) => walk(k, id, depth + 1));
    return id;
  };
  walk(tree, null, 0);
  return out;
}

/** 무늬 크기 — 삼키는 마디 수 (e 는 세지 않는다, k 와 NAME 은 하나). */
export function tileSize(p: Pattern): number {
  if (p === 'e') return 0;
  if (p === 'k') return 1;
  if (!('kids' in p)) return 1;
  return 1 + p.kids.reduce((s, c) => s + tileSize(c), 0);
}

/** 대 보는 차례 — 크기 큰 것부터, 같으면 목록 차례. */
export function tryOrder(tiles: readonly TileDef[]): number[] {
  return tiles
    .map((_, i) => i)
    .sort((a, b) => tileSize(tiles[b]!.pattern) - tileSize(tiles[a]!.pattern) || a - b);
}

export function nodeText(n: FlatNode): string {
  if (n.op === 'NAME') return `NAME ${n.name}`;
  if (n.op === 'NUM') return `NUM ${n.num}`;
  return n.op;
}

export function patternText(p: Pattern): string {
  if (p === 'e' || p === 'k') return p;
  if (!('kids' in p)) return 'NAME x';
  return `${p.op}(${p.kids.map(patternText).join(', ')})`;
}

/** 명령 구조에서 화면 글자를 찍는다. 모르는 모양은 던진다. */
export function instrText(ins: Instr): string {
  const s0 = ins.srcs[0];
  if (ins.op === 'load') {
    if (ins.dst === null) throw new Error('load 에 받을 이름이 없다');
    if (ins.mem !== null) return `load ${ins.dst}, ${ins.mem}`;
    if (s0 !== undefined && ins.off !== null) return `load ${ins.dst}, [${s0}+${ins.off}]`;
    throw new Error('load 에 읽을 자리가 없다');
  }
  if (ins.op === 'store') {
    if (ins.mem === null || s0 === undefined) throw new Error('store 에 자리나 값이 없다');
    return `store ${ins.mem}, ${s0}`;
  }
  if (ins.op === 'add' || ins.op === 'sub' || ins.op === 'mul' || ins.op === 'addi') {
    if (ins.dst === null || s0 === undefined) throw new Error(`${ins.op} 에 칸이 모자란다`);
    if (ins.imm !== null) return `${ins.op} ${ins.dst}, ${s0}, ${ins.imm}`;
    const s1 = ins.srcs[1];
    if (s1 === undefined || ins.op === 'addi') throw new Error(`${ins.op} 에 둘째 칸이 없다`);
    return `${ins.op} ${ins.dst}, ${s0}, ${s1}`;
  }
  throw new Error(`모르는 명령: ${ins.op}`);
}

type Match = { covered: number[]; holes: number[]; ks: number[]; xs: string[] };

/** 무늬 p 를 마디 id 에 대 본다. 안 맞으면 null. */
function match(p: Pattern, id: number, nodes: readonly FlatNode[]): Match | null {
  const m: Match = { covered: [], holes: [], ks: [], xs: [] };
  const go = (q: Pattern, at: number): boolean => {
    const n = nodes[at];
    if (n === undefined) throw new Error(`없는 마디: ${at}`);
    if (q === 'e') {
      m.holes.push(at);
      return true;
    }
    if (q === 'k') {
      if (n.op !== 'NUM' || n.num === null) return false;
      m.covered.push(at);
      m.ks.push(n.num);
      return true;
    }
    if (q.op !== n.op) return false;
    if (!('kids' in q)) {
      if (n.name === null) throw new Error(`NAME 마디에 이름이 없다: ${at}`);
      m.covered.push(at);
      m.xs.push(n.name);
      return true;
    }
    if (q.kids.length !== n.kids.length) return false;
    m.covered.push(at);
    return q.kids.every((qc, i) => go(qc, n.kids[i]!));
  };
  return go(p, id) ? m : null;
}

function operandValue(o: Operand | undefined, ks: readonly number[], tile: string): number | null {
  if (o === undefined) return null;
  if ('num' in o) return o.num;
  const v = ks[o.k];
  if (v === undefined) throw new Error(`${tile}: 삼킨 수 k${o.k} 가 없다`);
  return v;
}

// ── 알고리즘 ───────────────────────────────────────────────

type Cover = { tile: number; at: number; holes: number[]; ks: number[]; xs: string[]; below: number[] };

export async function patternToInstruction(
  ctx: FacetContext<PatternToInstructionFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<PatternToInstructionFacetData>;
  const data = readData(ctx.data);
  const nodes = flattenTree(data.tree);
  const order = tryOrder(data.tiles);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 — 나무와 무늬 목록을 읽을 틈.
  if (!(await pause())) return;

  const covers: Cover[] = [];
  const owner = new Map<number, number>();

  /** 1. 고르기 — 마디 id 에 무늬 하나를 내려앉히고 남은 가지를 왼쪽부터 덮는다. 취소면 null. */
  async function select(id: number): Promise<number | null> {
    const missed: number[] = [];
    let found: { tile: number; m: Match } | null = null;
    for (const ti of order) {
      if (ctx.cancelled) return null;
      const m = match(data.tiles[ti]!.pattern, id, nodes);
      if (m !== null) {
        found = { tile: ti, m };
        break;
      }
      missed.push(ti);
    }
    if (found === null) {
      const n = nodes[id];
      throw new Error(`덮을 무늬가 없다: ${n === undefined ? id : nodeText(n)}`);
    }
    const ci = covers.length;
    for (const c of found.m.covered) {
      if (ctx.cancelled) return null;
      if (owner.has(c)) throw new Error(`마디 ${c} 가 두 번 덮였다`);
      owner.set(c, ci);
    }
    const cover: Cover = { tile: found.tile, at: id, holes: found.m.holes, ks: found.m.ks, xs: found.m.xs, below: [] };
    covers.push(cover);
    await ctx.emit({
      type: 'pick',
      payload: { pick: ci, tile: found.tile, at: id, covered: found.m.covered, holes: found.m.holes, missed },
    });
    if (!(await pause())) return null;
    for (const h of found.m.holes) {
      if (ctx.cancelled) return null;
      const below = await select(h);
      if (below === null) return null;
      cover.below.push(below);
    }
    return ci;
  }

  const root = await select(0);
  if (root === null) return;
  if (owner.size !== nodes.length) {
    throw new Error(`덮인 마디 ${owner.size} 가 나무의 마디 ${nodes.length} 와 다르다`);
  }

  let counter = 0;
  let emitted = 0;

  /** 2. 내기 — 아래 조각의 명령을 모두 낸 뒤 자기 명령. 새 값 이름을 돌려준다. 취소면 false. */
  async function produce(ci: number): Promise<string | null | false> {
    const cover = covers[ci];
    if (cover === undefined) throw new Error(`없는 조각: ${ci}`);
    const tile = data.tiles[cover.tile]!;
    const values: string[] = [];
    for (const b of cover.below) {
      if (ctx.cancelled) return false;
      const v = await produce(b);
      if (v === false) return false;
      if (v === null) throw new Error(`${data.tiles[covers[b]!.tile]!.name} 조각은 값을 내지 않아 읽을 수 없다`);
      values.push(v);
    }
    const tpl = tile.emit;
    const srcs = tpl.srcs.map((e) => {
      const v = values[e];
      if (v === undefined) throw new Error(`${tile.name}: e${e} 자리의 값이 없다`);
      return v;
    });
    let mem: string | null = null;
    if (tpl.mem === 'name') {
      const x = cover.xs[0];
      if (x === undefined) throw new Error(`${tile.name}: 삼킨 이름이 없다`);
      mem = x;
    }
    let dst: string | null = null;
    if (tpl.dst) {
      counter += 1;
      dst = `t${counter}`;
    }
    const instr: Instr = {
      op: tpl.op,
      dst,
      srcs,
      mem,
      off: operandValue(tpl.off, cover.ks, tile.name),
      imm: operandValue(tpl.imm, cover.ks, tile.name),
    };
    instrText(instr); // 찍을 수 없는 모양이면 여기서 던진다
    await ctx.emit({ type: 'emit', payload: { emit: emitted, pick: ci, instr } });
    emitted += 1;
    if (!(await pause())) return false;
    return dst;
  }

  await produce(root);
}
