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
 * (`CONTROL_SET.piece`). 새 조각을 만들면 아래 목록에 한 줄 보탠다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runFacet, clearRegistry } from '../src/runtime/index.js';
import { getProjector, registerProjector } from '../src/runtime/registry.js';
import type { FacetJson } from '../src/types/facet-json.js';
import type { FacetRunHandle } from '../src/runtime/runner.js';

const MODULES: Array<[string, () => Promise<Record<string, unknown>>]> = [
  ['facets/compilers/tokenization/src/index.ts', () => import('../../../facets/compilers/tokenization/src/index.js')],
  ['facets/cs-fundamentals/adjacency-list-vs-matrix/src/index.ts', () => import('../../../facets/cs-fundamentals/adjacency-list-vs-matrix/src/index.js')],
  ['facets/cs-fundamentals/array-as-tree/src/index.ts', () => import('../../../facets/cs-fundamentals/array-as-tree/src/index.js')],
  ['facets/cs-fundamentals/array/src/index.ts', () => import('../../../facets/cs-fundamentals/array/src/index.js')],
  ['facets/cs-fundamentals/avl-tree/src/index.ts', () => import('../../../facets/cs-fundamentals/avl-tree/src/index.js')],
  ['facets/cs-fundamentals/b-tree/src/index.ts', () => import('../../../facets/cs-fundamentals/b-tree/src/index.js')],
  ['facets/cs-fundamentals/bfs/src/index.ts', () => import('../../../facets/cs-fundamentals/bfs/src/index.js')],
  ['facets/cs-fundamentals/black-height-equal/src/index.ts', () => import('../../../facets/cs-fundamentals/black-height-equal/src/index.js')],
  ['facets/cs-fundamentals/bst-compare-and-go/src/index.ts', () => import('../../../facets/cs-fundamentals/bst-compare-and-go/src/index.js')],
  ['facets/cs-fundamentals/bst-degenerate/src/index.ts', () => import('../../../facets/cs-fundamentals/bst-degenerate/src/index.js')],
  ['facets/cs-fundamentals/bst-inorder-sorted/src/index.ts', () => import('../../../facets/cs-fundamentals/bst-inorder-sorted/src/index.js')],
  ['facets/cs-fundamentals/bst/src/index.ts', () => import('../../../facets/cs-fundamentals/bst/src/index.js')],
  ['facets/cs-fundamentals/bubble-adjacent-swap/src/index.ts', () => import('../../../facets/cs-fundamentals/bubble-adjacent-swap/src/index.js')],
  ['facets/cs-fundamentals/bubble-sort/src/index.ts', () => import('../../../facets/cs-fundamentals/bubble-sort/src/index.js')],
  ['facets/cs-fundamentals/chaining-bucket/src/index.ts', () => import('../../../facets/cs-fundamentals/chaining-bucket/src/index.js')],
  ['facets/cs-fundamentals/circular-buffer-wrap/src/index.ts', () => import('../../../facets/cs-fundamentals/circular-buffer-wrap/src/index.js')],
  ['facets/cs-fundamentals/compare-and-swap/src/index.ts', () => import('../../../facets/cs-fundamentals/compare-and-swap/src/index.js')],
  ['facets/cs-fundamentals/count-then-place/src/index.ts', () => import('../../../facets/cs-fundamentals/count-then-place/src/index.js')],
  ['facets/cs-fundamentals/depth-doubles-count/src/index.ts', () => import('../../../facets/cs-fundamentals/depth-doubles-count/src/index.js')],
  ['facets/cs-fundamentals/deque-both-ends/src/index.ts', () => import('../../../facets/cs-fundamentals/deque-both-ends/src/index.js')],
  ['facets/cs-fundamentals/digit-by-digit/src/index.ts', () => import('../../../facets/cs-fundamentals/digit-by-digit/src/index.js')],
  ['facets/cs-fundamentals/divide-conquer-combine/src/index.ts', () => import('../../../facets/cs-fundamentals/divide-conquer-combine/src/index.js')],
  ['facets/cs-fundamentals/enqueue-dequeue-ends/src/index.ts', () => import('../../../facets/cs-fundamentals/enqueue-dequeue-ends/src/index.js')],
  ['facets/cs-fundamentals/find-root/src/index.ts', () => import('../../../facets/cs-fundamentals/find-root/src/index.js')],
  ['facets/cs-fundamentals/gap-shrink/src/index.ts', () => import('../../../facets/cs-fundamentals/gap-shrink/src/index.js')],
  ['facets/cs-fundamentals/grow-and-copy/src/index.ts', () => import('../../../facets/cs-fundamentals/grow-and-copy/src/index.js')],
  ['facets/cs-fundamentals/guess-by-value/src/index.ts', () => import('../../../facets/cs-fundamentals/guess-by-value/src/index.js')],
  ['facets/cs-fundamentals/halve-the-range/src/index.ts', () => import('../../../facets/cs-fundamentals/halve-the-range/src/index.js')],
  ['facets/cs-fundamentals/hash-table-chaining/src/index.ts', () => import('../../../facets/cs-fundamentals/hash-table-chaining/src/index.js')],
  ['facets/cs-fundamentals/hash-to-bucket/src/index.ts', () => import('../../../facets/cs-fundamentals/hash-to-bucket/src/index.js')],
  ['facets/cs-fundamentals/heap-binary/src/index.ts', () => import('../../../facets/cs-fundamentals/heap-binary/src/index.js')],
  ['facets/cs-fundamentals/heap-property/src/index.ts', () => import('../../../facets/cs-fundamentals/heap-property/src/index.js')],
  ['facets/cs-fundamentals/heap-sort-extract/src/index.ts', () => import('../../../facets/cs-fundamentals/heap-sort-extract/src/index.js')],
  ['facets/cs-fundamentals/height-balance-check/src/index.ts', () => import('../../../facets/cs-fundamentals/height-balance-check/src/index.js')],
  ['facets/cs-fundamentals/height-stays-low/src/index.ts', () => import('../../../facets/cs-fundamentals/height-stays-low/src/index.js')],
  ['facets/cs-fundamentals/in-place-vs-extra/src/index.ts', () => import('../../../facets/cs-fundamentals/in-place-vs-extra/src/index.js')],
  ['facets/cs-fundamentals/index-address-calc/src/index.ts', () => import('../../../facets/cs-fundamentals/index-address-calc/src/index.js')],
  ['facets/cs-fundamentals/insert-into-sorted-part/src/index.ts', () => import('../../../facets/cs-fundamentals/insert-into-sorted-part/src/index.js')],
  ['facets/cs-fundamentals/linked-list-singly/src/index.ts', () => import('../../../facets/cs-fundamentals/linked-list-singly/src/index.js')],
  ['facets/cs-fundamentals/load-factor-rehash/src/index.ts', () => import('../../../facets/cs-fundamentals/load-factor-rehash/src/index.js')],
  ['facets/cs-fundamentals/lost-link/src/index.ts', () => import('../../../facets/cs-fundamentals/lost-link/src/index.js')],
  ['facets/cs-fundamentals/lru-cache/src/index.ts', () => import('../../../facets/cs-fundamentals/lru-cache/src/index.js')],
  ['facets/cs-fundamentals/merge-two-sorted/src/index.ts', () => import('../../../facets/cs-fundamentals/merge-two-sorted/src/index.js')],
  ['facets/cs-fundamentals/node-holds-many/src/index.ts', () => import('../../../facets/cs-fundamentals/node-holds-many/src/index.js')],
  ['facets/cs-fundamentals/node-points-next/src/index.ts', () => import('../../../facets/cs-fundamentals/node-points-next/src/index.js')],
  ['facets/cs-fundamentals/open-addressing-probe/src/index.ts', () => import('../../../facets/cs-fundamentals/open-addressing-probe/src/index.js')],
  ['facets/cs-fundamentals/out-of-bounds/src/index.ts', () => import('../../../facets/cs-fundamentals/out-of-bounds/src/index.js')],
  ['facets/cs-fundamentals/overlapping-subproblems/src/index.ts', () => import('../../../facets/cs-fundamentals/overlapping-subproblems/src/index.js')],
  ['facets/cs-fundamentals/parent-two-children/src/index.ts', () => import('../../../facets/cs-fundamentals/parent-two-children/src/index.js')],
  ['facets/cs-fundamentals/partition-around-pivot/src/index.ts', () => import('../../../facets/cs-fundamentals/partition-around-pivot/src/index.js')],
  ['facets/cs-fundamentals/path-compression/src/index.ts', () => import('../../../facets/cs-fundamentals/path-compression/src/index.js')],
  ['facets/cs-fundamentals/pivot-choice-matters/src/index.ts', () => import('../../../facets/cs-fundamentals/pivot-choice-matters/src/index.js')],
  ['facets/cs-fundamentals/push-pop-top/src/index.ts', () => import('../../../facets/cs-fundamentals/push-pop-top/src/index.js')],
  ['facets/cs-fundamentals/queue-fifo/src/index.ts', () => import('../../../facets/cs-fundamentals/queue-fifo/src/index.js')],
  ['facets/cs-fundamentals/recolor-then-rotate/src/index.ts', () => import('../../../facets/cs-fundamentals/recolor-then-rotate/src/index.js')],
  ['facets/cs-fundamentals/red-black-tree/src/index.ts', () => import('../../../facets/cs-fundamentals/red-black-tree/src/index.js')],
  ['facets/cs-fundamentals/relink-insert/src/index.ts', () => import('../../../facets/cs-fundamentals/relink-insert/src/index.js')],
  ['facets/cs-fundamentals/requires-sorted/src/index.ts', () => import('../../../facets/cs-fundamentals/requires-sorted/src/index.js')],
  ['facets/cs-fundamentals/rotate-to-balance/src/index.ts', () => import('../../../facets/cs-fundamentals/rotate-to-balance/src/index.js')],
  ['facets/cs-fundamentals/scan-until-found/src/index.ts', () => import('../../../facets/cs-fundamentals/scan-until-found/src/index.js')],
  ['facets/cs-fundamentals/select-min-each-pass/src/index.ts', () => import('../../../facets/cs-fundamentals/select-min-each-pass/src/index.js')],
  ['facets/cs-fundamentals/share-prefix-path/src/index.ts', () => import('../../../facets/cs-fundamentals/share-prefix-path/src/index.js')],
  ['facets/cs-fundamentals/shift-on-insert/src/index.ts', () => import('../../../facets/cs-fundamentals/shift-on-insert/src/index.js')],
  ['facets/cs-fundamentals/shift-on-remove/src/index.ts', () => import('../../../facets/cs-fundamentals/shift-on-remove/src/index.js')],
  ['facets/cs-fundamentals/sift-down/src/index.ts', () => import('../../../facets/cs-fundamentals/sift-down/src/index.js')],
  ['facets/cs-fundamentals/sift-up/src/index.ts', () => import('../../../facets/cs-fundamentals/sift-up/src/index.js')],
  ['facets/cs-fundamentals/sort-stability/src/index.ts', () => import('../../../facets/cs-fundamentals/sort-stability/src/index.js')],
  ['facets/cs-fundamentals/split-until-one/src/index.ts', () => import('../../../facets/cs-fundamentals/split-until-one/src/index.js')],
  ['facets/cs-fundamentals/split-when-full/src/index.ts', () => import('../../../facets/cs-fundamentals/split-when-full/src/index.js')],
  ['facets/cs-fundamentals/stack/src/index.ts', () => import('../../../facets/cs-fundamentals/stack/src/index.js')],
  ['facets/cs-fundamentals/traversal-order/src/index.ts', () => import('../../../facets/cs-fundamentals/traversal-order/src/index.js')],
  ['facets/cs-fundamentals/traverse-from-head/src/index.ts', () => import('../../../facets/cs-fundamentals/traverse-from-head/src/index.js')],
  ['facets/cs-fundamentals/trie/src/index.ts', () => import('../../../facets/cs-fundamentals/trie/src/index.js')],
  ['facets/cs-fundamentals/union-by-rank/src/index.ts', () => import('../../../facets/cs-fundamentals/union-by-rank/src/index.js')],
  ['facets/cs-fundamentals/union-find/src/index.ts', () => import('../../../facets/cs-fundamentals/union-find/src/index.js')],
  ['facets/cs-fundamentals/walk-per-character/src/index.ts', () => import('../../../facets/cs-fundamentals/walk-per-character/src/index.js')],
  ['facets/database/relational-tables-and-keys/src/index.ts', () => import('../../../facets/database/relational-tables-and-keys/src/index.js')],
  ['facets/graphics/matrix-transform-2d/src/index.ts', () => import('../../../facets/graphics/matrix-transform-2d/src/index.js')],
  ['facets/ml-basics/linear-regression/src/index.ts', () => import('../../../facets/ml-basics/linear-regression/src/index.js')],
  ['facets/network/ip-routing/src/index.ts', () => import('../../../facets/network/ip-routing/src/index.js')],
  ['facets/os/context-switching/src/index.ts', () => import('../../../facets/os/context-switching/src/index.js')],
  ['facets/programming-fundamentals/conditional-statement/src/index.ts', () => import('../../../facets/programming-fundamentals/conditional-statement/src/index.js')],
  ['facets/security/asymmetric-rsa/src/index.ts', () => import('../../../facets/security/asymmetric-rsa/src/index.js')],
  ['facets/security/hash-avalanche/src/index.ts', () => import('../../../facets/security/hash-avalanche/src/index.js')],
  ['facets/security/hash-chain/src/index.ts', () => import('../../../facets/security/hash-chain/src/index.js')],
  ['facets/security/hash-fixed-length/src/index.ts', () => import('../../../facets/security/hash-fixed-length/src/index.js')],
  ['facets/security/hash-integrity-check/src/index.ts', () => import('../../../facets/security/hash-integrity-check/src/index.js')],
  ['facets/security/hash-salt/src/index.ts', () => import('../../../facets/security/hash-salt/src/index.js')],
  ['facets/security/merkle-tree/src/index.ts', () => import('../../../facets/security/merkle-tree/src/index.js')],
  ['facets/security/pigeonhole-collision/src/index.ts', () => import('../../../facets/security/pigeonhole-collision/src/index.js')],
  ['facets/security/signature-key-direction/src/index.ts', () => import('../../../facets/security/signature-key-direction/src/index.js')],
  ['facets/security/signature-on-hash/src/index.ts', () => import('../../../facets/security/signature-on-hash/src/index.js')],
  ['facets/system-design/caching-cdn/src/index.ts', () => import('../../../facets/system-design/caching-cdn/src/index.js')],
  ['facets/system-design/messaging-pubsub/src/index.ts', () => import('../../../facets/system-design/messaging-pubsub/src/index.js')],
];
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

      // 자동 재생이 끝나기를 기다린다. 전부 동시에 굴러가므로 가장 긴 것에 맞춘다.
      // 가장 긴 조각의 자동 재생보다 넉넉해야 한다. 같으면 그 조각의
      // 마지막 걸음과 누름이 겹쳐 첫 누름의 뜻이 흐려진다.
      await delay(18_000);

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

    expect(rows.length).toBeGreaterThan(0);
    expect({ stalled, deaf, noButton }).toEqual({ stalled: [], deaf: [], noButton: [] });
  }, 45_000);
});
