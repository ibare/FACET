/**
 * ssa-form — 판 번호는 컴파일할 때 매겨지고, 파이는 만나는 블록에서 앞선 두 블록 끝의 판이
 * **다를 때만** 선다. 파이가 어느 판을 고르는지는 실행할 때 들어온 길이 정한다.
 *
 * 1차 데이터는 갈래마다 **판 없는 세 주소 코드**의 명령 구조다 (`variants[].code`). 블록 · 앞선 블록 ·
 * 판 · 파이 · 길 · 값은 모두 여기서 셈한다. 사양의 표는 대조값일 뿐이다.
 *
 * 규약 (공통 안내문 "흐름 규약")
 * - 리더: ① 첫 명령 ② 어떤 뜀의 목적지 라벨이 붙은 명령 ③ 뜀 · return 바로 다음. 블록 = 리더에서 다음 리더 앞까지.
 * - 간선: 블록 끝 명령이 정한다. goto → 목적지 · ifnot → 목적지 먼저, 다음 블록 그다음 · return → 없음 · 그 밖 → 다음 블록.
 *   앞선 블록 목록은 블록 번호 차례.
 * - 판 받는 이름 = 넣어지는 이름 가운데 임시(`t` + 숫자)가 아닌 것. 이름 번호 = 첫 넣기 차례.
 *   블록을 글 차례로, 블록 안은 위에서 아래로. 명령 하나는 오른쪽(읽기)을 먼저 지금 판으로, 그다음 왼쪽에 새 판.
 * - 블록 머리의 지금 판: 앞선 블록이 없으면 0, 하나면 그 끝 판, 둘이면 이름마다(이름 번호 차례) 두 끝 판을
 *   견준다 — 같으면 그대로 지나가고, 다르면 그 이름의 다음 번호로 파이 하나. 인자 차례 = 앞선 블록 번호 차례.
 * - 돌림: 만든 SSA 를 들어온 간선에 따라 돌린다. 파이는 들어온 간선의 인자를 고른다. `>` 는 참 1 · 거짓 0.
 * - 동률 규칙: 두 끝 판이 **같은 번호**면 "같다". 이 데이터에서 네 갈래 모두 z 가 같음에 걸린다 (x | — 는 y 도).
 *
 * 이벤트 (모두 silent 아님, phase 만 silent)
 * - `ssa-program` — 전체 회차 걸음 0. 판 없는 세 주소 코드와 블록 · 간선.
 *     payload { blocks: { name: string; rows: SsaRow[] }[]; edges: { from: number; to: number }[];
 *               join: number; param: string; a: number }
 * - `ssa-rename` — 블록 하나의 명령에 판을 매긴다 (만나는 블록이면 그 몸).
 *     payload { block: number; name: string; body: boolean; rows: SsaRow[]; versions: number }
 * - `ssa-phi` — 만나는 블록 머리에서 이름 하나의 두 끝 판을 견준다.
 *     payload { block: number; blockName: string; name: string; same: boolean;
 *               from: { block: number; blockName: string; text: string }[]  (둘, 앞선 블록 번호 차례);
 *               result: string (다르면 파이 줄 글자, 같으면 지나가는 판 글자); rowKey: string | null (다르면 파이 줄 key);
 *               rows: SsaRow[]; phis: number; versions: number }
 * - `ssa-keep` — a 만 바뀐 회차의 걸음 0. 컴파일한 SSA 를 그대로 두고 돌림의 결론만 걷는다.
 *     payload { param: string; a: number; phis: number; versions: number }
 * - `ssa-path` — 돌림 (가) 길. payload { param: string; a: number; path: number[]; pathNames: string[];
 *               edges: { from: number; to: number }[]; cond: string; truth: boolean; target: string }
 * - `ssa-pick` — 돌림 (나) 고름. payload { block: number; from: number; fromName: string;
 *               picks: { rowKey: string; arg: number; text: string }[]; value: number }
 *   SsaRow = { key: string; label: string | null; parts: { text: string; ver?: boolean; arg?: number }[] }
 *   (key: 명령은 `ins:<번호>`, 파이 줄은 `phi:<이름>`. ver = 판 번호 글자, arg = 파이 인자 자리 0 · 1)
 * - `phase` (silent) — payload { phase }
 *
 * phase 어휘: `rename` · `phi-new` · `phi-same` (irs.ts 와 같다). 돌림 두 걸음은 컴파일러의 일이 아니라
 * phase 를 보내지 않는다 — projector 가 코드 패널 강조를 끈다.
 *
 * 계기: `phis` (지금까지 선 파이 수) · `versions` (지금까지 매긴 판 이름 수 — 파이의 판 포함) ·
 * `result` (돌려준 값). 누적 채널이라 지금 값을 들고 차이만 보낸다. 첫 회차는 차이 0 이어도 보낸다.
 * 전체 회차는 걸음 0 에서 셋 다 0 으로, a 만 바뀐 회차는 result 만 0 으로 되돌린다.
 *
 * 손잡이: `branchSets` (갈래가 넣는 이름 — variants 의 번호) · `argA` (인자 a 의 값). 다른 손잡이의 지금 값은
 * 알고리즘이 스스로 쥔다. 갈래가 바뀌면(또는 첫 회차) 전체 회차, a 만 바뀌면 컴파일 걸음을 되밟지 않는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

// ─────────────────────────────────────────────── 자료

export type SsaOperand = { var: string } | { num: number };
export type SsaBinOp = '+' | '-' | '*' | '>';

export type SsaInstruction =
  | { label: string | null; k: 'bin'; dst: string; l: SsaOperand; op: SsaBinOp; r: SsaOperand }
  | { label: string | null; k: 'copy'; dst: string; src: SsaOperand }
  | { label: string | null; k: 'ifnot'; cond: string; target: string }
  | { label: string | null; k: 'goto'; target: string }
  | { label: string | null; k: 'return'; value: SsaOperand };

export type SsaVariant = {
  /** 원시 프로그램 — 설명 글용 자료 (화면에 띄우지 않는다) */
  source: string[];
  /** 판 없는 세 주소 코드 — 1차 데이터 */
  code: SsaInstruction[];
};

