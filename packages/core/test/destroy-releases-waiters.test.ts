/**
 * 재생 도중 `destroy` 해도 알고리즘이 손을 뗀다 — facet 전수.
 *
 * stage 의 애니메이션은 대개 promise 를 돌려주고 projector 가 그것을 기다린다.
 * 그래서 `destroy` 가 프레임과 타이머만 거두면 **취소된 tick 이 아예 불리지
 * 않아** 그 promise 를 풀 길이 사라진다. `await ctx.emit` 이 영영 돌아오지
 * 않고, unmount 된 뒤에도 알고리즘·projector·SVG 트리가 통째로 붙들린다.
 *
 * 이것은 눈으로 못 잡는다 — 타입도 통과하고 예외도 안 나며, 화면은 이미
 * 사라진 뒤라 아무도 보지 않는다. 글 하나에 조각이 여럿 박히고 스크롤로
 * mount/unmount 가 되풀이될 때에만 쌓여서 드러난다. 그래프 조각 2차에서 셋이
 * 이 구멍을 냈다.
 *
 * **재는 법이 까다롭다.** `handle.destroy()` 는 `void` 를 돌려주므로 그것을
 * 기다려서는 아무것도 알 수 없다 — 처음에 그렇게 짰다가 전부 통과하는 것을
 * 보고 알았다. 매달리는 것은 stage 의 애니메이션 promise 이고 그것을 기다리는
 * 것은 projector 의 `onEvent` 이므로, **`onEvent` 가 돌려준 promise 가 아직
 * 이행되지 않은 채 몇 개 남아 있는지**를 세는 것이 곧 매달림을 세는 것이다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runFacet, clearRegistry } from '../src/runtime/index.js';
import { getProjector, registerProjector } from '../src/runtime/registry.js';
import type { FacetJson } from '../src/types/facet-json.js';
import type { FacetRunHandle } from '../src/runtime/runner.js';

import { FACET_MODULES as MODULES } from './facet-modules.js';

/** 한 번에 띄우는 수. 순차로 돌리면 facet 하나마다 1초가 넘게 든다. */
const BATCH = 10;

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

type Tally = { started: number; finished: number };

/**
 * projector 를 감싸 **아직 안 끝난 `onEvent`** 를 센다. facet 쪽 코드는 자기가
 * 감싸였다는 것을 모른다.
 */
function trackPending(projectorRef: string, tally: Tally): void {
  const name = projectorRef.replace(/^module:/, '');
  const original = getProjector(name);
  if (!original) return;
  registerProjector(name, (views, runtime) => {
    const inner = original(views, runtime);
    return {
      ...inner,
      async onEvent(event) {
        tally.started += 1;
        try {
          await inner.onEvent(event);
        } finally {
          tally.finished += 1;
        }
      },
    };
  });
}

describe('재생 도중 destroy', () => {
  it('알고리즘이 매달리지 않는다', async () => {
    clearRegistry();

    const hung: string[] = [];
    let checked = 0;

    const original = console.error;
    console.error = () => {};

    try {
      // 등록을 먼저 끝낸다 — 감싸기가 등록된 원본을 꺼내 덮는 방식이라 순서가 있다.
      const facets: FacetJson[] = [];
      for (const [, load] of MODULES) {
        const mod = await load();
        for (const [k, v] of Object.entries(mod)) {
          if (k.startsWith('register') && typeof v === 'function') (v as () => void)();
        }
        facets.push(...facetsOf(mod));
      }

      for (let i = 0; i < facets.length; i += BATCH) {
        const slice = facets.slice(i, i + BATCH);
        const rows: Array<{ id: string; tally: Tally; container: HTMLElement }> = [];
        const handles: FacetRunHandle[] = [];

        for (const facet of slice) {
          const tally: Tally = { started: 0, finished: 0 };
          if (typeof facet.projector === 'string') trackPending(facet.projector, tally);
          const container = document.createElement('div');
          document.body.appendChild(container);
          handles.push(runFacet(facet, container));
          rows.push({ id: facet.id, tally, container });
          checked += 1;
        }

        // 재생이 한창인 때를 고른다 — 첫 걸음이 나가고 그 애니메이션이 아직
        // 돌고 있을 무렵이라야 매달릴 자리가 실제로 열린다.
        await delay(700);
        for (const h of handles) h.destroy();

        // 접은 뒤에는 기다리던 것이 전부 풀려야 한다.
        await delay(1_200);
        for (const r of rows) {
          const stuck = r.tally.started - r.tally.finished;
          if (stuck > 0) hung.push(`${r.id} (${stuck})`);
          r.container.remove();
        }
      }
    } finally {
      console.error = original;
    }

    expect(checked).toBeGreaterThan(100);
    expect(hung).toEqual([]);
  }, 180_000);
});
