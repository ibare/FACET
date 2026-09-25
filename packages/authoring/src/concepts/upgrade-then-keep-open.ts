/**
 * upgradeThenKeepOpen 개념 선언.
 *
 * canonical facet 은 `facet:upgradeThenKeepOpen` — `GET /chat HTTP/1.1` 이 `Upgrade: websocket` 을 들고 나가(157 바이트)
 * `HTTP/1.1 101 Switching Protocols`(129 바이트)가 돌아오면 같은 연결이 틀의 길로 바뀐다. 틀 넷(서버 셋 · 클라이언트 하나,
 * 28 · 33 · 21 · 31 바이트)이 오가는 동안 연결 1 · HTTP 요청 1 은 움직이지 않는다. 첫 틀은 서버가 먼저 보낸다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `http` 는 웹소켓을 폴링 간격 사다리의 끝값 하나로 두고 늦음과 바이트로 잰다. 이쪽의 주장은 하나 — **HTTP 요청 하나가
 * 101 을 받는 순간 같은 연결이 양쪽이 아무 때나 말하는 길로 바뀌고, 여는 값은 한 번만 치른다.** 그래서 definition 은
 * handshake · 101 · same connection · frame header · either side 쪽 낱말을 쥐고, polling · interval · delay 를 쓰지 않는다.
 *
 * 전제 (설명 글 `upgradeThenKeepOpen.md` 가 밝힌 것): `Sec-WebSocket-Key` 와 `Sec-WebSocket-Accept` 는 RFC 6455 의 예시 값(조각이
 * 셈하지 않는다) · 아래 TCP 연결은 이미 열려 있다 · 텍스트 틀뿐, 조각 나누기 · 닫기 틀 없음 · 짐 126 바이트 이상은 모형 밖.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const upgradeThenKeepOpenConcept: FacetConceptSource = {
  id: 'upgradeThenKeepOpen',
  label: 'WebSocket Upgrade: One Handshake, Then Frames Both Ways',
  canonicalFacet: 'facet:upgradeThenKeepOpen',

  surface: {
    definition:
      'The WebSocket opening handshake is one HTTP request with an Upgrade header answered by 101 Switching Protocols, after which the same connection carries small frames that either side may send unprompted.',
    exemplarKeywords: [
      'WebSocket handshake',
      'Upgrade: websocket',
      '101 Switching Protocols',
      'Sec-WebSocket-Accept',
      'RFC 6455',
      'WebSocket frame header size',
      'client-to-server masking key',
      'full-duplex connection',
      'server sends without a request',
      'persistent connection after upgrade',
    ],
  },

  briefing: {
    observable: [
      'A Client and a Server joined by one connection labelled `HTTP/1.1`. Three counters sit above: Connections 1, HTTP requests 0, Messages after the switch 0 ("The connection is open. Nothing has crossed it yet.").',
      'The request goes out as six header lines — `GET /chat HTTP/1.1`, `Host: ws.example.com`, `Upgrade: websocket`, `Connection: Upgrade`, `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==`, `Sec-WebSocket-Version: 13` — sized 157 bytes. HTTP requests becomes 1.',
      '`HTTP/1.1 101 Switching Protocols` comes back with `Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=`, 129 bytes. The caption says the same connection now follows the new rules, and the pipe widens into two lanes. "Opening, once (bytes): 286".',
      'The first frame after the switch comes from the server, unasked: `{"from":"jun","text":"hi"}`, 2 + 26 = 28 bytes. The server sends `{"from":"jun","text":"anyone?"}` (33) next.',
      'The client sends `{"text":"here"}` masked: its header is 6 bytes, so the frame is 21. The server\'s last frame is 31 bytes. "Frame headers so far (bytes)" ends at 12.',
      'Through all four frames Connections stays 1 and HTTP requests stays 1; Messages after the switch reaches 4.',
      'The key and Accept value are the example pair from RFC 6455 and are not computed here. The TCP connection underneath is assumed already open; only text frames, no fragmentation, and no close frame — the connection ends open. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one message per step, seven steps including the start, and stops after the fourth frame.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip back to the 101 response holds the moment the connection splits into two lanes before any frame has crossed.',
        'Handshake lines, payloads and byte counts are fixed, so each can be quoted as shown.',
      ],
    },

    useWhen: [
      'The reader thinks WebSocket is a separate connection or protocol opened from scratch; watching an ordinary HTTP request switch the very same connection with a 101 corrects that.',
      'The article claims WebSocket is lighter than repeated HTTP requests and needs concrete byte counts: 286 bytes to open once, then 2- or 6-byte headers per message.',
    ],

    avoidWhen: [
      'The subject is choosing between polling intervals, long polling or server-sent events. No alternative is weighed here.',
      'The article is about how Sec-WebSocket-Accept is computed with SHA-1, or about extensions and subprotocols.',
      'The point is the TCP three-way handshake. The TCP connection is taken as already open.',
    ],

    contrastWith: [
      {
        concept: 'http',
        note: 'How the switch happens is this claim. Whether it is worth making is another question, answered by comparing it with every polling interval on delay and overhead.',
      },
      {
        concept: 'requestResponse',
        note: 'In request-response every server message is paired with a question. The upgrade is itself one last such pair, and the rule of pairing ends with it.',
      },
      {
        concept: 'threeWaySync',
        note: 'Opening the TCP connection synchronizes two sequence numbers before any data moves. The WebSocket upgrade runs on top of a connection already open and changes the rules of what it carries.',
      },
    ],
  },
};
