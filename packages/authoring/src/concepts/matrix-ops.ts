/**
 * matrixOps 개념 선언.
 *
 * canonical facet 은 `facet:matrixOps` — 변환 여섯(R · R⁻¹ · H · S · F · P) 가운데 둘을 손잡이 「먼저」·「다음」으로 골라,
 * 점 넷이 X 로 · Y 로 두 번 뛴 뒤 처음 자리에서 곱 YX 로 한 번에, 차례를 바꾼 XY 로 한 번에 뛴다. 계기 셋이
 * 같은 곳 · 제자리 · 도착 자리를 센다. 36 짝 어디서나 걸음 여섯, 11.0 초.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 일곱)
 *
 * 조각 일곱은 각각 한 장면이다 — 평면이 통째로 옮겨 감(`matrixAsTransform`) · 규칙에서 열을 채움(`matrixColumnsAreBasis`) ·
 * 열의 가중합(`matvecAsCombination`) · 두 변환을 곱 하나로(`matrixProductChain`) · 넓이 배수(`determinantArea`) ·
 * 포개짐(`determinantZeroCollapse`) · 되돌림(`inverseUndoes`). 이쪽은 **짝을 바꿔 가며 견주는 것**을 맡는다.
 * 그래서 definition 은 「어느 짝이냐에 따라 갈린다」는 쪽 낱말(pair · swapping the order · cancel · flattening)을 쥐고,
 * 조각들이 독점한 columns · weighted · area · inverse formula · right-hand side first 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `matrixOps.md` 가 밝힌 것):
 *  - 변환 여섯 · 점 넷은 예로 정한 값이다. 36 짝을 다 보아도 모든 행렬에 대한 증명은 아니다 — 일반에 서는 것은
 *    결합 법칙 (YX) p = Y (X p) 와 det(YX) = det Y · det X 둘이다.
 *  - 모든 수가 정수라 「같은 곳」은 좌표가 정확히 같은지로 가린다.
 *  - 「제자리 1 / 4」(R⁻¹ → F · F → R)는 되돌림이 아니라 y = x 뒤집기가 그 줄 위의 점 (1, 1) 을 남긴 것이다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const matrixOpsConcept: FacetConceptSource = {
  id: 'matrixOps',
  label: 'Chaining Two Transformations: Order, Cancelling, Flattening',
  canonicalFacet: 'facet:matrixOps',

  surface: {
    definition:
      'Chaining two plane transformations picked from a fixed set shows how the outcome depends on the pair: swapping the order usually changes it, a few pairs cancel out, and any pair with a flattening map never returns.',
    exemplarKeywords: [
      'matrix multiplication is not commutative',
      'AB ≠ BA',
      'order of matrix multiplication',
      'composition of linear transformations',
      'associativity (AB)x = A(Bx)',
      'det(AB) = det(A) det(B)',
      'identity matrix from two transformations',
      'rotation shear scaling reflection projection',
      'when do two matrices commute',
      'composing a projection loses information',
    ],
  },

  briefing: {
    observable: [
      'Four points start at home — (1, 1), (2, −1), (−1, 2), (1, 2) — on a small plane. Two cards, X (First) and Y (Then), show each chosen map\'s symbol, its 2×2 matrix, its name and its det; with the defaults they read "X = H · Shear sideways · det X = 1" and "Y = S · Double vertically · det Y = 2".',
      'Step 1 jumps all four points by X together and the caption counts the distinct spots they stand on ("Jump by X → spots: 4"). Step 2 jumps them again by Y and also counts points standing on their home ("back home: 0 / 4").',
      'Step 3 raises a third card, "One matrix for both", with the product YX and the line "det Y × det X = 2 × 1 = 2"; the points do not move. Matrices are written row by row, `[1 1 ; 0 2]`, and the map written on the right acts first.',
      'Step 4 sends rings from the home marks by YX in one jump; they settle on top of the twice-jumped points, and the caption reads "same as two jumps: 4 / 4". This count is 4 / 4 for every one of the 36 pairs.',
      'Step 5 raises an "Order swapped" card with XY and sends dashed diamonds by XY in one jump. With the defaults XY = [1 2 ; 0 2] and the caption reads "same spot as YX: 0 / 4". Across all pairs the count is either 4 / 4 (14 pairs, including every map paired with itself) or 0 / 4 (22 pairs); this example has no pair in between.',
      'Three meters under the controls carry the round: Same spot (0 or 4), Back home (0, 1 or 4) and Landing spots (4, or 3 when two points land on one spot, marked `×2` on the plane).',
      'Back home reaches 4 / 4 in exactly three pairs, R → R⁻¹, R⁻¹ → R and F → F, where YX comes out as [1 0 ; 0 1]. Whenever P (flatten onto the horizontal axis, det 0) is in the pair — 11 pairs — the product\'s det is 0, two points share a spot, and Back home never reaches 4.',
      'The six maps and four points are chosen examples, and all coordinates are integers so "same spot" means exactly equal. The two statements that hold in general are (YX) p = Y (X p) and det(YX) = det Y · det X; the screen counts them on this example without footnoting that.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles, "First" and "Then", each a six-position slider over R, R⁻¹, H, S, F, P, starting at H and S. A round is six steps, about 11 seconds, and then waits for a handle.',
        'Moving either handle slides the points back home and replays the six steps for the new pair. The moves that make the idea land are setting the same pair in both orders (H then S, S then H), finding the three pairs that bring Back home to 4, and putting P in either slot to see Landing spots drop to 3.',
        'The code panel, labelled "Code", starts empty with a "+ Add language" button; the chosen language shows the functions that compose the two matrices, jump the points, count matches and compute det, carrying one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article states that matrix multiplication is not commutative and wants the reader to test pairs until the exceptions show up — which pairs agree in both orders and which do not.',
      'A lesson ties together composition, undoing and singular matrices, and needs one place where changing the pair of maps switches between "same result", "back where it started" and "two points now share a spot".',
    ],

    avoidWhen: [
      'The article is about how each entry of a product is computed from a row and a column. The product appears here only as a finished 2×2 matrix.',
      'The subject is computing an inverse matrix by formula or by elimination. Undoing pairs are found by choosing maps, not by calculating 1/det.',
      'The topic is 3D transforms, translation or homogeneous coordinates. All maps are 2×2 on the plane and fix the origin.',
    ],

    contrastWith: [
      {
        concept: 'matrixProductChain',
        note: 'That two maps in sequence equal one product matrix is a single fact about one pair. Holding that fact fixed and varying the pair is what exposes when the order matters and when it does not.',
      },
      {
        concept: 'inverseUndoes',
        note: 'An inverse is something a given invertible matrix has, obtained by formula. Among chained maps, undoing is a property some pairs happen to have, and the question is which pairs have it.',
      },
      {
        concept: 'determinantZeroCollapse',
        note: 'A zero determinant forcing points onto shared spots is the reason; that a single flattening map spoils every pair it joins, in either order, is the consequence for composition.',
      },
      {
        concept: 'determinantArea',
        note: 'The determinant as an area multiple explains why det(YX) equals det Y times det X; the chaining claim uses only that product of numbers, not areas.',
      },
      {
        concept: 'matrixTransform2d',
        note: 'A single 2×2 matrix as a map of the plane, with its columns as the images of the basis, is about one map. Composition is about what two maps do in sequence and whether their order can be swapped.',
      },
      {
        concept: 'rowTimesColumn',
        note: 'Row-times-column is the arithmetic that produces each entry of a product. The chaining claim treats the product as a whole map and asks where it sends points.',
      },
    ],
  },
};
