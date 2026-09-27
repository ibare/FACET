/**
 * normalDecidesBrightness 개념 선언.
 *
 * canonical facet 은 `facet:normalDecidesBrightness` — 폭 1 인 평행 빛줄기가 바로 위에서 내려오고, 면 일곱이
 * 차례로 0° · 25° · 45° · 60° · 75° · 100° · 135° 로 돌아선 뒤 빛줄기를 받는다. 덮는 길이는 1/cosθ 로 늘고
 * 한 자리의 밝기는 cosθ 로 준다 (1.000 · 0.906 · 0.707 · 0.500 · 0.259), 빛을 등진 두 면은 0.000 에 붙는다.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 이쪽 주장은 **같은 빛이 기운 면 위에서 더 넓게 퍼져 한 자리 몫이 준다** 하나다 (램버트 코사인 법칙).
 * definition 은 tilt · spread · cosine · faces away · clamps to zero 를 독점하고, 세 몫의 합 · 반사 방향 · 재질 · 모형 비교를 쓰지 않는다.
 * 그림자 광선과는 "면의 기울기" ↔ "길의 막힘" 으로 갈린다.
 *
 * 전제 (설명 글 `normalDecidesBrightness.md`): 빛의 세기 1 · k_d 1 인 흰 면이라 밝기 = max(0, cosθ).
 * 평행광이라 거리 감쇠 없음. 가리는 물체 없음. 퍼진빛 한 몫만 (바탕빛 · 번쩍임 없음). 2D 단면. 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const normalDecidesBrightnessConcept: FacetConceptSource = {
  id: 'normalDecidesBrightness',
  label: 'Lambert\'s Cosine Law: Surface Tilt Sets Brightness',
  canonicalFacet: 'facet:normalDecidesBrightness',

  surface: {
    definition:
      'As a surface tilts away from a light, the same beam spreads over a longer stretch of it, so each spot receives cos θ as much; a surface facing away clamps to zero, never negative.',
    exemplarKeywords: [
      'Lambert\'s cosine law',
      'Lambertian diffuse',
      'max(0, N·L)',
      'dot product of normal and light direction',
      'why tilted surfaces look darker',
      'surface normal and brightness',
      'back-facing to the light',
      'clamp negative dot product',
      'irradiance falls with incidence angle',
      'why winter sunlight is weaker',
    ],
  },

  briefing: {
    observable: [
      'A parallel beam of width 1 comes straight down from the Light. Below it wait seven faces, labelled by how far their normal is tilted from the light: 0° · 25° · 45° · 60° · 75° · 100° · 135°. The opening reads "Faces waiting below: 7 · Beam width: 1".',
      'Each step turns one face to its tilt, shows its Normal, and drops the beam on it; a Brightness row fills in the value under that face. Eight steps counting the opening.',
      'The points where the beam\'s rays land move further apart as the face tilts: the same rays cover a longer stretch, 1 / cos θ of the beam width — twice as long at 60°, 3.864 times at 75°. The caption reads "The same beam lies along a longer stretch of the face."',
      'Brightness per spot is the reverse ratio, cos θ: 1.000 at 0°, 0.906 at 25°, 0.707 at 45°, 0.500 at 60°, 0.259 at 75°.',
      'At 100° and 135° the face turns its back on the light. cos θ would be −0.174 and −0.707, but the brightness stays at 0.000 rather than going negative, and the caption says the beam never reaches the face\'s front.',
      'The screen does not footnote its setup: light intensity 1 on a white face with k_d = 1, so brightness is simply max(0, cos θ); a parallel light, so no distance falloff; nothing blocks the light; and only the diffuse term is present — no ambient, no highlight. The scene is a 2D cross-section.',
    ],

    screen: {
      affordances: [
        'The screen plays its steps on its own, one face per step, and stops after the 135° face.',
        'A Replay button and a playback strip sit below it. Dragging the strip back and forth between the 0° and 60° steps shows the landing points spreading to twice the length as the brightness drops to half.',
        'The tilts and the beam are fixed, so every angle, length ratio and brightness can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces diffuse lighting and needs to justify why the dot product of normal and light direction appears in the formula, not merely state it.',
      'A reader wonders why a shader clamps N·L at zero; watching faces turned past 90° stay at 0.000 while the cosine goes negative settles it.',
    ],

    avoidWhen: [
      'The article is about shadows cast by other objects. Nothing here blocks the light; the only thing that changes is the tilt of the face.',
      'The subject is distance falloff, point lights or the inverse-square law. The light is parallel and its strength does not change with distance.',
      'The point is specular highlights, glossy materials or view-dependent shading. Only the diffuse term is shown, and the eye does not matter.',
    ],

    contrastWith: [
      {
        concept: 'ambientDiffuseSpecular',
        note: 'The Phong sum uses N·L as a ready-made factor on its diffuse term. The cosine law is the reason that factor exists: a tilted surface catches the same light over a larger area.',
      },
      {
        concept: 'shadowRay',
        note: 'Both make a point darker, for different reasons. The cosine law darkens by how the surface is turned relative to the light; a shadow ray darkens by whether anything stands between the point and the light.',
      },
      {
        concept: 'brdf',
        note: 'The cosine law governs how much light arrives per spot. A reflection model takes that arriving light as given and decides how it leaves in each direction.',
      },
    ],
  },
};
