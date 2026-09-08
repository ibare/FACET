/**
 * redBlackTree 개념 선언.
 *
 * canonical facet 은 `facet:redBlackTree` — 색이 곧 값인 트리 무대 + 흑색 높이
 * 표시 + 모양 표시 + 네 카운터(키 · 색칠 · 회전 · 견줌) + 코드 패널.
 *
 * 화면은 마운트 직후 10, 20, 30, 40, 50, 25 를 이 순서로 넣어 보이고 멈춘 뒤
 * 독자의 입력을 기다린다. 그 여섯이 색칠로 푸는 경우와 회전으로 끝내는 경우를
 * 둘 다 지나가고, 색칠이 문제를 위로 미는 장면도 한 번 나온다.
 *
 * 변별어를 붙이지 않은 이유: "레드-블랙 트리" 는 그 이름 하나로 이미 특정되며,
 * 같은 이름을 자칭하는 다른 자료구조가 없다 (C4 명명 규칙 2).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const redBlackTreeConcept: FacetConceptSource = {
  id: 'redBlackTree',
  label: 'Red-Black Tree',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:redBlackTree',

  surface: {
    definition:
      'A binary search tree where every node carries a red or black mark, and each insertion or deletion restores two colour rules by recoloring and rotating.',
    exemplarKeywords: [
      'red-black tree',
      'RB tree',
      'self-balancing binary search tree',
      'ordered map',
      'std::map and std::set',
      'TreeMap',
      'insert fixup',
      'delete fixup',
      'rotation versus recoloring',
      'logarithmic insert and delete',
    ],
  },

  briefing: {
    observable: [
      'Every key arrives red, and the caption says a black one would break the counts — the colour of an incoming node is forced, not chosen.',
      'The fill of a seat is the value it stores. Where the run is working is marked by an outline ring around the seat, so a seat is never repainted to show progress.',
      'Seats keep their left-to-right order by key, so a rotation is visibly a vertical rearrangement: who is above whom changes, the ordering does not.',
      'When the seat beside the parent is red, three seats change colour at once, and a ring then lands on the grandparent with the caption saying it was not fixed but moved up here — the repair starts again from that seat and can run to the root.',
      'When the three seats stand in a straight line, one recolor and one turn end the repair on the spot and the run moves to the next key.',
      'Removing a key runs four cases of its own with the same alternation: the ones that recolor hand the problem upward, the one that turns finishes it.',
      'The black-height readout shows a dash while an operation is running and settles on one number for every path when it finishes — it keeps landing on a number as keys are added and taken away, and reports that the paths disagree if they ever do.',
      'Recolors and rotations are counted on separate counters, next to keys and compares, so how much of the work was colour and how much was movement is a number rather than an impression.',
    ],

    screen: {
      affordances: [
        'The reader drives this. On mount it inserts 10, 20, 30, 40, 50 and 25 in that order — a run that passes through both kinds of repair — then stops and waits.',
        'The controls are one key field plus Insert, Search, Remove and Reset. What is typed is read as a whole number, and Reset starts the same six keys over.',
        'Every readout and counter updates per operation the reader runs, so any comparison is made by running operations rather than by reading a caption.',
        'A code panel sits at the bottom. It starts empty and shows the insert repair loop once a language is added, up to two languages side by side.',
      ],
    },

    useWhen: [
      'The reader has to weigh what this structure charges for staying balanced — feed in a run of keys, then read the recolor count against the rotation count and see what height those bought.',
      'The article claims the black count survives arbitrary insertion and deletion, and that claim has to hold under keys the reader chooses, at whatever moment the reader stops to check the readout.',
    ],

    avoidWhen: [
      'The article is about AVL trees, height-balance factors, or rebalancing driven by subtree heights. Turns happen here as well, but they are triggered by colours and no balance factor is shown.',
      'The subject is an unbalanced binary search tree and how a sorted insertion order ruins it. Comparisons look the same, but here a repair follows every insertion.',
      'The point is a B-tree or an on-disk index. Those are balanced and shallow too, but a seat here holds exactly one key and splits nothing.',
      'The article is about in-order traversal or range scans. Order decides where a key lands here, but no traversal is walked on screen.',
    ],

    contrastWith: [
      {
        concept: 'avlTree',
        note: 'Both keep a search tree short, and the reason both exist is a trade: one holds the height tighter and pays in turns, the other tolerates a taller tree to turn less often.',
      },
      {
        concept: 'bst',
        note: 'The search path is identical; what is added here is a mark on every node and a repair after every change, which is exactly what stops the tree from degenerating.',
      },
      {
        concept: 'recolorThenRotate',
        note: 'One repair decision versus a run of them — the choice between recoloring and turning is the same rule, but its cost only shows once the decisions are chained over many keys.',
      },
    ],
  },
};