export type SsaFormData = {
  type: 'ssa-form';
  stepMs: number;
  /** 함수의 인자 이름 (판이 없다) */
  param: string;
  branchSetsLadder: number[];
  argLadder: number[];
  startBranchSets: number;
  startArgA: number;
  variants: SsaVariant[];
};

export type SsaPart = { text: string; ver?: boolean; arg?: number };
export type SsaRow = { key: string; label: string | null; parts: SsaPart[] };

// ─────────────────────────────────────────────── 블록 자르기

export type SsaCfg = {
  /** 블록마다 [첫 명령, 끝 명령 다음) */
  blocks: { start: number; end: number }[];
  edges: { from: number; to: number }[];
  /** 블록마다 앞선 블록 — 블록 번호 차례 */
  preds: number[][];
  /** 명령마다 그 블록 */
  insBlock: number[];
};

export function blockName(b: number): string {
  return `B${b + 1}`;
}

export function cutBlocks(code: SsaInstruction[]): SsaCfg {
  if (code.length === 0) throw new Error('ssa-form: 명령이 없다');
  const targets = new Set<string>();
  for (const ins of code) if (ins.k === 'goto' || ins.k === 'ifnot') targets.add(ins.target);
  const leader = new Set<number>([0]);
  code.forEach((ins, i) => {
    if (ins.label !== null && targets.has(ins.label)) leader.add(i);
    if ((ins.k === 'goto' || ins.k === 'ifnot' || ins.k === 'return') && i + 1 < code.length) leader.add(i + 1);
  });
  const starts = [...leader].sort((p, q) => p - q);
  const blocks = starts.map((start, j) => ({ start, end: j + 1 < starts.length ? starts[j + 1] : code.length }));
  const labelBlock = new Map<string, number>();
  blocks.forEach((bl, b) => {
    const lab = code[bl.start].label;
    if (lab !== null) labelBlock.set(lab, b);
  });
  const jumpTo = (label: string): number => {
    const b = labelBlock.get(label);
    if (b === undefined) throw new Error(`ssa-form: 라벨 ${label} 이 블록 머리에 없다`);
    return b;
  };
  const edges: { from: number; to: number }[] = [];
  blocks.forEach((bl, b) => {
    const last = code[bl.end - 1];
    if (last.k === 'goto') edges.push({ from: b, to: jumpTo(last.target) });
    else if (last.k === 'ifnot') {
      edges.push({ from: b, to: jumpTo(last.target) });
      if (b + 1 >= blocks.length) throw new Error('ssa-form: ifnot 다음 블록이 없다');
      edges.push({ from: b, to: b + 1 });
    } else if (last.k !== 'return' && b + 1 < blocks.length) edges.push({ from: b, to: b + 1 });
  });
  const preds = blocks.map((_, b) =>
    edges.filter((e) => e.to === b).map((e) => e.from).sort((p, q) => p - q),
  );
  const insBlock: number[] = [];
  blocks.forEach((bl, b) => {
    for (let i = bl.start; i < bl.end; i++) insBlock.push(b);
  });
  return { blocks, edges, preds, insBlock };
}

