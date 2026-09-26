/**
 * relocateAddresses 개념 선언.
 *
 * canonical facet 은 `facet:relocateAddresses` — 오브젝트 파일 둘(app.o · lib.o)의 절이 @1000(text) · @2000(data)부터 이어
 * 놓이고, 재배치 항목 넷이 가리키는 주소 칸이 절대(S) · 상대(S − P)로 고쳐 적힌다. `call +0` → `call +12`
 * (1016 − 1004). 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `linker` 는 차례를 바꿔 놓기가 옮겨 가고 같은 칸의 수가 바뀌는 것을 본다. 형제 `resolveSymbols` 는 주소 없이
 * 이름만 잇는다. 이쪽은 **한 번의 놓기와 칸 고치기** — 0 부터 세던 자리가 실제 주소가 되고, 비어 있던 0 이 셈한 수로
 * 바뀐다. 그래서 definition 은 section placement · relocation entry · absolute · relative · field patch 쪽 낱말을 쥐고,
 * link order · library · undefined · waiting 을 넣지 않는다.
 *
 * 전제: 명령 4 바이트 · 놓는 자리 @1000 · @2000 은 예로 정한 값. 상대 거리는 명령 자기 주소(P)에서 잰다 — 실제 CPU 는
 * 대개 다음 명령에서 재서 −4 같은 덧셈이 붙는다. 명령은 가상 레지스터 기계의 교과서 표기다. 심볼이 어느 파일에 있는지는
 * 이미 풀려 있다(심볼 표가 주어진다).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const relocateAddressesConcept: FacetConceptSource = {
  id: 'relocateAddresses',
  label: 'Relocation: Patching Absolute and Relative Address Fields',
  canonicalFacet: 'facet:relocateAddresses',

  surface: {
    definition:
      'Once each file\'s sections, numbered from zero, are placed at final addresses, every relocation entry patches its instruction field with the symbol\'s address (absolute) or the distance from the instruction to it (relative).',
    exemplarKeywords: [
      'relocation',
      'relocation entry',
      'R_X86_64_PC32',
      'absolute vs PC-relative address',
      'text and data sections',
      'section placement',
      'offset from zero in an object file',
      'fixup',
      'S - P relocation formula',
      'ELF relocatable object',
    ],
  },

  briefing: {
    observable: [
      'Two "Object files" on the left, each with a text section and a data section counted from `+0`: `app.o` text `load r1, @0` · `call +0` · `store @0, r1` · `ret` (16 bytes) and data `count` (8 bytes); `lib.o` text `load r2, @0` · `mul r1, r1, r2` · `ret` (12 bytes) and data `limit` (4 bytes). The empty address fields are dashed; each carries a relocation note, `ABS` or `REL`, naming its symbol.',
      'The start caption reads "Each file counts from 0 · address fields still at 0: 4". "Memory" on the right starts text at @1000 and data at @2000.',
      'Steps 1–4 move sections into memory one at a time, text first: "Placed app.o text at @1000–@1015", `lib.o` text at @1016–@1027, `app.o` data at @2000–@2007, `lib.o` data at @2008–@2011. Symbol addresses follow as section start plus offset: `main` @1000, `scale` @1016, `count` @2000, `limit` @2008.',
      'Steps 5–8 patch one field each: `load r1, @0` → `load r1, @2000` ("Rewrote app.o+0 · absolute count: S = @2000"); `call +0` → `call +12` ("Rewrote app.o+4 · relative scale: S − P = 1016 − 1004 = +12"), with S and P marked; `store @0, r1` → `store @2000, r1`; `load r2, @0` → `load r2, @2008`.',
      'The two fields pointing at `count` both become 2000; the one relative field becomes 12; `mul` and `ret` point nowhere and are left alone. The run is nine steps.',
      'Four-byte instructions and the start addresses @1000 and @2000 are chosen for the example; the relative distance is measured from the patched instruction itself, whereas real CPUs usually measure from the next instruction. Which file defines each symbol is already settled. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself — four placing steps, then four patching steps — and stops when the last field is written.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip back to step 6 holds the S − P measurement for the `call` field.',
        'The files, layout and start addresses are fixed, so an article can quote every address and every patched value as shown.',
      ],
    },

    useWhen: [
      'The article explains why object files can all start at address zero and how the linker then fills in real addresses, and needs one absolute and one relative field worked out.',
      'A reader confuses absolute and PC-relative addressing, and the article wants both computed side by side from the same placement.',
    ],

    avoidWhen: [
      'The article is about link order, static libraries or undefined symbols. The layout is fixed and every symbol is known.',
      'The subject is virtual memory, page tables or address translation at run time. These addresses are fixed once by the linker.',
      'The point is position-independent code or dynamic relocation by a loader. Only static patching is shown.',
    ],

    contrastWith: [
      {
        concept: 'linker',
        note: 'Relocation from a given layout is a fixed computation. The linker claim is that the layout depends on input order, so the same fields end up with different values when files are reordered.',
      },
      {
        concept: 'resolveSymbols',
        note: 'Resolution only records which file defines a name. Relocation needs that answer and adds where the definition finally sits and what number goes into the instruction.',
      },
      {
        concept: 'indexAddressCalc',
        note: 'Both add an offset to a base address. Element addressing does it at run time for each access; relocation does it once at link time to fix constants inside instructions.',
      },
    ],
  },
};
