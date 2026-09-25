/**
 * allocate-and-free — 빌리고 돌려주기.
 *
 * 짧은 프로그램 하나를 걸음으로 밟는다. 바퀴마다 `make(3)` 의 틀이 스택에 섰다가 걷히고, 그 안에서 빌린
 * 덩이는 힙에 남는다. 반복 몸의 `free(p)` 줄이 어디 몇 번 있느냐(돌려주기 손잡이)가 네 결말을 가른다 —
 * 샘 · 새지 않음 · 돌려준 칸 쓰기 · 겹쳐 내주기.
 *
 * 기계 모형 (조각 `stack-vs-heap` · `manual-free` · `double-free` · `memory-leak` 과 같다)
 *   - 스택 칸 주소는 stackBase 부터. 바깥 틀이 outerNames 를, make 틀이 그 위에 makeNames 를 잡는다.
 *     잡혔지만 넣지 않은 칸은 비었다 (null 과 다르다)
 *   - 힙 칸 주소는 heapBase 부터. 할당기는 state = [새 땅 끝, 목록 길이, 힙 시작] · sizes(칸 수) ·
 *     freeAddr · freeSize(빈 자리 목록, 맨 앞 = 색인 state[1]-1) 를 가진다. allocate 는 목록을 앞에서부터
 *     보아 칸 수가 같은 첫 덩이를 꺼내고, 없으면 새 땅 끝에서 뗀다. release 는 덩이를 목록 맨 앞에 넣고
 *     아무것도 검사하지 않는다. 이 둘은 irs.ts 의 IR 과 같은 모양이다
 *   - 잃은 덩이 = 빌려 준 채(돌려받지 않은) 덩이 가운데 시작 주소가 주소를 담는 이름 칸(p · box · c · d)
 *     어디에도 없는 것. 걸음마다 다시 센다
 *   - 동률 규칙 — 목록에 칸 수가 같은 덩이가 여럿이면 맨 앞(가장 최근)이 이긴다. 이 데이터는 덩이가 모두
 *     3 칸이라 목록이 둘 이상인 판(두 번)에서 늘 걸린다
 *
 * 걸음 (한 판) — `#0 시작 · #1 p = null · 바퀴마다 [부름 · 돌아옴 · 몸의 줄마다 하나] · c · d`
 *
 * 이벤트 (silent 가 아닌 것은 모두 걸음 하나. 뒤에 sleep 또는 입력 대기)
 *   phase    { phase: 'fresh' | 'reuse' | 'release' }                         silent
 *   start    { rounds, mode, callee, lines: Line[], ...Snapshot }              #0 시작 모습
 *   bind     { name, kind: 'null' | 'fresh' | 'reuse', addr, listLength, landEnd, last, ...Snapshot }
 *   call     { round, addr, kind: 'fresh' | 'reuse', listLength, landEnd, ...Snapshot }
 *   return   { name, addr, lost: 잃게 된 주소 | -1, ...Snapshot }
 *   write    { addr, value, afterFree: boolean, useAfterFree, ...Snapshot }
 *   release  { addr, listLength, ...Snapshot }
 *
 *   Line     = { key: string; text: string; depth: number }   프로그램 한 줄 (구조에서 찍어 낸 가상 표기)
 *   Snapshot = { outer: Slot[]; make: Slot[]; blocks: Block[]; cells: Cell[]; freeList: number[];
 *                landEnd: number; line: string; callLine: string }
 *   Slot     = { name: string; at: number; kind: 'empty' | 'null' | 'int' | 'ptr'; value: number }
 *   Block    = { addr: number; size: number; status: 'held' | 'lost' | 'free' }
 *   Cell     = { addr: number; value: number }
 *   make 가 빈 배열이면 make 틀이 없다. freeList 는 앞(가장 최근)부터. callLine 은 부름 걸음에서만 비지 않는다
 *
 * phase 어휘 — `fresh`(새 땅에서 뗀다) · `reuse`(목록에서 꺼낸다) · `release`(목록 맨 앞에 넣는다).
 *   irs.ts 와 정확히 같다. 할당기가 움직이지 않는 걸음(p = null · 돌아옴 · 쓰기)에는 phase 가 없다
 *
 * 계기 — new-land-cells(새 땅에서 뗀 칸) · lost-blocks(지금 잃은 덩이) · use-after-free(돌려준 덩이에 쓴 횟수) ·
 *   free-list-length(지금 목록 길이) · frames-peak(판의 최고 틀 수). 판이 시작할 때 시작 값으로 되돌린다
 *
 * 손잡이 — rounds(바퀴 1..4) · free(돌려주기 0 안 함 · 1 쓰고 나서 · 2 쓰기 전에 · 3 두 번).
 *   한 판을 끝까지 밟고 입력을 기다렸다가 받은 값으로 다시 밟는다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BodyOp = 'write' | 'free';

export type AllocateAndFreeData = {
  type: 'allocate-and-free';
  stepMs: number;
  heapBase: number;
  stackBase: number;
  blockSize: number;
  roundsLadder: number[];
  freeLadder: number[];
  /** 돌려주기 값마다 반복 몸에서 `p = make(3)` 뒤에 오는 줄들 */
  bodies: Record<string, BodyOp[]>;
  /** 바깥 틀의 이름 — p · i · c · d 차례 */
  outerNames: string[];
  /** make 틀의 이름 — size · box 차례 */
  makeNames: string[];
  /** 판의 시작 손잡이 값 (구간의 default 와 같다) */
  rounds: number;
  free: number;
};

