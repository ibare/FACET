/**
 * 조각이 하는 말이 셈과 맞는지 잰다.
 *
 * 화면은 장면(Scene) 방식이다 — algorithm 은 payload 없이 발신하고, 화면이 아는
 * 수는 전부 장면이 제 줄에서 셈한다. 그래서 projector 를 지나던 검사가 셋으로
 * 갈렸다. 재던 **사실**은 그대로 지키고 없어진 층을 지나는 경로만 바꾼다.
 *   ① algorithm — 무엇을 언제 발신하나, payload 가 하나도 없나
 *   ② scene — `reduce` 가 그 발신에서 무엇을 셈해 내나, 순수한가, 되감기가 서나
 *   ③ stage — 그 장면을 실제로 그리는가
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getColors, makeTranslator, mountView, SceneTrack } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ReactiveContext } from '@ffacet/core/runtime';
import {
  computeHeapSortExtractResult,
  extractTop,
  heapSortExtractAlgorithm,
  type HeapSortExtractData,
} from '../src/algorithm.js';
import { heapSortExtractFacet } from '../src/facet.js';
import { heapSortExtractScene, type HeapSortExtractScene } from '../src/scene.js';
import { heapSortExtractStageView } from '../src/heap-sort-extract-stage.js';

const data = heapSortExtractFacet.initialData as HeapSortExtractData;
const VALUES = [9, 7, 8, 3, 4];

type FakeCtx = { events: FacetRuntimeEvent[]; ctx: ReactiveContext<HeapSortExtractData> };

/** 자동 재생 한 판을 돌리고 발신을 모은다. `advance` 를 받을 횟수를 정할 수 있다. */
function makeCtx(inputsBeforeCancel = 0): FakeCtx {
  const events: FacetRuntimeEvent[] = [];
  let inputs = 0;
  let cancelled = false;
  const ctx: ReactiveContext<HeapSortExtractData> = {
    data: { type: 'heap-sort-extract', values: [...VALUES], stepMs: 10 },
    get cancelled() {
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
    async waitForInput() {
      inputs += 1;
      if (inputs > inputsBeforeCancel) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'advance' } as never;
    },
    pollInput() {
      return null;
    },
  } as unknown as ReactiveContext<HeapSortExtractData>;
  return { events, ctx };
}

const typesOf = (events: FacetRuntimeEvent[]): string[] => events.map((e) => e.type);

const TAIL_INK = getColors('light').sortedTailBorder;

/**
 * 꼬리 자의 도막 — 높이 3 짜리 낮은 막대 가운데 꼬리 색으로 칠한 것.
 *
 * 힙 쪽 자는 같은 높이지만 다른 색이고, 경계 막대는 같은 색이지만 줄만큼 길다.
 */
function tailSegments(container: Element): Element[] {
  return [...container.querySelectorAll('svg > g rect')].filter(
    (r) => r.getAttribute('height') === '3' && r.getAttribute('fill') === TAIL_INK,
  );
}

/** 발신들을 장면으로 이어 붙인다. 러너가 하는 것과 같은 일이다 (silent 규약 포함). */
function playInto(events: FacetRuntimeEvent[]): HeapSortExtractScene[] {
  const track = new SceneTrack(heapSortExtractScene, { values: VALUES });
  const scenes: HeapSortExtractScene[] = [track.at(0)];
  for (const event of events) scenes.push(track.push(event));
  return scenes;
}

