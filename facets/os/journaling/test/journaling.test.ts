import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import {
  journalingAlgorithm,
  journalingFacet,
  journalingImperativeIR,
  runLine,
  type JournalingData,
  type JournalingWrite,
} from '../src/index.js';

const data = journalingFacet.initialData as unknown as JournalingData;
const code = { old: 0, new: 1, torn: 2 } as const;

/** 쓰기 열을 IR 이 받는 번호 배열로 바꾼다. */
function encode(writes: JournalingWrite[]) {
  return {
    area: writes.map((w) => (w.area === 'journal' ? 1 : 0)),
    block: writes.map((w) => data.blocks.indexOf(w.item)),
    isEnd: writes.map((w) => (w.item === data.endMark ? 1 : 0)),
  };
}

// 사양 실측표 — c: [저널 없음 다시 켠 뒤, 판정, 저널 끊긴 때, 저널 다시 켠 뒤, 판정, plain, journal, replayed, 걸음]
const table: Record<number, [string, string, string, string, string, number, number, number, number]> = {
  0: ['ooo', 'old', 'ooo', 'ooo', 'old', 0, 0, 0, 3],
  1: ['noo', 'torn', 'ooo', 'ooo', 'old', 1, 1, 0, 4],
  2: ['nno', 'torn', 'ooo', 'ooo', 'old', 2, 2, 0, 5],
  3: ['nnn', 'new', 'ooo', 'ooo', 'old', 3, 3, 0, 6],
  4: ['nnn', 'new', 'ooo', 'ooo', 'old', 3, 4, 0, 7],
  5: ['nnn', 'new', 'ooo', 'nnn', 'new', 3, 5, 3, 11],
  6: ['nnn', 'new', 'noo', 'nnn', 'new', 3, 6, 3, 12],
  7: ['nnn', 'new', 'nno', 'nnn', 'new', 3, 7, 3, 13],
  8: ['nnn', 'new', 'nnn', 'nnn', 'new', 3, 8, 3, 14],
};
const short = (s: ('old' | 'new')[]) => s.map((x) => (x === 'new' ? 'n' : 'o')).join('');

describe('journaling', () => {
  it('사다리가 손잡이 구간과 같고, 첫 판 값이 기본 구간이다', () => {
    const controls = (journalingFacet.blocks.controls as { controls: { name?: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const knob = controls.find((c) => c.name === 'crashAfter');
    expect(knob?.segments?.map((s) => s.value)).toEqual(data.crashLadder);
    expect(knob?.segments?.find((s) => s.default)?.value).toBe(data.crashAfter);
    expect(data.crashLadder.length).toBe(9);
    expect(data.crashLadder[data.crashLadder.length - 1]).toBe(data.journalWrites.length);
    expect(data.plainWrites.length).toBe(3);
    expect(data.journalWrites.length).toBe(8);
  });

  it('알고리즘의 셈이 사양 실측표와 같다', () => {
    for (const c of data.crashLadder) {
      const row = table[c]!;
      const plain = runLine(data, data.plainWrites, c);
      const journal = runLine(data, data.journalWrites, c);
      expect([short(plain.after), plain.verdict], `c=${c} 저널 없음`).toEqual([row[0], row[1]]);
      expect([short(journal.atCrash), short(journal.after), journal.verdict], `c=${c} 저널`).toEqual([row[2], row[3], row[4]]);
      expect([plain.written, journal.written, journal.replayed.length], `c=${c} 계기`).toEqual([row[5], row[6], row[7]]);
      const steps = 1 + c + 1 + (journal.committed ? journal.replayed.length : 0) + 1;
      expect(steps, `c=${c} 걸음`).toBe(row[8]);
    }
  });

  it('IR 의 판정과 다시 켠 뒤 제자리가 모든 c × 두 줄에서 알고리즘과 같다', () => {
    for (const c of data.crashLadder) {
      for (const writes of [data.plainWrites, data.journalWrites]) {
        const line = runLine(data, writes, c);
        const { area, block, isEnd } = encode(writes);
        const disk = [0, 0, 0];
        const verdict = runIR(journalingImperativeIR, 'recover', [area, block, isEnd, disk, Math.min(c, writes.length)]);
        expect(verdict, `c=${c} 판정`).toBe(code[line.verdict]);
        expect(disk, `c=${c} 제자리`).toEqual(line.after.map((s) => (s === 'new' ? 1 : 0)));
      }
    }
  });

  it('사다리 밖 c · 모르는 쓰기는 던진다', () => {
    expect(() => runLine(data, data.journalWrites, 9)).toThrow();
    expect(() => runLine(data, [{ area: 'journal', item: 'superblock' }], 1)).toThrow();
  });

  it('계기 — 손잡이 2 → 6 → 2 에서 회차마다 사양 값', async () => {
    const totals: Record<string, number> = {};
    const rounds: Record<string, number>[] = [];
    const inputs = [6, 2];
    let cancelled = false;
    const ctx = {
      data: structuredClone(data),
      get cancelled() {
        return cancelled;
      },
      async emit() {},
      metric(name: string, d: number | 'inc') {
        totals[name] = (totals[name] ?? 0) + (d === 'inc' ? 1 : d);
      },
      async sleep() {
        return !cancelled;
      },
      pollInput: () => null,
      async waitForInput() {
        rounds.push({ ...totals });
        const next = inputs.shift();
        if (next === undefined) {
          cancelled = true;
          return { type: 'stop' };
        }
        return { type: 'crashAfter', payload: { value: next, segmentIndex: next, crashAfter: String(next) } };
      },
    };
    await journalingAlgorithm(ctx as never);
    expect(rounds).toEqual([
      { 'plain-writes': 2, 'journal-writes': 2, 'replayed-blocks': 0 },
      { 'plain-writes': 3, 'journal-writes': 6, 'replayed-blocks': 3 },
      { 'plain-writes': 2, 'journal-writes': 2, 'replayed-blocks': 0 },
    ]);
  });
});