export type SlotKind = 'empty' | 'null' | 'int' | 'ptr';
export type Slot = { name: string; at: number; kind: SlotKind; value: number };
export type BlockStatus = 'held' | 'lost' | 'free';
export type Block = { addr: number; size: number; status: BlockStatus };
export type Cell = { addr: number; value: number };
export type Line = { key: string; text: string; depth: number };

/** 판 하나를 밟은 기록 — 검사와 설명 글의 수가 여기서 온다 */
export type RoundTrace = {
  steps: number;
  calls: { op: 'allocate' | 'release'; arg: number; result: number }[];
  state: number[];
  freeList: number[];
  listPeak: number;
  metrics: Record<string, number>;
  c: number;
  d: number;
  cells: Cell[];
};

// ─────────────────────────────────────────────────────────────────────────────
// 할당기 — irs.ts 의 allocate · release 와 같은 모양
// ─────────────────────────────────────────────────────────────────────────────

/** 목록 앞에서부터 칸 수가 size 인 첫 덩이를 꺼낸다. 없으면 새 땅 끝에서 뗀다 */
export function allocate(
  state: number[],
  sizes: number[],
  freeAddr: number[],
  freeSize: number[],
  size: number,
): { addr: number; reused: boolean } {
  let found = -1;
  let k = state[1] - 1;
  while (k >= 0) {
    if (freeSize[k] === size) {
      found = k;
      break;
    }
    k -= 1;
  }
  if (found >= 0) {
    const addr = freeAddr[found];
    let j = found;
    while (j < state[1] - 1) {
      freeAddr[j] = freeAddr[j + 1];
      freeSize[j] = freeSize[j + 1];
      j += 1;
    }
    state[1] -= 1;
    return { addr, reused: true };
  }
  const addr = state[0];
  const slot = addr - state[2];
  if (slot < 0 || slot + size > sizes.length) {
    throw new Error(`allocate-and-free: 힙 버퍼 넘침 — @${addr} 에서 ${size} 칸, 버퍼 ${sizes.length} 칸`);
  }
  sizes[slot] = size;
  state[0] += size;
  return { addr, reused: false };
}

