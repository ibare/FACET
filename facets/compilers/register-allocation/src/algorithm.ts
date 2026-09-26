/**
 * register-allocation — 레지스터 수 K 로 할당 전 명령 열에 레지스터를 매긴다 (선형 훑기 한 방식).
 *
 * 한 판 = 걸음 0(할당 전 열두 줄) + 원래 줄마다 한 걸음 + 되불러옴마다 한 걸음. 끝나면 `waitForInput` 으로
 * 손잡이 `registers` 를 기다리고, 받은 K 로 **원래 프로그램에서** 다시 연다.
 *
 * 줄 하나의 차례 (codegen 공통 + spill-to-memory 규약 + 완제품 덧붙임 하나):
 *   (1) 밀려난 값을 읽으면 그 줄 바로 앞에서 되불러온다 — 가장 낮은 빈 레지스터. 빈 칸이 없으면 이 줄이 읽지 않는 값 가운데
 *       마지막 읽기가 가장 먼 값을 먼저 밀어낸다 (완제품 덧붙임). 밀려난 값 둘을 읽으면 읽는 차례(왼쪽 먼저)
 *   (2) 이 줄이 마지막 읽기인 값의 레지스터를 푼다
 *   (3) 이 줄이 정의하는 값에 가장 낮은 빈 레지스터. 없으면 레지스터를 쥔 값 가운데 마지막 읽기가 가장 먼 값을 밀어낸다
 *       (그 줄 바로 앞에 `store [sp+칸], r`). 새 값 자신이 그보다 멀면 셈할 수 없다 — 던진다
 *   명령 글자는 풀기 이전의 레지스터로 찍는다. 스택 칸은 밀어낸 차례로 [sp+0] · [sp+8] … (한 값은 제 칸을 다시 쓴다)
 *
 * 동률 — 레지스터는 낮은 번호, 밀어낼 값은 마지막 읽기가 가장 먼 값 · 같으면 **정의 줄이 앞선 값**.
 *   이 데이터에서 실제로 걸리는 자리: K 2 의 L3 (t1 6 · t2 6 → t1) · K 3 의 L4 (t1 6 · t2 6 → t1) · K 3 의 L8 (t5 10 · t6 10 → t5).
 *   K 2 의 되불러옴 두 자리(L6 앞 · L10 앞)는 후보가 하나뿐이라 동률이 아니다.
 *
 * 이벤트 (걸음마다 phase(silent) 하나 → 걸음 이벤트 하나 → sleep):
 *   round  (걸음 0) { k, ladder: number[], lines: { line, text, liveAfter, fit }[],
 *                    values: { name, def, last, color }[], edges: [string, string][], colors, maxLive, total, inserted }
 *   take   { line, value, reg, freed: { value, reg }[], text, total, inserted }
 *   evict  { line, value, reg, victim, slotIndex, slotText, compared: { value, last }[], freed, storeAt, storeText, text, total, inserted }
 *   reload { line, value, slotIndex, slotText, reg, loadAt, loadText,
 *            spill: null | { victim, reg, slotIndex, slotText, compared, storeAt, storeText }, total, inserted }
 *   free   { line, freed, text, total, inserted }
 *   line 은 원래 줄 번호(1 부터), reg 는 화면 번호(r1 = 1), storeAt · loadAt 은 결과 명령 열의 끼어드는 자리(0 부터).
 *   total · inserted 는 그 걸음까지의 명령 수 · 끼어든 줄 수. fit = min(그 줄을 마친 뒤 산 값 수, K) — 넘는 몫이 모자람.
 *   slotIndex = 스택 칸 차례(0 부터, slotText 의 자리). done = 이 판의 마지막 걸음인가 (take · evict · reload · free 모두에 싣는다 — reload 는 이 데이터에서 늘 false)
 *   phase { phase } — silent. 어휘 take · evict · reload · free (irs.ts 와 같다)
 *
 * 계기 (걸음마다 지금까지):
 *   inserted-lines — 끼어든 줄 (store · load)
 *   instr-count    — 명령 수 (원래 줄 + 끼어든 줄)
 *   max-live       — 한꺼번에 산 값의 가장 큰 수 (손잡이와 무관 — 문턱). 걸음 0 에 싣는다
 *   판 머리에서 0 · 12 · 4 로 되돌린다 (차이 0 이어도 보낸다)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RaOp = 'load' | 'store' | 'add' | 'sub' | 'mul';

/** 명령 하나 — 소재 자료. `dst` 가 없으면 null(`store`), `mem` 은 load · store 의 메모리 이름 */
export type RaInstr = { op: RaOp; dst: string | null; srcs: string[]; mem: string | null };

