/**
 * collision — 출력이 n 비트인 해시에서 겹침이 오는 세 거리.
 *
 * 모형: 조각들과 같은 장난감 해시 H (상태 16 비트 · IV 6a09 · 덩어리 2 바이트 · 세 라운드).
 * 압축 f(h, m): x = h 에서 [x ⊕ m → x × 9e37 mod 2¹⁶ → 왼쪽으로 5 자리 돌리기] 를 세 번, h′ = (x + h) mod 2¹⁶.
 * 패딩: 80 한 바이트 → 00 을 z 개 (전체가 짝수 바이트가 되는 가장 작은 z) → 길이(비트) 16 비트 큰 쪽 먼저.
 * 자리 = H(입력의 ASCII) mod 2ⁿ (H 의 아래 n 비트).
 *
 * 판 하나 = 걸음 아홉 (걸음 0 포함):
 *   0 판 머리 (silent init) — 축 · 자리 N · 흐름 줄
 *   1 N+1 표지 · 2 50% 표지 · 3–7 흐름마다 처음 겹침 · 8 정해진 문서와 겹침 (다섯 동시)
 *
 * 규약:
 *   - 처음 겹침 = 입력을 1 번부터 넣어 앞서 넣은 것과 자리가 같은 첫 입력의 번호. 짝의 상대는 그 자리에 먼저 앉은 입력.
 *     N+1 을 넘으면 던진다 (비둘기집이라 일어날 수 없다)
 *   - 50% 입력 수 = 1 − ∏_{i<k} (N − i)/N 이 처음 0.5 이상이 되는 k. double 로 i 차례대로 곱한다.
 *     동률: 이 사다리에서 0.5 에 딱 닿는 칸은 없다 (n 4 는 33.3% → 50.01%, 2 진 분수라 정확)
 *   - 정해진 문서 = `<흐름>0`, 시도 = `<흐름>x1`, `<흐름>x2`, … 16N 번 안에 못 찾으면 던진다
 *   - 평균 = 합 / 5 — 소수 첫째 자리까지 정확하므로 10 배 한 정수(합 × 2)로 싣는다
 *   - 배 = 5(N+1)/합 의 반올림 = (2·5(N+1) + 합) // (2·합)
 *   - 축 끝 = 사다리 전체에서 그릴 값의 최대를 담는 2 의 거듭제곱 (이 자료에서 32768)
 *
 * 이벤트 (payload · silent):
 *   init            silent  { width, slots, axisEnd, streams: string[] }                판 머리 = 걸음 0
 *   phase           silent  { phase }
 *   pigeonhole              { slots, sure }                                              걸음 1
 *   birthday-half           { half }                                                     걸음 2
 *   first-collision         { row, stream, first, partner, slot, input, partnerInput,
 *                             summary: null | { avgTenths, ratio, sure } }               걸음 3–7 (마지막 흐름만 summary)
 *   target-hit              { hits: [{ row, stream, tries, input, target, slot }], avgTenths, slots }   걸음 8
 *
 * phase 어휘: pigeonhole · birthday-half · first-collision · target-hit (irs.ts 와 같다)
 *
 * 계기: slots (N) · sure-collision (N+1) · half-chance (50% 입력 수) ·
 *       inputs-hashed (처음 겹침 수의 합 + 정해진 문서 시도 수의 합, 정해진 문서 자신은 세지 않는다)
 *
 * 손잡이: width (출력 폭 비트) — 사다리 widthLadder 안의 값만 받는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CollisionData = {
  type: 'collision';
  stepMs: number;
  widthLadder: number[];
  width: number;
  streams: string[];
  tryInfix: string;
};

// ───────────────────────────── 장난감 해시 H

const IV = 0x6a09;

function compress(h: number, m: number): number {
  let x = h;
  for (let r = 0; r < 3; r++) {
    x = (x ^ m) & 0xffff;
    x = Math.imul(x, 0x9e37) & 0xffff;
    x = ((x << 5) | (x >>> 11)) & 0xffff;
  }
  return (x + h) & 0xffff;
}

/** H(바이트) — IV 에서 (바이트 ‖ 패딩) 의 덩어리를 차례로 접은 끝 상태. */
export function toyHash(bytes: readonly number[]): number {
  const bits = bytes.length * 8;
  if (bits > 0xffff) throw new Error(`collision: 길이 칸 16 비트를 넘는다 (${bits} 비트)`);
  const z = (bytes.length + 3) % 2;
  const stream = [...bytes, 0x80, ...new Array<number>(z).fill(0), (bits >> 8) & 0xff, bits & 0xff];
  let h = IV;
  for (let i = 0; i < stream.length; i += 2) h = compress(h, stream[i] * 256 + stream[i + 1]);
  return h;
}