/** 덩이를 목록 맨 앞에 넣는다. 이미 있는지 · 빌려 준 덩이인지 보지 않는다 */
export function release(
  state: number[],
  sizes: number[],
  freeAddr: number[],
  freeSize: number[],
  addr: number,
): void {
  const slot = addr - state[2];
  if (slot < 0 || slot >= sizes.length || sizes[slot] === 0) {
    throw new Error(`allocate-and-free: 새 땅에서 뗀 적 없는 주소 @${addr} 의 칸 수를 모른다`);
  }
  if (state[1] >= freeAddr.length) {
    throw new Error(`allocate-and-free: 빈 자리 목록 버퍼 넘침 — 길이 ${state[1]}, 버퍼 ${freeAddr.length}`);
  }
  freeAddr[state[1]] = addr;
  freeSize[state[1]] = sizes[slot];
  state[1] += 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// 데이터 → 버퍼 길이 · 프로그램 줄
// ─────────────────────────────────────────────────────────────────────────────

function bodyOf(data: AllocateAndFreeData, mode: number): BodyOp[] {
  const body = data.bodies[String(mode)];
  if (!Array.isArray(body)) throw new Error(`allocate-and-free: 돌려주기 ${mode} 의 몸이 bodies 에 없다`);
  for (const op of body) {
    if (op !== 'write' && op !== 'free') throw new Error(`allocate-and-free: 모르는 몸 줄 '${String(op)}'`);
  }
  return body;
}

function namesOf(data: AllocateAndFreeData): { p: string; i: string; c: string; d: string; size: string; box: string } {
  const [p, i, c, d] = data.outerNames;
  const [size, box] = data.makeNames;
  if (data.outerNames.length !== 4 || data.makeNames.length !== 2 || !p || !i || !c || !d || !size || !box) {
    throw new Error('allocate-and-free: outerNames 는 넷(p · i · c · d), makeNames 는 둘(size · box)이어야 한다');
  }
  return { p, i, c, d, size, box };
}

/** 사다리 끝값에서 버퍼 길이를 잡는다 — 힙 칸은 가장 많이 떼는 판, 목록은 가장 긴 목록 */
export function bufferLengths(data: AllocateAndFreeData): { cells: number; list: number } {
  let cells = 0;
  let list = 0;
  for (const n of data.roundsLadder) {
    for (const mode of data.freeLadder) {
      let land = 0;
      let len = 0;
      let peak = 0;
      const body = bodyOf(data, mode);
      // 셈만 — 할당기와 같은 규칙을 덩이 크기가 하나뿐인 이 데이터에 맞춰 센다
      const take = (): void => {
        if (len > 0) len -= 1;
        else land += data.blockSize;
      };
      for (let k = 0; k < n; k += 1) {
        take();
        for (const op of body) {
          if (op === 'free') {
            len += 1;
            peak = Math.max(peak, len);
          }
        }
      }
      take();
      take();
      cells = Math.max(cells, land);
      list = Math.max(list, peak);
    }
  }
  return { cells, list };
}

/** 틀을 세우는 함수의 이름 — 프로그램 글자와 무대의 틀 머리가 같이 쓴다 */
export const CALLEE = 'make';

/** 화면의 프로그램 — 구조에서 찍어 낸다 (가상 표기). 몸 줄의 key 는 종류와 차례라 판이 바뀌어도 이어진다 */
export function programLines(data: AllocateAndFreeData, rounds: number, mode: number): Line[] {
  const nm = namesOf(data);
  const lines: Line[] = [
    { key: 'make-head', text: `function ${CALLEE}(${nm.size})`, depth: 0 },
    { key: 'make-alloc', text: `let ${nm.box} = allocate(${nm.size})`, depth: 1 },
    { key: 'make-return', text: `return ${nm.box}`, depth: 1 },
    { key: 'p-null', text: `let ${nm.p} = null`, depth: 0 },
    { key: 'for', text: `for ${nm.i} from 1 to ${rounds}`, depth: 0 },
    { key: 'call', text: `${nm.p} = ${CALLEE}(${data.blockSize})`, depth: 1 },
  ];
  let frees = 0;
  for (const op of bodyOf(data, mode)) {
    if (op === 'write') lines.push({ key: 'write', text: `valueAt(${nm.p}) = ${nm.i}`, depth: 1 });
    else {
      frees += 1;
      lines.push({ key: `free-${frees}`, text: `free(${nm.p})`, depth: 1 });
    }
  }
  lines.push({ key: 'c', text: `let ${nm.c} = allocate(${data.blockSize})`, depth: 0 });
  lines.push({ key: 'd', text: `let ${nm.d} = allocate(${data.blockSize})`, depth: 0 });
  return lines;
}

function checkData(data: AllocateAndFreeData): void {
  if (!data || data.type !== 'allocate-and-free') throw new Error('allocate-and-free: initialData.type 이 다르다');
  for (const k of ['stepMs', 'heapBase', 'stackBase', 'blockSize', 'rounds', 'free'] as const) {
    if (typeof data[k] !== 'number') throw new Error(`allocate-and-free: ${k} 가 수가 아니다`);
  }
  if (!data.roundsLadder.includes(data.rounds)) throw new Error(`allocate-and-free: 시작 바퀴 ${data.rounds} 가 사다리 밖이다`);
  if (!data.freeLadder.includes(data.free)) throw new Error(`allocate-and-free: 시작 돌려주기 ${data.free} 가 사다리 밖이다`);
  namesOf(data);
  for (const mode of data.freeLadder) bodyOf(data, mode);
}


// ─────────────────────────────────────────────────────────────────────────────
// 한 판
// ─────────────────────────────────────────────────────────────────────────────

type Content = { kind: SlotKind; value: number };

/** 계기 다섯의 지금 값을 받는 자리 — 알고리즘은 차이만 보내는 헬퍼를, 검사는 기록을 건넨다 */
export type MetricSink = (m: {
  newLandCells: number;
  lostBlocks: number;
  useAfterFree: number;
  freeListLength: number;
  framesPeak: number;
}) => void;

/**
 * 판 하나를 밟는다. 끝까지 밟았으면 자취를, 취소됐으면 null 을 돌려준다.
 * 검사는 sleep 이 곧바로 true 를 주는 ctx 를 건네 자취만 얻는다.
 */
export async function playRound(
  ctx: ReactiveContext<AllocateAndFreeData>,
  rounds: number,
  mode: number,
  sink: MetricSink,
): Promise<RoundTrace | null> {
  const data = ctx.data;
  const nm = namesOf(data);
  const body = bodyOf(data, mode);
  const buf = bufferLengths(data);
  const state = [data.heapBase, 0, data.heapBase];
  const sizes = new Array<number>(buf.cells).fill(0);
  const freeAddr = new Array<number>(buf.list).fill(0);
  const freeSize = new Array<number>(buf.list).fill(0);
  const outer = new Map<string, Content>();
  let make: Map<string, Content> | null = null;
  const cells = new Map<number, number>();
  const lent = new Set<number>();
  const calls: RoundTrace['calls'] = [];
  const ptrNames = [nm.p, nm.c, nm.d];
  let framesPeak = 1;
  let useAfterFree = 0;
  let listPeak = 0;
  let steps = 0;

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const lostNow = (): number[] => {
    const held = new Set<number>();
    for (const name of ptrNames) {
      const v = outer.get(name);
      if (v && v.kind === 'ptr') held.add(v.value);
    }
    const box = make?.get(nm.box);
    if (box && box.kind === 'ptr') held.add(box.value);
    return [...lent].filter((b) => !held.has(b)).sort((a, b) => a - b);
  };

  const listFront = (): number[] => {
    const out: number[] = [];
    for (let k = state[1] - 1; k >= 0; k -= 1) out.push(freeAddr[k]);
    return out;
  };

  const cellList = (): Cell[] =>
    [...cells.entries()].sort((a, b) => a[0] - b[0]).map(([addr, value]) => ({ addr, value }));

  const slotsOf = (names: string[], m: Map<string, Content>, base: number): Slot[] =>
    names.map((name, k) => {
      const v = m.get(name);
      return { name, at: base + k, kind: v ? v.kind : 'empty', value: v ? v.value : 0 };
    });

  const snapshot = (line: string, callLine = ''): Record<string, unknown> => {
    const lost = new Set(lostNow());
    const blocks: Block[] = [];
    for (let a = state[2]; a < state[0]; ) {
      const size = sizes[a - state[2]];
      if (!size) throw new Error(`allocate-and-free: @${a} 에 덩이 머리가 없다`);
      const status: BlockStatus = lent.has(a) ? (lost.has(a) ? 'lost' : 'held') : 'free';
      blocks.push({ addr: a, size, status });
      a += size;
    }
    return {
      outer: slotsOf(data.outerNames, outer, data.stackBase),
      make: make ? slotsOf(data.makeNames, make, data.stackBase + data.outerNames.length) : [],
      blocks,
      cells: cellList(),
      freeList: listFront(),
      landEnd: state[0],
      line,
      callLine,
    };
  };

  const report = (): void => {
    listPeak = Math.max(listPeak, state[1]);
    steps += 1;
    sink({
      newLandCells: state[0] - data.heapBase,
      lostBlocks: lostNow().length,
      useAfterFree,
      freeListLength: state[1],
      framesPeak,
    });
  };

  /** 할당기를 부르고 phase 를 켠다 — 걸음 경계는 부르는 쪽이 둔다 */
  const take = async (): Promise<{ addr: number; reused: boolean }> => {
    const got = allocate(state, sizes, freeAddr, freeSize, data.blockSize);
    calls.push({ op: 'allocate', arg: data.blockSize, result: got.addr });
    lent.add(got.addr);
    if (got.reused) await phase('reuse');
    else await phase('fresh');
    return got;
  };

  // #0 시작 — 바깥 틀 칸이 잡혀 비어 있다
  await ctx.emit({ type: 'start', payload: { rounds, mode, callee: CALLEE, lines: programLines(data, rounds, mode), ...snapshot('') } });
  report();
  if (!(await ctx.sleep(data.stepMs))) return null;

  // #1 let p = null
  outer.set(nm.p, { kind: 'null', value: 0 });
  await ctx.emit({
    type: 'bind',
    payload: { name: nm.p, kind: 'null', addr: -1, listLength: state[1], landEnd: state[0], last: false, ...snapshot('p-null') },
  });
  report();
  if (!(await ctx.sleep(data.stepMs))) return null;

  for (let round = 1; round <= rounds; round += 1) {
    if (ctx.cancelled) return null;
    // 부름 — i 가 들어가고 make 틀이 서며 할당기가 덩이를 내준다
    outer.set(nm.i, { kind: 'int', value: round });
    make = new Map<string, Content>([[nm.size, { kind: 'int', value: data.blockSize }]]);
    framesPeak = Math.max(framesPeak, 2);
    const got = await take();
    make.set(nm.box, { kind: 'ptr', value: got.addr });
    await ctx.emit({
      type: 'call',
      payload: {
        round,
        addr: got.addr,
        kind: got.reused ? 'reuse' : 'fresh',
        listLength: state[1],
        landEnd: state[0],
        ...snapshot('make-alloc', 'call'),
      },
    });
    report();
    if (!(await ctx.sleep(data.stepMs))) return null;

    // 돌아옴 — make 틀이 걷히고 p 에 주소가 든다. 앞 주소를 덮으면 그 덩이를 잃을 수 있다
    const before = new Set(lostNow());
    make = null;
    outer.set(nm.p, { kind: 'ptr', value: got.addr });
    const newlyLost = lostNow().filter((b) => !before.has(b));
    await ctx.emit({
      type: 'return',
      payload: { name: nm.p, addr: got.addr, lost: newlyLost[0] ?? -1, ...snapshot('call') },
    });
    report();
    if (!(await ctx.sleep(data.stepMs))) return null;

    let frees = 0;
    for (const op of body) {
      if (ctx.cancelled) return null;
      const pv = outer.get(nm.p);
      if (!pv || pv.kind !== 'ptr') throw new Error(`allocate-and-free: ${nm.p} 에 주소가 없다`);
      if (op === 'write') {
        // 쓰기 — p 가 가리키는 덩이의 첫 칸에 i. 돌려준 덩이면 use-after-free
        const afterFree = !lent.has(pv.value);
        if (afterFree) useAfterFree += 1;
        cells.set(pv.value, round);
        await ctx.emit({
          type: 'write',
          payload: { addr: pv.value, value: round, afterFree, useAfterFree, ...snapshot('write') },
        });
      } else {
        // 돌려주기 — 목록 맨 앞에. 검사하지 않는다
        frees += 1;
        release(state, sizes, freeAddr, freeSize, pv.value);
        calls.push({ op: 'release', arg: pv.value, result: -1 });
        lent.delete(pv.value);
        await phase('release');
        await ctx.emit({
          type: 'release',
          payload: { addr: pv.value, listLength: state[1], ...snapshot(`free-${frees}`) },
        });
      }
      report();
      if (!(await ctx.sleep(data.stepMs))) return null;
    }
  }

  // let c = allocate(3) · let d = allocate(3) — d 걸음이 판의 끝 모습이다 (뒤는 입력 대기)
  for (const name of [nm.c, nm.d]) {
    if (ctx.cancelled) return null;
    const got = await take();
    outer.set(name, { kind: 'ptr', value: got.addr });
    const last = name === nm.d;
    await ctx.emit({
      type: 'bind',
      payload: {
        name,
        kind: got.reused ? 'reuse' : 'fresh',
        addr: got.addr,
        listLength: state[1],
        landEnd: state[0],
        last,
        ...snapshot(last ? 'd' : 'c'),
      },
    });
    report();
    if (!last && !(await ctx.sleep(data.stepMs))) return null;
  }

  const cv = outer.get(nm.c);
  const dv = outer.get(nm.d);
  return {
    steps,
    calls,
    state: [...state],
    freeList: listFront(),
    listPeak,
    metrics: {
      'new-land-cells': state[0] - data.heapBase,
      'lost-blocks': lostNow().length,
      'use-after-free': useAfterFree,
      'free-list-length': state[1],
      'frames-peak': framesPeak,
    },
    c: cv?.value ?? -1,
    d: dv?.value ?? -1,
    cells: cellList(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 알고리즘 — 한 판 → 입력 대기 → 받은 값으로 다시
// ─────────────────────────────────────────────────────────────────────────────

export async function allocateAndFreeAlgorithm(ctx0: FacetContext<AllocateAndFreeData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<AllocateAndFreeData>;
  const data = ctx.data;
  checkData(data);
  let rounds = data.rounds;
  let mode = data.free;

  // 지금 보이는 계기 값 — 차이만 보낸다. 처음 한 번은 차이가 0 이어도 보낸다
  const shown = new Map<string, number>();
  const show = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };
  const sink: MetricSink = (m) => {
    show('new-land-cells', m.newLandCells);
    show('lost-blocks', m.lostBlocks);
    show('use-after-free', m.useAfterFree);
    show('free-list-length', m.freeListLength);
    show('frames-peak', m.framesPeak);
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const trace = await playRound(ctx, rounds, mode, sink);
      if (!trace) return;

      // 입력 대기 — 우리 손잡이만 받는다
      let changed = false;
      while (!changed) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput<{ type: string; payload?: { value?: unknown } }>();
        if (ctx.cancelled) return;
        const value = input.payload?.value;
        if (input.type === 'rounds') {
          if (typeof value !== 'number' || !data.roundsLadder.includes(value)) {
            throw new Error(`allocate-and-free: 바퀴 값 ${String(value)} 가 사다리 밖이다`);
          }
          rounds = value;
          changed = true;
        } else if (input.type === 'free') {
          if (typeof value !== 'number' || !data.freeLadder.includes(value)) {
            throw new Error(`allocate-and-free: 돌려주기 값 ${String(value)} 가 사다리 밖이다`);
          }
          mode = value;
          changed = true;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
