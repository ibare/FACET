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
 * 새 facet 을 만들면 아래 목록에 한 줄 보탠다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { clearRegistry, getAlgorithm, getProjector } from '../src/runtime/registry.js';
import type { FacetJson } from '../src/types/facet-json.js';

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

    expect(checked).toBeGreaterThan(0);
    expect({ collided, missing }).toEqual({ collided: [], missing: [] });
  });
});
