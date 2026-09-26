/**
 * twoTreesMeet 개념 선언.
 *
 * canonical facet 은 `facet:twoTreesMeet` — 조각. `origin` 토픽 `dom-and-cssom`
 * 은 버려졌고 조각이 이 하나뿐이라, 완제품 없이 이 토픽 이름으로 묶는다.
 *
 * 열한 개짜리 고정 DOM(html > head > title, body > h1 · p.intro ·
 * div.ad > img · ul > li · li) 을 앞 차례로 밟으며 여섯 CSSOM 규칙과 맞대 본다.
 * head 와 div.ad 는 각각 display:none 규칙에 걸려 자손째(title, img) 렌더
 * 트리에서 빠지고, 나머지 아홉 가운데 일곱만 렌더 트리에 들어간다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const twoTreesMeetConcept: FacetConceptSource = {
  id: 'twoTreesMeet',
  label: 'Two Trees Meet (DOM + CSSOM → Render Tree)',
  canonicalFacet: 'facet:twoTreesMeet',

  surface: {
    definition:
      'Walking the DOM tree in preorder, each element is checked against every CSSOM rule for a match; a matched element attaches its declarations and joins the render tree under its nearest render-tree ancestor, while an element matched by a display:none rule is left out of the render tree together with its entire subtree, which is never visited.',
    exemplarKeywords: [
      'DOM',
      'CSSOM',
      'render tree construction',
      'critical rendering path',
      'display: none removes the whole subtree',
      'attaching computed style to DOM nodes',
      'why display:none differs from visibility:hidden',
      'building the render tree',
      'style matching during a tree walk',
    ],
  },

  briefing: {
    observable: [
      'Three lists are drawn side by side — the DOM (indented by depth), the CSSOM rules, and the growing render tree — with a caption naming which element is being visited and which rules matched it.',
      'Of the eleven DOM elements, two branches are each visited just long enough to discover a display:none rule and then dropped: head (a browser-default rule) taking its one child (title) with it, and div.ad (an author rule) taking its one child (img) with it — both captioned "left out of the render tree with its whole branch," neither child ever visited.',
      'Elements that carry no matching rule at all — the root html and the ul — still join the render tree, captioned "no rule matches" rather than being skipped.',
      'Elements that do match — body, h1, p.intro, and both li elements — join the render tree with their declarations attached, captioned "joins the render tree" alongside the parent it attached under.',
      'A closing count line reports all four numbers together: eleven DOM elements, nine visited, seven in the render tree, four left out.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole preorder walk — every visit and every drop — on its own and stops once the render tree is complete.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to any visit or drop holds that element\'s matched rules on screen.',
        'The DOM tree and the six CSSOM rules are fixed, so an article can name the exact element, the exact rule, and the exact count that results.',
      ],
    },

    useWhen: [
      'The reader assumes the render tree is just the DOM with styles attached, and misses that display:none removes a node rather than merely hiding it visually. The dropped branches — head with title, div.ad with img — never entering the render tree, next to the closing count of four left out, is the corrective.',
      'The article needs to show the DOM and the CSSOM as two separate trees that merge into a third one, element by element, rather than treating CSS as something applied after a tree already exists.',
    ],

    avoidWhen: [
      'The article is about which of several matching rules wins when they conflict on the same property. This piece\'s data never lets two rules match the same property on one element — it treats that as an error rather than showing a resolution; that decision belongs to cascadePriority.',
      'The article is about selector-matching mechanics themselves — compound selectors, combinators, or a right-to-left matching walk. Only bare tag, class and id selectors appear here, and matching is a means to an end, not the focus.',
      'The article is about layout, paint or compositing happening after a render tree exists. This piece stops the moment the render tree is built.',
      'The article uses visibility:hidden or opacity:0. Only display:none is modeled, and it is the one rule this piece treats as an exclusion from the render tree.',
    ],

    contrastWith: [
      {
        concept: 'cascadePriority',
        note: 'This walks the whole DOM once and, for each element, simply takes the declarations from whichever rules matched it — its data never lets two rules contest the same property, so no winner is ever chosen. That concept is the resolution this one skips: the algorithm that decides which single rule wins when several matched rules do disagree on a property.',
      },
    ],
  },
};
