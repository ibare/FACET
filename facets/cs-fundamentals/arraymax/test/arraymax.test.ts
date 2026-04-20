// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import { arraymax, registerArraymax, arraymaxFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('ArrayMax 알고리즘', () => {
  it('일반 케이스', async () => {
    const r = await arraymax({
      data: { type: 'array', values: [3, 7, 2, 8, 4, 1, 9, 5] },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(9);
  });

  it('단일 요소', async () => {
    const r = await arraymax({
      data: { type: 'array', values: [42] },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(42);
  });

  it('동일 값', async () => {
    const r = await arraymax({
      data: { type: 'array', values: [5, 5, 5, 5] },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(5);
  });

  it('음수 포함', async () => {
    const r = await arraymax({
      data: { type: 'array', values: [-3, -7, -1, -10] },
      cancelled: false,
      async emit() {},
      metric() {},
    });
    expect(r).toBe(-1);
  });
});

describe('ArrayMax facet', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerArraymax();
  });

  it('마운트 + 실행', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(arraymaxFacet, mount);
    expect(mount.querySelectorAll('.facet-bar-chart rect').length).toBe(8);
    handle.setSpeed(40);
    handle.start();
    await delay(2500);
    handle.destroy();
  });
});