export function asciiBytes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > 0x7f) throw new Error(`collision: ASCII 가 아닌 글자 — ${text}`);
    out.push(c);
  }
  return out;
}

export function hashText(text: string): number {
  return toyHash(asciiBytes(text));
}

// ───────────────────────────── 세는 셈 (IR 과 같은 길)

export function slotCount(n: number): number {
  let size = 1;
  for (let i = 0; i < n; i++) size *= 2;
  return size;
}

export function pigeonholeOf(n: number): number {
  return slotCount(n) + 1;
}

/** 50% 입력 수 — 없으면 −1. */
export function birthdayHalfOf(n: number): number {
  const size = slotCount(n);
  const nd = size;
  let q = 1.0;
  for (let k = 1; k <= size + 1; k++) {
    const num = size - k + 1;
    q = (q * num) / nd;
    if (1.0 - q >= 0.5) return k;
  }
  return -1;
}

/** hashes[i] = H(<흐름>{i+1}). 앞서 넣은 것과 자리가 같은 첫 입력의 번호 (1 부터) · 없으면 −1. */
export function firstCollisionOf(hashes: readonly number[], n: number): number {
  const size = slotCount(n);
  const seen = new Array<number>(size).fill(0);
  for (let i = 0; i < hashes.length; i++) {
    const slot = hashes[i] % size;
    if (seen[slot] === 1) return i + 1;
    seen[slot] = 1;
  }
  return -1;
}

/** tries[i] = H(<흐름>x{i+1}). 정해진 문서의 자리와 같은 첫 시도의 번호 (1 부터) · 없으면 −1. */
export function targetHitOf(targetHash: number, tries: readonly number[], n: number): number {
  const size = slotCount(n);
  const target = targetHash % size;
  for (let i = 0; i < tries.length; i++) {
    if (tries[i] % size === target) return i + 1;
  }
  return -1;
}

// ───────────────────────────── 판 셈

export type StreamResult = {
  stream: string;
  first: number;
  partner: number;
  slot: number;
  tries: number;
  targetSlot: number;
};

export type Board = {
  width: number;
  slots: number;
  sure: number;
  half: number;
  streams: StreamResult[];
  firstSum: number;
  targetSum: number;
  ratio: number;
};

export type Tables = {
  boards: Map<number, Board>;
  axisEnd: number;
  /** 흐름마다 H(<흐름>1..) — 길이 N_max + 1 */
  hashes: Map<string, number[]>;
  /** 흐름마다 H(<흐름>x1..) — 길이 16 N_max */
  tries: Map<string, number[]>;
  /** 흐름마다 H(<흐름>0) */
  targets: Map<string, number>;
};

function readNumber(raw: Record<string, unknown>, key: string): number {
  const v = raw[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`collision: initialData.${key} 는 정수여야 한다`);
  return v;
}

