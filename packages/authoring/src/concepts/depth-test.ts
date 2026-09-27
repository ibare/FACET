/**
 * depthTest 개념 선언.
 *
 * canonical facet 은 `facet:depthTest` — 10 × 7 격자의 칸 하나가 색 칸이자 깊이 칸이다. 버퍼는 모든 칸 1.00 에서 시작.
 * 판 A(열 0..6 · 행 1..4, 깊이 0.1 + 0.06x + 0.04y)가 한 행씩 먼저, 판 B(열 3..9 · 행 2..5, 깊이 0.95 − 0.04x − 0.06y)가
 * 그다음 한 행씩 들어온다. 새 깊이가 적힌 수보다 작을 때만 덮어쓰고 아니면 버린다. 처음 화면을 넣어 아홉 걸음,
 * 끝에 보이는 칸 A 22 · B 22, 덮어씀 6 · 버림 6. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `rasterization` 은 삼각형 두 개를 보간 깊이로 견주고 화가 알고리즘과 맞세운다. 이쪽은 **한 칸의 규칙** 하나다 —
 * 픽셀마다 지금까지 가장 가까운 깊이를 적어 두고 더 가까울 때만 덮는다, 그래서 그리는 차례가 끝 그림을 바꾸지 않는다.
 * definition 은 stores the nearest depth · smaller · draw order 를 쥐고, 덮는 칸 가르기(`triangleToPixels`) · 몫
 * (`interpolateAcross`) · 만나는 선 · 화가 알고리즘(`rasterization`) 쪽 낱말을 쓰지 않는다.
 *
 * 전제 (설명 글 `depthTest.md`): 깊이 0 가까움 · 1 멂. 판의 칸은 직사각형으로 주어지고(삼각형 덮기는 다루지 않는다),
 * 칸의 깊이는 판의 평면 식에 중심 (c + 0.5, r + 0.5) 을 넣은 값 하나. 같은 깊이는 데이터에 없다(겹친 칸 깊이 차 0.05 이상).
 * 반투명 없음, 색은 선형 0..1. "차례를 바꿔도 같다" 는 설명 글이 셈으로 확인한 것이고 화면은 A 다음 B 한 차례만 보인다.
 * 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const depthTestConcept: FacetConceptSource = {
  id: 'depthTest',
  label: 'Depth Test (Z-Buffer Keeps the Nearest Surface per Pixel)',
  canonicalFacet: 'facet:depthTest',

  surface: {
    definition:
      'A depth buffer stores the nearest depth seen so far at every pixel, and an incoming surface overwrites a pixel only when its depth is smaller, so draw order does not change the final image.',
    exemplarKeywords: [
      'z-buffer',
      'depth buffer',
      'depth testing',
      'glDepthFunc GL_LESS',
      'depth test in OpenGL',
      'Vulkan depth attachment',
      'occlusion per pixel',
      'nearer object hides the farther one',
      'draw order independence',
      'overdraw',
      'clear depth to 1.0',
    ],
  },

  briefing: {
    observable: [
      'A 10 × 7 grid is at once a colour grid and a depth grid: each cell is coloured by the plate that holds it and shows the number stored in the buffer. It opens with "Depth buffer, every cell: 1.00"; depth 0 is near and 1 is far.',
      'Plate A arrives one row per step through an "Incoming row" strip. The buffer is empty, so all four rows land — "Plate A · row 1 · Written: 7 · Overwritten: 0 · Discarded: 0" — and its depths grow to the right, 0.19 to 0.55 in row 1.',
      'Plate B then comes down row by row, its depths shrinking to the right. Where the two plates overlap (rows 2..4, columns 3..6) the two depths compete: when B\'s depth is smaller than the stored number it lands and overwrites A (yellow outline); otherwise B\'s cell is discarded, rises back to the incoming strip and stays there dashed.',
      'Row 2 of B reads "Written: 4 · Overwritten: 1 · Discarded: 3", row 3 "Written: 5 · Overwritten: 2 · Discarded: 2", row 4 "Written: 6 · Overwritten: 3 · Discarded: 1". The plates are tilted against each other, so A keeps three shared cells in row 2, two in row 3 and one in row 4 — the winning side moves one cell per row; neither plate is in front as a whole.',
      'After nine steps (counting the opening) the counters read "Plate A · visible cells: 22 · Plate B · visible cells: 22", with six cells overwritten and six discarded in all.',
      'Drawing B first and A second would give the same final buffer and the same visible cells in every cell; only the roles swap along the way — the six cells B overwrote become cells where A is discarded, and vice versa. The screen plays only the A-then-B order.',
      'Each plate\'s cells are given as a rectangle, and a cell\'s depth is the plate\'s depth plane evaluated at the pixel center — one sample. No two depths in the overlap are equal (they differ by at least 0.05), and there is no transparency. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'The screen plays both plates row by row by itself and stops after the last row of B.',
        'A Replay button and a playback strip sit below it. Dragging the strip to B\'s row 3 holds a row where two cells overwrite A and two are discarded side by side.',
        'The plates, depths and counts are fixed, so an article can quote every stored number exactly.',
      ],
    },

    useWhen: [
      'The article explains what a z-buffer does and needs one cell\'s rule — keep the nearest depth, overwrite only when nearer — shown with the actual numbers the buffer holds.',
      'A reader believes whatever is drawn last ends up on top, and the article needs discarded cells of the later plate next to overwritten ones in the same row.',
    ],

    avoidWhen: [
      'The article is about deciding which pixels a triangle covers. The plates arrive as given rectangles of cells.',
      'The subject is transparency or alpha blending, where drawing order does matter. Both plates are opaque.',
      'The topic is z-fighting, depth precision or near/far plane choice. Depths in the overlap never come close to equal.',
      'The article is about shadow maps or other uses of depth textures. This buffer only decides which plate shows in each cell.',
    ],

    contrastWith: [
      {
        concept: 'rasterization',
        note: 'The per-pixel comparison is the rule; rasterizing surfaces that pass through each other is where that rule earns its keep, because no whole-object order could produce the same picture.',
      },
      {
        concept: 'nearestHit',
        note: 'Both keep the closest surface. A depth buffer accepts surfaces in whatever order they arrive and compares one stored number per pixel; a ray tracer follows one ray and picks its first intersection among the objects it meets.',
      },
      {
        concept: 'triangleToPixels',
        note: 'Coverage decides which pixels a surface touches at all; the depth test takes those pixels as given and settles which surface keeps each one.',
      },
    ],
  },
};
