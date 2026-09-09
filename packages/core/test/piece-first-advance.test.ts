/**
 * 조각 전수 — 자동 재생이 끝난 뒤 처음 누르는 `advance` 는 되감고 **첫 걸음까지** 간다.
 *
 * S-piece 가 이 대목에 실패 이력을 못 박아 두었다: "조각 스물에서 셋이 이 대목만
 * 달라 첫 누름의 뜻이 두 갈래로 갈렸다." 되감기만 하고 멈추면 눌러도 반응이 없는
 * 것으로 읽힌다 — 타입도 통과하고 예외도 안 나며, 눌러 본 사람만 안다.
 *
 * 재는 법은 화면이 아니라 **발신**이다. 처음에는 화면을 견주려 했는데, 첫 걸음이
 * 화면을 바꾸지 않는 조각이 있어 되감기만 한 것과 구별되지 않았다. 그래서 projector
 * 를 감싸 조각이 내보내는 이벤트를 센다 — `advance` 한 번에 **둘 이상**이 나와야
 * 한다. 하나만 나오면 그것이 되감기이고 걸음은 오지 않은 것이다.
 *
 * 조각인지는 컨트롤로 가린다 — replay 와 advance 둘뿐인 것이 조각이다
 * (`CONTROL_SET.piece`). facet 전수를 `facet-modules.ts` 에서 받아 그중 조각만 고른다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runFacet, clearRegistry } from '../src/runtime/index.js';
import { getProjector, registerProjector } from '../src/runtime/registry.js';
import type { FacetJson } from '../src/types/facet-json.js';
import type { FacetRunHandle } from '../src/runtime/runner.js';

import { FACET_MODULES as MODULES, PIECE_MARKED_COUNT } from './facet-modules.js';
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * 발신이 멎을 때까지 기다린다.
 *
 * `quietMs` 동안 누구도 새로 내보내지 않으면 멎은 것으로 본다. 멎었으면 `true`,
 * 상한에 닿았으면 `false` 다.
 *
 * 상한에 닿는 것은 끝나지 않는 조각이 있다는 뜻일 수도, 그저 다 굴리기에 상한이
 * 모자란다는 뜻일 수도 있다. 어느 쪽이든 **그 뒤의 판정은 뜻이 흐려진다** — 자동
 * 재생이 도는 중에 누르면 첫 누름의 몫을 잰 것이 아니게 된다. 그래서 삼키지 않고
 * 돌려주고, 아래에서 통과 조건에 넣는다.
 *
 * 조각 여든여섯을 한 문서에 동시에 띄우면 타이머가 서로 밀려, 가장 긴 조각이
 * 열여섯 초여도 다 멎기까지 서른여덟 초가 걸린다. 상한은 그 실측 위에 둔 것이지
 * 조각의 길이에서 나온 수가 아니다.
 */
