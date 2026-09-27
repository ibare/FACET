/**
 * lightBouncesMany 개념 선언.
 *
 * canonical facet 은 `facet:lightBouncesMany` — 가로 4 · 세로 2.5 인 평면 방(네 면 모두 반사율 0.6, 회색)에서
 * 눈 (0.5, 1.8) 이 광선 하나를 쏘고, 광선이 면에 닿을 때마다 꼭짓점이 하나 생긴다. 꼭짓점마다 빛을 곧장 보아 받은
 * 직접광에 지나온 몫(1 · 0.6 · 0.36 · 0.216 · 0.130)을 곱한 것이 픽셀 합에 붙는다. 더하는 몫은 0.267 → 0.063 으로
 * 줄고 합은 0.643 으로 모인다. 마지막 꼭짓점의 직접광(0.482)이 가장 크지만 더하는 몫은 가장 작다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `globalIllumination` 은 방 전체를 되풀이해 반사율이 멈추는 튐 수를 정하는 대비를, `colorBleeding` 은 색이
 * 옮는 장면을 맡는다. 이쪽은 **경로 하나** 위에서 "튐이 끝없어도 합이 끝없이 커지지 않는다 — 줄어드는 것은
 * 지나온 몫이다" 하나를 쥔다. 그래서 definition 은 path · eye · vertex · throughput · pixel · finite 를 독점하고,
 * 완제품의 radiosity · patch · iteration · threshold, 색 조각의 tint · colored 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `lightBouncesMany.md` 가 밝힌 것):
 *  - 한 경로의 값이다. 실제 경로 추적은 픽셀마다 경로를 여럿 쏘아 평균한다.
 *  - 튐 방향은 미리 뽑아 둔 값(닿은 면의 법선을 반시계로 45° · 30° · 15° · −60°) — 무작위 생성은 보이지 않는다.
 *  - 코사인 가중으로 뽑았다고 두어 튐마다 곱하는 것이 ρ 하나다. BRDF 의 방향별 퍼짐은 말하지 않는다.
 *  - 직접광 = (ρ/π) · 세기 10 · cos / 거리². 방이 볼록하고 빛이 안에 있어 그림자 셈이 없다(다음 사건 추정).
 *  - 꼭짓점 다섯(튐 넷)에서 멈추고 남은 몫은 버린다. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lightBouncesManyConcept: FacetConceptSource = {
  id: 'lightBouncesMany',
  label: 'Many Light Bounces Along One Path Converge',
  canonicalFacet: 'facet:lightBouncesMany',

  surface: {
    definition:
      'Along one path traced from the eye, each bounce multiplies the carried throughput by the reflectance, so every new vertex adds less direct light to the pixel and the sum stays finite.',
    exemplarKeywords: [
      'path tracing',
      'multiple bounces',
      'path throughput',
      'next event estimation',
      'direct light at each path vertex',
      'why path tracing converges',
      'infinite bounces finite brightness',
      'geometric series of reflectance',
      'Lambertian BRDF ρ/π',
      'cosine-weighted sampling',
      'inverse square falloff',
      'max bounce depth',
    ],
  },

  briefing: {
    observable: [
      'A 2D room four wide and 2.5 high with Floor, Ceiling, Left wall and Right wall, all grey with reflectance 0.6. A Light sits at (2.8, 2.2) with strength 10 and an Eye at (0.5, 1.8). The opening caption reads "One ray leaves the eye into the room." and the sum is 0.',
      'Each step the ray runs to the next surface and a numbered vertex appears there. Its direct light — what it receives straight from the Light — shows as a bar, which shrinks by the carried share and joins the end of a "Pixel brightness" bar under "This vertex · Direct … × carried …".',
      'The five vertices land on the floor, left wall, ceiling, floor and right wall. Their direct light is 0.267, 0.228, 0.275, 0.358, 0.482; the carried share is 1.000, 0.600, 0.360, 0.216, 0.130; the added amounts are 0.267, 0.137, 0.099, 0.077, 0.063.',
      'The running sum reads 0.267, 0.404, 0.503, 0.580 and finally "Sum: 0.643", with the last caption "Vertex 5 · Right wall · adds 0.063 · the path stops here".',
      'Direct light does not shrink — the last vertex, nearest the Light, has the most (0.482) yet adds the least (0.063). What shrinks is the carried share, and the path segments get thinner with every bounce to show it.',
      'The numbers are for one path only; real path tracing averages many paths per pixel. The bounce directions are preset (the surface normal turned 45°, 30°, 15° and −60° counterclockwise), and each bounce multiplies by the reflectance alone, as cosine-weighted sampling would give. Direct light is (ρ/π) × strength × cosine ÷ distance², the Light is visible from every vertex, and whatever remains after the fifth vertex is dropped. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its five vertices on its own and stops after the fifth. The room, the path and every number are fixed, so each can be quoted exactly.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip between the first and last vertex sets the largest added amount beside the largest direct light and shows they are at opposite ends of the path.',
      ],
    },

    useWhen: [
      'A reader worries that if light keeps bouncing forever a rendered pixel should grow without limit, and the article needs to show the added amounts shrinking while the sum levels off.',
      'The article explains path throughput — that a far vertex can be brightly lit and still matter little because of everything the path lost getting there.',
    ],

    avoidWhen: [
      'The article is about noise, variance or averaging many samples per pixel. Only one path is followed, with preset directions and no randomness.',
      'The subject is how a BRDF spreads light over directions, or glossy and mirror reflection. The walls here are grey and diffuse, and each bounce multiplies by the reflectance alone.',
      'The point is shadows or light being blocked. The Light is visible from every vertex in this room.',
      'The reader is meant to change the reflectance and watch the number of bounces needed shift. The value is fixed at 0.6.',
    ],

    contrastWith: [
      {
        concept: 'globalIllumination',
        note: 'Both rest on light losing a fixed fraction per bounce. Here that loss is followed along one path to show the sum is finite; solving a whole scene asks how many bounces are worth computing and how that number depends on reflectance.',
      },
      {
        concept: 'colorBleeding',
        note: 'Summing bounces is about how much brightness each extra bounce contributes. Color bleeding is about what that bounced light carries with it — the color of the surface it left.',
      },
      {
        concept: 'shadowRay',
        note: 'A shadow test decides whether a point receives direct light at all. Summing bounces takes each vertex\'s direct light as given and asks how much of it reaches the eye after the losses along the way.',
      },
      {
        concept: 'reflectAndRefract',
        note: 'A mirror or refracted ray continues in one direction set by the geometry. A diffuse bounce could leave in any direction, and its value comes from the reflectance multiplying what the path already carries.',
      },
    ],
  },
};