describe('heapSortExtract algorithm', () => {
  it('꺼낸 순서 · 새 꼭대기 · 끝난 줄을 데이터에서 셈한다', () => {
    const r = computeHeapSortExtractResult(data);
    expect(r.taken).toEqual([9, 8, 7, 4]);
    expect(r.tops).toEqual([8, 7, 4, 3]);
    expect(r.values).toEqual([3, 4, 7, 8, 9]);
    // 오른쪽 넷은 꺼낸 순서의 역이다.
    expect(r.values.slice(1)).toEqual([...r.taken].reverse());
  });

  it('꺼내기 한 번은 순수 함수다 — 넘긴 줄을 고치지 않는다', () => {
    const row = [...VALUES];
    const step = extractTop(row, row.length);
    expect(row).toEqual(VALUES);
    // 꺼낸 값은 힙이 내놓은 마지막 칸에 앉는다.
    expect(step.values[row.length - 1]).toBe(9);
    // order[i] 는 지금 i 번 칸의 값이 직전에 있던 칸 번호다.
    expect(step.order).toEqual([2, 1, 4, 3]);
    expect(step.order.map((src) => VALUES[src])).toEqual([...step.values].slice(0, 4));
  });

  it('걸음 다섯 어휘를 데이터가 정한 횟수만큼 낸다', async () => {
    const { events, ctx } = makeCtx();
    await heapSortExtractAlgorithm(ctx);

    const kinds = typesOf(events);
    expect(kinds.slice(0, 2)).toEqual(['rewind', 'heap-shown']);
    expect(kinds.filter((t) => t === 'top-lifted')).toHaveLength(4);
    expect(kinds.filter((t) => t === 'boundary-moved')).toHaveLength(4);
    expect(kinds.filter((t) => t === 'done')).toHaveLength(1);
    // 차례는 발신이 오는 순서가 이미 말한다 — 꺼냄과 경계 물러남이 번갈아 온다.
    expect(kinds.slice(2, 6)).toEqual([
      'top-lifted',
      'boundary-moved',
      'top-lifted',
      'boundary-moved',
    ]);
  });

  it('payload 를 하나도 싣지 않는다 — 수는 전부 장면이 셈한다', async () => {
    const { events, ctx } = makeCtx();
    await heapSortExtractAlgorithm(ctx);

    expect(events.filter((e) => e.payload !== undefined)).toEqual([]);
    expect(events.filter((e) => e.target !== undefined)).toEqual([]);
  });

  it('힙을 보이는 말은 되돌리기와 한 걸음이라 조용히 온다', async () => {
    const { events, ctx } = makeCtx();
    await heapSortExtractAlgorithm(ctx);

    expect(events.filter((e) => e.silent === true).map((e) => e.type)).toEqual(['heap-shown']);
  });

  it('자동 재생 뒤 처음 누르는 advance 는 되감고 첫 걸음까지 보인다', async () => {
    const { events, ctx } = makeCtx(1);
    await heapSortExtractAlgorithm(ctx);

    expect(typesOf(events).slice(-3)).toEqual(['done', 'rewind', 'heap-shown']);
  });
});

describe('heapSortExtract scene', () => {
  it('걸어온 자취에서 힙이 한 칸씩 줄고 꼬리가 한 칸씩 자란다', async () => {
    const { events, ctx } = makeCtx();
    await heapSortExtractAlgorithm(ctx);
    const scenes = playInto(events);

    const sizes = scenes.map((s) => s.heapSize);
    // 5 에서 시작해 `boundary-moved` 마다 하나씩 줄고 `done` 에서 0 이 된다.
    expect([...new Set(sizes)]).toEqual([5, 4, 3, 2, 1, 0]);
    expect(scenes[scenes.length - 1].heapSize).toBe(0);
  });

  it('줄은 같은 다섯 칸으로 끝나고 값이 오름차순으로 앉는다', async () => {
    const { events, ctx } = makeCtx();
    await heapSortExtractAlgorithm(ctx);
    const scenes = playInto(events);

    const last = scenes[scenes.length - 1];
    expect(last.slots).toEqual([3, 4, 7, 8, 9]);
    // 자리를 하나도 빌리지 않았다 — 이 조각의 주장이다.
    expect(last.slots).toHaveLength(VALUES.length);
    expect(last.caption).toEqual({ kind: 'done' });
  });

  it('꺼낸 값은 사라지지 않고 힙이 내놓은 칸에 그대로 앉는다', async () => {
    const { events, ctx } = makeCtx();
    await heapSortExtractAlgorithm(ctx);
    const scenes = playInto(events);

    for (let i = 0; i < events.length; i += 1) {
      if (events[i].type !== 'boundary-moved') continue;
      const before = scenes[i];
      const after = scenes[i + 1];
      expect(before.lifted).not.toBeNull();
      expect(after.lifted).toBeNull();
      expect(after.heapSize).toBe(before.heapSize - 1);
      expect(after.slots[after.heapSize]).toBe(before.lifted);
    }
  });

  it('떠오른 값은 그때 힙의 꼭대기다 — 걸음이 실어 오지 않는다', async () => {
    const { events, ctx } = makeCtx();
    await heapSortExtractAlgorithm(ctx);
    const scenes = playInto(events);

    const lifted: number[] = [];
    for (let i = 0; i < events.length; i += 1) {
      if (events[i].type !== 'top-lifted') continue;
      expect(scenes[i + 1].lifted).toBe(scenes[i].slots[0]);
      lifted.push(scenes[i + 1].lifted as number);
    }
    expect(lifted).toEqual(computeHeapSortExtractResult(data).taken);
  });

  it('reduce 는 앞 장면을 제자리에서 고치지 않는다', () => {
    const start = heapSortExtractScene.initial({ values: VALUES });
    const lift = heapSortExtractScene.reduce(start, { type: 'top-lifted' });
    const moved = heapSortExtractScene.reduce(lift, { type: 'boundary-moved' });

    expect(start.lifted).toBeNull();
    expect(start.slots).toEqual(VALUES);
    expect(lift.lifted).toBe(9);
    expect(lift.slots).toEqual(VALUES);
    expect(lift.heapSize).toBe(5);
    expect(moved.slots).toEqual([8, 7, 4, 3, 9]);
    expect(moved.heapSize).toBe(4);
  });

  it('되감으면 바탕만 남고 걸어온 자취가 걷힌다', async () => {
    const { events, ctx } = makeCtx();
    await heapSortExtractAlgorithm(ctx);
    const scenes = playInto(events);

    const back = heapSortExtractScene.reduce(scenes[scenes.length - 1], { type: 'rewind' });
    expect(back).toEqual(heapSortExtractScene.initial({ values: VALUES }));
  });

  it('initial 은 넘겨받은 배열을 참조로 쥐지 않는다', () => {
    const source = { values: [...VALUES] };
    const start = heapSortExtractScene.initial(source);
    source.values[0] = 99;
    expect(start.origin).toEqual(VALUES);
    expect(start.slots).toEqual(VALUES);
  });
});

