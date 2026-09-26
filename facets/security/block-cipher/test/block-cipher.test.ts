// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView } from '@ffacet/core/runtime';
import type { FacetContext, FacetRuntimeEvent, ReactiveContext } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  blockCipherAlgorithm,
  computeRun,
  encryptBlock,
  encryptMode,
  messageBlocks,
  readBlockCipherData,
  toBits,
  toHex,
} from '../src/algorithm.js';
import type { BlockCipherData } from '../src/algorithm.js';
import { blockCipherFacet } from '../src/facet.js';
import { blockCipherImperativeIR } from '../src/irs.js';
import { blockCipherProjector } from '../src/projector.js';
import { blockCipherStageView } from '../src/block-cipher-stage.js';
import type { BlockCipherStage } from '../src/block-cipher-stage.js';

const data = readBlockCipherData(blockCipherFacet.initialData);
const MODES = ['ecb', 'cbc', 'ctr'];
const hex = (xs: number[]) => xs.map((x) => toHex(x, 4)).join(' ');

/** 사양 실측표 — [change, mode, R] → 덩어리별 다른 비트 · diff-bits · diff-nibbles · diff-blocks · repeat · C · C′ */
const TABLE: Record<string, [string, number, number, number, number, string, string]> = {
  '0,0,1': ['2 0 0 0', 2, 1, 1, 2, 'BA37 7D30 BA37 7D30', 'B637 7D30 BA37 7D30'],
  '0,0,2': ['5 0 0 0', 5, 2, 1, 2, '07BD D071 07BD D071', '6CBD D071 07BD D071'],
  '0,0,3': ['9 0 0 0', 9, 4, 1, 2, '9268 C6DD 9268 C6DD', '550B C6DD 9268 C6DD'],
  '0,0,4': ['11 0 0 0', 11, 4, 1, 2, '1546 4413 1546 4413', 'A6B0 4413 1546 4413'],
  '0,1,1': ['2 1 3 1', 7, 4, 4, 0, '5587 DCC4 A771 6B57', '5F87 D4C4 A971 6957'],
  '0,1,2': ['5 12 13 8', 38, 13, 4, 0, '8388 B13B B04C E3F4', 'E338 4ADD 5F31 338D'],
  '0,1,3': ['8 9 8 8', 33, 16, 4, 0, 'ED84 EFF6 7FF2 5525', 'B391 D165 F867 C178'],
  '0,1,4': ['6 11 5 7', 29, 15, 4, 0, 'E107 95FA 1506 4415', 'D0C5 2987 6102 0F53'],
  '0,2,1': ['1 0 0 0', 1, 1, 1, 0, 'AAAE B7A5 AAA8 B7A0', 'ABAE B7A5 AAA8 B7A0'],
  '0,2,2': ['1 0 0 0', 1, 1, 1, 0, 'A64D 1B3C AC3D 1130', 'A74D 1B3C AC3D 1130'],
  '0,2,3': ['1 0 0 0', 1, 1, 1, 0, 'EB1A 4198 8CD9 E228', 'EA1A 4198 8CD9 E228'],
  '0,2,4': ['1 0 0 0', 1, 1, 1, 0, '2C99 1D56 725C 3DD5', '2D99 1D56 725C 3DD5'],
  '1,0,1': ['0 0 0 0', 0, 0, 0, 2, 'BA37 7D30 BA37 7D30', 'BA37 7D30 BA37 7D30'],
  '1,0,2': ['0 0 0 0', 0, 0, 0, 2, '07BD D071 07BD D071', '07BD D071 07BD D071'],
  '1,0,3': ['0 0 0 0', 0, 0, 0, 2, '9268 C6DD 9268 C6DD', '9268 C6DD 9268 C6DD'],
  '1,0,4': ['0 0 0 0', 0, 0, 0, 2, '1546 4413 1546 4413', '1546 4413 1546 4413'],
  '1,1,1': ['2 1 3 1', 7, 4, 4, 0, '5587 DCC4 A771 6B57', '5F87 D4C4 A971 6957'],
  '1,1,2': ['5 12 13 8', 38, 13, 4, 0, '8388 B13B B04C E3F4', 'E338 4ADD 5F31 338D'],
  '1,1,3': ['8 9 8 8', 33, 16, 4, 0, 'ED84 EFF6 7FF2 5525', 'B391 D165 F867 C178'],
  '1,1,4': ['6 11 5 7', 29, 15, 4, 0, 'E107 95FA 1506 4415', 'D0C5 2987 6102 0F53'],
  '1,2,1': ['2 2 2 2', 8, 4, 4, 0, 'AAAE B7A5 AAA8 B7A0', 'A3AE BEA5 A3A8 BEA0'],
  '1,2,2': ['5 4 5 4', 18, 8, 4, 0, 'A64D 1B3C AC3D 1130', '164E 7B3F 1C3E 7136'],
  '1,2,3': ['7 7 5 4', 23, 11, 4, 0, 'EB1A 4198 8CD9 E228', '5B6B 4E82 3C5D EEE8'],
  '1,2,4': ['9 8 12 6', 35, 14, 4, 0, '2C99 1D56 725C 3DD5', '9F14 71F5 9587 02D5'],
};

