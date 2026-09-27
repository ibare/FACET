/**
 * globalIllumination 개념 선언.
 *
 * canonical facet 은 `facet:globalIllumination` — 가로세로 4 인 평면 방을 패치 열여섯(바닥 넷 · 오른쪽 초록 벽 넷 ·
 * 천장 넷 · 왼쪽 빨간 벽 넷)으로 나누고, 천장 가운데 두 패치가 빛을 낸다. 튐 하나마다 모든 패치가 앞 튐의 값으로
 * 함께 빛을 모으고(야코비 한 번), 방 전체에 더한 빛 A 가 쌓인 반사광 S 의 1 % 이하가 되는 첫 튐에서 멈춘다.
 * 손잡이 반사율 ρ(0.2 · 0.5 · 0.6 · 0.75 · 0.85, 처음 0.6)를 올리면 멈춘 튐이 4 → 8, 끝 바닥 평균이 0.045 → 0.272,
 * 바닥 왼쪽 f1 의 R − B 가 0.003 → 0.116 으로 함께 는다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 둘)
 *
 * `lightBouncesMany` 는 눈에서 나간 경로 하나가 튈 때마다 지나온 몫이 줄어 픽셀 합이 모이는 장면,
 * `colorBleeding` 은 한 번 더 튐에 빨간 벽의 빛이 흰 바닥에 묻는 장면이다. 이쪽은 경로도 조각별 모음도 없이
 * **방 전체의 되풀이** 를 돌리고, 주장은 **반사율이 모이는 데 드는 튐 수와 끝 밝기 · 번짐의 크기를 함께 정한다** 는
 * 대비다. 그래서 definition 은 radiosity · 모든 패치 · 되풀이 횟수 · 멈춤 문턱 · 반사율 손잡이 쪽 낱말을 쥐고,
 * 조각들이 독점한 path · vertex · throughput · pixel(앞 조각), white floor · tint · nearer(뒤 조각)를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `globalIllumination.md` 가 밝힌 것):
 *  - 평면(2 차원) 래디오시티다. 실제 방은 3 차원 면이고, 여기서는 형태 계수를 교차 끈(Hottel) 식으로 정확히 셈한다.
 *  - 면마다 패치 넷의 거친 나눔 · 패치 안의 빛은 고르다고 본다 · 모든 면이 완전 확산(람베르트), 거울 반사 없음.
 *  - 빨간 벽은 R 만, 초록 벽은 G 만 되돌리게 정해 R − B 가 곧 빨간 벽을 거쳐 온 빛이다.
 *  - 멈춤 규칙의 1 % 는 이 facet 이 정한 값 · 튐 하나 = 야코비 한 번 · 색은 선형 0..1 RGB, 감마 · 노출 없음.
 *  - 빛 패치도 반사해 1 을 넘는다(ρ 0.85 에서 1.14) — 칠할 때만 채널마다 1 로 자른다.
 *  - 바닥 평균이 튐마다 늘어난 몫은 곧게 줄지 않는다(ρ 0.6: 0.132 · 0.009 · 0.014 …). 줄어드는 것은 방 전체로 더한 빛이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const globalIlluminationConcept: FacetConceptSource = {
  id: 'globalIllumination',
  label: 'Global Illumination (Radiosity Bounces and Reflectance)',
  canonicalFacet: 'facet:globalIllumination',

  surface: {
    definition:
      'In a radiosity solution iterated over every patch of a room at once, higher reflectance means more iterations before a pass adds under a set fraction of the light gathered so far, and brighter, more color-shifted indirect light.',
    exemplarKeywords: [
      'global illumination',
      'radiosity',
      'radiosity iteration',
      'Jacobi iteration',
      'progressive refinement',
      'rendering equation',
      'indirect lighting',
      'interreflection',
      'albedo',
      'how many bounces are enough',
      'convergence threshold',
      'high albedo slows convergence',
      'Hottel crossed strings',
      'Cornell box',
    ],
  },

  briefing: {
    observable: [
      'A square 2D room on the left is cut into sixteen patches, four per side: the floor (floor 1 to floor 4 from left to right), a green wall on the right, the ceiling, and a red wall on the left. Only the two middle ceiling patches emit light, equally in R, G and B; they carry a light marker instead of bars.',
      'Every other patch has three thin bars, R · G · B, standing into the room; the legend reads "Bars: R · G · B of each patch · one patch length = 0.35". Floor and ceiling are white, the red wall returns only red, the green wall only green, each scaled by the reflectance ρ.',
      'At bounce 0 only the light patches glow. On each bounce every patch gathers at once from the values of the previous bounce, and all the bars grow together from their old length to the new one. The caption reads "Bounce k · added … · reflected … · floor mean … · floor 1 R − B …".',
      'A chart on the right plots the floor mean (the average brightness of the four floor patches) against bounce, on fixed axes of 0 to 8 bounces and 0 to 0.35, one point per bounce.',
      'With ρ 0.6 the light added to the whole room falls 0.751, 0.271, 0.104, 0.041, 0.016, 0.007, and the run ends on the line "Stop: bounce 6 added 0.007 ≤ 0.01 × 1.190 = 0.012". The floor mean ends at 0.159.',
      'At bounce 1 the floor is neutral: "floor 1 · R − B 0.000". From bounce 2 light returned by the red wall reaches it, and at ρ 0.6 the reading climbs 0.019, 0.030, … to 0.038.',
      'Across the five reflectances the run stops after 4, 5, 6, 7 and 8 bounces; the final floor mean goes 0.045, 0.126, 0.159, 0.220, 0.272; the final floor 1 R − B goes 0.003, 0.023, 0.038, 0.075, 0.116. A run takes about 6.6 seconds at 0.2 and 11.4 at 0.85.',
      'What shrinks every bounce is the light added to the whole room. The floor mean\'s own gain does not shrink steadily — at ρ 0.6 it is 0.132, then 0.009, then 0.014 — because floor patches cannot see one another and light that left the floor on bounce 1 returns only by way of the walls and ceiling.',
      'The model is a flat 2D cross-section with form factors computed exactly by Hottel\'s crossed-strings rule, four coarse patches per side, all surfaces perfectly diffuse, and one bounce equal to one Jacobi pass. The 1 % stopping rule is a chosen value. Colors are linear 0 to 1 RGB with no gamma; light patches also reflect and exceed 1 (up to 1.14 at ρ 0.85) and are clipped only when painted. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Play, Step, Pause and Reset with a speed slider, plus a five-position "Reflectance" handle (0.2, 0.5, 0.6, 0.75, 0.85, starting at 0.6) and two metrics, "Bounces" and "Floor redness ×1000". Each change of the handle restarts the run from bounce 0.',
        'The move that makes the idea land is stepping the reflectance upward: the chart line reaches higher and runs further right before the stop mark, the metrics go from 4 and 3 at 0.2 to 8 and 116 at 0.85, and the bars of floor 1 spread further apart, R over B.',
        'When the handle changes, the bars shrink back to the light patches only and the previous run\'s bar ends stay as dashed ticks ("Dashed = previous run"), so the new bars can be seen overshooting or falling short of them.',
        'The code panel, labelled "Radiosity", carries the same computation — fill the form factors, repeat `bounce` until the stopping test passes, return the bounce count — into Python, JavaScript, TypeScript, Java, C++ and C#, and its count and final values match the screen.',
      ],
    },

    useWhen: [
      'The article asks when a global illumination solver can stop bouncing and needs to show that the answer depends on how reflective the scene is — dark rooms settle in a few passes, bright ones need many more.',
      'A reader wants to see a whole-room radiosity solve as one loop: every patch updated together each pass, the added energy shrinking geometrically, and a relative threshold ending it.',
      'The article connects surface albedo to the look of indirect light — how much brighter a room gets and how much a colored wall shifts a neutral floor as reflectance rises.',
    ],

    avoidWhen: [
      'The article is about Monte Carlo path tracing, sampling noise, or Russian roulette. There are no rays, samples or random choices here; the whole room is solved deterministically, patch by patch.',
      'The subject is specular reflection, glossy BRDFs, caustics or refraction. Every surface here is perfectly diffuse.',
      'The point is shadows or occlusion between objects. The room is convex and empty, so every patch sees every other patch that is not on its own side.',
      'The article needs real 3D form factors (hemicube, Nusselt analog). This is a 2D cross-section whose form factors come from the crossed-strings rule.',
    ],

    contrastWith: [
      {
        concept: 'lightBouncesMany',
        note: 'Following one path explains why an endless series of bounces still sums to a finite brightness. Solving a whole scene adds the practical question of when to stop and how that stopping point moves with reflectance.',
      },
      {
        concept: 'colorBleeding',
        note: 'That light off a colored wall tints a white surface is the effect itself; here that effect is one outcome among several that grow together as reflectance rises, measured after the solution has settled.',
      },
      {
        concept: 'rayTracingBase',
        note: 'Classic Whitted-style ray tracing follows mirror and refracted rays and stops at direct light for diffuse surfaces. Global illumination counts light passed between diffuse surfaces as well, which is where the extra brightness and color transfer come from.',
      },
    ],
  },
};