// ─────────────────────────────────────────────── 이름과 읽는 칸

export function isTemporary(name: string): boolean {
  return /^t\d+$/.test(name);
}

/** 판 받는 이름 — 첫 넣기 차례 */
export function ssaNames(code: SsaInstruction[]): string[] {
  const names: string[] = [];
  for (const ins of code) {
    if ((ins.k === 'bin' || ins.k === 'copy') && !isTemporary(ins.dst) && !names.includes(ins.dst)) names.push(ins.dst);
  }
  return names;
}

/** 읽는 두 칸 (bin 은 l · r, copy 는 src · 없음, ifnot · return 은 값 · 없음, goto 는 없음 · 없음) */
export function readSlots(ins: SsaInstruction): [SsaOperand | null, SsaOperand | null] {
  switch (ins.k) {
    case 'bin':
      return [ins.l, ins.r];
    case 'copy':
      return [ins.src, null];
    case 'ifnot':
      return [{ var: ins.cond }, null];
    case 'return':
      return [ins.value, null];
    case 'goto':
      return [null, null];
  }
}

function writeOf(ins: SsaInstruction): string | null {
  return ins.k === 'bin' || ins.k === 'copy' ? ins.dst : null;
}

// ─────────────────────────────────────────────── 컴파일 — 판 매기기와 파이

export type SsaPhi = { block: number; name: string; ver: number; args: [number, number] };

export type CompileStep =
  | { kind: 'rename'; block: number; body: boolean; versions: number }
  | { kind: 'phi'; block: number; name: string; same: boolean; ends: [number, number]; phi: number | null; versions: number };

export type SsaCompiled = {
  cfg: SsaCfg;
  names: string[];
  /** 명령마다 읽는 두 칸의 판 (판 없는 칸은 0) */
  readVer: number[];
  /** 명령마다 넣는 판 (판 없으면 0) */
  writeVer: number[];
  phis: SsaPhi[];
  steps: CompileStep[];
  /** 매긴 판 이름 수 — 이름마다 마지막 번호의 합 */
  versions: number;
  join: number;
};

