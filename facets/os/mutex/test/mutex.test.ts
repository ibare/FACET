// @vitest-environment happy-dom
/**
 * mutex 의 고유 주장 — 사양 표(sim.py mutex) 대조 · 회차별 계기 · 사다리 · 무대가 받은 값을 그대로 띄우는지.
 * IR 은 두지 않으므로(irs.ts) IR ↔ algorithm 대조 대신 "IR 이 비었고 코드 패널이 없다" 를 잠근다.
 */
import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView } from '@ffacet/core/runtime';
import {
  mutexAlgorithm,
  mutexFacet,
  mutexIRs,
  mutexProjector,
  mutexStageView,
  runMutex,
  type MutexData,
} from '../src/index.js';

const data = mutexFacet.initialData as MutexData;

type Row = [lock: number, slice: number, count: number, lost: number, ticks: number, blocked: number, order: string, lostAt: string, steps: number];

// sim.py mutex 의 표 그대로
const TABLE: Row[] = [
  [0, 1, 2, 2, 12, 0, 'ABABABABABAB', '5 B 1→1,11 B 2→2', 14],
  [0, 2, 2, 2, 12, 0, 'AABBAABBAABB', '6 B 1→1,11 B 2→2', 8],
  [0, 3, 4, 0, 12, 0, 'AAABBBAAABBB', '-', 6],
  [0, 4, 3, 1, 12, 0, 'AAAABBBBAABB', '9 A 2→2', 6],
  [0, 5, 3, 1, 12, 0, 'AAAAABBBBBAB', '10 A 2→2', 6],
  [0, 6, 4, 0, 12, 0, 'AAAAAABBBBBB', '-', 4],
  [1, 1, 4, 0, 20, 3, 'ABAAAABABBBABAAABBBB', '-', 12],
  [1, 2, 4, 0, 20, 3, 'AABAAAABBBBAABAABBBB', '-', 10],
  [1, 3, 4, 0, 20, 3, 'AAABAAABBBBBAAAABBBB', '-', 8],
  [1, 4, 4, 0, 20, 2, 'AAAABAABBBBAAAABBBBB', '-', 8],
  [1, 5, 4, 0, 20, 0, 'AAAAABBBBBAAAAABBBBB', '-', 6],
  [1, 6, 4, 0, 20, 1, 'AAAAAABAAAABBBBBBBBB', '-', 6],
];

describe('mutex — 사양 표', () => {
  it('사다리와 손잡이 구간이 같다 · 프로그램 길이', () => {
    const controls = (mutexFacet.blocks.controls as { controls: { widget?: string; action?: string; segments?: { value: number }[] }[] }).controls;
    const seg = (a: string): number[] => (controls.find((c) => c.action === a)?.segments ?? []).map((s) => s.value);
    expect(seg('slice')).toEqual(data.sliceLadder);
    expect(seg('useLock')).toEqual(data.lockLadder);
    expect(data.sliceLadder).toEqual([1, 2, 3, 4, 5, 6]);
    expect(data.lockLadder).toEqual([0, 1]);
    expect(data.programs.map((p) => p.length)).toEqual([6, 10]);
  });

  it('IR 을 두지 않고 코드 패널도 없다', () => {
    expect(mutexIRs).toEqual([]);
    expect(Object.keys(mutexFacet.blocks)).not.toContain('codePanel');
  });

  for (const [lock, slice, count, lost, ticks, blocked, order, lostAt, steps] of TABLE) {
    it(`자물쇠 ${lock} · 몫 ${slice}`, () => {
      const r = runMutex(data, slice, lock);
      expect(r.count).toBe(count);
      expect(r.lost).toBe(lost);
      expect(r.expected - r.count).toBe(lost);
      expect(r.ticks).toBe(ticks);
      expect(r.blocked).toBe(blocked);
      expect(r.order).toBe(order);
      const marks = r.chunks
        .flatMap((c) => c.ticks)
        .filter((tk) => tk.lost !== null)
        .map((tk) => `${tk.tick} ${data.threads[tk.thread]} ${tk.lost!.old}→${tk.lost!.new}`);
      expect(marks.join(',') || '-').toBe(lostAt);
      expect(1 + r.chunks.length + 1).toBe(steps);
      // 토막은 한 스레드가 이어서 돈 틱들이다 — 이웃 토막은 스레드가 다르다
      r.chunks.forEach((c, i) => {
        if (i > 0) expect(c.thread).not.toBe(r.chunks[i - 1]!.thread);
      });
    });
  }

  it('기본값(없음 · 몫 2) 의 토막 여섯', () => {
    const r = runMutex(data, 2, 0);
    expect(r.chunks.map((c) => `${data.threads[c.thread]} ${c.from}-${c.to}`)).toEqual([
      'A 0-1', 'B 2-3', 'A 4-5', 'B 6-7', 'A 8-9', 'B 10-11',
    ]);
  });

  it('자물쇠 있음 · 몫 1 의 틱 2..5 는 한 토막이다', () => {
    const r = runMutex(data, 1, 1);
    expect(r.chunks[2]).toMatchObject({ thread: 0, from: 2, to: 5 });
  });

  it('주인 띠(holder) — 자물쇠 있음이면 막힌 시도 말고는 도는 스레드가 주인이다', () => {
    for (const slice of data.sliceLadder) {
      const r = runMutex(data, slice, 1);
      for (const tk of r.chunks.flatMap((c) => c.ticks)) {
        const body = data.programs[1]![tk.line]!.op;
        if (tk.blocked) expect(tk.holder, `몫 ${slice} 틱 ${tk.tick}`).toBe(1 - tk.thread);
        else expect(tk.holder, `몫 ${slice} 틱 ${tk.tick} ${body}`).toBe(tk.thread);
      }
    }
    const one = runMutex(data, 1, 1).chunks.flatMap((c) => c.ticks);
    expect([5, 10, 15, 19].map((n) => one[n]!.holder)).toEqual([0, 1, 0, 1]);
    for (const tk of runMutex(data, 2, 0).chunks.flatMap((c) => c.ticks)) expect(tk.holder).toBeNull();
  });

  it('모르는 op · 사다리 밖 값은 던진다', () => {
    expect(() => runMutex(data, 7, 0)).toThrow();
    expect(() => runMutex(data, 2, 2)).toThrow();
    const bad: MutexData = { ...data, programs: [[{ op: 'jump', text: 'x' }], data.programs[1]!] };
    expect(() => runMutex(bad, 2, 0)).toThrow(/모르는 줄/);
    const noOwner: MutexData = { ...data, programs: [[{ op: 'unlock', text: 'unlock(m)' }], data.programs[1]!] };
    expect(() => runMutex(noOwner, 2, 0)).toThrow(/주인 아닌/);
  });
});

