/**
 * rayTracingBase 개념 선언.
 *
 * canonical facet 은 `facet:rayTracingBase` — 장면을 위에서 본 평면 한 장으로 잘라, 영상 줄 12 칸에서
 * 광선 하나씩을 쏜다. 여섯(픽셀 4 ~ 9)은 유리 원에 들어가고 나오며 꺾여 줄무늬 벽에 닿고, 여섯은 곧장 벽에
 * 닿는다. 닿은 점에서 빛으로 그림자 광선을 쏘아 칸의 밝기를 정한다. 손잡이는 유리의 굴절률(1.0 ~ 2.0, 처음 1.6).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각 넷은 각각 한 장면이다 — 칸마다 광선 하나(`shootRayPerPixel`) · 가장 가까운 교차(`nearestHit`) ·
 * 한 면에서의 반사와 굴절 · 전반사(`reflectAndRefract`) · 빛까지의 길이 막혔나(`shadowRay`).
 * 이쪽은 그 장면들을 한 줄에 잇고 **굴절률을 돌리면 무엇이 옮겨 가는가**를 맡는다. 그래서 definition 은
 * refractive index · bends harder · landing order reverses · shadows move 를 쥐고, 조각들이 독점한
 * pixel center · smallest t · critical angle · splits · blocked path 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `rayTracingBase.md` 가 밝힌 것):
 *  - 3 차원 장면이 아니라 평면 단면, 영상은 한 줄 12 칸. 픽셀 중심은 +0.5, 픽셀당 광선 하나.
 *  - 유리는 굴절만 한다(반사 광선 · 프레넬 없음). 원을 지나는 광선은 전반사가 일어나지 않는다.
 *  - 그림자 광선에게 유리는 불투명하다 — 위티드 광선 추적의 흔한 단순화.
 *  - 칸 색은 벽 띠 색 그대로, 그림자 속은 0.3 배. N·L · 거리 감쇠 없음. 선형 RGB, 감마 없음.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다. 각(°)은 코드가 내지 않고 화면 표시만 셈한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rayTracingBaseConcept: FacetConceptSource = {
  id: 'rayTracingBase',
  label: 'Ray Tracing (Refraction and Shadows Along One Image Row)',
  canonicalFacet: 'facet:rayTracingBase',

  surface: {
    definition:
      'A ray tracer follows each pixel\'s ray through refracting glass to a wall and toward the light; a higher refractive index bends rays harder, reverses their landing order and moves the shadows.',
    exemplarKeywords: [
      'ray tracing',
      'Whitted ray tracing',
      'how a ray tracer works end to end',
      'recursive ray tracing pipeline',
      'refractive index of glass',
      'lens flips the image',
      'spherical aberration',
      'refraction through a glass sphere',
      'transparent objects in a ray tracer',
      'image-order rendering',
      'offline rendering',
    ],
  },

  briefing: {
    observable: [
      'A flat top-down slice: an eye at the bottom, an "image row" of 12 numbered cells just above it, a glass disc in the middle, a wall striped in nine coloured bands across the top, and a light off to the left.',
      'Step 1 shoots one ray per cell to the first thing it hits: "rays 12 · glass 6 · wall 6". Pixels 4 to 9 meet the glass; the other six go straight to the wall. This split is the same at every refractive index.',
      'Step 2 bends the six glass rays toward the normal on the way in; the caption gives pixel 4 as "incidence 63.3° → refraction 33.9°" at n 1.6.',
      'Step 3 bends them away from the normal on the way out. Each exiting ray slides along the wall from its dotted "straight-line landing" tick — where it would have landed with no glass — to its real spot. At n 1.6 the caption reads "largest bend 58.7° · flipped neighbour pairs 5".',
      'Step 4 sends a "shadow ray" from every landing point toward the light; the glass counts as blocking. At n 1.6 it reads "blocked by the glass 4 / 12": pixels 10, 11 and 12 at every index, plus pixel 4, whose landing has crossed to the right side of the wall.',
      'Step 5 colours each cell with the band its ray hit, dimmed to 0.3 in shadow, and the colour travels back along the ray into the image row. At n 1.6 the bands read "2 3 3 7 6 5 5 4 3 7 7 8".',
      'Across the index: 1.0 bends nothing (0°, 0 flipped pairs, 3 shadowed pixels, every ray on its dotted tick); 1.2 gives 30.4°, 2 pairs, 3 shadowed; 1.4 gives 47.3°, 5 pairs, 3 shadowed; 1.6 gives 58.7°, 5 pairs, 4 shadowed; 2.0 gives 73.6°, 5 pairs, 4 shadowed. From 1.4 up all six rays through the glass land in reversed order — the edge rays bend most and cross first, which is spherical aberration.',
      'The model is simplified and the screen does not footnote it: a 2D slice with one row of pixels and one ray per pixel through its centre; the glass refracts only (no reflected ray, no Fresnel split) and is treated as opaque by shadow rays; a cell\'s colour is the band colour or 0.3 of it, with no N·L or distance falloff; colours are linear RGB without gamma.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a five-position "Refractive index" slider (1.0, 1.2, 1.4, 1.6, 2.0), starting at 1.6. Each round plays the five steps, then waits for the handle.',
        'Three readouts under the controls — "Largest bend (°)", "Flipped pairs", "Pixels in shadow" — are counted afresh each round.',
        'The move that makes the idea land is dropping the index to 1.0 and stepping it back up: the landings leave their dotted ticks, the glass rays swap sides, and pixel 4 walks into shadow at 1.6.',
        'The code panel, labelled "Tracing one row", starts empty with a "+ Add language" button; the chosen language shows `renderRow` with `hitCircle`, `refract` and `blocked`, highlighting the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article walks through what a ray tracer does for one pixel from first ray to final colour and wants every stage — primary ray, refraction in and out, shadow ray, shading — on one screen with the code beside it.',
      'A reader should see that the material property of one object changes both where the image comes from and which pixels end up dark, by turning the refractive index and watching landings reorder and a pixel slip into shadow.',
    ],

    avoidWhen: [
      'The article is about rendering a full 2D image or a 3D scene; this is a single row of twelve pixels in a flat slice.',
      'The subject is Fresnel reflection, total internal reflection or mirrors inside the tracer. The glass here only refracts, and no ray is ever reflected.',
      'The point is soft shadows, anti-aliasing, path tracing or indirect light. Each pixel gets exactly one ray, the light is a point, and nothing bounces off the wall.',
    ],

    contrastWith: [
      {
        concept: 'shootRayPerPixel',
        note: 'One primary ray per pixel is where a ray tracer starts. Tracing covers what follows that ray: bending through materials, testing the path to the light and turning the result into a colour.',
      },
      {
        concept: 'nearestHit',
        note: 'Choosing the closest intersection answers what a single ray meets first. A full trace repeats that choice at every segment of a path whose direction keeps changing.',
      },
      {
        concept: 'reflectAndRefract',
        note: 'The split at one surface is a local rule about directions. Tracing chains those rules through a whole object, so a single material constant reshapes where every ray ends up.',
      },
      {
        concept: 'shadowRay',
        note: 'A visibility test for one point is a yes-or-no about light reaching it. In a full trace that test runs at wherever each ray finally lands, so moving the landing moves the shadow.',
      },
      {
        concept: 'rasterization',
        note: 'Rasterization starts from the geometry and finds which pixels each triangle covers; ray tracing starts from the pixels and asks what each one sees, which is what lets refraction and shadows follow naturally from the same ray.',
      },
      {
        concept: 'globalIllumination',
        note: 'Classic ray tracing follows sharp paths — straight to a surface, bent by glass, tested against the light. Global illumination adds the diffuse light bouncing between surfaces that such paths leave out.',
      },
    ],
  },
};
