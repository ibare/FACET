/**
 * cascadePriority 개념 선언.
 *
 * canonical facet 은 `facet:cascadePriority` — 완제품. 요소의 표식(태그·클래스·아이디)과
 * 부모의 클래스를 바꿀 수 있는 컨트롤을 쥐고, 한 판마다 (1) 다섯 규칙 중 후보를 거르고
 * (2) 후보마다 조상을 거슬러 올라가며 맞는지 판정하고 (3) 맞은 규칙들끼리 명시도로 자리를
 * 다투는 세 단계 전부를 이어 보인다. 표식을 바꾸면 후보 집합 자체가 바뀌어, 거르기와
 * 무게 다툼이 같은 규칙 다섯을 두고 서로 다른 결과를 내는 것이 반복해 드러난다.
 *
 * 형제 조각 둘과의 선— selectorRightToLeft 는 이 중 (2)의 판정 한 걸음(한 후보 대 선택자
 * 하나)만 오른쪽→왼쪽 걷는 방향에 집중해 확대하고, cascadeConflict 는 (3)의 무게 다툼만
 * 떼어 요소·규칙을 고정한 채 되풀이한다. 이 개념은 그 둘을 하나의 흐름으로 잇고, 표식을
 * 바꿔 가며 반복하는 것이 다르다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cascadePriorityConcept: FacetConceptSource = {
  id: 'cascadePriority',
  label: 'Cascade Priority',
  canonicalFacet: 'facet:cascadePriority',

  surface: {
    definition:
      'The full procedure that decides which stylesheet rule sets a given element\'s property: rules are first filtered to those whose rightmost compound could match the element, each surviving candidate is matched against the element and its ancestors, and among the rules that match, the one with the highest specificity — ties broken by later source position — wins and its value is applied.',
    exemplarKeywords: [
      'css cascade',
      'style calculation',
      'computed style',
      'which css rule wins',
      'selector matching pipeline',
      'specificity and matching together',
      'rule resolution',
      'candidate rule filtering',
      'cascade algorithm',
      'css rule matching and weighing',
    ],
  },

  briefing: {
    observable: [
      'Changing the Mark segmented control (p / .note / #lead / #lead.note) and the Parent control (div / div.card) redraws the element\'s opening tag and immediately changes which of the five rule cards are outlined as candidates.',
      'Each rule card carries its own specificity triple in parentheses next to its selector text, and cards fade to low opacity the moment they are ruled out as non-candidates.',
      'Cards being judged flip a status label between "matched" and "not matched" as the ancestor chain is walked, before any comparison of weight happens.',
      'The card currently winning slides out of its column and docks in a dashed "rule currently in place" slot at the lower left; a card that had been sitting there and gets outweighed slides back to its home row.',
      'The Candidates, Comparisons and Swaps counters reset to zero and climb again each round as candidates are filtered, ancestor nodes are tested, and the held rule actually changes hands (a rule that seats an empty slot does not count as a swap).',
      'When a round finishes, the element\'s outline is painted in the winning rule\'s color.',
    ],

    screen: {
      affordances: [
        'Play/pause/step/reset controls replay one full round: candidate filtering, ancestor matching for every candidate, then the specificity duel among the rules that matched.',
        'A Mark segmented slider (p / .note / #lead / #lead.note) and a Parent segmented slider (div / div.card) let the reader change which features the element and its parent carry, which starts a fresh round with a different candidate set.',
        'Candidates, Comparisons and Swaps metrics sit beside the controls and reset to zero at the start of each round.',
        'A code panel beside the stage highlights the source lines for whichever phase — specificity, filter check, ancestor search — is active.',
      ],
    },

    useWhen: [
      'The article\'s claim spans the whole decision, from "why is this rule even in the running" through "why did this one specific rule end up controlling the property" — and changing the element\'s own class or id would change the answer. The Mark/Parent controls let the reader watch the candidate set itself reshape before any weighing starts.',
      'The reader needs to see that matching and weighing are two separate passes over the same rule set: a rule can lose at the matching pass (it never earns a "matched" label) or survive matching and still lose at the weighing pass (it gets outweighed at the held slot).',
    ],

    avoidWhen: [
      'The article only wants to show how one single selector is checked against one candidate element, without touching what happens when several rules match. The Mark/Parent controls and the specificity duel over the seat go beyond that scope.',
      'The article only wants to show how already-matched rules fight for a property, without the element ever changing shape. This screen\'s mark/parent inputs and repeated candidate filtering are more machinery than that claim needs.',
      'The subject is inline styles, the `!important` flag, or origin/layer precedence. Only source order and specificity are compared here.',
    ],

    contrastWith: [
      {
        concept: 'selectorRightToLeft',
        note: 'This runs candidate filtering, per-candidate matching and specificity weighing together and repeats the whole thing as the element changes shape; that piece isolates only the single-candidate matching walk and never weighs one rule against another.',
      },
      {
        concept: 'cascadeConflict',
        note: 'This treats matching as one of two passes a rule must survive before it can even enter the weighing duel, and lets the reader reshape the element to change who is even a candidate; that piece assumes matching is already settled and studies only the weighing duel over a fixed element and fixed rules.',
      },
    ],
  },
};