async function settle(
  rows: Array<{ counter: { n: number } }>,
  quietMs: number,
  capMs: number,
): Promise<boolean> {
  const total = (): number => rows.reduce((a, r) => a + r.counter.n, 0);
  const started = Date.now();
  let last = total();
  let quietSince = Date.now();
  while (Date.now() - started < capMs) {
    await delay(250);
    const now = total();
    if (now !== last) {
      last = now;
      quietSince = Date.now();
      continue;
    }
    if (Date.now() - quietSince >= quietMs) return true;
  }
  return false;
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

/**
 * 컨트롤이 다시 보기 + 한 걸음 뿐인 facet 이 조각이다 (S-piece).
 *
 * 다시 보기의 action 은 `'replay'` 가 아니라 `'reset'` 이다 — 되감는 일 자체는
 * reset 과 같고 라벨만 다르게 부른다 (`CONTROL.replay`).
 */
function isPiece(facet: FacetJson): boolean {
  for (const block of Object.values(facet.blocks)) {
    const spec = block as { type?: unknown; controls?: unknown };
    if (spec.type !== 'control-bar' || !Array.isArray(spec.controls)) continue;
    const actions = spec.controls.map((c) => (c as { action?: unknown }).action);
    return actions.length === 2 && actions.includes('reset') && actions.includes('advance');
  }
  return false;
}

/**
 * projector 를 감싸 발신 수를 센다. 원본을 레지스트리에서 꺼내 덮어쓰는 방식이라
 * facet 쪽 코드는 자기가 감싸였다는 것을 모른다.
 */
function countEmits(projectorRef: string, counter: { n: number }): void {
  const name = projectorRef.replace(/^module:/, '');
  const original = getProjector(name);
  if (!original) return;
  registerProjector(name, (views, runtime) => {
    const inner = original(views, runtime);
    return {
      ...inner,
      async onEvent(event) {
        counter.n += 1;
        await inner.onEvent(event);
      },
    };
  });
}

describe('조각의 첫 advance', () => {
  it('되감고 첫 걸음까지 간다', async () => {
    clearRegistry();

    const handles: FacetRunHandle[] = [];
    const rows: Array<{ id: string; container: HTMLElement; counter: { n: number } }> = [];
    const stalled: string[] = [];   // 되감기 하나로 끝난 것
    const deaf: string[] = [];      // 아무것도 안 나온 것
    const noButton: string[] = [];
    let settled = false;          // 자동 재생이 정말 멎은 뒤에 눌렀는가

    const original = console.error;
    console.error = () => {};

    try {
      for (const [, load] of MODULES) {
        const mod = await load();
        for (const [k, v] of Object.entries(mod)) {
          if (k.startsWith('register') && typeof v === 'function') (v as () => void)();
        }
        for (const facet of facetsOf(mod)) {
          if (!isPiece(facet)) continue;
          const counter = { n: 0 };
          if (typeof facet.projector === 'string') countEmits(facet.projector, counter);
          const container = document.createElement('div');
          document.body.appendChild(container);
          handles.push(runFacet(facet, container));
          rows.push({ id: facet.id, container, counter });
        }
      }

      // 자동 재생이 끝나기를 기다린다. 고정 시간으로 기다리던 때가 있었는데,
      // 그 수가 곧 조각의 길이 상한이 되어 버렸다 — 그래프 조각 배치에서 가장 긴
      // 것이 15.8초로 18초에 2초를 남기고 붙었다. 조각이 얼마나 길지는 저작
      // 결정이므로 검사가 그것을 제한하면 안 된다.
      //
      // 그래서 **발신이 멎는 것**을 본다. 모든 조각의 누적 발신 수를 재고, 한동안
      // 아무도 새로 내보내지 않으면 자동 재생이 다 끝난 것이다. 상한을 두어
      // 영원히 도는 조각이 있어도 검사가 매달리지는 않게 한다.
      settled = await settle(rows, 3_000, 90_000);

      for (const r of rows) {
        const btn = r.container.querySelector<HTMLButtonElement>('button[data-control-id="advance"]');
        if (!btn) {
          noButton.push(r.id);
          continue;
        }
        r.counter.n = 0; // 여기서부터가 첫 누름의 몫이다.
        btn.click();
      }

      await delay(2_500);

      for (const r of rows) {
        if (noButton.includes(r.id)) continue;
        if (r.counter.n === 0) deaf.push(r.id);
        else if (r.counter.n === 1) stalled.push(`${r.id} (발신 1)`);
      }
    } finally {
      for (const h of handles) h.destroy();
      console.error = original;
    }

    // 컨트롤 모양으로 고른 수와 소스의 `@piece` 표식 수가 같아야 한다.
    // 어긋나면 컨트롤이 규범을 벗어난 조각이 있다는 뜻이고, 그 조각은 이
    // 검사에서 스스로를 지운 채 통과하고 있었다는 뜻이다.
    expect(rows.length).toBe(PIECE_MARKED_COUNT);
    // 멎지 않은 채 눌렀다면 아래 셋이 비어 있어도 그것을 통과라 부를 수 없다.
    expect(settled).toBe(true);
    expect({ stalled, deaf, noButton }).toEqual({ stalled: [], deaf: [], noButton: [] });
  }, 120_000);
});
