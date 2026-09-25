/**
 * storeAndForward 개념 선언.
 *
 * canonical facet 은 `facet:storeAndForward` — `mina@a.example` 이 0 분에 `smtp.a.example` 에 메일을 제출하고,
 * 받는 서버 `mx.b.example` 은 12 분 전까지 연결을 받지 않는다. 시도 1(0 분) · 2(5 분) 실패, 보내는 쪽은 1 분에 떠나고,
 * 시도 3(15 분)에 `250` 이 와서야 대기열의 사본이 지워진다. 30 분에 `jun@b.example` 이 우편함을 연다.
 *
 * ── 묶음 안에서의 자리
 *
 * 버린 토픽 smtp 의 조각이라 완제품 `networkLayer` 묶음에 든다(판정 기록: "홉마다 온전히 받아 두었다 넘기는 같은 원리의
 * 응용판"). 이웃 `hopByHop` 은 패킷이 틱마다 링크를 이어 쓰는 빠름을 말한다. 이쪽의 주장은 **맡는 곳은 한 번에 하나,
 * 다음 곳이 받았다고 답하기 전에는 지우지 않는다** — 빠름이 아니라 사라지지 않음이다. 그래서 definition 은 mail ·
 * responsibility · `250` · queue · retries · offline 쪽 낱말을 쥐고, 링크 · 틱 · 겹침 · 머리는 쓰지 않는다.
 * 다시 해 보는 간격이 벌어지는 모양은 이 개념의 말이 아니다.
 *
 * 전제 (설명 글 `storeAndForward.md` 가 밝힌 것): 주소 · 이름 · 기다림 5 · 10 · 20 · 40 분은 예로 정한 값(실제 서버는
 * 며칠에 걸쳐 다시 해 보고 반송한다) · 메시지는 보낸 순간 닿는다 · 받는 서버는 받자마자 우편함에 넣는다 · IMAP · POP 은
 * "우편함을 연다" 사건 하나 · `MAIL FROM` 등 명령 대화는 보이지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const storeAndForwardConcept: FacetConceptSource = {
  id: 'storeAndForward',
  label: 'Store and Forward: Mail Waits in a Queue Until 250',
  canonicalFacet: 'facet:storeAndForward',

  surface: {
    definition:
      'In email relay exactly one server is responsible for a message at any time, and it deletes its copy only after the next server replies 250, so mail waits in a queue and retries through outages.',
    exemplarKeywords: [
      'SMTP relay',
      'mail queue',
      '250 OK',
      'mail server down',
      'deferred delivery',
      'MTA retry',
      'why email arrives after the sender goes offline',
      'handoff of responsibility',
      'MX server unreachable',
      'asynchronous delivery',
    ],
  },

  briefing: {
    observable: [
      'Three horizontal bands — Sender (`mina@a.example`), Sending server (`smtp.a.example`, with its Queue) and Receiving server (`mx.b.example`, with the Mailbox of `jun@b.example`) — on a time axis in minutes, 0 to 30. A bar on a band marks the time that place is holding the mail. It starts with "The mail is written and waiting at the sender."',
      'Minute 0: the mail is submitted to `smtp.a.example` — `250 OK` — and the holding bar moves from Sender to Sending server. The same minute, "Attempt 1: connection failed. The mail stays in the queue." with "Next attempt: minute 5". The receiving server is marked "Refusing connections" until minute 12.',
      'Minute 1: "The sender goes offline." The sender band is marked Offline; the bar on the sending server continues.',
      'Minute 5: attempt 2 fails, next attempt minute 15. Minute 15: "Attempt 3: 250 OK. Only now is the queue copy deleted." with "Time in queue: 15 min".',
      'Minute 30: "The recipient opens the mailbox." and "Mails in mailbox: 1 · Sender offline for: 29 min". Three attempts, two 250 replies (submission and relay). The holding bars never break.',
      'All addresses and names are examples, as are the waits of 5, 10, 20 and 40 minutes; real servers space retries differently and keep trying for days before bouncing. Messages arrive instantly, the receiving server delivers straight to the mailbox, and reading the mailbox (IMAP or POP) is a single event. The SMTP command dialogue is not part of the run. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one event per step in time order, and stops when the recipient opens the mailbox.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip to minute 5 holds the moment when the sender is gone, the receiver is refusing, and the mail sits only in the sending server’s queue.',
      ],
    },

    useWhen: [
      'The reader wonders where an email is while the recipient’s server is down and the sender has closed the laptop, and needs an unbroken chain of custody shown on a timeline.',
      'An article explains why SMTP waits for a 250 reply before deleting anything, and wants the moment the queue copy is removed tied to that reply.',
    ],

    avoidWhen: [
      'The topic is the shape of retry intervals, exponential backoff or retry storms. The waits are fixed example values and their growth is not the point.',
      'The subject is packet forwarding inside a network or link-level timing. The units here are whole mail messages between servers, minutes apart.',
      'The article is about the SMTP command sequence, authentication or spam filtering. Only acceptance and failure of each handoff appear.',
    ],

    contrastWith: [
      {
        concept: 'hopByHop',
        note: 'Packet forwarding also holds a whole unit before passing it on, but to keep consecutive links busy and cut delay. Mail relay holds it to guarantee someone always has a copy, and accepts minutes of delay for that.',
      },
      {
        concept: 'networkLayer',
        note: 'Receiving fully before passing on is the common rule. Packet delivery uses it to overlap transmission and weighs packet count against header cost; mail relay uses it to survive a node being down.',
      },
    ],
  },
};
