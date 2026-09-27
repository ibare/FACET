/**
 * ambientDiffuseSpecular 개념 선언.
 *
 * canonical facet 은 `facet:ambientDiffuseSpecular` — 퐁 반사 모델에서 한 점의 색이 바탕빛 · 퍼진빛 · 번쩍임 세 몫의
 * 합으로 차례로 얹힌다. 빨간 물체 (0.9, 0.2, 0.1) · 흰 빛 · 빛 L 은 법선에서 40° 한쪽, 눈 V 는 30° 다른 쪽.
 * 까만 점 (0, 0, 0) 이 (0.135, 0.030, 0.015) → (0.618, 0.137, 0.069) → (반사 방향 R, 색 그대로) → (0.852, 0.372, 0.303).
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `brdf`(완제품)는 번쩍임 한 몫의 모형을 둘 견준다. 이쪽 주장은 **색은 세 몫의 합이고, 몫마다 따르는 것 ·
 * 띠는 색이 다르다** 하나다. definition 은 ambient · sum · object color · light color · 세 항의 이름을 독점하고,
 * 완제품의 peak · total · gloss 도, 이웃 조각의 기울기 · 몫 가르기 · 재질 값 · 방향마다 잼도 쓰지 않는다.
 *
 * 전제 (설명 글 `ambientDiffuseSpecular.md`): k_d 0.7 · k_s 0.3 · n 16, 에너지 보존을 맞추지 않는 경험식.
 * 감마 없는 선형 값, 이 데이터에서는 합이 1 을 넘지 않아 자르기가 없다. 거리 감쇠 없음. 한 점 한 식 — 보간 없음.
 * 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const ambientDiffuseSpecularConcept: FacetConceptSource = {
  id: 'ambientDiffuseSpecular',
  label: 'Phong Reflection Model: Ambient + Diffuse + Specular',
  canonicalFacet: 'facet:ambientDiffuseSpecular',

  surface: {
    definition:
      'In the Phong reflection model a point\'s color is the sum of three terms: ambient ignores direction, diffuse follows N·L and takes the object color, specular follows R·V and takes the light color.',
    exemplarKeywords: [
      'Phong reflection model',
      'ambient diffuse specular',
      'ADS lighting',
      'three lighting terms',
      'specular highlight is white',
      'why highlights take the light color',
      'reflection vector R = 2(N·L)N − L',
      'shininess exponent',
      'lighting equation in a fragment shader',
      'GLSL Phong lighting',
      'classic OpenGL lighting',
    ],
  },

  briefing: {
    observable: [
      'One point on a surface with its normal N pointing up, the light L 40° to one side of the normal and the eye V 30° to the other. The object color is red (0.9, 0.2, 0.1) and the light is white. Beside it stand three columns for the red, green and blue channels, starting at 0.000 under "A black point: no part added yet."',
      'Ambient is added first: the object color times an ambient light of 0.15 per channel, (0.135, 0.030, 0.015). It does not depend on where the light or eye is.',
      'Diffuse is added next, following N·L = 0.766 and carrying the object color, so its channels keep red\'s ratio: (0.483, 0.107, 0.054), bringing the point to (0.618, 0.137, 0.069).',
      'A separate step finds the reflection direction R = 2(N·L)N − L, 40° to the eye\'s side of the normal and 10° from the eye, with R·V = 0.985. The color does not change on this step.',
      'Specular is added last, following (R·V)^16 = 0.783. It takes the light\'s white rather than the object\'s red, so all three channels rise by the same 0.235 and the red point turns whitish at (0.852, 0.372, 0.303).',
      'Each part flies into the columns from where it comes from — ambient from the point, diffuse from the tip of the light, specular from the tip of R — and no channel ever goes down. Five steps counting the opening.',
      'Values used: k_d = 0.7, k_s = 0.3, shininess 16. This is the empirical Phong model and makes no attempt at energy conservation. Colors are linear with no gamma, and here the sum never passes 1 in any channel, so nothing is clipped. There is no distance falloff and no interpolation across a surface — one point, one equation.',
    ],

    screen: {
      affordances: [
        'The screen plays its five steps on its own and stops once the specular part is added.',
        'A Replay button and a playback strip sit below it. Dragging the strip back between the diffuse step and the specular step shows the one moment when the channels stop following the object\'s color ratio.',
        'All vectors and colors are fixed, so every angle, dot product and channel value can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces the classic lighting equation and wants each of its three terms tied to what it depends on, with numbers a reader can add up by hand.',
      'A reader asks why a shiny red ball has a white highlight; seeing the specular term raise all three channels equally while diffuse stays red answers it.',
    ],

    avoidWhen: [
      'The topic is Phong shading or Gouraud shading as ways of interpolating across a triangle. This is the reflection model at a single point; nothing is interpolated.',
      'The article is about physically based materials, Fresnel or energy conservation. The coefficients here are the empirical Phong ones and do not conserve energy.',
      'The point is how brightness falls as a surface tilts away from the light. N·L appears here as one fixed value only.',
    ],

    contrastWith: [
      {
        concept: 'brdf',
        note: 'The three-term sum explains how a color is assembled. Comparing reflection models focuses on the specular term alone and on whether its exponent keeps or loses the light it reflects.',
      },
      {
        concept: 'normalDecidesBrightness',
        note: 'The diffuse term depends on N·L; why a smaller N·L means less light per spot on the surface is a separate claim about geometry, which the sum simply takes as an input.',
      },
      {
        concept: 'energyConserving',
        note: 'Adding independent diffuse and specular terms with fixed weights is exactly what energy conservation forbids: there the diffuse share can only use what the specular share leaves behind.',
      },
    ],
  },
};
