/**
 * statelessNeedsToken 개념 선언.
 *
 * canonical facet 은 `facet:statelessNeedsToken` — 같은 사람이 요청 넷을 보낸다. `POST /login` 이 세션 표에
 * `7f3a9c → mina` 를 적고 `Set-Cookie: sid=7f3a9c` 를 돌려준다. 쿠키 없이 온 `GET /cart`(사생활 창)는 로그인 바로 뒤인데도
 * `401 Unauthorized`, 쿠키를 실은 `GET /cart` · `GET /orders` 는 mina 로 `200 OK`. 세션 표의 줄 수는 끝까지 1.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `http` 는 폴링마다 같은 쿠키가 실리는 값만 쓰고, 이웃 `requestResponse` 는 클라이언트가 답에서 무엇을 알게 되는지를
 * 말한다. 같은 분야의 `tokenBearer` 는 표를 든 사람이 누구든 통과한다는 쪽이다. 이쪽의 주장은 하나 — **서버는 요청과 요청을
 * 잇지 않아, 알아보는 실마리는 요청이 싣고 오는 쿠키뿐이다.** 그래서 definition 은 stateless · session table · cookie ·
 * login 쪽 낱말을 쥐고, stolen · copy · expiry · polling 을 쓰지 않는다.
 *
 * 전제 (설명 글 `statelessNeedsToken.md` 가 밝힌 것): 요청 2 는 같은 사람이 쿠키를 나누지 않는 사생활 창에서 보낸 것 ·
 * 세션 값 `7f3a9c` 는 예로 정한 값(실제는 무작위) · 비밀번호 확인 없음 · 메시지는 보낸 순간 닿는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const statelessNeedsTokenConcept: FacetConceptSource = {
  id: 'statelessNeedsToken',
  label: 'Stateless HTTP: The Session Cookie Must Be Carried In',
  canonicalFacet: 'facet:statelessNeedsToken',

  surface: {
    definition:
      'An HTTP server keeps nothing from one request to the next, so a logged-in user is recognized only when the request itself carries the session cookie that points to a row in the server\'s session table.',
    exemplarKeywords: [
      'HTTP is stateless',
      'session cookie',
      'Set-Cookie header',
      'Cookie: sid',
      'session ID',
      'server-side session store',
      'how the server remembers login',
      '401 Unauthorized after login',
      'private browsing window',
      'shopping cart session',
    ],
  },

  briefing: {
    observable: [
      'On the left a normal Window and a Private window, each with its own Cookie store; on the right the Server with a "Held for this request" box and a Session table, empty at first.',
      'Request 1, `POST /login` with body `user=mina`, arrives with no cookie. The response is `200 OK` with `Set-Cookie: sid=7f3a9c`; the session table gains `7f3a9c → mina`, and the cookie lands in the normal window\'s cookie store.',
      'After every response the "Held for this request" box goes back to empty — the server lets go of what it knew about that request.',
      'Request 2, `GET /cart` from the private window, carries no cookie. It gets `401 Unauthorized` — "recognized: nobody · session table rows: 1" — right after the login, while the session table still holds mina\'s row.',
      'Requests 3 (`GET /cart`) and 4 (`GET /orders`) carry `Cookie: sid=7f3a9c`. Both return `200 OK` as mina: the cart `/item/12` `/item/31`, then order `#1042`.',
      'The session table holds one row from request 1 to the end, so what separates request 2 from request 3 is the cookie in the request, not the table.',
      'Request 2 is set up as the same person in a private window that shares no cookies. The session value is chosen for the example (a real server generates an unguessable random one), and login checks no password. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, sending and answering four requests, nine steps including the start.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to response 2 holds the 401 while the session table still shows `7f3a9c → mina`.',
        'Requests, cookie value and user are fixed, so every status line and header can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader believes the server remembers who just logged in because the requests come from the same computer; the 401 right after login, with the session row still present, overturns that.',
      'An article introduces cookies or session IDs and needs the reason they exist: the server can only look up a user when each request brings the key along.',
    ],

    avoidWhen: [
      'The subject is stolen session cookies, session hijacking or CSRF. The cookie is used by one person only and never travels elsewhere.',
      'The article is about JWT, OAuth or token expiry. Login issues a plain session ID with no lifetime shown.',
      'The point is cookie attributes such as SameSite, Secure or HttpOnly.',
    ],

    contrastWith: [
      {
        concept: 'requestResponse',
        note: 'Both treat each request as standing alone. That one is about the client learning what to ask from an answer; this one is about the server forgetting the asker once it has answered.',
      },
      {
        concept: 'tokenBearer',
        note: 'Carrying the key in every request is why the server can recognize anyone at all. That the server then accepts whoever carries it, including someone holding a copy, is the consequence that concept draws.',
      },
      {
        concept: 'http',
        note: 'A stateless server means every poll must present the cookie again. The polling trade-off is about how often to ask, not about how the caller is recognized.',
      },
    ],
  },
};