type IrOut = { ret: number; c: number[]; c2: number[]; counts: number[] };

/** IR 을 부른다 — 배열은 부르는 쪽이 만든다. */
function callIR(blocks: number[], iv: number, key: number, change: number, flipAt: number, mode: number, rounds: number): IrOut {
  const n = blocks.length;
  const p = blocks.flatMap((b) => toBits(b, 16));
  const keyBits = toBits(Math.floor(key / 65536), 16).concat(toBits(key % 65536, 16));
  const c = new Array<number>(16 * n).fill(0);
  const c2 = new Array<number>(16 * n).fill(0);
  const counts = new Array<number>(n).fill(0);
  const ret = runIR(blockCipherImperativeIR, 'diffBits', [
    p,
    toBits(iv, 16),
    change,
    flipAt,
    n,
    mode,
    rounds,
    keyBits,
    [...data.sbox],
    [...data.perm],
    new Array<number>(16 * n).fill(0),
    new Array<number>(16).fill(0),
    c,
    c2,
    new Array<number>(16).fill(0),
    new Array<number>(16).fill(0),
    counts,
  ]);
  if (typeof ret !== 'number') throw new Error('IR 반환이 수가 아니다');
  return { ret, c, c2, counts };
}

const fold = (bits: number[]) => {
  const out: number[] = [];
  for (let b = 0; b < bits.length / 16; b += 1) out.push(bits.slice(16 * b, 16 * b + 16).reduce((v, x) => v * 2 + x, 0));
  return out;
};

describe('block-cipher 모형', () => {
  it('조각 대조 두 줄 — E_4(26B7, 3A94D63F) = BCD6 · GOGOGOGO 의 CBC R4 = BBBA E3C0 83DB 9DDB', () => {
    expect(toHex(encryptBlock(0x26b7, 0x3a94d63f, 4, data.sbox, data.perm), 4)).toBe('BCD6');
    expect(hex(encryptMode(messageBlocks('GOGOGOGO'), 0xa7f0, 0x9e3b7124, 'cbc', 4, data.sbox, data.perm))).toBe('BBBA E3C0 83DB 9DDB');
  });

  it('24 조합 — 알고리즘 · IR · 사양 표가 같다', () => {
    const key = parseInt(data.key, 16);
    const iv = parseInt(data.iv, 16);
    const plain = messageBlocks(data.message);
    let checked = 0;
    for (const change of data.changeLadder) {
      for (const mode of data.modeLadder) {
        for (const r of data.roundsLadder) {
          const run = computeRun(data, mode, r, change);
          const row = TABLE[`${change},${mode},${r}`];
          if (!row) throw new Error('표에 없는 조합');
          expect(run.perBlock.join(' ')).toBe(row[0]);
          expect([run.diffBits, run.diffNibbles, run.diffBlocks, run.repeat]).toEqual([row[1], row[2], row[3], row[4]]);
          expect(hex(run.cipher)).toBe(row[5]);
          expect(hex(run.cipher2)).toBe(row[6]);
          const ir = callIR(plain, iv, key, change, data.flipAt, mode, r);
          expect(ir.ret).toBe(run.diffBits);
          expect(ir.counts).toEqual(run.perBlock);
          expect(fold(ir.c)).toEqual(run.cipher);
          expect(fold(ir.c2)).toEqual(run.cipher2);
          checked += 1;
        }
      }
    }
    expect(checked).toBe(24);
  });

  it('다른 데이터 두 벌에서도 IR 과 알고리즘이 같다 (CTR 카운터가 65535 → 0 을 넘는 판 포함)', () => {
    const sets = [
      { key: 0x3a94d63f, iv: 0x0001, blocks: [0x26b7, 0x26b7, 0xb2da], flipAt: 1 },
      { key: 0x12345678, iv: 0xfffe, blocks: [0x0123, 0x4567, 0x89ab, 0xcdef, 0x0f0f], flipAt: 16 },
    ];
    for (const s of sets) {
      for (const change of [0, 1]) {
        for (const mode of [0, 1, 2]) {
          for (const r of [1, 2, 3, 4]) {
            const mask = 1 << (16 - s.flipAt);
            const p2 = [...s.blocks];
            let iv2 = s.iv;
            if (change === 0) p2[0] = (s.blocks[0] as number) ^ mask;
            else iv2 = s.iv ^ mask;
            const c = encryptMode(s.blocks, s.iv, s.key, MODES[mode] as string, r, data.sbox, data.perm);
            const c2 = encryptMode(p2, iv2, s.key, MODES[mode] as string, r, data.sbox, data.perm);
            const ir = callIR(s.blocks, s.iv, s.key, change, s.flipAt, mode, r);
            expect(fold(ir.c)).toEqual(c);
            expect(fold(ir.c2)).toEqual(c2);
            const per = c.map((x, i) => toBits(x ^ (c2[i] as number), 16).reduce((a, b) => a + b, 0));
            expect(ir.counts).toEqual(per);
            expect(ir.ret).toBe(per.reduce((a, b) => a + b, 0));
          }
        }
      }
    }
  });

  it('모르는 mode · change — IR 은 −1, 알고리즘은 던진다', () => {
    const plain = messageBlocks(data.message);
    expect(callIR(plain, 0xa7f0, 0x9e3b7124, 0, 8, 3, 4).ret).toBe(-1);
    expect(callIR(plain, 0xa7f0, 0x9e3b7124, 2, 8, 1, 4).ret).toBe(-1);
    expect(() => computeRun(data, 3, 4, 0)).toThrow();
    expect(() => computeRun(data, 1, 4, 2)).toThrow();
    expect(() => encryptMode(plain, 0xa7f0, 0x9e3b7124, 'ofb', 4, data.sbox, data.perm)).toThrow();
  });

  it('좁히개가 어긋난 데이터를 던진다', () => {
    const base = blockCipherFacet.initialData as Record<string, unknown>;
    expect(() => readBlockCipherData({ ...base, message: 'SENDSEN' })).toThrow(/짝수/);
    expect(() => readBlockCipherData({ ...base, key: '9E3B712' })).toThrow(/여덟/);
    expect(() => readBlockCipherData({ ...base, sbox: [...data.sbox.slice(0, 15), 14] })).toThrow(/순열/);
    expect(() => readBlockCipherData({ ...base, perm: [...data.perm.slice(0, 15), 1] })).toThrow(/순열/);
    expect(() => readBlockCipherData({ ...base, flipAt: 17 })).toThrow(/flipAt/);
  });
});

