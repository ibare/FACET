/**
 * integerOverflow 개념 선언.
 *
 * canonical facet 은 `facet:integerOverflow` — 그릇 막대 · 걸음 칸 · 값 읽기의 세
 * 층으로, 자라는 수열의 항을 하나씩 담다가 넘치는 자리를 보이는 완결형이다.
 * 손잡이 둘이 논증을 진다 — 비트 폭 4 · 8 · 16 · 32 와 수열 두 가지. 계기 둘
 * (버틴 걸음 · 담는 최대값) 이 나란히 서서 "그릇을 키우는 것은 답이 아니다" 를
 * 수로 말한다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 조각 둘이 같은 비트 사건을 다루므로 definition 의 주어를 셋 다 달리 세웠다.
 *
 *   이 개념          **셈이 폭을 넘어서는 일**. 어디서 넘는지가 폭에 달렸고,
 *                    넘은 뒤로도 아무 일 없이 계속된다. 주어는 자라는 계산이다.
 *   signedWraparound **값의 집합이 고리라는 사실**. 가장 큰 수의 다음 자리가
 *                    가장 작은 수다. 주어는 계산이 아니라 범위의 짜임이다.
 *   silentTruncation **좁은 그릇으로 옮기는 일**. 연산이 아니라 대입·변환에서
 *                    윗자리가 떨어져 나간다. 주어는 옮김이다.
 *
 * 앞의 둘이 가장 붙는다. 그래서 이 개념은 **과정**(수열이 자라다 벽에 닿기까지,
 * 걸음의 수가 폭에 따라 어떻게 달라지는가) 을 가져가고, 벽이 실은 이음매라는
 * **사실** 은 signedWraparound 에 넘긴다. 그래서 keywords 는 폭 고르기 · 자료형
 * 넓히기 · 검사 연산 어휘를 갖고, 고리 · 끝과 끝 어휘는 쓰지 않는다.
 *
 * avoidWhen 이 막아야 하는 것: definition 에 "overflow" 가 있는 한 스택 오버플로 ·
 * 버퍼 오버플로 · 부동소수점 오버플로 글이 반드시 걸린다. 셋 다 다른 사건이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const integerOverflowConcept: FacetConceptSource = {
  id: 'integerOverflow',
  label: 'Integer Overflow (A Growing Value Outgrows Its Width)',
  canonicalFacet: 'facet:integerOverflow',

  surface: {
    definition:
      'A computed value passing the largest integer its fixed width holds, where the width alone decides at which step that happens and the computation continues with the wrong value, raising nothing.',
    exemplarKeywords: [
      'integer overflow',
      'arithmetic overflow',
      'the result exceeded the maximum for the type',
      'INT_MAX and 2147483647',
      'a counter that goes wrong after enough additions',
      'factorial grows too fast for an int',
      'switching to a 64-bit integer',
      'long long instead of int',
      'checked arithmetic and overflow-checked operations',
      'testing for overflow before the multiplication',
      'signed overflow is undefined behavior',
      'how many terms a type can hold',
      'choosing the width of an integer variable',
      'a total that quietly stops being right',
    ],
  },

  briefing: {
    observable: [
      'A horizontal bar stands for the container and a heavy vertical line marks its right edge as a rim; the line above it states the width and the largest value it holds, as in "Signed 4-bit holds at most 7".',
      'Each term that fits raises the filled portion of the bar toward the rim, and the step below it turns into a filled cell; the cells are spaced for the full run in advance, so nothing shifts as terms accumulate.',
      'On the overflowing term the bar fills completely in the alarm colour, a triangle juts out past the rim, and that one step cell grows taller than its neighbours and takes the same colour.',
      'The readout names the sequence and the term in its own notation — 4! or F6 — and prints the value in large monospace; after the overflow the number printed there is the value the machine is actually left with, not the true one.',
      'The closing captions give both numbers and then a verdict: "Step 6 overflows. True value 720, what remains -48", followed by either "A positive number turned negative." or "The number suddenly got smaller.", and once the run has finished, "Nothing warned you."',
      'Two counters sit side by side in the control bar, "Steps that fit" and "Holds at most", and moving the width from 4 to 32 takes the second from 7 to 2,147,483,647 while the first moves only from 3 to 12 on the factorial — the two numbers are on screen together, which is the whole of the argument about widening.',
      'Changing either handle restarts the run immediately: the bar empties, the cells clear, and the terms land again under the new width, so the step at which the rim is reached can be watched moving.',
      'The two sequences reach the rim at very different steps under the same width — the factorial holds twelve terms at thirty-two bits where the Fibonacci holds forty-six — so the rate of growth is visible as a distance along the row of cells.',
      'The code panel highlights the line matching the running phase, and the code it prints tests whether the next term would pass the limit — dividing before it multiplies, subtracting before it adds — rather than computing the term and inspecting the result.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider.',
        'A four-way bit width control set to 4, 8, 16 and 32 is the handle that carries the argument — press one and the same sequence is replayed into a different container.',
        'A two-way control chooses the sequence, Factorial or Fibonacci, so the same width can be shown against multiplicative and additive growth.',
        'The code panel starts empty with an "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; two can sit side by side.',
        'The two sequences and the four widths are the whole of what can be set, so an article can name any of the eight runs and quote the step at which it overflows.',
      ],
    },

    useWhen: [
      'The article proposes a wider type as the fix and the reader takes that for a solution rather than a delay. The two counters moving together — the capacity multiplied three hundred million times, the run extended by nine steps — is the answer, and it is a measurement rather than an assertion.',
      'The prose says an overflowed result is "wrong" and the reader pictures a value that is merely too large or slightly off. A factorial arriving at -48, and a thirteen-factorial arriving at a smaller positive number than the twelfth, is the correction: the result is not inaccurate, it is impossible.',
      'The reader expects the machine to report the moment a value stops fitting, and the run has to finish with nothing having been reported — which is what makes a check written before the operation the only place the fault can be caught.',
      'The article needs the rate of growth and the size of the container to be two separate things: switching sequences under a fixed width moves the failure by dozens of steps without touching the container at all.',
      'A specific number is needed to anchor a claim about a fixed-width type — the largest value a width holds, or the step at which a named sequence leaves it — and it can be read off the screen rather than asserted.',
    ],

    avoidWhen: [
      'The subject is stack overflow — recursion that never bottoms out, a call stack exhausted, StackOverflowError, raising the thread stack size. That is memory reserved for calls running out, not a number leaving its width, and it does announce itself.',
      'The subject is a buffer overflow or overrun — writing past the end of an array or buffer, smashing the stack, overwriting a return address, the exploit class built on it. Nothing here is written to memory and nothing is attacked; the fault is arithmetic.',
      'The subject is floating-point overflow, where a value past the format range becomes infinity, or the loss of precision that comes with rounding to the nearest representable value. That is a different failure with a different result, and no value here is a float.',
      'The article uses "overflow" for a container that is full — a queue dropping messages, a pool with no free entries, a layout clipping its contents.',
      'The subject is a value being moved into a narrower container by an assignment or a cast. No conversion happens here; every value is computed inside the width that holds it, until it is not.',
      'The point is that the two ends of the range are adjacent — that the value after the largest is the smallest. This screen stops at the first term that does not fit and reports what is left, rather than making a claim about the shape of the range.',
      'The subject is what a bit pattern already written denotes, which place weighs negative, or how a value is widened into more places. No bit pattern appears here; every value on screen is decimal.',
      'The article is about writing a number in another base or reading hexadecimal.',
      'The subject is a sequence for its own sake — how the factorial or the Fibonacci numbers are defined, what they count, how fast they grow in mathematics. They are here only as values that eventually do not fit.',
    ],

    contrastWith: [
      {
        concept: 'signedWraparound',
        note: 'Both start from the width being finite, but this one is about a computation crossing the boundary — where it crosses depends on the width and on how fast the value grows — while that one is about the boundary itself being a join, with the largest value and the smallest adjacent.',
      },
      {
        concept: 'silentTruncation',
        note: 'Both end with a value the width cannot hold, but here it is arithmetic that produces the value and the container never changes, whereas there the arithmetic is already done and the loss happens in the move from a wider container to a narrower one.',
      },
      {
        concept: 'twosComplement',
        note: 'That one fixes which values a width can denote at all; this one takes that set as given and asks what a computation does when its result is outside it.',
      },
      {
        concept: 'negateAndAddOne',
        note: 'Both are arithmetic that runs out of places. There the departure past the top position is the proof that the procedure worked; here the same departure means the answer no longer refers to the quantity that was being counted.',
      },
      {
        concept: 'floatingPoint',
        note: 'Two ways of running out of room: a format that trades exactness for reach keeps a nearby value and stays usable, while a fixed integer width keeps a value with no relation to the true one.',
      },
      {
        concept: 'outOfBounds',
        note: 'Two faults that share the word overflow and almost nothing else — one is an index landing on memory that belongs to something else, this one is a number passing the largest its own type can hold, with no memory involved.',
      },
    ],
  },
};
