/**
 * translateSlides 개념 선언.
 *
 * canonical facet 은 `facet:translateSlides` — 삼각형 A (−3, −2) · B (−1, −2) · C (−1, −1) 을 옮김 (3, 1) ·
 * (1, 2) · (−2, 1) 로 앞 자리에서 이어 세 번 옮긴다. 오른쪽 칸이 꼭짓점마다 **잰** 이번 옮김을 적고(셋이 같다),
 * 끝 걸음에는 처음 자리부터의 옮김 (2, 4) 를 더 적는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `scaleRotateTranslate` 는 옮김이 뒤의 늘임 · 회전에 휘말리는 것을 본다. 이쪽은 옮김 하나가 **모든 점을 같은
 * 벡터만큼** 미는 것, 이어 옮기면 그 벡터들이 더해진다는 것만 말한다. "2×2 로는 옮김을 못 쓴다" 는
 * `extraDimensionForTranslate` 의 몫이라 행렬 · 셋째 칸 낱말을 넣지 않는다. 형제와 가르는 낱말은 same vector ·
 * add · offsets sum 이다.
 *
 * 전제 (설명 글 `translateSlides.md`): x 오른쪽 · y 위. 옮김 값은 셈한 값이고 표시만 소수 둘째 자리. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const translateSlidesConcept: FacetConceptSource = {
  id: 'translateSlides',
  label: 'Translation Moves Every Point by the Same Vector',
  canonicalFacet: 'facet:translateSlides',

  surface: {
    definition:
      'Translation adds one and the same offset vector to every point, so each vertex of a shape moves identically without turning or resizing, and consecutive translations add up to a single total offset.',
    exemplarKeywords: [
      'translation',
      'translate a shape',
      'p + (tx, ty)',
      'offset vector',
      'displacement vector',
      'moving a sprite by dx, dy',
      'rigid motion without rotation',
      'consecutive translations add',
      'translation preserves shape and orientation',
      'panning an object',
    ],
  },

  briefing: {
    observable: [
      'A triangle starts at A (−3.00, −2.00), B (−1.00, −2.00), C (−1.00, −1.00), listed under "Corners at". The caption reads "Before any slide: the triangle at its starting place."',
      'Three slides follow, labelled "Slide: 1 / 3" to "Slide: 3 / 3". Each one continues from where the previous one stopped.',
      'Under "This slide" the table gives the shift measured at each corner as new position minus old: (3.00, 1.00) for all three, then (1.00, 2.00) for all three, then (−2.00, 1.00) for all three. On the plane the three bold arrows of a slide are parallel and of equal length.',
      'The triangle neither turns nor grows: side AB keeps length 2 and stays horizontal at every step. Earlier slides stay behind as thin arrows joined tail to head.',
      'After the last slide the corners stand at A (−1.00, 2.00), B (1.00, 2.00), C (1.00, 3.00). "From the start" reads (2.00, 4.00) for every corner, equal to the sum of the three shifts, and a dashed arrow shows that sum.',
      'Coordinates have y pointing up, unlike screen pixels. The shifts are measured from the positions, not copied from the input, and only rounded to two decimals for display.',
    ],

    screen: {
      affordances: [
        'The screen plays the three slides by itself and stops after the third.',
        'A Replay button and a playback strip sit below it. Stopping on any slide shows the three identical measured shifts side by side.',
        'The triangle and shifts are fixed, so an article can quote every position and shift exactly as it appears.',
      ],
    },

    useWhen: [
      'The reader wonders whether far corners move more than near ones when a shape is moved, and the article needs the shift measured at every corner and found identical.',
      'The article shows that moving by one vector and then another is the same as moving once by their sum.',
    ],

    avoidWhen: [
      'The article is about writing translation as a matrix or about homogeneous coordinates. There is no matrix here, only addition.',
      'The subject is combining translation with rotation or scaling. Translation is the only operation shown.',
      'The point is screen coordinates with y pointing down. The plane here has y pointing up.',
    ],

    contrastWith: [
      {
        concept: 'scaleRotateTranslate',
        note: 'On their own, translations simply add; once a scale or rotation is applied after a translation, it transforms that offset too, so the order stops being irrelevant.',
      },
      {
        concept: 'extraDimensionForTranslate',
        note: 'Moving every point by the same vector is what translation is. Expressing that as a matrix product needs an extra coordinate, because a 2x2 matrix always keeps the origin in place.',
      },
      {
        concept: 'rotateTurns',
        note: 'Translation has no centre and moves all points equally; rotation has the origin as its centre and moves each point by an amount set by its distance from it.',
      },
      {
        concept: 'scaleStretches',
        note: 'Scaling moves points in proportion to their coordinates and can leave some in place; translation moves every point, including the origin, by the same amount.',
      },
    ],
  },
};
