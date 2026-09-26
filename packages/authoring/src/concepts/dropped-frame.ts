/**
 * droppedFrame 개념 선언.
 *
 * canonical facet 은 `facet:droppedFrame` — 조각이다. 일곱 장(일 길이 9·10·9·27·9·10·9
 * ms)을 만드는 동안 넷째 장만 유독 길어 박자 하나를 넘긴다. 그 박자에는 앞 장이
 * 되풀이되고, 넷째 장이 그리려던 자리 하나는 어느 장에도 담기지 못한 채 건너뛰어져
 * 상자가 60px 에서 100px 로 한 번에 뛴다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 짝인 `sixteenMilliseconds` 와 같은 사건의 서로 다른 절반을 맡는다. 그쪽은 한 장의
 * 안쪽(단계별 예산 소비, 남은 시간이 0 에 닿는 순간)을 보이고, 이 조각은 **그 사건이
 * 여러 장에 걸쳐 벌어진 뒤 화면에 남는 자국** — 박자는 어김없이 지나가고, 되풀이는
 * 점선 칸으로, 건너뛴 자리는 숫자로 못 박히는 것 — 을 보인다. definition 의 단위는
 * "박자 하나" 가 아니라 "일곱 장에 걸친 박자 줄" 이다. 단계 이름(script·style·layout·
 * paint)이나 "예산" 어휘는 이 조각의 관심 밖이라 definition·keywords 에 넣지 않았다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const droppedFrameConcept: FacetConceptSource = {
  id: 'droppedFrame',
  label: 'Dropped Frame',
  canonicalFacet: 'facet:droppedFrame',

  surface: {
    definition:
      'Across a run of several frames whose work takes an uneven amount of time, a fixed-interval screen beat passes on schedule whether a new frame is ready or not; a beat with nothing ready repeats the previous picture instead, and the screen position that beat would have shown is skipped forever, producing a single jump larger than the animation\'s steady per-beat step.',
    exemplarKeywords: [
      'dropped frame',
      'frame drop',
      'stutter jank',
      'vsync with no new frame ready',
      'frame repeat previous picture',
      'skipped animation position',
      'animation jump or stutter',
      'uneven frame time',
      'missed beat gap',
      'janky animation',
    ],
  },

  briefing: {
    observable: [
      'A row of evenly spaced beat marks advances by exactly one mark per step regardless of what else is happening, next to a row of unevenly sized bars for each frame\'s own work.',
      'Six of the seven bars are close in length, but one is nearly three times as long as the others; a caption names the exact millisecond length of whichever bar is current.',
      'One screen cell is dashed rather than solid and its caption states plainly that no new frame arrived at that beat and that the previous picture is shown again.',
      'Adjacent captions read out the on-screen position in pixels at each beat as a plain sequence — most steps rise by a fixed amount, but at one point the same number repeats and then, at the very next step, jumps by twice the usual amount.',
      'A closing caption gives a running tally naming exactly how many beats passed, how many carried a new frame, how many repeated, and the size in pixels of the one position that was never drawn.',
    ],

    screen: {
      affordances: [
        'The screen plays through eight beats on its own — the empty starting beat, seven more each carrying either a new frame or a repeat — then stops on the closing tally.',
        'A replay control and a step strip let a reader hold any single beat still, including the one dashed beat where the picture repeats.',
        'The seven frames\' work lengths and the screen\'s refresh rate are fixed, so an article can name the exact beat, position and gap involved.',
      ],
    },

    useWhen: [
      'The article describes stutter or jank as something felt rather than named, and the reader needs a specific beat marked as a repeat and a specific pixel position marked as never drawn, rather than a general sense that motion looked uneven.',
      'The point is that the screen\'s clock itself never waits for a late frame — it is the frame that misses its turn, not the beat that stretches to accommodate it.',
      'The reader needs to see that a single overlong frame does not just delay everything evenly after it; the frames that follow start from where the late one finished, so only one beat repeats and only one position is lost, not a cascading pile-up.',
    ],

    avoidWhen: [
      'The article is about why one frame\'s work took longer than the others in the first place — which stage inside it spent the extra time, or how close it came to a millisecond budget before crossing it. This screen is given seven work lengths as fixed facts and only shows their consequence on screen.',
      'The subject is which CSS property or how many animated elements caused the uneven costs. No property or element count appears here at all.',
      'The article needs a frame-rate summary across a range of tunable conditions rather than the specific beat-by-beat register of one fixed seven-frame run.',
    ],

    contrastWith: [
      {
        concept: 'sixteenMilliseconds',
        note: 'This fixes seven frames\' total costs in advance and walks the beat-by-beat register of which position repeated and which was never drawn; sixteenMilliseconds instead opens the inside of a single one of those frames to show its budget being spent stage by stage until it runs out.',
      },
      {
        concept: 'frameBudget',
        note: 'This is a fixed sequence with no dial to turn, built to make one particular overrun and its on-screen gap nameable; frameBudget instead lets a reader change the animated property and element count and reports the aggregate frames-per-second those choices settle at.',
      },
    ],
  },
};
