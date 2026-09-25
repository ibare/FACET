/**
 * 파일 블록 배치 — 같은 파일의 k 번째 블록을 두 구조로 찾는다.
 *
 * 한 파일(diary.txt)이 디스크 블록 16 개 위에 놓여 있다. 두 구조가 같은 차례를 말한다.
 *   - FAT   : 디렉터리 항목이 첫 블록을 주고, 표 칸 b 에 다음 블록 번호가 적혀 있다.
 *             k 번째 블록에 닿으려면 표 칸 k−1 개를 차례로 읽고 데이터 블록 하나를 읽는다 → k 칸.
 *   - inode : inode 에 직접 칸 · 단일 간접 칸 · 이중 간접 칸이 있다. 번호 블록 하나에 번호가 per 개.
 *             직접이면 1 칸, 단일 간접이면 2 칸, 이중 간접이면 3 칸 (데이터 블록 포함).
 *
 * 규약
 *   - 읽은 칸 = 표 칸 · 번호 블록 · 데이터 블록 하나를 읽을 때마다 1.
 *     inode 자체와 디렉터리 항목은 이미 손에 있다고 친다 (세지 않는다).
 *   - FAT 값 −1 은 END, −2 는 빈칸. 번호 블록의 쓰지 않는 칸도 −2.
 *   - 빈칸에 닿은 사슬 · k 보다 먼저 끝나는 사슬 · 빈 번호 칸 · 사다리 밖 k 는 던진다.
 *   - 판을 시작할 때마다 두 구조로 파일 전체(1..파일 길이)를 풀어 보고, 차례가 다르면 던진다.
 *   - 동률 규칙은 없다 — 고르는 자리가 없는 셈이다.
 *
 * 걸음 (한 판) — 걸음 경계는 `ctx.sleep` 과 입력 대기뿐이다.
 *   걸음 0     : `round-start` — 디렉터리 항목 둘과 이번 판의 길. 계기 0 으로 되돌림.
 *   inode 줄   : 칸 하나 읽기마다 `phase` → `inode-read` → 계기 +1 → sleep
 *   FAT 줄     : 표 칸 하나마다 `phase` → `fat-read`(role 'hop') → +1 → sleep,
 *                마지막에 데이터 블록 `fat-read`(role 'data') → +1 → sleep
 *   그다음 `waitForInput` 으로 손잡이를 기다린다.
 *
 * 이벤트
 *   round-start  { k, target, fileName, inodeNumber, fatFirst,
 *                  inodeReads: InodeRead[], fatReads: FatRead[] }           silent 아님
 *                 — 이번 판의 길 전체. 화면은 이것으로 길의 모양(깊이 · 칸 자리)을 옮겨 두고
 *                   읽기 이벤트가 올 때마다 그 칸을 켠다
 *   inode-read   InodeRead & { reads }                                      silent 아님
 *   fat-read     FatRead & { reads }                                        silent 아님
 *   phase        { phase }                                                  silent
 *
 *   InodeRead = { order, block, role: 'direct'|'one-level'|'two-level'|'mid'|'data',
 *                 from: { kind: 'slot', slot } | { kind: 'cell', block, cell } }
 *                 slot 은 inode 칸 번호 (0..직접 칸 수−1 직접, 직접 칸 수 = 단일 간접, +1 = 이중 간접)
 *   FatRead   = { order, block, role: 'hop'|'data', next }   next 는 hop 이면 읽어 얻은 번호, data 면 −1
 *   order 는 그 줄 안에서 1 부터.
 *
 * phase 어휘 (irs.ts 와 정확히 같다)
 *   inode-direct · inode-one-level · inode-two-level · inode-mid · inode-data · fat-hop · fat-data
 *
 * 계기
 *   inode-reads — inode 줄이 이번 판에 읽은 칸
 *   fat-reads   — FAT 줄이 이번 판에 읽은 칸
 *   판 시작에 차이로 0 으로 되돌린다. 처음 한 번은 차이 0 이어도 보낸다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export const END_MARK = -1;
export const EMPTY_MARK = -2;

export type PointerBlock = {
  block: number;
  cells: number[];
};

export type FileBlockPlacementData = {
  type: 'file-block-placement';
  stepMs: number;
  motionMs: number;
  fileName: string;
  blockCount: number;
  perBlock: number;
  fatFirst: number;
  fat: number[];
  inodeNumber: number;
  direct: number[];
  oneLevel: number;
  twoLevel: number;
  pointerBlocks: PointerBlock[];
  blockLadder: number[];
  blockIndex: number;
};

export type InodeRole = 'direct' | 'one-level' | 'two-level' | 'mid' | 'data';
export type InodeFrom = { kind: 'slot'; slot: number } | { kind: 'cell'; block: number; cell: number };

export interface InodeRead {
  order: number;
  block: number;
  role: InodeRole;
  phase: 'inode-direct' | 'inode-one-level' | 'inode-two-level' | 'inode-mid' | 'inode-data';
  from: InodeFrom;
}

export interface FatRead {
  order: number;
  block: number;
  role: 'hop' | 'data';
  next: number;
}

function assertBlock(data: FileBlockPlacementData, b: number, what: string): void {
  if (!Number.isInteger(b) || b < 0 || b >= data.blockCount) {
    throw new Error(`[fileBlockPlacement] ${what}: 블록 번호 ${b} 는 0..${data.blockCount - 1} 밖이다`);
  }
}

function validate(data: FileBlockPlacementData): void {
  if (data.type !== 'file-block-placement') throw new Error('[fileBlockPlacement] initialData.type 이 다르다');
  if (!Number.isInteger(data.blockCount) || data.blockCount <= 0) throw new Error('[fileBlockPlacement] blockCount 가 없다');
  if (!Number.isInteger(data.perBlock) || data.perBlock <= 0) throw new Error('[fileBlockPlacement] perBlock 이 없다');
  if (data.fat.length !== data.blockCount) throw new Error('[fileBlockPlacement] FAT 칸 수가 블록 수와 다르다');
  for (const v of data.fat) {
    if (v !== END_MARK && v !== EMPTY_MARK) assertBlock(data, v, 'FAT 칸 값');
  }
  assertBlock(data, data.fatFirst, 'FAT 첫 블록');
  for (const d of data.direct) assertBlock(data, d, 'inode 직접 칸');
  assertBlock(data, data.oneLevel, '단일 간접 칸');
  assertBlock(data, data.twoLevel, '이중 간접 칸');
  for (const pb of data.pointerBlocks) {
    assertBlock(data, pb.block, '번호 블록');
    if (pb.cells.length !== data.perBlock) throw new Error(`[fileBlockPlacement] 번호 블록 ${pb.block} 의 칸 수가 ${data.perBlock} 가 아니다`);
    for (const c of pb.cells) if (c !== EMPTY_MARK) assertBlock(data, c, `번호 블록 ${pb.block} 의 칸`);
  }
  if (data.blockLadder.length === 0) throw new Error('[fileBlockPlacement] 사다리가 비었다');
  if (!data.blockLadder.includes(data.blockIndex)) throw new Error('[fileBlockPlacement] 첫 판 k 가 사다리에 없다');
}

/** 번호 블록 내용을 IR 과 같은 평면 배열로 편다 — ptr[b * per + j] = 블록 b 의 j 칸, 쓰지 않는 칸 −2. */
export function buildPointerArray(data: FileBlockPlacementData): number[] {
  const ptr = new Array<number>(data.blockCount * data.perBlock).fill(EMPTY_MARK);
  for (const pb of data.pointerBlocks) {
    for (let j = 0; j < data.perBlock; j++) ptr[pb.block * data.perBlock + j] = pb.cells[j]!;
  }
  return ptr;
}

