/**
 * orthographicKeepsSize 개념 선언.
 *
 * canonical facet 은 `facet:orthographicKeepsSize` — 한 변 2 인 정육면체를 y 축 둘레 30°, 그다음 x 축 둘레 20°
 * 돌려 중심 거리 4 · 8 · 12 에 차례로 세운다. 직교 투영(배율 1)은 꼭짓점마다 z 를 버린다. z 범위는 멀어지지만
 * 화면의 모습은 너비 2.732 · 높이 2.814 로 세 걸음 모두 같고, 꼭짓점 하나까지 같은 자리에 앉는다. 평행한 모서리
 * 세 묶음은 화면에서도 묶음마다 평행하고 길이가 같다(1.765 · 1.879 · 1.162). 걸음 넷(처음 포함).
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `projection` 은 원근과 직교를 손잡이로 맞바꿔 **비** 로 견준다. 이 조각은 직교 하나만 두고 한 물체를
 * 멀리 보내며 "z 를 버리면 모습이 꼼짝하지 않는다" 를 말한다. 형제 `perspectiveShrinksFar` 는 반대 주장.
 * 그래서 definition 은 discards depth · identical position, width and height · parallel edges stay parallel 을 독점하고,
 * divided by distance · vanishing point · ratio · eye distance 를 쓰지 않는다.
 *
 * 전제: 배율 1 인 직교 투영 (x', y') = (x, y) — 실물 파이프라인의 직교 행렬은 거리와 상관없는 늘임 · 이동을 더할 뿐.
 * 오른손 · y 위 · 눈은 원점에서 −z. 회전 R = R_x(20°)·R_y(30°). 값은 소수 셋째 자리. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const orthographicKeepsSizeConcept: FacetConceptSource = {
  id: 'orthographicKeepsSize',
  label: 'Orthographic Projection Keeps the Size',
  canonicalFacet: 'facet:orthographicKeepsSize',

  surface: {
    definition:
      'Orthographic projection discards each vertex\'s depth and keeps x and y, so an object sliding away from the viewer keeps an identical screen position, width and height, and parallel edges stay parallel.',
    exemplarKeywords: [
      'orthographic projection',
      'parallel projection',
      'drop the z coordinate',
      'no foreshortening',
      'isometric view',
      'engineering and CAD drawings',
      'orthographic camera',
      '2D games and UI rendering',
      'size does not depend on distance',
      'glOrtho',
    ],
  },

  briefing: {
    observable: [
      'Two panels at the same scale: "Screen, face on" on the left and a "Side view" on the right, where the horizontal axis runs "away (−z)" and a "Center distance" is marked. At the start: "Box with side 2, turned 30° about y, then 20° about x." and "The screen is still empty."',
      'Three steps follow. In each, the box stands at centre distance 4, then 8, then 12 (from the second step on it slides away in the side view), and dots fly horizontally from its eight corners onto the screen: "Each corner keeps its x and y. Its z is dropped."',
      'The depth range moves away — z from −5.626 to −2.374, then −9.626 to −6.374, then −13.626 to −10.374 — while the screen reads "Width: 2.732" and "Height: 2.814" at all three.',
      'From the second step on, the flying dots land exactly on the corners already drawn; the image does not move by a single vertex.',
      'The box\'s three families of parallel edges (four each, along its original x, y and z) remain parallel and equal on screen, with lengths 1.765, 1.879 and 1.162.',
      'The projection here has scale 1: screen (x′, y′) = (x, y), with no stretching or shifting. Camera space is right-handed, y up, the eye at the origin looking down −z.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself through four steps — the placed box with an empty screen, then one projection at each distance — and stops. A Replay button and a scrub strip sit below it.',
        'Scrubbing between the second and fourth steps shows the side view moving the box twice as far and then three times as far while the screen image stays exactly the same.',
        'The box, its turn and the three distances are fixed, so every coordinate and length can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains why CAD drawings, isometric games or UI layers use orthographic projection, and needs to show that measured sizes survive any distance.',
      'A reader should see concretely that "projection" can mean nothing more than dropping one coordinate, with the parallel edges of a box staying parallel.',
    ],

    avoidWhen: [
      'The subject is how perspective makes far things smaller or produces vanishing points. No perspective image is drawn here.',
      'The article is about the orthographic projection matrix, its near and far planes or mapping a view volume to −1..1. The projection here is plain x, y with scale 1.',
      'The topic is oblique or cavalier projection. The projection direction here is exactly along −z.',
    ],

    contrastWith: [
      {
        concept: 'perspectiveShrinksFar',
        note: 'Perspective divides by distance so a farther object shrinks toward a vanishing point; orthographic keeps depth out of the screen coordinates, so distance has no effect and no vanishing point exists.',
      },
      {
        concept: 'projection',
        note: 'That orthographic size is independent of distance is a property of one projection. Compared with perspective across a moving eye, the same property is what fixes the near-to-far size ratio at 1.',
      },
    ],
  },
};
