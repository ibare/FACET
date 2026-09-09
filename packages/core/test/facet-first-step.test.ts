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
 * 새 facet 을 만들면 아래 목록에 한 줄 보탠다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runFacet, clearRegistry } from '../src/runtime/index.js';
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
  ['facets/cs-fundamentals/bottom-up-table/src/index.ts', () => import('../../../facets/cs-fundamentals/bottom-up-table/src/index.js')],
  ['facets/cs-fundamentals/bound-and-cut/src/index.ts', () => import('../../../facets/cs-fundamentals/bound-and-cut/src/index.js')],
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
  ['facets/cs-fundamentals/greedy-can-fail/src/index.ts', () => import('../../../facets/cs-fundamentals/greedy-can-fail/src/index.js')],
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
  ['facets/cs-fundamentals/memo-write-once/src/index.ts', () => import('../../../facets/cs-fundamentals/memo-write-once/src/index.js')],
  ['facets/cs-fundamentals/merge-sort/src/index.ts', () => import('../../../facets/cs-fundamentals/merge-sort/src/index.js')],
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
  ['facets/cs-fundamentals/prune-branch/src/index.ts', () => import('../../../facets/cs-fundamentals/prune-branch/src/index.js')],
  ['facets/cs-fundamentals/push-pop-top/src/index.ts', () => import('../../../facets/cs-fundamentals/push-pop-top/src/index.js')],
  ['facets/cs-fundamentals/queue-fifo/src/index.ts', () => import('../../../facets/cs-fundamentals/queue-fifo/src/index.js')],
  ['facets/cs-fundamentals/quick-sort/src/index.ts', () => import('../../../facets/cs-fundamentals/quick-sort/src/index.js')],
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
  ['facets/cs-fundamentals/take-best-now/src/index.ts', () => import('../../../facets/cs-fundamentals/take-best-now/src/index.js')],
  ['facets/cs-fundamentals/traversal-order/src/index.ts', () => import('../../../facets/cs-fundamentals/traversal-order/src/index.js')],
  ['facets/cs-fundamentals/traverse-from-head/src/index.ts', () => import('../../../facets/cs-fundamentals/traverse-from-head/src/index.js')],
  ['facets/cs-fundamentals/trie/src/index.ts', () => import('../../../facets/cs-fundamentals/trie/src/index.js')],
  ['facets/cs-fundamentals/try-and-undo/src/index.ts', () => import('../../../facets/cs-fundamentals/try-and-undo/src/index.js')],
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

    try {
      const mounted: Array<[string, HTMLElement]> = [];

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

    expect(errors).toEqual([]);
    expect(blank).toEqual([]);
  }, 30_000);
});