describe('heap-sort-extract-stage', () => {
  it('러너가 붙여 준 캔버스를 떼어내지 않는다', () => {
    const container = document.createElement('div');
    const instance = mountView(heapSortExtractStageView, container, {
      config: heapSortExtractFacet.blocks.stage as Record<string, unknown>,
      initialData: data as unknown as Record<string, unknown>,
    });
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 620 240');
    instance.destroy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('끝 장면을 곧바로 세우면 줄이 오름차순이고 꼬리가 다섯 도막으로 남는다', async () => {
    const container = document.createElement('div');
    const t = makeTranslator('ko', heapSortExtractFacet.messages);
    const stage = mountView(heapSortExtractStageView, container, {
      config: heapSortExtractFacet.blocks.stage as Record<string, unknown>,
      initialData: data as unknown as Record<string, unknown>,
      t,
    });
    const render = stage.render as (
      next: HeapSortExtractScene,
      prev: HeapSortExtractScene | null,
      opts: { animate: boolean },
    ) => Promise<void>;

    const { events, ctx } = makeCtx();
    await heapSortExtractAlgorithm(ctx);
    const scenes = playInto(events);

    await render(scenes[scenes.length - 1], null, { animate: false });

    const svg = container.querySelector('svg');
    const texts = [...svg!.querySelectorAll('text')].map((el) => el.textContent);
    expect(texts.slice(0, 5)).toEqual(['3', '4', '7', '8', '9']);
    expect(texts).toContain('같은 줄 안에서 정렬이 끝났다 — 자리를 하나도 빌리지 않았다.');
    // 꼬리 자의 도막 다섯 — "한 칸씩 물려받았다" 는 누적이 마지막 화면에 남는다.
    expect(tailSegments(container)).toHaveLength(5);

    stage.destroy();
    expect(svg!.querySelector('g')?.firstElementChild ?? null).toBeNull();
  });

  it('되짚기는 걸음을 되밟지 않고 그 걸음의 장면을 곧바로 세운다', async () => {
    const container = document.createElement('div');
    const t = makeTranslator('ko', heapSortExtractFacet.messages);
    const stage = mountView(heapSortExtractStageView, container, {
      config: heapSortExtractFacet.blocks.stage as Record<string, unknown>,
      initialData: data as unknown as Record<string, unknown>,
      t,
    });
    const render = stage.render as (
      next: HeapSortExtractScene,
      prev: HeapSortExtractScene | null,
      opts: { animate: boolean },
    ) => Promise<void>;

    const { events, ctx } = makeCtx();
    await heapSortExtractAlgorithm(ctx);
    const scenes = playInto(events);
    const end = scenes[scenes.length - 1];

    await render(end, null, { animate: false });
    await render(scenes[1], end, { animate: false });

    const svg = container.querySelector('svg');
    const texts = [...svg!.querySelectorAll('text')].map((el) => el.textContent);
    // 처음 줄이 그대로 서고, 꼬리 도막은 하나도 없다.
    expect(texts.slice(0, 5)).toEqual(['9', '7', '8', '3', '4']);
    expect(tailSegments(container)).toHaveLength(0);
    stage.destroy();
  });

  it('칸은 캔버스 폭을 채우고 좌우 여백이 같다', async () => {
    const container = document.createElement('div');
    const stage = mountView(heapSortExtractStageView, container, {
      config: heapSortExtractFacet.blocks.stage as Record<string, unknown>,
      initialData: data as unknown as Record<string, unknown>,
    });
    const render = stage.render as (
      next: HeapSortExtractScene,
      prev: HeapSortExtractScene | null,
      opts: { animate: boolean },
    ) => Promise<void>;
    await render(heapSortExtractScene.initial({ values: VALUES }), null, { animate: false });

    // `svg > g` 아래만 본다 — 오려 낼 모양은 `defs` 안에 있다.
    const cells = [...container.querySelectorAll('svg > g rect')].filter(
      (r) => r.getAttribute('height') === '58' && r.getAttribute('fill') !== 'none',
    );
    expect(cells).toHaveLength(5);
    const left = Number(cells[0].getAttribute('x'));
    const right = 620 - (Number(cells[4].getAttribute('x')) + Number(cells[4].getAttribute('width')));
    expect(left).toBe(right);
    expect(left).toBeLessThanOrEqual(50);
    stage.destroy();
  });

  it('facet 선언의 initialData 가 대조 데이터와 같다', () => {
    expect(heapSortExtractFacet.initialData.values).toEqual(VALUES);
    expect(heapSortExtractFacet.id).toBe('facet:heapSortExtract');
  });
});

describe('algorithm → scene → stage', () => {
  it('한 판을 실제로 재생해도 무대가 걸리지 않고 줄이 오름차순으로 끝난다', async () => {
    const container = document.createElement('div');
    const t = makeTranslator('ko', heapSortExtractFacet.messages);
    const stage = mountView(heapSortExtractStageView, container, {
      config: heapSortExtractFacet.blocks.stage as Record<string, unknown>,
      initialData: data as unknown as Record<string, unknown>,
      t,
    });
    const render = stage.render as (
      next: HeapSortExtractScene,
      prev: HeapSortExtractScene | null,
      opts: { animate: boolean },
    ) => Promise<void>;

    // 러너가 하는 것과 같은 길 — 발신마다 장면을 쌓고 그 장면을 흐르게 그린다.
    const track = new SceneTrack(heapSortExtractScene, { values: VALUES });
    let prev: HeapSortExtractScene | null = null;
    let cancelled = false;
    const ctx = {
      data: { type: 'heap-sort-extract', values: [...VALUES], stepMs: 0 },
      get cancelled() {
        return cancelled;
      },
      async emit(event: FacetRuntimeEvent): Promise<void> {
        const next = track.push(event) as HeapSortExtractScene;
        await render(next, prev, { animate: true });
        prev = next;
      },
      metric(): void {
        throw new Error('조각은 metric 을 부르지 않는다 (S-piece)');
      },
      async sleep(): Promise<boolean> {
        return true;
      },
      async waitForInput() {
        cancelled = true;
        throw new Error('cancelled');
      },
      pollInput() {
        return null;
      },
    } as unknown as ReactiveContext<HeapSortExtractData>;

    await heapSortExtractAlgorithm(ctx);

    const svg = container.querySelector('svg');
    const texts = [...svg!.querySelectorAll('text')].map((el) => el.textContent);
    expect(texts.slice(0, 5)).toEqual(['3', '4', '7', '8', '9']);
    expect(texts).toContain('같은 줄 안에서 정렬이 끝났다 — 자리를 하나도 빌리지 않았다.');
    // 흐른 뒤 장면을 통째로 다시 세우므로 공중에 남은 딱지가 없다.
    expect(svg!.querySelectorAll('g > g')).toHaveLength(0);
    stage.destroy();
  }, 30_000);
});