describe('block-cipher 선언', () => {
  const controls = (blockCipherFacet.blocks.controls as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] })
    .controls;
  const seg = (action: string) => {
    const c = controls.find((x) => x.action === action);
    if (!c?.segments) throw new Error(`손잡이 ${action} 가 없다`);
    return c.segments;
  };
  it('사다리가 segments 와 같고 기본값이 같다', () => {
    expect(seg('mode').map((s) => s.value)).toEqual(data.modeLadder);
    expect(seg('rounds').map((s) => s.value)).toEqual(data.roundsLadder);
    expect(seg('change').map((s) => s.value)).toEqual(data.changeLadder);
    expect(seg('mode').find((s) => s.default)?.value).toBe(data.mode);
    expect(seg('rounds').find((s) => s.default)?.value).toBe(data.rounds);
    expect(seg('change').find((s) => s.default)?.value).toBe(data.change);
    expect(data.modeLadder).toHaveLength(3);
    expect(data.roundsLadder[data.roundsLadder.length - 1]).toBe(4);
    expect(data.changeLadder).toHaveLength(2);
    expect(messageBlocks(data.message)).toHaveLength(4);
  });
});

// ── 재생 ───────────────────────────────────────────────────────────────────

type Inputs = { type: string; payload: { value: number } }[];

async function play(inputs: Inputs) {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const runEnds: Record<string, number>[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: structuredClone(blockCipherFacet.initialData) as BlockCipherData,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      runEnds.push({ ...metrics });
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
  } as unknown as ReactiveContext<BlockCipherData>;
  await blockCipherAlgorithm(ctx as FacetContext<BlockCipherData>);
  return { events, runEnds };
}

