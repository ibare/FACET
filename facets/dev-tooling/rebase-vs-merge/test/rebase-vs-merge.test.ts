/**
 * 병합과 리베이스 — 사양 표 대조.
 *
 * IR 을 두지 않으므로(irs.ts 까닭) IR ↔ algorithm 대조 대신 알고리즘을 직접 돌려 여섯 칸의 계기 · 새 해시 ·
 * 전체 커밋 · 끝 이름표 · 걸음 수를 사양 표와 견준다.
 */
import { describe, expect, it } from 'vitest';
import type { FacetRuntimeEvent } from '@ffacet/core/runtime';
import { rebaseVsMergeAlgorithm, planRebaseVsMerge, toyHash, type RebaseVsMergeData } from '../src/algorithm.js';
import { rebaseVsMergeFacet } from '../src/facet.js';

const DATA = rebaseVsMergeFacet.initialData as unknown as RebaseVsMergeData;
const METRICS = ['new-commits', 'merge-commits', 'rehashed', 'unnamed', 'label-jump'] as const;

type Round = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };
type Input = { type: string; payload: { value: number } };

/** 판마다 발신과 끝 계기를 모은다 — 입력이 다 떨어지면 멈춘다 */
async function drive(data: RebaseVsMergeData, inputs: Input[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const totals: Record<string, number> = {};
  let events: FacetRuntimeEvent[] = [];
  const queue = [...inputs];
  let cancelled = false;
  let done!: () => void;
  const idle = new Promise<void>((r) => (done = r));
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals[name] = (totals[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      rounds.push({ events, metrics: { ...totals } });
      events = [];
      const next = queue.shift();
      if (!next) {
        done();
        return new Promise<never>(() => {});
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await Promise.race([rebaseVsMergeAlgorithm(ctx as never), idle]);
  cancelled = true;
  return rounds;
}

/** 칸 하나를 한 판으로 돌린다 */
async function cell(way: number, ahead: number): Promise<Round> {
  const rounds = await drive({ ...DATA, way, ahead }, []);
  expect(rounds.length).toBe(1);
  return rounds[0]!;
}

function vector(r: Round): number[] {
  return METRICS.map((m) => r.metrics[m] ?? Number.NaN);
}

function payloads(r: Round, type: string): Record<string, unknown>[] {
  return r.events.filter((e) => e.type === type).map((e) => e.payload as Record<string, unknown>);
}

/** 판 끝의 커밋 수와 이름표 — 발신에서 읽는다 */
function ending(r: Round): { commits: number; main: string; feature: string } {
  const board = payloads(r, 'board')[0]!;
  const labels = board.labels as { main: string; feature: string };
  const commits = (board.commits as unknown[]).length + payloads(r, 'merge-commit').length + payloads(r, 'replay').length;
  let { main, feature } = labels;
  for (const m of payloads(r, 'move-label')) {
    if (m.name === 'main') main = m.to as string;
    else feature = m.to as string;
  }
  return { commits, main, feature };
}

describe('rebaseVsMerge — 사양 표', () => {
  it('장난감 해시 — 확인값과 처음 해시', () => {
    expect(toyHash('init', [])).toBe('7a732fb');
    const plan = planRebaseVsMerge(DATA, 0, 2);
    const hashes = Object.fromEntries([...plan.graph.values()].map((c) => [c.id, c.hash]));
    expect(hashes).toEqual({ A: '7a732fb', B: 'e3ad9ac', C: 'ca78789', D: '26d49cf', X: '8660ebd', Y: '6bd2bb2' });
  });

  // 길 · m · 갈라진 자리 · main 쪽 거리 · 계기 · 전체 커밋 · 끝 이름표 · 걸음 수
  const TABLE: [number, number, string, number, number[], number, string, string, number][] = [
    [0, 0, 'B', 0, [0, 0, 0, 0, 2], 4, 'Y', 'Y', 3],
    [0, 1, 'B', 1, [1, 1, 0, 0, 0], 6, 'M', 'Y', 4],
    [0, 2, 'B', 2, [1, 1, 0, 0, 0], 7, 'M', 'Y', 4],
    [1, 0, 'B', 0, [0, 0, 0, 0, 2], 4, 'Y', 'Y', 3],
    [1, 1, 'B', 1, [2, 0, 2, 2, 2], 7, "Y'", "Y'", 6],
    [1, 2, 'B', 2, [2, 0, 2, 2, 2], 8, "Y'", "Y'", 6],
  ];
  for (const [way, m, at, mainSide, metrics, total, main, feature, steps] of TABLE) {
    it(`${DATA.ways[way]} × m=${m}`, async () => {
      const r = await cell(way, m);
      expect(vector(r)).toEqual(metrics);
      const fork = payloads(r, 'fork')[0]!;
      expect([fork.at, fork.mainSide, fork.featureSide]).toEqual([at, mainSide, 2]);
      expect(ending(r)).toEqual({ commits: total, main, feature });
      expect(r.events.length).toBe(steps);
    });
  }

  it('새 해시 — 병합 커밋과 다시 놓은 커밋', async () => {
    const merge = async (m: number) => payloads(await cell(0, m), 'merge-commit')[0]!;
    expect(await merge(1)).toMatchObject({ hash: '560f75a', parents: ['C', 'Y'] });
    expect(await merge(2)).toMatchObject({ hash: '41f6470', parents: ['D', 'Y'] });
    const replay = async (m: number) => payloads(await cell(1, m), 'replay').map((p) => [p.id, p.oldHash, p.hash]);
    expect(await replay(1)).toEqual([
      ["X'", '8660ebd', '7c3d66c'],
      ["Y'", '6bd2bb2', 'b95abd3'],
    ]);
    // 조각 replay-on-new-base 의 대조와 같다
    expect(await replay(2)).toEqual([
      ["X'", '8660ebd', '82eb697'],
      ["Y'", '6bd2bb2', '07535eb'],
    ]);
  });

  it('회차별 계기 — way 1 → 0 → 1 (m=1)', async () => {
    const rounds = await drive(DATA, [
      { type: 'way', payload: { value: 0 } },
      { type: 'way', payload: { value: 1 } },
    ]);
    expect(rounds.map(vector)).toEqual([
      [2, 0, 2, 2, 2],
      [1, 1, 0, 0, 0],
      [2, 0, 2, 2, 2],
    ]);
  });

  it('회차별 계기 — ahead 1 → 0 → 2 → 1 (리베이스)', async () => {
    const rounds = await drive(DATA, [
      { type: 'ahead', payload: { value: 0 } },
      { type: 'ahead', payload: { value: 2 } },
      { type: 'ahead', payload: { value: 1 } },
    ]);
    expect(rounds.map(vector)).toEqual([
      [2, 0, 2, 2, 2],
      [0, 0, 0, 0, 2],
      [2, 0, 2, 2, 2],
      [2, 0, 2, 2, 2],
    ]);
  });

  it('사다리 = segments, main 쪽 커밋 목록 길이 = 사다리 끝값', () => {
    const controls = (rebaseVsMergeFacet.blocks.controls as { controls: { name?: string; segments?: { value: number }[] }[] }).controls;
    const seg = (name: string) => controls.find((c) => c.name === name)!.segments!.map((s) => s.value);
    expect(seg('ahead')).toEqual(DATA.aheadLadder);
    expect(seg('way')).toEqual(DATA.ways.map((_, i) => i));
    expect(DATA.mainNew.length).toBe(2);
    expect(Math.max(...DATA.aheadLadder)).toBe(DATA.mainNew.length);
    expect(DATA.ways).toEqual(['merge', 'rebase-then-merge']);
  });

  it('모르는 부모는 던진다 (C6)', () => {
    const bad: RebaseVsMergeData = { ...DATA, feature: [{ id: 'X', change: 'add-button', parents: ['Q'] }, DATA.feature[1]!] };
    expect(() => planRebaseVsMerge(bad, 1, 1)).toThrow(/모르는 커밋 'Q'/);
  });

  it('거슬러 가는 길에 부모 둘인 커밋이 나오면 던진다 (C6)', () => {
    const bad: RebaseVsMergeData = { ...DATA, feature: [{ id: 'X', change: 'add-button', parents: ['B', 'A'] }, DATA.feature[1]!] };
    expect(() => planRebaseVsMerge(bad, 1, 1)).toThrow(/부모 둘인 커밋 'X'/);
  });
});
