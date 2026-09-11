/**
 * growth-outpaces — 선언에서 데이터를 읽어 **그 자리에서 다시 셈해** 대조한다.
 *
 * 근거의 정본은 스크래치가 아니라 커밋된 검사여야 한다. 측정 스크립트는 형제
 * 조각과 한 디렉터리를 쓰므로 서로 덮어쓸 수 있고, 실제로 덮인 적이 있다 —
 * 여기서 재면 그 위험에 노출되지 않는다.
 */

import { describe, expect, it } from 'vitest';
import type { FacetContext, FacetRuntimeEvent } from '@ffacet/core/runtime';
import { computeRung, growthOutpaces, type GrowthOutpacesData } from '../src/algorithm.js';
import { growthOutpacesFacet } from '../src/facet.js';

/** 저장소가 번역 번들을 갖춘 열 언어. `messages/*.json` 과 같다. */
const LOCALES = ['en', 'ko', 'ja', 'zh', 'ar', 'es', 'fr', 'hi', 'id', 'pt'] as const;

/**
 * 대조표. 사양이 준 값이며 **아래 검사가 선언에서 다시 셈한 것과 같아야 한다.**
 * 둘이 어긋나면 선언이 틀렸거나 이 표가 틀린 것이고, 어느 쪽이든 화면이 거짓을
 * 말하게 된다.
 */
const TABLE = [
  { n: 1, quad: 1, lin: 10, cons: 100, sum: 111, pct: '0.9', topIndex: 2, tie: false },
  { n: 5, quad: 25, lin: 50, cons: 100, sum: 175, pct: '14.3', topIndex: 2, tie: false },
  { n: 10, quad: 100, lin: 100, cons: 100, sum: 300, pct: '33.3', topIndex: 0, tie: true },
  { n: 50, quad: 2500, lin: 500, cons: 100, sum: 3100, pct: '80.6', topIndex: 0, tie: false },
  { n: 100, quad: 10000, lin: 1000, cons: 100, sum: 11100, pct: '90.1', topIndex: 0, tie: false },
  { n: 1000, quad: 1000000, lin: 10000, cons: 100, sum: 1010100, pct: '99.0', topIndex: 0, tie: false },
];

const data = growthOutpacesFacet.initialData as unknown as GrowthOutpacesData;

/** projector 가 캡션과 막대에 같은 수를 쓰도록 쓰는 그 셈. */
const pctOf = (share: number): string => (share * 100).toFixed(1);

type Ctx = FacetContext<GrowthOutpacesData>;

/**
 * 알고리즘을 굴려 발신을 모은다. `advance` 를 몇 번 줄지 정하고, 다 쓰면 취소로
 * 접어 끝낸다 — reactive 조각은 스스로 멎지 않기 때문이다.
 */
async function run(advances: number): Promise<FacetRuntimeEvent[]> {
  const events: FacetRuntimeEvent[] = [];
  let cancelled = false;
  let left = advances;
  const ctx = {
    data: structuredClone(data),
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent): Promise<void> {
      events.push(event);
    },
    metric(): void {
      throw new Error('조각은 metric 을 부르지 않는다 (S-piece)');
    },
    async sleep(): Promise<boolean> {
      return true;
    },
    pollInput(): null {
      return null;
    },
    async waitForInput(): Promise<{ type: string }> {
      if (left > 0) {
        left -= 1;
        return { type: 'advance' };
      }
      cancelled = true;
      throw new Error('cancelled');
    },
  };
  await growthOutpaces(ctx as unknown as Ctx);
  return events;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, number> {
  return event.payload as Record<string, number>;
}

