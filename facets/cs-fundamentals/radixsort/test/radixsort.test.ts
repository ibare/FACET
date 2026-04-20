// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from 'vitest';
import { runFacet, clearRegistry } from '@facet/core/runtime';
import { radixsort, registerRadixsort, radixsortFacet } from '../src/index.js';
import { registerPythonTranspiler } from '@facet/transpiler-python';
import { registerCodeView } from '@facet/view-code';

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

describe('RadixSort 알고리즘', () => {
  it('3자리 수 정렬', async () => {
    const data: { type: 'array'; values: number[] } = {
      type: 'array',
      values: [170, 45, 75, 90, 802, 24, 2, 66],
    };
    await radixsort({ data, cancelled: false, async emit() {}, metric() {} });
    expect(data.values).toEqual([2, 24, 45, 66, 75, 90, 170, 802]);
  });

  it('단일/빈', async () => {
    const single: { type: 'array'; values: number[] } = { type: 'array', values: [42] };
    await radixsort({ data: single, cancelled: false, async emit() {}, metric() {} });
    expect(single.values).toEqual([42]);

    const empty: { type: 'array'; values: number[] } = { type: 'array', values: [] };
    await radixsort({ data: empty, cancelled: false, async emit() {}, metric() {} });
    expect(empty.values).toEqual([]);
  });
});

describe('RadixSort facet', () => {
  beforeEach(() => {
    clearRegistry();
    registerCodeView();
    registerPythonTranspiler();
    registerRadixsort();
  });

  it('마운트 + 정렬', async () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const handle = runFacet(radixsortFacet, mount);
    expect(mount.querySelectorAll('.facet-bar-chart rect').length).toBe(8);
    handle.setSpeed(40);
    handle.start();
    await delay(3500);
    const labels = [...mount.querySelectorAll('.facet-bar-chart text')].map((t) => Number(t.textContent));
    expect(labels).toEqual([...labels].sort((a, b) => a - b));
    handle.destroy();
  });
});
