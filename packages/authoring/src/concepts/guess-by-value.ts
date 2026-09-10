/**
 * guessByValue 개념 선언.
 *
 * canonical facet 은 `facet:guessByValue` — 한 배열을 두 줄이 나란히 훑는다.
 * 위 줄은 늘 가운데를 짚고, 아래 줄은 양 끝 값으로 자를 세워 찾는 값이 그 자
 * 위 어디쯤인지 잰 뒤 같은 비율의 자리로 선을 떨어뜨린다. 미끄러짐과 떨어짐,
 * 두 움직임이 이 조각의 동사다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서 갈라 둔 자리
 *
 * 이 조각이 지는 것은 **값 자체가 자리에 대한 정보를 준다** 는 착상 하나다.
 * 비율을 자리 번호로 옮기는 그 순간을 자와 낙하로 보이고 멈춘다.
 * 식의 생김새 · 정수 나눗셈의 차례 · 구간 밖 값을 막는 부등식 · 치우친 자료의
 * 최악은 완제품 `interpolationSearch` 가 지므로 definition 에서 뺐다.
 *
 * 변별어를 붙인 이유: "guess" 만으로는 무엇을 근거로 짐작하는지가 남지 않는다.
 * 자리가 아니라 **값** 을 근거로 삼는다는 것이 이 조각의 전부다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const guessByValueConcept: FacetConceptSource = {
  id: 'guessByValue',
  label: 'The Value Says Where to Look',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:guessByValue',

  surface: {
    definition:
      'When numbers are evenly spaced, the value being sought carries information about its index, so a proportion measured against the endpoints lands on a slot directly.',
    exemplarKeywords: [
      'the value itself is a hint',
      'guessing where a number sits',
      'proportional position',
      'evenly spread values',
      'uniform distribution of keys',
      'a scale between two endpoints',
      'fewer probes than halving',
      'the middle ignores what you are looking for',
      'estimating an index from a key',
      'using the key and not only the index',
    ],
  },

  briefing: {
    observable: [
      'Two lanes run over the same array of ten values, and both are looking for the same number, so every difference on screen comes from the method and not from the data.',
      'The upper lane covers its remaining interval with a bar and jumps a cursor to the middle of it; each probe drops half the bar away, and it reaches the answer on its third seat after 50 and 80.',
      'The lower lane raises two uprights from the end cells to stand a scale, and the number being sought slides along that scale until it stops at its own height — the measuring is a movement the reader can follow.',
      'From that height a line falls straight down onto one cell, which is the moment the picture exists for: a proportion becoming a slot number.',
      'The scale ends are pinned to the centres of the first and last cells, so on evenly spaced values the dropped line meets a cell centre exactly and arrives without bending.',
      'The closing caption sets one probe against three and says the value itself pointed the way, with both lanes\' marks still on screen to be counted.',
    ],

    screen: {
      affordances: [
        'The screen plays both lanes on its own and stops on the closing count.',
        'Two buttons: replay, and a step button. The first press of the step button rewinds and shows the first move in the same press, and each press after that advances one moment.',
        'The ten values step by ten and the target is 90, so the article can name the three middle probes and the single aimed one.',
        'Stepping is how the reader holds the moment the slide stops and before the line falls, which is where the whole idea sits.',
      ],
    },

    useWhen: [
      'The reader is satisfied with halving and sees no room above it. Putting a method that ignores the sought value beside one that reads it, on one array, is what opens that room.',
      'The article needs the reader to feel that a key carries positional information at all, before any formula that exploits it will look like anything but algebra.',
      'The prose is about to trade a guarantee for an assumption, and the reader should first see what the assumption buys when it holds.',
    ],

    avoidWhen: [
      'The article uses "interpolation" for estimating values between known samples — lerp, curve fitting, resampling a signal.',
      'The subject is the formula as written code: the order of multiplication and division, truncation, guarding against a target outside the endpoint values.',
      'The point is what happens on clustered or skewed data. Everything here is evenly spaced and the aim lands, so the screen would work against the passage.',
      'The keys in the article cannot be measured against one another as quantities — strings, identifiers, hashes.',
      'The collection is unsorted, or is scanned from one end regardless of what is being sought.',
    ],

    contrastWith: [
      {
        concept: 'interpolationSearch',
        note: 'The same aim written out as a formula and run to completion, with the bounds test and the cost when the spacing assumption fails.',
      },
      {
        concept: 'halveTheRange',
        note: 'Halving is what the upper lane here is doing: it shrinks by the same factor whatever the numbers are, because it never reads the one it is looking for.',
      },
      {
        concept: 'binarySearch',
        note: 'Both narrow a sorted array by probing and discarding, but one chooses its probe from indices alone and the other from the values sitting at them.',
      },
    ],
  },
};
