/**
 * 화면에 뜨는 수는 선언의 두 행렬에서 그 자리에 셈한 것이어야 한다.
 *
 * 근거의 정본은 스크래치가 아니라 이 파일이다 — `facet.ts` 에서 데이터를 읽어
 * 여기서 다시 셈하므로, 사양의 대조표를 옮겨 적을 일이 없고 데이터를 바꾸면
 * 기대값도 함께 움직인다.
 *
 * 곁들여 조각이 걸리기 쉬운 두 자리를 잰다 — 자동 재생 뒤 첫 `advance` 가 되감고
 * **첫 걸음까지** 가는가, 재생 도중 접었을 때 알고리즘이 손을 떼는가 (S-piece).
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  clearRegistry,
  getProjector,
  registerBuiltinViews,
  registerProjector,
  runFacet,
  type FacetContext,
  type FacetRuntimeEvent,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';
import { rowTimesColumnAlgorithm, type RowTimesColumnData } from '../src/algorithm.js';
import { rowTimesColumnFacet } from '../src/facet.js';
import { registerRowTimesColumn } from '../src/index.js';

type Payload = {
  row: number;
  col: number;
  k: number;
  a: number;
  b: number;
  product: number;
  sum: number;
};

function scene(): RowTimesColumnData {
  return structuredClone(rowTimesColumnFacet.initialData) as unknown as RowTimesColumnData;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 알고리즘과 무관하게 다시 셈한 곱. */
function multiply(a: number[][], b: number[][]): number[][] {
  return a.map((row) =>
    (b[0] ?? []).map((_, col) => row.reduce((acc, x, k) => acc + x * (b[k]?.[col] ?? 0), 0)),
  );
}

/**
 * 알고리즘을 끝까지 굴린다. `presses` 는 자동 재생이 끝난 뒤 눌러 줄 `advance` 의 수.
 * 더 누를 것이 없으면 접힌 것처럼 굴어 알고리즘을 끝낸다.
 */
async function drive(presses = 0): Promise<FacetRuntimeEvent[]> {
  const data = scene();
  const events: FacetRuntimeEvent[] = [];
  let cancelled = false;
  let left = presses;
  const ctx = {
    data,
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent): Promise<void> {
      events.push(event);
    },
    metric(): void {
      throw new Error('조각은 ctx.metric 을 부르지 않는다 (S-piece)');
    },
    async sleep(): Promise<boolean> {
      return true;
    },
    async waitForInput(): Promise<{ type: string }> {
      if (left > 0) {
        left -= 1;
        return { type: 'advance' };
      }
      cancelled = true;
      throw new Error('cancelled');
    },
    pollInput(): null {
      return null;
    },
  };
  await rowTimesColumnAlgorithm(ctx as unknown as FacetContext<RowTimesColumnData>);
  return events;
}

describe('행과 열의 맞물림', () => {
  it('두 행렬이 맞물린다 — 안쪽 치수가 같고 바깥 치수는 다르다', () => {
    const { a, b } = scene();
    expect(a[0]?.length).toBe(b.length);
    expect(a.length).not.toBe(a[0]?.length);
  });

  it('걸음은 항마다 하나 — 곱의 수만큼 나온다', async () => {
    const { a, b } = scene();
    const rows = a.length;
    const cols = b[0]?.length ?? 0;
    const inner = b.length;
    const events = await drive();

    const meets = events.filter((e) => e.type === 'pair-meet' || e.type === 'cell-formed');
    expect(meets.length).toBe(rows * cols * inner);
    expect(events.filter((e) => e.type === 'cell-formed').length).toBe(rows * cols);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('걸음마다 실은 곱과 누적 합이 그 자리에서 맞다', async () => {
    const { a, b } = scene();
    const events = await drive();
    const running = new Map<string, number>();

    for (const event of events) {
      if (event.type !== 'pair-meet' && event.type !== 'cell-formed') continue;
      const p = event.payload as Payload;
      expect(p.a).toBe(a[p.row]?.[p.k]);
      expect(p.b).toBe(b[p.k]?.[p.col]);
      expect(p.product).toBe(p.a * p.b);
      const key = `${p.row},${p.col}`;
      const before = running.get(key) ?? 0;
      expect(p.sum).toBe(before + p.product);
      running.set(key, p.sum);
    }
  });

  it('굳은 칸의 값이 다시 셈한 곱과 같다', async () => {
    const { a, b } = scene();
    const want = multiply(a, b);
    const events = await drive();
    const got: number[][] = a.map(() => (b[0] ?? []).map(() => 0));

    for (const event of events) {
      if (event.type !== 'cell-formed') continue;
      const p = event.payload as Payload;
      got[p.row]![p.col] = p.sum;
    }
    expect(got).toEqual(want);
  });
});

describe('한 걸음씩 보기', () => {
  it('자동 재생이 끝난 뒤 첫 advance 는 되감고 첫 걸음까지 간다', async () => {
    const events = await drive(1);
    const tail = events.slice(events.findIndex((e) => e.type === 'done') + 1);

    // 되감기 하나로 끝나면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
    expect(tail.map((e) => e.type)).toEqual(['rewind', 'pair-meet']);
    const first = tail[1]?.payload as Payload;
    expect({ row: first.row, col: first.col, k: first.k }).toEqual({ row: 0, col: 0, k: 0 });
  });
});

describe('띄워 보기', () => {
  it('굴러도 던지지 않고, 세로가 흔들리지 않으며, 접으면 손을 뗀다', async () => {
    clearRegistry();
    registerBuiltinViews();
    registerRowTimesColumn();

    // projector 를 감싸 아직 안 끝난 onEvent 를 센다 — 매달림이 곧 그 수다.
    const tally = { started: 0, finished: 0 };
    const name = String(rowTimesColumnFacet.projector).replace(/^module:/, '');
    const original = getProjector(name);
    expect(original).toBeDefined();
    registerProjector(name, (views: ProjectorViews, runtime?: ProjectorRuntime): ProjectorInstance => {
      const made = original!(views, runtime);
      return {
        ...made,
        async onEvent(event: FacetRuntimeEvent): Promise<void> {
          tally.started += 1;
          try {
            await made.onEvent(event);
          } finally {
            tally.finished += 1;
          }
        },
      };
    });

    const errors: string[] = [];
    const speak = console.error;
    console.error = (...args: unknown[]): void => {
      errors.push(args.map((x) => String(x)).join(' '));
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(rowTimesColumnFacet, container);

    await delay(150);
    const canvas = container.querySelector('svg');
    const before = canvas?.getAttribute('viewBox') ?? '';
    const drawn = canvas?.childNodes.length ?? 0;

    // 재생이 한창인 때 접는다 — 애니메이션이 돌고 있어야 매달릴 자리가 열린다.
    await delay(1_200);
    const after = container.querySelector('svg')?.getAttribute('viewBox') ?? '';
    handle.destroy();
    await delay(800);
    console.error = speak;
    container.remove();

    expect(errors).toEqual([]);
    expect(drawn).toBeGreaterThan(0);
    expect(after).toBe(before);
    expect(tally.started - tally.finished).toBe(0);
  }, 20_000);
});
