/**
 * 스크럽 띠 — 붙였을 때 실제로 도는가.
 *
 * `scrub-replay` 가 "되감고 다시 먹인 화면이 순방향과 같다" 는 **전제**를 조각
 * 전수로 쟀다면, 여기서는 그 전제 위에 세운 **장치**를 잰다. 러너의 `Timeline` 이
 * 자취를 적고, control-bar 의 띠가 그것을 받아 끌 수 있게 되고, 끌면 화면이
 * 그 걸음으로 가는가.
 */
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runFacet, clearRegistry } from '../src/runtime/index.js';
import { FACET_MODULES, FACET_ONLY } from './facet-modules.js';
import { getFacetById } from '../src/runtime/registry.js';
import type { FacetRunHandle } from '../src/runtime/runner.js';

/** 조각 하나만 쓰므로 그 모듈만 찾아 등록한다 — 전수를 띄우면 타이머가 서로 밀린다. */
async function registerOne(slug: string): Promise<void> {
  for (const [path, load] of FACET_MODULES) {
    if (!path.includes(`/${slug}/`)) continue;
    const mod = await load();
    for (const [k, v] of Object.entries(mod)) {
      if (k.startsWith('register') && typeof v === 'function') (v as () => void)();
    }
    return;
  }
  throw new Error(`조각 모듈을 찾지 못했다: ${slug}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 자동 재생이 완주해 띠를 끌 수 있게 될 때까지 기다린다. */
async function untilSeekable(track: () => Element | null, capMs = 30_000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < capMs) {
    const el = track();
    if (el && el.getAttribute('tabindex') === '0') return true;
    await delay(100);
  }
  return false;
}

// `FACET_ONLY` 로 좁혀 돌릴 때 이 검사가 쓰는 조각이 빠지면 건너뛴다 — 좁힌 실행의 대상이 아니다.
describe.skipIf(FACET_ONLY !== null && !FACET_ONLY.includes('hash-avalanche'))('스크럽 띠', () => {
  let container: HTMLElement;
  let handle: FacetRunHandle | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('자취를 적고, 끌 수 있게 되고, 끌면 그 걸음으로 간다', async () => {
    clearRegistry();
    await registerOne('hash-avalanche');
    const facet = getFacetById('facet:hashAvalanche');
    expect(facet).toBeTruthy();
    if (!facet) return;

    handle = runFacet(facet, container);
    const trackOf = (): Element | null =>
      container.querySelector('.facet-control-bar__timeline [role="slider"]');

    // ── 띠가 서 있다.
    const track = trackOf();
    expect(track).toBeTruthy();
    if (!track) return;

    // ── 자동 재생이 완주하면 끌 수 있게 된다.
    expect(await untilSeekable(trackOf)).toBe(true);

    const total = Number(track.getAttribute('aria-valuemax'));
    // init + 네 걸음 (algorithm.ts 의 STEP_COUNT).
    expect(total).toBe(5);
    expect(Number(track.getAttribute('aria-valuenow'))).toBe(total);

    const stage = container.querySelector('svg');
    expect(stage).toBeTruthy();
    if (!stage) return;
    // 마지막 걸음의 칠이 끝나기를 기다린다. avalanche-stage 는 격자를 행마다
    // 40ms 씩 미뤄 칠하므로 (`PAINT_ROW_MS`), 완주 직후의 화면은 아직 칠하는
    // 중이다. 그 상태를 견줄 잣대로 삼으면 스크럽이 아니라 시점을 재게 된다.
    await delay(1_200);
    const atEnd = stage.innerHTML;

    // ── 뒤로 끈다. 화면이 실제로 바뀐다.
    //
    // 좌표가 아니라 키로 끈다. happy-dom 은 레이아웃을 셈하지 않아
    // `getBoundingClientRect` 가 전부 0 이라 포인터 경로는 여기서 잴 수 없다.
    // 키 경로는 같은 `moveTo` 로 들어가므로 재는 것은 다르지 않고, 그 자체가
    // 갖춰야 할 접근성 경로다. 끄는 감각 자체는 브라우저에서 눈으로 본다.
    const press = (key: string): void => {
      track.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    };
    for (let i = 0; i < 3; i++) press('ArrowLeft');
    await delay(600);

    expect(Number(track.getAttribute('aria-valuenow'))).toBe(2);
    const atTwo = stage.innerHTML;
    expect(atTwo).not.toBe(atEnd);

    // ── 다시 앞으로 끌면 끝 화면으로 돌아온다.
    press('End');
    await delay(2_500);

    expect(Number(track.getAttribute('aria-valuenow'))).toBe(total);
    expect(stage.innerHTML).toBe(atEnd);
  }, 60_000);

  it('되돌리기는 자취를 버리고 띠를 다시 잠근다', async () => {
    clearRegistry();
    await registerOne('hash-avalanche');
    const facet = getFacetById('facet:hashAvalanche');
    if (!facet) return;

    handle = runFacet(facet, container);
    const trackOf = (): Element | null =>
      container.querySelector('.facet-control-bar__timeline [role="slider"]');
    expect(await untilSeekable(trackOf)).toBe(true);

    const replay = container.querySelector<HTMLButtonElement>('button[data-control-id="reset"]');
    expect(replay).toBeTruthy();
    replay?.click();
    await delay(300);

    const track = trackOf();
    expect(track?.getAttribute('tabindex')).toBe(null);
    // 자취를 버렸으니 다시 채워진다 — 곧 처음보다 길어지지 않는다.
    expect(await untilSeekable(trackOf)).toBe(true);
    expect(Number(trackOf()?.getAttribute('aria-valuemax'))).toBe(5);
  }, 60_000);

  afterEach(() => {
    handle?.destroy();
    handle = null;
    container.remove();
  });
});
