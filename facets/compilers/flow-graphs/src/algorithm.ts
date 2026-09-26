/**
 * flow-graphs — 같은 네 문장을 곧은 줄 · if · if-else · while 로 감싸면 블록 · 간선 · 정의-사용 사슬이 어떻게 갈리는가.
 *
 * 1차 데이터는 흐름 꼴마다 원시 줄(자료)과 **세 주소 코드의 명령 구조**다. 낮추기는 걸음이 아니다 — 명령 구조가 곧 입력이다.
 * 블록 · 간선 · 도달 모음 · 사슬은 여기서 셈한다 (IR 은 같은 답을 배열 · 버퍼로 셈한다 — 검사가 모든 흐름 꼴에서 견준다).
 *
 * 규약 (공통 안내문 "흐름 규약"):
 * - 리더 ① 첫 명령 ② 뜀(`goto` · `ifnot`) 목적지 라벨이 붙은 명령 ③ 뜀 · `return` 바로 다음. 블록 = 리더에서 다음 리더 앞까지
 * - 간선은 블록 끝 명령이 정한다 — `goto` → 목적지(뜀) · `ifnot` → 목적지(뜀) 먼저, 다음 블록(흘러내림) 그다음 ·
 *   `return` → 없음 · 셈 명령 → 다음 블록(흘러내림). 거슬러 = 목적지 번호 ≤ 출발 번호
 * - 도달 정의 — 블록을 번호 차례로 훑고 그 자리에서 바로 고친다. 머리 = 앞선 블록 끝의 합, 끝 = 이 블록에서 같은 이름을
 *   마지막으로 넣은 명령이면 그것만 · 없으면 머리 그대로. 바뀐 것이 있던 훑기만 걸음이 된다 (바뀜 없는 확인 훑기는 세지 않는다)
 * - 사슬 = (넣는 명령, 그 값을 읽는 자리). 같은 블록 위에 같은 이름의 넣기가 있으면 그것 하나, 없으면 블록 머리에 닿는 넣기 모두.
 *   임시(`t1` · `t2`)도 넣기다. 넣기가 없는 이름(`a` · `b`)은 사슬 밖
 * - 동률 규칙 — 셈에 동률이 없다 (값을 견주지 않는다). 모음 · 목록의 차례는 명령 번호 차례, 간선은 블록 차례 · 뜀 먼저
 *
 * 걸음 (회차 하나):
 *   #0 시작 — 원시 · 세 주소 코드, 자르지 않음 (phase 없음)
 *   자름 한 걸음 [leader] · 간선 한 걸음 [edge] (간선이 있을 때만) · 바뀐 훑기마다 한 걸음 [reach] ·
 *   블록마다 사슬 한 걸음 [chain] (그 블록에 넣기 둘 이상이 닿는 읽기가 있으면 [two-defs])
 *   걸음 수: 곧은 줄 4 · if 7 · if-else 8 · while 9
 *
 * 이벤트 (모두 silent 아님, phase 만 silent):
 *   round  { shape: number, source: SourceLine[], names: string[], lines: CodeLine[] }        걸음 0
 *   cut    { leaders: number[] (0 부터 명령 색인), blocks: BlockSpan[] }                       자름
 *   edges  { edges: FlowEdge[], jumps: number, falls: number, back: number }                  간선
 *   sweep  { sweep: number (1 부터), changed: number, sets: BlockSets[] }                     훑기
 *   chains { block: number, reads: ChainRead[], reads2: number, blockChains: number,
 *            totalChains: number, twoDefReads: number }                                       사슬
 *   phase  { phase } — silent
 *
 * phase 어휘 다섯: leader · edge · reach · chain · two-defs (irs.ts 와 같다)
 *
 * 계기 (지금 값을 들고 차이만 보낸다 · 회차의 걸음 0 에서 0 으로):
 *   blocks · edges · chains · two-def-reads
 *
 * 손잡이: flowShape (value 0 곧은 줄 · 1 if · 2 if-else · 3 while). 한 회차를 끝까지 재생하고 입력을 기다린다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

// ── 1차 데이터 ───────────────────────────────────────────────────────────────

export type Operand = { var: string } | { num: number };
export type BinOp = '+' | '-' | '*' | '>';

export type Instr =
  | { label: string | null; k: 'bin'; dst: string; l: Operand; op: BinOp; r: Operand }
  | { label: string | null; k: 'copy'; dst: string; src: Operand }
  | { label: string | null; k: 'ifnot'; cond: string; target: string }
  | { label: string | null; k: 'goto'; target: string }
  | { label: string | null; k: 'return'; value: Operand };

/** 원시 프로그램 한 줄 — 자료. `indent` 는 들여쓰기 칸 수(한 칸 = 빈칸 넷) */
export type SourceLine = { indent: number; text: string };

