/**
 * 세 잣대가 같은 다섯을 서로 다르게 줄 세운다 — **회차마다** 잠근다.
 *
 * 끝 상태만 보면 두 결함이 빠져나간다.
 *
 *  - `ctx.metric` 은 누적 채널이고 러너는 되감기 때만 계기를 비운다. 손잡이를
 *    돌려 다시 도는 것은 되감기가 아니므로, 차이만 보내는 헬퍼가 없으면 판을
 *    거듭할수록 수가 쌓인다. 그때 **갈리지 않아야 할 `measure-count` 까지
 *    갈린다** — 회차별로 뜨면 그 붕괴가 첫 회차 다음에 바로 잡힌다.
 *  - 잣대를 어느 차례로 고르든 한 판의 결과는 같아야 한다. 앞 판의 상태가
 *    스미면 차례를 뒤집었을 때만 어긋나므로 두 가지 차례로 돌려 본다.
 */

import { describe, expect, it } from 'vitest';
import type { FacetContext } from '@ffacet/core/runtime';
import { vectorSimilarityAlgorithm, rankOrder, type VectorSimilarityData } from '../src/algorithm.js';
import { vectorSimilarityFacet } from '../src/facet.js';

type Round = {
  measure: string;
  order: string[];
  values: Record<string, string>;
  metrics: Record<string, number>;
};

/** 잣대별 표기 — 내적만 정수다 (stage 와 같은 규칙). */
function format(measure: string, value: number): string {
  return measure === 'dot' ? String(Math.round(value)) : value.toFixed(4);
}

/**
 * 손잡이를 `picks` 차례로 돌리며 알고리즘을 끝까지 굴린다.
 *
 * 첫 판은 손잡이를 돌리기 전의 기본값(코사인)이므로 회차는 `picks.length + 1`
 * 이다. 입력이 떨어지면 취소로 알고리즘을 닫는다 — 러너의 destroy 와 같은 길이다.
 */
async function play(picks: number[]): Promise<Round[]> {
  const queue = picks.map((value) => ({ type: 'measure', payload: { value, segmentIndex: value } }));
  let cancelled = false;

  const rounds: Round[] = [];
  const metrics = new Map<string, number>();
  let measure = '';
  let values: Record<string, string> = {};
  let order: string[] = [];

  const ctx = {
    data: structuredClone(vectorSimilarityFacet.initialData),
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(event: { type: string; payload?: unknown }): Promise<void> {
      const p = (event.payload ?? {}) as Record<string, unknown>;
      if (event.type === 'measure-chosen') {
        measure = String(p.measure);
        values = {};
        order = [];
        return;
      }
      if (event.type === 'measured') {
        values[String(p.id)] = format(measure, Number(p.value));
        return;
      }
      if (event.type === 'ranked') {
        order = (p.order as string[]).slice();
        return;
      }
      if (event.type === 'done') {
        rounds.push({ measure, order, values, metrics: Object.fromEntries(metrics) });
      }
    },
    metric(name: string, delta: number | 'inc'): void {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async waitForInput(): Promise<{ type: string; payload?: unknown }> {
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
    async sleep(): Promise<boolean> {
      return !cancelled;
    },
    pollInput(): null {
      return null;
    },
  };

  await vectorSimilarityAlgorithm(ctx as unknown as FacetContext<unknown>);
  return rounds;
}

/** 사양의 실측표. 화면에 뜨는 표기 그대로 적는다. */
const TABLE: Record<string, { order: string[]; values: Record<string, string>; moved: number }> = {
  cosine: {
    order: ['Q', 'R', 'S', 'P', 'T'],
    values: { P: '0.8222', Q: '1.0000', R: '0.9021', S: '0.8944', T: '0.7234' },
    moved: 0,
  },
  euclidean: {
    order: ['R', 'S', 'P', 'T', 'Q'],
    values: { P: '3.6056', Q: '5.0000', R: '2.2361', S: '3.1623', T: '4.2426' },
    moved: 5,
  },
  dot: {
    order: ['Q', 'P', 'R', 'T', 'S'],
    values: { P: '26', Q: '50', R: '23', S: '10', T: '22' },
    moved: 4,
  },
};

describe('벡터 유사도', () => {
  it('세 잣대가 각각 사양의 순위를 낸다', async () => {
    const rounds = await play([1, 2]);
    expect(rounds.map((r) => r.measure)).toEqual(['cosine', 'euclidean', 'dot']);
    for (const round of rounds) {
      expect({ [round.measure]: round.order }).toEqual({ [round.measure]: TABLE[round.measure]!.order });
      expect(round.values).toEqual(TABLE[round.measure]!.values);
    }
  });

  it('세 순위가 서로 다르고, 한 잣대 안에 동률이 없다', async () => {
    const rounds = await play([1, 2]);
    const lines = rounds.map((r) => r.order.join(''));
    expect(new Set(lines).size).toBe(3);
    for (const round of rounds) {
      const shown = Object.values(round.values);
      expect(new Set(shown).size).toBe(shown.length);
    }
  });

  it('코사인 1등이 유클리드 꼴찌다', async () => {
    const rounds = await play([1]);
    const cos = rounds[0]!;
    const euc = rounds[1]!;
    expect(cos.order[0]).toBe('Q');
    expect(euc.order[euc.order.length - 1]).toBe('Q');
  });

  it('계기가 회차마다 그 판의 값만 말한다 — 누적되지 않는다', async () => {
    const rounds = await play([1, 2]);
    expect(rounds.map((r) => r.metrics)).toEqual([
      { 'measure-count': 5, 'rank-change-count': 0 },
      { 'measure-count': 5, 'rank-change-count': 5 },
      { 'measure-count': 5, 'rank-change-count': 4 },
    ]);
  });

  it('손잡이를 어느 차례로 돌려도 한 판의 결과가 같다', async () => {
    const rounds = await play([2, 1, 0, 1]);
    expect(rounds.map((r) => r.measure)).toEqual(['cosine', 'dot', 'euclidean', 'cosine', 'euclidean']);
    for (const round of rounds) {
      const want = TABLE[round.measure]!;
      expect({ [round.measure]: round.order }).toEqual({ [round.measure]: want.order });
      expect(round.values).toEqual(want.values);
      expect(round.metrics).toEqual({ 'measure-count': 5, 'rank-change-count': want.moved });
    }
  });

  it('동률이면 선언된 차례가 앞선다', () => {
    // 지금 데이터에는 세 잣대 어디에도 동률이 없다. 그래서 규칙 자체는 동률을
    // 만든 데이터로 잰다 — 정해 두지 않으면 좌표를 손대는 순간 실행마다 다른
    // 순위가 나온다.
    //
    // q = (4,3) 과의 내적이 셋 다 24 다: 12+12 · 0+24 · 24+0.
    const base: VectorSimilarityData = {
      type: 'vector-similarity',
      query: { id: 'q', x: 4, y: 3 },
      candidates: [
        { id: 'A', x: 3, y: 4 },
        { id: 'B', x: 0, y: 8 },
        { id: 'C', x: 6, y: 0 },
      ],
      stepMs: 1,
    };
    expect(rankOrder('dot', base)).toEqual(['A', 'B', 'C']);

    // 같은 셋을 다른 차례로 적으면 순위도 그 차례를 따른다.
    const flipped: VectorSimilarityData = {
      ...base,
      candidates: [base.candidates[2]!, base.candidates[0]!, base.candidates[1]!],
    };
    expect(rankOrder('dot', flipped)).toEqual(['C', 'A', 'B']);
  });
});
