/**
 * edgesAreJumps 개념 선언.
 *
 * canonical facet 은 `facet:edgesAreJumps` — 1 부터 `n` 까지 더하는 `while` 을 낮춘 여덟 줄이 블록 넷으로 나뉜 채 시작한다.
 * 블록마다 마지막 명령에서 간선이 뻗는다 — B1 `i = 1` 흘러내림 · B2 `ifnot t1 goto L2` 뜀과 흘러내림 · B3 `goto L1` 거슬러 뜀 ·
 * B4 `return total` 없음. 간선 넷(뜀 둘 · 흘러내림 둘 · 거슬러 하나)인데 적힌 뜀 명령은 둘이다. 5 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * `flowGraphs`(완제품)는 흐름 꼴이 그래프 전체를 바꾸는 대비를, `basicBlock` 은 어디서 자르나를 쥔다. 이쪽은 **블록 끝 명령이
 * 간선을 정한다** — 특히 명령에 적히지 않은 흘러내림 — 를 쥔다. 그래서 definition 은 last instruction · fall-through · not written ·
 * return · back edge 를 쥐고, leader · reaching · chain 을 쓰지 않는다.
 *
 * 전제: `@notation native` 교과서 세 주소 코드(`ifnot t goto L` 은 거짓일 때 뛴다). 코드를 돌리지 않는다 — 거슬러 가는 간선은
 * "몇 번 돈다" 가 아니라 "되돌아갈 수 있다" 를 말한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const edgesAreJumpsConcept: FacetConceptSource = {
  id: 'edgesAreJumps',
  label: 'Flow Graph Edges Come From Block Endings',
  canonicalFacet: 'facet:edgesAreJumps',

  surface: {
    definition:
      'Each basic block\'s last instruction decides its outgoing edges: goto gives one, a conditional jump gives two, a non-jump falls through to the next block, and return gives none, so some edges appear in no instruction.',
    exemplarKeywords: [
      'CFG edges',
      'successor blocks',
      'predecessor blocks',
      'fall-through edge',
      'implicit fall-through',
      'back edge',
      'conditional branch two successors',
      'goto and labels',
      'while loop lowered to jumps',
      'return has no successor',
    ],
  },

  briefing: {
    observable: [
      'The code sums 1 to `n`: `let total = 0`, `let i = 1`, `while i <= n` with `total = total + i` and `i = i + 1` in its body, `return total`. Its eight lines of three-address code start already cut into four blocks — B1 (lines 1–2), B2 (3–4), B3 (5–7), B4 (8) — with no edges.',
      'B1 ends at line 2, `i = 1`. It is not a jump, so it falls through to B2, right below.',
      'B2 ends at line 4, `ifnot t1 goto L2`: two edges — a jump to B4, labelled "jump · t1 false", and a fall-through to B3, labelled "fall-through · t1 true".',
      'B3 ends at line 7, `goto L1`, a jump to B2. B2 comes before B3, so this edge runs back up, labelled "jump · backward". B4 ends at line 8, `return total`, and no edge leaves it.',
      'The run ends with four edges — two jumps, two fall-throughs, one of them backward — while the code wrote only two jump instructions (lines 4 and 7). Fall-throughs are edges no instruction spells out. Five steps including step 0.',
      'The code is not run and `n` has no value; the backward edge says the loop can return to its test, not how many times it does. The notation is textbook three-address code.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one block ending per step, and stops at `return total`.',
        'A Replay button and a playback strip sit below it. Holding the strip on the B3 step shows the one edge that climbs back up.',
        'The code is fixed, so edge labels and the final count "Edges: 4 · jumps: 2 · fall-throughs: 2 · backward: 1" can be quoted as they appear.',
      ],
    },

    useWhen: [
      'The article explains how a control flow graph is read off lowered code and needs the edges that exist without any jump instruction.',
      'A reader wonders how a `while` loop looks once it is only jumps, and the article wants the single backward edge that makes it a loop.',
    ],

    avoidWhen: [
      'The article is about where block boundaries go. The blocks are given already cut.',
      'The subject is how many times a loop iterates or loop termination. Nothing runs.',
      'The article is about graph edges in general, such as network or social graphs. These edges are control transfers in compiled code.',
    ],

    contrastWith: [
      {
        concept: 'basicBlock',
        note: 'Leaders fix where one block ends and the next begins; the ending instruction then fixes where control may go next.',
      },
      {
        concept: 'flowGraphs',
        note: 'Reading edges off block endings is one local rule. Whether the resulting graph has a join or a backward edge depends on the control structure the statements were wrapped in.',
      },
      {
        concept: 'loopBack',
        note: 'Returning to the condition is how a loop repeats in the source; after lowering, that return is a written backward jump, one edge among ordinary jumps and fall-throughs.',
      },
    ],
  },
};
