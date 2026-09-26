/**
 * collision 개념 선언.
 *
 * canonical facet 은 `facet:collision` — 출력이 n 비트인 해시에서 겹침이 오는 세 거리(반드시 N+1 · 아무 짝의 처음 겹침 ·
 * 정해진 문서와 겹치는 시도)를 한 로그 축 위에 세운다. 손잡이 출력 폭 4 · 6 · 8 · 10 · 12 비트.
 *
 * ── 묶음 안에서의 자리
 *
 * 조각 `birthdayParadox` 는 자리 256 에서 짝이 불어나 15 번째에 겹치는 한 장면이고, 이미 있는 `pigeonholeCollision` 은
 * "반드시 있다" 한 장면이다. 이쪽은 **폭을 돌려 세 거리를 견주는 것**을 맡는다. 그래서 definition 은 output width ·
 * 2^n+1 · 2^(n/2) · fixed document / second preimage 를 쥐고, 조각이 독점한 pairs · quadratic · empty slots 와
 * pigeonhole 의 counting 을 쓰지 않는다.
 *
 * 전제 (설명 글 `collision.md`):
 *  - 해시는 장난감 H (상태 16 비트 · IV 6a09 · 덩어리 2 바이트 · 세 라운드) 이고 자리는 H(입력의 ASCII) 의 아래 n 비트.
 *    출력 폭 4 ~ 12 비트는 이 화면이 줄인 폭이다. 실물 SHA-256 은 아무 짝 약 2¹²⁸ · 정해진 문서 약 2²⁵⁶.
 *  - 흐름 이름 · 입력 이름 · 정해진 문서 · 시도 줄 이름은 예로 정한 것.
 *  - 장난감 H 는 고르지 않다 — 12 비트에서 `doc` 의 시도가 19287 로 튄다.
 *  - 조각 birthdayParadox 와 수가 다르다 (그쪽은 실제 SHA-256 의 마지막 바이트).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const collisionConcept: FacetConceptSource = {
  id: 'collision',
  label: 'Hash Collisions vs Output Width (Certain, Birthday, Second Preimage)',
  canonicalFacet: 'facet:collision',

  surface: {
    definition:
      'As a hash output widens from n bits, three distances separate: collision is certain by input 2^n + 1, any two inputs typically match near 2^(n/2), and matching one fixed document takes about 2^n tries.',
    exemplarKeywords: [
      'birthday attack',
      'second preimage',
      'collision resistance vs second preimage resistance',
      'birthday bound 2^(n/2)',
      'why SHA-256 gives 128-bit collision security',
      'hash output length and security',
      'truncated hash collisions',
      'how many hashes until a collision',
      'generic attack on hash functions',
    ],
  },

  briefing: {
    observable: [
      'One horizontal axis on a log scale, "inputs (log scale)", with ticks 1, 4, 16, 64 … up to 32768. A readout above it says "output 8 bits · slots N = 256". Five named streams — file, doc, img, log, msg — each have a row, plus an "average" row.',
      'First a marker lands at "must collide · N+1 = 257". Then a "50% · inputs 20" marker: at 20 inputs the chance that some pair shares a slot first reaches one half.',
      'Under "any pair: first collision", each stream feeds inputs file1, file2, … in order until one lands on a slot already taken: "file13 = file8 · same slot 88 · first collision at input 13", then doc at 39, img 24, log 16, msg 9. The average row settles at 20.2 with "N+1 ÷ avg ≈ 13".',
      'In the last step, under "fixed document: tries to match", all five streams at once keep altering their own document against a fixed one (file0, doc0, …) until the slot matches: filex165, docx117, imgx662, logx192, msgx29, average 233.0 against N = 256.',
      'Turning the width by two bits moves the N+1 marker four times further, two octaves, while the 50% marker and the first-collision average move about one octave. The ratio N+1 ÷ average reads 3, 7, 13, 31, 62 for 4, 6, 8, 10, 12 bits. The fixed-document average stays near N (at 12 bits it passes N+1, 8053.8).',
      'Individual streams do not always rise: msg first collides at `msg9 = msg4` at 6, 8 and 10 bits, and doc at 39 for 8, 10 and 12 bits, because a pair matching in the lower n bits of a wider width also matches at the narrower one. A stream that stays put keeps its dot in place. When the width changes, the previous round\'s positions remain as faint ticks and the new markers move from them.',
      'Four readouts under the controls: Slots N, Sure collision N+1, Inputs for 50%, and Inputs hashed (the sum of all first-collision counts and all fixed-document tries).',
      'The hash is a reduced 16-bit model and a slot is the lower n bits of its value; widths of 4 to 12 bits stand in for real outputs where any pair takes about 2^128 work for SHA-256 and a fixed document about 2^256. The reduced hash is not perfectly even — at 12 bits doc needs 19287 tries, about twice the average. Stream and document names are examples. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls plus one handle: an "Output bits" slider with segments 4, 6, 8 (default), 10, 12. Each round plays nine steps and then waits.',
        'The move that makes the idea land is stepping the width from 4 to 12 and watching the gap open: the N+1 marker races right while the first-collision average trails far behind it, and the fixed-document dots keep pace with N.',
        'A code panel labelled "Counting collisions" sits under the controls; the reader adds a language to see the counting code, one IR rendered in Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why a 256-bit hash is said to give only 128 bits of collision security, and needs the square-root distance and the full-width distance to diverge as the output grows.',
      'The reader confuses finding any colliding pair with forging a match for one given document; the two searches run side by side and land an order of magnitude apart already at 8 bits.',
    ],

    avoidWhen: [
      'The article is about collision handling inside a hash table — chaining, probing, load factor. Nothing here stores or retrieves anything.',
      'The subject is a specific cryptanalytic break of MD5 or SHA-1. Every search here is generic brute force against a reduced model.',
      'The point is how a hash reacts to a one-bit input change. Inputs here are only compared by the slot they land in.',
      'The article needs the actual collision probability for a real 256-bit hash. The widths go only to 12 bits.',
    ],

    contrastWith: [
      {
        concept: 'birthdayParadox',
        note: 'Pairs growing faster than inputs explains why the first repeat comes early at one fixed size. Varying the width turns that into a scaling law and sets it against the certain bound and the fixed-target search.',
      },
      {
        concept: 'pigeonholeCollision',
        note: 'Existence of a collision follows from counting alone. Once existence is granted, the question becomes how far one must actually go, which differs by orders of magnitude between any pair and a fixed target.',
      },
      {
        concept: 'easyOneWayHardBack',
        note: 'Being hard to reverse concerns recovering an input from an output. Collision distance concerns two inputs meeting on one output, and it arrives far sooner than any inversion.',
      },
      {
        concept: 'hashFixedLength',
        note: 'A fixed output width is what makes the slot count finite; the collision distances are consequences of that width and grow with it at two different rates.',
      },
      {
        concept: 'hashToBucket',
        note: 'Bucket assignment wants keys spread over few slots and treats a shared slot as routine. Here a shared slot is the adversary\'s goal and the width is chosen so that reaching it is expensive.',
      },
    ],
  },
};