export type RegAllocData = {
  type: 'register-allocation';
  stepMs: number;
  /** 첫 판의 K — segments 의 default 와 같다 */
  registers: number;
  /** 손잡이 사다리 — segments[].value 와 같다 */
  registersLadder: number[];
  /** 할당 전 명령 열 */
  program: RaInstr[];
};

// ─────────────────────────────────────────── 찍개 (projector · stage · test 가 같이 쓴다)

/** 명령 글자 — 이름 자리는 `nameOf` 로 찍는다 (할당 전 = 값 이름, 할당 뒤 = 레지스터) */
export function instrText(ins: RaInstr, nameOf: (v: string) => string): string {
  if (ins.op === 'load') {
    if (ins.dst === null || ins.mem === null) throw new Error('load 에 dst · mem 이 없다');
    return `load ${nameOf(ins.dst)}, ${ins.mem}`;
  }
  if (ins.op === 'store') {
    if (ins.mem === null || ins.srcs.length !== 1) throw new Error('store 모양이 아니다');
    return `store ${ins.mem}, ${nameOf(ins.srcs[0]!)}`;
  }
  if (ins.dst === null || ins.srcs.length !== 2) throw new Error(`${ins.op} 모양이 아니다`);
  return `${ins.op} ${nameOf(ins.dst)}, ${nameOf(ins.srcs[0]!)}, ${nameOf(ins.srcs[1]!)}`;
}

export const regText = (r: number): string => `r${r}`;
export const slotText = (offset: number): string => `[sp+${offset}]`;
export const spillStoreText = (offset: number, r: number): string => `store ${slotText(offset)}, ${regText(r)}`;
export const reloadText = (r: number, offset: number): string => `load ${regText(r)}, ${slotText(offset)}`;

// ─────────────────────────────────────────── 산 구간 · 간섭 그래프

export type Liveness = {
  /** 값 → 정의 줄 (1 부터) */
  def: Map<string, number>;
  /** 값 → 마지막 읽기 줄 (1 부터) */
  last: Map<string, number>;
  /** 정의 차례의 값 이름 */
  order: string[];
};

export function liveness(prog: RaInstr[]): Liveness {
  const def = new Map<string, number>();
  const last = new Map<string, number>();
  const order: string[] = [];
  prog.forEach((ins, j) => {
    const line = j + 1;
    for (const s of ins.srcs) {
      if (!def.has(s)) throw new Error(`${s} 가 정의되기 전에 읽힌다 (L${line})`);
      last.set(s, line);
    }
    if (ins.dst !== null) {
      if (def.has(ins.dst)) throw new Error(`${ins.dst} 가 두 번 정의된다`);
      def.set(ins.dst, line);
      order.push(ins.dst);
    }
  });
  for (const v of order) if (!last.has(v)) throw new Error(`${v} 가 한 번도 읽히지 않는다`);
  return { def, last, order };
}

const lastOf = (lv: Liveness, v: string): number => {
  const n = lv.last.get(v);
  if (n === undefined) throw new Error(`${v} 의 마지막 읽기가 없다`);
  return n;
};
const defOf = (lv: Liveness, v: string): number => {
  const n = lv.def.get(v);
  if (n === undefined) throw new Error(`${v} 의 정의 줄이 없다`);
  return n;
};

export type RaGraph = {
  /** 줄을 마친 뒤 산 값 수 (줄 차례) — 값 v 는 정의 줄 ≤ i < 마지막 읽기 줄에서 산다 */
  liveAfter: number[];
  maxLive: number;
  /** 간섭 선 — y 가 정의되는 줄에 x 가 아직 산다 (정의 차례로) */
  edges: [string, string][];
  /** 칠하기 — 정의 차례로, 이미 칠한 이웃이 안 쓴 가장 낮은 번호 (1 부터) */
  color: Map<string, number>;
  colors: number;
};

