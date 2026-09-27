/**
 * brdf 개념 선언.
 *
 * canonical facet 은 `facet:brdf` — 수직 입사 · 조도 1 인 한 점에서 정반사 한 몫만 떼어 퐁과 PBR(쿡–토런스)을
 * 같은 자리에 세운다. 한 판은 봉우리 · 로브 · 총량 세 걸음이고, 손잡이 둘(모형 · 광택 n 1~256)을 돌리면 판이 다시 선다.
 * 광택을 올리면 두 모형 모두 로브가 좁아지지만, 퐁은 봉우리 0.500 을 그대로 둔 채 총량이 1.047 → 0.012 로 줄고,
 * PBR 은 봉우리가 0.107 → 9.239 로 솟는 동안 총량이 0.367 → 0.889 로 1 밑에 머문다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 다섯)
 *
 * 조각 다섯은 각각 한 장면이다 — 세 몫이 얹힘(`ambientDiffuseSpecular`) · 기울기가 밝기를 정함(`normalDecidesBrightness`) ·
 * 들어온 빛이 몫으로 갈라짐(`energyConserving`) · 재질 값 둘(`roughnessMetallic`) · 나가는 방향마다 잼과 상반성
 * (`reflectDistribution`). 이쪽은 **두 반사 모형을 손잡이 하나로 견주는 것**을 맡는다. 그래서 definition 은
 * 광택 지수 · 좁아짐 · 정규화하지 않은 퐁 · 쿡–토런스 · 반구 총량을 쥐고, 조각들이 독점한 ambient · N·L · Fresnel 로
 * 갈라짐 · absorbed · metallic · base color · reciprocity · outgoing direction 을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `brdf.md` 가 밝힌 것):
 *  - 수직 입사 한 방향 · 한 점 · 한 채널 · 조도 1 · 감마 없는 선형 값. 정반사 한 몫만 (바탕빛 · 퍼진빛 없음).
 *  - 퐁은 k_s · μ^n (k_s 0.5) 정규화하지 않은 식. PBR 은 GGX D · Schlick F(F0 0.9) · Schlick-GGX G(k = α/2).
 *  - 퐁 n ↔ α = √(2/(n+2)) 는 흔히 쓰는 근사 대응, 거칠기 = √α.
 *  - 로브는 단면, 총량은 반구 적분(μ 중점 규칙 2000 칸). 반폭각은 정수 도.
 *  - PBR 총량이 거친 쪽에서 모자라는 것은 Smith 가림이 한 번 튄 빛만 세기 때문(다중 산란 없음)이다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const brdfConcept: FacetConceptSource = {
  id: 'brdf',
  label: 'Reflection Models: Phong vs PBR as Gloss Rises',
  canonicalFacet: 'facet:brdf',

  surface: {
    definition:
      'Raising the gloss exponent narrows a specular highlight in two reflection models: unnormalized Phong keeps its peak and loses hemispherical total, while Cook–Torrance GGX raises its peak and stays below the incoming light.',
    exemplarKeywords: [
      'Phong vs PBR',
      'Phong vs Cook–Torrance',
      'GGX microfacet specular',
      'specular lobe width',
      'shininess exponent',
      'Phong exponent to GGX roughness conversion',
      'normalized Phong',
      'why Phong is not energy conserving',
      'highlight gets sharper but dimmer',
      'hemispherical reflectance',
      'reflection model comparison',
      'physically based vs empirical shading',
    ],
  },

  briefing: {
    observable: [
      'On the left, a surface line under an upper hemisphere with a Light arrow coming straight down the normal; on the right, two bars — Peak on a logarithmic axis marked 0.1 · 1 · 10, and Total on an axis from 0 to 1.2 with an Incoming line at 1. The caption at the start reads "Phong, gloss n = 16. Light arrives along the normal. Irradiance: 1."',
      'A round has three steps. Peak: the reflection toward the mirror direction θ = 0° rises on the Peak bar. Lobe: the whole lobe (outgoing intensity per direction) is drawn across the hemisphere, scaled to its own peak, with two ribs where it falls to half; the Half-width ° metric shows that angle. Total: the lobe summed over the hemisphere fills the Total bar and is set against the Incoming line.',
      'With Phong, raising gloss n through 1 · 4 · 16 · 64 · 256 leaves the peak at 0.500 every time, while the half-width closes 45° → 29° → 16° → 8° → 4° and the total falls 1.047 → 0.524 → 0.175 → 0.048 → 0.012.',
      'At Phong n = 1 the total 1.047 is above the Incoming line; the bar is marked "More than arrived" and the caption says more light leaves than arrived. At every other setting the caption says less light leaves than arrived.',
      'With PBR, the same gloss steps raise the peak 0.107 → 0.215 → 0.645 → 2.363 → 9.239 while the total climbs 0.367 → 0.531 → 0.740 → 0.854 → 0.889, below 1 at every step. The half-width closes 64° → 48° → 26° → 13° → 7°, so at the same gloss the PBR lobe is wider, with a longer tail.',
      'In PBR the stage also shows "α = … · roughness = …" for the gloss step, using the common mapping α = √(2/(n+2)) and roughness = √α.',
      'The screen does not footnote its setup: light at normal incidence with irradiance 1, one point, one channel, linear values, and only the specular term — no ambient or diffuse. Phong here is k_s · cos^n with k_s = 0.5 and no normalization factor; PBR is Cook–Torrance with a GGX distribution, Schlick Fresnel (F0 = 0.9) and Schlick-GGX shadowing (k = α/2). The lobe is a cross-section; the total is a hemisphere integral by a 2000-slice midpoint rule. PBR\'s total stays short of 1 on rough settings because the shadowing term counts single-bounce light only; multiple scattering between microfacets is not added back.',
    ],

    screen: {
      affordances: [
        'Play, Step, Pause and Reset with a speed slider, plus two segmented handles — Model (Phong / PBR, starting on Phong) and Glossiness (1 · 4 · 16 · 64 · 256, starting at 16) — and a Half-width ° metric. Each change of a handle plays a new round of peak, lobe and total.',
        'When a handle changes, the previous lobe stays behind as a dashed outline and the previous bar heights as dashed ticks, so the new lobe and bars can be read against where they were.',
        'The move that makes the contrast land is stepping Glossiness up under each model: under Phong the Peak bar never moves and the Total bar sinks; under PBR the Peak bar climbs and the Total bar fills toward, but not past, the Incoming line.',
        'The code panel, labelled "Peak and total", computes the same peak and hemisphere total for each model and gloss; it carries one computation across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why engines moved from Phong-style highlights to physically based specular, and needs a sharpening highlight whose total either drains away or stays bounded depending on the model.',
      'A reader wonders why a glossier material should have a brighter highlight, or why an unnormalized Phong exponent makes shiny objects look darker overall; the peak and total readings answer both at five gloss settings.',
    ],

    avoidWhen: [
      'The article is about metallic versus dielectric materials or colored highlights. This works in one channel with one fixed F0; there is no metallic setting and no color.',
      'The subject is how the reflection changes as the light moves toward grazing angles. The light always arrives along the normal here.',
      'The point is anisotropic reflection, subsurface scattering, or multiple-scattering compensation in microfacet models. None of them is modeled.',
    ],

    contrastWith: [
      {
        concept: 'ambientDiffuseSpecular',
        note: 'The three-term Phong sum treats the highlight as one term added to the color; comparing reflection models asks what that one term does to the total reflected light when its exponent changes.',
      },
      {
        concept: 'normalDecidesBrightness',
        note: 'The cosine law is about how much light a tilted surface receives. The model comparison fixes the incoming light and asks how the surface redistributes it over outgoing directions.',
      },
      {
        concept: 'energyConserving',
        note: 'Energy conservation is the constraint that reflected shares add up to no more than what arrived. Comparing models turns that constraint into a test: an unnormalized Phong lobe can break it, while a microfacet model stays within it.',
      },
      {
        concept: 'roughnessMetallic',
        note: 'Metallic and roughness are the parameters an artist sets on a physically based material. The model comparison concerns the specular formula underneath, and how its narrowing trades against peak height and total.',
      },
      {
        concept: 'reflectDistribution',
        note: 'A BRDF as a function of incoming and outgoing directions, with its reciprocity, is the object itself. Comparing models takes that object as given and asks how two concrete formulas behave as their sharpness parameter rises.',
      },
    ],
  },
};