type Input = { type: string; payload: { value: number } };

async function rounds(inputs: Input[]): Promise<Map<string, number>[]> {
  const totals = new Map<string, number>();
  const out: Map<string, number>[] = [];
  const queue = [...inputs];
  let cancelled = false;
  let idle!: () => void;
  const finished = new Promise<void>((r) => (idle = r));
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit() {},
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      out.push(new Map(totals));
      const next = queue.shift();
      if (!next) {
        idle();
        return new Promise<never>(() => {});
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await Promise.race([mutexAlgorithm(ctx as never), finished]);
  cancelled = true;
  return out;
}

describe('mutex — 회차별 계기', () => {
  it('A → B → A: (없음, 2) → (있음, 2) → (없음, 2)', async () => {
    const got = await rounds([
      { type: 'useLock', payload: { value: 1 } },
      { type: 'useLock', payload: { value: 0 } },
    ]);
    const pick = (m: Map<string, number>): number[] => ['final-count', 'lost-updates', 'ticks', 'blocked-tries'].map((k) => m.get(k) ?? -1);
    expect(got.map(pick)).toEqual([
      [2, 2, 12, 0],
      [4, 0, 20, 3],
      [2, 2, 12, 0],
    ]);
  });

  it('모든 조합에서 판의 계기가 표와 같다', async () => {
    const inputs: Input[] = [];
    for (const lock of [0, 1]) {
      inputs.push({ type: 'useLock', payload: { value: lock } });
      for (const slice of data.sliceLadder) inputs.push({ type: 'slice', payload: { value: slice } });
    }
    const got = await rounds(inputs);
    // 첫 판은 기본값, 그 뒤 입력마다 한 판
    let lock = data.useLock;
    let slice = data.slice;
    const expectRow = (): number[] => {
      const row = TABLE.find((r) => r[0] === lock && r[1] === slice)!;
      return [row[2], row[3], row[4], row[5]];
    };
    const pick = (m: Map<string, number>): number[] => ['final-count', 'lost-updates', 'ticks', 'blocked-tries'].map((k) => m.get(k) ?? -1);
    expect(pick(got[0]!)).toEqual(expectRow());
    inputs.forEach((inp, i) => {
      if (inp.type === 'useLock') lock = inp.payload.value;
      else slice = inp.payload.value;
      expect(pick(got[i + 1]!), `${inp.type}=${inp.payload.value}`).toEqual(expectRow());
    });
  });
});

describe('mutex — 무대', () => {
  it('projector 를 거쳐 한 판을 띄우면 캡션이 셈한 값을 보인다', async () => {
    const container = document.createElement('div');
    const stage = mountView(mutexStageView, container, { config: {}, initialData: data, locale: 'en', t: makeTranslator('en', mutexFacet.messages) });
    const p = mutexProjector({ stage }, { getSpeed: () => 1, t: makeTranslator('en', mutexFacet.messages) });
    const r = runMutex(data, 4, 0);
    const program = data.programs[0]!.map((l) => l.text);
    await p.onEvent({ type: 'round', payload: { slice: 4, useLock: 0, threads: data.threads, program, shared: 'count', register: 'r', lock: null, start: 0, expected: r.expected } });
    const caption = (): string => [...container.querySelectorAll('text')].map((n) => n.textContent ?? '').find((s) => /^(Slice|Tick|Count)/.test(s)) ?? '';
    expect(caption()).toBe('Slice: 4');
    for (const c of r.chunks) await p.onEvent({ type: 'chunk', payload: c });
    expect(caption()).toBe('Tick 10–11 · B');
    await p.onEvent({ type: 'done', payload: { count: r.count, expected: r.expected, lost: r.lost, ticks: r.ticks, blocked: r.blocked } });
    expect(caption()).toBe('Count: 3 · Expected: 4');
    const texts = [...container.querySelectorAll('text')].map((n) => n.textContent);
    expect(texts).toContain('2 → 2');
    expect(texts).toContain('count = 3');
    stage.destroy();
  });
});
