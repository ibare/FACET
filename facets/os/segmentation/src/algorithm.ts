/**
 * segmentation — 덩이마다 제 길이로 빈 틈에 넣는다. 빈 몫의 합이 넉넉해도 어느 한 틈에도
 * 못 들어가는 때가 오고, 틈 고르는 규칙은 그 자리만 옮긴다. 고정 칸은 늘 들어가는 대신
 * 덩이 안쪽에 남는 몫을 낸다.
 *
 * ## 모형 (`initialData` 가 1차 데이터)
 * - 메모리 `memoryKiB` 칸, 칸 하나 = 1 KiB. 칸 값은 덩이 번호(`blocks` 의 색인) 또는 -1(빈 칸)
 * - 요청 열 `requests` — 들어옴(덩이 · 크기) · 나감(덩이) · 셋째로 나감(`leaver` 손잡이가 `leavers` 에서 고른다)
 * - 배치 `fit` — 0 처음 맞는 틈 · 1 꼭 맞는 틈 · 2 가장 큰 틈 · 3 고정 칸(`frameKiB` 프레임)
 *
 * ## 규약
 * - 틈 = 이어진 빈 칸. 이웃한 빈 칸은 하나의 틈. 옮겨 붙이기(압축)는 하지 않는다
 * - 넣는 자리는 고른 틈의 앞 끝(주소가 낮은 쪽)
 * - 동률: 꼭 맞는 틈 · 가장 큰 틈에서 길이가 같으면 주소가 낮은 틈 (`findHoleAt` 이 더 짧은 · 더 긴 틈만
 *   바꿔 들어 앞의 것이 남는다). 이 데이터 여덟 판에서는 걸리지 않는다 — `countTies` 가 센다
 * - 고정 칸: 조각 수 = (크기 + frameKiB - 1) // frameKiB. 빈 프레임이 모자라면 못 들어간다. 들어가면 번호 낮은
 *   빈 프레임부터 하나씩, 프레임은 통째로 그 덩이 것 — 마지막 조각이 못 채운 몫이 안쪽 낭비
 * - 못 들어가면 그 요청만 버리고 판은 이어진다
 *
 * ## 이벤트
 * - `round` (걸음 #0) — `{ fit, leaver, memoryKiB, frameKiB, blocks: string[],
 *     requests: { kind: 'in' | 'out', block: string, size: number }[], state: SegState }`
 * - `place` (걸음) — `{ step, block, size, start, end, frames: number[], state: SegState }`.
 *     틈에 넣으면 `start`..`end`(끝 제외) 칸 · `frames` 빈 배열, 고정 칸이면 `frames` 에 받은 프레임 · `start`/`end` -1
 * - `release` (걸음) — `{ step, block, state: SegState }`
 * - `reject` (걸음) — `{ step, block, size, state: SegState }`
 * - `phase` (silent) — `{ phase: 'place' | 'release' | 'reject' }`
 *
 * `SegState` = `{ memory: number[], pieces: { block, start, len, used }[], holes: { start, len }[],
 *   freeTotal, largestHole, insideWaste, rejected }` — 지금 모습. 조각(piece)은 칸에 앉은 덩이의 이어진 토막
 *   (고정 칸이면 프레임 하나), `used` 는 그 토막에서 덩이가 실제로 쓰는 칸 수.
 *
 * ## phase 어휘 (irs.ts 와 같다)
 * `place` · `release` · `reject` — 요청 하나가 한 걸음이라 걸음마다 하나가 켜진다.
 *
 * ## 계기
 * - `free-total` 빈 몫 합 (KiB) · `largest-hole` 가장 큰 틈 (KiB) · `inside-waste` 안쪽 낭비 (KiB) — 지금 상태
 * - `rejected` 못 들어간 요청 수 — 판 안에서 누적
 * 넷 다 "지금 값을 들고 차이만 보내는" 헬퍼로 맞춘다. 판이 바뀌면 #0 값(32 · 32 · 0 · 0)으로 되돌린다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 요청 한 줄. `out-leaver` 는 셋째로 나가는 줄 — 누가 나가는지는 `leaver` 손잡이가 정한다. */
export type SegmentationRequest =
  | { kind: 'in'; block: string; size: number }
  | { kind: 'out'; block: string }
  | { kind: 'out-leaver' };

export type SegmentationData = {
  type: 'segmentation';
  stepMs: number;
  memoryKiB: number;
  frameKiB: number;
  blocks: string[];
  requests: SegmentationRequest[];
  leavers: string[];
  leaverLadder: number[];
  fitLadder: number[];
  leaver: number;
  fit: number;
};

/** 손잡이 값이 정해진 뒤의 요청 한 줄 (셋째로 나감이 풀린 것). */
export type ResolvedRequest = { kind: 'in' | 'out'; block: string; size: number };

