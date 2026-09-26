/**
 * stackOfSheets 개념 선언.
 *
 * canonical facet 은 `facet:stackOfSheets` — 조각이다. 층 셋(root/card/toast)
 * 이 각자 제 장에 칠하기 동작(fillRect·drawText)을 받고, 걸음마다 층 하나씩
 * 칠해진 뒤, z 오름차순으로 장이 들려 올라와 합성 틀 위에 포개진다. 아래 장의
 * 요소를 덮은 위 장의 요소는 겹침 데이터로 미리 선언되어 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **장치** 다 — 브라우저가 화면 한 장을 한 번에
 * 칠하는 것이 아니라 층마다 따로 칠한 뒤 그 결과물(이미 칠해진 장)을 포개는
 * 것이 합성이라는 사실. definition 의 주어는 "합성기"이고 "칠한다"는 동사가
 * paint 걸음에만 걸리고 compose 걸음에는 걸리지 않는다는 것이 핵심이다.
 * 손잡이도 속성 선택도 없다 — 무엇이 다시 칠해지는가를 결정하는 판단은
 * 여기 없고, 완제품 `repaintCost`가 그 판단을 다룬다. 조각 `layerPromotion`은
 * 이 장치가 쓰이는 **결과**(같은 만큼 옮겼을 때 제 장은 다시 칠하지 않고
 * 미끄러지기만 한다)를 다루므로, 여기 definition 에는 결과나 이득 대신
 * "칠하기"와 "포개기"라는 두 동작이 서로 다른 일이라는 사실만 남겼다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const stackOfSheetsConcept: FacetConceptSource = {
  id: 'stackOfSheets',
  label: 'Painted Apart, Stacked Into One (Layers and Compositing)',
  canonicalFacet: 'facet:stackOfSheets',

  surface: {
    definition:
      'A compositor renders each layer onto its own separate sheet: painting fills a layer\'s sheet with its shapes and text, and compositing does not paint anything — it only lifts the already-painted sheets and stacks them from the bottom up, so an element covered by one above it is hidden by stacking order, not erased.',
    exemplarKeywords: [
      'compositing',
      'compositor',
      'paint layers',
      'GPU layers',
      'render surfaces',
      'layer tree',
      'stacking context',
      'z-index stacking order',
      'paint vs composite',
      'why compositing is cheap',
      'covered but not erased',
      'separate paint surfaces',
    ],
  },

  briefing: {
    observable: [
      'Layers are drawn as a row of separate transparent sheets, one per layer, each labeled with its id and z order; nothing is shared between sheets.',
      'A paint step fills only one sheet: its box shapes scale in from a corner and its text draws in from the left, while the other sheets stay exactly as they were.',
      'A compose step never draws a new shape. Instead the whole sheet for that layer visibly lifts off its row and travels down into a stacking frame, landing on top of whatever was placed there before it.',
      'An element from a lower layer that ends up covered keeps a dashed outline in the stacking frame rather than disappearing, so the reader can see it is present underneath, not deleted.',
      'A running count of total paint operations and how many were painted this step only changes during paint steps, and stays fixed during compose steps — compose adds to the covered count but never to the paint count.',
    ],

    screen: {
      affordances: [
        'The screen scrubs through a fixed sequence — three layers painted in turn, then composited from the bottom z upward — with no handle to change which layers or operations exist.',
        'A scrub control steps forward and back through the paint and compose events one at a time, so a reader can hold the moment a sheet lifts and compare it to the moment before.',
      ],
    },

    useWhen: [
      'The article says the browser "composites layers" and the reader has never seen what a layer is apart from the final picture — the sheet-per-layer view makes painting and stacking two visibly different operations rather than one blurred word.',
      'The reader needs to see why an element hidden behind another one is not gone: it was painted in full on its own sheet, and only got covered when a later sheet was stacked on top of it.',
    ],

    avoidWhen: [
      'The question is which CSS property change causes which layer to need repainting at all — that judgment about triggers and pipeline stages is not made here; every paint in this screen happens because the fixed script says to.',
      'The subject is deciding which elements the browser promotes onto their own layer in the first place, or the cost of having too many layers. The layer set here is given, not chosen or grown.',
      'The article is about z-index or stacking-context rules for authoring CSS. This shows the mechanism compositing performs once an order is already decided, not how that order is written.',
    ],

    contrastWith: [
      {
        concept: 'repaintCost',
        note: 'This holds the paint-then-stack machinery fixed and has no property choice at all; that varies a property across a page and shows the machinery decide how much of the pipeline reruns.',
      },
      {
        concept: 'layerPromotion',
        note: 'This is the general fact that any layer paints apart and only stacks in compositing; that is one payoff of it — a moved element on its own layer only gets re-stacked, while one sharing a layer gets repainted.',
      },
    ],
  },
};
