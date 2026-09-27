/**
 * colorBleeding 개념 선언.
 *
 * canonical facet 은 `facet:colorBleeding` — 가로세로 3 인 평면 방. 천장 전체가 빛(E = (1, 1, 1)), 왼쪽 빨간 벽
 * ρ (0.8, 0.1, 0.1), 오른쪽 흰 벽과 바닥 조각 셋 ρ (0.8, 0.8, 0.8). 직접광 걸음에서 바닥 셋은 무채색(R−G 0.000)이고,
 * 이어 바닥 1 · 2 · 3 이 차례로 두 벽의 빛을 모으자 R 이 G · B 위로 솟는다 — R−G 0.069 · 0.046 · 0.030,
 * 빨간 벽을 보는 몫 F 0.419 · 0.278 · 0.181 을 따라. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `globalIllumination` 은 반사율 손잡이로 멈추는 튐 수 · 끝 밝기 · 번짐 크기가 함께 움직이는 대비를,
 * `lightBouncesMany` 는 경로 하나에서 튐마다 더하는 몫이 줄어 합이 모이는 장면을 맡는다. 이쪽은 **색이 옮는다**
 * 하나를 쥔다 — 직접광만으로는 무채색인 흰 면이 색 있는 면이 되돌려 보낸 빛을 받아 물들고, 그 면을 더 많이 볼수록 더
 * 물든다. 그래서 definition 은 colored surface · white · tint · sees more 를 독점하고, 완제품의 iteration · threshold ·
 * reflectance 손잡이, 경로 조각의 path · throughput · pixel sum 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `colorBleeding.md` 가 밝힌 것):
 *  - 평면(2 차원) 래디오시티, 형태 계수는 교차 끈(Hottel). 볼록 방이라 가림이 없고, 한 직선 위의 바닥 조각끼리는 F = 0.
 *  - 한 번 더 튐만 — 바닥은 두 벽의 직접광 B₁ 만 모은다. 벽은 다시 모으지 않고 되풀이는 없다.
 *  - 색은 선형 0..1 RGB, 감마 없음. 소수 셋째 자리까지 보이나 셈은 반올림하지 않는다. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const colorBleedingConcept: FacetConceptSource = {
  id: 'colorBleeding',
  label: 'Color Bleeding (Colored Wall Tints a White Floor)',
  canonicalFacet: 'facet:colorBleeding',

  surface: {
    definition:
      'Diffuse light re-emitted by a colored surface carries its color, so a white surface nearby turns tinted, more strongly the more of the colored surface it sees; direct light alone leaves it neutral.',
    exemplarKeywords: [
      'color bleeding',
      'colour bleeding',
      'indirect diffuse color transfer',
      'red wall tints the floor',
      'why is the floor reddish near the wall',
      'Cornell box red and green walls',
      'diffuse interreflection',
      'form factor',
      'radiosity',
      'RGB per-channel reflectance',
      'direct lighting misses color bleeding',
    ],
  },

  briefing: {
    observable: [
      'A square 2D room: the whole ceiling is the Light, the left side is a Red wall, the right side a White wall, and the floor is cut into Floor 1, Floor 2 and Floor 3 from left to right. The opening caption reads "Six patches in a room. No light has spread yet." A list on the right, "Light leaving each patch (B)", gives each patch\'s RGB.',
      'In the direct-light step each patch gets ρ · F(→light) · E. The three floor pieces come out (0.320, 0.320, 0.320), (0.355, 0.355, 0.355) and (0.320, 0.320, 0.320), and the "R−G" under each floor bar group reads 0.000. The Red wall sends out (0.234, 0.029, 0.029) and the White wall (0.234, 0.234, 0.234).',
      'Then the floor pieces gather the walls\' light one at a time, with the caption "Gathering the walls\' light: Floor 1. Added light: (0.113, 0.044, 0.044)" and two F labels on the walls. The R bar of that piece rises above its G and B bars.',
      'Floor 1 ends at (0.432, 0.364, 0.364) with R−G 0.069, Floor 2 at (0.459, 0.413, 0.413) with 0.046, Floor 3 at (0.432, 0.403, 0.403) with 0.030 — the order of how much each sees of the Red wall, F 0.419, 0.278 and 0.181.',
      'All three floor pieces end with R above G = B, and the one nearest the Red wall is the reddest.',
      'The model is flat 2D radiosity with form factors from Hottel\'s crossed-strings rule; the room is convex so nothing is hidden, and floor pieces on one line see none of one another. Only one extra bounce is counted — the floor gathers the walls\' direct light, and the walls do not gather again. Colors are linear 0 to 1 RGB without gamma. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its steps on its own — the empty room, direct light, then Floor 1, 2 and 3 gathering — and stops. The room and every value are fixed, so each RGB triple and R−G can be quoted exactly.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip back to the direct-light step shows all three floor pieces neutral at R−G 0.000, and forward again shows the red arriving.',
      ],
    },

    useWhen: [
      'A reader asks why a white floor looks faintly red beside a red wall in a photo or a good render, when the lamp and the floor are both white.',
      'The article wants to show that a neutral surface lit only directly stays neutral, and that the tint appears only once light passed between surfaces is counted.',
      'The article explains that the amount of borrowed color follows how much of the colored surface a point can see.',
    ],

    avoidWhen: [
      'The article is about how many bounces a solver needs or when to stop iterating. Only one extra bounce is shown here, with no repetition.',
      'The subject is color from a colored light source, subsurface scattering, or chromatic aberration. The light here is white and the color comes from a diffusely reflecting wall.',
      'The point is ink or dye bleeding in printing or image compression artifacts. This is about light reflected between surfaces.',
    ],

    contrastWith: [
      {
        concept: 'globalIllumination',
        note: 'The tint on a neutral surface is the effect in isolation. Solving a whole scene to convergence treats it as one of several quantities that grow as reflectance rises, alongside total brightness and the number of bounces needed.',
      },
      {
        concept: 'lightBouncesMany',
        note: 'Color bleeding is about what bounced light carries — the color of the surface it left. Summing bounces is about how much each further bounce still contributes to brightness.',
      },
      {
        concept: 'rayTracingBase',
        note: 'Ray tracing that stops at direct light for diffuse surfaces leaves a white floor white. The tint exists only when light reflected from one diffuse surface onto another is counted.',
      },
    ],
  },
};