export type FlowShape = { source: SourceLine[]; code: Instr[] };

export type FlowGraphsData = {
  type: 'flow-graphs';
  stepMs: number;
  /** 손잡이 사다리 — segments[].value 와 같다 */
  flowShapeLadder: number[];
  /** 첫 회차의 흐름 꼴 (손잡이 기본값) */
  startShape: number;
  /** 흐름 꼴마다 — 사다리 값이 색인 */
  shapes: FlowShape[];
};

// ── 화면 글자 찍기 (stage 가 가져간다) ─────────────────────────────────────────

export type TokenRole = 'label' | 'def' | 'read' | 'word' | 'plain';
/** 명령 글자의 토막. `read` 는 읽는 자리 칸(0 · 1)을 함께 든다 */
export type Token = { text: string; role: TokenRole; slot?: number };

function operandToken(o: Operand, slot: number): Token {
  return 'var' in o ? { text: o.var, role: 'read', slot } : { text: String(o.num), role: 'plain' };
}

/** 명령 하나를 토막으로 — 라벨은 제 줄이 없고 명령 줄 앞에 붙는다 (`L1: t2 = u * v`) */
export function instrTokens(ins: Instr): Token[] {
  const out: Token[] = [];
  if (ins.label !== null) out.push({ text: `${ins.label}: `, role: 'label' });
  switch (ins.k) {
    case 'bin':
      out.push({ text: ins.dst, role: 'def' }, { text: ' = ', role: 'plain' });
      out.push(operandToken(ins.l, 0), { text: ` ${ins.op} `, role: 'plain' }, operandToken(ins.r, 1));
      return out;
    case 'copy':
      out.push({ text: ins.dst, role: 'def' }, { text: ' = ', role: 'plain' }, operandToken(ins.src, 0));
      return out;
    case 'ifnot':
      out.push({ text: 'ifnot ', role: 'word' }, { text: ins.cond, role: 'read', slot: 0 });
      out.push({ text: ' goto ', role: 'word' }, { text: ins.target, role: 'label' });
      return out;
    case 'goto':
      out.push({ text: 'goto ', role: 'word' }, { text: ins.target, role: 'label' });
      return out;
    case 'return':
      out.push({ text: 'return ', role: 'word' }, operandToken(ins.value, 0));
      return out;
  }
}

export function instrText(ins: Instr): string {
  return instrTokens(ins)
    .map((tk) => tk.text)
    .join('');
}

/** 넣는 이름 — 없으면 null */
export function defName(ins: Instr): string | null {
  return ins.k === 'bin' || ins.k === 'copy' ? ins.dst : null;
}

/** 읽는 자리 두 칸 (왼쪽 · 오른쪽) — 이름이 아니면 null */
export function readNames(ins: Instr): [string | null, string | null] {
  const nm = (o: Operand): string | null => ('var' in o ? o.var : null);
  switch (ins.k) {
    case 'bin':
      return [nm(ins.l), nm(ins.r)];
    case 'copy':
      return [nm(ins.src), null];
    case 'ifnot':
      return [ins.cond, null];
    case 'return':
      return [nm(ins.value), null];
    case 'goto':
      return [null, null];
  }
}

// ── 셈 (알고리즘의 길 — 모음으로 푼다) ────────────────────────────────────────

