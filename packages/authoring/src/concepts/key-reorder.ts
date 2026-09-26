/**
 * keyReorder 개념 선언.
 *
 * canonical facet 은 `facet:keyReorder` — 조각. 키 차례가 p q r s 에서 q r s p 로
 * 바뀐다. 먼저 옛 목록으로 이름표 표(키 → 옛 자리)를 짓고, 새 차례를 왼쪽부터
 * 훑으며 각 키를 표에서 찾아 옛 자리가 지금까지 놓인 가장 큰 자리(`lastPlaced`)
 * 보다 뒤면 그대로 두고, 앞이면 끝으로 밀어 보낸다(React 의 `lastPlacedIndex`
 * 규칙 그대로). 실제 노드 넷은 이 조각 내내 한 번도 다시 만들어지지 않는다 —
 * 옮기거나 그대로 두는 것뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **키가 있을 때 "옮김"이 어떻게 최소로 결정되는가**
 * 라는 규칙 하나다 — 표에서 자리를 찾는 것과, `lastPlaced` 와 비교해 두 갈래
 * (그대로 · 밀기) 중 하나로 판정하는 것. definition 의 주어는 "이미 놓인 가장
 * 뒤 자리와 견주는 판정"이고, keywords 는 lastPlacedIndex · 최소 이동 어휘에
 * 둔다. `missingKeyRemount` 는 키가 없어 이 판정 자체가 없는 대조편이고,
 * `keyedReconciliation` 은 이 판정을 다섯 편집 중 하나로만 보여준다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const keyReorderConcept: FacetConceptSource = {
  id: 'keyReorder',
  label: 'Key Reorder (the lastPlacedIndex Rule)',
  canonicalFacet: 'facet:keyReorder',

  surface: {
    definition:
      "Reordering a keyed list without recreating any node: each key looks up the old position it once held, and that position is compared against the furthest old position placed so far — behind it, the node stays; ahead of it, the node slides to the end — so only the minimum necessary nodes move.",
    exemplarKeywords: [
      'key prop reordering',
      'lastPlacedIndex algorithm',
      'stable keys survive a reorder',
      'minimal moves in a list diff',
      'keyed list reconciliation',
      'deciding whether to move or leave a node in place',
      'React list reordering algorithm',
      "key to old-position lookup table",
      'reordering without creating or destroying nodes',
    ],
  },

  briefing: {
    observable: [
      'A label table is built before anything else moves: each key gets a row recording the old position it used to occupy, filled in all at once rather than looked up on demand later.',
      'The new order is walked strictly left to right, one key at a time, and a dotted line traces from the current target position through that key\'s row in the table down to the actual node it names.',
      "The same four boxes sit in the actual list for the entire run — none of them is ever removed or recreated, and each carries its letter and color throughout, so a box that slides is recognizably the same box afterward.",
      "Each key is judged against a single running number, the furthest old position already placed: a key whose old position sits behind that number stays exactly where it is, and a key whose old position sits ahead of it slides to the end of the list.",
      'A running summary line separates the outcome into moved and stayed counts, alongside created, removed and patched counts that stay at zero for the whole run — nothing here is created, removed or patched.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole reorder on its own and stops once every position in the new order has been judged.',
        'A Replay button and a playback strip sit underneath; once the run has finished, the strip lets a reader stop on any single key\'s stay-or-move judgment and read the dotted lookup line for it.',
        'The old key order and the new key order are both fixed, so an article can name exactly which keys stay and which one slides.',
      ],
    },

    useWhen: [
      "The article claims keys let a list reorder efficiently and the reader has no way to see the mechanism behind that claim. The label table and the stay-versus-slide judgment against the furthest placed position are that mechanism made visible.",
      'A reader needs to see why some elements in a reordered list stay untouched while others move, rather than assuming a reorder touches everything uniformly — three of the four keys here never move at all.',
      'The prose wants a case with zero creates, zero removes and zero patches, isolating pure position change from every other kind of list edit so a reader cannot confuse moving with recreating.',
    ],

    avoidWhen: [
      'The article is about a list that has no keys at all, or where the reorder is presented as though the same rule applied without one. This screen has nothing to say about position-only matching — see the unkeyed case instead.',
      'The subject is items being inserted, removed, or having their type change. This reorder holds the same four keys throughout; no node is ever created or destroyed here.',
      'The claim concerns which matching mode a list should use in general, comparing several edits side by side. This screen commits to one edit — a reorder — and follows it through in isolation.',
    ],

    contrastWith: [
      {
        concept: 'missingKeyRemount',
        note: "Both track what happens to state attached to a real node, but here a key gives each node an address that survives reordering with no patch at all, while there the absence of a key means every node downstream of an edit gets its text overwritten and attached state drifts onto the wrong value.",
      },
      {
        concept: 'keyedReconciliation',
        note: "This isolates one edit — a reorder — and exposes the lookup table and stay-or-move rule behind it; that concept treats reordering as one of five selectable edits and reports only the resulting counts, without the per-key judgment shown here.",
      },
    ],
  },
};
