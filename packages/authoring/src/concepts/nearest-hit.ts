/**
 * nearestHit 개념 선언.
 *
 * canonical facet 은 `facet:nearestHit` — 위에서 내려다본 광선 하나가 구 다섯을 목록 차례로 시험한다.
 * 구마다 이차식의 근 둘이 나오고, ε 보다 큰 근 가운데 작은 것이 "지금까지 가장 가까운 t" 보다 작을 때만
 * 그 값이 바뀐다. 끝에 픽셀은 가장 작은 t 의 구(빨강, 4.13) 색을 받는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `shootRayPerPixel` 은 칸마다 광선 하나(격자 쪽), 이쪽은 **광선 하나 위에서 여럿 가운데 하나를 고른다**
 * (광선 쪽). `shadowRay` 는 아무것 하나만 걸리면 되는 쪽이라 가장 가까운 것을 고를 일이 없다.
 * definition 은 closest · smallest positive t · list order does not matter · behind the eye 를 쥐고,
 * pixel center · grid · light 를 쓰지 않는다. raster 묶음의 `depthTest` 와는 "픽셀마다 깊이를 견줌 ↔
 * 광선 하나의 첫 교차" 로 갈린다.
 *
 * 전제 (설명 글 `nearestHit.md`): 눈 원점, 방향 (0, 0, −1), ε = 1e−4. 색은 조명 없이 물체 색(선형 0..1).
 * 같은 t 로 비기는 경우는 자료에 없다 — 규약으로는 먼저 온 것이 남는다(엄격히 작을 때만 바꿈).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const nearestHitConcept: FacetConceptSource = {
  id: 'nearestHit',
  label: 'Nearest Hit Along a Ray',
  canonicalFacet: 'facet:nearestHit',

  surface: {
    definition:
      'When a ray crosses several objects, the tracer keeps only the smallest positive intersection distance t among them, and the pixel shows the object at that closest hit.',
    exemplarKeywords: [
      'closest hit',
      'nearest intersection',
      't_min t_max',
      'hit record',
      'ray-sphere intersection quadratic',
      'discriminant negative means miss',
      'ignore intersections behind the camera',
      'epsilon to avoid self-intersection',
      'visible surface along a ray',
      'hittable list',
    ],
  },

  briefing: {
    observable: [
      'A top-down view of one ray leaving the eye toward a pixel, with five spheres listed and numbered at the top: 1 blue, 2 yellow, 3 red, 4 green, 5 purple. It opens with "Test the spheres in list order." and "Nearest t so far: none."',
      'A thick line from the eye runs out to the nearest t so far and ends in a bar. Each test sends the sphere\'s two roots out along the ray to their places.',
      'Blue sphere: roots 7.50 · 10.50, and the caption reads "Nearest t: none → 7.50." — the bar lands at 7.50.',
      'Yellow sphere: roots −4.00 · −2.00, "Both roots ≤ ε (behind the eye), dropped. Nearest t stays 7.50."',
      'Red sphere: roots 4.13 · 5.87, "Smaller root 4.13 < nearest t 7.50. Nearest t becomes 4.13." The bar moves back toward the eye and the thick line gets shorter — the first sphere in the list is displaced.',
      'Green sphere: roots 5.73 · 7.27, "Smaller root 5.73 ≥ nearest t 4.13. Nearest stays." Purple sphere: "no roots, the ray misses."',
      'The run ends at "Pixel color: red sphere (0.900, 0.300, 0.300)" and "from the nearest hit, t 4.13.", the colour travelling back along the ray to the pixel. The nearest t goes none → 7.50 → 7.50 → 4.13 → 4.13 → 4.13: it only shrinks or stays, and the list order has no say in who wins.',
      'Setup the screen does not footnote: the eye is at the origin and the ray points along (0, 0, −1); each sphere gives two roots of |O + tD − C|² = r², and only roots above ε = 0.0001 count. The value is replaced only when strictly smaller, so an exact tie would keep the earlier object; no tie occurs in this data. Colours are the flat object colour, with no lighting.',
    ],

    screen: {
      affordances: [
        'The screen plays its steps on its own, one sphere per step, and stops after the pixel takes its colour.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip across the red sphere\'s step shows the bar pulling back from 7.50 to 4.13.',
        'The ray and the five spheres are fixed, so every root and every nearest-t value can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader assumes the first object tested, or the first in the scene list, is the one that shows. The red sphere, third in the list, overtaking the blue one settles it.',
      'The article explains the closest-hit loop in a ray tracer — why roots behind the eye are thrown away and why the running minimum is only ever lowered.',
    ],

    avoidWhen: [
      'The article is about a depth buffer over a whole image or about drawing triangles; only one ray and one pixel are shown here.',
      'The subject is shadow or occlusion rays, where any hit before the light is enough and the closest one does not matter.',
      'The point is acceleration structures such as BVHs or kd-trees. All five objects are tested one by one; nothing is skipped.',
    ],

    contrastWith: [
      {
        concept: 'depthTest',
        note: 'Both keep the nearer surface. A depth buffer stores one depth per pixel and compares every surface drawn into it; the closest-hit rule lives on a single ray and compares intersection distances along it.',
      },
      {
        concept: 'shootRayPerPixel',
        note: 'Assigning one ray to each pixel settles which ray answers for a pixel. Choosing the closest intersection settles which object that ray reports when several lie along it.',
      },
      {
        concept: 'shadowRay',
        note: 'A visible-surface ray must find the closest of all its hits; a shadow ray can stop at the first hit of any kind short of the light, because only whether the path is blocked matters.',
      },
      {
        concept: 'rayTracingBase',
        note: 'Picking the closest hit is one decision made for one ray segment. A whole trace makes it again every time a ray is bent and sent on.',
      },
    ],
  },
};
