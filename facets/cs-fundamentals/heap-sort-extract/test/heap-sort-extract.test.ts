// @vitest-environment happy-dom
/**
 * 조각이 스스로 셈한 값이 사양의 대조와 맞는지, 그리고 한 판을 끝까지 돌린 화면이
 * 실제로 오름차순 한 줄로 끝나는지 잰다.
 */
import { describe, expect, it, vi } from 'vitest';
import { makeTranslator, mountView } from '@ffacet/core/runtime';
import {
  computeHeapSortExtractResult,
  heapSortExtractAlgorithm,
  type HeapSortExtractData,
} from '../src/algorithm.js';
import { heapSortExtractFacet } from '../src/facet.js';
import { heapSortExtractProjector } from '../src/projector.js';
import { heapSortExtractStageView } from '../src/heap-sort-extract-stage.js';

const data = heapSortExtractFacet.initialData as HeapSortExtractData;

describe('heapSortExtract', () => {
  it('꺼낸 순서 · 새 꼭대기 · 끝난 줄을 데이터에서 셈한다', () => {
    const r = computeHeapSortExtractResult(data);
    expect(r.taken).toEqual([9, 8, 7, 4]);
    expect(r.tops).toEqual([8, 7, 4, 3]);
    expect(r.values).toEqual([3, 4, 7, 8, 9]);
    // 오른쪽 넷은 꺼낸 순서의 역이다.
    expect(r.values.slice(1)).toEqual([...r.taken].reverse());
  });

  it('한 판을 돌리면 줄이 오름차순으로 끝나고 캔버스는 컨테이너에 남는다', async () => {
    // 프레임을 한 번에 건너뛰어 애니메이션을 즉시 끝낸다.
    let clock = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
      clock += 10_000;
      cb(clock);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    const container = document.createElement('div');
    document.body.appendChild(container);
    const t = makeTranslator('ko', heapSortExtractFacet.messages);
    const stage = mountView(heapSortExtractStageView, container, {
      config: heapSortExtractFacet.blocks.stage as Record<string, unknown>,
      initialData: data as unknown as Record<string, unknown>,
      t,
    });
    expect(container.querySelector('svg')).toBeTruthy();

    const projector = heapSortExtractProjector({ stage }, { getSpeed: () => 1, t });
    projector.onInit?.(data);

    let cancelled = false;
    const ctx = {
      data,
      get cancelled() {
        return cancelled;
      },
      async emit(event: unknown) {
        await projector.onEvent(event as never);
      },
      metric() {
        throw new Error('조각은 metric 을 부르지 않는다');
      },
      async sleep() {
        return true;
      },
      async waitForInput() {
        // 자동 재생이 끝나면 여기서 멈춘다.
        cancelled = true;
        throw new Error('cancelled');
      },
      pollInput() {
        return null;
      },
    };
    await heapSortExtractAlgorithm(ctx as never);

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    const texts = [...svg!.querySelectorAll('text')].map((el) => el.textContent);
    expect(texts.slice(0, 5)).toEqual(['3', '4', '7', '8', '9']);
    expect(texts).toContain('같은 줄 안에서 정렬이 끝났다 — 자리를 하나도 빌리지 않았다.');

    stage.destroy();
    expect(svg!.querySelector('g')).toBeFalsy();
    vi.unstubAllGlobals();
  });
});
