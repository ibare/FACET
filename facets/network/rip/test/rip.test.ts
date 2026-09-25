// @vitest-environment happy-dom
/**
 * rip 고유 검사 — 사양 표(계기 셋 · 걸음 차례 · 참값)를 모든 손잡이 조합에서 견주고,
 * 손잡이 사다리와 segments 가 같은지, 회차마다 계기가 되돌아가는지, stage 가 마운트되는지 잠근다.
 * IR 은 두지 않는다(irs.ts) — 그래서 IR ↔ algorithm 대조 대신 사양 표 대조가 이 파일의 몫이다.
 */
import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView } from '@ffacet/core/runtime';
import { playRip, ripAlgorithm, type RipData } from '../src/algorithm';
import { ripFacet } from '../src/facet';
import { ripIRs } from '../src/irs';
import { ripStageView } from '../src/rip-stage';
import type { RipStage } from '../src/rip-stage';

const data = ripFacet.initialData as RipData;

/** 사양 "실측" 표 — [cut][method] = rounds · adverts · wrong-rounds */
const SPEC: [number, number, number][][] = [
  [
    [3, 18, 1],
    [3, 12, 1],
    [3, 18, 1],
    [3, 30, 1],
  ],
  [
    [3, 24, 1],
    [3, 14, 1],
    [3, 24, 1],
    [4, 8, 0],
  ],
  [
    [14, 84, 12],
    [4, 14, 2],
    [4, 24, 2],
    [3, 6, 2],
  ],
];

const TRUTH = [
  { A: 3, B: 2, C: 3, D: 2, E: 1 },
  { A: 4, B: 5, C: 3, D: 2, E: 1 },
  { A: 16, B: 16, C: 16, D: 16, E: 1 },
];

function fmt(rows: { router: string; metric: number | null; nextHop: string | null }[]): string {
  return rows.map((r) => `${r.router} ${r.metric === null ? '-' : r.metric}${r.nextHop ? `/${r.nextHop}` : ''}`).join(' · ');
}

type Ctrl = { action?: string; segments?: { value: number; default?: boolean }[] };
function controls(): Ctrl[] {
  const bar = ripFacet.blocks.controls as { controls: Ctrl[] };
  return bar.controls;
}

