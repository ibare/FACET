/**
 * 스크럽 축 2 감사 — 되짚는 동안 화면이 깨지는 조각을 가려낸다.
 *
 * 몰아 먹인 걸음마다 애니메이션이 하나씩 떠서 같은 요소에 서로 다른 값을 쓰면
 * 화면이 엉킨다. **되짚은 직후에는 멀쩡하다가 1 초쯤 뒤에 무너지므로** 눈으로
 * 훑어서는 못 가른다.
 *
 * 재는 법: 되짚은 **직후**의 그림과 **1.5 초 뒤**의 그림을 견준다. 다르면 지연
 * 발화가 덮어쓴 것이다.
 *
 * 왜 이 잣대가 CSS transition 을 오탐하지 않는가 — transition 은 DOM 속성을
 * 곧바로 목표값으로 두고 렌더링만 보간한다. 그래서 해시가 흔들리지 않는다. 반면
 * rAF tween 은 프레임마다 속성을 고쳐 쓰므로 해시가 계속 변한다. 잣대가 정확히
 * 겨냥한 것만 잡는다.
 *
 * happy-dom 으로는 잴 수 없어 실제 브라우저에서 돈다. CDP 가 `window.__audit` 을
 * 폴링한다 (scratchpad 의 `cdp-audit.mjs`).
 */
import { bootstrapFacet, getFacetCatalog } from '@ffacet/bootstrap';
import { loadFacet, runFacet, CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson, FacetRunHandle } from '@ffacet/core/runtime';

bootstrapFacet();

const pen = document.getElementById('pen');
const logEl = document.getElementById('log');
if (!pen || !logEl) throw new Error('마운트 지점을 찾지 못했다');

/** 컨트롤이 다시 보기 + 한 걸음(또는 띠) 뿐인 facet 이 조각이다 (S-piece). */
function isPiece(facet: FacetJson): boolean {
  for (const block of Object.values(facet.blocks)) {
    const spec = block as { type?: unknown; controls?: unknown };
    if (spec.type !== 'control-bar' || !Array.isArray(spec.controls)) continue;
    const actions = spec.controls.map((c) => (c as { action?: unknown }).action);
    return (
      actions.length === 2 &&
      actions.includes('reset') &&
      (actions.includes('advance') || actions.includes('seek'))
    );
  }
  return false;
}

/**
 * 띠를 단 꼴로 복제한다.
 *
 * 소스를 고치지 않고 재기 위해서다 — 지금 띠를 단 조각은 둘뿐인데, 축 2 는 띠가
 * 있어야 되짚기를 시킬 수 있다. 6 단계(전 조각 적용) 이전에 미리 재는 길이다.
 */
function withTimeline(facet: FacetJson): FacetJson {
  const blocks: FacetJson['blocks'] = {};
  for (const [ref, spec] of Object.entries(facet.blocks)) {
    blocks[ref] =
      (spec as { type?: unknown }).type === 'control-bar'
        ? { ...spec, controls: CONTROL_SET.pieceScrub }
        : spec;
  }
  return { ...facet, blocks };
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function shot(el: HTMLElement): string {
  return hash(
    Array.from(el.querySelectorAll('svg'))
      .map((s) => s.innerHTML)
      .join('\n'),
  );
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type Result = { id: string; verdict: 'stable' | 'drifts' | 'no-timeline' | 'never-settled'; steps?: number };

const audit = {
  results: [] as Result[],
  done: false,
  current: '',
  total: 0,
};
(window as unknown as { __audit: typeof audit }).__audit = audit;

function render(): void {
  const drift = audit.results.filter((r) => r.verdict === 'drifts');
  logEl!.textContent =
    `${audit.results.length} / ${audit.total}   ${audit.current}\n` +
    `흔들림 ${drift.length}\n` +
    drift.map((r) => `  ${r.id}`).join('\n');
}

/** 한 조각을 재고 판정을 돌려준다. */
async function measureOne(facet: FacetJson): Promise<Result> {
  const box = document.createElement('div');
  pen!.appendChild(box);
  let handle: FacetRunHandle | null = null;
  try {
    handle = runFacet(withTimeline(facet), box);
    const track = (): Element | null =>
      box.querySelector('.facet-control-bar__timeline [role="slider"]');
    if (!track()) return { id: facet.id, verdict: 'no-timeline' };

    // 자동 재생 완주 — 띠가 열리면 끝난 것이다.
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (track()?.getAttribute('tabindex') === '0') break;
      await sleep(200);
    }
    const t = track();
    if (t?.getAttribute('tabindex') !== '0') return { id: facet.id, verdict: 'never-settled' };

    // 마지막 걸음의 지연 발화가 앉기를 기다린다.
    await sleep(1_500);
    const n = Number(t.getAttribute('aria-valuemax') ?? 0);
    const k = Math.max(1, Math.floor(n / 2));

    // 절반으로 되짚는다.
    for (let i = 0; i < n - k; i++) {
      t.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    }

    // 되짚기는 한 묶음이라 두 프레임이면 끝난다.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const after = shot(box);
    await sleep(1_500);
    const later = shot(box);

    return { id: facet.id, verdict: after === later ? 'stable' : 'drifts', steps: n };
  } finally {
    handle?.destroy();
    box.remove();
  }
}

async function main(): Promise<void> {
  const catalog = getFacetCatalog();
  const q = new URLSearchParams(location.search);
  const only = (q.get('only') ?? '').split(',').filter(Boolean);
  const limit = Number(q.get('limit') ?? '0');
  const ids = only.length
    ? only
    : (limit > 0 ? catalog.slice(0, limit) : catalog).map((e) => e.id);
  audit.total = ids.length;
  render();

  for (const id of ids) {
    audit.current = id;
    render();
    const facet = await loadFacet(id);
    if (!facet || !isPiece(facet)) {
      audit.total -= 1;
      continue;
    }
    try {
      audit.results.push(await measureOne(facet));
    } catch {
      audit.results.push({ id, verdict: 'never-settled' });
    }
    render();
  }
  audit.done = true;
  audit.current = '끝';
  render();
}

void main();
