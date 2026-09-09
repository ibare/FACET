/**
 * CanvasView 는 러너가 붙여 준 캔버스를 떼어내지 않는다.
 *
 * 러너의 `mountView` 는 캔버스를 컨테이너에 **먼저** 붙이고 `mount` 를 부른다.
 * 그래서 view 가 방어적으로 `container.textContent = ''` 를 하면 그 캔버스가
 * 떨어져 나가고, view 는 DOM 에 없는 SVG 에 그림을 그리게 된다 — 타입도 통과하고
 * 예외도 안 나고 화면만 빈다. 실제로 CanvasView 로 옮기면서 열하나가 그렇게 됐고,
 * 그중 일곱은 발견되지 않은 채 커밋됐다.
 *
 * 눈으로는 못 잡는다. 그래서 여기서 전수로 잰다 — CanvasView 를 새로 만들면
 * 아래 목록에 한 줄 보태라. 비우고 싶으면 캔버스 안쪽(`params.canvas`)을 비우거나,
 * 컨테이너를 비웠으면 캔버스를 되붙여라 (S-view).
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView } from '../src/runtime/layout-builder.js';
import type { View } from '../src/views/types.js';

const MODULES: Array<[string, () => Promise<Record<string, unknown>>]> = [
  ['facets/compilers/tokenization/src/tokenization-stage.ts', () => import('../../../facets/compilers/tokenization/src/tokenization-stage.js')],
  ['facets/cs-fundamentals/adjacency-list-vs-matrix/src/adjacency-list-vs-matrix-stage.ts', () => import('../../../facets/cs-fundamentals/adjacency-list-vs-matrix/src/adjacency-list-vs-matrix-stage.js')],
  ['facets/cs-fundamentals/array-as-tree/src/array-as-tree-stage.ts', () => import('../../../facets/cs-fundamentals/array-as-tree/src/array-as-tree-stage.js')],
  ['facets/cs-fundamentals/array/src/array-stage.ts', () => import('../../../facets/cs-fundamentals/array/src/array-stage.js')],
  ['facets/cs-fundamentals/avl-tree/src/avl-tree-stage.ts', () => import('../../../facets/cs-fundamentals/avl-tree/src/avl-tree-stage.js')],
  ['facets/cs-fundamentals/b-tree/src/b-tree-stage.ts', () => import('../../../facets/cs-fundamentals/b-tree/src/b-tree-stage.js')],
  ['facets/cs-fundamentals/backtracking/src/backtracking-stage.ts', () => import('../../../facets/cs-fundamentals/backtracking/src/backtracking-stage.js')],
  ['facets/cs-fundamentals/binary-search/src/binary-search-stage.ts', () => import('../../../facets/cs-fundamentals/binary-search/src/binary-search-stage.js')],
  ['facets/cs-fundamentals/black-height-equal/src/black-height-equal-stage.ts', () => import('../../../facets/cs-fundamentals/black-height-equal/src/black-height-equal-stage.js')],
  ['facets/cs-fundamentals/bottom-up-table/src/bottom-up-table-stage.ts', () => import('../../../facets/cs-fundamentals/bottom-up-table/src/bottom-up-table-stage.js')],
  ['facets/cs-fundamentals/bound-and-cut/src/bound-and-cut-stage.ts', () => import('../../../facets/cs-fundamentals/bound-and-cut/src/bound-and-cut-stage.js')],
  ['facets/cs-fundamentals/branch-and-bound/src/branch-and-bound-stage.ts', () => import('../../../facets/cs-fundamentals/branch-and-bound/src/branch-and-bound-stage.js')],
  ['facets/cs-fundamentals/bst-compare-and-go/src/bst-compare-and-go-stage.ts', () => import('../../../facets/cs-fundamentals/bst-compare-and-go/src/bst-compare-and-go-stage.js')],
  ['facets/cs-fundamentals/bst-degenerate/src/bst-degenerate-stage.ts', () => import('../../../facets/cs-fundamentals/bst-degenerate/src/bst-degenerate-stage.js')],
  ['facets/cs-fundamentals/bst-inorder-sorted/src/bst-inorder-sorted-stage.ts', () => import('../../../facets/cs-fundamentals/bst-inorder-sorted/src/bst-inorder-sorted-stage.js')],
  ['facets/cs-fundamentals/bubble-adjacent-swap/src/bubble-adjacent-swap-stage.ts', () => import('../../../facets/cs-fundamentals/bubble-adjacent-swap/src/bubble-adjacent-swap-stage.js')],
  ['facets/cs-fundamentals/chaining-bucket/src/chaining-bucket-stage.ts', () => import('../../../facets/cs-fundamentals/chaining-bucket/src/chaining-bucket-stage.js')],
  ['facets/cs-fundamentals/circular-buffer-wrap/src/circular-buffer-wrap-stage.ts', () => import('../../../facets/cs-fundamentals/circular-buffer-wrap/src/circular-buffer-wrap-stage.js')],
  ['facets/cs-fundamentals/compare-and-swap/src/compare-and-swap-stage.ts', () => import('../../../facets/cs-fundamentals/compare-and-swap/src/compare-and-swap-stage.js')],
  ['facets/cs-fundamentals/count-then-place/src/count-then-place-stage.ts', () => import('../../../facets/cs-fundamentals/count-then-place/src/count-then-place-stage.js')],
  ['facets/cs-fundamentals/counting-sort/src/counting-sort-stage.ts', () => import('../../../facets/cs-fundamentals/counting-sort/src/counting-sort-stage.js')],
  ['facets/cs-fundamentals/depth-doubles-count/src/depth-doubles-count-stage.ts', () => import('../../../facets/cs-fundamentals/depth-doubles-count/src/depth-doubles-count-stage.js')],
  ['facets/cs-fundamentals/deque-both-ends/src/deque-both-ends-stage.ts', () => import('../../../facets/cs-fundamentals/deque-both-ends/src/deque-both-ends-stage.js')],
  ['facets/cs-fundamentals/digit-by-digit/src/digit-by-digit-stage.ts', () => import('../../../facets/cs-fundamentals/digit-by-digit/src/digit-by-digit-stage.js')],
  ['facets/cs-fundamentals/divide-conquer-combine/src/divide-conquer-combine-stage.ts', () => import('../../../facets/cs-fundamentals/divide-conquer-combine/src/divide-conquer-combine-stage.js')],
  ['facets/cs-fundamentals/dynamic-programming/src/dynamic-programming-stage.ts', () => import('../../../facets/cs-fundamentals/dynamic-programming/src/dynamic-programming-stage.js')],
  ['facets/cs-fundamentals/enqueue-dequeue-ends/src/enqueue-dequeue-ends-stage.ts', () => import('../../../facets/cs-fundamentals/enqueue-dequeue-ends/src/enqueue-dequeue-ends-stage.js')],
  ['facets/cs-fundamentals/find-root/src/find-root-stage.ts', () => import('../../../facets/cs-fundamentals/find-root/src/find-root-stage.js')],
  ['facets/cs-fundamentals/gap-shrink/src/gap-shrink-stage.ts', () => import('../../../facets/cs-fundamentals/gap-shrink/src/gap-shrink-stage.js')],
  ['facets/cs-fundamentals/greedy-can-fail/src/greedy-can-fail-stage.ts', () => import('../../../facets/cs-fundamentals/greedy-can-fail/src/greedy-can-fail-stage.js')],
  ['facets/cs-fundamentals/greedy/src/greedy-stage.ts', () => import('../../../facets/cs-fundamentals/greedy/src/greedy-stage.js')],
  ['facets/cs-fundamentals/grow-and-copy/src/grow-and-copy-stage.ts', () => import('../../../facets/cs-fundamentals/grow-and-copy/src/grow-and-copy-stage.js')],
  ['facets/cs-fundamentals/guess-by-value/src/guess-by-value-stage.ts', () => import('../../../facets/cs-fundamentals/guess-by-value/src/guess-by-value-stage.js')],
  ['facets/cs-fundamentals/halve-the-range/src/halve-the-range-stage.ts', () => import('../../../facets/cs-fundamentals/halve-the-range/src/halve-the-range-stage.js')],
  ['facets/cs-fundamentals/hash-table-chaining/src/hash-table-stage.ts', () => import('../../../facets/cs-fundamentals/hash-table-chaining/src/hash-table-stage.js')],
  ['facets/cs-fundamentals/hash-to-bucket/src/hash-to-bucket-stage.ts', () => import('../../../facets/cs-fundamentals/hash-to-bucket/src/hash-to-bucket-stage.js')],
  ['facets/cs-fundamentals/heap-binary/src/heap-binary-stage.ts', () => import('../../../facets/cs-fundamentals/heap-binary/src/heap-binary-stage.js')],
  ['facets/cs-fundamentals/heap-property/src/heap-property-stage.ts', () => import('../../../facets/cs-fundamentals/heap-property/src/heap-property-stage.js')],
  ['facets/cs-fundamentals/heap-sort-extract/src/heap-sort-extract-stage.ts', () => import('../../../facets/cs-fundamentals/heap-sort-extract/src/heap-sort-extract-stage.js')],
  ['facets/cs-fundamentals/heap-sort/src/heap-sort-stage.ts', () => import('../../../facets/cs-fundamentals/heap-sort/src/heap-sort-stage.js')],
  ['facets/cs-fundamentals/height-balance-check/src/height-balance-check-stage.ts', () => import('../../../facets/cs-fundamentals/height-balance-check/src/height-balance-check-stage.js')],
  ['facets/cs-fundamentals/height-stays-low/src/height-stays-low-stage.ts', () => import('../../../facets/cs-fundamentals/height-stays-low/src/height-stays-low-stage.js')],
  ['facets/cs-fundamentals/in-place-vs-extra/src/in-place-vs-extra-stage.ts', () => import('../../../facets/cs-fundamentals/in-place-vs-extra/src/in-place-vs-extra-stage.js')],
  ['facets/cs-fundamentals/index-address-calc/src/address-calc-stage.ts', () => import('../../../facets/cs-fundamentals/index-address-calc/src/address-calc-stage.js')],
  ['facets/cs-fundamentals/insert-into-sorted-part/src/insert-into-sorted-part-stage.ts', () => import('../../../facets/cs-fundamentals/insert-into-sorted-part/src/insert-into-sorted-part-stage.js')],
  ['facets/cs-fundamentals/insertion-sort/src/insertion-sort-stage.ts', () => import('../../../facets/cs-fundamentals/insertion-sort/src/insertion-sort-stage.js')],
  ['facets/cs-fundamentals/interpolation-search/src/interpolation-search-stage.ts', () => import('../../../facets/cs-fundamentals/interpolation-search/src/interpolation-search-stage.js')],
  ['facets/cs-fundamentals/linear-search/src/linear-search-stage.ts', () => import('../../../facets/cs-fundamentals/linear-search/src/linear-search-stage.js')],
  ['facets/cs-fundamentals/linked-list-singly/src/linked-list-stage.ts', () => import('../../../facets/cs-fundamentals/linked-list-singly/src/linked-list-stage.js')],
  ['facets/cs-fundamentals/load-factor-rehash/src/load-factor-rehash-stage.ts', () => import('../../../facets/cs-fundamentals/load-factor-rehash/src/load-factor-rehash-stage.js')],
  ['facets/cs-fundamentals/lost-link/src/lost-link-stage.ts', () => import('../../../facets/cs-fundamentals/lost-link/src/lost-link-stage.js')],
  ['facets/cs-fundamentals/lru-cache/src/lru-cache-stage.ts', () => import('../../../facets/cs-fundamentals/lru-cache/src/lru-cache-stage.js')],
  ['facets/cs-fundamentals/memo-write-once/src/memo-write-once-stage.ts', () => import('../../../facets/cs-fundamentals/memo-write-once/src/memo-write-once-stage.js')],
  ['facets/cs-fundamentals/merge-sort/src/merge-sort-stage.ts', () => import('../../../facets/cs-fundamentals/merge-sort/src/merge-sort-stage.js')],
  ['facets/cs-fundamentals/merge-two-sorted/src/merge-two-sorted-stage.ts', () => import('../../../facets/cs-fundamentals/merge-two-sorted/src/merge-two-sorted-stage.js')],
  ['facets/cs-fundamentals/node-holds-many/src/node-holds-many-stage.ts', () => import('../../../facets/cs-fundamentals/node-holds-many/src/node-holds-many-stage.js')],
  ['facets/cs-fundamentals/node-points-next/src/node-points-next-stage.ts', () => import('../../../facets/cs-fundamentals/node-points-next/src/node-points-next-stage.js')],
  ['facets/cs-fundamentals/open-addressing-probe/src/open-addressing-probe-stage.ts', () => import('../../../facets/cs-fundamentals/open-addressing-probe/src/open-addressing-probe-stage.js')],
  ['facets/cs-fundamentals/out-of-bounds/src/out-of-bounds-stage.ts', () => import('../../../facets/cs-fundamentals/out-of-bounds/src/out-of-bounds-stage.js')],
  ['facets/cs-fundamentals/overlapping-subproblems/src/overlapping-subproblems-stage.ts', () => import('../../../facets/cs-fundamentals/overlapping-subproblems/src/overlapping-subproblems-stage.js')],
  ['facets/cs-fundamentals/parent-two-children/src/parent-two-children-stage.ts', () => import('../../../facets/cs-fundamentals/parent-two-children/src/parent-two-children-stage.js')],
  ['facets/cs-fundamentals/partition-around-pivot/src/partition-around-pivot-stage.ts', () => import('../../../facets/cs-fundamentals/partition-around-pivot/src/partition-around-pivot-stage.js')],
  ['facets/cs-fundamentals/path-compression/src/path-compression-stage.ts', () => import('../../../facets/cs-fundamentals/path-compression/src/path-compression-stage.js')],
  ['facets/cs-fundamentals/pivot-choice-matters/src/pivot-choice-matters-stage.ts', () => import('../../../facets/cs-fundamentals/pivot-choice-matters/src/pivot-choice-matters-stage.js')],
  ['facets/cs-fundamentals/prune-branch/src/prune-branch-stage.ts', () => import('../../../facets/cs-fundamentals/prune-branch/src/prune-branch-stage.js')],
  ['facets/cs-fundamentals/push-pop-top/src/push-pop-top-stage.ts', () => import('../../../facets/cs-fundamentals/push-pop-top/src/push-pop-top-stage.js')],
  ['facets/cs-fundamentals/quick-sort/src/quick-sort-stage.ts', () => import('../../../facets/cs-fundamentals/quick-sort/src/quick-sort-stage.js')],
  ['facets/cs-fundamentals/radix-sort/src/radix-sort-stage.ts', () => import('../../../facets/cs-fundamentals/radix-sort/src/radix-sort-stage.js')],
  ['facets/cs-fundamentals/recolor-then-rotate/src/recolor-then-rotate-stage.ts', () => import('../../../facets/cs-fundamentals/recolor-then-rotate/src/recolor-then-rotate-stage.js')],
  ['facets/cs-fundamentals/red-black-tree/src/red-black-tree-stage.ts', () => import('../../../facets/cs-fundamentals/red-black-tree/src/red-black-tree-stage.js')],
  ['facets/cs-fundamentals/relink-insert/src/relink-stage.ts', () => import('../../../facets/cs-fundamentals/relink-insert/src/relink-stage.js')],
  ['facets/cs-fundamentals/requires-sorted/src/requires-sorted-stage.ts', () => import('../../../facets/cs-fundamentals/requires-sorted/src/requires-sorted-stage.js')],
  ['facets/cs-fundamentals/rotate-to-balance/src/rotate-to-balance-stage.ts', () => import('../../../facets/cs-fundamentals/rotate-to-balance/src/rotate-to-balance-stage.js')],
  ['facets/cs-fundamentals/scan-until-found/src/scan-until-found-stage.ts', () => import('../../../facets/cs-fundamentals/scan-until-found/src/scan-until-found-stage.js')],
  ['facets/cs-fundamentals/select-min-each-pass/src/select-min-each-pass-stage.ts', () => import('../../../facets/cs-fundamentals/select-min-each-pass/src/select-min-each-pass-stage.js')],
  ['facets/cs-fundamentals/selection-sort/src/selection-sort-stage.ts', () => import('../../../facets/cs-fundamentals/selection-sort/src/selection-sort-stage.js')],
  ['facets/cs-fundamentals/share-prefix-path/src/share-prefix-path-stage.ts', () => import('../../../facets/cs-fundamentals/share-prefix-path/src/share-prefix-path-stage.js')],
  ['facets/cs-fundamentals/shell-sort/src/shell-sort-stage.ts', () => import('../../../facets/cs-fundamentals/shell-sort/src/shell-sort-stage.js')],
  ['facets/cs-fundamentals/shift-on-insert/src/shift-on-insert-stage.ts', () => import('../../../facets/cs-fundamentals/shift-on-insert/src/shift-on-insert-stage.js')],
  ['facets/cs-fundamentals/shift-on-remove/src/shift-on-remove-stage.ts', () => import('../../../facets/cs-fundamentals/shift-on-remove/src/shift-on-remove-stage.js')],
  ['facets/cs-fundamentals/sift-down/src/sift-down-stage.ts', () => import('../../../facets/cs-fundamentals/sift-down/src/sift-down-stage.js')],
  ['facets/cs-fundamentals/sift-up/src/sift-up-stage.ts', () => import('../../../facets/cs-fundamentals/sift-up/src/sift-up-stage.js')],
  ['facets/cs-fundamentals/sort-stability/src/sort-stability-stage.ts', () => import('../../../facets/cs-fundamentals/sort-stability/src/sort-stability-stage.js')],
  ['facets/cs-fundamentals/split-until-one/src/split-until-one-stage.ts', () => import('../../../facets/cs-fundamentals/split-until-one/src/split-until-one-stage.js')],
  ['facets/cs-fundamentals/split-when-full/src/split-when-full-stage.ts', () => import('../../../facets/cs-fundamentals/split-when-full/src/split-when-full-stage.js')],
  ['facets/cs-fundamentals/stack/src/stack-stage.ts', () => import('../../../facets/cs-fundamentals/stack/src/stack-stage.js')],
  ['facets/cs-fundamentals/take-best-now/src/take-best-now-stage.ts', () => import('../../../facets/cs-fundamentals/take-best-now/src/take-best-now-stage.js')],
  ['facets/cs-fundamentals/traversal-order/src/traversal-order-stage.ts', () => import('../../../facets/cs-fundamentals/traversal-order/src/traversal-order-stage.js')],
  ['facets/cs-fundamentals/traverse-from-head/src/traverse-from-head-stage.ts', () => import('../../../facets/cs-fundamentals/traverse-from-head/src/traverse-from-head-stage.js')],
  ['facets/cs-fundamentals/trie/src/trie-stage.ts', () => import('../../../facets/cs-fundamentals/trie/src/trie-stage.js')],
  ['facets/cs-fundamentals/try-and-undo/src/try-and-undo-stage.ts', () => import('../../../facets/cs-fundamentals/try-and-undo/src/try-and-undo-stage.js')],
  ['facets/cs-fundamentals/union-by-rank/src/union-by-rank-stage.ts', () => import('../../../facets/cs-fundamentals/union-by-rank/src/union-by-rank-stage.js')],
  ['facets/cs-fundamentals/union-find/src/union-find-stage.ts', () => import('../../../facets/cs-fundamentals/union-find/src/union-find-stage.js')],
  ['facets/cs-fundamentals/walk-per-character/src/walk-per-character-stage.ts', () => import('../../../facets/cs-fundamentals/walk-per-character/src/walk-per-character-stage.js')],
  ['facets/database/relational-tables-and-keys/src/tables-stage.ts', () => import('../../../facets/database/relational-tables-and-keys/src/tables-stage.js')],
  ['facets/graphics/matrix-transform-2d/src/matrix-transform-stage.ts', () => import('../../../facets/graphics/matrix-transform-2d/src/matrix-transform-stage.js')],
  ['facets/ml-basics/linear-regression/src/linear-regression-stage.ts', () => import('../../../facets/ml-basics/linear-regression/src/linear-regression-stage.js')],
  ['facets/network/ip-routing/src/ip-routing-stage.ts', () => import('../../../facets/network/ip-routing/src/ip-routing-stage.js')],
  ['facets/os/context-switching/src/context-switching-stage.ts', () => import('../../../facets/os/context-switching/src/context-switching-stage.js')],
  ['facets/programming-fundamentals/conditional-statement/src/conditional-statement-stage.ts', () => import('../../../facets/programming-fundamentals/conditional-statement/src/conditional-statement-stage.js')],
  ['facets/security/asymmetric-rsa/src/rsa-stage.ts', () => import('../../../facets/security/asymmetric-rsa/src/rsa-stage.js')],
  ['facets/security/hash-avalanche/src/avalanche-stage.ts', () => import('../../../facets/security/hash-avalanche/src/avalanche-stage.js')],
  ['facets/security/hash-chain/src/chain-stage.ts', () => import('../../../facets/security/hash-chain/src/chain-stage.js')],
  ['facets/security/hash-fixed-length/src/fixed-length-stage.ts', () => import('../../../facets/security/hash-fixed-length/src/fixed-length-stage.js')],
  ['facets/security/hash-integrity-check/src/integrity-stage.ts', () => import('../../../facets/security/hash-integrity-check/src/integrity-stage.js')],
  ['facets/security/hash-salt/src/salt-stage.ts', () => import('../../../facets/security/hash-salt/src/salt-stage.js')],
  ['facets/security/merkle-tree/src/merkle-stage.ts', () => import('../../../facets/security/merkle-tree/src/merkle-stage.js')],
  ['facets/security/pigeonhole-collision/src/pigeonhole-stage.ts', () => import('../../../facets/security/pigeonhole-collision/src/pigeonhole-stage.js')],
  ['facets/security/signature-key-direction/src/key-direction-stage.ts', () => import('../../../facets/security/signature-key-direction/src/key-direction-stage.js')],
  ['facets/security/signature-on-hash/src/sign-hash-stage.ts', () => import('../../../facets/security/signature-on-hash/src/sign-hash-stage.js')],
  ['facets/system-design/caching-cdn/src/cdn-stage.ts', () => import('../../../facets/system-design/caching-cdn/src/cdn-stage.js')],
  ['facets/system-design/messaging-pubsub/src/pubsub-stage.ts', () => import('../../../facets/system-design/messaging-pubsub/src/pubsub-stage.js')],
  ['packages/core/src/views/bar-chart.ts', () => import('../src/views/bar-chart.js')],
  ['packages/core/src/views/conveyor-queue.ts', () => import('../src/views/conveyor-queue.js')],
  ['packages/core/src/views/goal-preview.ts', () => import('../src/views/goal-preview.js')],
  ['packages/core/src/views/graph-layout.ts', () => import('../src/views/graph-layout.js')],
  ['packages/core/src/views/tree-layout.ts', () => import('../src/views/tree-layout.js')],
];

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
    expect(checked).toBeGreaterThan(40);
  });
});
