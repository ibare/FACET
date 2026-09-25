/**
 * non-atomic-increment — `count = count + 1` 한 줄이 CPU 에서 세 걸음으로 펼쳐진다.
 *
 * 스레드는 하나(`thread`)다. 끼어드는 스레드는 없다. 기억 자리(`memory` 이름의 공유 값)는
 * 모두가 보고, 레지스터(`register` 이름)는 스레드의 것이다. 처음 레지스터는 비었다.
 *
 * 규약 (사양 그대로):
 *   - 펼친 줄(`steps`)은 적힌 차례로 한 걸음씩 실행한다.
 *   - 알아듣는 줄 모양은 셋뿐이다.
 *       `let <register> = <memory>`         읽기 — 기억 자리의 값을 레지스터로 베낀다
 *       `<register> = <register> + <정수>`  더하기 — 레지스터만 바뀐다
 *       `<memory> = <register>`             쓰기 — 레지스터의 값을 기억 자리로 베낀다
 *   - "틈" 은 펼친 줄 사이의 자리다 (줄 수 − 1). 이 조각은 틈을 보이기만 하고 아무도 끼우지 않는다.
 *   - 겉의 한 줄(`line`)은 `<memory> = <memory> + <정수>` 모양이어야 하고, 펼친 줄의 더하는 수와 같아야 한다.
 *   모르는 모양 · 읽기 전의 더하기 · 비어 있는 레지스터의 쓰기는 줄 번호를 담아 던진다.
 *
 * 이벤트 (모두 silent 아님):
 *   unfold  { kinds: ('load' | 'add' | 'store')[]; gaps: number }
 *           겉의 한 줄이 펼친 줄로 갈라진다. kinds 는 펼친 줄마다의 종류, gaps 는 틈 수
 *   load    { index: number; memory: number; register: number; differ: boolean }
 *   add     { index: number; memory: number; register: number; differ: boolean }
 *   store   { index: number; memory: number; register: number; differ: boolean }
 *           index 는 방금 실행한 펼친 줄(0 부터), memory · register 는 실행 뒤의 값,
 *           differ 는 두 곳의 값이 서로 다른가
 *
 * 걸음 0 은 장면의 initial() 이 겉의 한 줄과 처음 값으로 채운다 — 읽을 것이 있는 화면이라
 * 첫 발신 앞에 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NonAtomicIncrementFacetData = {
  type: 'non-atomic-increment';
  stepMs: number;
  thread: string;
  memory: string;
  register: string;
  start: number;
  line: string;
  steps: string[];
};

export type MicroKind = 'load' | 'add' | 'store';

type Micro =
  | { kind: 'load' }
  | { kind: 'add'; amount: number }
  | { kind: 'store' };

function escapeName(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 펼친 줄 하나를 읽는다. 모르는 모양은 줄 번호(1 부터)를 담아 던진다. */
function parseMicro(text: string, lineNo: number, memory: string, register: string): Micro {
  const m = escapeName(memory);
  const r = escapeName(register);
  const s = text.trim();
  if (new RegExp(`^let ${r} = ${m}$`).test(s)) return { kind: 'load' };
  const add = new RegExp(`^${r} = ${r} \\+ (\\d+)$`).exec(s);
  if (add) {
    const digits = add[1];
    if (digits === undefined) throw new Error(`non-atomic-increment: 줄 ${lineNo} 더하는 수를 읽지 못했다 — "${text}"`);
    return { kind: 'add', amount: Number(digits) };
  }
  if (new RegExp(`^${m} = ${r}$`).test(s)) return { kind: 'store' };
  throw new Error(`non-atomic-increment: 줄 ${lineNo} 모르는 모양 — "${text}"`);
}

/** 겉의 한 줄이 `<memory> = <memory> + <정수>` 인지 보고 더하는 수를 돌려준다. */
function parseLine(text: string, memory: string): number {
  const m = escapeName(memory);
  const hit = new RegExp(`^${m} = ${m} \\+ (\\d+)$`).exec(text.trim());
  const digits = hit?.[1];
  if (digits === undefined) throw new Error(`non-atomic-increment: 겉의 줄 모양을 모른다 — "${text}"`);
  return Number(digits);
}

export async function nonAtomicIncrement(
  context: FacetContext<NonAtomicIncrementFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<NonAtomicIncrementFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const outerAmount = parseLine(data.line, data.memory);
  const micros = data.steps.map((s, i) => parseMicro(s, i + 1, data.memory, data.register));
  const addTotal = micros.reduce((sum, mi) => (mi.kind === 'add' ? sum + mi.amount : sum), 0);
  if (addTotal !== outerAmount) {
    throw new Error(
      `non-atomic-increment: 펼친 줄이 더하는 수 ${addTotal} 가 겉의 줄 ${outerAmount} 와 다르다`,
    );
  }

  // 걸음 0 은 읽을 것이 있는 화면이다 — 첫 발신 앞에 틈을 둔다.
  if (!(await pause())) return;
  await ctx.emit({
    type: 'unfold',
    payload: { kinds: micros.map((mi) => mi.kind), gaps: micros.length - 1 },
  });

  let memory = data.start;
  let register: number | null = null;
  for (let index = 0; index < micros.length; index += 1) {
    if (!(await pause())) return;
    const mi = micros[index];
    if (mi === undefined) throw new Error(`non-atomic-increment: 줄 ${index + 1} 이 없다`);
    switch (mi.kind) {
      case 'load': {
        register = memory;
        await ctx.emit({
          type: 'load',
          payload: { index, memory, register, differ: memory !== register },
        });
        break;
      }
      case 'add': {
        if (register === null) {
          throw new Error(`non-atomic-increment: 줄 ${index + 1} 읽기 전에 레지스터를 더하려 한다`);
        }
        register = register + mi.amount;
        await ctx.emit({
          type: 'add',
          payload: { index, memory, register, differ: memory !== register },
        });
        break;
      }
      case 'store': {
        if (register === null) {
          throw new Error(`non-atomic-increment: 줄 ${index + 1} 빈 레지스터를 쓰려 한다`);
        }
        memory = register;
        await ctx.emit({
          type: 'store',
          payload: { index, memory, register, differ: memory !== register },
        });
        break;
      }
    }
  }
}