export function interference(prog: RaInstr[], lv: Liveness): RaGraph {
  const liveAfter = prog.map((_, j) => lv.order.filter((v) => defOf(lv, v) <= j + 1 && j + 1 < lastOf(lv, v)).length);
  const edges: [string, string][] = [];
  for (const x of lv.order) {
    for (const y of lv.order) {
      if (defOf(lv, x) < defOf(lv, y) && defOf(lv, y) < lastOf(lv, x)) edges.push([x, y]);
    }
  }
  const color = new Map<string, number>();
  for (const v of lv.order) {
    const used = new Set<number>();
    for (const [a, b] of edges) {
      const other = a === v ? b : b === v ? a : null;
      if (other === null) continue;
      const c = color.get(other);
      if (c !== undefined) used.add(c);
    }
    let c = 1;
    while (used.has(c)) c += 1;
    color.set(v, c);
  }
  return { liveAfter, maxLive: Math.max(...liveAfter), edges, color, colors: Math.max(...color.values()) };
}

// ─────────────────────────────────────────── 할당기 (한 판 전체를 셈해 걸음 목록으로)

export type RaFreed = { value: string; reg: number };
export type RaCompared = { value: string; last: number };

export type RaStep =
  | { kind: 'take'; line: number; value: string; reg: number; freed: RaFreed[]; text: string; total: number; inserted: number }
  | {
      kind: 'evict';
      line: number;
      value: string;
      reg: number;
      victim: string;
      slotIndex: number;
      slotText: string;
      compared: RaCompared[];
      freed: RaFreed[];
      storeAt: number;
      storeText: string;
      text: string;
      total: number;
      inserted: number;
    }
  | {
      kind: 'reload';
      line: number;
      value: string;
      slotIndex: number;
      slotText: string;
      reg: number;
      loadAt: number;
      loadText: string;
      spill: null | { victim: string; reg: number; slotIndex: number; slotText: string; compared: RaCompared[]; storeAt: number; storeText: string };
      total: number;
      inserted: number;
    }
  | { kind: 'free'; line: number; freed: RaFreed[]; text: string; total: number; inserted: number };

export type RaResult = {
  steps: RaStep[];
  /** 결과 명령 열 */
  out: string[];
  stores: number;
  loads: number;
  total: number;
  /** 쓴 스택 칸 수 */
  slots: number;
  /** 한 번이라도 쓴 레지스터 수 */
  usedRegs: number;
};

