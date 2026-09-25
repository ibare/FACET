/**
 * hopByHop 개념 선언.
 *
 * canonical facet 은 `facet:hopByHop` — 패킷 셋 `p1` · `p2` · `p3` 가 `A` — `R1` — `R2` — `B` 를 지난다. 틱마다 각
 * 마디가 온전히 받아 둔 패킷 하나를 바로 옆 이웃에게만 넘긴다. 바쁜 링크 1 · 2 · 3 · 2 · 1, 도착 틱 3 · 4 · 5,
 * 전체 5 틱 = 링크 3 + 패킷 3 − 1 (한 덩이로 묶었다면 9 틱).
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `networkLayer` 는 이 규약 위에서 쪼갠 수와 머리 비용을 견주고, 이웃 `storeAndForward` 는 메일이 다음 곳의
 * `250` 전까지 맡은 곳에 머무는 것을 말한다. 이쪽의 주장은 **틱마다 한 칸, 다 받은 것만, 옆 이웃에게만 — 그래서 링크가
 * 이어 쓰인다** 하나다. 그래서 definition 은 each tick · fully received · neighbour · links busy at once 쪽 낱말을
 * 쥐고, 머리 · 바이트 · 쪼갬 고르기 · 대기열 · 응답 코드는 쓰지 않는다. 기존 개념 `ipRouting` 이 "hop by hop
 * forwarding" 을 키워드로 쥐고 있으므로 이쪽은 길 고르기 낱말(table · next hop 선택)을 쓰지 않는다.
 *
 * 전제 (설명 글 `hopByHop.md` 가 밝힌 것): 틱은 예로 든 단위 · 링크 속도 같음 · 전파 · 처리 지연 0 · 줄 설 자리 넉넉 ·
 * 여럿이 기다리면 번호가 작은 것 먼저 · 길이 한 줄이라 고를 것이 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hopByHopConcept: FacetConceptSource = {
  id: 'hopByHop',
  label: 'Hop by Hop: Packets Advance One Link per Tick',
  canonicalFacet: 'facet:hopByHop',

  surface: {
    definition:
      'Each tick, every node passes one packet it has fully received to its adjacent neighbour, so a later packet uses a link the moment an earlier one frees it and several links are busy at once.',
    exemplarKeywords: [
      'store-and-forward switching',
      'packets in flight on different links',
      'transmission delay per hop',
      'pipelining packets through routers',
      'links + packets - 1',
      'why the first packet arrives before the last is sent',
      'staircase timing diagram',
      'router must receive the whole packet first',
    ],
  },

  briefing: {
    observable: [
      'Four nodes in a line — `A` (sending host), `R1`, `R2` (routers), `B` (receiving host) — and three links. Step 0: "Packets waiting at A: 3".',
      'Tick 1: only `p1` moves A→R1, "Tick 1 · busy links: 1". Tick 2: `p2` takes the A–R1 link `p1` just freed while `p1` goes R1→R2, busy links 2.',
      'Tick 3: all three links are busy; `p1` arrives at `B` ("Arrived at B: p1") while `p2` and `p3` each move up one node.',
      'Ticks 4 and 5 empty the links from the front: `p2` arrives at tick 4, `p3` at tick 5. Busy links over the run: 1, 2, 3, 2, 1. "Ticks in all: 5".',
      'A strip below lays each packet on a tick-by-link grid, and the packets sit diagonally in a staircase — that overlap is why five ticks suffice where carrying all three as one lump node to node would take nine.',
      'A tick is an example unit, the time to put one packet on one link; the three links have equal speed, propagation and processing delays are zero, router queues are unlimited, and the lowest-numbered waiting packet goes first. The route is a single line, so nothing is chosen. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one tick per step, six steps from tick 0 to tick 5, and stops when `p3` reaches `B`.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to tick 3 holds the moment every link carries a different packet.',
      ],
    },

    useWhen: [
      'The reader believes a message crossing three routers takes three times as long whether or not it is split, and needs the tick-by-tick overlap that gives 5 ticks instead of 9.',
      'An article sets up the store-and-forward delay formula and wants a concrete run where links + packets − 1 can be counted on the screen.',
    ],

    avoidWhen: [
      'The topic is how routers choose where to send a packet. The path is one fixed line.',
      'The subject is cut-through switching, where forwarding starts before the whole packet arrives. Here nothing moves on until it is fully received.',
      'The article is about queueing, loss or links of different speeds. Every tick is uniform and nothing is dropped.',
    ],

    contrastWith: [
      {
        concept: 'networkLayer',
        note: 'Advancing one hop per tick is the forwarding rule. The trade-off built on it asks how finely to split a message once each packet has to carry its own headers, and finds the answer depends on the number of links.',
      },
      {
        concept: 'storeAndForward',
        note: 'Both hold a whole unit before passing it on. For packets the point is speed, since consecutive links work in parallel; for mail relay the point is survival, since the unit stays put until the next holder confirms it.',
      },
      {
        concept: 'ipRouting',
        note: 'Routing decides which neighbour gets the packet. Hop-by-hop timing assumes that choice is made and describes how packets and links are occupied as they move.',
      },
      {
        concept: 'macIsLocal',
        note: 'Each hop is also a separate link-layer delivery with its own pair of addresses. Timing across hops concerns when links are busy; per-link addressing concerns what the frame on each link is labelled with.',
      },
    ],
  },
};
