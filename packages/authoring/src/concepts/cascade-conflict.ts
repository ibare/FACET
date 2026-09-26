/**
 * cascadeConflict 개념 선언.
 *
 * canonical facet 은 `facet:cascadeConflict` — 조각. 다섯 규칙이 이미 같은 요소의 같은
 * 속성에 맞는다는 것을 전제로 두고(그렇지 않으면 algorithm 이 던진다), 오직 "누가 자리를
 * 쥐는가"만 되풀이해 보인다. 규칙은 원본 차례로 하나씩 들어와 지금 자리를 쥔 규칙과 무게
 * (아이디·클래스·태그 수)를 사전식으로 맞대고, 무거우면 뺏고 같으면 나중 것이 뺏고
 * 가벼우면 밀려난다. 요소도 규칙 목록도 바뀌지 않는다 — 판이 거듭될수록 자리가 바뀌는
 * 다섯 번의 결투만 있다.
 *
 * selectorRightToLeft(조각)가 다루는 "선택자가 요소에 맞는가"는 이 개념에서 이미 끝난
 * 전제이고, cascadePriority(완제품)는 그 판정과 이 무게 다툼을 한 흐름으로 잇는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cascadeConflictConcept: FacetConceptSource = {
  id: 'cascadeConflict',
  label: 'Specificity Duel (Cascade Conflict)',
  canonicalFacet: 'facet:cascadeConflict',

  surface: {
    definition:
      'The procedure that resolves several rules already known to match the same element and set the same property to different values: rules arrive in source order and each newcomer\'s specificity — id count, then class count, then tag count, compared column by column — is weighed against whichever rule currently holds the seat, with a heavier rule taking the seat, an equally heavy one taking it because it arrived later, and a lighter one staying pushed out.',
    exemplarKeywords: [
      'css specificity',
      'specificity calculation',
      'id class tag weight',
      'specificity tiebreak',
      'specificity comparison',
      'source order tiebreak',
      'later rule wins',
      'competing css rules',
      'style conflict resolution',
      'which css declaration wins',
    ],
  },

  briefing: {
    observable: [
      'Five rule cards sit in a stylesheet column in source order, each carrying its selector, its declaration and a three-cell strip for its (id, class, tag) specificity weight — the weight cells start empty ("·") and fill in only once that rule has actually been compared.',
      'The first rule to arrive slides straight into a dashed "holds the seat" slot on the right with no comparison at all; its home row in the stylesheet column is left as an empty outline.',
      'Every later rule slides in next to the seated rule and a labeled row pair shows both weights lined up column by column (ID, then class, then tag), with the deciding column boxed in an accent outline and a >, = or < sign drawn between the two rows.',
      'When the newcomer wins, the previously seated card slides back down to its own row in the stylesheet column, struck through, and marked "seat taken"; when the newcomer loses, it is the newcomer that slides back to its row struck through and marked "pushed out."',
      'At the end, the declaration on the card still holding the seat rises up into the element\'s style slot, and the caption reports how many times the seat changed hands and how many times a challenger was pushed out.',
    ],

    screen: {
      affordances: [
        'Playback controls step through one duel at a time: a rule taking the empty seat, a rule dueling the current holder, or the final declaration being applied.',
        'There is no control that changes the rules or the element; the same five-rule stylesheet and the same target element replay every time, only the sequence of duels is stepped through or scrubbed.',
      ],
    },

    useWhen: [
      'The article claims several rules can set the very same property of the very same element to different values, and specificity — not writing order alone — is what breaks the tie. The card that "holds the seat" versus the one that gets displaced is the visual the claim needs.',
      'The reader has to see specificity compared column by column (id, then class, then tag) rather than as one fused number, including the case where two rules weigh exactly the same and only then does source order decide.',
      'The article wants to rebut "the last rule always wins": a later, lighter rule still loses to an earlier, heavier one, and the "pushed out" mark on a newcomer that arrived after the current holder is that rebuttal made visible.',
    ],

    avoidWhen: [
      'The article is about deciding whether a selector matches an element at all. Every rule on this stylesheet is guaranteed in advance to match the one target element; only the property conflict among already-matching rules is shown.',
      'The subject is `!important`, inline styles, or origin/layer precedence rather than specificity and source order.',
      'The reader needs to see the element itself change shape, or a sixth rule added. This piece replays a fixed five-rule stylesheet against one fixed element.',
    ],

    contrastWith: [
      {
        concept: 'cascadePriority',
        note: 'This isolates the weighing duel with matching already settled and the element held fixed; the whole procedure also decides which rules even qualify as candidates first, and lets the reader reshape the element to change that candidate set.',
      },
      {
        concept: 'selectorRightToLeft',
        note: 'This never walks a selector against the document at all — the rules arriving here are already known to match, and what is contested is only which one outweighs the others, which is exactly the step selectorRightToLeft stops short of.',
      },
    ],
  },
};
