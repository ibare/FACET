/**
 * paddingGap 개념 선언.
 *
 * canonical facet 은 `facet:paddingGap` — 필드 셋(char a · int b · char c)이 대기 줄에서
 * 하나씩 내려와 앞 끝에 닿고, 제 정렬의 배수 자리까지 밀려 앉는 화면이다. 지나친 칸은
 * 빗금 친 빈틈으로 남고, 끝에서는 닫는 괄호가 가장 큰 정렬의 배수까지 밀려 꼬리 빈틈을
 * 끌고 온다. 마지막 캡션이 크기 12 = 필드 6 + 빈틈 6 으로 맺는다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 재생 띠만 딸려 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념의 주어는 **규칙 하나가 만드는 빈 바이트**다. 크기가 필드 합보다 큰 까닭 하나만
 * 말한다. 정렬 상한이라는 설정값(structAlignment)과 선언 차례(fieldOrderSize)는 이
 * 화면에서 움직이지 않으므로 definition 에 그 낱말(pack · misaligned · order · largest)을
 * 쓰지 않는다. 반대로 padding · multiple · sum 은 여기만 쓴다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const paddingGapConcept: FacetConceptSource = {
  id: 'paddingGap',
  label: 'Struct Padding (Why sizeof Exceeds the Field Sum)',
  canonicalFacet: 'facet:paddingGap',

  surface: {
    definition:
      'Why a struct is larger than the sum of its field sizes: each field starts at the next multiple of its alignment, the skipped bytes become padding, and the end rounds up once more.',
    exemplarKeywords: [
      'struct padding',
      'padding bytes',
      'tail padding',
      'trailing padding',
      'sizeof struct is bigger than expected',
      'why is sizeof 12 not 6',
      'field offset',
      'offsetof',
      'alignment requirement of a type',
      'round up to a multiple',
      'holes in a struct',
      'size of a struct in an array',
    ],
  },

  briefing: {
    observable: [
      'The three fields wait in a row above the struct. Each one drops to the byte where the previous field ended, and only then slides right to the spot its alignment demands; a marker shows which multiple it is heading for.',
      'The bytes a field slides over are left hatched and empty inside the struct — here three of them between a and b, because int b reaches byte 1 and must start at 4.',
      'Byte ticks are drawn only as far as the struct has been filled, so the final size is not visible in advance; the struct grows under the reader\'s eye.',
      'After c ends at byte 9, the closing bracket of the struct is pushed out to 12, the next multiple of the largest alignment, dragging three more hatched bytes of tail padding with it.',
      'The last caption sums it up as size 12 = fields 6 + gaps 6, and a bracket under the struct carries the size.',
      'Each caption states the rule for the field in hand — its type, its alignment, the byte it arrived at and the byte it sits at — or says that it fits where it arrived.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole layout on its own — three placements, the tail, the total — and stops.',
        'Under it sit a Replay button and a playback strip. Once the total is up, dragging the strip handle back is how a reader can hold the moment a field arrives at the wrong byte before it slides.',
        'The fields char a, int b, char c are fixed, so an article can name the three bytes skipped before b and the three added at the tail.',
      ],
    },

    useWhen: [
      'The reader has just summed the field sizes, got 6, and cannot see where sizeof found 12. The hatched bytes appearing before b and after c account for every missing byte.',
      'The article has to justify padding at the end of a struct, where no later field is pushed, and the reader needs the closing bracket moving past the last field to see that the whole struct has an alignment too.',
      'The prose states the placement rule — start at the next multiple of your own alignment — and wants each field to arrive, fail to fit, and move, one at a time, so the rule is seen being applied rather than recited.',
    ],

    avoidWhen: [
      'The article is about padding in the cryptographic sense — PKCS#7, OAEP, block cipher padding — or padding a message or string to a fixed length.',
      'The subject is CSS padding, or padding an image or tensor in a convolution.',
      'The point is that a different arrangement of the same fields wastes less. The fields are placed in a single fixed sequence here.',
      'The article is about compiler settings that relax alignment, such as #pragma pack, or the cost of reading a field that sits off its boundary. Every field here lands on its boundary.',
    ],

    contrastWith: [
      {
        concept: 'fieldOrderSize',
        note: 'This establishes that the rule creates empty bytes; that one takes the rule as given and shows that the amount of empty space depends on the sequence the fields are written in.',
      },
      {
        concept: 'structAlignment',
        note: 'This treats the alignment rule as a fact to explain; that one treats it as a setting with a price on either side — fewer empty bytes or more split reads.',
      },
      {
        concept: 'cacheLine',
        note: 'Padding here keeps one field on its own boundary inside a struct; padding a struct out to a cache line is a separate choice made to keep whole records from sharing a line.',
      },
    ],
  },
};
