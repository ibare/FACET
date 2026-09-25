/**
 * auth 개념 선언.
 *
 * canonical facet 은 `facet:auth` — 0..600 초 시간 축. 앱이 10 초부터 20 초마다 서른 번 묻고, 만료되면 요청 직전에 새로 받는다.
 * 40 초에 앱이 쥔 토큰의 사본이 훔친 쪽으로 새고, 훔친 쪽은 60 초부터 10 초마다 쉰네 번 그 사본으로 묻는다. 손잡이 토큰
 * 수명(30 · 60 · 120 · 300 · 900, 처음 300)을 늘리면 훔친 쪽 통과는 0 → 54 로 늘고 발급은 15 → 1 로 준다. 앱은 늘 30 번 통과.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * `tokenBearer` 는 문이 토큰만 보고 보낸 쪽은 보지 않는다는 한 장면에서 멈췄다. 이쪽은 그 조각이 미룬 **만료를 손잡이로 푼다** —
 * 문이 가리지 못하니 줄일 수 있는 것은 시간뿐이고, 수명은 샌 표의 쓸모와 다시 받는 횟수를 맞바꾼다. 그래서 definition 은
 * lifetime · leaked · reissue · trade 쪽 낱말을 쥐고, 조각이 쥔 presents · address · Authorization header 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `auth.md` 가 밝힌 것):
 *  - 요청 간격 · 유출 시각 40 초 · 수명 사다리는 예로 정한 값. 새로 받기는 요청 직전에만(미리 갱신 없음).
 *  - 옛 토큰을 무르는 길(폐기 목록 · 갱신 토큰)은 없다. 토큰 형식(JWT)과 서명 검증은 다루지 않고 발급 차례 번호로 가른다.
 *  - 코드 패널이 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const authConcept: FacetConceptSource = {
  id: 'auth',
  label: 'Token Lifetime: Leaked-Token Window vs Reissue Count',
  canonicalFacet: 'facet:auth',

  surface: {
    definition:
      'Since an API cannot tell a leaked access token from the real one, only its lifetime limits the damage: longer lifetimes let a stolen token pass more often, shorter ones make the client fetch new tokens more often.',
    exemplarKeywords: [
      'access token lifetime',
      'token expiration time',
      'short-lived tokens',
      'leaked token',
      'token theft mitigation',
      'how long should a JWT last',
      'token refresh frequency',
      'API authentication',
      '401 after expiry',
      'expires_in',
    ],
  },

  briefing: {
    observable: [
      'Rows for Issuer, App and Thief share a 0–600 s time axis, with the API server\'s rule beside them: "Looks at the token only" — "known and now < expiry → 200 · otherwise → 401". Each bar on the App row is one token valid from issue to expiry; a triangle on the Issuer row marks each issue.',
      'The app asks thirty times, every 20 s from 10 s; the thief asks fifty-four times, every 10 s from 60 s ("Lifetime 300 s. The app asks 30 times, the thief 54 times."). A request dot rises into the bar filled on `200` and drops hollow on `401`.',
      'At 40 s the app\'s current token leaks: its bar is copied down to the Thief row as the "stolen copy" — at lifetime 300, "It is valid until 310 s: usable 270 s after the leak."',
      'Each step is a 100-second window with its tally, e.g. "300–400 s · issued +1 · app 200: 5 · thief 200: 0 · thief 401: 10". The app\'s thirty dots stay at 200 at every lifetime.',
      'End-of-round counters (Thief 200s · Tokens issued · Usable after leak (s)): 30 → 0 · 15 · 0; 60 → 1 · 10 · 30; 120 → 7 · 5 · 90; 300 → 25 · 2 · 270; 900 → 54 · 1 · 870. The leaked token is always the first one issued; at 30 it expires at 40 s, the moment it leaks.',
      'A new token does not revoke the old one, which stays valid until its own expiry. Intervals, the leak time and the lifetime ladder are chosen for the example; tokens are renewed only just before a request; revocation lists, refresh tokens, JWT format and signature checks are left out. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: a five-position "Token lifetime" slider — 30, 60, 120, 300, 900 — starting at 300. Each round is seven steps, then waits for the handle.',
        'The move that makes the idea land is dragging the lifetime from 30 up to 900: the stolen copy\'s bar stretches and the thief\'s dots flip from 401 to 200 one after another, while issue triangles thin out on the app row. The previous round stays dashed until each window replays.',
        'There is no code panel; the rule is the one line printed beside the API server.',
      ],
    },

    useWhen: [
      'The article recommends short-lived access tokens and must show the price as well as the benefit: fewer passes for a thief, more issues for the app.',
      'A reader asks how long a token should live; the counters give one leak\'s damage and the reissue load for each of five lifetimes.',
    ],

    avoidWhen: [
      'The subject is refresh tokens, token revocation or rotation. None of these exist here; an old token lives until its own expiry.',
      'The article is about JWT structure, signing algorithms or OAuth flows. Tokens are only numbered.',
      'The point is how the token leaked or how to detect theft. The leak is one fixed event at 40 s.',
    ],

    contrastWith: [
      {
        concept: 'tokenBearer',
        note: 'That the server checks only the token, never the sender, is the premise. Given that premise, lifetime is the only lever left, and it trades the leaked token\'s usefulness against how often the legitimate client must reissue.',
      },
      {
        concept: 'statelessNeedsToken',
        note: 'Sending a credential with every request is why a server can recognize a client at all. How long that credential should stay valid is a different decision, weighed against theft.',
      },
      {
        concept: 'dns',
        note: 'Both set a lifetime on something handed out and pay on two sides for it. A DNS TTL trades stale answers against query load; a token lifetime trades a thief\'s window against reissue load.',
      },
    ],
  },
};
