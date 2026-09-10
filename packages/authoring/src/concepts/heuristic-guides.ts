/**
 * heuristicGuides 개념 선언.
 *
 * canonical facet 은 `facet:heuristicGuides` — 같은 격자(가로 일곱 · 세로 다섯,
 * 막힌 칸 없음) 두 판을 나란히 두고 같은 걸음에 진행시킨다. 왼쪽은 지금까지 온
 * 값만 보고 꺼내고, 오른쪽은 거기에 남은 거리의 짐작을 더한 값을 보고 꺼낸다.
 * 새로 열린 칸은 꺼낸 칸의 한가운데에서 자기 자리로 **자라 나온다** — 왼쪽은
 * 둥글게 번지고 오른쪽은 한 줄로 뻗는다. 판마다 열어 본 칸의 수를 재는 막대가
 * 하나씩 있고, 끝에 두 판 위로 길이 그어진다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 이 조각이 지는 것
 *
 * 짐작을 더하면 **답은 그대로이고 들여다본 자리만 줄어든다** 는 한 주장이다.
 * 두 판을 나란히 두는 것 말고 다른 장치가 없고, 견줄 수 있는 수는 열어 본 칸의
 * 수 하나다.
 *
 * 변별어를 붙인 이유: "heuristic" 은 어림셈 · 경험칙 · 사용성 평가가 모두
 * 자칭하는 말이다. 짐작이 **탐색을 이끈다** 는 것이 이 조각의 주장이다
 * (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const heuristicGuidesConcept: FacetConceptSource = {
  id: 'heuristicGuides',
  label: 'A Guess at the Remaining Distance Steers the Search',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:heuristicGuides',

  surface: {
    definition:
      'Adding an estimate of the distance still to go to the cost already paid changes which cell is expanded next, narrowing the search toward the goal without changing the route found.',
    exemplarKeywords: [
      'A star',
      'A* search',
      'heuristic function',
      'admissible heuristic',
      'g plus h',
      'estimated total cost',
      'Manhattan distance as an estimate',
      'informed search',
      'best-first search',
      'why A* opens fewer nodes',
      'grid pathfinding',
      'game AI navigation',
      'never overestimate',
    ],
  },

  briefing: {
    observable: [
      'Two copies of the same grid run side by side on the same clock, with the same starting dot and the same target ring, so any difference on screen comes only from which cell each side chose to open next.',
      'Only the right grid carries a number in the corner of every cell — the estimate of what is left to go — and the numbers darken toward the target so the slope of the estimate is visible before anything moves.',
      'Newly opened cells grow outward from the middle of the cell that was just expanded, which makes expansion an act rather than a recolouring.',
      'The left side swells in a rounded blot around the start; the right side stretches in a narrow band straight at the target.',
      'A bar under each grid tracks how many cells that side has opened, and the two bars separate visibly while both runs are still going.',
      'The right side reaches the target while the left is still spreading, and the caption says so at that moment.',
      'When both are finished a route is drawn across each grid, and the closing caption states that the two routes are the same length and that only the count of opened cells differs.',
      'The right side opens a band barely wider than the route itself, because on an open grid this estimate happens to match the true remaining distance exactly.',
    ],

    screen: {
      affordances: [
        'The screen plays both searches to completion on its own and stops with both routes drawn.',
        'Two buttons: Replay, and a step control that advances both grids one expansion at a time, which is how a reader can hold at the moment the two bars separate.',
        'The grid is fixed at seven by five with the start on the left edge and the target on the right, and no cell is blocked, so an article can quote the opened counts each side ends with.',
      ],
    },

    useWhen: [
      'The article claims a route finder can be made faster without being made wrong, and the reader hears a trade-off. Two routes of the same length under two very different opened counts is what shows there was nothing to trade.',
      'The reader treats a heuristic as a rule that produces the answer. Here it never touches the answer — it only reorders which cell is looked at next, and the route drawn at the end is identical on both sides.',
      'The prose needs the difference between a search that knows nothing about direction and one that does, at the moment it becomes visible: a rounded blot on one side and a narrow band on the other, from the same start on the same clock.',
      'An article introduces the requirement that an estimate must never overshoot, and needs the reader to first care why the estimate is there at all.',
    ],

    avoidWhen: [
      'The article uses "heuristic" for a rule of thumb in interface design, usability review or human judgement.',
      'The subject is an approximation for a hard optimisation problem, where the point is accepting a worse answer for a cheaper run. The answer is unchanged here.',
      'The point is what happens when the estimate overshoots and the route found stops being the shortest. Nothing on screen overshoots — the estimate used is exact.',
      'The article is about navigating around obstacles, mazes or terrain costs. Every cell is open here and every move costs the same.',
      'The subject is how the frontier is stored and ordered — the priority queue, tie-breaking policies, or reopening a cell whose cost improves later.',
      'The article needs a route between real places on a road network, with turn restrictions, precomputed landmarks or contraction.',
    ],

    contrastWith: [
      {
        concept: 'dijkstra',
        note: 'The left grid is that method: expansion ordered by cost paid so far alone, which is what the estimate is added to rather than replacing.',
      },
      {
        concept: 'bfs',
        note: 'A breadth-first sweep spreads evenly for lack of any sense of direction; the estimate supplies exactly that sense while leaving the route it finds untouched.',
      },
      {
        concept: 'pickNearestUnsettled',
        note: 'That justifies committing to the smallest value seen so far; here the value being compared is enlarged by a guess about the future, and the ordering it produces is different.',
      },
      {
        concept: 'takeBestNow',
        note: 'Both let a local judgement pick the next move, but a greedy choice is the answer there while here it only decides the order of looking and the answer is verified afterwards.',
      },
      {
        concept: 'pruneBranch',
        note: 'Two ways of not doing work: one refuses to enter a region it can prove is hopeless, this one merely postpones regions that look unpromising, and neither changes the answer.',
      },
    ],
  },
};