describe('growth-outpaces 의 선언', () => {
  it('1차 데이터는 계수 셋과 사다리뿐이다 — 파생값을 옮겨 적지 않았다', () => {
    expect(Object.keys(data).sort()).toEqual(
      ['constant', 'ladder', 'linear', 'quadratic', 'stepMs', 'type'].sort(),
    );
    expect(data.type).toBe('growth-outpaces');
    expect([data.quadratic, data.linear, data.constant]).toEqual([1, 10, 100]);
    expect(data.ladder).toEqual(TABLE.map((r) => r.n));
  });

  it('걸음 간격이 바닥선 위다 — 가장 얇은 걸음도 800ms 아래로 떨어지지 않게', () => {
    // 벽시계는 `애니메이션 + stepMs` 다. 이 수는 그중 정지 시간이고, 이 조각의
    // 모든 걸음에는 460ms 이상의 운동이 붙는다 (stage 의 SLIDE_MS + DROP_MS).
    expect(data.stepMs).toBeGreaterThanOrEqual(800);
  });

  it('열 언어를 다 채웠다', () => {
    const tables: Array<[string, Record<string, string | undefined>]> = [
      ['title', growthOutpacesFacet.title as Record<string, string | undefined>],
      ['description', growthOutpacesFacet.description as Record<string, string | undefined>],
      ...Object.entries(growthOutpacesFacet.messages ?? {}).map(
        ([k, v]) => [k, v as Record<string, string | undefined>] as [string, Record<string, string | undefined>],
      ),
    ];
    const short: string[] = [];
    for (const [name, table] of tables) {
      for (const loc of LOCALES) if (!table[loc]) short.push(`${name} [${loc}]`);
    }
    expect(short).toEqual([]);
  });

  it('en 이 쓰는 플레이스홀더를 번역이 빠뜨리지 않는다', () => {
    const marks = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
    const bad: string[] = [];
    for (const [key, table] of Object.entries(growthOutpacesFacet.messages ?? {})) {
      const loc = table as Record<string, string | undefined>;
      const want = marks(loc.en ?? '');
      for (const l of LOCALES) {
        const got = new Set(marks(loc[l] ?? ''));
        for (const p of want) if (!got.has(p)) bad.push(`${key} [${l}] {${p}} 빠짐`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('선언에서 다시 셈한 사다리', () => {
  it('항 · 합 · 몫이 대조표와 같다', () => {
    const got = data.ladder.map((n) => {
      const r = computeRung(data, n);
      return {
        n: r.n,
        quad: r.quad,
        lin: r.lin,
        cons: r.cons,
        sum: r.sum,
        pct: pctOf(r.share),
        topIndex: r.topIndex,
        tie: r.tie,
      };
    });
    expect(got).toEqual(TABLE);
  });

  it('세 항이 정확히 같아지는 자리는 n = 10 하나다', () => {
    const ties = data.ladder.filter((n) => computeRung(data, n).tie);
    expect(ties).toEqual([10]);
    const r = computeRung(data, 10);
    expect([r.quad, r.lin, r.cons]).toEqual([100, 100, 100]);
  });

  it('가장 큰 항이 상수에서 최고차항으로 한 번만 뒤집힌다', () => {
    expect(data.ladder.map((n) => computeRung(data, n).topIndex)).toEqual([2, 2, 0, 0, 0, 0]);
  });

  it('사다리 끝의 합이 32비트 안에 든다', () => {
    const max = Math.max(...data.ladder.map((n) => computeRung(data, n).sum));
    expect(max).toBe(1010100);
    expect(max).toBeLessThan(2 ** 31 - 1);
  });
});

describe('알고리즘이 내는 걸음', () => {
  it('자동 재생 한 바퀴는 사다리 여섯 단과 마무리다', async () => {
    const events = await run(0);
    expect(events.map((e) => e.type)).toEqual([
      'begin',
      'rung',
      'tie',
      'rung',
      'rung',
      'rung',
      'settle',
    ]);
  });

  it('걸음이 실어 보내는 수가 그 자리에서 다시 셈한 것과 같다', async () => {
    const events = await run(0);
    const rungs = events.filter((e) => e.type !== 'settle');
    expect(rungs.length).toBe(TABLE.length);
    rungs.forEach((event, i) => {
      const want = TABLE[i]!;
      const p = payloadOf(event);
      expect({
        n: p.n,
        quad: p.quad,
        lin: p.lin,
        cons: p.cons,
        sum: p.sum,
        pct: pctOf(p.share!),
        topIndex: p.topIndex,
      }).toEqual({
        n: want.n,
        quad: want.quad,
        lin: want.lin,
        cons: want.cons,
        sum: want.sum,
        pct: want.pct,
        topIndex: want.topIndex,
      });
    });
  });

  it('화면 문안을 payload 로 보내지 않는다 (C10)', async () => {
    const events = await run(0);
    for (const event of events) {
      for (const v of Object.values(payloadOf(event))) {
        expect(typeof v).toBe('number');
      }
    }
  });

  it('선언한 캡션 넷이 고정 데이터에서 모두 한 번은 뜬다', async () => {
    const events = await run(0);
    const types = new Set(events.map((e) => e.type));
    // 캡션을 가진 갈래와 선언의 키가 1:1 이다.
    expect([...types].filter((t) => t !== 'rewind').sort()).toEqual(
      ['begin', 'rung', 'settle', 'tie'].sort(),
    );
    expect(Object.keys(growthOutpacesFacet.messages ?? {}).sort()).toEqual(
      ['caption.begin', 'caption.rung', 'caption.settle', 'caption.tie'].sort(),
    );
  });

  it('자동 재생이 끝난 뒤 처음 누르는 advance 는 되감고 첫 걸음까지 간다', async () => {
    const auto = await run(0);
    const withPress = await run(1);
    // 되감기 하나로 끝나면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
    expect(withPress.slice(auto.length).map((e) => e.type)).toEqual(['rewind', 'begin']);
  });
});
