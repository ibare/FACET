/**
 * shadowRay 개념 선언.
 *
 * canonical facet 은 `facet:shadowRay` — 바닥 위의 점 다섯이 차례로 점광 (0, 4) 쪽으로 광선을 쏜다.
 * 빛까지의 거리 d 안에서 무엇에 걸리면 그림자(점 1 · 2, 공), 걸리지 않거나 d 너머에서 걸리면 빛을 받는다
 * (점 3 · 4, 그리고 빛 너머 풍선에 걸린 점 5). 끝에 빛 받음 3 · 그림자 2. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `rayTracingBase` 는 닿는 자리가 굴절률로 옮겨 가면 그림자 판정도 따라간다는 것을 보인다.
 * 이쪽은 **길이 막혔는가, 그리고 빛보다 먼 것은 막지 않는다** 하나다. definition 은 blocked · before the
 * light · distance to the light · same surface orientation 을 쥐고, closest · pixel · refraction 을 쓰지 않는다.
 * shading 묶음의 `normalDecidesBrightness` 와는 "면의 기울기 ↔ 길의 막힘" 으로 갈린다.
 *
 * 전제 (설명 글 `shadowRay.md`): 2D 옆모습, 점광 하나(가장자리 흐림 없음). 밝기는 보임 0 / 1 만 센다 —
 * N·L 을 곱하지 않는다. ε = 0.0001, 바닥 자신은 시험하지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shadowRayConcept: FacetConceptSource = {
  id: 'shadowRay',
  label: 'Shadow Ray (Is the Path to the Light Blocked?)',
  canonicalFacet: 'facet:shadowRay',

  surface: {
    definition:
      'A point is in shadow when a ray from it toward the light hits something before reaching the light; objects past the light do not block, and surface angle plays no part.',
    exemplarKeywords: [
      'shadow ray',
      'shadow feeler',
      'occlusion test',
      'light visibility test',
      'hard shadows from a point light',
      'any-hit query',
      'hit distance less than distance to light',
      'shadow acne epsilon offset',
      'why is this point in shadow',
      'Whitted shadows',
    ],
  },

  briefing: {
    observable: [
      'On the left, a side view: a Floor with five numbered points, a Light above at (0, 4), a Ball between them and a Balloon floating higher than the light. On the right, a straightened "Path to light" axis marked in t from 0 to 10. It opens with "Each floor point will send one ray toward the light." and "Lit: 0 · Shadow: 0".',
      'Each step grows one ray from a point toward the light and lays the same ray out on the t axis, where the distance to the light, d, marks the end of the path.',
      'Point 1: "Ball: t 2.25 < d 5.00" — the ray stops at the ball, the rest of its path stays dotted, and "Light reaching point 1: 0". Point 2 likewise: "Ball: t 1.82 < d 4.27", light 0.',
      'Points 3 and 4 reach the light untouched ("Ball: no hit · Balloon: no hit", d 4.00 and d 4.27); light 1 for each.',
      'Point 5\'s ray passes the light and hits the Balloon, but "Balloon: t 7.00 ≥ d 5.00" puts that hit outside the path, so "Light reaching point 5: 1".',
      'The run ends at "Lit: 3 · Shadow: 2". All five points lie on the same flat floor with the same normal (0, 1); only whether the path is blocked separates them.',
      'Setup the screen does not footnote: a 2D side view with a single point light, so shadow edges are hard; brightness counts visibility only, 0 or 1, without multiplying by N·L or distance; only hits with t above ε = 0.0001 count, and the floor itself is not tested. Both objects are tested for every point to show the t values, although any one hit before the light would be enough.',
    ],

    screen: {
      affordances: [
        'The screen plays its steps on its own, one floor point per step, and stops after point 5.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip between point 1 and point 5 sets a hit inside the path beside a hit beyond the light.',
        'The floor, the light and both objects are fixed, so every t and d can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains how a ray tracer decides shadow and wants the test stated as a comparison between the hit distance and the distance to the light.',
      'A reader wonders why points on the same flat floor differ in brightness, or why an object behind the light casts no shadow; the five points answer both with fixed numbers.',
    ],

    avoidWhen: [
      'The article is about soft shadows, area lights or penumbrae. The light is a single point and the shadow is all or nothing.',
      'The subject is shadow mapping in a rasterizer, which answers the same question from a depth texture rendered from the light.',
      'The point is how surface angle or distance dims light. Brightness here is only 0 or 1.',
    ],

    contrastWith: [
      {
        concept: 'normalDecidesBrightness',
        note: 'Surface orientation dims light gradually as a face turns away; a shadow ray decides all or nothing by whether anything stands between the point and the light. The first depends on the face, the second on the path.',
      },
      {
        concept: 'nearestHit',
        note: 'Finding what a pixel shows needs the closest of all intersections; deciding shadow only needs any intersection closer than the light, so the search can stop at the first one.',
      },
      {
        concept: 'rayTracingBase',
        note: 'The visibility test answers for one fixed point. In a full trace the point is wherever the ray landed, so anything that moves the landing also changes the shadow verdict.',
      },
    ],
  },
};
