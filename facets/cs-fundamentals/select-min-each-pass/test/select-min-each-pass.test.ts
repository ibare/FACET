/**
 * 조각이 하는 말이 셈과 맞는지 잰다.
 *
 * [7, 2, 9, 4] 를 한 바퀴 훑으면 견줌 3회 · 표식 이동 1회 · 값 이동 1회여야
 * 한다. 화면에 뜨는 숫자는 전부 이 셈에서 나오므로, 셈이 어긋나면 조각이
 * 거짓을 말하게 된다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView } from '@ffacet/core/runtime';
import type { FacetContext, FacetRuntimeEvent, ReactiveContext } from '@ffacet/core/runtime';
import { selectMinEachPass, type SelectMinEachPassData } from '../src/algorithm.js';
import { selectMinEachPassStageView } from '../src/select-min-each-pass-stage.js';
import { selectMinEachPassProjector } from '../src/projector.js';
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

describe('selectMinEachPass', () => {
  it('한 바퀴에 견줌 3회 · 표식 이동 1회 · 값 이동 1회', async () => {
    const { events, ctx } = makeCtx([7, 2, 9, 4]);
    await expect(selectMinEachPass(ctx)).rejects.toThrow('cancelled');

    const kinds = typesOf(events);
    expect(kinds.filter((t) => t === 'scan-step')).toHaveLength(3);
    expect(kinds.filter((t) => t === 'mark-hop')).toHaveLength(1);
    expect(kinds.filter((t) => t === 'value-move')).toHaveLength(1);

    const scanEnd = events.find((e) => e.type === 'scan-end')?.payload as {
      compares: number;
      hops: number;
    };
    expect(scanEnd).toEqual({ compares: 3, hops: 1 });

    const done = events.find((e) => e.type === 'done')?.payload as {
      compares: number;
      moves: number;
    };
    expect(done).toEqual({ compares: 3, moves: 1 });
  });

  it('표식은 2 를 만날 때만 건너가고, 값은 7 과 2 가 자리를 맞바꾼다', async () => {
    const { events, ctx } = makeCtx([7, 2, 9, 4]);
    await expect(selectMinEachPass(ctx)).rejects.toThrow('cancelled');

    const hop = events.find((e) => e.type === 'mark-hop')?.payload as {
      from: number;
      to: number;
      value: number;
    };
    expect(hop).toEqual({ from: 0, to: 1, value: 2, hops: 1 });

    const move = events.find((e) => e.type === 'value-move')?.payload as {
      from: number;
      to: number;
      values: number[];
    };
    expect(move.from).toBe(1);
    expect(move.to).toBe(0);
    expect(move.values).toEqual([2, 7, 9, 4]);
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

  it('칸은 캔버스 폭을 채우고 좌우 여백이 같다', () => {
    const container = document.createElement('div');
    const instance = mountView(selectMinEachPassStageView, container, {
      config: { type: 'select-min-each-pass-stage' },
      initialData: { values: [7, 2, 9, 4] },
    });
    const init = instance.init as (values: number[]) => void;
    init([7, 2, 9, 4]);

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

describe('algorithm → projector → stage', () => {
  it('한 바퀴를 실제로 재생해도 무대가 걸리지 않고 값이 [2, 7, 9, 4] 로 남는다', async () => {
    const container = document.createElement('div');
    const stage = mountView(selectMinEachPassStageView, container, {
      config: { type: 'select-min-each-pass-stage' },
      initialData: { values: [7, 2, 9, 4] },
      t: makeTranslator('en', selectMinEachPassFacet.messages),
    });
    const projector = selectMinEachPassProjector(
      { stage },
      { getSpeed: () => 1, t: makeTranslator('en', selectMinEachPassFacet.messages) },
    );
    projector.onInit?.({ values: [7, 2, 9, 4] });

    const ctx: ReactiveContext<SelectMinEachPassData> = {
      data: { type: 'select-min-each-pass', values: [7, 2, 9, 4], stepMs: 0 },
      cancelled: false,
      async emit(event: FacetRuntimeEvent): Promise<void> {
        await projector.onEvent(event);
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
  }, 15_000);
});

describe('rewind', () => {
  it('되감으면 표식이 걷히고 값이 처음 자리로 돌아온다', async () => {
    const container = document.createElement('div');
    const stage = mountView(selectMinEachPassStageView, container, {
      config: { type: 'select-min-each-pass-stage' },
      initialData: { values: [7, 2, 9, 4] },
    });
    const projector = selectMinEachPassProjector(
      { stage },
      { getSpeed: () => 1, t: makeTranslator('en', selectMinEachPassFacet.messages) },
    );
    projector.onInit?.({ values: [7, 2, 9, 4] });

    await projector.onEvent({ type: 'mark-init', payload: { index: 0, value: 7 } });
    expect([...container.querySelectorAll('text')].map((t) => t.textContent)).toContain('min');

    await projector.onEvent({ type: 'rewind' });
    const texts = [...container.querySelectorAll('text')].map((t) => t.textContent ?? '');
    expect(texts.slice(0, 4)).toEqual(['7', '2', '9', '4']);
    expect(texts).not.toContain('min');
    stage.destroy();
  });
});
