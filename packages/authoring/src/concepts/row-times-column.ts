/**
 * rowTimesColumn 개념 선언.
 *
 * canonical facet 은 `facet:rowTimesColumn` — A(2×3) 를 왼쪽에, B(3×2) 를 위에 두어
 * **A 의 행 띠와 B 의 열 띠가 꼭 한 곳에서만 겹치게** 하고 그 자리에 C[i][j] 를
 * 놓는 화면이다. 「한 칸은 어디서 오는가」가 움직이기 전에 이미 자리로 답해져
 * 있고, 움직임은 그것을 셈으로 확인하는 일이 된다. A 쪽 수는 가로로만, B 쪽 수는
 * 세로로만 달려 칸에서 맞닿아 곱이 되고, 아래 누적 합으로 내려앉는다.
 *
 * 2×3 과 3×2 인 까닭: **안쪽 치수 3 과 바깥 치수 2 가 다른 수**라야 무엇이
 * 맞물리고 무엇이 결과의 모양을 정하는지가 갈린다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 옆 개념과 어떻게 갈랐나
 *
 * `matrixTransform2d` 가 가장 가깝다. 저쪽은 행렬의 **뜻** — 점을 어디로
 * 옮기는가이고, 이쪽은 곱셈의 **속** — 한 칸이 어떻게 셈해지는가다.
 * `adjacencyListVsMatrix` 는 행렬을 담는 그릇으로 보고, 이쪽은 연산의 피연산자로
 * 본다. `indexAddressCalc` 와는 (i, j) 가 하는 일이 다르다 — 저쪽은 이미 놓인
 * 값을 찾아가는 자리이고, 이쪽은 아직 없던 값을 만들 재료를 지목한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rowTimesColumnConcept: FacetConceptSource = {
  id: 'rowTimesColumn',
  label: 'Row Times Column (Where One Entry of a Matrix Product Comes From)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:rowTimesColumn',

  surface: {
    definition:
      'How a single entry of a matrix product is arrived at: one row of the left matrix and one column of the right are paired off term by term, and those products are summed into that one entry.',
    exemplarKeywords: [
      'matrix multiplication',
      'how to multiply two matrices by hand',
      'the dot product of a row and a column',
      'C[i][j] = sum over k of A[i][k] times B[k][j]',
      'inner dimensions have to match',
      'conformable matrices',
      'why AB is not the same as BA',
      'multiplying a 2x3 by a 3x2',
      'matmul',
      'the shape of the product',
    ],
  },

  briefing: {
    observable: [
      'The left matrix has its rows lying flat and the right one has its columns standing, and the result occupies the place where a row and a column would cross, so the arrangement answers where an entry comes from before any number moves.',
      'Each container is named beside itself with its shape written out, and the three shapes are not the same — three is the length that meshes, two by two is how many entries there are to fill.',
      'Every entry of the result is drawn dashed and empty with its own row and column subscripts printed in the corner, so the place a value will land is fixed from the start.',
      'A translucent band lights along the row in play and another down the column in play; the entry being built is where the two overlap and takes the tint twice, so it darkens on its own rather than being marked out.',
      'Terms arrive one pair at a time — the number from the left travels only sideways along its row, the number from above travels only downward along its column — and they touch inside the entry, merge into one chip carrying their product, and drop into the total at the bottom of that entry.',
      'The running total lives inside the entry it belongs to rather than off to the side, and it is rewritten on every pair: seven, then twenty-five, then fifty-eight.',
      'Three pairs fill an entry and then it seals — a fill sweeps out from its middle and the entry turns solid — and the caption at that moment says how many products went into the one entry.',
      'Twelve pairs across four entries finish at 58, 64, 139 and 154, and the bands fade at the end leaving only the result.',
    ],

    screen: {
      affordances: [
        'The screen works through all twelve pairs on its own and stops with every entry sealed.',
        'Two buttons: Replay, and a step control that rewinds and then walks the same pairs one at a time, which is how a reader can hold one pair on screen before the two numbers fuse into their product.',
        'Both matrices are fixed, so an article can name any of the four results and can point at the three and the two by two as different numbers doing different jobs.',
      ],
    },

    useWhen: [
      'The prose gives the formula with its subscripts and the reader cannot see which numbers i, j and k actually pick out. Here the row and the column each light as a band and the entry is the single place they cross, so two of the indices are directions on the page rather than letters under a sum.',
      'The article needs the reader to hold two facts apart: the lengths that meet must agree, while the outer counts decide the shape of what comes out. Three terms landing in each of four entries, with the shapes printed beside the containers, keeps the two numbers visibly at different jobs.',
      'A reader following a small multiplication by hand keeps losing track of which term pairs with which. The two numbers approach along different axes and meet before they become a product, so each term is named on its own instead of appearing inside a finished sum.',
    ],

    avoidWhen: [
      'The article is about what a matrix does to space — rotating, scaling, shearing, or where it sends a vector. Nothing is transformed here; two tables of numbers produce a third.',
      'The subject is the cost of multiplying matrices or how to bring it down, as with blocking, parallelism, or an asymptotically faster method. The twelve products are simply performed and nothing counts or compares them.',
      'The point is an inverse, a determinant, an identity, or solving a system of equations. Only the product of two given matrices is ever formed.',
      'The article uses "matrix" for a table of data or for the way a graph is stored. The entries here are operands of an arithmetic operation and hold nothing else.',
      'The subject is how the entries are laid out in memory, or what iterating them in one order rather than another costs. The arrangement here is chosen so the row and the column cross, not to show how either is stored.',
    ],

    contrastWith: [
      {
        concept: 'matrixMul',
        note: 'One entry is accounted for here and how many entries there are never comes up; that one asks how few products the whole multiplication can be done in, and doing one fewer per divided layer is its answer.',
      },
      {
        concept: 'matrixTransform2d',
        note: 'The same object read two ways: one asks what a matrix means, in that it decides where the points of a plane go, while this asks only how one number inside a product is arrived at.',
      },
      {
        concept: 'adjacencyListVsMatrix',
        note: 'A matrix is a container in one and an operand in the other — one weighs what holding and questioning it costs, this says how its entries combine when two of them are multiplied.',
      },
      {
        concept: 'indexAddressCalc',
        note: 'Both turn a position into a single place, but there the position leads to a value already sitting in memory, while here a row and a column name the terms of a value that does not exist until they are combined.',
      },
    ],
  },
};