export function compileSsa(code: SsaInstruction[]): SsaCompiled {
  const cfg = cutBlocks(code);
  const names = ssaNames(code);
  const counter = new Map<string, number>(names.map((n) => [n, 0]));
  const endVer: Map<string, number>[] = [];
  const readVer = new Array<number>(code.length * 2).fill(0);
  const writeVer = new Array<number>(code.length).fill(0);
  const phis: SsaPhi[] = [];
  const steps: CompileStep[] = [];
  let versions = 0;
  const bump = (n: string): number => {
    const c = counter.get(n);
    if (c === undefined) throw new Error(`ssa-form: 판 받는 이름이 아니다 — ${n}`);
    counter.set(n, c + 1);
    versions += 1;
    return c + 1;
  };
  const endOf = (b: number, n: string): number => {
    const m = endVer[b];
    if (m === undefined) throw new Error(`ssa-form: ${blockName(b)} 가 아직 판을 매기지 않았다 (고리는 다루지 않는다)`);
    const v = m.get(n);
    if (v === undefined) throw new Error(`ssa-form: ${blockName(b)} 끝에 ${n} 의 판이 없다`);
    return v;
  };
  const joins = cfg.preds.map((p, b) => (p.length === 2 ? b : -1)).filter((b) => b >= 0);
  if (joins.length !== 1) throw new Error(`ssa-form: 만나는 블록이 하나여야 한다 — ${joins.length}`);

  cfg.blocks.forEach((bl, b) => {
    const preds = cfg.preds[b];
    const cur = new Map<string, number>();
    if (preds.length === 0) for (const n of names) cur.set(n, 0);
    else if (preds.length === 1) for (const n of names) cur.set(n, endOf(preds[0], n));
    else if (preds.length === 2) {
      for (const n of names) {
        const ends: [number, number] = [endOf(preds[0], n), endOf(preds[1], n)];
        if (ends[0] === ends[1]) {
          cur.set(n, ends[0]);
          steps.push({ kind: 'phi', block: b, name: n, same: true, ends, phi: null, versions });
        } else {
          const ver = bump(n);
          phis.push({ block: b, name: n, ver, args: ends });
          cur.set(n, ver);
          steps.push({ kind: 'phi', block: b, name: n, same: false, ends, phi: phis.length - 1, versions });
        }
      }
    } else throw new Error(`ssa-form: 앞선 블록이 셋 이상 — ${blockName(b)}`);

    for (let i = bl.start; i < bl.end; i++) {
      const ins = code[i];
      readSlots(ins).forEach((o, j) => {
        if (o !== null && 'var' in o && names.includes(o.var)) {
          const v = cur.get(o.var);
          if (v === undefined || v === 0) throw new Error(`ssa-form: ${o.var} 를 넣기 전에 읽는다 (명령 ${i + 1})`);
          readVer[i * 2 + j] = v;
        }
      });
      const w = writeOf(ins);
      if (w !== null && names.includes(w)) {
        const v = bump(w);
        cur.set(w, v);
        writeVer[i] = v;
      }
    }
    endVer[b] = cur;
    steps.push({ kind: 'rename', block: b, body: preds.length === 2, versions });
  });
  return { cfg, names, readVer, writeVer, phis, steps, versions, join: joins[0] };
}

// ─────────────────────────────────────────────── 글자 찍기

function pushText(parts: SsaPart[], text: string): void {
  const last = parts[parts.length - 1];
  if (last !== undefined && last.ver !== true && last.arg === undefined) last.text += text;
  else parts.push({ text });
}

function pushName(parts: SsaPart[], name: string, ver: number): void {
  pushText(parts, name);
  if (ver > 0) parts.push({ text: String(ver), ver: true });
}

/** 명령 i 의 글자 — compiled 가 없으면 판 없는 세 주소 코드 */
export function instructionParts(code: SsaInstruction[], i: number, compiled: SsaCompiled | null): SsaPart[] {
  const ins = code[i];
  const parts: SsaPart[] = [];
  const operand = (o: SsaOperand, slot: number): void => {
    if ('num' in o) pushText(parts, String(o.num));
    else pushName(parts, o.var, compiled === null ? 0 : compiled.readVer[i * 2 + slot]);
  };
  const dst = (name: string): void => pushName(parts, name, compiled === null ? 0 : compiled.writeVer[i]);
  switch (ins.k) {
    case 'bin':
      dst(ins.dst);
      pushText(parts, ' = ');
      operand(ins.l, 0);
      pushText(parts, ` ${ins.op} `);
      operand(ins.r, 1);
      break;
    case 'copy':
      dst(ins.dst);
      pushText(parts, ' = ');
      operand(ins.src, 0);
      break;
    case 'ifnot':
      pushText(parts, `ifnot ${ins.cond} goto ${ins.target}`);
      break;
    case 'goto':
      pushText(parts, `goto ${ins.target}`);
      break;
    case 'return':
      pushText(parts, 'return ');
      operand(ins.value, 0);
      break;
  }
  return parts;
}

export function partsText(parts: SsaPart[]): string {
  return parts.map((p) => p.text).join('');
}