export type BlockSpan = { start: number; end: number };
export type FlowEdge = { from: number; to: number; kind: 'jump' | 'fall'; back: boolean };
/** 모음 안의 넣기 하나 — 어디서 왔는가 (흐름 그림이 따라 그린다) */
export type SetChip = {
  def: number;
  name: string;
  /** 이번 훑기에 새로 들었는가 */
  fresh: boolean;
  /** 머리: 넘겨 준 앞선 블록 · 끝: 'gen'(이 블록이 넣음) 또는 'head'(머리에서 그대로) */
  from: { kind: 'edge'; block: number } | { kind: 'gen' } | { kind: 'head' };
};
export type BlockSets = { head: SetChip[]; end: SetChip[]; headChanged: boolean; endChanged: boolean };
export type Sweep = { changed: number; sets: BlockSets[] };
export type ChainRead = { instr: number; slot: number; name: string; defs: number[] };

export type FlowAnalysis = {
  names: string[];
  leaders: number[];
  blocks: BlockSpan[];
  blockOf: number[];
  edges: FlowEdge[];
  sweeps: Sweep[];
  /** 블록마다 머리에 닿는 넣기 (마지막 훑기 뒤) */
  reachIn: number[][];
  /** 블록마다 읽는 자리와 닿는 넣기 */
  reads: ChainRead[][];
  chains: number;
  twoDefReads: number;
};

export function analyzeFlow(code: Instr[]): FlowAnalysis {
  const n = code.length;
  if (n === 0) throw new Error('flow-graphs: 명령이 없다');
  const labelAt = new Map<string, number>();
  code.forEach((ins, i) => {
    if (ins.label !== null) {
      if (labelAt.has(ins.label)) throw new Error(`flow-graphs: 라벨 ${ins.label} 이 둘`);
      labelAt.set(ins.label, i);
    }
  });
  const targetOf = (ins: Instr): number | null => {
    if (ins.k !== 'goto' && ins.k !== 'ifnot') return null;
    const at = labelAt.get(ins.target);
    if (at === undefined) throw new Error(`flow-graphs: 라벨 ${ins.target} 이 없다`);
    return at;
  };

  // 넣어지는 이름 — 첫 넣기 차례 (임시 포함)
  const names: string[] = [];
  for (const ins of code) {
    const d = defName(ins);
    if (d !== null && !names.includes(d)) names.push(d);
  }

  // 리더
  const lead = new Set<number>([0]);
  code.forEach((ins, i) => {
    const tg = targetOf(ins);
    if (tg !== null) lead.add(tg);
    if ((ins.k === 'goto' || ins.k === 'ifnot' || ins.k === 'return') && i + 1 < n) lead.add(i + 1);
  });
  const leaders = [...lead].sort((a, b) => a - b);
  const blocks: BlockSpan[] = leaders.map((s, j) => ({ start: s, end: j + 1 < leaders.length ? leaders[j + 1]! : n }));
  const blockOf: number[] = new Array<number>(n).fill(-1);
  blocks.forEach((bk, b) => {
    for (let i = bk.start; i < bk.end; i++) blockOf[i] = b;
  });

  // 간선
  const edges: FlowEdge[] = [];
  blocks.forEach((bk, b) => {
    const last = code[bk.end - 1]!;
    const tg = targetOf(last);
    if (tg !== null) {
      const to = blockOf[tg]!;
      edges.push({ from: b, to, kind: 'jump', back: to <= b });
    }
    if ((last.k === 'bin' || last.k === 'copy' || last.k === 'ifnot') && b + 1 < blocks.length) {
      edges.push({ from: b, to: b + 1, kind: 'fall', back: false });
    }
  });

  // 도달 정의 — 블록 차례 훑기, 그 자리에서 고친다
  const defsIn = (b: number): number[] => {
    const out: number[] = [];
    for (let i = blocks[b]!.start; i < blocks[b]!.end; i++) if (defName(code[i]!) !== null) out.push(i);
    return out;
  };
  const IN: Set<number>[] = blocks.map(() => new Set<number>());
  const OUT: Set<number>[] = blocks.map(() => new Set<number>());
  const sweeps: Sweep[] = [];
  const sorted = (s: Set<number>): number[] => [...s].sort((a, b) => a - b);
  for (let guard = 0; ; guard++) {
    if (guard > n + 2) throw new Error('flow-graphs: 훑기가 끝나지 않는다');
    let changed = 0;
    const sets: BlockSets[] = [];
    for (let b = 0; b < blocks.length; b++) {
      const headFrom = new Map<number, number>();
      for (const e of edges) {
        if (e.to !== b) continue;
        for (const d of OUT[e.from]!) if (!headFrom.has(d)) headFrom.set(d, e.from);
      }
      const head = new Set(headFrom.keys());
      const gen = new Map<string, number>();
      for (const d of defsIn(b)) gen.set(defName(code[d]!)!, d);
      const end = new Set<number>();
      for (const d of head) if (!gen.has(defName(code[d]!)!)) end.add(d);
      for (const d of gen.values()) end.add(d);
      const oldHead = IN[b]!;
      const oldEnd = OUT[b]!;
      const headChanged = !sameSet(head, oldHead);
      const endChanged = !sameSet(end, oldEnd);
      if (headChanged) changed++;
      if (endChanged) changed++;
      sets.push({
        head: sorted(head).map((d) => ({
          def: d,
          name: defName(code[d]!)!,
          fresh: !oldHead.has(d),
          from: { kind: 'edge', block: headFrom.get(d)! },
        })),
        end: sorted(end).map((d) => ({
          def: d,
          name: defName(code[d]!)!,
          fresh: !oldEnd.has(d),
          from: head.has(d) ? { kind: 'head' } : { kind: 'gen' },
        })),
        headChanged,
        endChanged,
      });
      IN[b] = head;
      OUT[b] = end;
    }
    if (changed === 0) break;
    sweeps.push({ changed, sets });
  }

  // 사슬
  let chains = 0;
  let twoDefReads = 0;
  const reads: ChainRead[][] = blocks.map((bk, b) => {
    const list: ChainRead[] = [];
    for (let i = bk.start; i < bk.end; i++) {
      readNames(code[i]!).forEach((name, slot) => {
        if (name === null || !names.includes(name)) return;
        let near = -1;
        for (let m = bk.start; m < i; m++) if (defName(code[m]!) === name) near = m;
        const defs = near >= 0 ? [near] : sorted(IN[b]!).filter((d) => defName(code[d]!) === name);
        chains += defs.length;
        if (defs.length >= 2) twoDefReads++;
        list.push({ instr: i, slot, name, defs });
      });
    }
    return list;
  });

  return { names, leaders, blocks, blockOf, edges, sweeps, reachIn: IN.map(sorted), reads, chains, twoDefReads };
}

