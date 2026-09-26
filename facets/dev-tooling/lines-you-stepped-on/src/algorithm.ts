/**
 * lines-you-stepped-on — 시험 하나가 코드를 지나가며 밟은 줄마다 표시가 쌓인다.
 *
 * 대상 함수 `total(list)` 를 TS 로 옮겨 실제로 돌리고, 줄마다 밟은 자리를 적는다.
 * 줄 번호는 화면 코드의 맨 윗줄을 1 로 센다. `function` 정의 줄은 세지 않는다.
 * `for each` 줄은 항목을 하나 꺼낼 때마다 한 번 밟힌다 (더 꺼낼 것이 없음을 확인하는 밟음은 세지 않는다).
 *
 * 이벤트
 *   step   { line: number; count: number; marked: number }
 *          실행 자리가 줄 `line` 을 밟았다. 그 줄의 표시는 이제 `count`, 표시가 1 이상인 줄은 `marked`.
 *          silent 아님.
 *   tally  { marked: number; counted: number; returned: number; unmarked: number[] }
 *          끝 걸음 — 표시가 있는 줄 수와 센 줄 수. `returned` 는 시험이 돌려받은 값,
 *          `unmarked` 는 한 번도 밟히지 않은 센 줄. silent 아님.
 *
 * 걸음 0 은 장면의 initial() 이 코드 줄에서 채운다 (init 이벤트 없음).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LinesYouSteppedOnFacetData = {
  type: 'lines-you-stepped-on';
  /** 화면 코드 — 번역하지 않는 자료. 줄 번호는 1 부터. */
  code: string[];
  /** 시험이 넘기는 목록 */
  input: number[];
  stepMs: number;
};

/** 대상 함수의 각 문이 화면 코드의 몇째 줄이고, 그 줄이 무엇으로 시작해야 하는가. */
const LINE = {
  init: { n: 2, head: 'let sum' },
  each: { n: 3, head: 'for each' },
  check: { n: 4, head: 'if x < 0' },
  bad: { n: 5, head: 'throw BadValue' },
  add: { n: 6, head: 'sum = sum + x' },
  ret: { n: 7, head: 'return sum' },
} as const;

class BadValue extends Error {}

/** 좁히개 — 모양이 어긋나면 무엇이 어긋났는지 담아 던진다. */
export function narrowLinesData(raw: unknown): LinesYouSteppedOnFacetData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('lines-you-stepped-on: initialData 가 객체가 아니다');
  }
  const r = raw as Record<string, unknown>;
  const code = r.code;
  const input = r.input;
  const stepMs = r.stepMs;
  if (!Array.isArray(code) || !code.every((l) => typeof l === 'string')) {
    throw new Error('lines-you-stepped-on: code 는 글자 줄의 목록이어야 한다');
  }
  if (!Array.isArray(input) || !input.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error('lines-you-stepped-on: input 은 수의 목록이어야 한다');
  }
  if (typeof stepMs !== 'number' || !(stepMs > 0)) {
    throw new Error('lines-you-stepped-on: stepMs 는 양수여야 한다');
  }
  return {
    type: 'lines-you-stepped-on',
    code: code.slice() as string[],
    input: input.slice() as number[],
    stepMs,
  };
}

/** 센 줄 — `function` 정의 줄을 뺀 모든 줄의 번호 (1 부터). */
export function countedLines(code: readonly string[]): number[] {
  const out: number[] = [];
  code.forEach((text, i) => {
    if (!text.trim().startsWith('function ')) out.push(i + 1);
  });
  return out;
}

/** 시험의 글자 — 정의 줄에서 함수 이름을 읽어 `total([3, 5])` 꼴로 만든다. */
export function callText(code: readonly string[], input: readonly number[]): string {
  const first = code[0];
  const m = first === undefined ? null : /^function\s+([A-Za-z_]\w*)\(/.exec(first.trim());
  if (m === null || m[1] === undefined) {
    throw new Error('lines-you-stepped-on: 줄 1 이 function 정의 줄이 아니다');
  }
  return `${m[1]}([${input.join(', ')}])`;
}

/** 표시용 백분율 — 소수 없이, 0.5 는 올림. 정수로 셈해 부동소수 끝자리를 피한다. */
export function percentOf(num: number, den: number): number {
  if (!(den > 0)) throw new Error('lines-you-stepped-on: 센 줄이 없다');
  return Math.floor((200 * num + den) / (2 * den));
}

/** 화면 코드가 옮겨 둔 대상 함수와 줄마다 맞는지 본다 — 어긋나면 줄 번호를 담아 던진다. */
function checkCode(code: readonly string[]): void {
  for (const { n, head } of Object.values(LINE)) {
    const text = code[n - 1];
    if (text === undefined || !text.trim().startsWith(head)) {
      throw new Error(`lines-you-stepped-on: 줄 ${n} 이 "${head}" 로 시작하지 않는다`);
    }
  }
}

/** 대상 함수 — `hit` 로 밟은 줄을 적는다. */
function total(list: readonly number[], hit: (line: number) => void): number {
  hit(LINE.init.n);
  let sum = 0;
  for (const x of list) {
    hit(LINE.each.n);
    hit(LINE.check.n);
    if (x < 0) {
      hit(LINE.bad.n);
      throw new BadValue('BadValue');
    }
    hit(LINE.add.n);
    sum = sum + x;
  }
  hit(LINE.ret.n);
  return sum;
}

/** 시험을 돌려 밟은 차례와 돌려받은 값을 셈한다. */
export function runTest(data: LinesYouSteppedOnFacetData): { trail: number[]; returned: number } {
  checkCode(data.code);
  const counted = countedLines(data.code);
  const trail: number[] = [];
  let returned: number;
  try {
    returned = total(data.input, (line) => {
      if (!counted.includes(line)) {
        throw new Error(`lines-you-stepped-on: 줄 ${line} 은 센 줄이 아니다`);
      }
      trail.push(line);
    });
  } catch (e) {
    if (e instanceof BadValue) {
      throw new Error('lines-you-stepped-on: 시험이 BadValue 로 떨어졌다 — 이 조각은 값을 돌려받는 시험만 그린다');
    }
    throw e;
  }
  return { trail, returned };
}

export async function linesYouSteppedOn(
  context: FacetContext<LinesYouSteppedOnFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<LinesYouSteppedOnFacetData>;
  const data = narrowLinesData(ctx.data);
  const stepMs = data.stepMs;
  const counted = countedLines(data.code);
  const { trail, returned } = runTest(data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const marks = new Map<number, number>(counted.map((n) => [n, 0]));

  // 걸음 0 에 이미 코드가 서 있다 — 첫 밟음 앞에도 읽을 틈을 둔다.
  for (const line of trail) {
    if (!(await pause())) return;
    const was = marks.get(line);
    if (was === undefined) throw new Error(`lines-you-stepped-on: 줄 ${line} 의 표시 칸이 없다`);
    marks.set(line, was + 1);
    const marked = [...marks.values()].filter((v) => v > 0).length;
    await ctx.emit({ type: 'step', payload: { line, count: was + 1, marked } });
  }

  if (!(await pause())) return;
  const unmarked = counted.filter((n) => marks.get(n) === 0);
  await ctx.emit({
    type: 'tally',
    payload: {
      marked: counted.length - unmarked.length,
      counted: counted.length,
      returned,
      unmarked,
    },
  });
}