/** 파이 줄 — `x3 = φ(B2: x2, B3: x1)`. 인자 자리는 arg 0 · 1 */
export function phiParts(compiled: SsaCompiled, k: number): SsaPart[] {
  const phi = compiled.phis[k];
  const preds = compiled.cfg.preds[phi.block];
  const parts: SsaPart[] = [];
  pushName(parts, phi.name, phi.ver);
  pushText(parts, ' = φ(');
  parts.push({ text: `${blockName(preds[0])}: ${phi.name}${phi.args[0]}`, arg: 0 });
  pushText(parts, ', ');
  parts.push({ text: `${blockName(preds[1])}: ${phi.name}${phi.args[1]}`, arg: 1 });
  pushText(parts, ')');
  return parts;
}

/**
 * 블록 하나의 줄들. phiUpTo = 머리에 이미 선 파이 수 (compiled.phis 의 앞에서부터, 이 블록 것만),
 * renamed = 몸의 명령에 판이 매겨졌는가. 블록 머리에 파이가 서면 라벨은 첫 파이 줄로 옮겨 붙는다.
 */
export function blockRows(
  code: SsaInstruction[],
  compiled: SsaCompiled,
  b: number,
  phiUpTo: number,
  renamed: boolean,
): SsaRow[] {
  const bl = compiled.cfg.blocks[b];
  const rows: SsaRow[] = [];
  const headLabel = code[bl.start].label;
  compiled.phis.slice(0, phiUpTo).forEach((phi, k) => {
    if (phi.block !== b) return;
    rows.push({ key: `phi:${phi.name}`, label: rows.length === 0 ? headLabel : null, parts: phiParts(compiled, k) });
  });
  const phiRows = rows.length;
  for (let i = bl.start; i < bl.end; i++) {
    const label = i === bl.start ? (phiRows === 0 ? headLabel : null) : code[i].label;
    rows.push({ key: `ins:${i}`, label, parts: instructionParts(code, i, renamed ? compiled : null) });
  }
  return rows;
}

// ─────────────────────────────────────────────── 돌림

export type SsaRun = {
  path: number[];
  edges: { from: number; to: number }[];
  /** 만나는 블록에 들어온 앞선 블록 */
  enteredFrom: number;
  /** 파이마다 고른 인자 자리 (0 · 1) */
  picks: number[];
  /** 첫 갈림 — 조건 임시 · 참 여부 · 뜀 목적지 */
  cond: string;
  truth: boolean;
  target: string;
  value: number;
};

export function runSsa(code: SsaInstruction[], compiled: SsaCompiled, param: string, a: number): SsaRun {
  const { cfg, names } = compiled;
  const labelBlock = new Map<string, number>();
  cfg.blocks.forEach((bl, b) => {
    const lab = code[bl.start].label;
    if (lab !== null) labelBlock.set(lab, b);
  });
  const env = new Map<string, number>(); // `${name}#${ver}` → 값
  const temps = new Map<string, number>();
  const read = (key: string, m: Map<string, number>): number => {
    const v = m.get(key);
    if (v === undefined) throw new Error(`ssa-form: 돌림에서 ${key} 의 값이 없다`);
    return v;
  };
  const path: number[] = [];
  const edges: { from: number; to: number }[] = [];
  const picks = new Array<number>(compiled.phis.length).fill(-1);
  let enteredFrom = -1;
  let branch: { cond: string; truth: boolean; target: string } | null = null;
  let b = 0;
  let prev = -1;
  for (let guard = 0; guard <= cfg.blocks.length; guard++) {
    path.push(b);
    if (prev >= 0) edges.push({ from: prev, to: b });
    compiled.phis.forEach((phi, k) => {
      if (phi.block !== b) return;
      const preds = cfg.preds[b];
      if (prev !== preds[0] && prev !== preds[1]) {
        throw new Error(`ssa-form: ${blockName(b)} 에 앞선 블록이 아닌 곳에서 들어왔다`);
      }
      const arg = prev === preds[0] ? 0 : 1;
      picks[k] = arg;
      enteredFrom = prev;
      env.set(`${phi.name}#${phi.ver}`, read(`${phi.name}#${phi.args[arg]}`, env));
    });
    const bl = cfg.blocks[b];
    let nextBlock = b + 1;
    for (let i = bl.start; i < bl.end; i++) {
      const ins = code[i];
      const value = (o: SsaOperand, slot: number): number => {
        if ('num' in o) return o.num;
        if (o.var === param) return a;
        if (names.includes(o.var)) return read(`${o.var}#${compiled.readVer[i * 2 + slot]}`, env);
        return read(o.var, temps);
      };
      const put = (dst: string, v: number): void => {
        if (names.includes(dst)) env.set(`${dst}#${compiled.writeVer[i]}`, v);
        else temps.set(dst, v);
      };
      switch (ins.k) {
        case 'bin': {
          const l = value(ins.l, 0);
          const r = value(ins.r, 1);
          const v = ins.op === '+' ? l + r : ins.op === '-' ? l - r : ins.op === '*' ? l * r : l > r ? 1 : 0;
          put(ins.dst, v);
          break;
        }
        case 'copy':
          put(ins.dst, value(ins.src, 0));
          break;
        case 'ifnot': {
          const truth = read(ins.cond, temps) !== 0;
          if (branch === null) branch = { cond: ins.cond, truth, target: ins.target };
          if (!truth) nextBlock = read(ins.target, labelBlock);
          break;
        }
        case 'goto':
          nextBlock = read(ins.target, labelBlock);
          break;
        case 'return': {
          if (branch === null) throw new Error('ssa-form: 갈림 없이 돌림이 끝났다');
          if (picks.some((p) => p < 0)) throw new Error('ssa-form: 고르지 않은 파이가 있다');
          return { path, edges, enteredFrom, picks, ...branch, value: value(ins.value, 0) };
        }
      }
    }
    prev = b;
    b = nextBlock;
  }
  throw new Error('ssa-form: 돌림이 끝나지 않는다');
}

