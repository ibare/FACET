/**
 * determinantZeroCollapse 개념 선언.
 *
 * canonical facet 은 `facet:determinantZeroCollapse` — 행렬 A = [2 1 ; 4 2](det 0)로 서로 다른 점 여섯을 하나씩 옮기면,
 * 도착 자리가 이미 다른 점이 와 있는 곳이라 「여기 온 점」이 1 → 2 → 3 으로 오르고, 끝에 점 여섯이 자리 둘 (2, 4) · (3, 6)
 * 에 셋씩 포개진다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 이웃 `matrixTransform2d` 는 det 이 0 에 닿을 때 평행사변형이 선으로 무너지는 모습을 보인다 — 이쪽은 넓이를 말하지 않고
 * **서로 다른 점이 한 자리로 포개지는 것**을 센다. 형제 `inverseUndoes` 는 되돌림이 있는 쪽, 이쪽은 없는 쪽이다.
 * 그래서 definition 은 different points · same spot · no telling where it came from 을 쥐고,
 * area · formula · product · 1/det 을 쓰지 않는다.
 *
 * 전제: 행렬 · 점 여섯은 예로 정한 값이다. 행렬식이 0 인 2×2 행렬은 평면 전체를 원점을 지나는 직선(또는 원점)으로 보내므로
 * 어느 점을 골라도 한 자리에 여럿이 모인다 — 설명 글이 밝힌다. 동전을 어긋나게 쌓은 것은 그림이고 실제로는 정확히 겹친다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const determinantZeroCollapseConcept: FacetConceptSource = {
  id: 'determinantZeroCollapse',
  label: 'Zero Determinant: Different Points Land on One Spot',
  canonicalFacet: 'facet:determinantZeroCollapse',

  surface: {
    definition:
      'A matrix whose determinant is zero sends different points to the same spot, so from where a point lands there is no telling which point it came from.',
    exemplarKeywords: [
      'singular matrix',
      'non-invertible matrix',
      'determinant equals zero',
      'not one-to-one',
      'many-to-one linear map',
      'rank-deficient matrix',
      'plane squashed onto a line',
      'why a singular matrix has no inverse',
      'null space',
    ],
  },

  briefing: {
    observable: [
      'Six different points — (1, 0), (1, 1), (0, 2), (0, 3), (2, −2), (2, −1) — stand beside A = [2 1 ; 4 2]. The caption reads "Points: 6 · spots: 6".',
      'The points are moved one at a time, each in its own colour, and land like coins on their arrival spot; a stack on the side records where each coin came from. "(1, 0) → (2, 4) · arrived here: 1", then "(1, 1) → (3, 6) · arrived here: 1".',
      'The third point does not find a new spot: "(0, 2) → (2, 4) · arrived here: 2" — it lands where (1, 0) already is. The fourth does the same at (3, 6).',
      'The counts climb to 3 at each spot: (1, 0), (0, 2) and (2, −2) all arrive at (2, 4); (1, 1), (0, 3) and (2, −1) all arrive at (3, 6).',
      'The last step reads "Points 6 → spots 2 · det = 2·2 − 1·4 = 0", and a line y = 2x through the origin is drawn through both spots.',
      'The coins are drawn slightly offset so their number can be read; the points actually coincide exactly. The matrix and the six points are chosen examples, though any point sent by a determinant-zero 2×2 matrix lands on that one line.',
    ],

    screen: {
      affordances: [
        'The screen plays eight steps on its own and stops.',
        'A Replay button and a playback strip sit below it. Scrubbing to the third step shows the first moment a new point lands on an occupied spot.',
        'The matrix and the six points are fixed, so an article can quote which three points share each spot.',
      ],
    },

    useWhen: [
      'The article says a matrix with determinant zero has no inverse and needs the reason as a count rather than a formula: three different starting points end on one spot, so going backwards has three answers.',
      'A reader thinks of det = 0 only as "the area becomes zero" and needs to see what it does to individual points.',
    ],

    avoidWhen: [
      'The article is about how an inverse is computed when it exists. No inverse appears here.',
      'The subject is how area or volume shrinks under a map with small but nonzero determinant. Only the exact-zero case is shown, and area is not drawn.',
      'The topic is solving a singular system of equations or finding a basis of the null space. The screen shows collisions of points, not solution sets.',
    ],

    contrastWith: [
      {
        concept: 'inverseUndoes',
        note: 'An inverse exists exactly when no two points share a destination. The zero-determinant case is where that fails, so there is nothing to undo with.',
      },
      {
        concept: 'determinantArea',
        note: 'Read as an area factor, a zero determinant squashes every region flat; read point by point, it makes the map many-to-one. This claim is the point-by-point reading.',
      },
      {
        concept: 'pigeonholeCollision',
        note: 'Both guarantee that different inputs share an output. Pigeonholes force it by counting finite outputs; a singular matrix forces it by sending the whole plane onto one line.',
      },
      {
        concept: 'svdThreeSteps',
        note: 'A zero singular value is the step that flattens one direction completely; the collapse of points is what that flattening looks like from the outside.',
      },
      {
        concept: 'matrixOps',
        note: 'A single singular map loses information; in a chain of maps, one such map spoils the whole product whichever side it is on.',
      },
    ],
  },
};