export type SegPiece = { block: string; start: number; len: number; used: number };
export type SegHole = { start: number; len: number };

export type SegState = {
  memory: number[];
  pieces: SegPiece[];
  holes: SegHole[];
  freeTotal: number;
  largestHole: number;
  insideWaste: number;
  rejected: number;
};

export type SegStep = {
  step: number;
  kind: 'place' | 'release' | 'reject';
  block: string;
  size: number;
  start: number;
  end: number;
  frames: number[];
  state: SegState;
};

export const FIT_FIXED = 3;

/** 데이터가 셈할 수 있는 모양인지 본다. 아니면 무엇이 틀렸는지 담아 던진다. */
export function checkSegmentationData(data: SegmentationData): void {
  if (!Number.isInteger(data.memoryKiB) || data.memoryKiB <= 0) {
    throw new Error(`segmentation: memoryKiB 가 양의 정수가 아니다 (${String(data.memoryKiB)})`);
  }
  if (!Number.isInteger(data.frameKiB) || data.frameKiB <= 0 || data.memoryKiB % data.frameKiB !== 0) {
    throw new Error(`segmentation: frameKiB ${String(data.frameKiB)} 가 memoryKiB ${data.memoryKiB} 를 나누지 않는다`);
  }
  if (data.leavers.length !== data.leaverLadder.length) {
    throw new Error('segmentation: leavers 와 leaverLadder 의 길이가 다르다');
  }
  data.leaverLadder.forEach((v, i) => {
    if (v !== i) throw new Error(`segmentation: leaverLadder[${i}] = ${v} — 0.. 순번이어야 한다`);
  });
  for (const nm of data.leavers) {
    if (!data.blocks.includes(nm)) throw new Error(`segmentation: 셋째로 나갈 덩이 ${nm} 가 blocks 에 없다`);
  }
  for (const v of data.fitLadder) {
    if (v !== 0 && v !== 1 && v !== 2 && v !== FIT_FIXED) {
      throw new Error(`segmentation: 모르는 배치 값 ${v}`);
    }
  }
  if (!data.fitLadder.includes(data.fit)) throw new Error(`segmentation: 첫 배치 ${data.fit} 가 사다리 밖이다`);
  if (!data.leaverLadder.includes(data.leaver)) {
    throw new Error(`segmentation: 첫 셋째로 나감 ${data.leaver} 가 사다리 밖이다`);
  }
}

/** 셋째로 나감을 풀어 요청 열을 확정한다. */
export function resolveRequests(data: SegmentationData, leaver: number): ResolvedRequest[] {
  const who = data.leavers[leaver];
  if (who === undefined) throw new Error(`segmentation: 셋째로 나감 ${leaver} 가 leavers 밖이다`);
  return data.requests.map((r) => {
    if (r.kind === 'in') {
      if (!data.blocks.includes(r.block)) throw new Error(`segmentation: 모르는 덩이 ${r.block}`);
      if (!Number.isInteger(r.size) || r.size <= 0) throw new Error(`segmentation: ${r.block} 의 크기가 틀렸다`);
      return { kind: 'in', block: r.block, size: r.size };
    }
    if (r.kind === 'out') {
      if (!data.blocks.includes(r.block)) throw new Error(`segmentation: 모르는 덩이 ${r.block}`);
      return { kind: 'out', block: r.block, size: 0 };
    }
    if (r.kind === 'out-leaver') return { kind: 'out', block: who, size: 0 };
    throw new Error(`segmentation: 모르는 요청 종류 ${JSON.stringify(r)}`);
  });
}

/** IR 의 `runRequests` 가 받는 번호 배열 — kind 0 들어옴 · 1 나감, who 는 덩이 번호, 나감의 size 는 0. */
export function encodeRequests(
  blocks: string[],
  reqs: ResolvedRequest[],
): { kind: number[]; who: number[]; size: number[] } {
  return {
    kind: reqs.map((r) => (r.kind === 'in' ? 0 : 1)),
    who: reqs.map((r) => {
      const i = blocks.indexOf(r.block);
      if (i < 0) throw new Error(`segmentation: 모르는 덩이 ${r.block}`);
      return i;
    }),
    size: reqs.map((r) => r.size),
  };
}

