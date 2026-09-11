/**
 * reduceToKnown 개념 선언.
 *
 * canonical facet 은 `facet:reduceToKnown` — 왼쪽 판의 시험 시간표(과목 다섯 · 겹치는
 * 쌍 여섯)가 오른쪽 고리의 빈 자리로 옮겨 앉는 화면이다. 카드가 제 줄을 떠나 마디가
 * 되고, 두 끝이 다 건너간 괄호가 곧게 펴져 선이 된다. 칠하고 나면 색 하나가 교시
 * 하나이고 교시 셋이 나온다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서의 자리
 *
 * 그래프를 다루지만 주장은 그래프의 성질이 아니다 — **다른 문제를 그래프로 바꾸는
 * 일** 자체다. 색칠을 어떻게 푸는가는 화면에 없으므로 definition 의 주어를 "문제의
 * 옮김" 으로 잡아 색칠 그 자체(twoColorConflict)나 주어진 그래프를 걷는 개념들과
 * 갈라 두었다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const reduceToKnownConcept: FacetConceptSource = {
  id: 'reduceToKnown',
  label: 'Restating a Problem as One Already Studied',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:reduceToKnown',

  surface: {
    definition:
      'Restating one problem as another that is already studied — exam scheduling becomes graph coloring once subjects are nodes, conflicts are edges and slots are colors — so that the methods of the second problem apply.',
    exemplarKeywords: [
      'reduction',
      'reduce one problem to another',
      'model it as a graph',
      'graph coloring',
      'exam timetabling',
      'conflict graph',
      'problem transformation',
      'reuse an existing algorithm',
      'scheduling as coloring',
      'mapping a problem onto a known one',
    ],
  },

  briefing: {
    observable: [
      'The screen holds two halves that are both visible from the first moment: a panel of exam scheduling on the left and five empty dashed seats arranged in a ring on the right, so the destination is in sight before anything moves.',
      'Five subject cards — Language, Math, English, Science, History — slide into the left panel, and six brackets open in the gutter beside them, each one biting the two rows whose exams overlap.',
      'One card at a time leaves its row and flies to a seat in the ring, widening as it lands, and a dashed outline stays behind in the row it vacated, so the left panel is seen emptying.',
      'A bracket straightens into an edge only once both of its ends have crossed over, and the caption keeps a count of the overlaps that have become edges.',
      'Colours arrive across all five nodes within a single step, linked nodes ending up different, so the run passes straight from the graph to a finished colouring.',
      'The emptied left panel is then filled by the answer: three coloured rows labelled Slot 1, Slot 2 and Slot 3, each listing the subjects that share it, while the dashed outlines fade out.',
    ],

    screen: {
      affordances: [
        'The screen carries the whole problem across on its own and stops on the finished timetable of three slots.',
        'Two buttons: Replay, and a step control for moving one subject at a time, which is how a reader can stop at the moment a bracket becomes an edge between two nodes.',
        'The five subjects and the six overlapping pairs are fixed, so an article can name which subjects end up sharing a slot and the reader will find them there.',
      ],
    },

    useWhen: [
      'The article needs the reader to accept that a problem can be answered without ever being attacked directly. The subjects walking out of the timetable and sitting down as nodes is the entire move, and the timetable is answered afterwards by reading the colours back.',
      'The prose is about to borrow results from a well-studied problem, and the reader first has to believe the translation is cheap: every part of the original is accounted for once — five subjects, six conflicts — and nothing beyond that is done.',
      'The reader treats "model it as a graph" as a turn of phrase. Here each subject becomes a node and each conflicting pair becomes an edge, so the modelling is a correspondence between parts rather than an analogy.',
    ],

    avoidWhen: [
      'The subject is how a graph actually gets coloured — choosing an order, backing out of a choice, bounding how many colours are needed. The colours land here without any procedure being shown.',
      'The article is about timetabling as a practical matter: room sizes, invigilators, student preferences, spreading exams apart. The single constraint of conflicting pairs is all that crosses over.',
      'The point is a formal reduction used to prove hardness, with its direction and its cost argued. The translation is shown as a move here, not argued as a proof.',
      'The article uses "reduce" for map-reduce, for folding a collection into one value, or for simplifying an expression.',
    ],

    contrastWith: [
      {
        concept: 'twoColorConflict',
        note: 'That concept is colouring itself and the condition under which it fails; this one is about a different problem being turned into a colouring question in the first place.',
      },
      {
        concept: 'bfs',
        note: 'There the graph is the subject and gets walked; here no graph exists until the original problem has been rewritten into one.',
      },
      {
        concept: 'verifyVsFind',
        note: 'One is about what a problem costs to solve outright; the other is about moving a problem to where methods already exist, which changes where the work is done rather than how much of it there is.',
      },
    ],
  },
};
