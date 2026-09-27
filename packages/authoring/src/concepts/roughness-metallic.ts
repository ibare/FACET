/**
 * roughnessMetallic 개념 선언.
 *
 * canonical facet 은 `facet:roughnessMetallic` — 같은 평면 · 같은 점광원 (−3, 4) · 같은 눈 (3, 4) 앞에서 면 위 점
 * 아홉(x = −4 … 4)의 값(퍼진빛 + 번쩍임)을 셈한다. 바탕색은 금빛 (1.00, 0.71, 0.29). 재질 넷을 차례로 얹는다 —
 * 금속성 0 · 거칠기 0.4 → 금속성 1 → 거칠기 0.6 → 0.8. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 이쪽 주장은 **PBR 재질의 두 값이 제각기 다른 것을 바꾼다 — 금속성은 퍼진빛을 없애고 번쩍임을 바탕색으로 물들이며,
 * 거칠기는 번쩍임을 면 위로 번지게 하고 어둡게 한다** 이다. definition 은 metallic · roughness · base color · tint ·
 * spreads across the surface 를 독점하고, 완제품의 gloss exponent · Phong 비교 · hemisphere total,
 * 에너지 조각의 split · absorbed, 방향 조각의 outgoing direction · reciprocity 를 쓰지 않는다.
 *
 * 전제 (설명 글 `roughnessMetallic.md`): 쿡–토런스 꼴 — GGX D · Smith Schlick-GGX G(k = α/2) · Schlick F, α = 거칠기².
 * 비금속 F0 0.04, 금속은 바탕색. 퍼진빛은 (1 − F)(1 − 금속성) 만큼. 빛의 세기 E = π, 거리 감쇠 없음.
 * 값은 자르지 않은 선형 값(11.733 까지), 칠할 때만 값/(1 + 값) 으로 눌러 담는다 · 감마 없음. 윤곽은 면 위 자리마다의
 * 값이지 방향 분포가 아니다. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const roughnessMetallicConcept: FacetConceptSource = {
  id: 'roughnessMetallic',
  label: 'PBR Material Parameters: Metallic and Roughness',
  canonicalFacet: 'facet:roughnessMetallic',

  surface: {
    definition:
      'A physically based material is set by two values: metallic removes the diffuse color and tints the highlight with the base color, while roughness spreads the highlight across more of the surface and dims it.',
    exemplarKeywords: [
      'metallic-roughness workflow',
      'PBR material parameters',
      'metalness and roughness',
      'base color / albedo',
      'glTF metallicRoughness',
      'why metals have no diffuse',
      'colored reflections on gold',
      'rough surfaces blur the highlight',
      'Unreal Engine material roughness',
      'GGX specular',
      'dielectric vs conductor',
    ],
  },

  briefing: {
    observable: [
      'A flat surface with nine points at x = −4 … 4, a Light above at (−3, 4) and an Eye at (3, 4). The base color is gold (1.00, 0.71, 0.29). Each point\'s cell is painted with that point\'s value (diffuse plus highlight), and above the surface a contour traces the highlight\'s red channel at each point, with a "Half of peak" line. The opening reads "One surface, one light, one eye. No material yet."',
      'Metallic 0, roughness 0.4: the diffuse takes the base color — (0.768, 0.545, 0.223) at x = 0 — while the highlight is colorless, equal in all three channels, peaking at x = 0 with 0.473. "Points at half or above: 1".',
      'Metallic 0 → 1, roughness unchanged: the diffuse becomes (0.000, 0.000, 0.000) at every point and the highlight takes the gold color, (11.733, 8.332, 3.405) at the peak.',
      'Roughness 0.4 → 0.6 → 0.8 with metallic 1: the peak highlight in red falls 11.733 → 2.208 → 0.683, and the points at half the peak or above grow 1 → 3 → 7.',
      'On the last step the peak moves one point from the mirror position x = 0 (0.654) toward the light, to x = −1 (0.683): once the highlight spreads wide, the side that faces the light more directly wins. Five steps counting the opening; the caption names which value changed and which stayed.',
      'The screen does not footnote its model: Cook–Torrance style specular with a GGX distribution, Smith Schlick-GGX shadowing (k = α/2) and Schlick Fresnel, with α = roughness². F0 is 0.04 for a non-metal and the base color for a metal; diffuse keeps (1 − F)(1 − metallic). Light strength is π so a white Lambert surface facing the light reads 1; there is no distance falloff. Values are linear and unclipped (they pass 1); only for painting is each channel squeezed as value/(1 + value), and there is no gamma. The contour is a value per surface position, not a distribution over directions.',
    ],

    screen: {
      affordances: [
        'The screen plays its five steps on its own and stops after roughness 0.8.',
        'A Replay button and a playback strip sit below it. Dragging the strip across the metallic step shows the diffuse vanishing and the highlight turning gold with nothing else changed; dragging across the last three steps shows the highlight widening as it dims.',
        'The surface, light, eye and base color are fixed and only one value changes per step, so every readout can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces the metallic-roughness material model used by game engines and glTF, and needs each parameter shown changing one thing while the other stays put.',
      'A reader asks why gold reflections look gold while plastic highlights look white, or why a rougher material has a broader but dimmer highlight.',
    ],

    avoidWhen: [
      'The article is about textures, texture maps or how these values are painted per pixel. One uniform material covers the whole surface at each step.',
      'The subject is the shape of reflection over outgoing directions at one point. The values here are laid out across positions on the surface, not across directions.',
      'The point is tone mapping or gamma. The squeeze used for painting is a display convenience, not a tone-mapping operator under discussion.',
    ],

    contrastWith: [
      {
        concept: 'brdf',
        note: 'Metallic and roughness are the controls a material exposes. Comparing reflection models concerns the specular formula those controls feed into, and how it trades peak height against total.',
      },
      {
        concept: 'energyConserving',
        note: 'Energy conservation says the diffuse share only gets what the specular share leaves. Metallic takes that to its limit: a metal keeps no diffuse share at all.',
      },
      {
        concept: 'reflectDistribution',
        note: 'A BRDF describes how one point reflects into each outgoing direction. The material values determine that function, and the result is seen as where a highlight sits and how wide it is on a lit surface.',
      },
    ],
  },
};
