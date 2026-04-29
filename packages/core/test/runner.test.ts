// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import {
  runFacet,
  registerAlgorithm,
  registerProjector,
  registerFacets,
  clearRegistry,
  getFacetById,
} from '../src/runtime/index.js';
import {
  counter,
  counterProjector,
  counterFacet,
} from '../src/examples/index.js';
import type { FacetContext } from '../src/runtime/context.js';
import type { FacetJson } from '../src/types/facet-json.js';
import type { ProjectorFactory } from '../src/runtime/projector.js';

function flushMicrotasks(times = 5): Promise<void> {
  let p = Promise.resolve();
  for (let i = 0; i < times; i++) {
    p = p.then(() => undefined);
  }
  return p;
}

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('runFacet — counter 더미', () => {
  beforeEach(() => {
    clearRegistry();
    registerAlgorithm('counter', counter);
    registerProjector('counterProjector', counterProjector);
    registerFacets([counterFacet]);
  });

  it('레지스트리 등록 및 조회', () => {
    expect(getFacetById('facet:counter')).toBeDefined();
  });

  it('layout 과 blocks 가 마운트됨', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(counterFacet, mount);
    expect(mount.querySelector('.facet-root')).toBeTruthy();
    expect(mount.querySelector('.facet-title-block')).toBeTruthy();
    expect(mount.querySelector('.facet-text-display')).toBeTruthy();
    expect(mount.querySelector('.facet-control-bar')).toBeTruthy();
    handle.destroy();
  });

  it('재생 시 알고리즘이 진행되며 text-display 갱신 + 카운트 메트릭 증가', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(counterFacet, mount);
    handle.setSpeed(20);
    handle.start();
    // 충분히 기다림
    await delay(400);
    const value = mount.querySelector('.facet-text-display__value')?.textContent;
    expect(value).toBe('완료');
    const metric = mount.querySelector('.facet-control-bar__metric--count span:last-child')?.textContent;
    expect(metric).toBe('5');
    handle.destroy();
  });

  it('step 으로 한 단계씩 진행', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(counterFacet, mount);
    handle.step();
    await flushMicrotasks(20);
    let value = mount.querySelector('.facet-text-display__value')?.textContent;
    expect(value).toBe('1');
    handle.step();
    await flushMicrotasks(20);
    value = mount.querySelector('.facet-text-display__value')?.textContent;
    expect(value).toBe('2');
    handle.destroy();
  });

  it('reset 후 다시 step 가능', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(counterFacet, mount);
    handle.step();
    await flushMicrotasks(20);
    handle.step();
    await flushMicrotasks(20);
    handle.reset();
    await delay(20);
    // reset 후 runner 가 onInit 을 다시 호출 → counter projector 의 초기 텍스트('대기 중') 가 다시 표시됨
    const value = mount.querySelector('.facet-text-display__value')?.textContent;
    expect(value).toBe('대기 중');
    const metric = mount.querySelector('.facet-control-bar__metric--count span:last-child')?.textContent;
    expect(metric).toBe('0');
    handle.step();
    await flushMicrotasks(20);
    expect(mount.querySelector('.facet-text-display__value')?.textContent).toBe('1');
    handle.destroy();
  });

  it('미등록 알고리즘은 에러', () => {
    const mount = document.createElement('div');
    expect(() =>
      runFacet({ ...counterFacet, algorithm: 'module:nope' }, mount),
    ).toThrow(/미등록/);
  });

  it('pause 후 진행 정지, resume(start) 시 재개', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    // target 을 약간 크게 잡아 한 번에 끝나지 않게 함
    const facet: FacetJson = { ...counterFacet, initialData: { type: 'counter', target: 15 } };
    const handle = runFacet(facet, mount);
    handle.setSpeed(1); // 100ms / step
    handle.start();
    // 한두 step 진행
    await delay(250);
    handle.stop();
    const valueAtPause = mount.querySelector('.facet-text-display__value')?.textContent;
    expect(valueAtPause).toBeTruthy();
    expect(valueAtPause).not.toBe('완료');
    // pause 동안 값이 변하지 않아야 함
    await delay(300);
    const valueStill = mount.querySelector('.facet-text-display__value')?.textContent;
    expect(valueStill).toBe(valueAtPause);
    // resume
    handle.setSpeed(20);
    handle.start();
    await delay(800);
    const valueAfter = mount.querySelector('.facet-text-display__value')?.textContent;
    expect(valueAfter).toBe('완료');
    handle.destroy();
  });

  it('speed 변경이 다음 emit 지연에 즉시 반영', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const facet: FacetJson = { ...counterFacet, initialData: { type: 'counter', target: 30 } };
    const handle = runFacet(facet, mount);
    handle.setSpeed(0.5); // 200ms / step — 매우 느림
    handle.start();
    await delay(120);
    // 느린 속도이므로 1~2 step 만 진행됐어야 함
    const slowVal = Number(mount.querySelector('.facet-text-display__value')?.textContent);
    expect(slowVal).toBeLessThanOrEqual(3);
    // 속도 즉시 변경
    handle.setSpeed(20);
    await delay(400);
    const fastVal = mount.querySelector('.facet-text-display__value')?.textContent;
    // 빨라진 속도로 끝까지 진행
    expect(fastVal).toBe('완료');
    handle.destroy();
  });
});