function readPtr(data: FileBlockPlacementData, ptr: number[], block: number, cell: number): number {
  const v = ptr[block * data.perBlock + cell];
  if (v === undefined || v === EMPTY_MARK) {
    throw new Error(`[fileBlockPlacement] 번호 블록 ${block} 의 칸 ${cell + 1} 이 비어 있다`);
  }
  return v;
}

/** inode 로 k 번째 블록까지 읽는 칸들. IR 의 inodeBlock 과 같은 갈래. */
export function inodeWalk(data: FileBlockPlacementData, ptr: number[], k: number): InodeRead[] {
  if (!Number.isInteger(k) || k < 1) throw new Error(`[fileBlockPlacement] k=${k} 는 1 이상 정수가 아니다`);
  const nd = data.direct.length;
  const per = data.perBlock;
  if (k <= nd) {
    return [{ order: 1, block: data.direct[k - 1]!, role: 'direct', phase: 'inode-direct', from: { kind: 'slot', slot: k - 1 } }];
  }
  let j = k - nd - 1;
  if (j < per) {
    const b = readPtr(data, ptr, data.oneLevel, j);
    return [
      { order: 1, block: data.oneLevel, role: 'one-level', phase: 'inode-one-level', from: { kind: 'slot', slot: nd } },
      { order: 2, block: b, role: 'data', phase: 'inode-data', from: { kind: 'cell', block: data.oneLevel, cell: j } },
    ];
  }
  j = j - per;
  if (j >= per * per) throw new Error(`[fileBlockPlacement] k=${k} 는 이중 간접이 닿는 끝을 넘는다`);
  const midCell = Math.floor(j / per);
  const mid = readPtr(data, ptr, data.twoLevel, midCell);
  const lastCell = j % per;
  const b = readPtr(data, ptr, mid, lastCell);
  return [
    { order: 1, block: data.twoLevel, role: 'two-level', phase: 'inode-two-level', from: { kind: 'slot', slot: nd + 1 } },
    { order: 2, block: mid, role: 'mid', phase: 'inode-mid', from: { kind: 'cell', block: data.twoLevel, cell: midCell } },
    { order: 3, block: b, role: 'data', phase: 'inode-data', from: { kind: 'cell', block: mid, cell: lastCell } },
  ];
}

