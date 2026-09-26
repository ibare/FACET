/**
 * sideBySideTrees 개념 선언.
 *
 * canonical facet 은 `facet:sideBySideTrees` — 조각. 옛 가상 트리 · 새 가상 트리 ·
 * 실제 트리 셋을 나란히 두고, 전위 차례로 한 쌍씩 짚어 내려간다. 종류(태그)가
 * 같은 자리에서는 속성만 견주어 다른 속성만 실제 트리에 옮겨 적고, 커밋을 따로
 * 두지 않는다 — 한 걸음이 곧 반영이다. 이 조각의 데이터에는 종류가 다른 자리도,
 * 자식 수가 다른 자리도 없다(있으면 오류를 던진다).
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **짝짓기 자체가 자리(전위 순서)로 이미 정해져 있고,
 * 견주는 대상이 트리 전체(자식 수까지 포함)라는 틀**이다. definition 의 주어는
 * "두 트리를 나란히 훑는 것"이고, keywords 는 속성 diff · 전위 순회 어휘에
 * 집중한다. `typeChangeRebuild` 는 이 틀 안에서 종류가 달라 그 틀이 깨지는
 * 예외 한 경우만 확대하고, `keyedReconciliation` 은 트리가 아니라 형제들의
 * 평평한 목록에서 이 짝짓기 방식 자체(자리 대 키)를 손잡이로 쥔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sideBySideTreesConcept: FacetConceptSource = {
  id: 'sideBySideTrees',
  label: 'Side-by-Side Trees (Same-Position Tree Walk)',
  canonicalFacet: 'facet:sideBySideTrees',

  surface: {
    definition:
      'Walking an old tree and a new tree together, node by node in the same top-to-bottom order, comparing the pair at each matching slot and writing only the attributes that differ onto a real tree that mirrors the old one.',
    exemplarKeywords: [
      'virtual DOM tree diffing',
      'old tree vs new tree comparison',
      'preorder tree walk',
      'structural diffing',
      'patch only changed attributes',
      'diffing two trees pairwise',
      'top-down tree comparison',
      'same-slot node pairing',
      'render tree reconciliation',
    ],
  },

  briefing: {
    observable: [
      'Three trees are drawn in stacked bands — old, new, and real — so a single visited slot lines up vertically across all three at once.',
      'A ring travels down through the slots in a fixed top-to-bottom order, moving to the next pair only after the current one has been fully handled.',
      'When a slot has no attribute differences the ring passes through with no other motion; when it does, small chips carrying the new values fly from the new tree down into the real tree at that same slot.',
      'A tally line reports how many of the total slot-pairs have been compared so far against how many have actually been patched, so passing through and writing are counted separately.',
      'The real tree never grows or shrinks a branch on this screen — every slot that exists in the old tree also exists in the new one, so the whole run is nothing but comparisons and, sometimes, attribute writes.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole walk on its own and stops once every slot has been visited.',
        'A Replay button and a playback strip sit underneath; once the walk has finished, the strip lets a reader land on any one slot-pair and read that comparison on its own.',
        'The two starting trees are fixed, so an article can name a specific slot, its tag, and which of its attributes were the ones that changed.',
      ],
    },

    useWhen: [
      "The reader pictures diffing as jumping straight to whatever changed. The ring visiting every slot in a fixed order, including the ones where nothing happens, is the corrective — the walk touches everything before it decides what to write.",
      'An article needs to show that comparing is not the same act as writing: the tally line moving on almost every slot while the patched count barely moves makes that gap countable rather than asserted.',
      'The claim is specifically about attributes on a matching node, not about nodes appearing, disappearing, or changing kind. Nothing here ever adds or removes a slot.',
    ],

    avoidWhen: [
      'The article is about a node changing kind at a slot, or a branch being torn down and grown again. This walk never encounters that — every pair it visits already has the same tag.',
      'The subject is a flat list of siblings being reordered or matched by a key rather than a nested tree walked from a fixed root. Nothing here is rearranged; every real node stays in the slot it started in.',
      'The point is the cost of the walk — how it scales with tree size — rather than what happens at one slot. Only one small pair of trees is shown, and it is always walked to completion.',
    ],

    contrastWith: [
      {
        concept: 'typeChangeRebuild',
        note: 'This assumes every matching slot already holds the same kind of node and only asks which attributes differ; that concept is the one case this framework carves out — the slot where the kind itself differs and the walk cannot continue into it.',
      },
      {
        concept: 'keyedReconciliation',
        note: 'This fixes same-position pairing as the only rule and applies it to a nested tree; that concept holds the pairing rule itself as a variable — position versus key — and applies it to a flat list of siblings instead.',
      },
    ],
  },
};
