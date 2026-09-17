/**
 * cacheReplacement 개념 선언.
 *
 * canonical facet 은 `facet:cacheReplacement` — 칸 넷에 접근열 열한 번을 고정해
 * 두고 버리는 규칙만 LRU · MRU · FIFO 로 갈아 끼우는 완결형이다. 같은 회로에서
 * 미스가 5 · 6 · 7 로 갈린다.
 *
 * ── 가장 위험한 이웃은 `lruCache` 다 — 어휘 배타로 갈랐다
 *
 * 둘 다 "LRU" 를 자칭하는데 다루는 것이 다르다.
 *
 *   lruCache        **자료구조**. 해시맵과 이중 연결 리스트를 겹쳐 get/put 을 O(1)
 *                   로 만드는 일. 용량이 있고 키가 있고 구현이 있다.
 *   이 개념         **고르는 일**. 자리가 다 찼을 때 어느 칸을 내줄지 정하는 규칙이고,
 *                   규칙 하나만 바꿔도 같은 접근열에서 답이 셋으로 갈린다는 주장.
 *
 * 그래서 이 definition 은 저쪽의 낱말을 **한 번도 쓰지 않는다** — key · entry ·
 * get · put · O(1) · constant time · hash map · linked list · capacity ·
 * implement 가 전부 없다. exemplarKeywords 도 저쪽 목록('LRU cache' · 'least
 * recently used' · 'cache eviction policy' · 'cache hit and miss' · 'LeetCode
 * 146')과 한 줄도 겹치지 않게 골랐다. 이쪽은 규칙을 **견주는** 어휘(정책 이름
 * 셋을 나란히 · 희생자 고르기 · 미스율이 규칙에 달렸다 · 앞일을 모른다)로만 선다.
 * avoidWhen 첫 줄이 저쪽을 명시적으로 밀어내고, contrastWith 가 그 경계를 개념
 * 층위에서 다시 긋는다.
 *
 * ── 그 밖에 밀어낸 것
 *
 * 웹 캐시 · CDN · 메모이제이션 · 만료(TTL) 는 definition 에 'cache' 가 있는 한
 * 반드시 걸린다. 운영체제의 페이지 교체는 정책 이름이 같아 더 위험하다 — 층이
 * 다르다는 것을 avoidWhen 에 못박았다. 연관도(어느 자리에 놓일 수 있는가) ·
 * 색인과 태그 · 충돌 미스 · 쓰기 정책은 이웃 개념이 따로 있으므로 경계만 긋고
 * 링크하지 않는다 (동시 집필 중이라 아직 선언되지 않았을 수 있다).
 *
 * ── 잇는 조각이 없다
 *
 * 이 개념을 `origin` 으로 삼는 조각이 하나도 없어 화면 하나로 서야 한다. 그래서
 * useWhen 을 "다른 화면으로 보완할 수 없는 자리" 로 좁게 썼다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cacheReplacementConcept: FacetConceptSource = {
  id: 'cacheReplacement',
  label: 'Cache Replacement Policy (Choosing What to Discard)',
  canonicalFacet: 'facet:cacheReplacement',

  surface: {
    definition:
      'The rule a full cache follows when it must give up one of its occupied slots: each rule reads a different record of what already happened, so one fixed run of accesses ends with a different miss count under each.',
    exemplarKeywords: [
      'cache replacement policy',
      'which line gets thrown out when the cache is full',
      'LRU against FIFO against MRU',
      'choosing a victim',
      'replacement rule in a hardware cache',
      'pseudo-LRU in real processors',
      'recency against arrival order',
      'the ideal rule would need to know the future',
      'Belady optimal replacement',
      'the miss count depends on the discard rule',
      'why first in first out can lose to recency',
      'discarding what was just touched',
      'a streaming pass that never comes back',
      'how old is a line in the cache',
    ],
  },

  briefing: {
    observable: [
      'Every slot carries two numbers stacked one above the other, a last-used time and a loaded-at time, and only the one the running rule consults is drawn bright and heavy while the other is dimmed — so the definition of the rule stays legible on the board for the whole run rather than being stated once.',
      'The two numbers in a slot start equal and part company only when that slot is touched again: the slot holding line 0 comes to read loaded at 0 while last used reads 7, and that single divergence is where two of the rules begin pointing at different slots.',
      'A sentence across the top says what the running rule reads and which end of it goes — the smallest, or the largest — so the rule is named as a pair of choices rather than as an acronym.',
      'A row of eleven boxes shows the whole run of accesses in advance, and a thin bar under each box is coloured as its access resolves, so the outcome of every earlier access stays on screen while the current one is decided.',
      'Choosing and removing are two separate beats: the slot to be given up is marked and a caption names the extreme value that justified it — the smallest such time is this, so that slot goes — and only after that does anything move.',
      'The discarded line is carried out of its slot down to a row of its own and stays there faded, so the roster of what has been given up accumulates in place; it fills to a different length under each rule, one tile against two against three.',
      'A newly admitted line travels up from its own box in the run of accesses into the slot, so where the arriving line came from is drawn rather than assumed.',
      'While slots are still empty nothing is given up at all: the first four accesses are captioned as landing in an empty slot, and the choosing only begins once the board is full.',
      'Three counters run along beneath — misses, hits, discards — and they drop back to zero when a rule is changed rather than carrying on, so each run is read on its own.',
      'The run ends on a plain sentence naming the rule and its score out of eleven, and the three scores are 5, 6 and 7 for three rules over an identical run of accesses.',
      'The code panel, once a language is added, follows the run line by line, and the routine that picks the slot to give up takes which record to read and which end to take as two ordinary arguments — the three rules are three pairs of argument values in one routine rather than three routines.',
    ],

    screen: {
      affordances: [
        'Playback is fully controlled: play, single step, pause, reset, and a speed slider.',
        'A three-way policy control labelled LRU, MRU and FIFO is the handle the argument rests on, and LRU is where it starts.',
        'The handle is live during playback, not only between runs: moving it mid-run cuts the run off at that access and starts again from an empty board under the new rule, so a reader can switch the moment they see a slot chosen and watch a different slot get chosen at the same step.',
        'When a run reaches the end the screen waits with the final board and score on display until the handle is moved again.',
        'The four slots and the eleven accesses are fixed, so an article can quote a specific access position, the two numbers standing in a slot at that moment, and the three final scores.',
        'The code panel starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
      ],
    },

    useWhen: [
      'The article names a discard rule and the reader takes it for how caches simply work. Three rules run over one unchanged sequence, ending 5, 6 and 7, is the correction, and it only lands if nothing but the rule is allowed to move.',
      'The prose says a cache guesses the future from the past and the reader nods without asking which past. Two records written side by side in every slot, with one lit and one dimmed, turns that sentence into a choice that can be pointed at.',
      'A reader has to see why arrival order fails as a proxy rather than being told it is naive: it cannot register that something was used again, so it gives up a line that is asked for on the very next access and then pays for that for the rest of the run.',
      'The article is about to say that real processors approximate rather than track recency exactly, and the reader first needs to see what exact tracking demands — a number per slot, rewritten on every single hit, kept correct enough to be compared.',
      'The prose needs a case where the obviously perverse rule is not wrong: giving up what was touched most recently sounds like sabotage, and on this run it still ends ahead of the rule that goes by arrival order.',
      'The reader is about to be shown an eviction happening somewhere else — in an operating system, a database buffer, a proxy — and needs the shape of the decision itself, made once with everything else held still, before it is dressed in another setting.',
    ],

    avoidWhen: [
      'The subject is a bounded key-value cache built in software: the operations that read and write it, the structures that make each of those cheap, the code to implement one, or the interview exercise. Nothing here is addressed by a key and no internal bookkeeping is opened up — the slots are fixed positions and the only question is which one is surrendered.',
      'The article is about an HTTP cache, a CDN, a browser cache, or cached responses in front of a service. Those are about where copies of an answer sit relative to whoever asks for it.',
      'The subject is a stored result being allowed to expire, a time to live, or an explicit invalidation. Nothing here leaves because it went stale or was told to leave; a line leaves only because room was needed.',
      'The article is about memoizing a function or keeping computed results so they are not recomputed.',
      'The subject is page replacement in virtual memory or a database buffer pool. The rules carry the same names, but this is one set of slots inside a processor cache, and nothing here is read from or written back to a disk.',
      'The point is associativity — how many places a line is allowed to sit, or what changes when that number is raised. Every line here may go in any of the four slots, so where a line may live is never in question and only the discard rule varies.',
      'The subject is how an address is split into a tag and an index, or which slot an address is mapped to. Placement is settled here before the argument begins.',
      'The article is about two busy addresses colliding in one place while the rest of the cache sits idle. Every miss here happens with all four slots occupied, which is a different reason for a miss.',
      'The subject is what a departing line owes to memory — dirty state, write-back against write-through, when a change reaches the level below. Every access here is a read, and a discarded line is simply let go.',
      'The point is what a miss costs, or how far a request has to travel when it misses. Each miss here is counted as one, and the argument is about how many there are.',
      'The article is about how much arrives on a miss, or how wide a unit of storage should be. What each slot holds is fixed and never opened.',
      'The subject is the program\'s own access pattern — why reuse happens, or how code should be arranged to create it. The sequence here is given and never edited; what is varied is the rule applied to it.',
      'The article is about a rule that counts how often something is used, or one that picks at random, or one that adapts as it runs. Three rules appear here and all three decide by comparing a recorded time.',
      'The subject is the ideal rule that looks ahead to when each line will next be needed. All three rules here decide from what has already happened, which is the premise the comparison rests on.',
    ],

    contrastWith: [
      {
        concept: 'lruCache',
        note: 'Recency belongs to both and they are not the same subject. There it is a container addressed by keys, and the work is the internal bookkeeping that keeps finding an item and knowing its order of use cheap at the same time. Here recency is only one candidate rule among three for deciding which occupied slot to surrender, and the claim is that changing that rule alone — with the run of accesses, the number of slots and everything else held still — changes how often the data is found at all.',
      },
      {
        concept: 'temporalLocality',
        note: 'One is a property of the program and the other a decision by the cache. Coming back to something soon is something the references do; a replacement rule is what the cache does with a full board, and the same pattern of returns is rewarded or squandered depending on which rule is in force.',
      },
      {
        concept: 'cacheLine',
        note: 'Two independent ways of spending the same limited room: one settles how wide each unit of storage is, this one settles which occupied unit is given up when they are all taken. Either can be changed without touching the other.',
      },
      {
        concept: 'latencyLadder',
        note: 'This counts how many misses a rule causes; that one says what a single miss is worth. Neither is actionable alone — a rule that saves two misses matters exactly as much as a miss costs.',
      },
      {
        concept: 'cachingCdn',
        note: 'One word for two shortages. There the question is where copies should live relative to whoever is asking, and an answer not held nearby is fetched from further away; here everything is already in one place and the shortage is room, so something already present has to go.',
      },
    ],
  },
};