describe('block-cipher 재생', () => {
  it('걸음 이벤트마다 바로 앞 phase 가 사양의 차례와 같다 — 기본값에서 손잡이 하나씩', async () => {
    const cases: [Inputs, string[]][] = [
      [[], ['flip-plain', 'lock-cbc', 'lock-cbc', 'compare']],
      [[{ type: 'mode', payload: { value: 0 } }], ['flip-plain', 'lock-ecb', 'lock-ecb', 'compare']],
      [[{ type: 'mode', payload: { value: 2 } }], ['flip-plain', 'lock-ctr', 'lock-ctr', 'compare']],
      [[{ type: 'rounds', payload: { value: 1 } }], ['flip-plain', 'lock-cbc', 'lock-cbc', 'compare']],
      [[{ type: 'change', payload: { value: 1 } }], ['flip-iv', 'lock-cbc', 'lock-cbc', 'compare']],
    ];
    for (const [inputs, expected] of cases) {
      const { events } = await play(inputs);
      const runs: string[][] = [];
      events.forEach((e, i) => {
        if (e.type === 'phase') return;
        const prev = events[i - 1];
        expect(prev?.type).toBe('phase');
        const name = (prev?.payload as { phase: string }).phase;
        if (e.type === 'init') runs.push([]);
        runs[runs.length - 1]?.push(name);
        expect(e.silent === true).toBe(e.type === 'init');
      });
      expect(runs[runs.length - 1]).toEqual(expected);
      expect(runs.every((r) => r.length === 4)).toBe(true);
    }
  });

  it('계기는 회차마다 사양 표와 같다 — CBC R4 → ECB R4 → CBC R4 · 이어 CTR · IV', async () => {
    const { runEnds } = await play([
      { type: 'mode', payload: { value: 0 } },
      { type: 'mode', payload: { value: 1 } },
      { type: 'mode', payload: { value: 2 } },
      { type: 'change', payload: { value: 1 } },
      { type: 'rounds', payload: { value: 2 } },
      { type: 'mode', payload: { value: 0 } },
    ]);
    const pick = (m: Record<string, number>) => [m['diff-bits'], m['diff-nibbles'], m['diff-blocks'], m['repeat-blocks']];
    expect(runEnds.map(pick)).toEqual([
      [29, 15, 4, 0],
      [11, 4, 1, 2],
      [29, 15, 4, 0],
      [1, 1, 1, 0],
      [35, 14, 4, 0],
      [18, 8, 4, 0],
      [0, 0, 0, 2],
    ]);
  });

  it('사다리 밖 값 · 남의 입력은 흘린다', async () => {
    const { events, runEnds } = await play([
      { type: 'rounds', payload: { value: 7 } },
      { type: 'other', payload: { value: 1 } },
      { type: 'rounds', payload: { value: 1 } },
    ]);
    expect(events.filter((e) => e.type === 'init')).toHaveLength(2);
    expect(runEnds[runEnds.length - 1]?.['diff-bits']).toBe(7);
  });
});

describe('block-cipher 무대', () => {
  const mount = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(blockCipherStageView, container, {
      config: { type: 'block-cipher-stage' },
      initialData: blockCipherFacet.initialData,
      isInstant: () => true,
    }) as unknown as BlockCipherStage;
    return { container, stage };
  };

  it('첫 그림을 두 번 먹여도 요소 수가 같고, 켜진 격자 수가 캡션의 수와 같다', async () => {
    const { container, stage } = mount();
    const projector = blockCipherProjector({ stage });
    const { events } = await play([{ type: 'mode', payload: { value: 0 } }]);
    const count = () => container.querySelectorAll('*').length;
    // 첫 판을 끝까지
    const initAt = events.flatMap((e, i) => (e.type === 'init' ? [i] : []));
    const firstRun = events.slice(0, (initAt[1] as number) - 1);
    for (const e of firstRun) await projector.onEvent(e);
    expect(container.querySelectorAll('[data-lit]')).toHaveLength(29);
    expect(container.textContent).toContain('29');
    // 둘째 판의 첫 그림 두 번 — 앞 판의 켜짐은 걷히고 요소 수는 같다
    const init = events.filter((e) => e.type === 'init')[1];
    if (!init) throw new Error('둘째 init 이 없다');
    await projector.onEvent(init);
    const once = count();
    expect(container.querySelectorAll('[data-lit]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-ghost]')).toHaveLength(29);
    await projector.onEvent(init);
    expect(count()).toBe(once);
    // 되짚기 — reset 뒤 첫 그림
    projector.onReset?.();
    await projector.onEvent(init);
    expect(container.querySelectorAll('[data-ghost]')).toHaveLength(0);
    const rest = events.slice(events.indexOf(init) + 1);
    for (const e of rest) await projector.onEvent(e);
    expect(container.querySelectorAll('[data-lit]')).toHaveLength(11);
  });

  it('initialData 없이 마운트해도 던지지 않는다 · 모르는 이벤트는 던진다', async () => {
    const container = document.createElement('div');
    const stage = mountView(blockCipherStageView, container, { config: {} });
    const projector = blockCipherProjector({ stage });
    await expect(Promise.resolve().then(() => projector.onEvent({ type: 'nope' }))).rejects.toThrow();
    stage.destroy();
  });
});
