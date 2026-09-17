/**
 * 조각이 하는 말이 셈과 맞는지 잰다.
 *
 * A=[1, 4, 7] 와 B=[2, 3, 9] 를 합치면 꺼내는 차례는 1·2·3·4·7·9 이고 견줌은
 * 5 회여야 한다. 화면에 뜨는 숫자는 전부 이 셈에서 나오므로, 셈이 어긋나면
 * 조각이 거짓을 말하게 된다.
 *
 * 화면은 장면(Scene) 방식이다 — algorithm 은 판정 하나(`side`)만 싣고, 자리도
 * 값도 견줌 횟수도 장면이 걸어온 자취에서 센다. 그래서 여기서 재는 것도 셋으로
 * 갈린다.
 *   ① algorithm 이 무엇을 언제 발신하나 (payload 가 판정 하나뿐인가)
 *   ② `reduce` 가 그 발신에서 무엇을 셈해 내나 (순수한가 · 되감으면 바탕만 남나)
 *   ③ stage 가 그 장면을 그리는가 (꺼낸 자취가 다 끝난 화면에 남나)
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView, SceneTrack } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ReactiveContext } from '@ffacet/core/runtime';
import { mergeTwoSortedAlgorithm, type MergeTwoSortedData } from '../src/algorithm.js';
import { mergeTwoSortedScene, type MergeTwoSortedScene } from '../src/scene.js';
import { mergeTwoSortedStageView } from '../src/merge-two-sorted-stage.js';
import { mergeTwoSortedFacet } from '../src/facet.js';

const LEFT = [1, 4, 7];
const RIGHT = [2, 3, 9];

type FakeCtx = {
  events: FacetRuntimeEvent[];
  ctx: ReactiveContext<MergeTwoSortedData>;
};

function makeCtx(inputsBeforeCancel = 0): FakeCtx {
  const events: FacetRuntimeEvent[] = [];
  let inputs = 0;
  const ctx: ReactiveContext<MergeTwoSortedData> = {
    data: { type: 'merge-two-sorted', left: [...LEFT], right: [...RIGHT], stepMs: 10 },
    cancelled: false,
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
      if (inputs > inputsBeforeCancel) throw new Error('cancelled');
      return { type: 'advance' } as never;
    },
    pollInput() {
      return null;
    },
  };
  return { events, ctx };
}

const typesOf = (events: FacetRuntimeEvent[]): string[] => events.map((e) => e.type);

/** 발신들을 장면으로 이어 붙인다. 러너가 하는 것과 같은 일이다. */
function playInto(events: FacetRuntimeEvent[]): MergeTwoSortedScene[] {
  const track = new SceneTrack(mergeTwoSortedScene, { left: LEFT, right: RIGHT });
  const scenes: MergeTwoSortedScene[] = [track.at(0)];
  for (const event of events) scenes.push(track.push(event));
  return scenes;
}

const renderOf = (
  instance: ReturnType<typeof mountView>,
): ((
  next: MergeTwoSortedScene,
  prev: MergeTwoSortedScene | null,
  opts: { animate: boolean },
) => Promise<void>) =>
  instance.render as (
    next: MergeTwoSortedScene,
    prev: MergeTwoSortedScene | null,
    opts: { animate: boolean },
  ) => Promise<void>;

describe('mergeTwoSorted algorithm', () => {
  it('걸음 차례가 대조와 맞는다 — 견줌 5 · 꺼냄 6', async () => {
    const { events, ctx } = makeCtx();
    await expect(mergeTwoSortedAlgorithm(ctx)).rejects.toThrow('cancelled');

    const kinds = typesOf(events);
    expect(kinds.filter((t) => t === 'compare')).toHaveLength(5);
    expect(kinds.filter((t) => t === 'take')).toHaveLength(6);
    expect(kinds.filter((t) => t === 'done')).toHaveLength(1);
  });

  it('take 는 판정 하나만 싣고 나머지 발신은 payload 가 없다', async () => {
    const { events, ctx } = makeCtx();
    await expect(mergeTwoSortedAlgorithm(ctx)).rejects.toThrow('cancelled');

    expect(events.filter((e) => e.type !== 'take' && e.payload !== undefined)).toEqual([]);
    expect(events.filter((e) => e.type === 'take').map((e) => e.payload)).toEqual([
      { side: 'left' },
      { side: 'right' },
      { side: 'right' },
      { side: 'left' },
      { side: 'left' },
      { side: 'right' },
    ]);
  });

  it('target 도 쓰지 않는다 — 자리는 자취가 말한다', async () => {
    const { events, ctx } = makeCtx();
    await expect(mergeTwoSortedAlgorithm(ctx)).rejects.toThrow('cancelled');

    expect(events.filter((e) => e.target !== undefined)).toEqual([]);
  });

  it('한쪽이 바닥나면 견주지 않고 그대로 따라 내려간다', async () => {
    const { events, ctx } = makeCtx();
    await expect(mergeTwoSortedAlgorithm(ctx)).rejects.toThrow('cancelled');

    // 마지막 9 는 A 가 다 빠진 뒤라 견줌 없이 내려간다.
    const kinds = typesOf(events);
    expect(kinds.slice(-3)).toEqual(['take', 'take', 'done']);
  });

  it('자동 재생 뒤 처음 누르는 advance 는 되감고 첫 걸음까지 보인다', async () => {
    const { events, ctx } = makeCtx(1);
    await expect(mergeTwoSortedAlgorithm(ctx)).rejects.toThrow('cancelled');

    expect(typesOf(events).slice(-3)).toEqual(['done', 'rewind', 'compare']);
  });
});

