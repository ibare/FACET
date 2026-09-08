/**
 * matrixTransform2d 개념 선언.
 *
 * canonical facet 은 `facet:matrixTransform2d` — 격자 평면 + i-hat/j-hat 화살표 +
 * 행렬 셀 패널 + 프리셋 5종 + |det| 게이지.
 *
 * reactive 다. 셀을 직접 입력하거나 화살표 끝을 드래그해 조작한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const matrixTransform2dConcept: FacetConceptSource = {
  id: 'matrixTransform2d',
  label: '2D Matrix Transform',
  domain: 'graphics',
  canonicalFacet: 'facet:matrixTransform2d',

  surface: {
    definition:
      'A linear map of the plane where the two columns of a 2x2 matrix are exactly where the two basis vectors land, and every other point follows the same coefficients.',
    exemplarKeywords: [
      'matrix transformation',
      'linear transformation',
      'basis vectors',
      'i-hat and j-hat',
      'rotation scale shear reflection',
      'determinant',
      'change of basis',
      'linear algebra intuition',
      'transformation matrix',
      'the columns are where the basis goes',
    ],
  },

  briefing: {
    observable: [
      'Editing a single matrix cell moves exactly one coordinate of one basis arrow — the correspondence between a cell and a destination is one to one, and changing a cell shows which arrow it owns.',
      'Every point on the plane keeps its own (u, v) coefficients and simply follows the new basis, so the grid deforms as a whole rather than points moving independently.',
      'Straight lines stay straight, spacing stays even, and the origin never moves. Those three invariants hold in every preset, which is what makes the map linear.',
      'The parallelogram spanned by the two arrows carries its area, and the |det| gauge reports the same number with its sign.',
      'When the determinant reaches zero the plane collapses onto a line — the area readout hits 0 at the same instant, so the degenerate case is a number and a picture at once.',
      'A negative determinant flips orientation and the screen says the plane was mirrored, which separates "flipped" from merely "rotated a lot".',
      'A single tracked point follows the same law as the grid, which is the bridge between transforming a space and transforming one vector.',
      'Five presets teach the cell patterns: rotate, scale, shear, reflect, and free.',
    ],

    screen: {
      affordances: [
        'The reader drives this facet: type matrix cells directly, drag the arrow tips, pick a preset, add or remove a tracked point, snap back to Identity, or Reset.',
        'Dragging an arrow tip is the move that makes the idea land — the reader is literally placing where the basis goes, and the matrix cells update to match.',
        'Driving the determinant to zero by hand is how to show collapse as a consequence of the numbers rather than a special case.',
      ],
    },

    useWhen: [
      'The reader has been told the columns of a matrix are where the basis vectors land, and it has not become concrete. Moving the columns and watching everything follow is what makes it concrete.',
      'The article is about linearity itself — that the grid stays a grid, evenly spaced and parallel, no matter what the matrix is.',
    ],


    avoidWhen: [
      'The article is about 3D transforms or homogeneous coordinates. This plane is 2x2 and has no translation — the origin is fixed by construction.',
      'The subject is affine transformation including translation. Moving the origin is exactly what this cannot do.',
      'The point is eigenvalues and eigenvectors. The screen shows where the basis lands, not which directions are preserved.',
    ],

    contrastWith: [
      {
        concept: 'linearRegression',
        note: 'Both put a parameter space beside the thing it controls, but here the reader deforms a plane rather than watching a point roll to a minimum.',
      },
    ],
  },
};
