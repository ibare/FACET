/**
 * 손잡이 다섯 칸이 사양의 표와 같은가 — 회차마다.
 *
 * 화면 쪽 수는 **실제 알고리즘을 돌려서** 받는다. 같은 셈을 하는 함수를 하나 더
 * 두고 그것과 견주면 둘이 나란히 틀릴 수 있다. 재는 자리는 화면이 실제로 받는
 * `done` 페이로드와, 컨트롤바가 받는 계기값이다.
 *
 * **회차마다** 재는 까닭이 있다. `ctx.metric` 은 누적 채널이고 러너는 되감기
 * 때만 그것을 비운다 — 손잡이를 돌려 다시 도는 것은 되감기가 아니다. 차이만
 * 보내는 헬퍼가 어긋나면 첫 회차는 맞고 둘째 회차부터 틀리는데, 한 번만 재면
 * 그것이 보이지 않는다. 그래서 같은 차원(32)을 연달아 두 번 고르는 회차까지 넣는다.
 *
 * 곁들여 **화면이 말하는 수와 화면이 그린 것이 같은지**도 본다. 직전 배치에서
 * 캡션이 셋이라 말하는데 넷이 서 있었고 검사 전부가 통과한 채 사람이 읽고서야
 * 잡혔다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  getProjector,
  mountView,
  registerProjector,
  runFacet,
} from '@ffacet/core/runtime';
import type {
  FacetContext,
  FacetRuntimeEvent,
  MetricDelta,
  ReactiveInputEvent,
} from '@ffacet/core/runtime';

import {
  exhaustiveSearchAlgorithm,
  exhaustiveSearchCost,
  exhaustiveSearchTilesMax,
  exhaustiveSearchUnit,
} from '../src/algorithm.js';
import type { ExhaustiveSearchData } from '../src/algorithm.js';
import { exhaustiveSearchFacet } from '../src/facet.js';
import {
  exhaustiveSearchPlateGrid,
  exhaustiveSearchStageView,
} from '../src/exhaustive-search-stage.js';
import type { ExhaustiveScene, ExhaustiveStep } from '../src/exhaustive-search-stage.js';
import { registerExhaustiveSearch } from '../src/index.js';

/** 사양의 다섯 칸. 후보 64 고정. */
const EXPECTED = [
  { dim: 2, multiplies: 128, vectorBytes: 8, totalBytes: 512 },
  { dim: 8, multiplies: 512, vectorBytes: 32, totalBytes: 2_048 },
  { dim: 32, multiplies: 2_048, vectorBytes: 128, totalBytes: 8_192 },
  { dim: 128, multiplies: 8_192, vectorBytes: 512, totalBytes: 32_768 },
  { dim: 768, multiplies: 49_152, vectorBytes: 3_072, totalBytes: 196_608 },
];

const DATA = exhaustiveSearchFacet.initialData as unknown as ExhaustiveSearchData;

type Round = {
  dim: number;
  multiplies: number;
  bytes: number;
  vectorBytes: number;
  marks: number;
  metricMultiply: number;
  metricBytes: number;
};

/**
 * 알고리즘을 돌려 회차마다의 끝값을 모은다.
 *
 * `picks` 를 차례로 손잡이처럼 넣고, 다 쓰면 취소로 끝낸다 — 러너의
 * reset/destroy 가 `waitForInput` 을 reject 하는 것과 같은 모양이다.
 * 계기는 러너와 똑같이 **델타를 더해** 들고 있는다.
 */
async function replay(picks: number[]): Promise<{ rounds: Round[]; names: string[] }> {
  const data = structuredClone(DATA);
  const rounds: Round[] = [];
  const metrics = new Map<string, number>();
  const names = new Set<string>();
  let cancelled = false;
  let cursor = 0;
  let dim = data.dim;
  let vectorBytes = 0;
  let marks = 0;

  const ctx = {
    data,
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent): Promise<void> {
      const p = event.payload as Record<string, unknown> | undefined;
      if (typeof p !== 'object' || p === null) return;
      if (event.type === 'state-changed') {
        if (typeof p.dim === 'number') dim = p.dim;
        if (typeof p.vectorBytes === 'number') vectorBytes = p.vectorBytes;
        marks = 0;
      }
      if (event.type === 'mark') marks += 1;
      if (event.type === 'done' && typeof p.multiplies === 'number' && typeof p.bytes === 'number') {
        rounds.push({
          dim,
          multiplies: p.multiplies,
          bytes: p.bytes,
          vectorBytes,
          marks,
          metricMultiply: metrics.get('multiply-count') ?? -1,
          metricBytes: metrics.get('byte-sum') ?? -1,
        });
      }
    },
    metric(name: string, delta: MetricDelta): void {
      names.add(name);
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep(): Promise<boolean> {
      return true;
    },
    pollInput(): ReactiveInputEvent | null {
      return null;
    },
    async waitForInput(): Promise<ReactiveInputEvent> {
      if (cursor < picks.length) {
        const value = picks[cursor];
        cursor += 1;
        return { type: 'dims', payload: { value } };
      }
      cancelled = true;
      throw new Error('cancelled');
    },
  };

  await exhaustiveSearchAlgorithm(ctx as unknown as FacetContext<ExhaustiveSearchData>);
  return { rounds, names };
}

