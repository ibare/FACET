/**
 * branchFlush 개념 선언.
 *
 * canonical facet 은 `facet:branchFlush` — `beq r1, r2, L` 하나와 그 뒤 명령어 넷을
 * 다섯 단계 파이프에 한 사이클씩 흘린다. r1 과 r2 가 둘 다 4 라 분기는 타고,
 * "안 탄다" 로 짐작해 들여 둔 `add` · `sub` 가 EX 끝의 판정에서 버려진다. 비운 두 칸이
 * 파이프를 따라 흘러가는 사이 `L` 의 `or` 가 들어오고, 끝에서 잃은 사이클 2 와
 * 끝내 바뀌지 않은 r3 · r6 을 캡션이 말한다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 되감기 띠만 딸려 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (controlHazard 파일 머리 주석과 한 쌍)
 *
 * 주어를 **틀린 갈래로 들어와 있던 명령어**로 세우고 꼬리를 **상태가 지켜진다**로
 * 맺었다. 판정 단계를 옮기거나 값을 세는 어휘(fetch · stage · cycle · taken)는
 * definition 에서 빼 controlHazard 에 두고, 이쪽은 squash · flush · slot · register ·
 * write-back 을 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const branchFlushConcept: FacetConceptSource = {
  id: 'branchFlush',
  label: 'Branch Flush (Discarding Wrong-Path Instructions)',
  canonicalFacet: 'facet:branchFlush',

  surface: {
    definition:
      'When a guessed branch direction proves wrong, the instructions admitted after it are squashed before write-back: their slots pass on empty and the registers they name keep their old values.',
    exemplarKeywords: [
      'pipeline flush',
      'flush on mispredict',
      'squash wrong-path instructions',
      'wrong-path instructions',
      'bubbles after a branch',
      'kill instructions in IF and ID',
      'speculative instructions discarded',
      'no architectural side effects',
      'why a wrong guess does not corrupt registers',
    ],
  },

  briefing: {
    observable: [
      'Before the decision, the two instructions behind the branch enter IF and ID on a "not taken" guess; the caption marks each of those fetches as a guess.',
      'At the end of the cycle the branch spends in EX, the two compared register values appear under the EX slot — r1 = 4 · r2 = 4 — and the caption concludes the branch is taken and the guess was wrong.',
      'The add and sub drop out of the pipe into a "Thrown out" tray below it, and the two slots they held stay visibly empty.',
      'The emptied slots keep moving right with the rest of the pipe for the following cycles while the caption says nothing is done in them; meanwhile the instruction labelled L drops into the first slot, having skipped the one in between.',
      'The register panel lights r9 as written once the or finishes, while r3 and r6, the destinations of the discarded pair, are marked unchanged, and the closing caption counts two cycles lost.',
    ],

    screen: {
      affordances: [
        'The screen plays one branch from an empty pipe to the last instruction leaving, and stops on the closing caption.',
        'Under it sit a Replay button and a playback strip. Dragging the strip back to the cycle the branch is decided is how a reader can hold the moment just before the two instructions leave.',
        'The register values, the five instructions and the outcome are fixed, so an article can name the discarded instructions and the registers they would have written.',
      ],
    },

    useWhen: [
      'The reader worries that running instructions on a guess must sometimes produce wrong results. Watching r3 and r6 remain unchanged because their writers never reached write-back is the answer the article needs.',
      'The article says a wrong guess "costs cycles" and the reader cannot picture where cycles go. Two empty slots travelling the length of the pipe, doing nothing, is the loss made concrete.',
      'The prose has to separate an instruction entering the pipeline from an instruction counting — that being inside is provisional until the result is written.',
    ],

    avoidWhen: [
      'The article compares how the loss changes when the decision point moves, or totals it over a loop. Only one branch and one fixed decision point appear here.',
      'The subject is a stall where an instruction waits for an operand. Nothing waits here; things are removed.',
      'The point is recovering from exceptions or interrupts with precise state. Only a branch outcome triggers the removal here.',
      'The article uses "flush" for writing buffered data out to disk, a file stream or a cache.',
    ],

    contrastWith: [
      {
        concept: 'controlHazard',
        note: 'This is the single act of removal and its guarantee that no result escapes; how much time that act costs, and how the cost grows when the decision comes later, belongs to the hazard as a whole.',
      },
      {
        concept: 'pipelineBubble',
        note: 'Both leave empty slots flowing down the pipe, but a bubble is inserted by holding an instruction back, while a flush creates them by deleting instructions already inside.',
      },
      {
        concept: 'mispredictionPenalty',
        note: 'The removal is the mechanism; the penalty is its price summed per wrong guess, which grows with how many instructions were admitted before the outcome was known.',
      },
      {
        concept: 'staticPrediction',
        note: 'The guess decides which instructions get admitted early; the flush is what makes any guess safe to act on, since a wrong one is undone before it writes anything.',
      },
    ],
  },
};