function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** 걸음 수 — 걸음 0 · 자름 · 간선(있을 때) · 바뀐 훑기 · 블록마다 사슬 */
export function stepCount(an: FlowAnalysis): number {
  return 2 + (an.edges.length > 0 ? 1 : 0) + an.sweeps.length + an.blocks.length;
}

// ── 화면에 넘기는 줄 ─────────────────────────────────────────────────────────

/** 세 주소 코드 한 줄 — `key` 는 회차를 건너 같은 명령을 잇는 이름 (라벨을 뺀 글자) */
export type CodeLine = { key: string; tokens: Token[] };

export function codeLines(code: Instr[]): CodeLine[] {
  const seen = new Map<string, number>();
  return code.map((ins) => {
    const bare = instrText({ ...ins, label: null } as Instr);
    const k = (seen.get(bare) ?? 0) + 1;
    seen.set(bare, k);
    return { key: k === 1 ? bare : `${bare}#${k}`, tokens: instrTokens(ins) };
  });
}

// ── 알고리즘 ─────────────────────────────────────────────────────────────────

export function checkData(data: FlowGraphsData): void {
  if (!Number.isFinite(data.stepMs) || data.stepMs <= 0) throw new Error('flow-graphs: stepMs 가 없다');
  if (data.flowShapeLadder.length !== data.shapes.length) throw new Error('flow-graphs: 사다리와 흐름 꼴 수가 다르다');
  data.flowShapeLadder.forEach((v, i) => {
    if (v !== i) throw new Error('flow-graphs: 사다리는 0 부터의 순번이다');
  });
  if (!data.flowShapeLadder.includes(data.startShape)) throw new Error('flow-graphs: startShape 가 사다리 밖');
}

