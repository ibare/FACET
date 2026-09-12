/**
 * 손잡이 네 값에서 재현율과 본 점이 잠긴다 — **회차마다** 본다.
 *
 * 끝 상태만 보면 놓치는 붕괴가 있다. `ctx.metric` 은 누적 채널이고 러너는
 * 되감기 때만 비우므로, 알고리즘이 차이가 아니라 값을 그대로 보내면 둘째 회차의
 * 재현율이 80 이 아니라 160 이 된다. 그래서 여기서는 러너의 누적을 그대로
 * 흉내낸 뒤 **판이 끝날 때마다** 계기의 절대값을 뜬다.
 *
 * 알고리즘을 직접 굴린다. 러너로 띄우면 한 판에 몇 초가 걸려 네 판을 잴 수 없고,
 * 여기서 재려는 것은 화면이 아니라 셈이다.
 */

import { describe, expect, it } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  MetricDelta,
  ReactiveContext,
  ReactiveInputEvent,
} from '@ffacet/core';
import { invertedFileIndexAlgorithm, type InvertedFileIndexData } from '../src/algorithm.js';
import { invertedFileIndexFacet } from '../src/facet.js';

type Round = {
  nprobe: number;
  seen: number;
  hit: number;
  recall: number;
  answer: string[];
  metrics: Record<string, number>;
};

type Run = { rounds: Round[]; order: number[]; truth: string[] };

function freshData(): InvertedFileIndexData {
  return structuredClone(invertedFileIndexFacet.initialData) as unknown as InvertedFileIndexData;
}

/** 손잡이 값을 차례로 넣고 판마다의 결과를 거둔다. 값이 떨어지면 취소로 끝낸다. */
async function run(knobs: number[]): Promise<Run> {
  const data = freshData();
  const label = (i: number): string => `(${data.points[i][0]},${data.points[i][1]})`;

  const metrics = new Map<string, number>();
  const rounds: Round[] = [];
  const queue = [...knobs];
  let order: number[] = [];
  let truth: string[] = [];
  let nprobe = data.nprobe;
  let cancelled = false;

  const ctx = {
    data,
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent): Promise<void> {
      const p = (event.payload ?? {}) as Record<string, unknown>;
      if (event.type === 'round-begin') {
        nprobe = p.nprobe as number;
        truth = (p.truth as number[]).map(label);
      }
      if (event.type === 'probe-order') order = p.order as number[];
      if (event.type === 'round-end') {
        rounds.push({
          nprobe,
          seen: p.seen as number,
          hit: p.hit as number,
          recall: p.recall as number,
          answer: (p.answer as number[]).map(label),
          metrics: Object.fromEntries(metrics),
        });
      }
    },
    // 러너의 누적 채널을 그대로 흉내낸다 (ReactiveMechanism.createContext).
    metric(name: string, delta: MetricDelta): void {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep(): Promise<boolean> {
      return true;
    },
    async waitForInput(): Promise<ReactiveInputEvent> {
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'nprobe', payload: { value: next } };
    },
    pollInput(): ReactiveInputEvent | null {
      return null;
    },
  } as unknown as ReactiveContext<InvertedFileIndexData>;

  await invertedFileIndexAlgorithm(ctx as FacetContext<InvertedFileIndexData>);
  return { rounds, order, truth };
}

describe('역파일 색인', () => {
  it('연 칸 1·2·3·4 에서 재현율 40·80·100·100 과 본 점 6·12·18·24 가 난다', async () => {
    // 첫 판은 선언의 기본값(2)으로 돌고, 그 뒤로 손잡이를 1·2·3·4 로 옮긴다.
    const { rounds } = await run([1, 2, 3, 4]);

    expect(rounds.map((r) => r.nprobe)).toEqual([2, 1, 2, 3, 4]);
    expect(rounds.map((r) => r.seen)).toEqual([12, 6, 12, 18, 24]);
    expect(rounds.map((r) => r.hit)).toEqual([4, 2, 4, 5, 5]);
    expect(rounds.map((r) => r.recall)).toEqual([80, 40, 80, 100, 100]);
  });

  it('계기가 회차마다 그 판의 값을 가리킨다 — 쌓이지 않는다', async () => {
    const { rounds } = await run([1, 2, 3, 4]);

    expect(rounds.map((r) => r.metrics)).toEqual([
      { 'recall-percent': 80, 'scanned-count': 12 },
      { 'recall-percent': 40, 'scanned-count': 6 },
      { 'recall-percent': 80, 'scanned-count': 12 },
      { 'recall-percent': 100, 'scanned-count': 18 },
      { 'recall-percent': 100, 'scanned-count': 24 },
    ]);
  });

  it('재현율 100 이 이어지는 자리에서도 계기가 빠지지 않는다 — 델타 0 을 보낸다', async () => {
    const { rounds } = await run([3, 4]);
    // 두 판 다 100 이다. 델타가 0 인 판에서 이름이 통째로 빠지면 "선언한 계기가
    // 없는 것" 과 구별되지 않는다.
    expect(rounds.slice(1).map((r) => Object.keys(r.metrics).sort())).toEqual([
      ['recall-percent', 'scanned-count'],
      ['recall-percent', 'scanned-count'],
    ]);
  });

  it('답 다섯이 좌표까지 잠긴다', async () => {
    const { rounds, truth } = await run([1, 2, 3, 4]);

    expect(truth).toEqual(['(5,14)', '(4,6)', '(5,4)', '(16,5)', '(4,15)']);
    expect(rounds[1].answer).toEqual(['(5,14)', '(4,15)', '(2,14)', '(3,16)', '(5,18)']);
    expect(rounds[2].answer).toEqual(['(5,14)', '(4,6)', '(5,4)', '(4,15)', '(3,5)']);
    expect(rounds[3].answer).toEqual(['(5,14)', '(4,6)', '(5,4)', '(16,5)', '(4,15)']);
    // 칸 셋을 연 것과 넷을 연 것의 답이 같다 — 넷째 칸에는 참값이 하나도 없다.
    expect(rounds[4].answer).toEqual(rounds[3].answer);
  });

  it('동률인 두 칸의 차례가 칸 번호로 갈린다', async () => {
    const { order } = await run([]);
    // 칸 1 과 칸 3 은 질의에서 정확히 같은 거리다. 규칙이 없으면 부동소수의
    // 마지막 비트가 차례를 정하고, 그러면 셋째 판의 재현율이 100 이 아니라 80 이 된다.
    expect(order).toEqual([2, 0, 1, 3]);
  });

  it('선언의 기본 칸 수와 손잡이의 기본 구간이 같다', () => {
    const controls = invertedFileIndexFacet.blocks.controls as {
      controls: { widget: string; segments?: { value: number; default?: boolean }[] }[];
    };
    const slider = controls.controls.find((c) => c.widget === 'segmented-slider');
    const fallback = slider?.segments?.find((s) => s.default === true);
    const data = freshData();
    expect(fallback?.value).toBe(data.nprobe);
  });
});
