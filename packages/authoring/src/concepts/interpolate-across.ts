/**
 * interpolateAcross 개념 선언.
 *
 * canonical facet 은 `facet:interpolateAcross` — 10 × 9 격자 위 삼각형 A(0.6, 8.1) 빨강 · B(4.2, 0.4) 초록 · C(9.5, 5.8) 파랑.
 * 안쪽 칸 29. 꼭짓점 하나씩 제 색을 무게중심 몫만큼 모든 안쪽 칸에 붓고(걸음 1..3), 마지막에 칸 (5, 5) 를 읽는다 —
 * 몫 A 0.33 · B 0.20 · C 0.47, 색 (0.33, 0.20, 0.47). 처음 화면을 넣어 다섯 걸음. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `rasterization` 은 깊이만 보간해 누가 보이는지를 가른다. 이쪽은 **꼭짓점에만 있는 값이 안쪽 픽셀에서 무엇이 되는가**
 * 하나다 — 몫이 제 꼭짓점에서 1, 맞은편 모서리에서 0, 셋의 합이 1. definition 은 weighted mix · one at its own vertex ·
 * zero along the opposite edge · sum to one 을 쥐고, 덮는 칸 가르기(`triangleToPixels`) · 깊이 견줌(`depthTest`) ·
 * 가림(`rasterization`) 쪽 낱말을 쓰지 않는다.
 *
 * 전제 (설명 글 `interpolateAcross.md`): x 오른쪽 · y 아래, 칸 중심 표본 하나, top-left 규칙 없음(가장 작은 |λ| 0.005 이상).
 * 화면 공간 선형 보간 — 이 삼각형은 화면과 나란해 세 꼭짓점의 w 가 같으므로 원근 보정 보간과 값이 같다(29 칸 확인).
 * 색은 감마 없는 선형 0..1, 소수 둘째 자리로 보이고 반올림한 몫의 합은 다시 맞추지 않는다. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const interpolateAcrossConcept: FacetConceptSource = {
  id: 'interpolateAcross',
  label: 'Barycentric Interpolation of Vertex Colors Across a Triangle',
  canonicalFacet: 'facet:interpolateAcross',

  surface: {
    definition:
      'Barycentric interpolation gives each interior pixel a weighted mix of the three vertex values, where each weight is one at its own vertex, zero along the opposite edge, and the three weights sum to one.',
    exemplarKeywords: [
      'barycentric coordinates',
      'barycentric interpolation',
      'vertex attribute interpolation',
      'Gouraud shading',
      'varying in GLSL',
      'interpolated vertex colors',
      'RGB triangle',
      'hello triangle',
      'fragment shader inputs',
      'area ratio of sub-triangles',
    ],
  },

  briefing: {
    observable: [
      'A triangle on a 10 × 9 grid has 29 inside pixels, all black at first ("Only the three corners have a color"). The corners carry pure colours: A (1.00, 0.00, 0.00), B (0.00, 1.00, 0.00), C (0.00, 0.00, 1.00).',
      'Three steps pour one corner each: "Corner A pours its color into every inside pixel, weighted by its share". The corner\'s colour drop moves onto the corner, and a front line of equal share sweeps from the corner (share 1) to the opposite edge (share 0), adding colour to the pixels it passes.',
      'Each pixel shows the number for the corner being poured, and the pixel colour is the sum poured so far. A is strongest at (1, 7) with 0.87 and faintest at (8, 5) with 0.06; B runs from 0.83 at (4, 1) to 0.01 at (6, 6); C from 0.85 at (8, 5) to 0.02 at (1, 6).',
      'After the third corner every pixel\'s three shares add to 1, so the three colour channels add to 1 as well; the triangle ends as a red-green-blue blend with each corner\'s colour purest near it.',
      'The last step reads one pixel: "Reading pixel (5, 5) · center (5.5, 5.5)", shares A 0.33 · B 0.20 · C 0.47, "Sum: 1.00", mixed colour (0.33, 0.20, 0.47). The whole run is five steps counting the opening.',
      'A corner\'s share is the area of the small triangle formed by the pixel center and the opposite edge, divided by the whole triangle\'s area, computed with edge functions at the pixel center. The interpolation is linear in screen space; because this triangle faces the screen squarely, it gives the same values as perspective-correct interpolation. Colours are linear 0..1 with no gamma, shown to two decimals. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'The screen plays the three pours and the pixel reading by itself and stops.',
        'A Replay button and a playback strip sit below it. Dragging the strip to any pour holds the per-pixel shares of that corner alone.',
        'The corner colours, the probed pixel and every share are fixed, so an article can quote them exactly.',
      ],
    },

    useWhen: [
      'The article explains how a colour, normal or texture coordinate given only at three vertices gets a value at every pixel inside, and needs the weights shown as numbers in each pixel.',
      'A reader sees the classic red-green-blue triangle and asks why the middle comes out as a blend, and the article wants one pixel\'s three shares and resulting colour read out.',
    ],

    avoidWhen: [
      'The article is about perspective-correct interpolation or texture warping on tilted surfaces. This triangle faces the screen, so screen-space and perspective-correct results coincide.',
      'The subject is how pixels are chosen or in what order they are filled. The inside pixels are given at the start.',
      'The topic is lighting a surface from interpolated normals. Only colours are blended; no light is involved.',
      'The article is about which of two overlapping surfaces is visible. There is one triangle.',
    ],

    contrastWith: [
      {
        concept: 'rasterization',
        note: 'Interpolation produces a value per pixel from three vertices. Rasterizing overlapping surfaces uses that same blend for depth and then compares the results to decide visibility.',
      },
      {
        concept: 'triangleToPixels',
        note: 'Coverage uses only the signs of the three edge functions to say whether a pixel is inside; interpolation uses their sizes relative to the area to say how much of each vertex the pixel gets.',
      },
      {
        concept: 'normalDecidesBrightness',
        note: 'Brightness from a surface normal is about light meeting a slope; interpolation is about carrying any per-vertex value, a normal included, to the pixels between the vertices.',
      },
    ],
  },
};
