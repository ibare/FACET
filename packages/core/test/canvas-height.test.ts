/**
 * facet 의 세로는 마운트한 뒤 바뀌지 않는다.
 *
 * 호스트(Tiptap NodeView)는 높이를 정하지 않는다 — SVG 의 viewBox 비율이 그대로
 * 문서에서의 높이가 된다. 그래서 재생 중에 viewBox 를 다시 재면 **글 안에 박힌
 * 그림의 위아래 문단이 밀린다.** 읽는 사람에게는 글이 흔들리는 것으로 보인다.
 *
 * 내용에 따라 커지는 그림(나무가 깊어지는 힙·유니온파인드 같은 것)은 흔한 깊이
 * 만큼 미리 자리를 잡아 두고, 넘치면 층 간격을 줄여 담는다. 높이를 늘리지 않는다.
 *
 * 실제로 완제품 둘이 그랬다 — heapBinary 229→291, unionFind 80→260.
 *
 * 새 facet 을 만들면 아래 목록에 한 줄 보탠다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runFacet, clearRegistry } from '../src/runtime/index.js';
import type { FacetJson } from '../src/types/facet-json.js';
import type { RunHandle } from '../src/runtime/runner.js';

const MODULES: Array<[string, () => Promise<Record<string, unknown>>]> = [
  ['facets/compilers/tokenization/src/index.ts', () => import('../../../facets/compilers/tokenization/src/index.js')],
  ['facets/cs-fundamentals/adjacency-list-vs-matrix/src/index.ts', () => import('../../../facets/cs-fundamentals/adjacency-list-vs-matrix/src/index.js')],
  ['facets/cs-fundamentals/array-as-tree/src/index.ts', () => import('../../../facets/cs-fundamentals/array-as-tree/src/index.js')],
  ['facets/cs-fundamentals/array/src/index.ts', () => import('../../../facets/cs-fundamentals/array/src/index.js')],
  ['facets/cs-fundamentals/b-tree/src/index.ts', () => import('../../../facets/cs-fundamentals/b-tree/src/index.js')],
  ['facets/cs-fundamentals/bfs/src/index.ts', () => import('../../../facets/cs-fundamentals/bfs/src/index.js')],
  ['facets/cs-fundamentals/black-height-equal/src/index.ts', () => import('../../../facets/cs-fundamentals/black-height-equal/src/index.js')],
  ['facets/cs-fundamentals/bst-compare-and-go/src/index.ts', () => import('../../../facets/cs-fundamentals/bst-compare-and-go/src/index.js')],
  ['facets/cs-fundamentals/bst-degenerate/src/index.ts', () => import('../../../facets/cs-fundamentals/bst-degenerate/src/index.js')],
  ['facets/cs-fundamentals/bst-inorder-sorted/src/index.ts', () => import('../../../facets/cs-fundamentals/bst-inorder-sorted/src/index.js')],
  ['facets/cs-fundamentals/bst/src/index.ts', () => import('../../../facets/cs-fundamentals/bst/src/index.js')],
  ['facets/cs-fundamentals/bubble-sort/src/index.ts', () => import('../../../facets/cs-fundamentals/bubble-sort/src/index.js')],
  ['facets/cs-fundamentals/chaining-bucket/src/index.ts', () => import('../../../facets/cs-fundamentals/chaining-bucket/src/index.js')],
  ['facets/cs-fundamentals/circular-buffer-wrap/src/index.ts', () => import('../../../facets/cs-fundamentals/circular-buffer-wrap/src/index.js')],
  ['facets/cs-fundamentals/depth-doubles-count/src/index.ts', () => import('../../../facets/cs-fundamentals/depth-doubles-count/src/index.js')],
  ['facets/cs-fundamentals/deque-both-ends/src/index.ts', () => import('../../../facets/cs-fundamentals/deque-both-ends/src/index.js')],
  ['facets/cs-fundamentals/enqueue-dequeue-ends/src/index.ts', () => import('../../../facets/cs-fundamentals/enqueue-dequeue-ends/src/index.js')],
  ['facets/cs-fundamentals/find-root/src/index.ts', () => import('../../../facets/cs-fundamentals/find-root/src/index.js')],
  ['facets/cs-fundamentals/grow-and-copy/src/index.ts', () => import('../../../facets/cs-fundamentals/grow-and-copy/src/index.js')],
  ['facets/cs-fundamentals/hash-table-chaining/src/index.ts', () => import('../../../facets/cs-fundamentals/hash-table-chaining/src/index.js')],
  ['facets/cs-fundamentals/hash-to-bucket/src/index.ts', () => import('../../../facets/cs-fundamentals/hash-to-bucket/src/index.js')],
  ['facets/cs-fundamentals/heap-binary/src/index.ts', () => import('../../../facets/cs-fundamentals/heap-binary/src/index.js')],
  ['facets/cs-fundamentals/heap-property/src/index.ts', () => import('../../../facets/cs-fundamentals/heap-property/src/index.js')],
  ['facets/cs-fundamentals/height-balance-check/src/index.ts', () => import('../../../facets/cs-fundamentals/height-balance-check/src/index.js')],
  ['facets/cs-fundamentals/height-stays-low/src/index.ts', () => import('../../../facets/cs-fundamentals/height-stays-low/src/index.js')],
  ['facets/cs-fundamentals/index-address-calc/src/index.ts', () => import('../../../facets/cs-fundamentals/index-address-calc/src/index.js')],
  ['facets/cs-fundamentals/linked-list-singly/src/index.ts', () => import('../../../facets/cs-fundamentals/linked-list-singly/src/index.js')],
  ['facets/cs-fundamentals/load-factor-rehash/src/index.ts', () => import('../../../facets/cs-fundamentals/load-factor-rehash/src/index.js')],
  ['facets/cs-fundamentals/lost-link/src/index.ts', () => import('../../../facets/cs-fundamentals/lost-link/src/index.js')],
  ['facets/cs-fundamentals/lru-cache/src/index.ts', () => import('../../../facets/cs-fundamentals/lru-cache/src/index.js')],
  ['facets/cs-fundamentals/node-holds-many/src/index.ts', () => import('../../../facets/cs-fundamentals/node-holds-many/src/index.js')],
  ['facets/cs-fundamentals/node-points-next/src/index.ts', () => import('../../../facets/cs-fundamentals/node-points-next/src/index.js')],
  ['facets/cs-fundamentals/open-addressing-probe/src/index.ts', () => import('../../../facets/cs-fundamentals/open-addressing-probe/src/index.js')],
  ['facets/cs-fundamentals/out-of-bounds/src/index.ts', () => import('../../../facets/cs-fundamentals/out-of-bounds/src/index.js')],
  ['facets/cs-fundamentals/parent-two-children/src/index.ts', () => import('../../../facets/cs-fundamentals/parent-two-children/src/index.js')],
  ['facets/cs-fundamentals/path-compression/src/index.ts', () => import('../../../facets/cs-fundamentals/path-compression/src/index.js')],
  ['facets/cs-fundamentals/push-pop-top/src/index.ts', () => import('../../../facets/cs-fundamentals/push-pop-top/src/index.js')],
  ['facets/cs-fundamentals/queue-fifo/src/index.ts', () => import('../../../facets/cs-fundamentals/queue-fifo/src/index.js')],
  ['facets/cs-fundamentals/recolor-then-rotate/src/index.ts', () => import('../../../facets/cs-fundamentals/recolor-then-rotate/src/index.js')],
  ['facets/cs-fundamentals/relink-insert/src/index.ts', () => import('../../../facets/cs-fundamentals/relink-insert/src/index.js')],
  ['facets/cs-fundamentals/rotate-to-balance/src/index.ts', () => import('../../../facets/cs-fundamentals/rotate-to-balance/src/index.js')],
  ['facets/cs-fundamentals/share-prefix-path/src/index.ts', () => import('../../../facets/cs-fundamentals/share-prefix-path/src/index.js')],
  ['facets/cs-fundamentals/shift-on-insert/src/index.ts', () => import('../../../facets/cs-fundamentals/shift-on-insert/src/index.js')],
  ['facets/cs-fundamentals/shift-on-remove/src/index.ts', () => import('../../../facets/cs-fundamentals/shift-on-remove/src/index.js')],
  ['facets/cs-fundamentals/sift-down/src/index.ts', () => import('../../../facets/cs-fundamentals/sift-down/src/index.js')],
  ['facets/cs-fundamentals/sift-up/src/index.ts', () => import('../../../facets/cs-fundamentals/sift-up/src/index.js')],
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

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

describe('facet 세로 고정', () => {
  it('마운트한 뒤 viewBox 높이가 바뀌지 않는다', async () => {
    clearRegistry();
    const handles: RunHandle[] = [];
    const mounted: Array<[string, HTMLElement]> = [];
    const orig = console.error;
    console.error = () => {};
    for (const [name, load] of MODULES) {
      const mod = await load();
      for (const [k, v] of Object.entries(mod)) {
        if (k.startsWith('register') && typeof v === 'function') (v as () => void)();
      }
      for (const facet of facetsOf(mod)) {
        const c = document.createElement('div');
        document.body.appendChild(c);
        try { handles.push(runFacet(facet, c)); } catch { continue; }
        mounted.push([facet.id, c]);
      }
    }
    const before = new Map<string, string>();
    await wait(120);
    for (const [id, c] of mounted) before.set(id, c.querySelector('svg')?.getAttribute('viewBox') ?? '');
    await wait(9000);
    const changed: string[] = [];
    for (const [id, c] of mounted) {
      const now = c.querySelector('svg')?.getAttribute('viewBox') ?? '';
      const was = before.get(id) ?? '';
      const h = (v: string) => v.split(/\s+/)[3] ?? '';
      if (h(was) !== h(now)) changed.push(`${id}  ${h(was)} → ${h(now)}`);
    }
    console.error = orig;
    for (const h of handles) h.destroy();
    expect(changed).toEqual([]);
    expect(mounted.length).toBeGreaterThan(40);
  }, 60000);
});
