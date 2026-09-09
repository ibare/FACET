/**
 * 등록 이름 규약 — projector 는 algorithm 과 같은 이름을 쓰지 않는다 (C4).
 *
 * 레지스트리가 algorithms 와 projectors 를 별도 Map 으로 들고 있어 둘이 같은
 * 이름이어도 동작은 한다. 그래서 눈으로도 타입으로도 안 잡히는데, `module:X`
 * 참조만 보고는 그것이 algorithm 인지 projector 인지 알 수 없게 된다.
 *
 * 세 배치에서 세 번 났다 — splitUntilOne · countThenPlace · boundAndCut. 그중
 * 둘은 rule-guard 가 잡았고 하나는 전수 대조에서 나왔다. 사람이 반복해서 놓치는
 * 자리이므로 기계로 막는다.
 *
 * 대상은 `facet-modules.ts` 가 디렉터리에서 모은다 — 손목록이 아니라 전수다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { clearRegistry, getAlgorithm, getProjector } from '../src/runtime/registry.js';
import type { FacetJson } from '../src/types/facet-json.js';

import { FACET_MODULES as MODULES } from './facet-modules.js';
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

const ref = (s: unknown): string => (typeof s === 'string' ? s.replace(/^module:/, '') : '');

describe('등록 이름 규약', () => {
  it('projector 이름이 algorithm 이름과 겹치지 않는다', async () => {
    clearRegistry();

    const collided: string[] = [];
    const missing: string[] = [];
    let checked = 0;

    for (const [, load] of MODULES) {
      const mod = await load();
      for (const [k, v] of Object.entries(mod)) {
        if (k.startsWith('register') && typeof v === 'function') (v as () => void)();
      }
      for (const facet of facetsOf(mod)) {
        const p = ref(facet.projector);
        const a = ref(facet.algorithm);
        if (!p || !a) continue;
        checked += 1;

        // 참조가 실제로 등록되어 있어야 한다.
        if (getProjector(p) === undefined) missing.push(`${facet.id} → projector ${p}`);
        if (getAlgorithm(a) === undefined) missing.push(`${facet.id} → algorithm ${a}`);

        // 같은 이름이면 module: 참조가 어느 쪽인지 말하지 못한다.
        if (p === a) collided.push(`${facet.id} (둘 다 ${p})`);
        // 이름이 달라도 projector 이름으로 algorithm 이 잡히면 마찬가지다.
        else if (getAlgorithm(p) !== undefined) collided.push(`${facet.id} (projector ${p} 가 algorithm 으로도 등록됨)`);
      }
    }

    // 하한은 glob 이 좁아진 것을 잡는 자리다. 손목록을 걷어낸 뒤로 이 검사가
    // 전수인지는 glob 하나에 달렸고, 그것이 조용히 줄면 아무도 모른다.
    expect(checked).toBeGreaterThan(100);
    expect({ collided, missing }).toEqual({ collided: [], missing: [] });
  });
});