/** ctx.data 를 좁힌다 — 모양이 어긋나면 던진다. */
export function readCollisionData(raw: unknown): CollisionData {
  if (typeof raw !== 'object' || raw === null) throw new Error('collision: initialData 가 없다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'collision') throw new Error('collision: initialData.type 이 collision 이 아니다');
  const stepMs = readNumber(r, 'stepMs');
  const width = readNumber(r, 'width');
  const ladderRaw = r.widthLadder;
  if (!Array.isArray(ladderRaw) || ladderRaw.length === 0) throw new Error('collision: widthLadder 가 비었다');
  const widthLadder = ladderRaw.map((v) => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 12) {
      throw new Error(`collision: widthLadder 의 값이 1..12 정수가 아니다 — ${String(v)}`);
    }
    return v;
  });
  if (!widthLadder.includes(width)) throw new Error(`collision: width ${width} 가 사다리에 없다`);
  const streamsRaw = r.streams;
  if (!Array.isArray(streamsRaw) || streamsRaw.length === 0) throw new Error('collision: streams 가 비었다');
  const streams = streamsRaw.map((s) => {
    if (typeof s !== 'string' || s.length === 0) throw new Error('collision: streams 의 이름이 문자열이 아니다');
    return s;
  });
  const tryInfix = r.tryInfix;
  if (typeof tryInfix !== 'string' || tryInfix.length === 0) throw new Error('collision: tryInfix 가 없다');
  return { type: 'collision', stepMs, widthLadder, width, streams, tryInfix };
}

function need(map: Map<string, number[]>, key: string): number[] {
  const v = map.get(key);
  if (!v) throw new Error(`collision: ${key} 의 해시 줄이 없다`);
  return v;
}

function range(from: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => from + i);
}

/** 사다리 전체의 판을 셈한다 — 축 끝을 사다리 전체에서 정해야 해서 미리 모두 셈한다. */
export function buildTables(data: CollisionData): Tables {
  const maxSlots = Math.max(...data.widthLadder.map(slotCount));
  const hashes = new Map<string, number[]>();
  const tries = new Map<string, number[]>();
  const targets = new Map<string, number>();
  for (const s of data.streams) {
    hashes.set(s, range(1, maxSlots + 1).map((i) => hashText(`${s}${i}`)));
    tries.set(s, range(1, 16 * maxSlots).map((i) => hashText(`${s}${data.tryInfix}${i}`)));
    targets.set(s, hashText(`${s}0`));
  }
  const boards = new Map<number, Board>();
  let maxValue = 1;
  for (const n of data.widthLadder) {
    const slots = slotCount(n);
    const sure = pigeonholeOf(n);
    const half = birthdayHalfOf(n);
    if (half < 1) throw new Error(`collision: n ${n} 에서 50% 입력 수가 없다`);
    const results: StreamResult[] = [];
    for (const s of data.streams) {
      const hs = need(hashes, s).slice(0, slots + 1);
      if (hs.length !== slots + 1) throw new Error(`collision: ${s} 해시 줄이 모자란다`);
      const first = firstCollisionOf(hs, n);
      if (first < 1 || first > sure) throw new Error(`collision: ${s} 의 처음 겹침이 N+1 안에 없다`);
      const slot = hs[first - 1] % slots;
      const partner = hs.findIndex((h) => h % slots === slot) + 1;
      if (partner < 1 || partner >= first) throw new Error(`collision: ${s} 짝의 상대를 못 찾았다`);
      const ts = need(tries, s).slice(0, 16 * slots);
      const targetHash = targets.get(s);
      if (targetHash === undefined) throw new Error(`collision: ${s}0 의 해시가 없다`);
      const hit = targetHitOf(targetHash, ts, n);
      if (hit < 1) throw new Error(`collision: ${s}0 과 겹치는 시도가 16N 번 안에 없다 (n ${n})`);
      results.push({ stream: s, first, partner, slot, tries: hit, targetSlot: targetHash % slots });
      maxValue = Math.max(maxValue, first, hit);
    }
    maxValue = Math.max(maxValue, sure, half);
    const firstSum = results.reduce((a, r) => a + r.first, 0);
    const targetSum = results.reduce((a, r) => a + r.tries, 0);
    const count = results.length;
    // 배 = count(N+1)/합 의 반올림
    const ratio = Math.floor((2 * count * sure + firstSum) / (2 * firstSum));
    boards.set(n, { width: n, slots, sure, half, streams: results, firstSum, targetSum, ratio });
  }
  let axisEnd = 1;
  while (axisEnd < maxValue) axisEnd *= 2;
  return { boards, axisEnd, hashes, tries, targets };
}

