/**
 * reflectAndRefract 개념 선언.
 *
 * canonical facet 은 `facet:reflectAndRefract` — 수평 경계 y = 0 의 위는 공기(n 1.0), 아래는 유리(n 1.5).
 * 공기 쪽 광선은 45° 로 닿아 반사(45°)와 굴절(28.1°) 두 갈래로 갈라지고, 유리 쪽 광선은 같은 45° 로 닿지만
 * sin θ₂ = 1.061 > 1 이라 반사만 남는다(전반사). 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `rayTracingBase` 는 유리 원을 지나는 광선들이 굴절률에 따라 어디에 닿는가를 돌린다(반사 없음).
 * 이쪽은 **면 하나에서 광선이 어느 쪽으로 갈라지는가, 늘 둘로 갈라지는가** 하나다. definition 은
 * splits · mirror reflection · Snell's law · critical angle · denser side 를 쥐고, landing order ·
 * shadows · pixel 을 쓰지 않는다.
 *
 * 전제 (설명 글 `reflectAndRefract.md`): 2D 단면. 법선은 광선이 온 쪽을 향하게 잡는다. 방향만 셈하고
 * 프레넬(빛을 얼마씩 나누는가)은 다루지 않으며, 갈라진 광선을 더 따라가지 않는다 — 한 번 닿음만.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const reflectAndRefractConcept: FacetConceptSource = {
  id: 'reflectAndRefract',
  label: 'Reflection and Refraction at a Glass Surface',
  canonicalFacet: 'facet:reflectAndRefract',

  surface: {
    definition:
      'A ray striking a glass surface splits into a mirror reflection and a ray refracted by Snell\'s law; from the denser side beyond the critical angle only the reflection remains.',
    exemplarKeywords: [
      'reflection and refraction',
      'reflect vector R = D - 2(D·N)N',
      'refract direction formula',
      'Snell\'s law',
      'total internal reflection',
      'critical angle of glass',
      'index of refraction 1.5',
      'secondary rays in a ray tracer',
      'glass and water material',
      'angle of incidence equals angle of reflection',
    ],
  },

  briefing: {
    observable: [
      'A horizontal boundary with "Air · n 1.0" above and "Glass · n 1.5" below. It opens with "Two rays head for the boundary between air and glass.", one labelled "Ray from air", the other "Ray from glass".',
      'The ray from air reaches the boundary at (0.00, 0.00): "t 2.83 · direction (0.707, −0.707) · angle of incidence 45.0°", with the Normal drawn at the hit point.',
      'A reflection leaves the hit point on the far side of the normal: "Reflect: R = D − 2(D·N)N = (0.707, 0.707)", "Angle of reflection 45.0°".',
      'A second ray then leaves the same point into the glass. It first comes out along the straight path and then swings toward the normal, leaving the straight path dotted: "Refract: T = (0.471, −0.882) · angle of refraction 28.1° (sin θ₂ 0.471)", "Bent toward the normal by 16.9°".',
      'The ray from glass reaches the boundary at (3.00, 0.00) at the same 45.0°. Its reflection forms just the same way: "R = (0.707, −0.707)", 45.0°.',
      'Then the would-be refracted ray starts along the straight path, tips away from the normal, lies down onto the boundary and fades: "No refraction: sin θ₂ = 1.5 · sin 45.0° / 1.0 = 1.061 > 1". The ray from glass ends with a Reflection and "No refraction" only — total internal reflection.',
      'Setup the screen does not footnote: a 2D slice; the normal is taken on the side the ray comes from, n₁ is the index on that side and n₂ the other. The critical angle from glass to air is 41.8°, so 45° is already past it. Only directions are computed — how much light goes each way (Fresnel) is not — and the new rays are not followed further.',
    ],

    screen: {
      affordances: [
        'The screen plays its steps on its own — hit, reflect, refract for the first ray, then hit, reflect, no refraction for the second — and stops.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip between the two refract steps sets the ray that bends into the glass beside the one that cannot get out.',
        'The two media, the angle and both rays are fixed, so every vector and angle can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces the two new directions a ray tracer spawns at a transparent surface and wants the reflect and refract formulas shown producing actual vectors.',
      'A reader thinks light always splits in two at glass, or cannot see why the same 45° gives a refracted ray one way and none the other; the pair of rays at equal angles makes total internal reflection concrete.',
    ],

    avoidWhen: [
      'The article is about how much light is reflected versus transmitted — Fresnel, Schlick\'s approximation, reflectance curves. Only directions are shown.',
      'The subject is rough or glossy reflection spreading light over many directions. Both reflections here are perfect mirror directions.',
      'The point is optics of lenses and focusing, or dispersion into colours. There is one flat boundary and one index of refraction.',
    ],

    contrastWith: [
      {
        concept: 'rayTracingBase',
        note: 'The rule at one surface gives two candidate directions and the condition under which one vanishes. A full trace applies the bending on the way into and out of an object and follows the consequence all the way to the image.',
      },
      {
        concept: 'reflectDistribution',
        note: 'A perfect mirror sends reflected light in exactly one direction. A reflectance distribution describes how much light a surface sends in every outgoing direction, which for rough surfaces spreads around that mirror direction.',
      },
      {
        concept: 'shadowRay',
        note: 'Reflected and refracted rays carry the path onward to find more colour; a shadow ray ends the path and only asks whether the light can be seen.',
      },
    ],
  },
};
