/**
 * requestResponse 개념 선언.
 *
 * canonical facet 은 `facet:requestResponse` — 브라우저가 `www.example.com` 의 `/index.html` 하나를 묻는다. 받은 본문에
 * 적힌 `/style.css` · `/app.js` · `/logo.png` 가 물을 줄 끝에 서고, `/style.css` 의 답에서야 `/font.woff2` 가 나온다.
 * 한 번에 요청 하나, 요청 5 · 응답 5 (200 넷 · 404 하나). 서버가 먼저 보낸 것 0. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `http` 는 폴링 간격을 돌려 늦음과 헛된 요청을 견주고, 이웃 `statelessNeedsToken` 은 요청 사이에 서버가 무엇을
 * 남기는지, `upgradeThenKeepOpen` 은 짝이 풀린 뒤를 말한다. 이쪽의 주장은 하나 — **답 안에서 새로 알게 된 이름은 다시
 * 물어야 온다.** 그래서 definition 은 page load · linked resources · discovered · 404 쪽 낱말을 쥐고, polling · interval ·
 * cookie · upgrade 를 쓰지 않는다.
 *
 * 전제 (설명 글 `requestResponse.md` 가 밝힌 것): 연결 하나로 한 번에 요청 하나(실제 브라우저는 연결 여럿 · 겹쳐 보내기 ·
 * 캐시를 쓴다) · 서버 푸시 없음 · 메시지는 보낸 순간 닿는다 · 호스트와 자원 표는 예로 정한 값.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const requestResponseConcept: FacetConceptSource = {
  id: 'requestResponse',
  label: 'HTTP Request-Response: Each Answer Reveals What to Ask Next',
  canonicalFacet: 'facet:requestResponse',

  surface: {
    definition:
      'In HTTP each request gets exactly one response and nothing unasked, so a browser loading a page discovers its linked stylesheets, scripts, images and fonts only inside earlier responses and must request each one in turn.',
    exemplarKeywords: [
      'request-response model',
      'why a page makes many HTTP requests',
      'GET request',
      'linked resources in HTML',
      'loading CSS, JavaScript and fonts',
      'resource discovered late',
      '404 Not Found',
      'HTTP/1.1 200 OK',
      'client-initiated protocol',
      'waterfall of requests',
    ],
  },

  briefing: {
    observable: [
      'A Browser on the left and a Server for `www.example.com` on the right. The browser\'s "To ask" queue starts with `/index.html` alone ("First to ask: /index.html").',
      'Each request is its own step, e.g. `GET /style.css HTTP/1.1` with "Asking: /style.css. Left in the queue: 2", and each response is the next step with its status line.',
      'The answer for `/index.html` names `/style.css`, `/app.js` and `/logo.png`, which join the end of the queue in that order ("New names inside: 3").',
      'The answer for `/style.css` names `/font.woff2`. It was not in the first answer, so it stands at the very end and is asked last.',
      '`/logo.png` is not on the server and comes back `HTTP/1.1 404 Not Found` — "It points to nothing." The Answered list reads `/index.html` 200 · `/style.css` 200 · `/app.js` 200 · `/logo.png` 404 · `/font.woff2` 200.',
      'Counters "Requests" and "Responses" climb together to 5 each. Nothing ever crosses from the server without a request before it.',
      'One connection carries one request at a time, the next leaving only after the previous answer is complete; real browsers open several connections, overlap requests and skip what is cached. The host and resource table are chosen for the example. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one message per step, eleven steps including the start, and stops after the fifth answer.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to the `/style.css` answer holds the moment `/font.woff2` appears at the back of the queue.',
        'The paths, statuses and order are fixed, so every line can be quoted as it appears.',
      ],
    },

    useWhen: [
      'The reader expects the server to send a whole page at once and needs to see that every stylesheet, script and font arrives only because the browser asked for it.',
      'The article explains why a resource referenced from CSS loads late: it cannot be requested until the response that names it has arrived.',
    ],

    avoidWhen: [
      'The subject is HTTP/2 or HTTP/3 multiplexing, parallel connections or server push. One connection carries one request at a time here.',
      'The article is about browser caching or CDNs. Every resource is fetched from the server, nothing is reused.',
      'The point is HTTP methods other than GET, request bodies or status code families in general.',
    ],

    contrastWith: [
      {
        concept: 'http',
        note: 'One answer per request is the rule; polling for server-side news is the cost that rule imposes when the client cannot know when to ask.',
      },
      {
        concept: 'statelessNeedsToken',
        note: 'Both hold that each request stands alone. This one is about what the client learns from an answer and must ask next; that one is about what the server keeps, or fails to keep, between two requests.',
      },
      {
        concept: 'upgradeThenKeepOpen',
        note: 'Here every message from the server is paired with a question before it. After an upgrade that pairing is dissolved and the server sends without being asked.',
      },
    ],
  },
};
