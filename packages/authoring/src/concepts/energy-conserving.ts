/**
 * energyConserving 개념 선언.
 *
 * canonical facet 은 `facet:energyConserving` — 들어온 빛 1 이 표면에서 정반사 F(Schlick) · 퍼짐 (1 − F)ρ ·
 * 흡수 (1 − F)(1 − ρ) 로 갈라진다. 비금속 F0 0.04 · ρ 0.8, 들어오는 각만 0° · 60° · 70° · 80° · 88° 로 바뀐다.
 * 나간 합 0.808 → 0.814 → 0.832 → 0.882 → 0.969, 늘 1 밑. 줄기의 폭이 곧 양이다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 이쪽 주장은 **퍼짐은 정반사가 가져가고 남은 1 − F 에서만 나오므로 나간 합이 들어온 빛을 넘을 수 없다** 하나다.
 * definition 은 split · Fresnel · grazing · absorbed · remainder 를 독점하고, 완제품의 gloss · peak · lobe,
 * 재질 조각의 metallic · roughness, 방향 조각의 outgoing direction · reciprocity 를 쓰지 않는다.
 *
 * 전제 (설명 글 `energyConserving.md`): Schlick F = F0 + (1 − F0)(1 − cosθ)^5, 단색 · 선형 · 소수 셋째 반올림 표시
 * (70° 에서 보이는 몫의 합이 0.001 어긋난다). 몫의 크기만 — 거칠기로 잃는 몫 · 빠져나올 때의 프레넬 · 방향은 셈하지 않았다.
 * 줄기 방향은 방향을 뜻하지 않는다. "ρ 를 그대로 더하면 80° 1.210 · 88° 1.644" 는 설명 글의 견줌이고 화면에 없다.
 * 화면에 코드는 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const energyConservingConcept: FacetConceptSource = {
  id: 'energyConserving',
  label: 'Energy Conservation: Reflected Light Never Exceeds Incoming',
  canonicalFacet: 'facet:energyConserving',

  surface: {
    definition:
      'Light reaching a surface splits into Fresnel reflection, diffuse and absorbed shares; diffuse draws only on the remainder 1 − F, so reflected light never exceeds incoming, even at grazing angles.',
    exemplarKeywords: [
      'energy conservation in shading',
      'energy-conserving BRDF',
      'Fresnel term',
      'Schlick approximation',
      'F0 reflectance at normal incidence',
      'diffuse times (1 − F)',
      'kS + kD ≤ 1',
      'albedo and absorption',
      'grazing-angle reflection',
      'surface creates light bug',
      'dielectric F0 = 0.04',
    ],
  },

  briefing: {
    observable: [
      'An incoming stream of width 1 meets a surface labelled "F0 0.04 · ρ 0.8" — a non-metal. The width of each stream is its amount of light. Six steps counting the opening; only the incoming angle changes.',
      'At each angle the stream splits in two at the surface: a Specular stream bounces straight off, and the rest goes inside, where it divides into a Diffuse stream that comes back out and an Absorbed stream that stops. The caption gives the angle and the out total.',
      'The readings step by step: 0° — specular 0.040, diffuse 0.768, absorbed 0.192, out total 0.808; 60° — 0.070, 0.744, 0.186, 0.814; 70° — 0.158, 0.673, 0.168, 0.832; 80° — 0.410, 0.472, 0.118, 0.882; 88° — 0.844, 0.125, 0.031, 0.969.',
      'As the angle lays down, the specular stream widens and the diffuse and absorbed streams both narrow by the matching amount; the out total rises but stays below the incoming 1 at every angle.',
      'Numbers are shown to three decimals, so at 70° the visible specular and diffuse add to 0.831 while the out total reads 0.832, the sum before rounding (0.83169); the other four steps add up exactly as shown.',
      'The screen does not footnote its setup: the specular share uses Schlick\'s approximation F = F0 + (1 − F0)(1 − cos θ)^5; inside = 1 − F, diffuse = (1 − F)·ρ, absorbed = (1 − F)(1 − ρ). One channel, linear values. Only the sizes of the shares are computed — not losses from roughness, not Fresnel on the way back out, and not where the reflection goes; the directions of the drawn streams carry no meaning.',
    ],

    screen: {
      affordances: [
        'The screen plays its six steps on its own and stops at 88°.',
        'A Replay button and a playback strip sit below it. Dragging the strip between the 0° and 88° steps shows the specular stream swelling while the diffuse stream shrinks by what it gave up.',
        'F0, ρ and the five angles are fixed, so every share can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains why a physically based shader scales its diffuse term by (1 − F) instead of adding diffuse and specular independently.',
      'A reader asks why surfaces look more mirror-like at grazing angles; the widening specular share next to a shrinking diffuse share, with a total that still stays under 1, shows both at once.',
    ],

    avoidWhen: [
      'The article is about where reflected light goes — highlight shape, lobes or glossiness. Only amounts are computed here; the directions of the streams mean nothing.',
      'The subject is metals or colored reflectance. The surface is a single non-metal in one channel.',
      'The point is multiple scattering, subsurface transport or light leaving the surface after several bounces. Each share is one split, computed once.',
    ],

    contrastWith: [
      {
        concept: 'ambientDiffuseSpecular',
        note: 'The Phong sum adds its diffuse and specular terms with independent weights. Energy conservation couples them: whatever the specular share takes is no longer available to diffuse.',
      },
      {
        concept: 'brdf',
        note: 'Splitting incoming light into shares states the conservation constraint itself. Comparing reflection models checks whether one formula\'s specular output alone respects that constraint as its gloss changes.',
      },
      {
        concept: 'roughnessMetallic',
        note: 'Conservation says how light divides at one surface. Metallic and roughness are the material inputs that set F0 and whether a diffuse share exists at all, and where on the surface the reflected light appears.',
      },
    ],
  },
};
