/**
 * wDivide 개념 선언.
 *
 * canonical facet 은 `facet:wDivide` — 동차 묶음 다섯 (2, 1, 1) · (4, 2, 2) · (−6, −3, −3) · (1, 0.5, 0.5) ·
 * (2, 1, 0) 을 차례로 w 로 나눈다. 앞의 넷은 원점을 지나는 한 직선을 따라 미끄러져 모두 (2, 1) 에 떨어져 쌓이고,
 * 마지막은 w 가 0 이라 나누지 않고 방향 (2, 1) 로 남는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 이쪽은 **동차 좌표를 보통 좌표로 되돌리는 나눗셈** 하나만 말한다 — 배수인 묶음은 같은 점, w = 0 은 점이 아닌 방향.
 * 형제와 가르는 낱말은 divide by w · scalar multiples · same point · direction · point at infinity 다. 옮김 행렬
 * (`extraDimensionForTranslate`)도, 깊이 · 카메라 · 멀수록 작아짐(camera 묶음의 `perspectiveShrinksFar`)도 두지 않는다.
 *
 * 전제 (설명 글 `wDivide.md`): x 오른쪽 · y 위. 음수 w 도 부호째 나눈다. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const wDivideConcept: FacetConceptSource = {
  id: 'wDivide',
  label: 'Dividing by w (Homogeneous Back to Ordinary Coordinates)',
  canonicalFacet: 'facet:wDivide',

  surface: {
    definition:
      'A homogeneous triple (x, y, w) becomes the plane point (x/w, y/w), so triples that are nonzero multiples of one another name the same point, and a triple with w = 0 names a direction instead of a point.',
    exemplarKeywords: [
      'homogeneous divide',
      'divide by w',
      'homogeneous to Cartesian coordinates',
      'scalar multiples represent the same point',
      'w = 0 means a direction',
      'point at infinity',
      'projective plane',
      'points vs vectors w = 1 vs w = 0',
      'negative w',
      'equivalence of homogeneous coordinates',
    ],
  },

  briefing: {
    observable: [
      'Five homogeneous triples wait in a row at the top: (2, 1, 1), (4, 2, 2), (−6, −3, −3), (1, 0.5, 0.5), (2, 1, 0), with the caption "Homogeneous triples (x, y, w): 5".',
      'One triple per step is divided: "(2, 1, 1) ÷ 1 → (2.00, 1.00)", "(4, 2, 2) ÷ 2 → (2.00, 1.00)", "(−6, −3, −3) ÷ −3 → (2.00, 1.00)", "(1, 0.5, 0.5) ÷ 0.5 → (2.00, 1.00)". The counter "Landed on the plane" climbs 1, 2, 3, 4.',
      'On the plane each triple first drops at its own (x, y), then slides along a straight line through the origin to (2, 1): (4, 2) is pulled halfway in, (1, 0.5) is pushed twice as far out, and (−6, −3) crosses over the origin to the other side because w is negative. The four pile up beside each other at (2, 1).',
      'The last step reads "w is 0: no division. (2, 1, 0) → direction (2, 1)". It lands nowhere; a dashed arrow labelled "direction" runs from the origin toward (2, 1), and the counter stays at 4. The ratio 2 : 1 is the same as the point the other four reached.',
      'Coordinates have y pointing up. Division keeps the sign, and w = 0 is set aside before dividing rather than producing infinity. There is no depth, camera or perspective here — only the division itself.',
    ],

    screen: {
      affordances: [
        'The screen plays the five divisions by itself and stops on the direction.',
        'A Replay button and a playback strip sit below it. Holding the step for (−6, −3, −3) shows a negative w carrying the point across the origin to the same place.',
        'The five triples are fixed, so an article can quote every division exactly as it appears.',
      ],
    },

    useWhen: [
      'The reader is puzzled that (4, 2, 2) and (2, 1, 1) are called the same point, and the article needs several different triples visibly landing on one spot.',
      'The article explains why w = 0 marks a direction or a point at infinity, and needs the one triple that cannot be divided set beside four that can.',
    ],

    avoidWhen: [
      'The article is about perspective projection and why far objects look smaller. That requires a projection matrix that puts depth into w, which is not here.',
      'The subject is building translation or other transforms into a matrix. No matrix is applied on this screen.',
      'The point is clipping in homogeneous space. Nothing is clipped here.',
    ],

    contrastWith: [
      {
        concept: 'extraDimensionForTranslate',
        note: 'Appending w = 1 is how a plane point enters homogeneous form; dividing by w is how any triple, whatever its w, is brought back to the plane.',
      },
      {
        concept: 'perspectiveShrinksFar',
        note: 'Dividing by w is the undoing of homogeneous coordinates in general. Things shrinking with distance happens only when a projection has first copied depth into w, so the same division then scales by distance.',
      },
      {
        concept: 'scaleRotateTranslate',
        note: 'Affine compositions keep w at 1, so the division changes nothing there; it matters when w takes other values or reaches zero.',
      },
    ],
  },
};
