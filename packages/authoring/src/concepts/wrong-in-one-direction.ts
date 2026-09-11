/**
 * wrongInOneDirection 개념 선언.
 *
 * canonical facet 은 `facet:wrongInOneDirection` — "두 답 중 어느 쪽을 믿어도
 * 되는가" 한 질문에만 답하고 멈추는 짧은 화면이다. 이미 채워진 배열에 묻기만
 * 한다. 묻는 낱말이 복도를 걸으며 문 셋을 지나는데, 문의 여닫힘은 위쪽 비트
 * 배열의 그 칸에서 내려온다.
 *
 * 넷을 스스로 물어 보이고 멈춘다. 독자가 낱말을 넣거나 고르는 자리는 없고,
 * 다시 보기와 한 걸음씩 짚기만 기다린다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 말하는 것은 **판정의 비대칭** 하나다 — "없다" 는 증명이고 "있다" 는
 * 짐작이라는 것. 얼마나 자주 틀리느냐는 `bloomFilter` 의 몫이고, 그 표식이 어떻게
 * 생겼는지는 `severalHashesOneValue`, 되돌릴 수 없다는 것은 `cannotUnset` 이
 * 맡는다. keywords 도 이쪽만 거짓 양성 · 단방향 오류 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const wrongInOneDirectionConcept: FacetConceptSource = {
  id: 'wrongInOneDirection',
  label: 'Wrong in Only One Direction',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:wrongInOneDirection',

  surface: {
    definition:
      'The two answers of a Bloom filter are not equally reliable: a single position at 0 proves absence, while all positions at 1 can be the work of other values, so only "present" can be mistaken.',
    exemplarKeywords: [
      'false positive',
      'no false negatives',
      'one-sided error',
      'maybe present, definitely absent',
      'probably in the set',
      'can I trust the answer',
      'negative lookup',
      'when is it safe to skip the real check',
      'the guarantee a Bloom filter makes',
      'why a filter never misses',
    ],
  },

  briefing: {
    observable: [
      'The array across the top starts already filled, and a roster beside it names the three values that filled it, so nothing is being inserted during the run.',
      'The queried word enters a corridor from the left and walks it. Three gates stand in the corridor, each joined by a dashed line to the one cell it consults and labelled with that cell\'s number.',
      'Consulting a cell lifts it and brightens the line to its gate: a cell at 1 raises the shutter and the word walks through, a cell at 0 drops the shutter to full height and the word bumps into it and rebounds.',
      'A word that is stopped never reaches the remaining gates — the walk ends at the first unlit cell instead of consulting all three.',
      'The two stopped words are stopped at different depths, one at the first gate it meets and the other only at the third, and both still land in the same bin.',
      'Answers fall into two bins headed "Present" and "Absent", each marked with a tick or a cross, and the single cross of the whole run sits in the "Present" bin.',
      'For the word that was never inserted yet passed all three gates, the three names that actually lit those cells fly down from the roster and park beneath them — three unrelated values, one per position.',
      'The run closes with "can be wrong" sliding in beside the Present bin and "never wrong" beside the Absent bin.',
    ],

    screen: {
      affordances: [
        'Four queries play through unattended and the screen stops with both bins filled and labelled.',
        'Two buttons: Replay, and a step control that empties the bins and walks the same four queries one moment per press, which is how the corridor can be held at a gate to read which cell it is consulting.',
        'The array arrives already filled and the four queried words are fixed, with every gate number computed from the word rather than written in, so the one wrong answer is a genuine coincidence rather than a staged one.',
      ],
    },

    useWhen: [
      'The article says the filter "may return false positives" and the reader takes both of its answers to be approximate. One word rebounding off an unlit cell, beside another walking through three lit cells it never lit itself, is what makes the error one-sided.',
      'A design is about to use the filter to skip an expensive lookup, and the reader must know which way it is safe to be wrong. The bin that collects only correct verdicts, against the bin holding the mistake, decides which branch needs a real check behind it.',
    ],

    avoidWhen: [
      'The subject is how often the fallible verdict occurs, or how to make it rarer. The array here is one fixed size holding one fixed set of contents.',
      'The article is about putting values in. The array is already filled when the screen starts and nothing is added during the run.',
      'The point is that removal is unsafe. Nothing is cleared here; every cell holds its opening value to the end.',
      'The article uses "false positive" for a classifier or a threshold test that could be moved. The mistake here comes from positions shared among unrelated values, and no setting would trade it against the opposite mistake.',
    ],

    contrastWith: [
      {
        concept: 'bloomFilter',
        note: 'This settles which answer is capable of being wrong; the other takes that as given and asks how often, at a chosen amount of room and number of hashes.',
      },
      {
        concept: 'severalHashesOneValue',
        note: 'Insertion and interrogation of the same array: one is about the marks being made, this about what those marks license once they are there.',
      },
      {
        concept: 'cannotUnset',
        note: 'Both follow from a position recording that it is set without recording by whom, but one limits what a lookup may conclude and the other rules out an operation entirely.',
      },
      {
        concept: 'pigeonholeCollision',
        note: 'A collision is two inputs sharing one value, forced by counting; the mistake here needs no collision at all, only several unrelated values between them happening to cover one value\'s positions.',
      },
      {
        concept: 'trustTheSmallest',
        note: 'Both read several positions and take a guarded answer from them, but one takes the smallest count as an estimate that can only be too high, while this takes any zero as a proof.',
      },
    ],
  },
};
