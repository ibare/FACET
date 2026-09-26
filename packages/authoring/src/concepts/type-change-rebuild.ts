/**
 * typeChangeRebuild 개념 선언.
 *
 * canonical facet 은 `facet:typeChangeRebuild` — 조각. 같은 자리의 노드가 종류만
 * 바뀌면(section → article) 그 아래 자식이 글자 하나까지 똑같아도 재사용하지
 * 않는다 — 옛 가지를 통째로 지우고(한 걸음, `removeBranch`) 새 가지를 전위
 * 차례로 하나씩 다시 키운다(`create`). 종류가 같은 자리는 계속 자식으로 내려가
 * 비교한다(`compare`). 이 조각의 데이터에서는 속성이 늘 같아 patch 계기가
 * 0 에서 움직이지 않는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * `sideBySideTrees` 가 "종류가 같을 때 무엇을 하는가"(속성만 견주고 내려간다)
 * 라면, 이 조각은 정확히 그 반대 분기 — **종류가 다를 때 비교가 아예 멈추고
 * 지움·만듦으로 바뀐다는 것** — 하나만 확대한다. definition 의 주어는 "종류가
 * 다른 한 자리"이고, keywords 는 remount · bail-out 어휘에 집중해 옆 조각의
 * "속성 diff" 어휘와 겹치지 않게 했다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const typeChangeRebuildConcept: FacetConceptSource = {
  id: 'typeChangeRebuild',
  label: 'Type Change Rebuilds the Subtree',
  canonicalFacet: 'facet:typeChangeRebuild',

  surface: {
    definition:
      'The rule that a type mismatch at a matching tree slot stops the comparison at that slot: the old subtree is discarded as one unit and the new subtree is grown from scratch, even when nodes beneath it are attribute-for-attribute identical on both sides.',
    exemplarKeywords: [
      'element type mismatch',
      'tag change forces remount',
      'bail out of diffing at a type change',
      'discard and rebuild a subtree',
      'type check before comparing children',
      'component type change unmounts state',
      'cannot patch across different element types',
      'whole branch torn down at once',
      'no partial reuse across a type change',
    ],
  },

  briefing: {
    observable: [
      "A ring visits a matching slot in the old and new tree; when the two types agree the caption says so and the walk continues into that node's children, but when they disagree the caption states the two type names and says explicitly that nothing below is compared.",
      'On a type mismatch the whole old branch drops away at once, falling and fading together as a single unit rather than one node vanishing at a time.',
      'The replacement branch does not simply appear — each of its nodes grows individually, one at a time in top-to-bottom order, out of the position where its parent already stands.',
      'Nodes carry a small tag reading "kept" or "new" so a reader can tell at a glance which nodes survived from the old tree and which were grown fresh, even identical-looking ones like the two paragraphs under the swapped node.',
      'A running tally reports separate counts for compared, removed and created, and the removed and created counts jump by several at once on a type mismatch rather than climbing one node at a time the way compares do.',
      'Layout is computed once from the larger of the two trees and held fixed for the whole run, so the surviving footer node never shifts position while the branch above it is torn down and regrown.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole comparison on its own and stops once the walk has finished.',
        'A Replay button and a playback strip sit underneath; once the run has finished, the strip lets a reader land on the exact moment of the type mismatch, the removal, or any single node being grown back.',
        'The two starting trees are fixed and differ at exactly one slot, so an article can name that slot and the two type names on either side of it.',
      ],
    },

    useWhen: [
      "The article claims that children which look identical on both sides of a change get reused anyway, because only their own attributes differ. This is the screen that shows that claim is false the moment the parent's type changes — the identical paragraphs are torn down and regrown regardless.",
      "A reader needs the difference between a node's type changing and its attributes changing spelled out as two different outcomes: attribute changes patch in place, but a type change stops the comparison outright and replaces everything below it.",
      'The prose wants to explain why swapping a wrapping element (a div for a section, a button for a link) is expensive even when nothing inside actually changed — the cost is counted in real time as removed and created, not compared.',
    ],

    avoidWhen: [
      'The subject is what happens when types already match and only attributes differ. That is the ordinary case this screen explicitly walks past on its way toward the one slot where types disagree.',
      'The article is about a flat list of siblings gaining, losing or swapping keys, rather than a nested tree where one interior node changes its own kind. Nothing here is reordered.',
      'The point is how many kinds of tree edits exist in general, or the cost of the walk as trees grow larger. Only one fixed pair of small trees is shown, with exactly one type mismatch in it.',
    ],

    contrastWith: [
      {
        concept: 'sideBySideTrees',
        note: 'That is the walk when a matching slot holds the same type on both sides and only attributes are at stake; this is the one branch of that same walk where the type itself disagrees and the comparison cannot continue downward.',
      },
      {
        concept: 'keyedReconciliation',
        note: 'There a tag change on an entire list is one of several edits a reader can select and compare against alternatives; here a single type change inside a nested tree is followed in isolation, with the subtree-discard rule as the entire point.',
      },
    ],
  },
};