/** FAT 로 k 번째 블록까지 읽는 칸들 — 표 칸 k−1 개, 그다음 데이터 블록. IR 의 fatBlock 과 같은 차례. */
export function fatWalk(data: FileBlockPlacementData, k: number): FatRead[] {
  if (!Number.isInteger(k) || k < 1) throw new Error(`[fileBlockPlacement] k=${k} 는 1 이상 정수가 아니다`);
  const out: FatRead[] = [];
  let b = data.fatFirst;
  for (let i = 1; i <= k - 1; i++) {
    const nextBlock = data.fat[b];
    if (nextBlock === undefined || nextBlock === EMPTY_MARK) throw new Error(`[fileBlockPlacement] FAT 사슬이 빈칸 ${b} 에 닿았다`);
    if (nextBlock === END_MARK) throw new Error(`[fileBlockPlacement] FAT 사슬이 k=${k} 보다 먼저 끝났다`);
    out.push({ order: i, block: b, role: 'hop', next: nextBlock });
    b = nextBlock;
  }
  out.push({ order: k, block: b, role: 'data', next: END_MARK });
  return out;
}

/** FAT 사슬 길이 — END 까지. 빈칸에 닿거나 블록 수보다 길면 던진다. */
export function fileLength(data: FileBlockPlacementData): number {
  let b = data.fatFirst;
  for (let n = 1; n <= data.blockCount; n++) {
    const v = data.fat[b];
    if (v === END_MARK) return n;
    if (v === undefined || v === EMPTY_MARK) throw new Error(`[fileBlockPlacement] FAT 사슬이 빈칸 ${b} 에 닿았다`);
    b = v;
  }
  throw new Error('[fileBlockPlacement] FAT 사슬이 END 없이 돈다');
}