describe('runFacet — silent 이벤트 step boundary', () => {
  beforeEach(() => clearRegistry());

  it('silent 이벤트는 step 으로 멈추지 않고 다음 non-silent 에서 멈춘다', async () => {
    let emitsAfterStep = 0;
    const alg = async (ctx: FacetContext<{ type: string }>) => {
      // 1) non-silent → step boundary 1
      await ctx.emit({ type: 'state-changed', payload: { mark: 'A' } });
      emitsAfterStep++;
      // 2) silent → 통과해야 함 (멈추면 안 됨)
      await ctx.emit({ type: 'state-changed', payload: { mark: 'silent' }, silent: true });
      emitsAfterStep++;
      // 3) non-silent → 여기서 멈춰야 함 (step boundary 2)
      await ctx.emit({ type: 'state-changed', payload: { mark: 'B' } });
      emitsAfterStep++;
      await ctx.emit({ type: 'done' });
    };
    const proj: ProjectorFactory = (views) => {
      const d = views.display as unknown as { setText(s: string): void; reset(): void } | undefined;
      return {
        onInit() { d?.setText('대기 중'); },
        onEvent(e) {
          if (e.type === 'state-changed') {
            const p = e.payload as { mark: string };
            d?.setText(p.mark);
          } else if (e.type === 'done') d?.setText('완료');
        },
        onReset() { d?.reset(); },
      };
    };
    registerAlgorithm('silenttest', alg);
    registerProjector('silentProj', proj);
    const facet: FacetJson = {
      id: 'facet:silenttest',
      title: 'silent',
      algorithm: 'module:silenttest',
      projector: 'module:silentProj',
      initialData: { type: 'silent' },
      layout: { type: 'column', children: [{ ref: 'display' }] },
      blocks: { display: { type: 'text-display' } },
    };
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(facet, mount);
    handle.step();
    await flushMicrotasks(20);
    // 첫 step boundary: A 가 표시되어야 하고, silent 까지는 통과 안 됐어야
    expect(mount.querySelector('.facet-text-display__value')?.textContent).toBe('A');
    handle.step();
    await flushMicrotasks(20);
    // 두번째 step: silent 통과 후 B 에서 멈춤. silent 이벤트 자체도 projector 는 받았으므로
    // emitsAfterStep 은 3 이 됐어야 함 (A, silent, B 까지 emit 완료, 마지막 B 후 paused)
    expect(emitsAfterStep).toBe(3);
    expect(mount.querySelector('.facet-text-display__value')?.textContent).toBe('B');
    handle.destroy();
  });
});

describe('runFacet — shuffleOnReset', () => {
  beforeEach(() => clearRegistry());

  it('shuffleOnReset:true 면 mount 와 reset 시점에 배열 셔플', async () => {
    let observedAtStart: number[] | null = null;
    const alg = async (ctx: FacetContext<{ type: string; items: number[] }>) => {
      observedAtStart = [...ctx.data.items];
      await ctx.emit({ type: 'done' });
    };
    const proj: ProjectorFactory = () => ({
      onInit() { /* no-op */ },
      onEvent() { /* no-op */ },
      onReset() { /* no-op */ },
    });
    registerAlgorithm('shuffletest', alg);
    registerProjector('shuffleProj', proj);
    const original = Array.from({ length: 30 }, (_, i) => i);
    const facet: FacetJson = {
      id: 'facet:shuffletest',
      title: 'shuffle',
      algorithm: 'module:shuffletest',
      projector: 'module:shuffleProj',
      initialData: { type: 'shuffle', items: [...original] },
      shuffleOnReset: true,
      layout: { type: 'column', children: [{ ref: 'display' }] },
      blocks: { display: { type: 'text-display' } },
    };
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(facet, mount);
    handle.setSpeed(20);
    handle.start();
    await delay(80);
    // mount 시점 셔플로 알고리즘이 본 배열이 원본과 다를 확률은 30! 중 1
    expect(observedAtStart).not.toBeNull();
    expect(observedAtStart!.length).toBe(original.length);
    expect(observedAtStart!.slice().sort((a, b) => a - b)).toEqual(original);
    expect(observedAtStart).not.toEqual(original);
    handle.destroy();
  });
});
