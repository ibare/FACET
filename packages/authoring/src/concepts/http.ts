/**
 * http 개념 선언.
 *
 * canonical facet 은 `facet:http` — 30 초 동안 서버 쪽에 메시지 일곱이 2 · 3 · 9 · 17 · 18 · 19 · 27 초에 생긴다.
 * 손잡이 "Receive by" 는 폴링 간격 1 s · 2 s · 5 s · 10 s 와 끝값 WebSocket 다섯 칸(처음 5 s). 폴링 넷에서는 요청 ·
 * 빈 응답 · 짐 아닌 바이트가 줄고 늦음 합이 는다(반대 방향으로 단조). WebSocket 은 요청 1 · 늦음 0 · 바이트 최소로 그 맞바꿈 밖에 선다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 각각 한 장면이다 — 물은 것만 오고 답이 새 질문을 낳는다(`requestResponse`) · 서버가 요청을 잇지 않아 쿠키를
 * 싣고 온다(`statelessNeedsToken`) · 업그레이드 한 번으로 같은 연결이 틀의 길로 바뀐다(`upgradeThenKeepOpen`).
 * 이쪽은 **폴링 간격을 돌려 늦음과 헛된 요청의 맞바꿈을 재고, 웹소켓을 그 사다리의 끝에 세우는 것**을 맡는다.
 * 그래서 definition 은 interval · delay · empty responses · trade 쪽 낱말을 쥐고, 조각들이 쥔 linked resources · session cookie ·
 * 101 · frame header 를 쓰지 않는다. WebSocket 은 host 토픽 websocket 을 합친 자리라 이름으로는 남긴다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `http.md` 가 밝힌 것):
 *  - 메시지 시각 · 짐 `{"from":"jun","text":"hi"}` · 쿠키 `sid=7f3a9c` 는 예로 정한 값.
 *  - HTTP/1.1 지속 연결 하나를 열어 두고, 연결을 여는 값은 두 방식 모두 세지 않는다.
 *  - 바이트는 응용 계층 글자만(TCP · IP · TLS 머리 없음). 긴 폴링 · SSE 는 손잡이에 없고, 웹소켓 ping 틀은 세지 않는다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const httpConcept: FacetConceptSource = {
  id: 'http',
  label: 'HTTP Polling Interval vs WebSocket',
  canonicalFacet: 'facet:http',

  surface: {
    definition:
      'Because an HTTP server cannot speak first, a client polls for new messages, and lengthening the polling interval trades fewer empty responses for longer delivery delay; a WebSocket connection escapes that trade.',
    exemplarKeywords: [
      'HTTP polling',
      'short polling interval',
      'polling vs WebSocket',
      'WebSocket',
      'real-time chat updates',
      'server cannot push over plain HTTP',
      '204 No Content',
      'wasted requests',
      'notification latency',
      'HTTP overhead bytes per request',
      'HTTP/1.1 keep-alive',
    ],
  },

  briefing: {
    observable: [
      'A 30-second time axis carries a Server row and a Client row. Seven messages are born on the server side at 2, 3, 9, 17, 18, 19 and 27 s; their dots stay at those places whatever the handle says.',
      'In a polling round each request is a vertical tick from Client up to Server. If messages are waiting, the whole pile rides down the tick as one `HTTP/1.1 200 OK`; if none are, the tick ends in a hollow circle, `HTTP/1.1 204 No Content`. Ticks not yet reached are dashed.',
      'Each message gets a Delay bar from where it was born to where it crossed, with its seconds written at the end. At 5 s the delays are 3, 2, 1, 3, 2, 1 and 3 s.',
      'One step is one 5-second window; the caption counts it, e.g. "Window (15 s, 20 s] · delivered here: 3 · waiting on the server: 0". Four counters keep the running totals — HTTP requests, Empty responses, Total delay (s), Non-payload bytes.',
      'At the end of a round the counters read: 1 s → 30 · 23 · 0 · 3202; 2 s → 15 · 9 · 5 · 1717; 5 s → 6 · 2 · 15 · 763; 10 s → 3 · 0 · 25 · 430; WebSocket → 1 · 0 · 0 · 300. Across the four polling values requests and empty responses fall while total delay rises.',
      'In the WebSocket round the tick crowd collapses to one upgrade at the start (request 157 bytes, response 129 bytes) and a horizontal connection band runs to 30 s. Each message crosses in the second it is born, so every Delay bar is 0.',
      'Every polling request carries `Cookie: sid=7f3a9c`. Message times, the payload and the cookie value are chosen for the example; one persistent HTTP/1.1 connection is assumed and its opening is not counted; bytes are application-layer text only. Long polling and server-sent events are not on the handle, and WebSocket ping frames are not counted. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a five-position "Receive by" slider — 1 s, 2 s, 5 s, 10 s, WebSocket — starting at 5 s. A round is seven steps for polling, eight for WebSocket, then waits for the handle.',
        'The move that makes the idea land is stepping from 1 s to 10 s and back: requests thin out and the Delay bars grow, the previous round staying as dashed outlines beside the new bars. Then the last position, where the ticks collapse to one upgrade and the bars shrink to zero.',
        'The code panel, labelled "Polling and WebSocket", starts empty with a "+ Add language" button; the chosen language shows `pollExchange` and `socketExchange` and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article asks how often a chat or notification client should poll, and needs numbers showing that no interval gets both low delay and few empty responses.',
      'A reader wonders why WebSocket exists when HTTP already works; setting its single upgrade and zero delay against the whole ladder of polling intervals answers that in one handle.',
    ],

    avoidWhen: [
      'The subject is long polling or server-sent events. Neither is on the handle; polling here always answers at once, with 204 if nothing waits.',
      'The article is about HTTP/2 multiplexing, caching headers or REST design. Only one polling path on one persistent connection is modelled.',
      'The point is the WebSocket handshake or frame format in detail. The upgrade appears only as one step and its byte count.',
    ],

    contrastWith: [
      {
        concept: 'requestResponse',
        note: 'That the server answers only what is asked is the premise; polling is what a client is forced into by that premise when the news originates on the server.',
      },
      {
        concept: 'statelessNeedsToken',
        note: 'A server that does not link requests is why each poll must carry its session cookie again. The cost of polling is measured in delay and empty requests, not in how the server recognizes the caller.',
      },
      {
        concept: 'upgradeThenKeepOpen',
        note: 'The upgrade mechanism explains how one request turns a connection into a two-way channel. Here that channel is one option among polling intervals, judged by delay, request count and overhead bytes.',
      },
      {
        concept: 'pollingVsInterrupt',
        note: 'Both weigh asking repeatedly against being told. Between a CPU and a device the data arrives at the same moment either way; across HTTP the polling interval itself adds delay to every message.',
      },
    ],
  },
};