/** 두 구조가 파일 전체에서 같은 차례를 말하는지 본다. 다르면 던진다. 차례를 돌려준다. */
export function checkSameOrder(data: FileBlockPlacementData, ptr: number[]): number[] {
  const n = fileLength(data);
  const order: number[] = [];
  for (let k = 1; k <= n; k++) {
    const viaFat = fatWalk(data, k).at(-1)!.block;
    const viaInode = inodeWalk(data, ptr, k).at(-1)!.block;
    if (viaFat !== viaInode) {
      throw new Error(`[fileBlockPlacement] k=${k}: FAT 은 블록 ${viaFat}, inode 는 블록 ${viaInode} — 같은 파일이 아니다`);
    }
    order.push(viaFat);
  }
  for (const k of data.blockLadder) {
    if (!Number.isInteger(k) || k < 1 || k > n) throw new Error(`[fileBlockPlacement] 사다리 값 ${k} 가 파일 길이 ${n} 밖이다`);
  }
  return order;
}

export async function fileBlockPlacementAlgorithm(baseCtx: FacetContext<FileBlockPlacementData>): Promise<void> {
  const ctx = baseCtx as ReactiveContext<FileBlockPlacementData>;
  const data = ctx.data;
  validate(data);
  const ptr = buildPointerArray(data);
  const stepWait = data.stepMs + data.motionMs;

  const shown = new Map<string, number>();
  const showMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    ctx.metric(name, prev === undefined ? value : value - prev);
    shown.set(name, value);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let k = data.blockIndex;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      checkSameOrder(data, ptr);
      const inodeReads = inodeWalk(data, ptr, k);
      const fatReads = fatWalk(data, k);
      const target = fatReads.at(-1)!.block;

      // 걸음 0 — 디렉터리 항목 둘과 이번 판의 길. 계기는 0 으로.
      showMetric('inode-reads', 0);
      showMetric('fat-reads', 0);
      await ctx.emit({
        type: 'round-start',
        payload: {
          k,
          target,
          fileName: data.fileName,
          inodeNumber: data.inodeNumber,
          fatFirst: data.fatFirst,
          inodeReads: inodeReads.map((r) => ({ order: r.order, block: r.block, role: r.role, from: r.from })),
          fatReads,
        },
      });
      if (!(await ctx.sleep(stepWait))) return;

      // inode 줄 — 칸 하나 읽기마다 한 걸음
      for (const r of inodeReads) {
        if (ctx.cancelled) return;
        if (r.phase === 'inode-direct') await phase('inode-direct');
        else if (r.phase === 'inode-one-level') await phase('inode-one-level');
        else if (r.phase === 'inode-two-level') await phase('inode-two-level');
        else if (r.phase === 'inode-mid') await phase('inode-mid');
        else await phase('inode-data');
        showMetric('inode-reads', r.order);
        await ctx.emit({
          type: 'inode-read',
          payload: { order: r.order, block: r.block, role: r.role, from: r.from, reads: r.order },
        });
        if (!(await ctx.sleep(stepWait))) return;
      }

      // FAT 줄 — 표 칸 k−1 개, 그다음 데이터 블록
      for (const r of fatReads) {
        if (ctx.cancelled) return;
        if (r.role === 'hop') await phase('fat-hop');
        else await phase('fat-data');
        showMetric('fat-reads', r.order);
        await ctx.emit({
          type: 'fat-read',
          payload: { order: r.order, block: r.block, role: r.role, next: r.next, reads: r.order },
        });
        if (!(await ctx.sleep(stepWait))) return;
      }

      // 손잡이를 기다린다
      let nextK: number | null = null;
      while (nextK === null) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'blockIndex') continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) continue;
        const v = (p as { value?: unknown }).value;
        if (typeof v !== 'number' || !data.blockLadder.includes(v)) {
          throw new Error(`[fileBlockPlacement] 손잡이 값 ${String(v)} 가 사다리 ${data.blockLadder.join(',')} 밖이다`);
        }
        nextK = v;
      }
      k = nextK;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
