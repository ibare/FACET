// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import { countingsort, registerCountingsort, countingsortFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('CountingSort 알고리즘', () => {
  it('중복 포함 정렬', async () => {
    const data: { type: 'array'; values: number[] } = {
      type: 'array',
      values: [4, 2, 2, 8, 3, 3, 1, 5],
    };
    await countingsort({ data, cancelled: false, async emit() {}, metric() {} });
    expect(data.values).toEqual([1, 2, 2, 3, 3, 4, 5, 8]);
  });

  it('단일/빈', async () => {
    const single: { type: 'array'; values: number[] } = { type: 'array', values: [7] };
    await countingsort({ data: single, cancelled: false, async emit() {}, metric() {} });
    expect(single.values).toEqual([7]);

    const empty: { type: 'array'; values: number[] } = { type: 'array', values: [] };
    await countingsort({ data: empty, cancelled: false, async emit() {}, metric() {} });
    expect(empty.values).toEqual([]);
  });
});

describe('CountingSort facet', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerCountingsort();
  });

  it('마운트 + 정렬', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(countingsortFacet, mount);
    expect(mount.querySelectorAll('.facet-bar-chart rect').length).toBe(8);
    handle.setSpeed(40);
    handle.start();
    await delay(2500);
    const labels = [...mount.querySelectorAll('.facet-bar-chart text')].map((t) => Number(t.textContent));
    expect(labels).toEqual([...labels].sort((a, b) => a - b));
    handle.destroy();
  });
});
