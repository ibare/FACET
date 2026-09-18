/**
 * controlHazard 개념 선언.
 *
 * canonical facet 은 `facet:controlHazard` — 네 바퀴 도는 반복 하나를 다섯 단계
 * 파이프라인에 흘리며, 짐작은 늘 "안 탄다" 다. 손잡이로 분기를 판정하는 단계를
 * ID · EX · MEM 으로 옮기면 한 판을 다시 돌려 박자 · 버린 수 · 탄 분기 수를 센다.
 * 탄 분기는 세 판 모두 3 이고 움직이는 것은 분기 하나당 값뿐이다
 * (ID 26 박자 · EX 29 · MEM 32).
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 *   이 개념      **값을 매기는 쪽**. 다음 주소를 모르는 구간이 판정 단계만큼 길고,
 *                탄 분기마다 그 길이만큼 박자를 낸다 — 주어는 가져오기, 꼬리는 시간.
 *   branchFlush  **한 번의 되돌림이 하는 일**. 틀린 갈래로 들어온 것을 없애고
 *                빈 칸을 흘리며, 그것들이 이름 댄 레지스터는 옛 값을 지킨다 —
 *                주어는 들어와 있던 명령어, 꼬리는 상태.
 *
 * 어휘 배타: 이쪽 definition 에는 squash · slot · register · wrong 이 없고, 저쪽에는
 * fetch · stage · cycle · taken 이 없다. 두 definition 이 함께 쓰는 낱말은 branch 와
 * 관사·전치사뿐이다. 마주 보는 짝: 이쪽은 결과가 맞다는 것을 전제로 두고 시간을
 * 바꾸고, 저쪽은 시간을 잃는 것을 전제로 두고 상태가 지켜진다는 것을 말한다.
 *
 * 파이프라인 깊이에 따른 값(mispredictionPenalty)과 짐작 규칙 고르기(staticPrediction)는
 * 이웃 묶음이 독점하게 두었다 — 여기 keywords 는 판정 단계와 가져오기 어휘만 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const controlHazardConcept: FacetConceptSource = {
  id: 'controlHazard',
  label: 'Control Hazard (Where the Branch Is Resolved)',
  canonicalFacet: 'facet:controlHazard',

  surface: {
    definition:
      'A branch leaves the next fetch address unknown until a later stage decides it; fetching onward anyway costs each taken branch one cycle per stage ahead of that deciding stage.',
    exemplarKeywords: [
      'control hazard',
      'branch hazard',
      'branch resolution stage',
      'resolve the branch in ID',
      'move the branch comparator earlier',
      'predict not taken',
      'fetch past a branch',
      'next PC unknown',
      'cost of a loop branch',
      'CPI with branches',
      'cycles lost to branches',
    ],
  },

  briefing: {
    observable: [
      'The program list on the left carries a dashed arc from the loop branch back to its target; the arc lights up and draws itself each time the branch sends the next fetch backward.',
      'Instructions fetched after the branch but before it is decided are drawn with a dashed outline as guesses, and a bracket over the pipeline stages ahead of the deciding stage is labelled with how many come in before the decision.',
      'When the branch is decided taken, the guessed tail leaves the pipeline for a discarded bin; when it is decided not taken on the last trip, the caption says the guess held and nothing is lost.',
      'A cycle-by-cycle strip underneath keeps one tile per fetch: kept tiles stay on the upper row, discarded ones drop to the lower row, and everything after a drop sits shifted right by the gap it left.',
      'The counters read cycles, discarded instructions and taken branches. Taken branches stay at 3 in every round; only the discard count and the total move — 26, 29 and 32 cycles for ID, EX and MEM.',
      'After changing the handle, a faint mark keeps the previous round\'s final cycle so the new end can be read against it, and the closing caption states the product: taken branches times the cost of each equals the discard count.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider.',
        'A three-way "Resolve stage" control set to ID, EX and MEM starts on EX. A round finishes and waits; picking another stage replays the same loop with the decision point moved.',
        'The seven-instruction program, its four trips around the loop and the not-taken guess are fixed, so an article can quote cycle and discard totals for each setting.',
        'The code panel starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; it walks the same count arithmetically — one cycle per fetch, and the stage number minus one added for every taken branch.',
      ],
    },

    useWhen: [
      'The article claims hardware designers pull the branch comparison forward into decode, and the reader needs to see why a single stage of difference matters. Stepping the handle from EX to ID and watching three cycles vanish while the taken count holds at 3 is the argument.',
      'The reader treats a branch as costing one instruction like any other. A loop that runs four times but is guessed wrong three times, with the whole cycle total written as instructions plus fill plus discards, turns that assumption into arithmetic.',
      'The prose needs to establish why a pipeline has to guess at all before it can talk about guessing well — the stretch of fetches that happen while the next address is still undecided has to be visible as a measured window.',
    ],

    avoidWhen: [
      'The subject is a dynamic predictor that learns from history. The guess here never changes; only the point of decision moves.',
      'The article is about stalls caused by an instruction waiting for a value another has not produced yet. Operand dependences are assumed resolved in time here.',
      'The point is how pipeline depth in a modern processor, ten or twenty stages, multiplies the cost of a miss. The deepest setting here is the fourth of five stages.',
      'The article uses "hazard" in the safety or risk-assessment sense, or "branch" in the version-control sense.',
    ],

    contrastWith: [
      {
        concept: 'branchFlush',
        note: 'This prices the undecided window across a whole loop and a movable decision point; removing the wrongly admitted instructions is one event inside it, whose own claim is that architectural state is untouched.',
      },
      {
        concept: 'dataHazard',
        note: 'Both break the one-instruction-per-cycle rhythm, but a data hazard is about a value not ready yet, while a control hazard is about not knowing which instruction comes next.',
      },
      {
        concept: 'fiveStagePipeline',
        note: 'Overlapping stages is what creates the window: without instructions entering before the previous ones finish, nothing would be fetched ahead of an undecided branch.',
      },
      {
        concept: 'mispredictionPenalty',
        note: 'The hazard is the reason fetching runs ahead of an undecided branch at all; the penalty is the price of one wrong guess, set by how many instructions got in before the outcome was known.',
      },
      {
        concept: 'staticPrediction',
        note: 'This holds the guess fixed and varies when it is checked; choosing which direction to guess per branch is the other lever on the same loss.',
      },
    ],
  },
};
