/**
 * 조각이 하는 말이 셈과 맞는지 잰다.
 *
 * [7, 2, 9, 4] 를 한 바퀴 훑으면 견줌 3회 · 표식 이동 1회 · 값 이동 1회여야
 * 한다. 화면에 뜨는 숫자는 전부 이 셈에서 나오므로, 셈이 어긋나면 조각이
 * 거짓을 말하게 된다.
 *
 * 화면은 장면(Scene) 방식이다 — algorithm 은 payload 없이 발신하고, 그 수들은
 * 전부 장면이 구조에서 센다. 그래서 여기서 재는 것도 셋으로 갈린다.
 *   ① algorithm 이 무엇을 언제 발신하나 (payload 가 하나도 없나)
 *   ② `reduce` 가 그 발신에서 무엇을 셈해 내나 (순수한가)
 *   ③ stage 가 그 장면을 그리는가
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView, SceneTrack } from '@ffacet/core/runtime';
import type { FacetContext, FacetRuntimeEvent, ReactiveContext } from '@ffacet/core/runtime';
import { selectMinEachPass, type SelectMinEachPassData } from '../src/algorithm.js';
import { selectMinEachPassScene, type SelectMinEachPassScene } from '../src/scene.js';
import { selectMinEachPassStageView } from '../src/select-min-each-pass-stage.js';
import { selectMinEachPassFacet } from '../src/facet.js';

type FakeCtx = {
  events: FacetRuntimeEvent[];
  ctx: FacetContext<SelectMinEachPassData>;
};

function makeCtx(values: number[], inputsBeforeCancel = 0): FakeCtx {
  const events: FacetRuntimeEvent[] = [];
  let inputs = 0;
  const ctx: ReactiveContext<SelectMinEachPassData> = {
    data: { type: 'select-min-each-pass', values: [...values], stepMs: 10 },
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
function playInto(values: number[], events: FacetRuntimeEvent[]): SelectMinEachPassScene[] {
  const track = new SceneTrack(selectMinEachPassScene, { values });
  const scenes: SelectMinEachPassScene[] = [track.at(0)];
  for (const event of events) scenes.push(track.push(event));
  return scenes;
}

describe('selectMinEachPass algorithm', () => {
  it('한 바퀴에 견줌 3회 · 표식 이동 1회 · 값 이동 1회', async () => {
    const { events, ctx } = makeCtx([7, 2, 9, 4]);
    await expect(selectMinEachPass(ctx)).rejects.toThrow('cancelled');

    const kinds = typesOf(events);
    expect(kinds.filter((t) => t === 'scan-step')).toHaveLength(3);
    expect(kinds.filter((t) => t === 'mark-hop')).toHaveLength(1);
    expect(kinds.filter((t) => t === 'value-move')).toHaveLength(1);
  });

  it('payload 를 하나도 싣지 않는다 — 수는 전부 장면이 구조에서 센다', async () => {
    const { events, ctx } = makeCtx([7, 2, 9, 4]);
    await expect(selectMinEachPass(ctx)).rejects.toThrow('cancelled');

    expect(events.filter((e) => e.payload !== undefined)).toEqual([]);
  });

  it('걸음이 가리키는 자리는 target 이 말한다', async () => {
    const { events, ctx } = makeCtx([7, 2, 9, 4]);
    await expect(selectMinEachPass(ctx)).rejects.toThrow('cancelled');

    expect(events.find((e) => e.type === 'mark-init')?.target).toBe('index:0');
    expect(events.filter((e) => e.type === 'scan-step').map((e) => e.target)).toEqual([
      'index:1',
      'index:2',
      'index:3',
    ]);
    // 2 를 만날 때만 표식이 건너간다.
    expect(events.find((e) => e.type === 'mark-hop')?.target).toBe('index:1');
    expect(events.find((e) => e.type === 'value-move')?.target).toEqual(['index:0', 'index:1']);
  });

  it('훑는 동안 값을 옮기는 이벤트는 하나도 나오지 않는다', async () => {
    const { events, ctx } = makeCtx([7, 2, 9, 4]);
    await expect(selectMinEachPass(ctx)).rejects.toThrow('cancelled');

    const kinds = typesOf(events);
    expect(kinds.indexOf('value-move')).toBeGreaterThan(kinds.indexOf('scan-end'));
    expect(kinds.slice(0, kinds.indexOf('scan-end'))).not.toContain('value-move');
  });

  it('자동 재생 뒤 처음 누르는 advance 는 되감고 첫 걸음까지 보인다', async () => {
    const { events, ctx } = makeCtx([7, 2, 9, 4], 1);
    await expect(selectMinEachPass(ctx)).rejects.toThrow('cancelled');

    const kinds = typesOf(events);
    expect(kinds.slice(-3)).toEqual(['done', 'rewind', 'mark-init']);
  });
});

describe('selectMinEachPass scene', () => {
  it('걸어온 자취에서 견줌 3 · 표식 이동 1 · 값 이동 1 이 셈해진다', async () => {
    const { events, ctx } = makeCtx([7, 2, 9, 4]);
    await expect(selectMinEachPass(ctx)).rejects.toThrow('cancelled');

    const scenes = playInto([7, 2, 9, 4], events);
    const scanEnd = scenes[events.findIndex((e) => e.type === 'scan-end') + 1];
    expect(scanEnd.caption).toEqual({ kind: 'scanEnd', compares: 3, hops: 1 });

    const last = scenes[scenes.length - 1];
    expect(last.caption).toEqual({ kind: 'done', compares: 3, moves: 1 });
    expect(last.scanned).toEqual([1, 2, 3]);
    expect(last.hopAt).toEqual([1]);
  });

  it('훑는 동안 값은 하나도 움직이지 않고, 맞바꿈은 마지막 한 번뿐이다', async () => {
    const { events, ctx } = makeCtx([7, 2, 9, 4]);
    await expect(selectMinEachPass(ctx)).rejects.toThrow('cancelled');

    const scenes = playInto([7, 2, 9, 4], events);
    const moveAt = events.findIndex((e) => e.type === 'value-move');
    for (let i = 0; i <= moveAt; i += 1) {
      expect(scenes[i].values).toEqual([7, 2, 9, 4]);
    }
    expect(scenes[moveAt + 1].values).toEqual([2, 7, 9, 4]);
    expect(scenes[moveAt + 1].settled).toBe(0);
    expect(scenes[moveAt + 1].retired).toBe(true);
  });

  it('reduce 는 앞 장면을 제자리에서 고치지 않는다', () => {
    const start = selectMinEachPassScene.initial({ values: [7, 2, 9, 4] });
    const after = selectMinEachPassScene.reduce(start, { type: 'mark-init', target: 'index:0' });
    expect(start.best).toBeNull();
    expect(after.best).toBe(0);
    expect(start.values).toEqual([7, 2, 9, 4]);
  });

  it('되감으면 바탕만 남고 걸어온 자취가 걷힌다', async () => {
    const { events, ctx } = makeCtx([7, 2, 9, 4]);
    await expect(selectMinEachPass(ctx)).rejects.toThrow('cancelled');

    const scenes = playInto([7, 2, 9, 4], events);
    const end = scenes[scenes.length - 1];
    const back = selectMinEachPassScene.reduce(end, { type: 'rewind' });
    expect(back).toEqual(selectMinEachPassScene.initial({ values: [7, 2, 9, 4] }));
  });

  it('initial 은 넘겨받은 배열을 참조로 쥐지 않는다', () => {
    const data = { values: [7, 2, 9, 4] };
    const start = selectMinEachPassScene.initial(data);
    data.values[0] = 99;
    expect(start.origin).toEqual([7, 2, 9, 4]);
  });
});

describe('select-min-each-pass-stage', () => {
  it('러너가 붙여 준 캔버스를 떼어내지 않는다', () => {
    const container = document.createElement('div');
    const instance = mountView(selectMinEachPassStageView, container, {
      config: { type: 'select-min-each-pass-stage' },
      initialData: { values: [7, 2, 9, 4] },
    });
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 620 268');
    instance.destroy();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('칸은 캔버스 폭을 채우고 좌우 여백이 같다', async () => {
    const container = document.createElement('div');
    const instance = mountView(selectMinEachPassStageView, container, {
      config: { type: 'select-min-each-pass-stage' },
      initialData: { values: [7, 2, 9, 4] },
    });
    const render = instance.render as (
      next: SelectMinEachPassScene,
      prev: SelectMinEachPassScene | null,
      opts: { animate: boolean },
    ) => Promise<void>;
    await render(selectMinEachPassScene.initial({ values: [7, 2, 9, 4] }), null, {
      animate: false,
    });

    const rects = [...container.querySelectorAll('rect')];
    expect(rects).toHaveLength(4);
    const first = rects[0];
    const last = rects[3];
    const left = Number(first?.getAttribute('x'));
    const right = 620 - (Number(last?.getAttribute('x')) + Number(last?.getAttribute('width')));
    expect(left).toBe(right);
    expect(left).toBeLessThanOrEqual(40);
    instance.destroy();
  });

  it('facet 선언의 initialData 가 대조 데이터와 같다', () => {
    expect(selectMinEachPassFacet.initialData.values).toEqual([7, 2, 9, 4]);
    expect(selectMinEachPassFacet.id).toBe('facet:selectMinEachPass');
  });
});

describe('algorithm → scene → stage', () => {
  it('한 바퀴를 실제로 재생해도 무대가 걸리지 않고 값이 [2, 7, 9, 4] 로 남는다', async () => {
    const container = document.createElement('div');
    const stage = mountView(selectMinEachPassStageView, container, {
      config: { type: 'select-min-each-pass-stage' },
      initialData: { values: [7, 2, 9, 4] },
      t: makeTranslator('en', selectMinEachPassFacet.messages),
    });
    const render = stage.render as (
      next: SelectMinEachPassScene,
      prev: SelectMinEachPassScene | null,
      opts: { animate: boolean },
    ) => Promise<void>;

    const track = new SceneTrack(selectMinEachPassScene, { values: [7, 2, 9, 4] });
    let prev: SelectMinEachPassScene | null = null;

    const ctx: ReactiveContext<SelectMinEachPassData> = {
      data: { type: 'select-min-each-pass', values: [7, 2, 9, 4], stepMs: 0 },
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

    await expect(selectMinEachPass(ctx)).rejects.toThrow('cancelled');

    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '');
    // 칸 넷의 값 + 기억 표식(min, 2) + 캡션 두 줄.
    expect(texts.slice(0, 4)).toEqual(['2', '7', '9', '4']);
    expect(texts).toContain('min');
    // 남은 동그라미는 훑은 자국 셋뿐이다 — 견줌마다 하나씩 남고, 눈길은 물러났다.
    expect(container.querySelectorAll('circle')).toHaveLength(3);
    stage.destroy();
  }, 20_000);

  it('되짚기는 걸음을 되밟지 않고 그 걸음의 장면을 곧바로 세운다', async () => {
    const container = document.createElement('div');
    const stage = mountView(selectMinEachPassStageView, container, {
      config: { type: 'select-min-each-pass-stage' },
      initialData: { values: [7, 2, 9, 4] },
      t: makeTranslator('en', selectMinEachPassFacet.messages),
    });
    const render = stage.render as (
      next: SelectMinEachPassScene,
      prev: SelectMinEachPassScene | null,
      opts: { animate: boolean },
    ) => Promise<void>;

    const { events, ctx } = makeCtx([7, 2, 9, 4]);
    await expect(selectMinEachPass(ctx)).rejects.toThrow('cancelled');
    const scenes = playInto([7, 2, 9, 4], events);

    // 끝 화면을 세운 뒤 곧바로 첫 장면으로 되짚는다.
    await render(scenes[scenes.length - 1], null, { animate: false });
    await render(scenes[0], scenes[scenes.length - 1], { animate: false });

    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '');
    expect(texts.slice(0, 4)).toEqual(['7', '2', '9', '4']);
    expect(texts).not.toContain('min');
    expect(container.querySelectorAll('circle')).toHaveLength(0);
    stage.destroy();
  });
});
