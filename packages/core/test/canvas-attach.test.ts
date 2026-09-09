/**
 * CanvasView 는 러너가 붙여 준 캔버스를 떼어내지 않는다.
 *
 * 러너의 `mountView` 는 캔버스를 컨테이너에 **먼저** 붙이고 `mount` 를 부른다.
 * 그래서 view 가 방어적으로 `container.textContent = ''` 를 하면 그 캔버스가
 * 떨어져 나가고, view 는 DOM 에 없는 SVG 에 그림을 그리게 된다 — 타입도 통과하고
 * 예외도 안 나고 화면만 빈다. 실제로 CanvasView 로 옮기면서 열하나가 그렇게 됐고,
 * 그중 일곱은 발견되지 않은 채 커밋됐다.
 *
 * 눈으로는 못 잡는다. 그래서 여기서 전수로 잰다 — 대상은 `facet-modules.ts` 가
 * 디렉터리에서 모은 stage 파일 전부다. 비우고 싶으면 캔버스 안쪽(`params.canvas`)을
 * 비우거나, 컨테이너를 비웠으면 캔버스를 되붙여라 (S-view).
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView } from '../src/runtime/layout-builder.js';
import type { View } from '../src/views/types.js';

import { STAGE_MODULES as MODULES } from './facet-modules.js';

function canvasViewsOf(mod: Record<string, unknown>): View[] {
  const out: View[] = [];
  for (const v of Object.values(mod)) {
    if (v && typeof v === 'object' && 'canvas' in v && typeof (v as { mount?: unknown }).mount === 'function') {
      out.push(v as View);
    }
  }
  return out;
}

describe('CanvasView 캔버스 부착', () => {
  it('마운트한 뒤에도 캔버스가 컨테이너에 남아 있다', async () => {
    const detached: string[] = [];
    let checked = 0;

    for (const [name, load] of MODULES) {
      const mod = await load();
      for (const view of canvasViewsOf(mod)) {
        const container = document.createElement('div');
        document.body.appendChild(container);
        try {
          mountView(view, container, { config: {}, locale: 'en', theme: 'light' });
        } catch {
          // config 없이 부르면 던지는 view 가 있다. 그건 이 테스트의 관심사가
          // 아니다 — 던졌다면 캔버스를 떼어낼 기회도 없었다.
          continue;
        }
        checked += 1;
        if (container.querySelectorAll('svg').length === 0) detached.push(name);
      }
    }

    expect(detached).toEqual([]);
    // 문턱이 실제 수(122)의 3분의 1이던 때가 있었다. glob 이 한 도메인만 남게
    // 좁아져도 통과해 버리므로, 현재 수 가까이 두어야 뜻이 있다.
    expect(checked).toBeGreaterThan(100);
  });
});
