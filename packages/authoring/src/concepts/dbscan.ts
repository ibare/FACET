/**
 * dbscan 개념 선언.
 *
 * canonical facet 은 `facet:dbscan` — 완결형이다. 평면 위의 점 열아홉, 번짐을
 * 나르는 스택 띠, 그리고 지금까지 해 본 손잡이 조합을 전부 적어 두는 대조표가
 * 한 화면에 있다. eps 슬라이더와 minPts 슬라이더 둘이 논증을 지고, 계기 셋
 * (무리 수 · 잡음 수 · 잰 거리)과 여섯 언어 코드 패널이 딸려 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념은 **손잡이 둘과 그 결과** 를 맡는다 — eps 는 떨어진 덩이를 이어 수를
 * 줄이고 minPts 는 덩이를 무너뜨려 수를 줄이므로, 같은 무리 수가 정반대의
 * 사정에서 나온다는 것. 무게중심이 「매개변수 두 개가 서로 다른 것을 만진다」다.
 * 조각 `denseNeighborhood` 는 번짐 하나가 무리를 어떻게 정하는가만, 조각
 * `noiseLeftOut` 은 아무 무리에도 안 드는 점을 남기는 일만 말한다.
 * keywords 도 이쪽은 매개변수 조율 어휘를, 조각들은 각각 연결성 · 이상점 어휘를
 * 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dbscanConcept: FacetConceptSource = {
  id: 'dbscan',
  label: 'DBSCAN (Two Handles That Touch Different Things)',
  domain: 'ml-basics',
  canonicalFacet: 'facet:dbscan',

  surface: {
    definition:
      'Density-based clustering steered by two settings, a neighbourhood radius and a core threshold, where the radius joins separate blobs and the threshold dissolves sparse ones into noise.',
    exemplarKeywords: [
      'DBSCAN',
      'eps and minPts',
      'epsilon neighbourhood',
      'core point and border point',
      'parameter tuning',
      'the same cluster count from different parameters',
      'you do not choose the number of clusters',
      'clusters of arbitrary shape',
      'k-distance elbow',
      'density reachable',
      'region query',
      'scikit-learn DBSCAN',
    ],
  },

  briefing: {
    observable: [
      'Nineteen points sit on a plane in four blobs of different size and looseness plus two loners, and a legend names the three states a point can be in: filled for a core the spreading continues from, ring-only for a border where it stops, and a cross for one no group reached.',
      'Moving either slider does not restart the animation — the picture is recomputed for the new pair, so consecutive settings can be read against each other.',
      'A tally on the right keeps one line per pair of settings tried, each giving the groups and the noise it produced, and those lines survive every later move of the handles.',
      'Holding the threshold at three and raising the radius takes the group count three, four, three, two, one, while the noise count sits unmoved at two from 1.3 upward — the radius rearranges the boundaries between groups rather than what is left out.',
      'Holding the radius at 1.9 and raising the threshold takes the group count three, three, two, one while the noise count climbs two, two, five, nine — here the count falls because groups are being emptied, and the emptied points appear as crosses.',
      'Two lines of the tally reach two groups from very different pairs, one with two points left out and one with five, so the same count on the counter stands for different pictures.',
      'A strip below the plane draws the spreading stack as a plain array with a top index, and cells above the top keep their old numbers, because taking one off only lowers the index.',
      'A point already crossed out as noise can be taken into a group as a border when a core reaches it, and it is not pushed onto the stack, so the spreading does not continue through it.',
      'Three counters run along the bottom: the current group count, the current noise count, and a running total of distances measured, which climbs every time a handle moves.',
      'The code panel highlights the line matching the current step, and the whole spreading loop unfolds there rather than being summarised.',
    ],

    screen: {
      affordances: [
        'A first pass plays on mount at the default pair and then the screen waits; play, single step, pause, reset and a speed slider sit in the bar.',
        'Two segmented sliders stand beside the playback controls — a radius over five values from 1.0 to 3.0, and a core threshold over two, three, four and five.',
        'The way to separate the two settings is to move one and leave the other alone, reading the tally line rather than the plot after each move, then repeat with the roles swapped.',
        'The code panel starts empty with a "+ Add language" button; up to two of Python, JavaScript, TypeScript, Java, C++ and C# stand side by side.',
      ],
    },

    useWhen: [
      'The article introduces the radius and the threshold together as "the two parameters" and a reader has no way to tell what each one does. Turning one at a time and seeing the group count fall for opposite reasons — blobs joining versus blobs emptying — is the separation.',
      'The prose chooses settings by the number of clusters that come out. Two lines of the tally reach the same count with very different amounts left out, which is the argument for never reading that number alone.',
      'A reader takes "the method finds the number of clusters" to mean nothing was chosen. The count is indeed an output here, and it moves under both handles, with every pair tried still on screen to prove it.',
      'The article writes the spreading as a recursive call and the reader cannot picture what "the neighbours of the neighbour" does. The stack strip shows it as pushes and pops against a top index.',
    ],

    avoidWhen: [
      'The subject is clustering where the number of groups is fixed before the run and everything depends on that choice.',
      'The article uses "noise" for measurement error, signal noise, or randomness deliberately added to data. Here it is a label a point ends up with.',
      'The point is making neighbour queries cheap with a grid, a k-d tree or a ball tree. Every pair of points is measured directly here and the counter shows the cost of that.',
      'The subject is a method that copes with groups of very different density under one setting, or one that builds a hierarchy of densities. This runs a single pair of settings at a time.',
      'The article needs labelled examples, or a rule that assigns a group to a point arriving later. Nothing here is trained and nothing is predicted.',
    ],

    contrastWith: [
      {
        concept: 'denseNeighborhood',
        note: 'That screen fixes both settings and shows how one spreading decides a group; this one holds the data fixed and moves the settings to show what each of them decides.',
      },
      {
        concept: 'noiseLeftOut',
        note: 'That makes leaving a point out the subject; here it is one of two numbers a pair of settings produces, and watching it move is how the second handle is identified.',
      },
      {
        concept: 'kmeans',
        note: 'Both group unlabelled points, but there the number of groups is the input and every point is attached, while here the number is an output and points may be left out.',
      },
      {
        concept: 'hierarchical',
        note: 'Merging builds every number of groups at once and the reader cuts afterwards; here two settings are fixed first and the count falls out of them.',
      },
      {
        concept: 'kMustBeGiven',
        note: 'That asks whether any measure can choose the number of groups for you; this is the case where the number is not asked for, though two other things are.',
      },
    ],
  },
};
