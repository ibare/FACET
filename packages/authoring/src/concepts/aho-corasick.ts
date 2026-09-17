/**
 * ahoCorasick 개념 선언.
 *
 * canonical facet 은 `facet:ahoCorasick` — 완제품이다. 패턴 칸 다섯이 위에 서고
 * (이번 판에 든 것만 채워진다), 그 아래 나무와 점선 실패 링크가 있다. 오른쪽 계기의
 * **눈금이 고정**이라 "읽은 글자" 막대는 손잡이를 어디로 밀어도 같은 자리에서 멎고
 * "따로 훑으면" 막대만 그 선을 지나 길어진다. 아래 글 스물한 자에는 줄기만 하는
 * 진행 자가 깔리고, 걸린 패턴이 겹치면 딱지가 여러 줄로 눕는다. 손잡이는 패턴
 * 개수(1 … 5)다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 `manyPatternsOnePass` 는 **얻는 것**(훑기가 한 번으로 준다)을,
 * `failLink` 는 **이어 둔 연결**을 주어로 삼는다. 이쪽 definition 의 주어는 **패턴
 * 한 벌 전체를 상대하는 기계**이고, 조각 어느 쪽도 세지 않는 것을 센다 — **대신
 * 늘어나는 것이 마디**라는 값. 조각 `manyPatternsOnePass` 의 avoidWhen 이 "짓는 값은
 * 여기서 치르지 않는다" 라고 밝혀 둔 그 자리를 이쪽이 수로 메운다.
 *
 * ── `rabinKarp` 과의 경계가 이 개념에서 가장 좁다
 *
 * 둘 다 "손잡이를 밀어도 안 움직이는 수" 가 주장이라 definition 이 붙기 쉽다. 그래서
 * **손잡이와 대가**로 갈랐다. 이쪽은 패턴이 **많아져도** 읽은 글자가 n 이고 마디가
 * 는다. 저쪽은 패턴이 **길어져도** 만지는 글자가 2n 이고 저장하는 것이 없다.
 * keywords 도 조각들이 다중 패턴 응용 어휘를 이미 가졌으므로 이쪽은 **시간을 자리로
 * 산다**는 거래 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const ahoCorasickConcept: FacetConceptSource = {
  id: 'ahoCorasick',
  label: 'Aho-Corasick (What One Pass Over Many Patterns Costs)',
  canonicalFacet: 'facet:ahoCorasick',

  surface: {
    definition:
      "Matching a set of patterns over one trie carrying fallback links, where the characters read stay at the text's length however many patterns are added, and what grows instead is the room the trie takes.",
    exemplarKeywords: [
      'Aho-Corasick',
      'trading time for space in a matcher',
      'adding a keyword without adding a pass',
      'how large does the automaton get',
      'node count grows while the scan does not',
      'the scan costs the text, not the dictionary',
      'building the automaton before the stream arrives',
      'a streaming scanner over a fixed term list',
      'when one sweep replaces five',
      'what a multi-pattern matcher actually costs',
    ],
  },

  briefing: {
    observable: [
      'Five pattern slots stand along the top and only the ones in play are filled, the rest left dashed and empty, so where the handle sits is legible in the picture itself rather than only in the controls.',
      'The patterns fold into one tree of character tiles growing out of a root mark, and tiles that share an opening settle onto the same tile.',
      'Fallback links are dashed curves bowed beneath the tree; when a step actually travels one it brightens and thickens while the rest stay faint, so only the links that did work are marked.',
      'Two bars on the right share one fixed scale. The upper one, characters read, stops at the same place at every handle position; the lower one runs past it, and the overshoot is the re-reading that separate sweeps would cost.',
      'Once a run finishes a dashed line is drawn at the upper bar\'s end, so where the two part is marked on screen instead of being described.',
      'Below, the text is a row of twenty-one cells with a rule beneath it that only ever lengthens: a cell lights as it is read and shades once passed.',
      'When the path runs out the ring slides backwards through the tree and descends again in one motion while the rule underneath keeps growing — the position in the tree goes back, the position in the text does not.',
      'A pattern that finishes drops a tag over the span of text cells it covers, overlapping tags stack into separate lanes, and more than one tag can leave a single node in the same step.',
      'Across the handle the read bar holds at twenty-one while the rival runs 32, 57, 80, 110, 135, the tags come to 3, 6, 8, 10, 11, and the node count climbs 5, 8, 11, 13, 16.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a five-position slider for how many patterns are in play, at three to begin with.',
        'Patterns are added to a fixed list rather than exchanged, so each position of the handle contains the one before it and the counts can be read as a progression.',
        'Four readouts beside the handle — characters read, one at a time, matches, nodes — and the tree, the links and all four numbers are worked out during the run.',
        'The text is fixed at twenty-one characters and the patterns share both openings and endings, so both kinds of sharing occur within a single run.',
        'The code panel lays the tree out as a flat node-by-alphabet array, which is why a fallback reads there as an index rather than as a named call, and spells the order the links are filled in with an array and two cursors.',
      ],
    },

    useWhen: [
      'The article claims the number of terms stops entering the scanning cost and a reader wants that separated from a promise. One bar stopping at the same mark at all five handle positions while the other runs past it to more than four times its start is the claim as a pair of lengths.',
      'The prose needs it admitted that nothing here is free. The node count sits on the readouts beside the others and climbs from five to sixteen as terms are added, so what is being given up is named and counted rather than left out of the accounting.',
      'A reader conflates running out of options with starting over. The ring travelling sideways through the tree while the rule under the text keeps lengthening puts both positions on screen at once, and only one of them ever goes backwards.',
    ],

    avoidWhen: [
      'The article is about one pattern in one text. The whole claim here concerns what happens to the cost as terms are added, which says nothing when there is a single term.',
      'The subject is why a fallback points where it does, or the order that makes the links cheap to work out. The links are drawn and travelled here but the rule behind each destination is not derived.',
      'The article is about wildcards, regular expressions, character classes or approximate matches. Every term here is a plain run of characters that has to appear exactly.',
      'The subject is what building the structure costs in time. The tree and its links appear in one move and only the room they occupy is counted.',
      'The article means a matcher whose term list changes while it runs, or one that has to be rebuilt often. The list here is fixed before the text is touched.',
    ],

    contrastWith: [
      {
        concept: 'manyPatternsOnePass',
        note: 'The trade and its price: that one claims the separate sweeps collapse into one, while this sets a second number beside the claim — the room the merged structure takes, which is what the first number was bought with.',
      },
      {
        concept: 'failLink',
        note: 'The connection and the machine it makes possible: that one settles what each link points at and why a dead end need not restart, while this asks what a whole set of terms costs once every link is already in place.',
      },
      {
        concept: 'rabinKarp',
        note: 'Both hold one number still while a handle is pushed, and the handles differ: here more terms are added, the characters read do not move, and the structure grows to pay for it; there one pattern is made longer, the letters touched do not move, and nothing is stored at all.',
      },
      {
        concept: 'kmp',
        note: 'Both cross the text once and never step back, but one measures its saving against comparing a single pattern over and over, while this measures its saving against crossing the text once for every term on a list.',
      },
    ],
  },
};