/** IR 의 `findHole` 과 같은 셈 — 맞는 틈의 시작 칸, 없으면 -1. 칸 끝(k == 길이)을 벽으로 친다. */
export function findHoleAt(memory: number[], want: number, fit: number): number {
  let pick = -1;
  let pickLen = 0;
  let run = 0;
  let start = 0;
  for (let k = 0; k <= memory.length; k++) {
    const wall = k < memory.length && memory[k] === -1 ? 0 : 1;
    if (wall === 0) {
      if (run === 0) start = k;
      run += 1;
    } else {
      if (run >= want) {
        let better = false;
        if (pick === -1) better = true;
        else if (fit === 1 && run < pickLen) better = true;
        else if (fit === 2 && run > pickLen) better = true;
        if (better) {
          pick = start;
          pickLen = run;
        }
      }
      run = 0;
    }
  }
  return pick;
}

/** 이어진 빈 칸들. */
export function holesOf(memory: number[]): SegHole[] {
  const out: SegHole[] = [];
  let run = 0;
  let start = 0;
  for (let k = 0; k <= memory.length; k++) {
    if (k < memory.length && memory[k] === -1) {
      if (run === 0) start = k;
      run += 1;
    } else {
      if (run > 0) out.push({ start, len: run });
      run = 0;
    }
  }
  return out;
}

/** 이 요청에서 동률(길이가 같은 가장 짧은 · 가장 긴 맞는 틈이 둘 이상)이 결과를 가를 수 있었는가. */
export function isTie(memory: number[], want: number, fit: number): boolean {
  if (fit !== 1 && fit !== 2) return false;
  const fits = holesOf(memory).filter((h) => h.len >= want);
  if (fits.length < 2) return false;
  const target = fit === 1 ? Math.min(...fits.map((h) => h.len)) : Math.max(...fits.map((h) => h.len));
  return fits.filter((h) => h.len === target).length > 1;
}

/** 칸 배열에서 지금 모습을 셈한다. 고정 칸이면 토막을 프레임 경계에서 자르고 쓰는 칸을 센다. */
export function stateOf(
  memory: number[],
  blocks: string[],
  sizes: Map<string, number>,
  fit: number,
  frameKiB: number,
  rejected: number,
): SegState {
  const pieces: SegPiece[] = [];
  const seen = new Map<string, number>(); // 덩이 → 지금까지 센 칸
  let k = 0;
  while (k < memory.length) {
    const v = memory[k];
    if (v === undefined) throw new Error(`segmentation: 칸 ${k} 가 비었다`);
    if (v === -1) {
      k += 1;
      continue;
    }
    const block = blocks[v];
    if (block === undefined) throw new Error(`segmentation: 칸 ${k} 의 덩이 번호 ${v} 가 blocks 밖이다`);
    let end = k + 1;
    while (end < memory.length && memory[end] === v && (fit !== FIT_FIXED || end % frameKiB !== 0)) end += 1;
    const size = sizes.get(block);
    if (size === undefined) throw new Error(`segmentation: ${block} 의 크기를 모른다`);
    const before = seen.has(block) ? seen.get(block)! : 0;
    const len = end - k;
    const used = Math.max(0, Math.min(len, size - before));
    seen.set(block, before + len);
    pieces.push({ block, start: k, len, used });
    k = end;
  }
  const holes = holesOf(memory);
  const freeTotal = holes.reduce((s, h) => s + h.len, 0);
  const largestHole = holes.reduce((m, h) => Math.max(m, h.len), 0);
  const insideWaste = pieces.reduce((s, p) => s + (p.len - p.used), 0);
  return { memory: [...memory], pieces, holes, freeTotal, largestHole, insideWaste, rejected };
}

/**
 * 판 하나를 셈한다 — IR `runRequests` 와 같은 차례로 요청마다 한 걸음.
 * 돌려주는 것: 걸음 #1.. 의 모습, #0 모습, 동률이 걸린 수.
 */
