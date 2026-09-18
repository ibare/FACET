/**
 * 한 박자에 둘 — 순서대로 내는 이중 발행 기계가 어느 박자에 명령어 둘을 함께 내는가.
 *
 * 규약: 박자마다 아직 안 낸 것 중 맨 앞 하나를 낸다. 그다음 것이 그 맨 앞 것의 결과
 * 레지스터를 읽지 않으면 함께 낸다. 앞 박자에 낸 것의 결과는 다음 박자에 쓸 수 있으므로
 * (포워딩, 지연 1) 짝 안의 의존만 따진다.
 *
 * 이벤트 (모두 걸음이다. silent 없음):
 *   init  { instrs: { op: string; dest: string; srcs: string[] }[] }
 *         명령어 줄을 세운다. 글자를 풀어 연산 · 결과 레지스터 · 읽는 레지스터로 나눈 것
 *   pair  { head: number; next: number | null; hits: number[] }
 *         문 앞 두 자리에 선 둘을 견준다. next 가 null 이면 뒤에 선 것이 없다.
 *         hits 는 next 의 읽는 레지스터 가운데 head 의 결과 레지스터와 같은 것의 자리
 *   issue { beat: number; ids: number[] }
 *         beat 번째 박자에 ids 가 문을 지나 들어간다 (하나 또는 둘)
 *   done  { beats: number; serial: number }
 *         쓴 박자 수와, 하나씩 냈다면 걸렸을 박자 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DualIssueFacetData = {
  type: 'dual-issue';
  /** 어셈블리 표기 명령어. 순서가 곧 프로그램 순서다 */
  program: string[];
  stepMs: number;
};

export type DualIssueInstr = { op: string; dest: string; srcs: string[] };

/** `add r1, r2, r3` → 연산 add · 결과 r1 · 읽는 것 r2 r3 */
function parse(line: string): DualIssueInstr {
  const trimmed = line.trim();
  const space = trimmed.indexOf(' ');
  const op = space < 0 ? trimmed : trimmed.slice(0, space);
  const operands = space < 0 ? [] : trimmed.slice(space + 1).split(',').map((s) => s.trim());
  return { op, dest: operands[0] ?? '', srcs: operands.slice(1) };
}

export async function dualIssue(context: FacetContext<DualIssueFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<DualIssueFacetData>;
  const stepMs = ctx.data.stepMs;
  const instrs = ctx.data.program.map(parse);
  const n = instrs.length;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({ type: 'init', payload: { instrs } });

  let front = 0;
  let beat = 0;
  while (front < n) {
    if (!(await pause())) return;
    const head = front;
    const next = head + 1 < n ? head + 1 : null;
    const dest = instrs[head]!.dest;
    const hits =
      next === null
        ? []
        : instrs[next]!.srcs.flatMap((reg, i) => (reg === dest ? [i] : []));
    await ctx.emit({ type: 'pair', payload: { head, next, hits } });

    if (!(await pause())) return;
    const ids = next !== null && hits.length === 0 ? [head, next] : [head];
    beat += 1;
    await ctx.emit({ type: 'issue', payload: { beat, ids } });
    front += ids.length;
  }

  if (!(await pause())) return;
  await ctx.emit({ type: 'done', payload: { beats: beat, serial: n } });
}