/** 평균을 10 배 한 정수 — 합 / count 가 소수 첫째 자리에서 정확할 때만. */
function averageTenths(sum: number, count: number): number {
  if ((sum * 10) % count !== 0) throw new Error(`collision: 평균 ${sum}/${count} 가 소수 첫째 자리에서 끝나지 않는다`);
  return (sum * 10) / count;
}

// ───────────────────────────── 재생

export async function collisionAlgorithm(ctx: FacetContext<CollisionData>): Promise<void> {
  const rctx = ctx as ReactiveContext<CollisionData>;
  const data = readCollisionData(ctx.data);
  const tables = buildTables(data);
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev === undefined) ctx.metric(name, value);
    else if (value !== prev) ctx.metric(name, value - prev);
    shown.set(name, value);
  };

  /** 판 하나 — 끝까지 가면 true, 취소되면 false. */
  const playBoard = async (width: number): Promise<boolean> => {
    const board = tables.boards.get(width);
    if (!board) throw new Error(`collision: n ${width} 의 판이 없다`);
    const ms = data.stepMs;

    // 걸음 0 — 판 머리
    await ctx.emit({
      type: 'init',
      payload: { width, slots: board.slots, axisEnd: tables.axisEnd, streams: [...data.streams] },
      silent: true,
    });
    setMetric('slots', board.slots);
    setMetric('sure-collision', 0);
    setMetric('half-chance', 0);
    setMetric('inputs-hashed', 0);
    if (!(await rctx.sleep(ms))) return false;

    // 걸음 1
    await phase('pigeonhole');
    await ctx.emit({ type: 'pigeonhole', payload: { slots: board.slots, sure: board.sure } });
    setMetric('sure-collision', board.sure);
    if (!(await rctx.sleep(ms))) return false;

    // 걸음 2
    await phase('birthday-half');
    await ctx.emit({ type: 'birthday-half', payload: { half: board.half } });
    setMetric('half-chance', board.half);
    if (!(await rctx.sleep(ms))) return false;

    // 걸음 3–7 — 흐름 하나가 한 걸음
    let hashed = 0;
    for (let row = 0; row < board.streams.length; row++) {
      if (ctx.cancelled) return false;
      const r = board.streams[row];
      const last = row === board.streams.length - 1;
      await phase('first-collision');
      await ctx.emit({
        type: 'first-collision',
        payload: {
          row,
          stream: r.stream,
          first: r.first,
          partner: r.partner,
          slot: r.slot,
          input: `${r.stream}${r.first}`,
          partnerInput: `${r.stream}${r.partner}`,
          summary: last
            ? { avgTenths: averageTenths(board.firstSum, board.streams.length), ratio: board.ratio, sure: board.sure }
            : null,
        },
      });
      hashed += r.first;
      setMetric('inputs-hashed', hashed);
      if (!(await rctx.sleep(ms))) return false;
    }

    // 걸음 8 — 정해진 문서, 다섯 줄 동시
    await phase('target-hit');
    await ctx.emit({
      type: 'target-hit',
      payload: {
        slots: board.slots,
        avgTenths: averageTenths(board.targetSum, board.streams.length),
        hits: board.streams.map((r, row) => ({
          row,
          stream: r.stream,
          tries: r.tries,
          input: `${r.stream}${data.tryInfix}${r.tries}`,
          target: `${r.stream}0`,
          slot: r.targetSlot,
        })),
      },
    });
    hashed += board.targetSum;
    setMetric('inputs-hashed', hashed);
    return true;
  };

  try {
    let width = data.width;
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playBoard(width))) return;
      let next: number | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'width') continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) throw new Error('collision: width 입력에 payload 가 없다');
        const value = (p as Record<string, unknown>).value;
        if (typeof value !== 'number' || !data.widthLadder.includes(value)) {
          throw new Error(`collision: width 값이 사다리에 없다 — ${String(value)}`);
        }
        next = value;
      }
      width = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
