/**
 * rasterization 개념 선언.
 *
 * canonical facet 은 `facet:rasterization` — 16 × 12 격자 위에 서로 파고든 두 삼각형. A 는 깊이 0.5 의 평평한 면,
 * B 는 꼭짓점 깊이 0.8 · (손잡이) · 0.2 로 기운 면이다. 한 판은 덮는 칸 → (깊이 버퍼) 보간 · A 넣기 · B 넣기 또는
 * (화가) 무게중심 차례 · 먼 쪽 칠 · 가까운 쪽 칠 → 셈의 다섯 걸음. 손잡이 둘 — B 맨 위 꼭짓점의 깊이
 * (0.05 ~ 0.70, 처음 0.45) 와 가림 방식(깊이 버퍼 / 화가 알고리즘).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 칸 덮기(`triangleToPixels`) · 칸마다 깊이 견주기(`depthTest`) · 꼭짓점 값 번지기
 * (`interpolateAcross`). 이쪽은 셋을 한 판에 잇고 **손잡이로 두 가지를 가른다**: 꼭짓점 깊이 하나가 보간을 타고
 * 번져 두 면이 만나는 선을 옮기는 것, 그리고 삼각형째 차례를 정하는 화가 알고리즘이 그 선을 따라가지 못하는 것.
 * 그래서 definition 은 interpenetrate · intersection line · painter's algorithm · whole triangles 를 쥐고,
 * 조각들이 독점한 edge · center · staircase(덮기), draw order · overwrite(깊이 시험), weight · sum to one(보간)을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `rasterization.md` 가 밝힌 것):
 *  - 좌표는 x 오른쪽 · y 아래, 칸 중심 (c + 0.5, r + 0.5) 표본 하나 — 안티에일리어싱 없음.
 *  - 깊이는 0 이 가깝고 1 이 멀다. 화면 공간에서 선형 보간 — 투영 뒤 깊이 z/w 에는 옳고, 색 같은 속성은 원근 보정이 필요하다.
 *  - top-left 규칙을 넣지 않았다 — 경계 위 중심이 없게 꼭짓점을 골랐다. 깊이 비교는 엄격한 < 이고 같은 깊이는 데이터에 없다.
 *  - 화가 알고리즘은 무게중심 깊이(꼭짓점 깊이 평균)로 삼각형째 정렬한다. 반투명 없음, 색은 A · B 두 가지.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rasterizationConcept: FacetConceptSource = {
  id: 'rasterization',
  label: 'Rasterization (Depth Buffer vs Painter’s Algorithm on Intersecting Triangles)',
  canonicalFacet: 'facet:rasterization',

  surface: {
    definition:
      'When two triangles interpenetrate, a per-pixel depth buffer splits their overlap along the line of equal depth, which shifts as one vertex depth changes, while the painter’s algorithm ordering whole triangles cannot.',
    exemplarKeywords: [
      'rasterization',
      'hidden surface removal',
      'z-buffer vs painter’s algorithm',
      'painter’s algorithm fails',
      'intersecting triangles',
      'interpenetrating polygons',
      'cyclic overlap',
      'visibility is decided per pixel',
      'sort polygons by depth',
      'rasterization pipeline',
      'OpenGL',
      'Direct3D',
    ],
  },

  briefing: {
    observable: [
      'A 16 × 12 grid holds two triangles that cut into each other. A is flat at depth 0.5; B tilts, with vertex depths 0.8, the handle value and 0.2. Beside the grid a depth bar runs from 0.000 (near) to 1.000 (far) and carries tags such as "A 0.500", "B v1 0.800", "B v2 0.450", "B v3 0.200".',
      'The first step marks the covered cells: "Cells whose centre lies inside: A 68 · B 55 · both 31 (hatched)." The 31 shared cells stay the same for every handle value, because covering depends only on where the vertices are.',
      'With the depth buffer, the next step shades B by depth blended from its three vertices ("Depth of B is blended from its three vertices in every cell: 0.209 to 0.758. A is flat at 0.500."), then A is inserted into 68 empty cells, then B: "written to empty cells 24 · overwritten 11 · discarded 20".',
      'The last step counts and draws the meeting line, where the two depths are equal, across the overlap: "Shared cells won by A: 20." B wins the cells on one side of that line and A the other. The "Cells B wins" readout shows 11 at the default depth 0.45.',
      'Stepping the vertex depth through 0.05, 0.15, 0.35, 0.45, 0.60, 0.70 changes the cells B wins under the depth buffer to 22, 20, 16, 11, 3, 0, and the meeting line slides from its previous place (dashed) to the new one.',
      'At 0.70 the line still crosses a sliver of the overlap, yet B wins 0 cells: no cell centre falls inside that sliver. One sample per cell cannot see anything thinner than a cell.',
      'With the painter’s algorithm there is no buffer. Each triangle gets one centroid depth (the average of its vertex depths), the farther triangle is painted first and the nearer one last, covering all 31 shared cells without comparing depth. B wins 31 up to 0.45 and 0 from 0.60 on — it jumps in one go.',
      'In painter mode the last step draws the depth-buffer meeting line in the same place and marks every cell whose owner differs from the depth buffer. The "Wrong cells" readout runs 9, 11, 15, 20, 3, 0 across the six depths, with the most, 20, at 0.45.',
      'Depth is interpolated linearly in screen space, which is right for projected depth (z/w) but not for colours or texture coordinates; each cell is judged by its centre alone, with no anti-aliasing and no top-left fill rule (no centre lies exactly on an edge); ties in depth do not occur in the data. The screen does not footnote these choices.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Vertex depth", a six-position slider from 0.05 to 0.70 starting at 0.45, and "Hiding", a two-position switch between Depth buffer (default) and Painter’s. Each round plays five steps and waits for a handle.',
        'The move that makes the idea land is flipping Hiding at the default depth: the depth buffer splits the 31 shared cells 11 to 20 along the meeting line, while the painter hands all 31 to B and 20 cells are marked wrong. Then stepping the vertex depth under the depth buffer walks the meeting line across the overlap.',
        'The code panel, labelled "Rasterize two triangles and count the cells B wins", starts empty with a "+ Add language" button; the chosen language shows the whole computation and returns the same number as the "Cells B wins" readout. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why GPUs keep a depth buffer instead of sorting triangles back to front, and needs a case where no whole-triangle order is correct because two surfaces pass through each other.',
      'A reader wonders where one surface stops being in front of another and needs to see that the boundary is the line of equal interpolated depth, and that it moves when a single vertex depth changes.',
    ],

    avoidWhen: [
      'The article is about anti-aliasing, MSAA or smoothing jagged edges. Each cell is judged by one centre sample only.',
      'The subject is transparency, alpha blending or order-independent transparency. Both triangles are opaque and each has a single flat colour.',
      'The topic is perspective-correct interpolation of colours or texture coordinates. Only depth is interpolated, and linearly in screen space.',
      'The article is about z-fighting or depth-buffer precision. Equal depths are kept out of the data, so no tie ever arises.',
    ],

    contrastWith: [
      {
        concept: 'triangleToPixels',
        note: 'Deciding which pixels one triangle covers is the input to rasterizing a scene; with two triangles the covered sets overlap, and the question moves from coverage to which surface owns each shared pixel.',
      },
      {
        concept: 'depthTest',
        note: 'The depth test itself is a per-pixel comparison that makes the final image independent of draw order. Rasterizing intersecting triangles relies on that comparison to place the line where two surfaces meet, a line that no ordering of whole triangles can reproduce.',
      },
      {
        concept: 'interpolateAcross',
        note: 'Blending vertex values by barycentric weights is how each pixel gets its own depth; in a scene of intersecting surfaces that blending is what lets a single vertex depth move the boundary between two surfaces.',
      },
      {
        concept: 'rayTracingBase',
        note: 'Rasterization loops over triangles and resolves visibility with a stored depth per pixel; ray tracing loops over pixels and resolves it by following each ray to the surfaces it meets.',
      },
      {
        concept: 'projection',
        note: 'Projection carries vertices from the camera’s space onto the image plane; rasterization starts from those projected vertices and decides, pixel by pixel, what fills the image.',
      },
    ],
  },
};
