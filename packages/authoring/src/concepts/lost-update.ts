/**
 * lostUpdate 개념 선언.
 *
 * canonical facet 은 `facet:lostUpdate` — 공유 값 `balance` 200. A 는 `let mine = balance` · `balance = mine + 100`,
 * B 는 `+ 50`. 차례 A · B · A · B: 둘 다 200 을 읽고, A 가 300 을 쓰고, B 가 옛 200 에 50 을 더한 250 으로 300 을 덮는다.
 * 끝에 "Left: 250 · Should be: 350 · Lost: 100". 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `mutex` 는 몫이 차례를 만들고 덮는 자리가 몫을 따라 옮겨 가는 것을 본다. 이쪽은 **덮는 쓰기 하나** —
 * 옛 값으로 셈한 쓰기가 남이 더한 몫을 표시 없이 지운다 — 를 쥔다. 그래서 definition 은 stale · overwrites ·
 * deposit · short by exactly 를 독점하고, 몫 · 자물쇠 · 세 걸음(register)은 쓰지 않는다.
 *
 * 전제 (설명 글 `lostUpdate.md`): CPU 하나 · 한 걸음 한 줄 · 한 줄은 쪼개지지 않는다고 친다. 차례는 예로 하나 정했다
 * (가능한 여섯 가운데 넷이 한쪽을 잃는다). 코드는 가상 표기.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lostUpdateConcept: FacetConceptSource = {
  id: 'lostUpdate',
  label: 'Lost Update (A Stale Read Overwrites Another Write)',
  canonicalFacet: 'facet:lostUpdate',

  surface: {
    definition:
      'When two threads both read a shared balance before either writes it back, the later write is computed from a stale value and silently overwrites the earlier deposit, leaving the total short by exactly that amount.',
    exemplarKeywords: [
      'lost update',
      'race condition example',
      'bank account race',
      'read then write race',
      'stale read',
      'overwritten write',
      'two deposits one lost',
      'check-then-act',
      'last writer wins',
    ],
  },

  briefing: {
    observable: [
      'Thread A runs `let mine = balance` then `balance = mine + 100`; thread B runs the same two lines ending `+ 50`. Each thread has its own `mine`; the shared `balance` starts at 200.',
      'The order is fixed as A, B, A, B. A reads: A\'s `mine` is 200. B reads: B\'s `mine` is also 200 — A has not written yet.',
      'A writes 200 + 100 = 300; `balance` becomes 300.',
      'B writes its own `mine` 200 + 50 = 250, and 250 is laid over 300. B\'s arithmetic is right; the 200 it used was read before A\'s write. The covered 300 is marked "covered" and nothing else records it.',
      'In the last step the stacked values are spread out: "Left: 250 · Should be: 350 · Lost: 100" — the lost amount is exactly A\'s deposit, and "Should be" is what running A to the end and then B would give.',
      'One CPU runs one line per step and each line is treated as indivisible. The order is one example chosen in advance; of the six possible orders, four lose one deposit. The code uses a small language-neutral notation. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the four lines and the comparison by itself and stops on "Lost: 100".',
        'A Replay button and a playback strip sit below it. Holding B\'s write shows 250 landing on top of 300.',
      ],
    },

    useWhen: [
      'The article explains the classic lost update — two deposits, one vanishes — and needs the stale read and the silent overwrite shown with concrete numbers.',
      'A reader believes a race produces garbage or an error; here each thread computes correctly and the damage is a quietly missing deposit.',
    ],

    avoidWhen: [
      'The article is about how often a race occurs under different schedules. Only one order is played.',
      'The subject is database transactions and isolation levels specifically. This is two threads and a variable, with no transactions or commits.',
      'The point is the register-level steps of an increment. Each line here is treated as indivisible.',
    ],

    contrastWith: [
      {
        concept: 'nonAtomicIncrement',
        note: 'The three-step increment exposes the gap; the lost update is the damage done when another thread\'s read and write fall into it.',
      },
      {
        concept: 'mutex',
        note: 'A lost update is one overwrite in one order; the mutex question is which schedules produce such overwrites and whether a lock removes them under every schedule.',
      },
      {
        concept: 'criticalSection',
        note: 'The lost update is the failure; marking the read through the write as one critical section is the boundary that prevents it.',
      },
    ],
  },
};