function rowOf(dim: number): (typeof EXPECTED)[number] {
  const row = EXPECTED.find((r) => r.dim === dim);
  if (!row) throw new Error(`사양에 없는 차원: ${dim}`);
  return row;
}

/** 컨트롤바에서 손잡이 하나를 꺼낸다. */
function slider(): Record<string, unknown> {
  const bar = exhaustiveSearchFacet.blocks.controls as unknown as {
    controls: Array<Record<string, unknown>>;
  };
  const found = bar.controls.find((c) => c.widget === 'segmented-slider');
  if (!found) throw new Error('손잡이가 없다');
  return found;
}

describe('완전 탐색', () => {
  it('화면이 받는 수가 사양의 다섯 칸과 같다 — 회차마다', async () => {
    // 첫 회차는 1차 데이터의 차원(32)으로 돌고, 나머지는 손잡이로 넣는다.
    // 32 를 두 번 더 고르는 것은 누적 채널이 회차마다 제자리로 오는지 보려는 것이다.
    const { rounds } = await replay([8, 128, 2, 768, 32, 32]);

    expect(rounds.map((r) => r.dim)).toEqual([32, 8, 128, 2, 768, 32, 32]);
    expect(
      rounds.map((r) => ({
        dim: r.dim,
        multiplies: r.multiplies,
        vectorBytes: r.vectorBytes,
        totalBytes: r.bytes,
      })),
    ).toEqual(rounds.map((r) => rowOf(r.dim)));
  });

  it('계기가 회차마다 끝값에 앉는다 — 누적 채널이라 차이만 보낸다', async () => {
    const { rounds } = await replay([768, 2, 768, 32]);
    const drift = rounds.filter(
      (r) => r.metricMultiply !== rowOf(r.dim).multiplies || r.metricBytes !== rowOf(r.dim).totalBytes,
    );
    expect(drift).toEqual([]);
    // 마지막 회차의 계기가 사양의 32 줄과 같다 — 회차를 넷 돈 뒤에도.
    expect(rounds[rounds.length - 1]?.metricMultiply).toBe(2_048);
  });

  it('계기 이름이 facet.ts 선언과 같다', async () => {
    const { names } = await replay([8]);
    const bar = exhaustiveSearchFacet.blocks.controls as unknown as {
      metrics: Array<{ name: string }>;
    };
    expect([...names].sort()).toEqual(bar.metrics.map((m) => m.name).sort());
  });

  it('한 회차는 후보를 묶음 수만큼 나눠 훑는다', async () => {
    const { rounds } = await replay([2, 768]);
    const steps = DATA.candidates / DATA.batch;
    expect(rounds.map((r) => r.marks)).toEqual([steps, steps, steps]);
  });

  it('손잡이 구간이 1차 데이터의 사다리와 같고 기본값이 시작 차원이다', () => {
    const segments = (slider().segments ?? []) as Array<{ value: number; label: unknown; default?: boolean }>;
    expect(segments.map((s) => s.value)).toEqual(DATA.dims);
    expect(segments.filter((s) => s.default === true).map((s) => s.value)).toEqual([DATA.dim]);
    // 구간 라벨은 단일 문자열이어야 한다 — 수 하나가 열 언어를 요구하지 않는다.
    for (const seg of segments) expect(typeof seg.label).toBe('string');
  });

  it('손잡이를 받으려면 reactive 로 등록되어야 한다', () => {
    registerExhaustiveSearch();
    expect(getAlgorithmMechanismKind('exhaustiveSearch')).toBe('reactive');
  });

  it('가장 큰 수가 32비트 천장 아래다 — 상한을 데이터에서 다시 셈한다', () => {
    const worst = exhaustiveSearchCost(DATA.candidates, Math.max(...DATA.dims));
    expect(Math.max(worst.multiplies, worst.totalBytes)).toBeLessThan(2 ** 31 - 1);
  });

  /*
   * 화면이 말하는 수와 화면이 그린 것이 같은가. 캡션과 계기가 49,152 라고 말하는데
   * 판에 선 타일이 383 개이면, 지금까지의 검사는 전부 통과한 채로 지나간다.
   */
  it('판에 선 타일 수가 곱셈을 단위로 나눈 수와 같다 — 다섯 칸 전부', async () => {
    const unit = exhaustiveSearchUnit(DATA.candidates, DATA.dims);
    const tilesMax = exhaustiveSearchTilesMax(DATA.candidates, DATA.dims);
    const grid = exhaustiveSearchPlateGrid(tilesMax);
    // 판은 마지막 손잡이 값에서 정확히 가득 찬다 — 남는 칸도 모자란 칸도 없다.
    expect(grid.cols * grid.rows).toBe(tilesMax);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(exhaustiveSearchStageView, container, {
      config: {},
      initialData: DATA as unknown as Record<string, unknown>,
      locale: 'en',
      theme: 'light',
    }) as unknown as {
      setScene(scene: ExhaustiveScene, caption: string): void;
      advance(step: ExhaustiveStep): Promise<void>;
      destroy(): void;
    };

    // 후보 점은 손잡이를 돌려도 늘지 않는다 — 그림이 그렇게 되어 있는지 센다.
    const dots = container.querySelectorAll('rect[rx="2"]').length;
    expect(dots).toBe(DATA.candidates);

    const drawn: Array<{ dim: number; tiles: number; want: number }> = [];
    for (const row of EXPECTED) {
      const cost = exhaustiveSearchCost(DATA.candidates, row.dim);
      stage.setScene(
        { candidates: DATA.candidates, dim: row.dim, unit, tilesMax, ...cost },
        'setup',
      );
      await stage.advance({
        scanned: DATA.candidates,
        active: DATA.candidates - 1,
        multiplies: cost.multiplies,
        caption: 'scan',
      });
      drawn.push({
        dim: row.dim,
        tiles: container.querySelectorAll('[data-tile]').length,
        want: cost.multiplies / unit,
      });
    }

    stage.destroy();
    container.remove();
    expect(drawn).toEqual(EXPECTED.map((r) => ({ dim: r.dim, tiles: r.multiplies / unit, want: r.multiplies / unit })));
    // 사다리의 끝은 판을 가득 채운다.
    expect(drawn[drawn.length - 1]?.tiles).toBe(tilesMax);
  }, 20_000);
});

