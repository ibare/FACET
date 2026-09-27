/**
 * reflectDistribution 개념 선언.
 *
 * canonical facet 은 `facet:reflectDistribution` — 한 점에 빛이 +40° 쪽에서 들어오고, 나가는 쪽을 −80° 에서 +80° 까지
 * 20° 씩 아홉 번 재어 BRDF 값 f 를 셈한다. 0.104 · 0.600 · 1.846(거울 자리 −40°) · 0.600 · 0.104 · 그리고 바닥 0.095 넷.
 * 끝으로 (들어옴 +40°, 나감 −60°) 와 (들어옴 −60°, 나감 +40°) 를 맞바꿔 둘 다 0.600 (상반성). 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 이쪽 주장은 **BRDF 는 들어오는 방향과 나가는 방향 한 쌍마다 값을 주는 함수이고, 그 값은 거울 방향 둘레로 몰리며,
 * 두 방향을 맞바꿔도 같다** 이다. definition 은 outgoing direction · measured one by one · mirror direction ·
 * reciprocity · floor 를 독점하고, 완제품의 gloss · Phong 비교 · hemisphere total, 재질 조각의 metallic · roughness ·
 * 면 위 자리, 에너지 조각의 split 을 쓰지 않는다.
 *
 * 전제 (설명 글 `reflectDistribution.md`): 수정(정규화) 퐁 f = k_d/π + k_s(n + 2)/(2π) · max(0, cos α)^n,
 * k_d 0.3 · k_s 0.5 · n 20. f 는 BRDF 값 그 자체(1/sr)이고 cosθ 를 곱하지 않았다. 모든 방향은 법선을 품은 한 평면
 * 안, 부호 있는 각. +20° · +40° 는 바닥보다 백만분의 일 안쪽으로 커서 셋째 자리로는 같다. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const reflectDistributionConcept: FacetConceptSource = {
  id: 'reflectDistribution',
  label: 'BRDF: Value per Outgoing Direction and Reciprocity',
  canonicalFacet: 'facet:reflectDistribution',

  surface: {
    definition:
      'A BRDF gives a value for each pair of incoming and outgoing directions; measured one outgoing direction at a time, it gathers around the mirror direction, and swapping the two directions leaves it unchanged.',
    exemplarKeywords: [
      'bidirectional reflectance distribution function',
      'what is a BRDF',
      'f(ωi, ωo)',
      'Helmholtz reciprocity',
      'BRDF reciprocity',
      'mirror reflection direction',
      'specular lobe around the reflection direction',
      'modified Phong BRDF',
      'BRDF units 1/sr',
      'gonioreflectometer measurement',
    ],
  },

  briefing: {
    observable: [
      'One point on a surface with light coming in from +40°, and a Material card reading "k_d 0.3 · k_s 0.5 · n 20". A semicircle of outgoing directions is marked from −80° to +80° in 20° steps, with the Mirror position at −40°. Its radius is the largest value this material can produce, and a small inner semicircle is the floor. The opening reads "Light comes in at +40°."',
      'One outgoing direction is measured per step, from −80° toward +80°, and a line of length proportional to f is drawn there with its value: −80° gives 0.104, −60° gives 0.600, and −40°, the mirror of the incoming side, gives 1.846.',
      'Past the mirror position the value comes back down — 0.600 at −20°, 0.104 at 0° — and from +20° through +80° it stays on the floor, 0.095. The peak is 19.3 times the floor, so what reflects is gathered around the mirror direction.',
      'The last step swaps incoming and outgoing: "In +40° → out −60°: f 0.600" and "In −60° → out +40°: f 0.600". The two values are the same; this is reciprocity. Eleven steps counting the opening.',
      'The screen does not footnote its model: the modified Phong BRDF f = k_d/π + k_s·(n + 2)/(2π)·max(0, cos α)^n, where α is the angle between the outgoing direction and the mirror of the incoming one. f is the BRDF value itself, in 1/sr — not the outgoing intensity; no cos θ factor is applied. All directions lie in one plane containing the normal, as signed angles from it. The floor is k_d/π; the values at +20° and +40° are larger than the floor by less than one millionth, so they read the same to three decimals.',
    ],

    screen: {
      affordances: [
        'The screen plays its eleven steps on its own and stops after the swap.',
        'A Replay button and a playback strip sit below it. Dragging the strip across the steps from −80° to 0° shows the values rising to the mirror position and falling away again.',
        'The incoming direction, the nine outgoing directions and the material are fixed, so every value can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article defines what a BRDF is — a function of two directions rather than a single number — and needs to show it being evaluated direction by direction.',
      'A reader meets the term Helmholtz reciprocity and needs to see a concrete pair of directions swapped with the value unchanged.',
    ],

    avoidWhen: [
      'The article is about how bright a surface looks under a light. The values here are the BRDF itself, without the cosine factor or any light intensity applied.',
      'The subject is anisotropic materials or directions out of the plane of incidence. Everything here lies in a single plane.',
      'The point is how the highlight changes as a material gets glossier or rougher. The material is fixed at one setting.',
    ],

    contrastWith: [
      {
        concept: 'brdf',
        note: 'Defining a BRDF as a two-direction function with reciprocity describes the object. Comparing reflection models takes two specific formulas for that object and asks how their sharpness parameter trades peak against total.',
      },
      {
        concept: 'roughnessMetallic',
        note: 'Material parameters decide what a BRDF looks like; the BRDF is what those parameters produce at a single point, read per direction rather than across a surface.',
      },
      {
        concept: 'ambientDiffuseSpecular',
        note: 'The Phong sum returns one color for one fixed light and eye. A BRDF is the more general function behind its diffuse and specular terms, defined for every pair of directions.',
      },
    ],
  },
};
