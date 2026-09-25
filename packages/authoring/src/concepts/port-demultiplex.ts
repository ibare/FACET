/**
 * portDemultiplex 개념 선언.
 *
 * canonical facet 은 `facet:portDemultiplex` — 받는 호스트 `192.0.2.10` 의 문 하나로 조각 다섯이 들어와, 문 안 갈림목에서
 * 받는 포트(80 · 22 · 25)가 같은 길을 따라 웹 서버 · SSH 서버 · 메일 서버로 갈라진다. 받은 칸의 점 색이 보낸 주소라,
 * 같은 곳에서 온 것이 여러 응용으로 흩어지고 다른 곳에서 온 것이 한 응용에 모이는 것이 보인다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 카탈로그 정리로 transport-layer 토픽이 `tcpHandshake`(완제품)에 합쳐지며 이 조각이 그 묶음에 들었다. 완제품은
 * 두 전송 방식의 값을 견주고 연결 소켓의 네 짝 열쇠를 곁들인다. 이쪽은 **받는 포트 하나로 응용을 고른다** 만 쥔다.
 * 그래서 definition 은 destination port · listening · one IP address · whatever the sender 를 독점하고, 신뢰 · 차례 ·
 * 연결은 쓰지 않는다.
 *
 * 전제 (설명 글 `portDemultiplex.md`): 가르는 열쇠를 받는 포트 하나로 줄였다(응용마다 듣는 소켓 하나). 실제 TCP 연결
 * 소켓은 보낸 주소 · 포트까지 열쇠로 쓴다. UDP 와 TCP 의 다름은 다루지 않는다. 주소는 문서용 대역.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const portDemultiplexConcept: FacetConceptSource = {
  id: 'portDemultiplex',
  label: 'Port Demultiplexing (Destination Port Picks the Application)',
  canonicalFacet: 'facet:portDemultiplex',

  surface: {
    definition:
      'A host reached at one IP address hands each arriving segment to the application listening on its destination port, so one sender can reach several applications and several senders can reach one.',
    exemplarKeywords: [
      'port number',
      'destination port',
      'demultiplexing',
      'multiplexing and demultiplexing',
      'well-known ports',
      'port 80',
      'port 22',
      'port 25',
      'listening socket',
      'many services on one IP address',
      'how does the OS know which program gets the packet',
    ],
  },

  briefing: {
    observable: [
      'The receiving host `192.0.2.10` is a box with one door on its left wall. Inside, the path forks into three, each branch labelled with the port it takes: Web server 80, SSH server 22, Mail server 25. The first caption reads "Apps listening at 192.0.2.10: 3".',
      'Five segments enter one at a time, stop at the fork, and follow the branch whose port matches their destination port: "Segment 1: destination port 80 → Web server", then 25 → Mail server, 22 → SSH server, 80 → Web server, 22 → SSH server.',
      'Each application\'s received box keeps where every segment came from, with one dot colour per sending address. At the end the web server has 2, the SSH server 2 and the mail server 1.',
      'The three segments from `198.51.100.7` split between the web server and the SSH server, because their destination ports differ. The two at the web server came from two different addresses, `198.51.100.7` and `203.0.113.5`, because their destination port is the same.',
      'The key is reduced to the destination port alone, as if each application had a single listening socket; the addresses are documentation ranges. Real TCP connections also use the sender\'s address and port to tell connections to the same port apart, and nothing here distinguishes TCP from UDP. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays the five segments by itself and stops once all are delivered.',
        'A Replay button and a playback strip sit below it. The end state is the one to hold: the dot colours in the three received boxes show one sender spread over two applications and one application fed by two senders.',
        'Ports, addresses and the segment order are fixed, so every routing line can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article explains how one server machine runs a web server, SSH and mail on a single IP address without their traffic mixing.',
      'A reader assumes the sender\'s address decides which program gets a packet. The same sender reaching two applications, and two senders reaching one, shows the destination port decides.',
    ],

    avoidWhen: [
      'The subject is network address translation rewriting ports on the way through a router. Ports here are only read, never changed.',
      'The article is about per-connection sockets keyed by four values, or load balancing connections across workers. Every application here has one listening socket.',
      'The subject is firewall rules or port scanning. No segment is filtered or refused.',
    ],

    contrastWith: [
      {
        concept: 'rewriteAddressPort',
        note: 'Both read ports, for opposite purposes. Demultiplexing uses the destination port to pick a local application and leaves it untouched; address translation rewrites ports so many private hosts can share one public address.',
      },
      {
        concept: 'tcpHandshake',
        note: "Delivering by destination port is the whole key for connectionless traffic. A connection-oriented transport adds the sender's address and port to that key, one of the differences that come with reliability.",
      },
      {
        concept: 'sendAndForget',
        note: 'Reaching the right application is handled by the port. Whether the datagram reached it at all is a separate matter that the port does nothing to settle.',
      },
    ],
  },
};
