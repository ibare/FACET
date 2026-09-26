/**
 * missingKeyRemount 개념 선언.
 *
 * canonical facet 은 `facet:missingKeyRemount` — 조각. 이름표(키) 없는 목록의
 * 맨 앞에 값 하나를 끼워 넣는다. 실제 노드는 옛 자리와 새 자리를 자리 번호로만
 * 맞추므로 어떤 노드도 옮기거나 지우지 않는다 — 자리마다 글자만 덮어쓰고
 * (`patch`), 새 목록이 길어진 만큼 끝에 노드를 더 만든다(`create`). 문제는 그
 * 자리에 눌려 있던 상태(체크박스)가 노드를 따라 그대로 남아, 끝나고 보면 처음
 * 누른 값이 아니라 그 앞에 끼워 넣은 값 옆에 가 있다는 것이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * `keyedReconciliation` 이 위치 매칭과 키 매칭을 손잡이로 오가며 결과 수를
 * 견주는 것이라면, 이 조각은 **위치 매칭 한 가지만 고정하고 그 결과가 상태
 * 오염으로 이어지는 구체적인 한 장면**만 보여준다. definition 의 주어는 "자리로
 * 맞춘 결과 상태가 딸려 가는 것"이고, `keyReorder`(키가 있어 옮김이 정확한
 * 경우)와 정반대 편에 서게 두어 둘을 나란히 놓으면 "키의 유무" 하나가 갈리도록
 * 했다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const missingKeyRemountConcept: FacetConceptSource = {
  id: 'missingKeyRemount',
  label: 'No Key: Text Overwrites, State Stays Behind',
  canonicalFacet: 'facet:missingKeyRemount',

  surface: {
    definition:
      'Inserting one item at the front of a list whose items carry no key: matching proceeds strictly by position, so every existing node has its text overwritten in place rather than being moved, and any state attached to a node — such as a checked box — stays on that position and ends up beside the wrong value.',
    exemplarKeywords: [
      'list without keys',
      'index as key anti-pattern',
      'prepending to an unkeyed list',
      'state attached to the wrong item',
      'position-based list matching',
      'text overwritten in place',
      'checkbox state migrates to a different row',
      'why lists need a key prop',
      'stale input state after reordering a list',
    ],
  },

  briefing: {
    observable: [
      'A row of chips shows the target order to be walked left to right, and beneath it the real rows start out holding the old text, one of them with a visibly checked box.',
      'Each step advances exactly one position: the row at that position keeps its identity but its text fades from the old value to the new one, never moving up or down.',
      'The checked box never leaves the position it started on — as row texts shift under it row by row, the box stays put and ends up marking whatever value the last patch left behind at that position.',
      'Once the new list is longer than the old one, the leftover positions do not get patched — a brand new row grows in with empty state and no box checked.',
      'A running tally line names which value the checked box is now sitting beside, updated after every single step so the drift is visible as it happens rather than only at the end.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole insertion on its own and stops once every position has been handled.',
        'A Replay button and a playback strip sit underneath; once the run has finished, the strip lets a reader land on the exact position where the checked state first ends up beside the wrong text.',
        'The starting list, the inserted value and which row started checked are all fixed, so an article can name the exact value the box drifts onto.',
      ],
    },

    useWhen: [
      "The article warns that using an array index as a key breaks state on reorder, and the reader needs to see what 'breaks' concretely means: not a crash, but a checked box quietly ending up next to the wrong label.",
      'A reader assumes an insertion at the front only affects the new row. This walks every downstream position patching in turn, showing the cost is one text overwrite per shifted row, not one clean insert.',
      "The prose is about form state, focus, or any value that lives on a DOM node rather than in the data itself, and needs a concrete demonstration of why that value doesn't travel with its intended row.",
    ],

    avoidWhen: [
      'The article already assumes keys are present and wants to explain what a key changes. This screen shows only the no-key case; it never lets the same edit run with keys attached for comparison.',
      "The subject is nodes actually being created or removed in the middle of a list. Here only one new row appears, always at the tail, and it is a byproduct of the list growing longer — it is not the mechanism being taught.",
      'The claim is about reordering existing items rather than inserting a new one at the front. Every write here is a text patch driven by one insertion; nothing here is picked up and moved to a new position.',
    ],

    contrastWith: [
      {
        concept: 'keyReorder',
        note: "Both watch state ride along with a real node, but there a key lets each node find its own value across a reorder with no patch at all; here the absence of a key means position is the only address a node has, and every node downstream of the insertion gets its label rewritten.",
      },
      {
        concept: 'keyedReconciliation',
        note: 'This fixes position-based matching and follows a single insertion down to where a piece of attached state ends up; that concept holds the matching mode itself as a switchable variable and counts patches, creates, deletes and moves across several kinds of edits.',
      },
    ],
  },
};