export function allocate(prog: RaInstr[], k: number): RaResult {
  if (!Number.isInteger(k) || k < 1) throw new Error(`레지스터 수가 이상하다: ${k}`);
  const lv = liveness(prog);
  const reg = new Map<string, number>(); // 값 → 레지스터 (1 부터)
  const holder: (string | null)[] = Array.from({ length: k + 1 }, () => null); // [0] 은 비워 둔다
  const slot = new Map<string, number>(); // 값 → 바이트 자리
  let nextSlot = 0;
  const spilled = new Set<string>();
  const out: string[] = [];
  const steps: RaStep[] = [];
  const usedRegs = new Set<number>();
  let stores = 0;
  let loads = 0;

  const lowestFree = (): number | null => {
    for (let r = 1; r <= k; r += 1) if (holder[r] === null) return r;
    return null;
  };
  const regOf = (v: string): number => {
    const r = reg.get(v);
    if (r === undefined) throw new Error(`${v} 가 레지스터에 없다`);
    return r;
  };
  /** 쥔 값 가운데 마지막 읽기가 가장 먼 값 — 같으면 정의 줄이 앞선 값 */
  const farthest = (avoid: Set<string>): { victim: string; compared: RaCompared[] } => {
    const cands = [...reg.keys()].filter((v) => !avoid.has(v)).sort((a, b) => defOf(lv, a) - defOf(lv, b));
    if (cands.length === 0) throw new Error('밀어낼 값이 없다');
    let far = cands[0]!;
    for (const v of cands) {
      if (lastOf(lv, v) > lastOf(lv, far)) far = v;
    }
    return { victim: far, compared: cands.map((v) => ({ value: v, last: lastOf(lv, v) })) };
  };
  const spillOut = (victim: string): { r: number; off: number; at: number; text: string } => {
    const r = regOf(victim);
    reg.delete(victim);
    holder[r] = null;
    let off = slot.get(victim);
    if (off === undefined) {
      off = nextSlot;
      slot.set(victim, off);
      nextSlot += 8;
    }
    spilled.add(victim);
    stores += 1;
    const at = out.length;
    const text = spillStoreText(off, r);
    out.push(text);
    return { r, off, at, text };
  };
  const take = (v: string, r: number): void => {
    reg.set(v, r);
    holder[r] = v;
    usedRegs.add(r);
  };

  prog.forEach((ins, j) => {
    const line = j + 1;
    // (1) 되불러옴 — 읽는 차례로
    for (const s of [...new Set(ins.srcs)]) {
      if (!spilled.has(s)) continue;
      let r = lowestFree();
      let spill: Extract<RaStep, { kind: 'reload' }>['spill'] = null;
      if (r === null) {
        const { victim, compared } = farthest(new Set(ins.srcs));
        const so = spillOut(victim);
        spill = { victim, reg: so.r, slotIndex: so.off / 8, slotText: slotText(so.off), compared, storeAt: so.at, storeText: so.text };
        r = lowestFree();
        if (r === null) throw new Error('밀어낸 뒤에도 빈 레지스터가 없다');
      }
      const off = slot.get(s);
      if (off === undefined) throw new Error(`${s} 의 스택 칸이 없다`);
      take(s, r);
      spilled.delete(s);
      loads += 1;
      const loadAt = out.length;
      const loadText = reloadText(r, off);
      out.push(loadText);
      steps.push({
        kind: 'reload',
        line,
        value: s,
        slotIndex: off / 8,
        slotText: slotText(off),
        reg: r,
        loadAt,
        loadText,
        spill,
        total: prog.length + stores + loads,
        inserted: stores + loads,
      });
    }
    // (2) 풀기 — 글자는 풀기 이전의 레지스터로
    const before = new Map(reg);
    const freed: RaFreed[] = [];
    for (const s of [...new Set(ins.srcs)]) {
      if (lastOf(lv, s) !== line) continue;
      const r = regOf(s);
      holder[r] = null;
      reg.delete(s);
      freed.push({ value: s, reg: r });
    }
    const textWith = (m: Map<string, number>): string =>
      instrText(ins, (v) => {
        const r = m.get(v);
        if (r === undefined) throw new Error(`${v} 의 레지스터를 찍을 수 없다 (L${line})`);
        return regText(r);
      });
    // (3) 정의
    if (ins.dst === null) {
      const text = textWith(before);
      out.push(text);
      steps.push({ kind: 'free', line, freed, text, total: prog.length + stores + loads, inserted: stores + loads });
      return;
    }
    const dst = ins.dst;
    const r0 = lowestFree();
    if (r0 !== null) {
      take(dst, r0);
      before.set(dst, r0);
      const text = textWith(before);
      out.push(text);
      steps.push({ kind: 'take', line, value: dst, reg: r0, freed, text, total: prog.length + stores + loads, inserted: stores + loads });
      return;
    }
    const { victim, compared } = farthest(new Set());
    if (lastOf(lv, dst) > lastOf(lv, victim)) {
      throw new Error(`L${line}: 새 값 ${dst} 자신이 가장 늦게 쓰인다 — 이 할당기는 셈할 수 없다`);
    }
    const so = spillOut(victim);
    take(dst, so.r);
    before.set(dst, so.r);
    const text = textWith(before);
    out.push(text);
    steps.push({
      kind: 'evict',
      line,
      value: dst,
      reg: so.r,
      victim,
      slotIndex: so.off / 8,
      slotText: slotText(so.off),
      compared,
      freed,
      storeAt: so.at,
      storeText: so.text,
      text,
      total: prog.length + stores + loads,
      inserted: stores + loads,
    });
  });
  return { steps, out, stores, loads, total: prog.length + stores + loads, slots: nextSlot / 8, usedRegs: usedRegs.size };
}

