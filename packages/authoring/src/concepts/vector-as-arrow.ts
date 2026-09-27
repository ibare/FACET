/**
 * vectorAsArrow 개념 선언.
 *
 * canonical facet 은 `facet:vectorAsArrow` — 한 주장을 말하는 조각(piece) facet.
 * 숫자쌍 (3, 2) 가 원점에서 가로 3 · 세로 2 를 걸어 화살표가 되고, 같은 화살표가 모양 그대로
 * 꼬리 셋으로 옮겨진다. 옮길 때마다 머리 − 꼬리 는 (3, 2) 로 셈된다.
 *
 * ── 묶음 안에서의 자리 (가 · 벡터와 그래프 — 완제품 없음, origin vector-ops)
 *
 * 벡터 조각 여섯 가운데 이쪽은 **숫자쌍과 옮겨 감의 짝** 하나를 쥔다 — 좌표 · 이동 · 꼬리 · 머리 ·
 * 머리 − 꼬리 낱말을 독점한다. 길이 · 각(scale · normalize) · 잇기(add-tip-to-tail) · 곱(내적 · 외적)
 * 낱말은 definition 에 넣지 않는다.
 *
 * 전제: v = (3, 2) 와 꼬리 셋은 예로 정한 정수 값이다. 사례 넷이 일반을 증명하지는 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const vectorAsArrowConcept: FacetConceptSource = {
  id: 'vectorAsArrow',
  label: 'A Vector as a Displacement Arrow',
  canonicalFacet: 'facet:vectorAsArrow',

  surface: {
    definition:
      'A pair of numbers (x, y) as a vector is a displacement — x across, y up — so its arrow can start anywhere, and head minus tail always gives that pair.',
    exemplarKeywords: [
      'what is a vector',
      'vector components',
      'ordered pair as an arrow',
      'displacement vector',
      'free vector',
      'tail and head of a vector',
      'head minus tail',
      'position vector vs displacement',
      'translation',
      'coordinates on a grid',
      'introduction to linear algebra',
    ],
  },

  briefing: {
    observable: [
      'The first frame shows only the pair `v = (3, 2)` and the origin `(0, 0)`; there is no arrow yet.',
      'From the origin a leg walks 3 cells to the right to `(3, 0)` ("Horizontal: 3"), then 2 cells up to `(3, 2)` ("Vertical: 2"). The point reached is the head, and the arrow is drawn from the origin (the tail) to it.',
      'The same arrow then slides, shape unchanged, to three other tails in turn: `(−5, 1)` → head `(−2, 3)`, `(−2, −4)` → head `(1, −2)`, `(1, −3)` → head `(4, −1)`. At each new place the horizontal leg 3 and vertical leg 2 are shown again as cell counts.',
      'A ledger at the side adds one row per placement with tail, head and "head − tail"; that last column is computed each time and comes out `(3, 2)` in every row.',
      'The earlier arrows stay on the grid, so four parallel copies of one arrow sit side by side at the end. Only the copy whose tail is at the origin has a head equal to the pair itself.',
      'Coordinates are mathematical: right is +x, up is +y, and the grid is numbered so components can be read off by counting cells. The vector and the three tails are example values chosen as integers; four placements illustrate the idea rather than prove it.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps by itself (the first frame counted) and stops after the third placement.',
        'A Replay button and a playback strip sit below. Dragging the strip back to the two walking steps shows the pair turning into an arrow one component at a time.',
        'Length and angle are never computed or shown; the screen reads a vector only as cells across and cells up.',
      ],
    },

    useWhen: [
      'The reader knows a vector as a list of numbers and as an arrow but not why they are the same thing. Walking 3 across and 2 up, then moving the arrow and getting `(3, 2)` back from head − tail, joins the two.',
      'The article needs "a vector has no fixed location" to be concrete — for example before explaining displacement, velocity, or why an arrow can be redrawn elsewhere and still be the same vector.',
    ],

    avoidWhen: [
      'The subject is a vector’s length, magnitude or direction angle. None of those are measured here.',
      'The article is about adding vectors or chaining arrows. Only one vector is ever shown, copied, never combined with another.',
      'The vectors are high-dimensional, such as embeddings or feature vectors, and the article needs similarity or distance between them. This is a two-component grid picture of what the numbers mean.',
      'The topic is a data-structure "vector" (a resizable array). Here a vector is a geometric displacement.',
    ],

    contrastWith: [
      {
        concept: 'vectorAddTipToTail',
        note: 'Both rely on an arrow being movable. For a single vector that freedom is the point — the pair fixes a displacement, not a place; addition uses it as a means to join different displacements end to end.',
      },
      {
        concept: 'vectorScale',
        note: 'This reads the two numbers as steps across and up; scaling asks what happens to the arrow’s length and direction when both steps are multiplied by the same factor.',
      },
      {
        concept: 'matrixTransform2d',
        note: 'A vector alone is one displacement; a matrix sends every vector of the plane somewhere else at once. The first is the object, the second a map between such objects.',
      },
    ],
  },
};
