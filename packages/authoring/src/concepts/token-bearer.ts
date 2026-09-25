/**
 * tokenBearer 개념 선언.
 *
 * canonical facet 은 `facet:tokenBearer` — 발급 서버가 토큰 `mF_9.B5f-4.1JqM`(주체 `u42` · 만료 t=300)을 앱에 건넨다.
 * t=10 앱이 `198.51.100.7` 에서 요청해 200, t=40 사본이 훔친 쪽으로 넘어가고(앱도 그대로 쥔다), t=60 훔친 쪽이
 * `203.0.113.66` 에서 같은 요청을 보내 200. 문이 읽은 것은 두 번 모두 같은 토큰 하나. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `auth` 는 이 조각이 미룬 만료를 손잡이로 돌려 훔친 쪽 통과와 발급 수를 맞바꾼다. 응용 쪽 `statelessNeedsToken` 은 서버가
 * 요청을 잇지 않아 표를 싣고 온다는 말이다. 이쪽의 주장은 하나 — **문은 표만 보고, 누가 어디서 보냈는지는 판정에 들지 않는다.**
 * 그래서 definition 은 whoever presents · sender · address · copy passes 쪽 낱말을 쥐고, lifetime · reissue · session table ·
 * cookie 를 쓰지 않는다. 보안 분야 CSRF 개념(`cookie-rides-along`)은 아직 선언되지 않아 잇지 않았다.
 *
 * 전제 (설명 글 `tokenBearer.md` 가 밝힌 것): 토큰 문자열은 RFC 6750 본보기 값 · 주소는 문서용 대역 · 서명 검증 대신 발급 기록
 * 조회 · 어떻게 샜는지는 그리지 않는다 · 시계는 모두 같다 · 만료 두 걸음은 화면에서 뺐다(설명 글이 말로만 밝힌다).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const tokenBearerConcept: FacetConceptSource = {
  id: 'tokenBearer',
  label: 'Bearer Token: The Server Checks the Token, Not the Sender',
  canonicalFacet: 'facet:tokenBearer',

  surface: {
    definition:
      'A bearer token authorizes whoever presents it: the API server checks only that the token is on record and unexpired, never who sent it or from which address, so a copied token passes exactly like the original.',
    exemplarKeywords: [
      'bearer token',
      'Authorization: Bearer',
      'RFC 6750',
      'OAuth access token',
      'stolen API token',
      'token replay from another IP',
      'possession equals permission',
      'API key leaked in logs',
      'sender-constrained token',
      'token in URL risk',
    ],
  },

  briefing: {
    observable: [
      'Four roles — Issuer, App (`198.51.100.7`), Thief (`203.0.113.66`), API server. The API server keeps "Issued tokens": `mF_9.B5f-4.1JqM` · "Subject: u42 · Expires: t=300 s". "Nobody holds a token yet."',
      't = 0 s: "The issuer hands a token to App."',
      't = 10 s: "Request from App, address 198.51.100.7. The door reads the token." When the request reaches the wall, only the token text drops through to the door; the part naming the sender stays outside. "Status: 200 · on record · time left: 290 s".',
      't = 40 s: "A copy of the token passes from App to Thief. App still holds it." — "Holders: 2".',
      't = 60 s: the thief sends the same request from `203.0.113.66`. "Status: 200 · on record · time left: 240 s".',
      'The table under the wall lists what the door read — From, Token the door read, Status — with two rows: different addresses, the same token string, 200 both times.',
      'The token string is the RFC 6750 example; addresses are documentation ranges. The server looks the token up in its issue record rather than verifying a signed token; how the copy leaked is not shown; all clocks agree. Expiry exists but no request reaches it. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, four steps after the opening scene, and stops after the thief\'s request.',
        'A Replay button and a playback strip sit below it. After the run, dragging between step 2 and step 4 compares the app\'s and the thief\'s requests: only the address differs, and it never reaches the door.',
        'Token, addresses and times are fixed, so every status line can be quoted as shown.',
      ],
    },

    useWhen: [
      'The reader assumes an API somehow knows the token came from its rightful owner; the thief\'s request from another address getting the same 200 shows that possession is all it checks.',
      'An article explains why bearer tokens must travel only over TLS and stay out of logs and URLs, and needs the concrete case of a copy working exactly like the original.',
    ],

    avoidWhen: [
      'The subject is choosing a token lifetime or how often to refresh. Expiry is on record but never reached.',
      'The article is about JWT signature verification, OAuth grant flows or proof-of-possession tokens.',
      'The point is cookies being sent automatically by a browser, as in CSRF. The token is placed in each request by the client that holds it.',
    ],

    contrastWith: [
      {
        concept: 'auth',
        note: 'That the server accepts any holder is the weakness. Limiting a leaked token by its lifetime is the response, and it costs the legitimate client more frequent reissues.',
      },
      {
        concept: 'statelessNeedsToken',
        note: 'A server that keeps no state needs each request to carry a credential. This claim adds that the credential alone decides access, so carrying it is the same as being entitled.',
      },
    ],
  },
};
