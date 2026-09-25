/**
 * rewriteAddressPort 개념 선언.
 *
 * canonical facet 은 `facet:rewriteAddressPort` — 두 기기 `192.168.0.23` · `192.168.0.42` 가 같은 포트 51000 에서
 * 같은 서버 `198.51.100.80:443` 으로 패킷을 하나씩 보낸다. 경계에서 보낸 이 주소 칸이 `203.0.113.5` 로, 보낸 이
 * 포트 칸이 40001 · 40002 로 갈리고, 받는 이 두 칸은 같은 세로줄에 그대로 선다. 걸음 일곱, 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `nat` 은 손잡이로 "주소만 바꾸면 몇 기기가 막히는가 · 낯선 이가 들어오는가" 를 견준다. 형제
 * `natMappingTable` 은 표에 적고 들어온 답을 되짚는다. 이쪽은 **나가는 패킷의 네 칸 가운데 어느 둘이 갈리는가**
 * 하나 — definition 은 sender address and sender port fields · replaced · destination fields pass unchanged 를
 * 쥐고, 표 · 답 · 들어옴 낱말을 쓰지 않는다.
 *
 * 전제: 공인 주소 · 40001 부터 차례 · 같은 포트 51000 은 예로 정한 값(사설 · 문서용 대역). 체크섬 다시 셈은
 * 그리지 않는다. 나가는 쪽만.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rewriteAddressPortConcept: FacetConceptSource = {
  id: 'rewriteAddressPort',
  label: 'NAT Rewrites Source Address and Port',
  canonicalFacet: 'facet:rewriteAddressPort',

  surface: {
    definition:
      'As a packet leaves a private network through NAT, its sender address and sender port fields are replaced with the public address and a fresh port, while the destination address and port pass through unchanged.',
    exemplarKeywords: [
      'source NAT',
      'SNAT',
      'NAT rewrites source IP',
      'private to public address',
      'port translation',
      'PAT',
      'two devices same source port',
      'which header fields NAT changes',
    ],
  },

  briefing: {
    observable: [
      'A packet header is drawn as four cells — sender address, sender port, receiver address, receiver port — with a Private side and a Public side separated by a NAT boundary holding `203.0.113.5` and a "Next port" counter starting at 40001.',
      'Two devices wait inside: "Waiting inside: 192.168.0.23:51000 · 192.168.0.42:51000". Both use sender port 51000 and send to `198.51.100.80:443`.',
      'For each packet there are three steps: "Packet 1 reaches the NAT boundary.", then "Sender address — out: 192.168.0.23, in: 203.0.113.5", then "Sender port — out: 51000, in: 40001 · Leaves as 203.0.113.5:40001 → 198.51.100.80:443".',
      'The receiver cells stay in the same vertical column with the same values from private side to public side; only the two sender cells change border as they are swapped.',
      'The second packet leaves as `203.0.113.5:40002`. Both packets now share one address and are told apart only by port. Seven steps in all, and the counter ends at 40003.',
      'The public address, sequential ports from 40001 and the shared 51000 are example values from private and documentation ranges. Checksum recalculation is not drawn, and only the outbound direction appears.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, three steps per packet, and stops after the second packet leaves.',
        'A Replay button and a playback strip sit below it. Dragging back to the address step of packet 2 shows the moment both packets would carry 51000 if the port were left alone.',
        'Addresses and ports are fixed, so every before-and-after value can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces NAT and needs to show exactly which fields of an outgoing packet change and which do not.',
      'A reader asks why NAT changes the port as well, and the article wants two devices with the same source port leaving distinguishable only by the new port.',
    ],

    avoidWhen: [
      'The article is about how replies find their way back inside. The return direction is not shown.',
      'The subject is destination NAT or port forwarding to an internal server. Only sender fields are rewritten here.',
      'The point is whether outsiders can reach inside devices. No inbound packet appears.',
    ],

    contrastWith: [
      {
        concept: 'natMappingTable',
        note: 'Rewriting the sender fields is what happens on the way out; recording that change and reversing it for replies is what makes the rewrite usable.',
      },
      {
        concept: 'nat',
        note: 'Replacing both sender fields is one choice; rewriting only the address instead lets just one host at a time use the public address.',
      },
    ],
  },
};
