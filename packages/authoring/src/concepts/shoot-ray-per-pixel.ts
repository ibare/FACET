/**
 * shootRayPerPixel 개념 선언.
 *
 * canonical facet 은 `facet:shootRayPerPixel` — 8 × 6 격자의 칸마다 눈에서 광선 하나가 그 칸의 한가운데를
 * 지나 장면으로 나가고, 공에 맞았는지 · 아무것도 없는지가 그 칸의 색이 된다. 한 걸음에 한 줄씩 채운다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `rayTracingBase` 는 광선이 유리에서 꺾이고 그림자 판정을 받는 전체를 굴절률로 돌린다. 이쪽의 주장은
 * 하나 — **칸 하나에 광선 하나, 광선이 만난 것이 칸의 색** 이다. 그래서 definition 은 one ray per pixel ·
 * center of the pixel · eye · grid 를 쥐고, 가장 가까운 것 고르기(nearest · smallest t) · 꺾임 · 빛까지의
 * 길을 쓰지 않는다. 물체가 하나뿐이라 가장 가까운 것을 고를 일도 없다.
 *
 * 전제 (설명 글 `shootRayPerPixel.md`): 눈 원점 · −z 를 본다 · 화면 판 z = −1 · 칸 중심 +0.5 · 줄 0 이 맨 위.
 * 색은 물체 색 그대로(셰이딩 없음), 선형 0..1, 감마 없음. 칸당 광선 하나(앤티에일리어싱 없음).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shootRayPerPixelConcept: FacetConceptSource = {
  id: 'shootRayPerPixel',
  label: 'One Ray Through Each Pixel',
  canonicalFacet: 'facet:shootRayPerPixel',

  surface: {
    definition:
      'Ray casting forms an image by sending one ray from the eye through the center of every pixel; each pixel takes the color of whatever its ray meets, or the background.',
    exemplarKeywords: [
      'ray casting',
      'primary ray',
      'camera ray',
      'eye ray',
      'generate a ray for each pixel',
      'pixel center plus 0.5',
      'image plane',
      'screen space to world space ray',
      'ray-sphere intersection',
      'jagged edges without anti-aliasing',
      'Ray Tracing in One Weekend',
    ],
  },

  briefing: {
    observable: [
      'The 3D scene is seen from an onlooker\'s angle: an Eye, a Screen panel divided into an 8 × 6 grid, and a Ball behind the screen. It opens with "Grid 8 × 6 · no rays yet" and "Filled cells: 0 / 48".',
      'Each step sends one whole row: eight rays leave the Eye, each passing through the middle of its cell. Rays that hit the Ball leave a dot where they land; rays that miss pass by and leave the scene.',
      'The answer then travels back along each ray into its cell, and the row fills in — ball colour for a hit, background colour for a miss. Earlier rows stay filled.',
      'Captions and counts per row: "Row 0: 8 rays · hits 0", "Row 1: … hits 3", "Row 2: … hits 5", "Row 3: … hits 5", "Row 4: … hits 3", "Row 5: … hits 0". Filled cells climb 8, 16, 24, 32, 40, 48.',
      'The run ends at "Filled cells: 48 / 48 · Ball: 16 · Background: 32". The top and bottom rows pass above and below the ball; the ball sits a little right of centre (x = 0.25), so the filled shape leans right, and its edge shows as a staircase of cells.',
      'Setup the screen does not footnote: the eye is at the origin looking down −z, the screen panel sits at z = −1 with square cells 0.25 wide, row 0 is at the top, and each ray passes through its cell centre (a half-cell in from the corner). Colours are the flat object colour (0.9, 0.35, 0.2) or background (0.15, 0.2, 0.35) — no lighting, linear values, no gamma — so the ball appears as a flat disc.',
    ],

    screen: {
      affordances: [
        'The screen plays its steps on its own, one row per step, and stops once all 48 cells are filled.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip back to a middle row shows its eight rays going out and the colours coming back into those cells.',
        'The grid, eye and ball are fixed, so every row count and total can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader needs the basic idea of how a ray-traced image is produced: that a picture is filled one pixel at a time by asking what lies behind the middle of each cell.',
      'The article explains why a ray-cast image has stair-stepped edges or why one ray per pixel is the minimum, and wants the count of rays to match the count of cells exactly.',
    ],

    avoidWhen: [
      'The article is about lighting, shading or shadows. Every hit takes the ball\'s flat colour with no brightness change.',
      'The scene needs several overlapping objects or a choice of which is closest. There is only one ball.',
      'The subject is how GPUs draw triangles by rasterization; nothing here is projected onto the screen from the object side.',
    ],

    contrastWith: [
      {
        concept: 'rayTracingBase',
        note: 'One ray per pixel only fixes where each ray starts and which pixel it answers for. Tracing is everything done with that ray afterwards — bending through materials, checking the light, combining the results into a colour.',
      },
      {
        concept: 'nearestHit',
        note: 'Sending a ray through a pixel says which ray a pixel owns; choosing among several objects on that ray says which one the pixel shows. The first is about the grid, the second about a single ray.',
      },
      {
        concept: 'triangleToPixels',
        note: 'Both decide pixel coverage using pixel centres, but from opposite sides: in ray casting each pixel asks what its ray meets, while rasterization takes a shape and asks which pixel centres fall inside it.',
      },
    ],
  },
};