export async function flowGraphsAlgorithm(ctx0: FacetContext<FlowGraphsData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<FlowGraphsData>;
  const data = ctx.data;
  checkData(data);

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다 (처음 한 번은 차이 0 이어도)
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    const prev = shown.get(name);
    shown.set(name, value);
    if (prev === undefined) ctx.metric(name, value);
    else if (value !== prev) ctx.metric(name, value - prev);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => ctx.sleep(data.stepMs);

  const playRound = async (shapeIdx: number): Promise<boolean> => {
    const shape = data.shapes[shapeIdx];
    if (shape === undefined) throw new Error(`flow-graphs: 흐름 꼴 ${shapeIdx} 이 없다`);
    const an = analyzeFlow(shape.code);

    // #0 시작
    await ctx.emit({
      type: 'round',
      payload: { shape: shapeIdx, source: shape.source, names: an.names, lines: codeLines(shape.code) },
    });
    gauge('blocks', 0);
    gauge('edges', 0);
    gauge('chains', 0);
    gauge('two-def-reads', 0);
    if (!(await pause())) return false;

    // 자름
    await ctx.emit({ type: 'cut', payload: { leaders: an.leaders, blocks: an.blocks } });
    gauge('blocks', an.blocks.length);
    await phase('leader');
    if (!(await pause())) return false;

    // 간선
    if (an.edges.length > 0) {
      await ctx.emit({
        type: 'edges',
        payload: {
          edges: an.edges,
          jumps: an.edges.filter((e) => e.kind === 'jump').length,
          falls: an.edges.filter((e) => e.kind === 'fall').length,
          back: an.edges.filter((e) => e.back).length,
        },
      });
      gauge('edges', an.edges.length);
      await phase('edge');
      if (!(await pause())) return false;
    }

    // 도달 훑기 — 바뀐 훑기마다
    for (let s = 0; s < an.sweeps.length; s++) {
      if (ctx.cancelled) return false;
      const sw = an.sweeps[s]!;
      await ctx.emit({ type: 'sweep', payload: { sweep: s + 1, changed: sw.changed, sets: sw.sets } });
      await phase('reach');
      if (!(await pause())) return false;
    }

    // 블록마다 사슬
    let total = 0;
    let multi = 0;
    for (let b = 0; b < an.blocks.length; b++) {
      if (ctx.cancelled) return false;
      const reads = an.reads[b]!;
      const blockChains = reads.reduce((acc, r) => acc + r.defs.length, 0);
      const reads2 = reads.filter((r) => r.defs.length >= 2).length;
      total += blockChains;
      multi += reads2;
      await ctx.emit({
        type: 'chains',
        payload: { block: b, reads, reads2, blockChains, totalChains: total, twoDefReads: multi },
      });
      gauge('chains', total);
      gauge('two-def-reads', multi);
      if (reads2 > 0) await phase('two-defs');
      else await phase('chain');
      // 마지막 블록 뒤의 걸음 경계는 입력 대기다
      if (b + 1 < an.blocks.length && !(await pause())) return false;
    }
    if (total !== an.chains || multi !== an.twoDefReads) throw new Error('flow-graphs: 사슬 합이 어긋난다');
    return true;
  };

  const nextShape = async (): Promise<number | null> => {
    for (;;) {
      if (ctx.cancelled) return null;
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return null;
      if (input.type !== 'flowShape') continue;
      const p = input.payload;
      if (typeof p !== 'object' || p === null) continue;
      const v = (p as { value?: unknown }).value;
      if (typeof v !== 'number' || !data.flowShapeLadder.includes(v)) continue;
      return v;
    }
  };

  let shape = data.startShape;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(shape))) return;
      const next = await nextShape();
      if (next === null) return;
      shape = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