// ─────────────────────────────────────────────── 알고리즘

type Metric = 'phis' | 'versions' | 'result';

export async function ssaFormAlgorithm(ctx: FacetContext<SsaFormData>): Promise<void> {
  const rctx = ctx as ReactiveContext<SsaFormData>;
  const data = ctx.data;
  if (!data.branchSetsLadder.includes(data.startBranchSets)) throw new Error('ssa-form: 시작 갈래가 사다리에 없다');
  if (!data.argLadder.includes(data.startArgA)) throw new Error('ssa-form: 시작 a 가 사다리에 없다');
  if (data.variants.length !== data.branchSetsLadder.length) throw new Error('ssa-form: 갈래 수와 사다리가 다르다');

  const shown = new Map<Metric, number>();
  const setMetric = (name: Metric, value: number): void => {
    const before = shown.get(name);
    if (before === value) return;
    shown.set(name, value);
    const delta = before === undefined ? value : value - before;
    if (name === 'phis') ctx.metric('phis', delta);
    else if (name === 'versions') ctx.metric('versions', delta);
    else ctx.metric('result', delta);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const pause = () => rctx.sleep(data.stepMs);

  let branchSets = data.startBranchSets;
  let argA = data.startArgA;

  const variantOf = (v: number): SsaVariant => {
    const variant = data.variants[data.branchSetsLadder.indexOf(v)];
    if (variant === undefined) throw new Error(`ssa-form: 갈래 ${v} 가 없다`);
    return variant;
  };

  /** 돌림 두 걸음. 끝 걸음 뒤에는 sleep 을 두지 않는다 — 입력 대기가 걸음 경계다 */
  const runSteps = async (code: SsaInstruction[], compiled: SsaCompiled): Promise<boolean> => {
    const run = runSsa(code, compiled, data.param, argA);
    await ctx.emit({
      type: 'ssa-path',
      payload: {
        param: data.param,
        a: argA,
        path: run.path,
        pathNames: run.path.map(blockName),
        edges: run.edges,
        cond: run.cond,
        truth: run.truth,
        target: run.target,
      },
    });
    if (!(await pause())) return false;
    await ctx.emit({
      type: 'ssa-pick',
      payload: {
        block: compiled.join,
        from: run.enteredFrom,
        fromName: blockName(run.enteredFrom),
        picks: compiled.phis.map((phi, k) => ({
          rowKey: `phi:${phi.name}`,
          arg: run.picks[k],
          text: `${phi.name}${phi.ver} ← ${phi.name}${phi.args[run.picks[k]]}`,
        })),
        value: run.value,
      },
    });
    setMetric('result', run.value);
    return true;
  };

  const fullRound = async (): Promise<boolean> => {
    const { code } = variantOf(branchSets);
    const compiled = compileSsa(code);
    const { cfg } = compiled;
    // 걸음 0 — 판 없는 세 주소 코드, 블록은 이미 나뉘어 있다
    await ctx.emit({
      type: 'ssa-program',
      payload: {
        blocks: cfg.blocks.map((_, b) => ({ name: blockName(b), rows: blockRows(code, compiled, b, 0, false) })),
        edges: cfg.edges,
        join: compiled.join,
        param: data.param,
        a: argA,
      },
    });
    setMetric('phis', 0);
    setMetric('versions', 0);
    setMetric('result', 0);
    if (!(await pause())) return false;

    let phisSoFar = 0;
    for (const step of compiled.steps) {
      if (ctx.cancelled) return false;
      if (step.kind === 'rename') {
        const versions = step.versions;
        await ctx.emit({
          type: 'ssa-rename',
          payload: {
            block: step.block,
            name: blockName(step.block),
            body: step.body,
            rows: blockRows(code, compiled, step.block, phisSoFar, true),
            versions,
          },
        });
        setMetric('versions', versions);
        await phase('rename');
      } else {
        if (step.phi !== null) phisSoFar = step.phi + 1;
        const preds = cfg.preds[step.block];
        await ctx.emit({
          type: 'ssa-phi',
          payload: {
            block: step.block,
            blockName: blockName(step.block),
            name: step.name,
            same: step.same,
            from: preds.map((p, j) => ({ block: p, blockName: blockName(p), text: `${step.name}${step.ends[j]}` })),
            result: step.phi === null ? `${step.name}${step.ends[0]}` : partsText(phiParts(compiled, step.phi)),
            rowKey: step.phi === null ? null : `phi:${step.name}`,
            rows: blockRows(code, compiled, step.block, phisSoFar, false),
            phis: phisSoFar,
            versions: step.versions,
          },
        });
        setMetric('phis', phisSoFar);
        setMetric('versions', step.versions);
        if (step.same) await phase('phi-same');
        else await phase('phi-new');
      }
      if (!(await pause())) return false;
    }
    if (ctx.cancelled) return false;
    return runSteps(code, compiled);
  };

  const argRound = async (): Promise<boolean> => {
    const { code } = variantOf(branchSets);
    const compiled = compileSsa(code);
    // 걸음 0 — 컴파일한 SSA 그대로, 돌림의 결론만 걷는다
    await ctx.emit({
      type: 'ssa-keep',
      payload: { param: data.param, a: argA, phis: compiled.phis.length, versions: compiled.versions },
    });
    setMetric('phis', compiled.phis.length);
    setMetric('versions', compiled.versions);
    setMetric('result', 0);
    if (!(await pause())) return false;
    return runSteps(code, compiled);
  };

  try {
    if (!(await fullRound())) return;
    while (!ctx.cancelled) {
      const input = await rctx.waitForInput();
      if (ctx.cancelled) return;
      // 우리 손잡이가 아닌 입력은 흘린다 (C8 의 정본 짜임). 우리 손잡이인데 값이 어긋나면 던진다 (C6)
      if (input.type !== 'branchSets' && input.type !== 'argA') continue;
      const payload = input.payload;
      if (typeof payload !== 'object' || payload === null || !('value' in payload)) {
        throw new Error(`ssa-form: ${input.type} 입력에 value 가 없다`);
      }
      const value = payload.value;
      if (typeof value !== 'number') throw new Error(`ssa-form: ${input.type} 의 value 가 수가 아니다`);
      if (input.type === 'branchSets') {
        if (!data.branchSetsLadder.includes(value)) throw new Error(`ssa-form: 갈래 ${value} 가 사다리에 없다`);
        branchSets = value;
        if (!(await fullRound())) return;
      } else {
        if (!data.argLadder.includes(value)) throw new Error(`ssa-form: a = ${value} 가 사다리에 없다`);
        argA = value;
        if (!(await argRound())) return;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
