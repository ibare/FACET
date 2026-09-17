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
  getScenePlan,
  getView,
  registerBuiltinViews,
  registerView,
  runFacet,
  type CanvasView,
  type FacetContext,
  type FacetRuntimeEvent,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import { rowTimesColumnAlgorithm, type RowTimesColumnData } from '../src/algorithm.js';
import { rowTimesColumnFacet } from '../src/facet.js';
import { registerRowTimesColumn } from '../src/index.js';
import type { RowTimesColumnScene } from '../src/scene.js';

/**
 * 걸음이 싣는 것은 셋뿐이다 — 어느 칸을 짓고 있나와 그 짝의 곱.
 *
 * 몇 번째 짝인가(`k`)와 그때까지의 합(`sum`)과 맞물린 두 수(`a`·`b`)는 장면이 세거나
 * 바탕에서 읽는다. 여기서도 같은 길로 다시 셈해 견준다 (`src/scene.ts` 의 잣대표).
 */
type Payload = {
  row: number;
  col: number;
  product: number;
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

  it('걸음마다 실은 곱이 그 칸의 다음 항과 맞다', async () => {
    const { a, b } = scene();
    const events = await drive();
    // 몇 번째 짝인가는 그 칸에 이미 쌓인 항의 수다 — 장면이 세는 것과 같은 길이다.
    const filled = new Map<string, number>();

    for (const event of events) {
      if (event.type !== 'pair-meet' && event.type !== 'cell-formed') continue;
      const p = event.payload as Payload;
      const key = `${p.row},${p.col}`;
      const k = filled.get(key) ?? 0;
      expect(p.product).toBe((a[p.row]?.[k] ?? 0) * (b[k]?.[p.col] ?? 0));
      // 마지막 짝에서만 칸이 굳는다고 말한다.
      expect(event.type === 'cell-formed').toBe(k === b.length - 1);
      filled.set(key, k + 1);
    }
  });

  it('쌓인 항의 합이 다시 셈한 곱과 같다', async () => {
    const { a, b } = scene();
    const want = multiply(a, b);
    const events = await drive();
    // 합은 아무도 실어 오지 않는다. 화면이 그러듯 여기서도 쌓인 항에서 센다.
    const got: number[][] = a.map(() => (b[0] ?? []).map(() => 0));

    for (const event of events) {
      if (event.type !== 'pair-meet' && event.type !== 'cell-formed') continue;
      const p = event.payload as Payload;
      got[p.row]![p.col] += p.product;
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
    expect({ row: first.row, col: first.col }).toEqual({ row: 0, col: 0 });
  });
});

describe('띄워 보기', () => {
  it('굴러도 던지지 않고, 세로가 흔들리지 않으며, 접으면 손을 뗀다', async () => {
    clearRegistry();
    registerBuiltinViews();
    registerRowTimesColumn();

    // 화면은 이제 장면 설계와 그것을 그리는 stage 로 만들어진다 (S-scene).
    const sceneName = String(rowTimesColumnFacet.scene).replace(/^module:/, '');
    expect(getScenePlan(sceneName)).toBeDefined();

    /*
     * stage 의 `render` 를 감싸 아직 안 풀린 것을 센다 — 매달림이 곧 그 수다.
     *
     * projector 시절에는 `onEvent` 를 감쌌다. 장면 방식에서 바깥이 걸음의 끝을 아는
     * 통로는 `render` 가 돌려주는 Promise 하나뿐이므로 (S-scene) 재는 자리가 거기로
     * 옮겨 왔다. 재는 것은 같다 — `destroy` 가 기다리던 것을 푸는가 (S-piece MUST).
     */
    const tally = { started: 0, finished: 0 };
    const stageName = String(rowTimesColumnFacet.blocks.stage?.type ?? '');
    const original = getView(stageName) as CanvasView | undefined;
    expect(original).toBeDefined();
    const made = original!;
    registerView(stageName, {
      ...made,
      mount(container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
        const inner = made.mount(container, params) as ViewInstance &
          SceneRenderer<RowTimesColumnScene>;
        return {
          ...inner,
          async render(
            next: RowTimesColumnScene,
            prev: RowTimesColumnScene | null,
            opts: { animate: boolean },
          ): Promise<void> {
            tally.started += 1;
            try {
              await inner.render(next, prev, opts);
            } finally {
              tally.finished += 1;
            }
          },
        };
      },
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

    // 운동이 도는 한복판을 기다려 잡는다. **끊기 전에 안 풀려 있는 것을 먼저 확인해야**
    // 검사가 헛돌지 않는다 — 아무것도 안 기다리는 조각도 0 으로 통과하기 때문이다.
    const deadline = Date.now() + 8_000;
    while (tally.started === tally.finished && Date.now() < deadline) await delay(10);
    const hangingBefore = tally.started - tally.finished;
    const after = container.querySelector('svg')?.getAttribute('viewBox') ?? '';

    handle.destroy();
    // 타이머나 프레임을 기다리지 않는다 — 다음 눈금이 대신 깨우면 `destroy` 가
    // 아무것도 안 풀어도 통과한다. 마이크로태스크만 돌려 조인다.
    for (let i = 0; i < 50; i += 1) await Promise.resolve();
    const hangingAfter = tally.started - tally.finished;

    console.error = speak;
    container.remove();

    expect(errors).toEqual([]);
    expect(drawn).toBeGreaterThan(0);
    expect(after).toBe(before);
    expect(hangingBefore).toBeGreaterThan(0);
    expect(hangingAfter).toBe(0);
  }, 20_000);
});
