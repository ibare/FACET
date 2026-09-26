/**
 * sixteenMilliseconds 개념 선언.
 *
 * canonical facet 은 `facet:sixteenMilliseconds` — 조각이다. 60Hz 화면의 한 장
 * 예산(16.7ms)이 스크립트 → 스타일 → 레이아웃 → 페인트 네 단계를 지나며 그 몫만큼
 * 깎이는 것을 걸음마다 보이고, 남은 시간이 페인트 도중 바닥나 박자가 먼저 와 버리는
 * 순간과, 겨우 1.3ms 늦었을 뿐인데도 박자 하나를 통째로 잃는 결과를 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 짝인 `droppedFrame` 과 같은 사건(장이 박자를 넘긴다)의 서로 다른 절반을 맡는다.
 * 이 조각은 **한 장의 안쪽** — 예산이 단계마다 깎이는 시각표, 남은 시간이 0 에 닿는
 * 순간 — 을 보인다. definition 의 단위는 "단계 하나가 예산에서 깎는 몫" 이다.
 * `droppedFrame` 은 그 사건이 **여러 장에 걸쳐** 반복될 때 화면에 남는 자국(되풀이 ·
 * 건너뛴 자리 · 뜀 거리)을 보이므로, 단계 이름(script·style·layout·paint)이나
 * "예산"·"몫" 같은 회계 어휘를 그쪽 definition 에는 넣지 않았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sixteenMillisecondsConcept: FacetConceptSource = {
  id: 'sixteenMilliseconds',
  label: 'Sixteen Milliseconds (One Frame\'s Budget Runs Out Mid-Stage)',
  canonicalFacet: 'facet:sixteenMilliseconds',

  surface: {
    definition:
      'A 60Hz screen gives one frame a fixed 16.7ms budget, and each rendering stage in turn — script, style, layout, paint — deducts its own cost from what remains; when the last stage is still running as the next screen beat arrives, that beat shows the previous frame instead, and finishing only slightly late still costs a whole beat rather than a fraction of one.',
    exemplarKeywords: [
      '16.7ms frame budget',
      '60fps budget per frame',
      'main thread frame budget',
      'script style layout paint timing',
      'missed vsync deadline',
      'frame budget overrun',
      'small overrun costs a whole frame',
      'why 60fps matters',
      'rendering stage cost breakdown',
    ],
  },

  briefing: {
    observable: [
      'A caption opens by naming the whole budget for one frame in milliseconds before any stage has run.',
      'After each of three stages, a caption names exactly how many milliseconds that stage spent and how many are left of the budget, so the remaining number visibly shrinks three times in a row.',
      'A bar for the fourth stage is still growing when a caption announces that a screen beat has arrived partway through it, naming how much of that stage\'s own cost had been done at that instant and that no new frame is available yet.',
      'A final caption names how many milliseconds past the budget the last stage ran, and separately names which later beat the frame is actually shown at — a lateness measured in a fraction of a millisecond next to a delay measured in a whole beat.',
      'A beat marker on the timeline is spaced at the fixed budget interval regardless of where the stage bars end, so the gap between where a stage bar stops and where the next beat marker sits is visible on screen rather than only stated in a caption.',
    ],

    screen: {
      affordances: [
        'The screen plays through six steps on its own — the opening budget, three completed stages, the beat arriving mid-stage, and the stage finishing late — then stops.',
        'A replay control and a step strip let a reader hold any single step still, including the exact instant the beat arrives before the last stage is done.',
        'The four stage costs, the refresh rate and the budget are fixed, so an article can name the exact millisecond figures at any step.',
      ],
    },

    useWhen: [
      'The article needs the reader to watch a running total cross a fixed line rather than take on faith that "too much work in one frame" is a problem, with each stage\'s deduction named as its own step.',
      'The point is that a frame missing its beat by a small margin does not arrive a small margin late on screen — it waits for the following beat in full, so a 1.3ms overrun of a 16.7ms budget costs an entire extra beat interval.',
      'The reader needs the stage order itself named and counted in sequence — script, then style, then layout, then paint — as the thing that is being charged against the budget, not just a single lump cost for "rendering".',
    ],

    avoidWhen: [
      'The article is about what the viewer sees across many frames once beats start getting missed repeatedly — the repeated picture, the skipped position, the size of the resulting jump. This screen stops after the one frame it follows is finally shown.',
      'The subject is which CSS property or how many elements determine a stage\'s cost in the first place. The four stage costs here are given values to spend, not derived from a property or an element count.',
      'The article is about a script reading measured geometry back from the page inside a loop. No stage here waits on a read; each one is charged a fixed cost and runs once per frame.',
    ],

    contrastWith: [
      {
        concept: 'droppedFrame',
        note: 'This opens the inside of one frame\'s stage-by-stage millisecond ledger to show exactly where a fixed budget gets crossed; droppedFrame instead fixes a run of seven frames\' total costs in advance and walks the beat-by-beat register of which position repeated and which one was never drawn.',
      },
      {
        concept: 'frameBudget',
        note: 'This is a fixed stage breakdown for a single frame with no dial to turn; frameBudget instead lets a reader change the animated property and the element count and reports the frames-per-second and jump distance those choices produce over many beats.',
      },
    ],
  },
};