describe('mergeTwoSorted scene', () => {
  it('꺼낸 차례와 출처가 자취에 남는다', async () => {
    const { events, ctx } = makeCtx();
    await expect(mergeTwoSortedAlgorithm(ctx)).rejects.toThrow('cancelled');

    const last = playInto(events).at(-1) as MergeTwoSortedScene;
    expect(last.out.map((p) => p.value)).toEqual([1, 2, 3, 4, 7, 9]);
    expect(last.out.map((p) => p.side)).toEqual([
      'left',
      'right',
      'right',
      'left',
      'left',
      'right',
    ]);
    // 제 줄에서의 자리도 자취가 셈한다 — 걸음이 실어 온 것이 아니다.
    expect(last.out.map((p) => p.index)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('견줌 횟수는 장면이 센다', async () => {
    const { events, ctx } = makeCtx();
    await expect(mergeTwoSortedAlgorithm(ctx)).rejects.toThrow('cancelled');

    const last = playInto(events).at(-1) as MergeTwoSortedScene;
    expect(last.comparisons).toBe(5);
    expect(last.caption).toEqual({ kind: 'done', comparisons: 5 });
  });

  it('마지막 하나는 견줌 없이 내려와 캡션이 갈린다', async () => {
    const { events, ctx } = makeCtx();
    await expect(mergeTwoSortedAlgorithm(ctx)).rejects.toThrow('cancelled');

    const scenes = playInto(events);
    const takeAt = events
      .map((e, k) => (e.type === 'take' ? k : -1))
      .filter((k) => k >= 0)
      .map((k) => k + 1);
    expect(scenes[takeAt[0]].caption).toEqual({ kind: 'take', value: 1 });
    expect(scenes[takeAt[5]].caption).toEqual({ kind: 'drain' });
  });

  it('reduce 는 앞 장면을 제자리에서 고치지 않는다', () => {
    const start = mergeTwoSortedScene.initial({ left: LEFT, right: RIGHT });
    const after = mergeTwoSortedScene.reduce(start, { type: 'take', payload: { side: 'left' } });
    expect(start.out).toEqual([]);
    expect(after.out).toHaveLength(1);
    expect(start.left).toEqual(LEFT);
  });

  it('되감으면 바탕만 남고 걸어온 자취가 걷힌다', async () => {
    const { events, ctx } = makeCtx();
    await expect(mergeTwoSortedAlgorithm(ctx)).rejects.toThrow('cancelled');

    const end = playInto(events).at(-1) as MergeTwoSortedScene;
    const back = mergeTwoSortedScene.reduce(end, { type: 'rewind' });
    expect(back).toEqual(mergeTwoSortedScene.initial({ left: LEFT, right: RIGHT }));
  });

  it('initial 은 넘겨받은 배열을 참조로 쥐지 않는다', () => {
    const data = { left: [1, 4, 7], right: [2, 3, 9] };
    const start = mergeTwoSortedScene.initial(data);
    data.left[0] = 99;
    expect(start.left).toEqual([1, 4, 7]);
  });
});

describe('merge-two-sorted-stage', () => {
  it('러너가 붙여 준 캔버스에 그린다', () => {
    const container = document.createElement('div');
    const instance = mountView(mergeTwoSortedStageView, container, {
      config: { type: 'merge-two-sorted-stage' },
      initialData: mergeTwoSortedFacet.initialData,
    });
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 620 276');
    instance.destroy();
    expect(container.querySelector('g')).toBeNull();
  });

  it('칸은 캔버스 폭을 채우고 좌우 여백이 같다', async () => {
    const container = document.createElement('div');
    const instance = mountView(mergeTwoSortedStageView, container, {
      config: { type: 'merge-two-sorted-stage' },
      initialData: mergeTwoSortedFacet.initialData,
      t: makeTranslator('en', mergeTwoSortedFacet.messages),
    });
    await renderOf(instance)(mergeTwoSortedScene.initial({ left: LEFT, right: RIGHT }), null, {
      animate: false,
    });

    // 결과줄의 빈 자리 여섯이 폭을 나눠 쓴다.
    const outline = [...container.querySelectorAll('rect')].filter(
      (r) => r.getAttribute('stroke-dasharray') !== null && r.getAttribute('y') === '196',
    );
    expect(outline).toHaveLength(6);
    const left = Number(outline[0].getAttribute('x')) - 4;
    const last = outline[5];
    const right = 620 - (Number(last.getAttribute('x')) + Number(last.getAttribute('width')) + 4);
    expect(left).toBe(right);
    expect(left).toBeLessThanOrEqual(46);
    instance.destroy();
  });

  it('첫 화면은 전제를 말하고 결과줄은 비어 있다', async () => {
    const container = document.createElement('div');
    const instance = mountView(mergeTwoSortedStageView, container, {
      config: { type: 'merge-two-sorted-stage' },
      initialData: mergeTwoSortedFacet.initialData,
      t: makeTranslator('en', mergeTwoSortedFacet.messages),
    });
    await renderOf(instance)(mergeTwoSortedScene.initial({ left: LEFT, right: RIGHT }), null, {
      animate: false,
    });

    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '');
    expect(texts).toContain('Both rows are already in order.');
    expect(texts.filter((t) => t === '1' || t === '9')).toHaveLength(2);
    instance.destroy();
  });

  it('facet 선언의 initialData 가 대조 데이터와 같다', () => {
    const data = mergeTwoSortedFacet.initialData as MergeTwoSortedData;
    expect(data.left).toEqual(LEFT);
    expect(data.right).toEqual(RIGHT);
    expect(mergeTwoSortedFacet.id).toBe('facet:mergeTwoSorted');
  });
});

describe('algorithm → scene → stage', () => {
  it('한 판을 실제로 재생해도 무대가 걸리지 않고 결과줄이 1·2·3·4·7·9 로 남는다', async () => {
    const container = document.createElement('div');
    const stage = mountView(mergeTwoSortedStageView, container, {
      config: { type: 'merge-two-sorted-stage' },
      initialData: mergeTwoSortedFacet.initialData,
      t: makeTranslator('en', mergeTwoSortedFacet.messages),
    });
    const render = renderOf(stage);

    const track = new SceneTrack(mergeTwoSortedScene, { left: LEFT, right: RIGHT });
    let prev: MergeTwoSortedScene | null = null;

    const ctx: ReactiveContext<MergeTwoSortedData> = {
      data: { type: 'merge-two-sorted', left: [...LEFT], right: [...RIGHT], stepMs: 0 },
      cancelled: false,
      async emit(event: FacetRuntimeEvent): Promise<void> {
        const next = track.push(event);
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
        throw new Error('cancelled');
      },
      pollInput() {
        return null;
      },
    };

    await expect(mergeTwoSortedAlgorithm(ctx)).rejects.toThrow('cancelled');

    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '');
    // 줄 이름표 셋 뒤로 결과줄 여섯이 값 + 출처 표식 짝으로 선다.
    expect(texts.slice(0, 3)).toEqual(['A', 'B', 'A+B']);
    expect(texts.slice(3, 15)).toEqual([
      '1',
      'A',
      '2',
      'B',
      '3',
      'B',
      '4',
      'A',
      '7',
      'A',
      '9',
      'B',
    ]);
    expect(texts).toContain('One pass, 5 comparisons, and nothing was re-sorted');
    stage.destroy();
  }, 30_000);

  it('꺼낸 자취는 다 끝난 화면에 남는다 — 되짚어 다시 세워도 그대로다', async () => {
    const container = document.createElement('div');
    const stage = mountView(mergeTwoSortedStageView, container, {
      config: { type: 'merge-two-sorted-stage' },
      initialData: mergeTwoSortedFacet.initialData,
      t: makeTranslator('en', mergeTwoSortedFacet.messages),
    });
    const render = renderOf(stage);

    const { events, ctx } = makeCtx();
    await expect(mergeTwoSortedAlgorithm(ctx)).rejects.toThrow('cancelled');
    const scenes = playInto(events);
    const end = scenes[scenes.length - 1];

    await render(end, null, { animate: false });
    const after = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '');
    expect(after.slice(3, 15)).toEqual(['1', 'A', '2', 'B', '3', 'B', '4', 'A', '7', 'A', '9', 'B']);

    // 되짚으면 첫 화면이 곧바로 선다 — 걸음을 되밟지 않는다.
    await render(scenes[0], end, { animate: false });
    const back = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '');
    expect(back).toContain('Both rows are already in order.');
    expect(back).not.toContain('One pass, 5 comparisons, and nothing was re-sorted');
    stage.destroy();
  });
});