export function segmentationRound(
  data: SegmentationData,
  fit: number,
  leaver: number,
): { requests: ResolvedRequest[]; initial: SegState; steps: SegStep[]; ties: number } {
  const reqs = resolveRequests(data, leaver);
  const { kind, who, size } = encodeRequests(data.blocks, reqs);
  const sizes = new Map<string, number>();
  for (const r of reqs) if (r.kind === 'in') sizes.set(r.block, r.size);
  const cells = data.memoryKiB;
  const frame = data.frameKiB;
  const memory: number[] = new Array<number>(cells).fill(-1);
  const initial = stateOf(memory, data.blocks, sizes, fit, frame, 0);
  const steps: SegStep[] = [];
  let rejected = 0;
  let ties = 0;
  for (let r = 0; r < kind.length; r++) {
    const block = reqs[r]!.block;
    const w = who[r]!;
    const sz = size[r]!;
    let stepKind: SegStep['kind'];
    let start = -1;
    let end = -1;
    const frames: number[] = [];
    if (kind[r] === 1) {
      if (!memory.includes(w)) throw new Error(`segmentation: 나갈 덩이 ${block} 가 메모리에 없다 (요청 #${r + 1})`);
      for (let k = 0; k < cells; k++) if (memory[k] === w) memory[k] = -1;
      stepKind = 'release';
    } else if (fit === FIT_FIXED) {
      let need = Math.floor((sz + frame - 1) / frame);
      let freeFrames = 0;
      for (let f = 0; f < cells / frame; f++) if (memory[f * frame] === -1) freeFrames += 1;
      if (freeFrames < need) {
        rejected += 1;
        stepKind = 'reject';
      } else {
        for (let f = 0; f < cells / frame; f++) {
          if (need > 0 && memory[f * frame] === -1) {
            for (let c = 0; c < frame; c++) memory[f * frame + c] = w;
            need -= 1;
            frames.push(f);
          }
        }
        stepKind = 'place';
      }
    } else {
      if (isTie(memory, sz, fit)) ties += 1;
      const at = findHoleAt(memory, sz, fit);
      if (at === -1) {
        rejected += 1;
        stepKind = 'reject';
      } else {
        for (let k = at; k < at + sz; k++) memory[k] = w;
        start = at;
        end = at + sz;
        stepKind = 'place';
      }
    }
    steps.push({
      step: r + 1,
      kind: stepKind,
      block,
      size: sz,
      start,
      end,
      frames,
      state: stateOf(memory, data.blocks, sizes, fit, frame, rejected),
    });
  }
  return { requests: reqs, initial, steps, ties };
}

export async function segmentationAlgorithm(ctx: FacetContext<SegmentationData>): Promise<void> {
  const rctx = ctx as ReactiveContext<SegmentationData>;
  const data = ctx.data;
  checkSegmentationData(data);

  // 지금 보이는 계기 값 — 차이만 보낸다. 처음 한 번은 0 이어도 보낸다
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev === undefined || prev !== value) ctx.metric(name, prev === undefined ? value : value - prev);
    shown.set(name, value);
  };
  const showState = (s: SegState): void => {
    setMetric('free-total', s.freeTotal);
    setMetric('largest-hole', s.largestHole);
    setMetric('rejected', s.rejected);
    setMetric('inside-waste', s.insideWaste);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 한 판을 끝까지. 취소되면 false. 마지막 걸음 뒤에는 쉬지 않는다 — 입력 대기가 걸음 경계다. */
  const playRound = async (fit: number, leaver: number): Promise<boolean> => {
    const round = segmentationRound(data, fit, leaver);
    await ctx.emit({
      type: 'round',
      payload: {
        fit,
        leaver,
        memoryKiB: data.memoryKiB,
        frameKiB: data.frameKiB,
        blocks: [...data.blocks],
        requests: round.requests,
        state: round.initial,
      },
    });
    showState(round.initial);
    if (!(await rctx.sleep(data.stepMs))) return false;
    for (let i = 0; i < round.steps.length; i++) {
      if (ctx.cancelled) return false;
      const s = round.steps[i]!;
      if (s.kind === 'place') {
        await phase('place');
        await ctx.emit({
          type: 'place',
          payload: { step: s.step, block: s.block, size: s.size, start: s.start, end: s.end, frames: s.frames, state: s.state },
        });
      } else if (s.kind === 'release') {
        await phase('release');
        await ctx.emit({ type: 'release', payload: { step: s.step, block: s.block, state: s.state } });
      } else {
        await phase('reject');
        await ctx.emit({ type: 'reject', payload: { step: s.step, block: s.block, size: s.size, state: s.state } });
      }
      showState(s.state);
      if (i < round.steps.length - 1) {
        if (!(await rctx.sleep(data.stepMs))) return false;
      }
    }
    return true;
  };

  const knobValue = (raw: unknown, ladder: number[], what: string): number | null => {
    const v = typeof raw === 'number' ? raw : typeof raw === 'string' && raw !== '' ? Number(raw) : NaN;
    if (Number.isNaN(v)) return null;
    if (!ladder.includes(v)) throw new Error(`segmentation: ${what} 값 ${String(raw)} 가 사다리 밖이다`);
    return v;
  };

  let fit = data.fit;
  let leaver = data.leaver;
  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(fit, leaver))) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'fit' && input.type !== 'leaver') continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) continue;
        const rec = p as Record<string, unknown>;
        if (typeof rec.value !== 'number') continue;
        if (input.type === 'fit') {
          fit = knobValue(rec.value, data.fitLadder, 'fit') ?? fit;
          leaver = knobValue(rec.leaver, data.leaverLadder, 'leaver') ?? leaver;
        } else {
          leaver = knobValue(rec.value, data.leaverLadder, 'leaver') ?? leaver;
          fit = knobValue(rec.fit, data.fitLadder, 'fit') ?? fit;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