/** IR 에 넘길 번호 배열 — 값 번호 = 임시 번호 − 1 (`t7` → 6). `perm` 으로 번호를 섞을 수 있다 */
export function toIrArgs(prog: RaInstr[], perm?: number[]): { dst: number[]; srcA: number[]; srcB: number[]; nVal: number } {
  const lv = liveness(prog);
  const ordered = [...lv.order].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const id = new Map<string, number>();
  ordered.forEach((v, j) => {
    const p = perm === undefined ? j : perm[j];
    if (p === undefined) throw new Error('perm 길이가 값 수보다 짧다');
    id.set(v, p);
  });
  const num = (v: string): number => {
    const n = id.get(v);
    if (n === undefined) throw new Error(`${v} 에 번호가 없다`);
    return n;
  };
  return {
    dst: prog.map((ins) => (ins.dst === null ? -1 : num(ins.dst))),
    srcA: prog.map((ins) => (ins.srcs.length > 0 ? num(ins.srcs[0]!) : -1)),
    srcB: prog.map((ins) => (ins.srcs.length > 1 ? num(ins.srcs[1]!) : -1)),
    nVal: ordered.length,
  };
}

// ─────────────────────────────────────────── 알고리즘

const ACTION = 'registers';

export async function regAllocAlgorithm(ctx0: FacetContext<RegAllocData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<RegAllocData>;
  const data = ctx.data;
  const ladder = data.registersLadder;
  if (!Array.isArray(ladder) || ladder.length === 0) throw new Error('registersLadder 가 비었다');
  if (!ladder.includes(data.registers)) throw new Error(`첫 K ${data.registers} 가 사다리에 없다`);
  const prog = data.program;
  const lv = liveness(prog);
  const graph = interference(prog, lv);

  const shown = { 'inserted-lines': 0, 'instr-count': 0, 'max-live': 0 };
  const setMetric = (name: keyof typeof shown, v: number): void => {
    ctx.metric(name, v - shown[name]);
    shown[name] = v;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = (): Promise<boolean> => ctx.sleep(data.stepMs);

  let k = data.registers;
  try {
    while (!ctx.cancelled) {
      if (ctx.cancelled) return;
      const res = allocate(prog, k);
      // 걸음 0 — 할당 전 열두 줄 (phase 없음 — projector 가 코드 패널 강조를 끈다)
      await ctx.emit({
        type: 'round',
        payload: {
          k,
          ladder: [...ladder],
          lines: prog.map((ins, j) => {
            const live = graph.liveAfter[j];
            if (live === undefined) throw new Error(`L${j + 1} 의 산 값 수가 없다`);
            return { line: j + 1, text: instrText(ins, (v) => v), liveAfter: live, fit: Math.min(live, k) };
          }),
          values: lv.order.map((v) => ({ name: v, def: defOf(lv, v), last: lastOf(lv, v), color: graph.color.get(v) })),
          edges: graph.edges.map(([a, b]) => [a, b]),
          colors: graph.colors,
          maxLive: graph.maxLive,
          total: prog.length,
          inserted: 0,
        },
      });
      setMetric('inserted-lines', 0);
      setMetric('instr-count', prog.length);
      setMetric('max-live', graph.maxLive);
      if (!(await pause())) return;

      for (let si = 0; si < res.steps.length; si += 1) {
        if (ctx.cancelled) return;
        const step = res.steps[si]!;
        const done = si === res.steps.length - 1;
        if (step.kind === 'take') {
          await phase('take');
          await ctx.emit({ type: 'take', payload: { ...step, done } });
        } else if (step.kind === 'evict') {
          await phase('evict');
          await ctx.emit({ type: 'evict', payload: { ...step, done } });
        } else if (step.kind === 'reload') {
          await phase('reload');
          await ctx.emit({ type: 'reload', payload: { ...step, done } });
        } else {
          await phase('free');
          await ctx.emit({ type: 'free', payload: { ...step, done } });
        }
        setMetric('inserted-lines', step.inserted);
        setMetric('instr-count', step.total);
        if (!(await pause())) return;
      }

      // 손잡이를 기다린다
      let next: number | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== ACTION) continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) continue;
        const v = (p as { value?: unknown }).value;
        if (typeof v !== 'number' || !ladder.includes(v)) continue;
        next = v;
      }
      k = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
