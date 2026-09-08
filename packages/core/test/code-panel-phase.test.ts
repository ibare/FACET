/**
 * 코드 패널이 있는 facet 은 `phase` 를 받아 패널에 넘긴다.
 *
 * `phase` 이벤트는 `silent: true` 로 나간다. 그 뜻은 **걸음의 경계가 아니다**
 * 이지 projector 에 오지 않는다는 것이 아니다 — mechanism 은 projector 갱신을
 * 마친 뒤에야 silent 를 보고 후처리를 건너뛴다. 그런데 그 주석을 "여기 오지
 * 않는다" 로 적어 둔 projector 가 넷 있었고, 넷 다 `case 'phase'` 를 통째로
 * 빠뜨린 채 커밋됐다. 코드 패널은 선언되어 있고 IR 도 붙어 있으니 화면에는
 * 코드가 뜬다 — 다만 재생하는 동안 아무 줄도 짚지 않을 뿐이라 눈으로는 "원래
 * 그런 것" 과 구별되지 않는다.
 *
 * 그래서 여기서 전수로 잰다. 코드 패널을 단 facet 을 새로 만들면 아래 목록에
 * 한 줄 보태라.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getFacetById, getProjector } from '../src/runtime/registry.js';
import type { ProjectorViews } from '../src/runtime/projector.js';

const MODULES: Array<() => Promise<Record<string, unknown>>> = [
  () => import('../../../facets/cs-fundamentals/avl-tree/src/index.js'),
  () => import('../../../facets/cs-fundamentals/b-tree/src/index.js'),
  () => import('../../../facets/cs-fundamentals/bfs/src/index.js'),
  () => import('../../../facets/cs-fundamentals/bst/src/index.js'),
  () => import('../../../facets/cs-fundamentals/bubble-sort/src/index.js'),
  () => import('../../../facets/cs-fundamentals/heap-binary/src/index.js'),
  () => import('../../../facets/cs-fundamentals/queue-fifo/src/index.js'),
  () => import('../../../facets/cs-fundamentals/red-black-tree/src/index.js'),
];

/** projector 가 부르는 아무 메서드나 삼키는 스텁. 무엇을 부르는지는 관심 밖이다. */
function stubView(): ProjectorViews[string] {
  return new Proxy(
    {},
    {
      get: (_t, key) => (key === 'then' ? undefined : () => undefined),
    },
  ) as ProjectorViews[string];
}

describe('코드 패널 phase 배선', () => {
  it('코드 패널을 단 facet 은 phase 를 패널로 넘긴다', async () => {
    const missing: string[] = [];
    const mismatched: string[] = [];
    let checked = 0;

    for (const load of MODULES) {
      const mod = await load();
      for (const [k, v] of Object.entries(mod)) {
        if (k.startsWith('register') && typeof v === 'function') (v as () => void)();
      }

      for (const v of Object.values(mod)) {
        const json = v as { id?: unknown; blocks?: unknown; projector?: unknown };
        if (typeof json?.id !== 'string' || typeof json.blocks !== 'object' || json.blocks === null) continue;
        if (getFacetById(json.id) === undefined) continue;

        // 코드 패널을 단 블록의 ref 이름을 찾는다 — projector 는 그 이름으로 꺼낸다.
        const blocks = json.blocks as Record<string, { type?: unknown; ir?: unknown }>;
        const panelRefs = Object.entries(blocks)
          .filter(([, b]) => b?.type === 'code-view')
          .map(([ref]) => ref);
        if (panelRefs.length === 0) continue;

        const projectorRef = typeof json.projector === 'string' ? json.projector : '';
        const factory = getProjector(projectorRef.replace(/^module:/, ''));
        if (!factory) continue;

        checked += 1;

        // stage · HUD 는 스텁으로 채우고, 패널만 호출을 기록한다.
        const seen: (string | null)[] = [];
        const views: ProjectorViews = {};
        for (const ref of Object.keys(blocks)) views[ref] = stubView();
        for (const ref of panelRefs) {
          views[ref] = {
            highlightPhase: (p: string | null) => seen.push(p),
            clearHighlight: () => undefined,
          } as unknown as ProjectorViews[string];
        }

        // onInit 은 부르지 않는다 — 실제 초기 데이터를 요구하는 projector 가
        // 있고, 여기서 재는 것은 phase 하나가 패널까지 닿느냐뿐이다.
        const projector = factory(views, undefined);
        await projector.onEvent({ type: 'phase', payload: { phase: 'probe' }, silent: true });

        if (seen.length === 0) missing.push(json.id);
        else if (seen[seen.length - 1] !== 'probe') mismatched.push(`${json.id} → ${String(seen[seen.length - 1])}`);
      }
    }

    expect(checked).toBeGreaterThan(0);
    expect({ missing, mismatched }).toEqual({ missing: [], mismatched: [] });
  });
});
