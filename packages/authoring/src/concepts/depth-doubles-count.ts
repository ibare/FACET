/**
 * depthDoublesCount 개념 선언.
 *
 * canonical facet 은 `facet:depthDoublesCount` — 0층부터 9층까지 한 층씩 내려가며
 * 자리가 배로 벌어지는 것을 보이고, 마지막에 열 개 층 전부를 괄호로 묶어 합
 * 1023 을 세우고 멈추는 화면이다. 왼쪽 눈금이 층 번호를, 오른쪽이 그 층의 자리
 * 수를 계속 말한다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * 변별어를 붙인 이유: 이 개념은 "트리의 높이" 나 "균형" 이 아니라 층과 자리
 * 수 사이의 셈 하나만 다룬다. 그 범위를 id 에 박는다 (C4).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const depthDoublesCountConcept: FacetConceptSource = {
  id: 'depthDoublesCount',
  label: 'Each Level Doubles the Number of Positions',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:depthDoublesCount',

  surface: {
    definition:
      'In a filled binary tree each level down holds twice as many positions as the one above, so the levels needed to hold n values grow like the base-two logarithm of n.',
    exemplarKeywords: [
      'tree depth',
      'tree height',
      'levels of a tree',
      'two to the power of d',
      'log n',
      'logarithmic',
      'exponential growth',
      'why balanced trees are fast',
      'number of nodes per level',
      'halving the search space',
    ],
  },

  briefing: {
    observable: [
      'A gutter down the left keeps a running readout of the level number and the number of positions on it, so the two quantities are legible side by side at every step.',
      'The level number goes up by one each step while the count beside it doubles, and the gap between the two columns widens as the run proceeds.',
      'Each new level enters at the bottom and pushes everything above it upward, so the picture keeps growing downward without ever redrawing what came before.',
      'Positions keep the same size and spacing at every level rather than being scaled down, so from the fifth level the row runs off both sides and is clipped — the count in the gutter keeps reporting the real number the picture can no longer show.',
      'The run ends with a brace drawn down the whole stack and a single total, 1023 positions across ten levels.',
    ],

    screen: {
      affordances: [
        'The screen builds all ten levels on its own and stops with the total standing beside the brace.',
        'Two buttons: Replay, and a step control for adding one level at a time, which is how a reader can watch the count double against a level number that only rises by one.',
        'The depth is fixed at nine, so the closing numbers the article quotes are the ones the reader will see.',
      ],
    },

    useWhen: [
      'The prose states that a balanced tree is about log n deep and the reader takes it as a formula to accept rather than a fact to see. Watching the position count double ten times while the level number creeps from zero to nine is where that logarithm comes from.',
      'A later cost argument is going to count levels instead of values, and it is worth nothing until the reader has granted that a structure holding a thousand values is only ten levels deep.',
    ],

    avoidWhen: [
      'The article is about a tree that has degenerated into a chain, or about worst-case depth. The doubling assumes every level is filled and says nothing about a tree that is not.',
      'The subject is how a tree is kept balanced — rotations, recolouring, splitting a node. Only the counting is here; no mechanism keeps it true.',
      'The article is about doubling or exponential growth outside of trees, such as compounding, population or repeated capacity doubling. What is being counted here is tree positions.',
      'The point is a tree whose nodes have more than two children, where each level multiplies by that number instead and the depth falls further.',
    ],

    contrastWith: [
      {
        concept: 'heightStaysLow',
        note: 'This counts what a filled tree can hold at each depth; the other is about the work done to keep a real tree close to that shape.',
      },
      {
        concept: 'bstDegenerate',
        note: 'The same tree seen at its two extremes — every level filled and the depth logarithmic, or one child per node and the depth equal to the count.',
      },
      {
        concept: 'parentTwoChildren',
        note: 'Two children per position is the premise; the doubling per level is what that premise costs out to.',
      },
    ],
  },
};
