/**
 * lockOrdering 개념 선언.
 *
 * canonical facet 은 `facet:lockOrdering` — 자물쇠 m1 ~ m4 가 번호 차례로 층을 이루고, 스레드 넷이 둘씩 쓴다
 * (A m1 · m2 · B m2 · m3 · C m3 · m4 · D m4 · m1). 처음 쓰인 프로그램에서 D 만 높은 번호를 먼저 잡는다 — 규칙을 걸면
 * D 의 두 잡기 줄이 자리를 바꾼다. 그 뒤 스무 틱: D · A · B 가 잠들며 기다림 화살이 모두 위를 향하고, 맨 위의 C 가
 * 끝나 넘겨주기가 위층에서 아래층으로 내려온다. 끝난 차례 C · B · A · D. 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `deadlock` 은 번호 차례를 손잡이로 켜서 몫 × 사이 일 스무 칸 모두에서 교착이 0 이 되는 것을 본다. 이쪽은
 * **왜 그런가** — 번호 차례로 잡는 스레드가 잠들 때 쥔 것은 모두 기다리는 것보다 낮아 화살이 위로만 뻗고, 그래서
 * 고리가 닫힐 수 없다 — 하나를 쥔다. 그래서 definition 은 increasing number · lower than · point upward ·
 * topmost finishes 를 독점하고, 몫 · 사이 일 · 모든 조합은 쓰지 않는다.
 *
 * 전제 (설명 글 `lockOrdering.md`): CPU 하나 · 한 틱 한 줄 · A B C D 차례 돌림 · 넘겨주기 규약. 규칙을 걸지 않은
 * 판은 설명 글이 말할 뿐 화면은 걸린 판만 돈다. 실제 커널은 번호 대신 주소나 등급으로 차례를 정하기도 한다.
 * 코드는 가상 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lockOrderingConcept: FacetConceptSource = {
  id: 'lockOrdering',
  label: 'Lock Ordering (Lower Number First, Waits Only Point Up)',
  canonicalFacet: 'facet:lockOrdering',

  surface: {
    definition:
      'If every thread takes its locks in increasing number, a sleeping thread holds only locks lower than the one it wants, so every wait points upward, no loop can close, and the topmost holder always finishes.',
    exemplarKeywords: [
      'lock ordering',
      'lock hierarchy',
      'acquire locks in a consistent order',
      'global lock order',
      'lock ranking',
      'lock address ordering',
      'breaking circular wait',
      'deadlock prevention rule',
      'lockdep',
    ],
  },

  briefing: {
    observable: [
      'Four locks stand as floors, m1 at the bottom to m4 at the top. Each thread has a column and a round marker on the highest floor it holds. A uses m1 and m2, B m2 and m3, C m3 and m4, D m4 and m1.',
      'The first step shows the program as written — "As written — higher number first: D", with D\'s `lock(m4)` before `lock(m1)`. The next step applies the rule: "Rule: every thread locks the lower number first. · D: m1 now comes before m4." and D\'s two lock lines swap places; releases stay in reverse order.',
      'Ticks 0 to 2: A takes m1, B takes m2, C takes m3. Tick 3: "D sleeps waiting for m1. Holder: A. · Holds: nothing". Tick 4: "A sleeps waiting for m2. Holder: B. · Holds: m1 · waits for: m2 — a higher number." Tick 5 does the same for B on m3. Each wait is a dotted arrow going up.',
      'The top thread, C, has no one above it: it takes m4 at tick 6, works at tick 7, releases m4 at 8, and at tick 9 "C releases m3. B wakes up holding it." Hand-offs then step down the floors — m2 from B to A, m1 from A to D.',
      'The run ends at tick 19: "D releases m1. No one is waiting for it. · All finished. Order: C · B · A · D".',
      'One CPU runs one line (or one blocked attempt) per tick, turning through A, B, C, D; a released lock goes straight to the first waiter. The version without the rule is not played — only its line order is shown. Real kernels may order locks by address or class instead of number. The code uses a small language-neutral notation. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen shows the rule being applied, plays the twenty ticks by itself, and stops once all four threads have finished.',
        'A Replay button and a playback strip sit below it. Holding tick 5 shows three sleeping threads with all their wait arrows pointing up and the top thread free to run.',
      ],
    },

    useWhen: [
      'The article recommends always acquiring locks in a fixed order and needs to show why that is sufficient: every wait points toward a higher lock, so the chain must end at a thread that can run.',
      'A reader sees three threads asleep at once and assumes deadlock; the upward arrows and the cascade of hand-offs down the floors show why this situation always resolves.',
    ],

    avoidWhen: [
      'The article needs a deadlock actually happening. Only the ordered program is played, and it finishes.',
      'The subject is comparing many schedules or measuring the cost of ordering. There is one schedule and no cost comparison.',
      'The point is deadlock detection or timeouts. The rule prevents the cycle; nothing is detected.',
    ],

    contrastWith: [
      {
        concept: 'waitCycle',
        note: 'A circular wait needs some wait that points back down to a lower lock; ordered acquisition makes every wait point up, so that closing wait cannot exist.',
      },
      {
        concept: 'deadlock',
        note: 'Lock ordering is justified by the direction of waits; deadlock as a whole is the timing-dependent hazard that this rule removes under every schedule without slowing anything down.',
      },
    ],
  },
};
