/**
 * projection 개념 선언.
 *
 * canonical facet 은 `facet:projection` — 크기가 같은 상자 둘(한 변 1)이 4 떨어져 한 줄로 서고, 눈은 앞 상자의
 * 정면 축 위 (0, 0, d) 에서 앞 상자 중심을 본다. 손잡이 둘 — 눈의 거리 d(12 · 8 · 5 · 3 · 2 · 1.4, 처음 5)와
 * 투영(원근 · 직교). 한 판이 네 걸음(카메라 좌표 → 가까운 면 자르기 → 투영 → 앞/뒤 폭 비)으로 두 상의 폭 비를 셈한다.
 * 원근의 비는 d 12 의 1.348 에서 1.4 의 4.900 까지 오르고, 직교는 여섯 거리 모두 1.000 이다. d 1.4 에서만
 * 가까운 면이 앞 상자의 모서리 넷을 버리고 넷을 자른다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 다섯)
 *
 * 조각 다섯은 각각 한 장면이다 — 세상이 눈 앞으로 옮겨짐(`worldToCamera`) · 세 축이 섬(`lookAtDirection`) ·
 * 멀수록 작아짐(`perspectiveShrinksFar`) · 멀어도 그대로(`orthographicKeepsSize`) · 틀 밖을 자름(`cutOutsideFrustum`).
 * 이쪽은 그 장면들을 한 판에 잇고 **손잡이로 견주는 것**을 맡는다: 눈을 옮기면 앞/뒤 두 상의 **폭 비**가 어디로 가는가,
 * 투영을 바꾸면 그 비가 어떻게 1 로 붙는가. 그래서 definition 은 eye distance · ratio · two objects · switching 쪽
 * 낱말을 쥐고, 조각들이 독점한 cross product · negative eye position · halves when distance doubles · drops z ·
 * new vertices on the boundary 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `projection.md` 가 밝힌 것):
 *  - 오른손 · y 위 · 카메라 −z. 수직 시야 60° · 화면비 1 · 직교 반 높이 2. 바라보는 점은 앞 상자 중심에 고정.
 *  - 자르는 면은 가까운 면(깊이 1) 하나. 먼 면은 없고 옆 면은 이 자료에서 아무것도 자르지 않는다.
 *  - 선틀(모서리)만 자른다 — 다각형 Sutherland–Hodgman 이 아니다.
 *  - 원근을 f·x / d 로 적었다 (투영 행렬 · w 나눔을 거치지 않는다).
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const projectionConcept: FacetConceptSource = {
  id: 'projection',
  label: 'Camera and Projection (Eye Distance vs Size Ratio)',
  canonicalFacet: 'facet:projection',

  surface: {
    definition:
      'How the eye\'s distance sets the size ratio between the images of a nearer and a farther equal object: under perspective the ratio climbs as the eye approaches, under orthographic it stays exactly one.',
    exemplarKeywords: [
      'perspective vs orthographic projection',
      'camera distance and perspective distortion',
      'wide-angle close-up exaggerates the foreground',
      'telephoto flattens depth',
      'dolly zoom',
      'viewing pipeline',
      'view transform, clipping, projection',
      'near clipping plane cuts into an object',
      'field of view 60 degrees',
      'orthographic camera in games and CAD',
      'OpenGL',
      'WebGL',
    ],
  },

  briefing: {
    observable: [
      'Two boxes of side 1 stand in a line, the front one at the origin and the back one 4 behind it at z = −4. The eye sits on the front box\'s axis at (0, 0, d) and looks at the front box\'s centre. The stage shows a view "Seen from above", a close-up "Around the front box", and a "Screen" with the two images.',
      'Each round takes four steps. Step 1, "Camera coordinates — depth from the eye to each box", stretches a depth bar to each box: at d = 5 the front box spans depth 4.50..5.50 and the back 8.50..9.50.',
      'Step 2 cuts against the near plane at depth 1 and reports "vertices behind · edges cut · edges dropped · new vertices". At every distance except 1.4 all four are 0. At 1.4 the front face\'s four vertices (depth 0.90) fall behind it: four front-face edges are dropped, the four edges running in z are cut and slide their ends onto the plane at (±0.50, ±0.50, −1.00). This happens in both projections, because clipping comes before projecting.',
      'Step 3 projects and labels each image\'s width; step 4 divides them and moves a marker on a 1..5 scale to "Front/back". At d = 5 in perspective: front 0.385, back 0.204, ratio 1.889.',
      'Perspective ratios over the distance handle: 12 → 1.348, 8 → 1.533, 5 → 1.889, 3 → 2.600, 2 → 3.667, 1.4 → 4.900. From 12 to 1.4 the front image grows 11.5 times (0.151 to 1.732) while the back one grows only 3.2 times (0.112 to 0.353). Without clipping the ratio follows the depth ratio of the two near faces, (d + 3.5) / (d − 0.5).',
      'In orthographic mode both images are 0.500 wide at every distance and the ratio is 1.000 throughout; the top view turns the viewing wedge into a parallel band.',
      'At d = 1.4 the 4.900 is measured after clipping; had the near plane not cut the front box, its width would have been 1.925 and the ratio 5.444. The screen shows only the clipped value.',
      'Conventions the screen does not footnote: right-handed, y up, camera looking down −z; vertical field of view 60° (focal 1.732), aspect 1, orthographic half-height 2; one clipping plane (near, depth 1), no far plane; only the wireframe edges are clipped; perspective is written as f·x / depth rather than through a projection matrix and a divide by w.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: an "Eye distance" slider with six positions 12, 8, 5, 3, 2, 1.4 (starting at 5) and a "Projection" switch, Perspective or Orthographic (starting at Perspective). Each round plays its four steps, about ten seconds, then waits for a handle.',
        'Two readouts sit under the controls: "Edges cut" (4 only at distance 1.4) and "Front/back width %" (the ratio times 100, rounded — 189 at the start).',
        'The move that makes the idea land is walking the eye in from 12 to 1.4 in perspective, watching the ratio marker climb, then flipping to Orthographic and seeing both images snap to the same width at any distance.',
        'The code panel, labelled "Image width ratio", starts empty with a "+ Add language" button; the chosen language shows `widthRatio` and its helper computing the same ratio along the same path — look-at, camera coordinates, near-plane cut, projection, width. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why a close camera makes the foreground look huge next to the background, and needs numbers showing the size ratio rising as the eye approaches while the objects stay the same.',
      'A reader must choose between perspective and orthographic cameras and should see, on the same scene, one ratio that depends on eye distance and one that is pinned at 1.',
      'The article walks the camera stages in order — into camera space, clip, project — and wants one handle that shows each stage\'s output shifting together.',
    ],

    avoidWhen: [
      'The subject is the projection matrix, homogeneous coordinates or the divide by w. Perspective here is computed directly as focal times coordinate over depth.',
      'The article is about clipping polygons against all six frustum planes. Only the near plane cuts here, and only wireframe edges, not filled faces.',
      'The point is aiming or orbiting a camera. The look-at point is fixed on the front box and the eye moves only along one straight axis.',
      'The topic is field of view or focal length changes. The angle is fixed at 60°; only the eye\'s distance moves.',
    ],

    contrastWith: [
      {
        concept: 'perspectiveShrinksFar',
        note: 'Size falling in inverse proportion to distance is the rule itself. The ratio between two objects as the eye moves is a consequence of that rule: what changes is how different their two distances are, relative to each other.',
      },
      {
        concept: 'orthographicKeepsSize',
        note: 'Dropping depth means an object keeps its size however far it goes. Set against perspective, that same property is what holds the near-to-far ratio at 1 while the perspective ratio moves.',
      },
      {
        concept: 'cutOutsideFrustum',
        note: 'Clipping a triangle against every frustum plane in clip space is a general polygon procedure. Here clipping is one stage in a camera pipeline, and its effect is judged by how it changes the measured image size.',
      },
      {
        concept: 'worldToCamera',
        note: 'Re-expressing world points relative to the eye is the first stage of the pipeline; this concept is about what the later projection stage does with the depths that stage produces.',
      },
      {
        concept: 'lookAtDirection',
        note: 'Deriving camera axes from an eye, a target and an up vector settles where the camera points. Projection takes that orientation as given and asks how distance turns into image size.',
      },
      {
        concept: 'wDivide',
        note: 'Dividing by w is how graphics hardware carries out the perspective division. The comparison of perspective and orthographic is about the visible result of dividing by depth or not, whatever machinery performs it.',
      },
    ],
  },
};
