/**
 * triangleToPixels 개념 선언.
 *
 * canonical facet 은 `facet:triangleToPixels` — 12 × 8 픽셀 격자 위 삼각형 A(1.4, 0.2) · B(11.3, 2.6) · C(4.4, 7.6).
 * 위에서 아래로 한 행씩 훑으며, 칸 중심이 세 모서리 함수 E_BC · E_CA · E_AB 모두 양수 쪽이면 칠한다. 밖으로 떨어진
 * 중심에는 그것을 밖으로 가른 모서리 색의 고리가 선다. 처음 화면을 넣어 아홉 걸음, 행마다 1 · 5 · 9 · 7 · 6 · 3 · 2 · 1,
 * 모두 34 칸, 넓이 33.03. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `rasterization` 은 두 삼각형이 파고든 곳에서 누가 보이는가를 손잡이로 가른다. 조각 셋 가운데 이쪽은 **삼각형 하나가
 * 어느 칸을 차지하는가** 하나다 — 칸 안의 값(색 · 깊이)은 말하지 않는다. 그래서 definition 은 center point · inside all three
 * edges · row by row · staircase · approximates the area 를 쥐고, 깊이(`depthTest`) · 몫과 섞음(`interpolateAcross`) ·
 * 화가 알고리즘(`rasterization`) 쪽 낱말을 쓰지 않는다.
 *
 * 전제 (설명 글 `triangleToPixels.md`): x 오른쪽 · y 아래, 칸 중심 (c + 0.5, r + 0.5) 표본 하나 — 안티에일리어싱 없음.
 * 중심이 모서리 바로 위에 놓이는 경우는 데이터에 없고(가장 작은 |E| 0.160) top-left 규칙은 모형에 없다. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const triangleToPixelsConcept: FacetConceptSource = {
  id: 'triangleToPixels',
  label: 'Which Pixels a Triangle Covers (Pixel-Center Coverage Test)',
  canonicalFacet: 'facet:triangleToPixels',

  surface: {
    definition:
      'A triangle occupies exactly the pixels whose center point lies inside all three of its edges, tested row by row, so its outline becomes a staircase and the filled count approximates its area.',
    exemplarKeywords: [
      'scan conversion',
      'triangle coverage',
      'edge function',
      'point in triangle test',
      'pixel center sampling',
      'which pixels does a triangle cover',
      'jaggies',
      'stair-step edges',
      'scanline rasterization',
      'half-space test',
      'Pineda edge function',
      'convex polygon fill',
    ],
  },

  briefing: {
    observable: [
      'Triangle ABC sits on a 12 × 8 pixel grid with rows and columns numbered from 0; the three edges are drawn in three colours labelled BC, CA and AB. The opening line reads "Triangle ABC on a 12 × 8 pixel grid. Each pixel is judged by one point, its center."',
      'The grid is scanned from the top, one row per step. Each step fills the cells whose center lies inside all three edges, e.g. "Row 1: centers inside all three edges at columns 2..6. Filled: 5."',
      'Every center that falls outside gets a ring in the colour of the edge that cut it off. Centers to the left are cut off by CA, upper right by AB, lower right by BC; at row 2, column 11 two edges cut it off together and two rings stand.',
      'A "Filled" column builds up row by row — 1, 5, 9, 7, 6, 3, 2, 1 — and every row\'s filled cells form one unbroken run, because the triangle is convex.',
      'Along the edges the one-point rule shows: the cell at row 5, column 3 has close to half its square inside the triangle yet stays empty because its center is outside, while row 7, column 4, less than a third inside, is filled because its center is in. The outline breaks into steps.',
      'After nine steps (counting the opening) the screen ends on "Rows scanned: 8. Filled: 34 · Triangle area: 33.03" — the count of unit cells is close to the area.',
      'The inside test uses the edge function E_ab(p) = (b.x − a.x)(p.y − a.y) − (b.y − a.y)(p.x − a.x); with vertices in the order A → B → C the inside is where all three are positive. Pixel x grows to the right and y downward. There is no anti-aliasing and no top-left fill rule; no center in this data lies exactly on an edge. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'The screen plays the eight row scans by itself and stops at the total.',
        'A Replay button and a playback strip sit below it. Dragging the strip back to the row 5 scan holds the moment the nearly half-covered cell at column 3 is left empty.',
        'The triangle and grid are fixed, so an article can quote every row count and the 34 / 33.03 comparison exactly.',
      ],
    },

    useWhen: [
      'The article introduces how a GPU turns a triangle given by three vertices into pixels, and needs the rule "a pixel belongs to the triangle when its center is inside all three edges" shown one row at a time.',
      'A reader asks why triangle edges look jagged, and the article wants a cell that is mostly outside but filled next to one that is half inside but empty.',
    ],

    avoidWhen: [
      'The article is about what colour or depth a covered pixel receives. Every filled cell here gets the same fill; nothing is interpolated.',
      'The subject is which of two overlapping shapes is visible. There is only one triangle.',
      'The topic is anti-aliasing, multisampling or the top-left rule for pixels shared by two triangles. Each cell has one sample and no center sits on an edge.',
      'The article is about drawing lines, such as Bresenham’s algorithm. The shape here is a filled triangle.',
    ],

    contrastWith: [
      {
        concept: 'rasterization',
        note: 'Coverage asks only which pixels belong to one triangle. Rasterizing a whole scene adds what happens where the pixel sets of several triangles overlap.',
      },
      {
        concept: 'interpolateAcross',
        note: 'Both use the same three edge functions. Coverage only checks their signs to say in or out; interpolation divides them by the area to get weights that say how much of each vertex a pixel receives.',
      },
      {
        concept: 'shootRayPerPixel',
        note: 'Both sample each pixel at one point. Coverage starts from the triangle and asks which pixel centers fall inside it; ray casting starts from each pixel and asks what its ray meets.',
      },
    ],
  },
};