describe('rip — 사양 표 대조', () => {
  it('사다리가 segments 와 같고 기본값이 같다', () => {
    const method = controls().find((c) => c.action === 'method');
    const cut = controls().find((c) => c.action === 'cut');
    expect(method?.segments?.map((s) => s.value)).toEqual(data.methods.map((_, i) => i));
    expect(cut?.segments?.map((s) => s.value)).toEqual(data.cutLadder.map((_, i) => i));
    expect(method?.segments?.find((s) => s.default)?.value).toBe(data.defaultMethod);
    expect(cut?.segments?.find((s) => s.default)?.value).toBe(data.defaultCut);
    expect(data.methods).toHaveLength(4);
    expect(data.cutLadder).toHaveLength(3);
    expect(data.cutLadder[2]).toEqual([
      ['B', 'E'],
      ['D', 'E'],
    ]);
    expect(ripIRs).toEqual([]);
  });

  it('모든 조합의 계기 셋이 사양 표와 같다', () => {
    for (let c = 0; c < 3; c += 1) {
      for (let m = 0; m < 4; m += 1) {
        const p = playRip(data, m, c);
        const want = SPEC[c]?.[m];
        expect([p.totals.rounds, p.totals.adverts, p.totals.wrongRounds], `cut ${c} method ${m}`).toEqual(want);
        expect(p.truth).toEqual(TRUTH[c]);
        // 끝 표는 참값과 같다
        const last = p.rounds[p.rounds.length - 1];
        expect(last?.wrongCount).toBe(0);
      }
    }
  });

  it('기본 판(거리 벡터 × E 고립)의 걸음 차례가 사양과 같다', () => {
    const p = playRip(data, 0, 2);
    expect(fmt(p.start)).toBe('A 3/B · B 16 · C 3/D · D 16 · E 1');
    const r = p.rounds.map((x) => fmt(x.table));
    expect(r[0]).toBe('A 4/C · B 4/A · C 16/D · D 4/C · E 1');
    expect(r[1]).toBe('A 16/C · B 5/A · C 5/A · D 16/C · E 1');
    expect(r[2]).toBe('A 6/B · B 16/A · C 16/A · D 6/C · E 1');
    expect(r[11]).toBe('A 16/B · B 15/A · C 15/A · D 16/C · E 1');
    expect(r[12]).toBe('A 16/B · B 16/A · C 16/A · D 16/C · E 1');
    expect(p.rounds.map((x) => x.sent)).toEqual(Array(14).fill(6));
    expect(p.rounds[13]?.stop).toBe('unchanged');
  });

  it('B–E 에서 A 는 B 의 16 을 먼저 받고 곧 C 의 3 을 받는다 (차례가 답을 바꾼다)', () => {
    const p = playRip(data, 0, 1);
    const toA = p.rounds[0]?.adverts.filter((a) => a.to === 'A' && a.fate === 'taken');
    expect(toA?.map((a) => `${a.from}:${a.metric}`)).toEqual(['B:16', 'C:3']);
  });

  it('경로 벡터 × E 고립 — 제 이름이 든 길을 버린다', () => {
    const p = playRip(data, 2, 2);
    expect(fmt(p.rounds[0]?.table ?? [])).toBe('A 4/C · B 16 · C 4/A · D 16 · E 1');
    expect(fmt(p.rounds[1]?.table ?? [])).toBe('A 16 · B 5/A · C 16 · D 5/C · E 1');
    const dropped = p.rounds[1]?.adverts.filter((a) => a.fate === 'dropped') ?? [];
    expect(dropped.every((a) => a.path?.includes(a.to))).toBe(true);
  });

  it('링크 상태 × E 고립 — R1 에 넷 모두 틀리고 R3 에 맞는다', () => {
    const p = playRip(data, 3, 2);
    expect(fmt(p.start)).toBe('A 3/B · B 5/A · C 3/D · D 5/C · E 1');
    expect(p.rounds.map((x) => x.wrongCount)).toEqual([4, 2, 0]);
    expect(p.rounds[2]?.stop).toBe('no-copies');
  });

  it('사다리 밖 값은 던진다', () => {
    expect(() => playRip(data, 4, 0)).toThrow();
    expect(() => playRip(data, 0, 3)).toThrow();
  });
});

describe('rip — 회차별 계기 (A → B → A)', () => {
  it('손잡이를 돌릴 때마다 계기가 0 에서 다시 쌓인다', async () => {
    const totals = new Map<string, number>();
    const inputs: { type: string; payload: { value: number } }[] = [
      { type: 'method', payload: { value: 1 } },
      { type: 'method', payload: { value: 0 } },
    ];
    const snapshots: Record<string, number>[] = [];
    let cancelled = false;
    const ctx = {
      data,
      get cancelled() {
        return cancelled;
      },
      async emit() {},
      metric(name: string, delta: number | 'inc') {
        totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
      },
      async sleep() {
        return !cancelled;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        snapshots.push(Object.fromEntries(totals));
        const next = inputs.shift();
        if (next === undefined) {
          cancelled = true;
          return { type: 'none' };
        }
        return next;
      },
    };
    await ripAlgorithm(ctx as never);
    const row = (m: number, c: number): Record<string, number> => {
      const s = SPEC[c]?.[m] as [number, number, number];
      return { rounds: s[0], adverts: s[1], 'wrong-rounds': s[2] };
    };
    expect(snapshots).toEqual([row(0, 2), row(1, 2), row(0, 2)]);
  });
});

describe('rip — stage 마운트', () => {
  it('initialData 없이도, 있을 때도 마운트된다', () => {
    const a = document.createElement('div');
    const empty = mountView(ripStageView, a, { config: {} });
    empty.destroy();
    const b = document.createElement('div');
    const inst = mountView(ripStageView, b, { config: {}, initialData: data, t: makeTranslator('ko') });
    const stage = inst as unknown as RipStage;
    const p = playRip(data, 0, 2);
    stage.showStart({ method: p.method, cutLinks: p.cutLinks, table: p.start, totalRounds: p.totals.rounds }, 0);
    const rd = p.rounds[0];
    if (rd === undefined) throw new Error('라운드 없음');
    stage.showRound({ method: p.method, round: 1, adverts: rd.adverts, heldBack: rd.heldBack, table: rd.table, wrong: true }, 0);
    expect(b.textContent).toContain('172.20.0.0/16');
    inst.destroy();
  });
});
