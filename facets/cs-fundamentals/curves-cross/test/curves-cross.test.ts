/**
 * curves-cross — 화면에 뜨는 수가 맞는가.
 *
 * **선언에서 데이터를 읽어 그 자리에서 다시 셈해 대조한다.** 사양의 표를
 * `initialData` 에 옮겨 적지 않았으므로, 값이 맞는지 말해 줄 것은 이 대조뿐이다.
 * 스크래치로 한 번 재는 것은 남지 않는다 — 근거의 정본은 커밋된 이 파일이다.
 */

import { describe, expect, it } from 'vitest';
import {
  computeCurvesCrossRows,
  curvesCrossAlgorithm,
  curvesCrossFacet,
  findCrossing,
  type CostRow,
  type CurvesCrossData,
} from '../src/index.js';
import type { FacetContext, FacetRuntimeEvent, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 선언이 준 것. 여기서 읽은 값으로만 아래를 셈한다. */
const data = curvesCrossFacet.initialData as unknown as CurvesCrossData;

describe('선언한 데이터', () => {
  it('1차 데이터는 사다리와 두 식의 모양뿐이다', () => {
    expect(data.type).toBe('curves-cross');
    expect(data.sizes).toEqual([2, 4, 8, 12, 16, 20, 32, 64]);
    expect(data.insertion).toEqual({ exponent: 2, divisor: 4 });
    expect(data.merge).toEqual({ logBase: 2 });
    // 걸음 벽시계는 `stepMs` + 애니메이션이다. 가장 얇은 걸음이 1,100ms 로
    // 실측되었고 (판 세우기 300 + 800), 바닥선 800ms 를 넘는다 (S-piece).
    expect(data.stepMs).toBe(800);
  });

  it('파생값을 선언에 적어 두지 않았다', () => {
    const flat = JSON.stringify(data);
    // 표의 수(1024 · 384 · 43 …)가 선언에 있으면 호스트의 오타가 그대로 화면에 뜬다.
    expect(flat).not.toContain('1024');
    expect(flat).not.toContain('384');
  });
});

describe('비용 표', () => {
  const rows = computeCurvesCrossRows(data);

  it('선언의 모양에서 다시 셈한 값과 같다', () => {
    // 알고리즘을 보지 않고 여기서 독립으로 셈한다 — log2 대신 자연로그 비로.
    const again = data.sizes.map((n) => ({
      n,
      insertion: Math.round(n ** data.insertion.exponent / data.insertion.divisor),
      merge: Math.round((n * Math.log(n)) / Math.log(data.merge.logBase)),
    }));
    expect(rows.map((r) => ({ n: r.n, insertion: r.insertion, merge: r.merge }))).toEqual(again);
  });

  it('사다리 여덟 칸의 값', () => {
    expect(rows.map((r) => [r.n, r.insertion, r.merge])).toEqual([
      [2, 1, 2],
      [4, 4, 8],
      [8, 16, 24],
      [12, 36, 43],
      [16, 64, 64],
      [20, 100, 86],
      [32, 256, 160],
      [64, 1024, 384],
    ]);
  });

  it('n log₂n 은 정수가 아니다 — 반올림 규칙을 못박는다', () => {
    // n = 12 에서 43.0195…, n = 20 에서 86.4385…. 화면이 보이는 수와 판정하는
    // 수가 같아야 하므로 **반올림한 뒤에** 견준다.
    expect(12 * Math.log2(12)).toBeCloseTo(43.01955, 5);
    expect(20 * Math.log2(20)).toBeCloseTo(86.43856, 5);
    expect(rows[3]!.merge).toBe(43);
    expect(rows[5]!.merge).toBe(86);
  });

  it('n = 16 에서 정확히 만난다', () => {
    const tie = rows.filter((r) => r.lead === 'tie');
    expect(tie).toHaveLength(1);
    expect(tie[0]!.n).toBe(16);
    expect(tie[0]!.insertion).toBe(tie[0]!.merge);
    // 반올림 이전에도 같다 — 16 log₂16 = 16 × 4 = 64 = 16²/4.
    expect(16 * Math.log2(16)).toBe(64);
  });

  it('앞은 삽입, 뒤는 병합 — 한 번만 뒤집힌다', () => {
    expect(rows.map((r) => r.lead)).toEqual([
      'insertion',
      'insertion',
      'insertion',
      'insertion',
      'tie',
      'merge',
      'merge',
      'merge',
    ]);
    const flips = rows.filter((r, i) => i > 0 && r.lead !== rows[i - 1]!.lead).length;
    expect(flips).toBe(2); // insertion → tie → merge. 되돌아가지 않는다.
  });

  it('교차점은 사다리의 다섯째 칸', () => {
    const crossing = findCrossing(rows);
    expect(crossing.n).toBe(16);
    expect(crossing.index).toBe(4);
  });

  it('세 갈래가 고정 데이터에서 모두 일어난다', () => {
    // 선언한 캡션 셋(insertionCheaper · tie · mergeCheaper)이 전부 한 번은 뜬다.
    const leads = new Set(rows.map((r) => r.lead));
    expect([...leads].sort()).toEqual(['insertion', 'merge', 'tie']);
  });
});

describe('걸음', () => {
  /** 자동 재생 한 바퀴만 굴린다. 끝나면 취소된 것처럼 굴어 손을 떼게 한다. */
  async function runOnce(): Promise<FacetRuntimeEvent[]> {
    const seen: FacetRuntimeEvent[] = [];
    let cancelled = false;
    let metrics = 0;
    const ctx = {
      data: JSON.parse(JSON.stringify(data)) as CurvesCrossData,
      get cancelled(): boolean {
        return cancelled;
      },
      async emit(event: FacetRuntimeEvent): Promise<void> {
        seen.push(event);
      },
      metric(): void {
        metrics += 1;
      },
      async sleep(): Promise<boolean> {
        return !cancelled;
      },
      async waitForInput(): Promise<ReactiveInputEvent> {
        // 자동 재생이 끝난 자리다. 되감기로 넘어가지 않게 여기서 손을 뗀다.
        cancelled = true;
        throw new Error('cancelled');
      },
      pollInput(): ReactiveInputEvent | null {
        return null;
      },
    };
    await curvesCrossAlgorithm(ctx as unknown as FacetContext<CurvesCrossData>);
    // 조각은 셀 것이 없다 — `ctx.metric` 을 부르지 않는다 (S-piece).
    expect(metrics).toBe(0);
    return seen;
  }

  it('판 세우기 · 사다리 여덟 · 경계 · 실무 규칙', async () => {
    const seen = await runOnce();
    expect(seen.map((e) => e.type)).toEqual([
      'board-set',
      ...data.sizes.map(() => 'weigh'),
      'mark-threshold',
      'library-rule',
    ]);
  });

  it('발신한 수가 다시 셈한 표와 같다', async () => {
    const seen = await runOnce();
    const rows = computeCurvesCrossRows(data);
    const weighed = seen
      .filter((e) => e.type === 'weigh')
      .map((e) => e.payload as Pick<CostRow, 'index' | 'n' | 'insertion' | 'merge' | 'lead'>);
    expect(weighed).toEqual(
      rows.map((r) => ({
        index: r.index,
        n: r.n,
        insertion: r.insertion,
        merge: r.merge,
        lead: r.lead,
      })),
    );
  });

  it('경계와 규칙이 같은 칸을 가리킨다', async () => {
    const seen = await runOnce();
    const threshold = seen.find((e) => e.type === 'mark-threshold')?.payload as { n: number; index: number };
    const rule = seen.find((e) => e.type === 'library-rule')?.payload as { n: number; index: number };
    expect(threshold).toEqual({ n: 16, index: 4 });
    expect(rule).toEqual(threshold);
  });
});
