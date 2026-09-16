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
  curvesCrossScene,
  findCrossingIndex,
  type CurvesCrossData,
  type CurvesCrossScene,
} from '../src/index.js';
import { crossingIndexOf, currentRow, phaseOf, settledRows } from '../src/scene.js';
import type { FacetContext, FacetRuntimeEvent, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 선언이 준 것. 여기서 읽은 값으로만 아래를 셈한다. */
const data = curvesCrossFacet.initialData as unknown as CurvesCrossData;

describe('선언한 데이터', () => {
  it('1차 데이터는 사다리와 두 식의 모양뿐이다', () => {
    expect(data.type).toBe('curves-cross');
    expect(data.sizes).toEqual([2, 4, 8, 12, 16, 20, 32, 64]);
    expect(data.insertion).toEqual({ exponent: 2, divisor: 4 });
    expect(data.merge).toEqual({ logBase: 2 });
    // 걸음 벽시계는 `stepMs` + 애니메이션이다. 가장 얇은 걸음이 1,040ms 로
    // 실측되었고 (실무 규칙 240 + 800), 바닥선 800ms 를 넘는다 (S-piece).
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
    // 줄이 아니라 **번호**가 나온다 — 화면의 자리는 배열의 차례가 정하므로
    // 줄에도 번호를 적어 두면 같은 물음에 답이 둘이 된다.
    const at = findCrossingIndex(rows);
    expect(at).toBe(4);
    expect(rows[at]!.n).toBe(16);
  });

  it('세 갈래가 고정 데이터에서 모두 일어난다', () => {
    // 선언한 캡션 셋(insertionCheaper · tie · mergeCheaper)이 전부 한 번은 뜬다.
    const leads = new Set(rows.map((r) => r.lead));
    expect([...leads].sort()).toEqual(['insertion', 'merge', 'tie']);
  });
});

/**
 * 자동 재생 한 바퀴만 굴린다. 끝나면 취소된 것처럼 굴어 손을 떼게 한다.
 *
 * 아래 두 describe 가 함께 쓰므로 바깥에 둔다 — 걸음을 재는 쪽과 장면을 재는
 * 쪽이 **같은 한 주행**을 봐야 둘이 갈리지 않는다.
 */
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

describe('걸음', () => {
  it('판 세우기 · 사다리 여덟 · 경계 · 실무 규칙', async () => {
    const seen = await runOnce();
    expect(seen.map((e) => e.type)).toEqual([
      'board-set',
      ...data.sizes.map(() => 'weigh'),
      'mark-threshold',
      'library-rule',
    ]);
  });

  it('다섯 발신 모두 payload 가 비어 있다', async () => {
    const seen = await runOnce();
    // 화면에 뜨는 수를 걸음에 실으면 접시의 수와 표의 색이 두 출처가 된다.
    // 발신에서까지 걷어내야 다음 사람이 집어 쓸 문이 닫힌다 (프로토콜 4 절).
    for (const event of seen) expect(event.payload).toEqual({});
  });
});

/**
 * 장면이 낸 수가 다시 셈한 표와 같은가.
 *
 * 옛 검사는 **발신의 payload** 를 표와 대조했다. payload 가 비었으므로 같은 뜻을
 * 한 칸 아래에서 잰다 — 화면이 실제로 읽는 것은 장면이니, 재야 할 것도 장면이다.
 */
describe('장면', () => {
  /** 자동 재생 한 바퀴의 발신을 걸음마다 이어 붙인 장면들. */
  async function track(): Promise<CurvesCrossScene[]> {
    const seen = await runOnce();
    const scenes = [curvesCrossScene.initial(data)];
    for (const event of seen) {
      scenes.push(curvesCrossScene.reduce(scenes[scenes.length - 1]!, event));
    }
    return scenes;
  }

  it('바탕의 표가 다시 셈한 것과 같다', async () => {
    const scenes = await track();
    const rows = computeCurvesCrossRows(data);
    for (const scene of scenes) expect(scene.rows).toEqual(rows);
  });

  it('걸음마다 한 칸씩 저울에 오르고, 오른 줄이 표의 그 칸이다', async () => {
    const scenes = await track();
    const rows = computeCurvesCrossRows(data);
    const weighing = scenes.filter((s) => phaseOf(s) === 'weigh');
    expect(weighing).toHaveLength(rows.length);
    weighing.forEach((scene, i) => {
      expect(scene.weighed).toBe(i + 1);
      expect(currentRow(scene)).toEqual(rows[i]);
      expect(settledRows(scene)).toEqual(rows.slice(0, i + 1));
    });
  });

  it('경계와 규칙이 같은 칸을 가리킨다', async () => {
    const scenes = await track();
    const marked = scenes.filter((s) => s.threshold);
    const ruled = scenes.filter((s) => s.rule);
    expect(marked.length).toBeGreaterThan(0);
    expect(ruled.length).toBeGreaterThan(0);
    // 둘 다 같은 함수에서 자리를 얻으므로 갈릴 수가 없다 — 그것을 못박는다.
    for (const scene of [...marked, ...ruled]) {
      const at = crossingIndexOf(scene);
      expect(at).toBe(4);
      expect(scene.rows[at!]!.n).toBe(16);
    }
  });

  it('국면은 네 필드가 온전히 정한다', async () => {
    const scenes = await track();
    expect(scenes.map(phaseOf)).toEqual([
      'blank',
      'board',
      ...data.sizes.map(() => 'weigh'),
      'threshold',
      'rule',
    ]);
  });

  it('되감으면 바탕만 남는다', async () => {
    const scenes = await track();
    const last = scenes[scenes.length - 1]!;
    const rewound = curvesCrossScene.reduce(last, { type: 'rewind', payload: {} });
    // 자취가 한 톨도 남지 않아야 처음 화면과 글자까지 같아진다 (프로토콜 함정 14).
    expect(rewound).toEqual(curvesCrossScene.initial(data));
    expect(phaseOf(rewound)).toBe('blank');
  });

  it('앞 장면을 제자리에서 고치지 않는다', async () => {
    const scenes = await track();
    const before = JSON.stringify(scenes[2]);
    curvesCrossScene.reduce(scenes[2]!, { type: 'weigh', payload: {} });
    expect(JSON.stringify(scenes[2])).toBe(before);
  });
});
