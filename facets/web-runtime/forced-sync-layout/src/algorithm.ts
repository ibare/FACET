/**
 * 강제 동기 레이아웃 — 쓰기로 더러워진 레이아웃을 읽기가 멈춰 세우고 다시 재게 한다.
 *
 * 코드 넷 줄(`for` 머리 · 읽기 · 쓰기 · 닫는 괄호)을 상자마다 한 바퀴 돈다. 레이아웃 상태는
 * 깨끗 / 더러움 둘이다. 쓰기는 더럽히기만 하고, 읽기는 더러우면 먼저 레이아웃을 돌린다.
 * 스크립트가 끝난 뒤 더러우면 프레임 레이아웃이 한 번 돈다.
 *
 * 이벤트 (모두 silent 아님 — 하나가 한 걸음이다):
 *   read    { box: string, value: number, line: number }
 *           `box.offsetWidth` 읽기. value 는 마지막 레이아웃이 잰 너비. line 은 읽기 줄 (0 부터).
 *           이 발신 때 레이아웃은 늘 깨끗하다 — 더러웠다면 바로 앞 걸음이 layout(forced) 이다.
 *   write   { box: string, width: number, line: number }
 *           `box.style.width = …` 쓰기. width 는 새로 적힌 너비(px). 레이아웃이 더러워진다.
 *   layout  { reason: 'forced' | 'frame', count: number, widths: number[], box: string | null, line: number | null }
 *           레이아웃 한 번 — 문서 전체를 다시 잰다. widths 는 잰 뒤의 너비(문서 차례).
 *           count 는 지금까지 돈 레이아웃 수. forced 면 box · line 은 기다리는 읽기의 상자와 줄,
 *           frame 이면 스크립트가 끝난 뒤라 둘 다 null.
 *
 * 걸음 0 은 장면의 initial() 이 initialData(코드 · 상자 · 너비)에서 세운다. 읽을 것이 있는
 * 화면이라 첫 발신 앞에 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ForcedSyncLayoutBox = { id: string; width: number };

export type ForcedSyncLayoutFacetData = {
  type: 'forced-sync-layout';
  stepMs: number;
  /** 화면에 그대로 뜨는 자바스크립트 줄 */
  code: string[];
  /** 문서 차례의 상자 — 식별자와 CSS 로 준 처음 너비(px) */
  boxes: ForcedSyncLayoutBox[];
};

/** 코드에서 읽어 낸 프로그램 — 읽기 줄 · 쓰기 줄 · 더하는 수. */
export type ForcedSyncLayoutProgram = {
  readLine: number;
  writeLine: number;
  add: number;
};

const LOOP_HEAD = /^for \(const box of boxes\) \{$/;
const READ = /^\s*const (\w+) = box\.offsetWidth;$/;
const WRITE = /^\s*box\.style\.width = \((\w+) \+ (\d+)\) \+ 'px';$/;
const LOOP_END = /^\}$/;

/**
 * 코드 줄을 프로그램으로 읽는다. 이 조각이 아는 모양은 넷뿐이다 — 루프 머리 · 읽기 · 쓰기 ·
 * 닫는 괄호. 그 밖의 줄, 빠진 줄, 차례가 틀린 줄은 줄 번호를 담아 던진다.
 */
export function parseForcedSyncLayoutProgram(code: readonly string[]): ForcedSyncLayoutProgram {
  if (code.length !== 4) {
    throw new Error(`forced-sync-layout: 코드는 네 줄이어야 한다 (받은 줄 ${code.length})`);
  }
  const [head, read, write, end] = code as [string, string, string, string];
  if (!LOOP_HEAD.test(head)) throw new Error(`forced-sync-layout: 줄 1 이 루프 머리가 아니다: ${head}`);
  const r = READ.exec(read);
  if (!r) throw new Error(`forced-sync-layout: 줄 2 가 offsetWidth 읽기가 아니다: ${read}`);
  const w = WRITE.exec(write);
  if (!w) throw new Error(`forced-sync-layout: 줄 3 이 style.width 쓰기가 아니다: ${write}`);
  if (w[1] !== r[1]) {
    throw new Error(`forced-sync-layout: 줄 3 이 읽지 않은 이름을 쓴다: ${w[1]} (읽은 이름 ${r[1]})`);
  }
  if (!LOOP_END.test(end)) throw new Error(`forced-sync-layout: 줄 4 가 닫는 괄호가 아니다: ${end}`);
  const add = Number(w[2]);
  if (!Number.isInteger(add)) throw new Error(`forced-sync-layout: 줄 3 의 더하는 수를 읽지 못했다: ${w[2]}`);
  return { readLine: 1, writeLine: 2, add };
}

export async function forcedSyncLayout(
  context: FacetContext<ForcedSyncLayoutFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<ForcedSyncLayoutFacetData>;
  const { stepMs, code, boxes } = ctx.data;
  const program = parseForcedSyncLayoutProgram(code);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 스타일에 적힌 너비와 마지막 레이아웃이 잰 너비. 처음 레이아웃은 깨끗하다 — 둘이 같다.
  const styled = boxes.map((b) => b.width);
  let measured = [...styled];
  let dirty = false;
  let layouts = 0;

  // 걸음 0 이 이미 읽을 화면이라 첫 걸음 앞에도 머문다.
  if (!(await pause())) return;

  for (let i = 0; i < boxes.length; i += 1) {
    if (ctx.cancelled) return;
    const box = boxes[i];
    if (!box) throw new Error(`forced-sync-layout: 상자 ${i} 가 없다`);

    // 읽기 — 더러우면 먼저 레이아웃을 강제한다. 읽기와 한 걸음에 섞지 않는다.
    if (dirty) {
      measured = [...styled];
      dirty = false;
      layouts += 1;
      await ctx.emit({
        type: 'layout',
        payload: { reason: 'forced', count: layouts, widths: [...measured], box: box.id, line: program.readLine },
      });
      if (!(await pause())) return;
    }

    const value = measured[i];
    if (value === undefined) throw new Error(`forced-sync-layout: ${box.id} 의 잰 너비가 없다`);
    await ctx.emit({ type: 'read', payload: { box: box.id, value, line: program.readLine } });
    if (!(await pause())) return;

    // 쓰기 — 더럽히기만 하고 멈추지 않는다.
    const width = value + program.add;
    styled[i] = width;
    dirty = true;
    await ctx.emit({ type: 'write', payload: { box: box.id, width, line: program.writeLine } });
    if (!(await pause())) return;
  }

  // 스크립트가 끝난 뒤 렌더 기회 — 더러우면 한 번.
  if (dirty) {
    measured = [...styled];
    dirty = false;
    layouts += 1;
    await ctx.emit({
      type: 'layout',
      payload: { reason: 'frame', count: layouts, widths: [...measured], box: null, line: null },
    });
  }
}
