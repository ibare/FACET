/**
 * vectorNormalize 개념 선언.
 *
 * canonical facet 은 `facet:vectorNormalize` — 한 주장을 말하는 조각(piece) facet.
 * 화살표 넷 p (3, 4) · q (−2.4, 1.8) · r (0, −2) · s (0.3, −0.4) 가 하나씩 제 길이로 나뉘어 길이 1.00 에 모이고,
 * 각은 나누기 앞뒤가 같다. 긴 셋은 줄고 짧은 s 는 늘어난다.
 *
 * ── 묶음 안에서의 자리 (가 · 벡터와 그래프 — 완제품 없음, origin vector-ops)
 *
 * 이쪽은 **여럿이 저마다 다른 수로 나뉘어 한 길이에 모이는 것** 을 쥔다 — 단위 벡터 · 제 길이로 나눈다 ·
 * 길이 1 · 방향만 남는다 낱말을 독점한다. 한 화살표에 k 를 곱해 가는 것은 vectorScale 의 말이다.
 * 코사인 닮음은 이웃 분야 angleNotLength 가 쥐므로 definition 에 닮음 · 비교 낱말을 넣지 않는다.
 *
 * 전제: 네 화살표는 예로 정한 값 · 표시는 소수 둘째 반올림 · 영벡터는 정규화할 수 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const vectorNormalizeConcept: FacetConceptSource = {
  id: 'vectorNormalize',
  label: 'Normalizing Vectors to Unit Length',
  canonicalFacet: 'facet:vectorNormalize',

  surface: {
    definition:
      'Normalizing divides each vector by its own length, so long vectors shrink, short ones grow, and all end at length one with only their directions left to tell them apart.',
    exemplarKeywords: [
      'normalize a vector',
      'unit vector',
      'vector normalization',
      'divide by the norm',
      'L2 normalization',
      'magnitude one',
      'direction vector',
      'unit circle',
      'normalized embeddings',
      'v / |v|',
    ],
  },

  briefing: {
    observable: [
      'Four arrows start from the origin at their own lengths: `p (3, 4)` 5.00, `q (−2.4, 1.8)` 3.00, `r (0, −2)` 2.00, `s (0.3, −0.4)` 0.50, with a dashed circle of radius 1. The first caption reads "Divide each arrow by its own length."',
      'One arrow per step is divided by its length: `p ÷ 5.00 → (0.60, 0.80)`, `q ÷ 3.00 → (−0.80, 0.60)`, `r ÷ 2.00 → (0.00, −1.00)`, `s ÷ 0.50 → (0.60, −0.80)`. Each arrow slides along its own line until its head touches the circle; the original head stays behind as a hollow dot.',
      'The factor applied is shown as "Shrinks: ×0.20", "×0.33", "×0.50" for the three long arrows and "Grows: ×2.00" for `s`, which was shorter than 1.',
      'After each division the length reads `1.00` — recomputed from the new components, not written in — and the angle reads the same before and after ("Angle: 53.1° → 53.1°").',
      'A side panel lays the four lengths on one ruler whose bars end, one by one, at the mark 1. The last frame lists "Lengths: 1.00 · 1.00 · 1.00 · 1.00" and "Angles: 53.1° · 143.1° · −90.0° · −53.1°".',
      'The four vectors are example values spread from 0.5 to 5 so both shrinking and growing appear; values are rounded to two decimals. The zero vector has no length to divide by and is not among them.',
    ],

    screen: {
      affordances: [
        'The screen plays five steps by itself (the first frame counted) and stops after `s` is normalized.',
        'A Replay button and a playback strip sit below; the last step is the one that shows normalizing is "fit to 1", not "make smaller".',
      ],
    },

    useWhen: [
      'The reader assumes normalizing means shrinking. The short arrow `s` growing by ×2.00 to reach length 1 corrects that.',
      'An article is about to compare vectors by direction alone — cosine similarity, normalized embeddings, direction vectors in graphics — and needs the preceding step, removing length, shown on its own.',
    ],

    avoidWhen: [
      'The subject is data normalization in the statistical sense — min–max scaling, z-scores, feature standardization. This divides a geometric vector by its length.',
      'The topic is database normalization or normal forms.',
      'The article needs a similarity score or a ranking between vectors. The screen stops once every vector has length one; nothing is compared.',
    ],

    contrastWith: [
      {
        concept: 'vectorScale',
        note: 'Scaling multiplies one vector by freely chosen factors and its length follows each one; normalizing lets each vector’s own length decide its factor so that all end at one.',
      },
      {
        concept: 'angleNotLength',
        note: 'Cosine similarity compares vectors after length has been divided out; normalization is that division alone, before any comparison is made.',
      },
    ],
  },
};
