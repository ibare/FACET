/**
 * shadowing 개념 선언.
 *
 * canonical facet 은 `facet:shadowing` — `let level = 1` · `if level > 0` · (몸) `let level = 2` ·
 * `level = level + 10` · `show level` · (몸 밖) `show level`. 안쪽 `let` 이 같은 이름의 새 자리를 바깥 자리 앞에
 * 세워 가리고, 몸 안의 읽기 · 쓰기는 모두 안쪽에 닿는다 (2 → 12). 몸을 벗어나 안쪽이 걷히면 같은 이름이 바깥
 * 1 에 닿는다. 출력 12 · 1. 걸음 일곱 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (변수와 타입 — 몸 · 틀 셋)
 *
 * "same name · hides · inner declaration · reappears" 를 이쪽이 독점한다. 이름이 통째로 사라져 부를 수 없는
 * 것은 `scopeExit` 에, 틀이 걷힌 자리를 주소가 가리키는 것은 `danglingReference` 에 두고 block · gone · error ·
 * pointer · frame 을 definition 에서 쓰지 않는다.
 *
 * 전제: 코드는 어느 한 언어도 아닌 표기다. 블록 스코프 `let` 은 자바스크립트 · 자바 · C# · 러스트 · 스위프트가
 * 공유하지만, 자바와 C# 은 지역 변수를 안쪽에서 같은 이름으로 다시 선언하는 것을 컴파일 단계에서 막는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shadowingConcept: FacetConceptSource = {
  id: 'shadowing',
  label: 'Variable Shadowing (Hidden, Then Revealed)',
  canonicalFacet: 'facet:shadowing',

  surface: {
    definition:
      'Reusing an outer variable\'s identifier for a new declaration in a nested scope hides the original: lookups and writes there resolve to the newer one, and the original, still unmodified, reappears once control exits that scope.',
    exemplarKeywords: [
      'variable shadowing',
      'shadowed variable',
      'same variable name in nested scope',
      'inner let hides outer variable',
      'name lookup finds the nearest declaration',
      'redeclaring a variable inside an if block',
      'why did my outer variable not change',
      'Rust shadowing with let',
      'no-shadow lint rule',
      'lexical scope resolution',
    ],
  },

  briefing: {
    observable: [
      'The program is `let level = 1`, then `if level > 0` with a body of `let level = 2`, `level = level + 10`, `show level`, and finally `show level` outside the body. On the right a name tag `level` casts a line of sight along which its slots stand; slots for deeper bodies stand nearer the tag.',
      '`let level = 1` sets up the outer slot. `if level > 0` looks along the line, stops at the first slot it reaches (the outer 1) and is true.',
      'Inside the body `let level = 2` sets up a second slot with the same name in front of the outer one. The outer slot falls into shadow, marked "hidden", and the caption says it still holds 1.',
      '`level = level + 10` reads and writes the slot in front: 2 becomes 12 while the outer slot behind still holds 1. The `show level` inside the body prints 12.',
      'Leaving the body lifts the inner slot away and the shadow clears. The last `show level` now reaches the outer slot and prints 1. The outer value is 1 from the first line to the last.',
      'Output 12, then 1. Seven steps in all, counting the start. The code is written in a small language-neutral notation — `let`, `if`, `show`, indentation for bodies — rather than in any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays the program by itself and stops after printing 1.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the inner `let` holds the outer slot going into shadow.',
        'The program and its values are fixed.',
      ],
    },

    useWhen: [
      'A reader added `let` inside a block meaning to update the outer variable and it stayed the same. The outer 1 sitting in shadow while the inner one becomes 12 shows the second variable they created.',
      'The article explains that name lookup takes the nearest declaration, and wants a lookup that stops at different slots before and after the body.',
    ],

    avoidWhen: [
      'The subject is using a variable after the block that declared it, where no outer variable of that name exists. Here the name is still valid after the body.',
      'The article is about Java or C#, where this exact redeclaration is rejected at compile time.',
      'The point is class fields hidden by parameters or locals, or method overriding. Only two local variables in nested bodies appear here.',
    ],

    contrastWith: [
      {
        concept: 'scopeExit',
        note: 'Both end an inner declaration at the end of its body. When an outer variable of the same name exists the name falls back to it; when none exists the name stops meaning anything at all.',
      },
      {
        concept: 'closureCaptures',
        note: 'Both depend on which declaration a name resolves to. Shadowing is about the nearest one winning inside a scope; capture is about an inner function continuing to use an outer variable after its scope has ended.',
      },
    ],
  },
};