/*
 * 코어의 전수 검사들(`facet-first-step` · `canvas-height` · `canvas-attach` ·
 * `destroy-releases-waiters`)이 보는 것을 이 facet 하나에 대해 미리 본다. 저쪽은
 * 형제 facet 을 전부 로드하므로 여기서 먼저 걸러 두는 편이 빠르다.
 */
describe('완전 탐색 무대', () => {
  const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  it('띄우고 굴리고 접어도 던지지 않고 매달리지 않는다', async () => {
    clearRegistry();
    registerExhaustiveSearch();

    // projector 를 감싸 **아직 안 끝난 onEvent** 를 센다. 매달림은 그것으로만 보인다.
    const tally = { started: 0, finished: 0 };
    const original = getProjector('exhaustiveSearchProjector');
    if (!original) throw new Error('projector 가 등록되지 않았다');
    registerProjector('exhaustiveSearchProjector', (views, runtime) => {
      const inner = original(views, runtime);
      return {
        ...inner,
        async onEvent(event) {
          tally.started += 1;
          try {
            await inner.onEvent(event);
          } finally {
            tally.finished += 1;
          }
        },
      };
    });

    const errors: string[] = [];
    const consoleError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '));
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(exhaustiveSearchFacet, container);

    await wait(120);
    const before = container.querySelector('svg')?.getAttribute('viewBox') ?? '';
    const painted = container.querySelector('svg')?.childNodes.length ?? 0;

    // 재생이 한창인 때에 접는다 — 그때라야 매달릴 자리가 실제로 열려 있다.
    await wait(700);
    const after = container.querySelector('svg')?.getAttribute('viewBox') ?? '';
    handle.destroy();
    await wait(600);

    console.error = consoleError;
    container.remove();

    expect(errors).toEqual([]);
    // 캔버스가 떨어져 나가지 않았고 그림이 그려졌다.
    expect(painted).toBeGreaterThan(0);
    // 세로는 마운트한 뒤 바뀌지 않는다.
    expect(after).toBe(before);
    // 접은 뒤에는 기다리던 것이 전부 풀린다.
    expect(tally.started - tally.finished).toBe(0);
  }, 20_000);
});
