/**
 * failLink 개념 선언.
 *
 * canonical facet 은 `facet:failLink` — 조각(piece)이다. 화면이 두 층이다. 위는
 * 훑어 갈 여섯 글자 텍스트 한 줄, 아래는 패턴 넷이 한 마디씩 자라 이룬 나무.
 * 나무가 다 서면 굽은 링크가 알갱이에 끌려 하나씩 그어지고, 그다음 고리 하나가
 * 나무 위를 다닌다. 계기도 코드 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 형제 `manyPatternsOnePass` 와는 **장치와 성과** 관계라 definition 이 붙기 쉽다.
 * 그래서 이쪽 definition 의 주어를 **이어 둔 연결** 로 고정했다 — 마디마다 걸려
 * 있는, 제 꼬리 가운데 나무가 아직 가진 가장 긴 것을 가리키는 링크. 저쪽은
 * **얻는 것**(훑기가 한 번으로 준다)을 주어로 삼는다.
 *
 * 이웃 `prefixSuffixJump` 와의 경계가 특히 좁다. 그쪽은 **패턴 하나**가 제 앞뒤로
 * 겹치는 길이를 셈한 표이고, 이쪽은 **나무 위 여러 패턴 사이**를 잇는다 — 한
 * 패턴의 꼬리가 다른 패턴의 머리일 수 있다는 것이 이쪽에만 있는 주장이라
 * definition · avoidWhen · contrastWith 세 군데가 모두 그 선을 말한다.
 *
 * `bfs` 는 걸지 않았다. 링크를 잇는 차례가 화면에서 너비 우선으로 보이지 않고,
 * 캡션도 각 링크를 정의(가장 긴 꼬리)로만 말한다. 화면에 없는 것은 걸지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const failLinkConcept: FacetConceptSource = {
  id: 'failLink',
  label: 'Fail Link (Where a Dead End Goes Instead of the Root)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:failLink',

  surface: {
    definition:
      'A link on each place of a tree of several patterns, pointing to the longest tail of it the tree also holds — often the head of another pattern — so a dead end slides sideways instead of restarting.',
    exemplarKeywords: [
      'failure link',
      'fail link',
      'suffix link in a pattern automaton',
      'Aho-Corasick failure function',
      'goto and fail transitions',
      'the longest suffix that is also in the tree',
      'where to go when there is no branch',
      'falling back without starting over',
      'one pattern ending inside another',
      'sliding to the overlap',
      'what a restart would have cost',
    ],
  },

  briefing: {
    observable: [
      'The tree is not handed over finished — it grows one pattern at a time out of a single root, new places sliding out from their parent, and a small word tag easing out beside every place where a pattern finishes.',
      'The links are then drawn one at a time, each by a bead rolling along a curved path that leaves the link behind it as a dashed line. Only four are ever drawn, and each caption states the rule it satisfies rather than asserting the destination: "sh" falls back to "h", "she" to "he", "his" to "s", "hers" to "s".',
      'Every one of those four arcs lands on a place that was created by a different pattern than the one it starts from, so the links are visibly connections between patterns rather than inside one.',
      'The scan then runs on both layers at once: a box advances through the text one cell at a time and never returns, while a ring moves over the tree. On the first character the root offers no branch and the ring shakes in place rather than travelling.',
      'The moment the screen is built for arrives at the fifth character: the ring is standing on "she", a dashed crossed-out slot appears beneath it to mark the child that is not there, and then the ring travels along the curved link across to "he" — sideways through the tree, not upward to the root.',
      'A finished pattern is marked in two places at once — the tree place fills in and its tag turns solid, and a short bar is drawn under the run of text cells it spans. Two such bars appear, one under three cells and one under four.',
      'The alternative is acted out rather than described: a dashed ghost ring flies from that same place back to the root, and the place where "hers" ends then takes a dashed warning ring and a "missed" label, while the caption says the rest would have read as a fresh start.',
      'The ghost sinks away at the end, the marks clear, and the closing caption names the one pattern the slide saved.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole thing on its own — the tree growing, the four links being drawn, the scan, then the counter-case — and stops after naming what the slide rescued.',
        'Two buttons: Replay, and a step control that rewinds and walks the same run one move at a time, which is how a reader can hold still on the sideways slide itself, or on any single link as it is being laid down.',
        'The patterns and the text are fixed and chosen so that exactly one dead end occurs and exactly one pattern depends on how it is handled, which is what lets the ending be a single named word rather than a tally.',
      ],
    },

    useWhen: [
      'A reader is handed a diagram with the arrows already drawn across the tree and no account of why each points where it does. Every link here is laid down in front of them, and each caption gives the rule it follows — the longest tail of this place that the tree still holds.',
      'The reader has to be convinced that running out of options is not the same as starting again. A crossed-out empty slot marking the branch that was missing, followed by travel across the tree rather than up to it, is what makes that land.',
      'The prose has claimed a cost for the obvious alternative and now needs it made specific. The ghost returning to the root and one pattern taking a missed mark names exactly what the restart would have thrown away.',
    ],

    avoidWhen: [
      'The article is about a single pattern folded onto its own tail, where the fallback is a length computed from that pattern by itself. Every link here runs between places grown by four different patterns.',
      'The subject is harvesting every pattern that ends inside the one just matched at the same position. These links decide where the scan continues after a dead end, and that is the only use made of them here.',
      'The subject is suffix links inside a structure built over the text — a suffix tree, a suffix automaton, an index of the document. The tree here is built from the patterns and stands complete before the text is touched.',
      'The article is about the order that makes the links cheap to compute, or the queue that supplies that order. Each link here is stated as the definition it satisfies, not derived from one already known.',
      '"Fail" or "fallback" in the article means an error path, a backup server, a retry, or exception handling.',
    ],

    contrastWith: [
      {
        concept: 'ahoCorasick',
        note: 'The connection and the machine it makes possible: this settles what each link points at and why a dead end need not restart, while that asks what a whole set of patterns costs once every link is already in place.',
      },
      {
        concept: 'manyPatternsOnePass',
        note: 'The device and what it pays for: this is the connection prepared between places, while that is the claim the connection licenses — that the text is read through exactly once.',
      },
      {
        concept: 'prefixSuffixJump',
        note: 'Both settle in advance where to resume after a dead end, but one folds a single pattern onto its own tail, while here the tail of one pattern may be the head of a different one, so the fallback crosses between patterns instead of staying inside one.',
      },
      {
        concept: 'trie',
        note: 'The tree is the same object, but one concept is about the characters stored along its paths, while this is about a second set of connections laid over it that those characters do not by themselves supply.',
      },
      {
        concept: 'naiveShiftByOne',
        note: 'Both turn on what a mismatch is allowed to keep: one abandons everything matched and begins again one place along, while this holds on to whatever tail remains usable and resumes from the place that already represents it.',
      },
    ],
  },
};
