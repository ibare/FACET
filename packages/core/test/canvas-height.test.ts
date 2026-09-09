/**
 * facet 의 세로는 마운트한 뒤 바뀌지 않는다.
 *
 * 호스트(Tiptap NodeView)는 높이를 정하지 않는다 — SVG 의 viewBox 비율이 그대로
 * 문서에서의 높이가 된다. 그래서 재생 중에 viewBox 를 다시 재면 **글 안에 박힌
 * 그림의 위아래 문단이 밀린다.** 읽는 사람에게는 글이 흔들리는 것으로 보인다.
 *
 * 내용에 따라 커지는 그림(나무가 깊어지는 힙·유니온파인드 같은 것)은 흔한 깊이
 * 만큼 미리 자리를 잡아 두고, 넘치면 층 간격을 줄여 담는다. 높이를 늘리지 않는다.
 *
 * 실제로 완제품 둘이 그랬다 — heapBinary 229→291, unionFind 80→260.
 *
 * 대상은 `facet-modules.ts` 가 디렉터리에서 모은다 — 손목록이 아니라 전수다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runFacet, clearRegistry } from '../src/runtime/index.js';
import type { FacetJson } from '../src/types/facet-json.js';
import type { FacetRunHandle } from '../src/runtime/runner.js';

import { FACET_MODULES as MODULES } from './facet-modules.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function facetsOf(mod: Record<string, unknown>): FacetJson[] {
  const out: FacetJson[] = [];
  for (const v of Object.values(mod)) {
    if (v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string') {
      const id = (v as { id: string }).id;
      if (id.startsWith('facet:')) out.push(v as FacetJson);
    }
  }
  return out;
}

describe('facet 세로 고정', () => {
  it('마운트한 뒤 viewBox 높이가 바뀌지 않는다', async () => {
    clearRegistry();
    const handles: FacetRunHandle[] = [];
    const mounted: Array<[string, HTMLElement]> = [];
    const orig = console.error;
    console.error = () => {};
    for (const [, load] of MODULES) {
      const mod = await load();
      for (const [k, v] of Object.entries(mod)) {
        if (k.startsWith('register') && typeof v === 'function') (v as () => void)();
      }
      for (const facet of facetsOf(mod)) {
        const c = document.createElement('div');
        document.body.appendChild(c);
        try { handles.push(runFacet(facet, c)); } catch { continue; }
        mounted.push([facet.id, c]);
      }
    }
    const before = new Map<string, string>();
    await wait(120);
    for (const [id, c] of mounted) before.set(id, c.querySelector('svg')?.getAttribute('viewBox') ?? '');
    await wait(9000);
    const changed: string[] = [];
    for (const [id, c] of mounted) {
      const now = c.querySelector('svg')?.getAttribute('viewBox') ?? '';
      const was = before.get(id) ?? '';
      const h = (v: string) => v.split(/\s+/)[3] ?? '';
      if (h(was) !== h(now)) changed.push(`${id}  ${h(was)} → ${h(now)}`);
    }
    console.error = orig;
    for (const h of handles) h.destroy();
    expect(changed).toEqual([]);
    // 위와 같은 이유로 현재 수(126) 가까이 둔다.
    expect(mounted.length).toBeGreaterThan(100);
  }, 60000);
});
