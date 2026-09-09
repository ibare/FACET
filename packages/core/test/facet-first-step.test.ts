/**
 * 모든 facet 을 실제로 띄우고 첫 걸음을 굴린다.
 *
 * 조각은 mount 하면 스스로 재생을 시작한다(reactive). 그 첫 걸음에서 던지면
 * 러너가 `console.error` 로 삼키고 화면만 빈 채로 남는다 — 타입도 통과하고
 * 빌드도 통과한다. 실제로 `rotate-to-balance` 가 그렇게 나갔다: 회전 함수가
 * 부모를 고치는 순서를 틀려 자기를 가리키는 고리를 만들었고, 높이를 세는
 * 재귀가 끝나지 않아 `Maximum call stack size exceeded` 로 죽었다. 아무도
 * 돌려 보지 않아 커밋까지 갔다.
 *
 * 여기서 잡는 것은 그 부류다 — 시작하자마자 죽는 것. 걸음을 끝까지 밟게
 * 기다리지 않는다(그러면 몇 분이 든다). 짧게 굴려 보고 던진 것이 있는지만 본다.
 *
 * 대상은 `facet-modules.ts` 가 디렉터리에서 모은다 — 손목록이 아니라 전수다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runFacet, clearRegistry } from '../src/runtime/index.js';
import type { FacetJson } from '../src/types/facet-json.js';
import type { FacetRunHandle } from '../src/runtime/runner.js';

import { FACET_MODULES as MODULES } from './facet-modules.js';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

describe('facet 첫 걸음', () => {
  it('띄우고 굴려도 던지지 않는다', async () => {
    clearRegistry();

    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' '));
    };

    const handles: FacetRunHandle[] = [];
    const blank: string[] = [];
    const mounted: Array<[string, HTMLElement]> = [];

    try {

      for (const [name, load] of MODULES) {
        const mod = await load();
        // register* 를 모두 부른다 — 등록 진입점 이름은 facet 마다 다르다.
        for (const [key, value] of Object.entries(mod)) {
          if (key.startsWith('register') && typeof value === 'function') {
            (value as () => void)();
          }
        }
        for (const facet of facetsOf(mod)) {
          const container = document.createElement('div');
          document.body.appendChild(container);
          handles.push(runFacet(facet, container));
          mounted.push([`${name} :: ${facet.id}`, container]);
        }
      }

      // 한 번만 기다린다 — 전부 동시에 굴러가므로 합쳐도 이 시간이면 된다.
      await delay(500);

      for (const [name, container] of mounted) {
        const svg = container.querySelector('svg');
        if (svg && svg.childNodes.length === 0) blank.push(name);
      }
    } finally {
      for (const h of handles) h.destroy();
      console.error = original;
    }

    // 이 검사에만 하한이 없었다. glob 이 0행을 돌려주면 아래 두 배열이 비어
    // 조용히 통과한다 — 손목록을 걷어낸 이유가 "목록의 성실함에 기대는 전수는
    // 전수가 아니다" 인데, 담보 없이 glob 의 성실함에 기대는 것도 같다.
    expect(mounted.length).toBeGreaterThan(100);
    expect(errors).toEqual([]);
    expect(blank).toEqual([]);
  }, 30_000);
});
