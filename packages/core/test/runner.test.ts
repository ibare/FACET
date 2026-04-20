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
    const value = mount.querySelector('.facet-text-display__value')?.textContent;
    expect(value).toBe('—');
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
});
