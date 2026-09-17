/**
 * writeBackVsThrough 개념 선언.
 *
 * canonical facet 은 `facet:writeBackVsThrough` — 두 lane 을 나란히 세우고 같은
 * 고침 일곱 번을 양쪽에 동시에 떨어뜨리는 조각이다. 왼쪽은 점이 곧장 아래층까지
 * 내려가 상자가 되고, 오른쪽은 점이 줄 위에 쌓였다가 쫓겨날 때 상자 하나에 실려
 * 내려간다. 손잡이는 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나 (특히 writePolicy 와)
 *
 * 이 개념과 `writePolicy` 가 가장 붙는다 — 둘 다 같은 두 정책을 다루기 때문이다.
 * **하는 일로 갈랐다.**
 *
 *   이 개념      **나란히 놓인 한 장면**. 같은 고침이 양쪽에 동시에 오고, 한쪽은
 *                곧장 내려보내고 한쪽은 표시만 단다. 고정 데이터로 한 번 보이고 멈춘다.
 *   writePolicy  **고르는 일**. 규칙이 손잡이로 놓여 있고, 돌리면 내려간 횟수가 갈린다.
 *
 * 그래서 definition 에서 이쪽은 두 이름(write-through · write-back)과 '나란히 ·
 * 같은 고침이 양쪽에 · 곧장 · 미룬다' 를 갖고, 저쪽이 가진 '규칙 · 고르기 · 설정 ·
 * 값(cost) · 맞바꿈' 어휘는 한 번도 쓰지 않는다. 'dirty' 라는 말도 저쪽에 넘기고
 * 여기서는 표시(tag · mark) 로만 말한다.
 *
 * 무엇을 버릴지 고르는 규칙은 `cacheReplacement`, 미스에 블록이 올라오는 일은
 * `lineFill` 의 몫이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const writeBackVsThroughConcept: FacetConceptSource = {
  id: 'writeBackVsThrough',
  label: 'Write-Back and Write-Through Side by Side',
  canonicalFacet: 'facet:writeBackVsThrough',

  surface: {
    definition:
      'Write-through and write-back set side by side under one identical stream of edits: the first forwards each edit to memory as it happens, the second only tags the line until it is displaced.',
    exemplarKeywords: [
      'write-back versus write-through',
      'the difference between write-back and write-through',
      'what does write-back actually do differently',
      'tagging a line instead of writing it',
      'the write is deferred',
      'several edits ride down together',
      'one trip carries three edits',
      'memory is updated immediately',
      'memory lags behind the cache',
      'a displaced line takes its edits with it',
      'the same edits, a different number of trips',
      'the two ways a cache can handle a store',
    ],
  },

  briefing: {
    observable: [
      'Two bounded lanes stand beside each other under one shared row of seven chips, so the sequence being executed belongs to neither side and is visibly the same input for both.',
      'A marker slides along the chip row to the write currently in progress, and the two lanes then react to that one chip at the same instant.',
      'Each lane carries the same interior — a cache with two slots marked 2 × 16 B, and a memory bar beneath it with its own running count — so the only place the two can differ is where the edits come to rest.',
      'A single edit falls as one dot into both lanes simultaneously; on the left it does not stop at the slot but continues into the memory bar as a box, and on the right it settles on the line and stays there.',
      'The dots accumulate on the right in plain view — one, then two, then three on the same line — while the left has already deposited three separate boxes for those same three edits.',
      'Occupancy stays identical between the lanes: the same line is loaded into the same slot on both sides and displaced from both sides at the same moment, which removes every explanation for the divergence except what is done with the edits.',
      'When a line is displaced, the dots gathered on it are swept up into one box that carries them visibly inside it, and that box drops into the memory bar as a single arrival.',
      'The run continues past the last chip: the lines still carrying marks are sent down as boxes one after another, so the marks are not left uncounted.',
      'Both memory bars end holding the same number of dots and a different number of boxes — seven boxes on the left, four on the right — which states the claim as a difference in packaging rather than a difference in volume.',
      'The closing caption puts both totals in one line, and the two bars and their counts are drawn at full strength at that moment.',
      'A caption beneath the lanes names what the current step is doing — the same edit arriving at both, the same line being marked again, a new line taking a free slot, a line being displaced with its marks, and the lines left over at the end.',
    ],

    screen: {
      affordances: [
        'The screen plays all seven writes, the leftover lines and the closing tally on its own and then stops.',
        'Beneath it are a Replay button and a playback strip. After the run, dragging the handle to the write where the dots are swept into a single box holds that moment still.',
        'The sequence of seven writes, the two slots and the 16 B line are fixed, so an article can name the line written three times and quote the two totals it leads to.',
      ],
    },

    useWhen: [
      'The article names the two disciplines and the reader treats them as two words for the same thing. One edit landing in both lanes and then behaving differently in each is the smallest thing that separates them.',
      'The prose says edits are "deferred" or "batched" and the reader cannot picture what is holding them. Dots resting on a line, then leaving together inside one box, is that sentence made literal.',
      'The reader suspects the deferring side is simply doing less work, and needs the leftover lines to be sent down in front of them before any total can be believed.',
      'An argument is about to be made that a saving comes from many changes collapsing into one transfer, and the reader needs the collapse itself visible before the arithmetic of it means anything.',
      'The article needs the two disciplines to differ in one respect only, with occupancy, capacity and order held identical, so that nothing else can be blamed for the difference.',
    ],

    avoidWhen: [
      'The subject is an HTTP cache, a CDN, or a browser cache. Those place copies of documents across machines; both lanes here are one span of addresses inside a chip and the memory directly beneath it.',
      'The article is about memoizing a function or keeping a computed result under a key. Nothing here is keyed by a value.',
      'The subject is a bounded cache data structure that discards entries — an LRU or LFU container, capacity, get and put. Both lanes discard by the same rule and at the same moment, so the discard is scenery here and not the subject.',
      'The subject is durability in a database or filesystem — a write-ahead log, journalling, fsync, or surviving a crash. Those order a record of an intention against the change; nothing here is logged, and memory is simply overwritten.',
      'The article is about two cores, coherence, or a copy being revoked. Each lane runs a single stream of accesses and no copy is taken from anyone.',
      'The subject is how wide a line should be, or how many slots a cache should have. Both are fixed and identical across the two lanes.',
      'The point is which slot an address lands in, or how an address splits into a tag and an index. Placement is uneventful here and deliberately the same on both sides.',
      'The article is about reads, hit rates, or a block arriving in answer to a request. Every access shown here is a modification.',
      'The reader is meant to work the trade-off themselves and see the totals answer to what they set. The two disciplines run once here on one fixed sequence.',
      'The article uses "flush" for emptying a buffer of text or for a graphics pipeline.',
    ],

    contrastWith: [
      {
        concept: 'writePolicy',
        note: 'One holds both disciplines at once under a single stream of edits and shows only that they differ; the other treats the discipline as a quantity to be set and reports what the setting costs. The mechanism is the claim here; the saving and its price are the claim there.',
      },
      {
        concept: 'cacheReplacement',
        note: 'Both turn on the moment a line is displaced, but that one is about selecting which resident line goes, and this one takes the selection as given and asks what the departing line still owes the level beneath.',
      },
      {
        concept: 'lineFill',
        note: 'The two directions a whole line travels for one element: there a block rises because one element in it was requested, here a block descends because some elements in it were changed. The unit is the same and the reason for the trip is not.',
      },
      {
        concept: 'falseSharing',
        note: 'Both concern a modified line and what it costs, but this one is about a line reaching the level beneath it, and that one is about a line being taken back and forth between two caches on the same level while nothing is genuinely shared.',
      },
    ],
  },
};
