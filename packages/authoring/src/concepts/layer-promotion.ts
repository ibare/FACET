/**
 * layerPromotion 개념 선언.
 *
 * canonical facet 은 `facet:layerPromotion` — 조각이다. 배지 둘이 같은 거리를
 * 옮긴다. badgeA 는 page 장에 다른 요소들과 함께 칠해져 있어 옛 자리·새 자리
 * 모두 겹친 요소를 다시 칠해야 하고, badgeB 는 제 장(`will-change: transform`)
 * 에 떼어져 있어 합성 걸음에 장째 자리만 옮겨질 뿐 아무것도 다시 칠하지
 * 않는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **대비 하나** 다 — 같은 옮김을 같은 만큼 겪은 두
 * 요소가 어느 장에 있느냐만으로 다시 칠하는 양이 갈린다는 것. definition 의
 * 주어는 "같은 거리를 옮긴 두 요소"이고, 파이프라인 단계 이름이나 여러 속성
 * 갈래는 담지 않았다(옮김 하나, transform 하나로 고정). 완제품 `repaintCost`는
 * 이 조각이 보여주는 축(cardLayer) 을 포함해 property 축까지 함께 돌리며
 * 파이프라인 표시등으로 어느 단계가 도는지 보이므로 더 넓다. 조각
 * `stackOfSheets`는 이 대비가 왜 성립하는지의 근거(층마다 제 장에 칠하고
 * 합성은 포개기만 한다는 사실 자체)를 다루며, 옮김이나 다시 칠하기 판정은
 * 등장하지 않는다. 그래서 여기 definition 에는 "다시 칠하는 이유(장치)" 대신
 * "같은 옮김의 서로 다른 결과"라는 대비 자체만 남겼다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const layerPromotionConcept: FacetConceptSource = {
  id: 'layerPromotion',
  label: 'Layer Promotion (Skipping Repaint by Owning a Layer)',
  canonicalFacet: 'facet:layerPromotion',

  surface: {
    definition:
      'Two elements move the same distance by the same transform: one painted together with the rest of the page dirties and repaints whatever its old and new spots overlap, while one promoted onto its own compositing layer only has that layer repositioned, with nothing repainted at all.',
    exemplarKeywords: [
      'will-change: transform',
      'promote an element to its own layer',
      'GPU layer promotion',
      'transform: translateZ(0)',
      'compositor-only animation',
      'avoid repaint on move',
      'cheap way to animate an element',
      'own compositing layer',
      'repaint the old and new position',
      'why this animation is smoother',
    ],
  },

  briefing: {
    observable: [
      'Both badges start on screen and move the identical transform distance at the same moment, so the only thing that differs afterward is what got repainted, not how far or when anything moved.',
      'The page-sheet badge triggers two separate repaint moments: first a dashed brush sweeps over its old spot and every page element under it lights up in turn, then the same sweep happens again over its new spot, lighting up whatever sits there — including the badge itself, now arrived.',
      'The layer-promoted badge never triggers that brush or any lit ring at any point. Instead, at the composite step, its whole dashed sheet outline slides bodily from its old position to its new one.',
      'A running tally beside the page counts, per badge, how many distinct elements were repainted by its move — the page-sheet badge accumulates a nonzero count across its two repaint moments, the promoted badge stays at zero through the entire sequence.',
      'The closing composite step names only the promoted badge as "placed anew" and reports zero repainted for it, in contrast to the nonzero counts already shown for the page-sheet badge.',
    ],

    screen: {
      affordances: [
        'The screen scrubs through a fixed sequence — one shared transform change, then repaint events for the page-sheet badge at its old and new spot, then a composite step — with no handle to change which elements move or how far.',
        'A scrub control steps forward and back through the change, repaint and composite events one at a time, so a reader can hold the old-spot repaint next to the new-spot repaint and compare their lit elements.',
      ],
    },

    useWhen: [
      'The article recommends will-change: transform or a similar promotion hint for an animated element, and the reader needs concrete evidence rather than a rule of thumb — the same move produces a nonzero repaint tally for one badge and a flat zero for the other.',
      'The reader assumes moving anything must dirty pixels somewhere, and needs to see a move that dirties nothing: the promoted badge\'s sheet is only ever repositioned, never touched by a repaint event.',
    ],

    avoidWhen: [
      'The subject is which CSS properties trigger layout versus paint versus nothing at all across several properties. Only one property (a transform move) is exercised here, on two elements, not a survey of properties.',
      'The article is about why compositing itself works — that a compositor paints layers onto separate surfaces and only stacks them. That mechanism is assumed here and never shown directly; this screen only shows one consequence of it.',
      'The point is how many layers a page should have, or the cost of over-promoting elements to their own layers. Exactly one promoted element is shown, and never as a cost.',
    ],

    contrastWith: [
      {
        concept: 'repaintCost',
        note: 'This fixes the move and the layer question to one axis and shows only whether repaint happens at all; that also varies which property changes and shows the whole pipeline chain shortening or lengthening.',
      },
      {
        concept: 'stackOfSheets',
        note: 'This is a single payoff of layered painting — a promoted move is repositioned, not repainted; that is the underlying fact for any number of layers, with no move and no repaint tally at all.',
      },
    ],
  },
};
