/**
 * 빈칸도 글자다 — 띄어쓰기가 조각에 붙어 다닌다.
 *
 * 낱말 앞의 빈칸을 글자 하나(▁)로 적으면, 그 표식이 뒤따르는 낱말에 달라붙어
 * 조각의 일부가 된다. 그 대가로 같은 낱말이 붙은 꼴과 안 붙은 꼴로 갈려 어휘에서
 * 자리를 각각 하나씩 차지한다.
 *
 * ── 이벤트 어휘 (facet 고유, C2)
 *
 *   sentence      {}                                  낱말을 놓고 사이의 빈칸 자리를 드러낸다
 *   mark-gaps     {}                                  빈칸 자리마다 표식을 하나씩 세운다
 *   attach        {}                                  표식이 뒤 낱말로 미끄러져 달라붙는다
 *   cut           { count: number }                   붙은 채로 문장을 조각낸다
 *   second-line   { count: number }                   둘째 문장도 같은 규칙으로 자른다
 *   shelf-spaced  { count: number }                   붙은 꼴이 어휘에 자리를 잡는다
 *   shelf-bare    { pairs: number }                   안 붙은 꼴이 자리를 하나 더 차지한다
 *   split-unseen  { token: string; parts: string[] }  한 번도 안 나온 꼴이 쪼개진다
 *   done          { vocab: number }                   어휘의 크기
 *   rewind        {}                                  한 걸음씩 보려고 처음으로 되감는다
 *
 * silent 인 이벤트는 없다. 열 가지 모두 화면이 바뀌는 걸음이다.
 *
 * ── 화면에 올리는 수는 전부 데이터에서 세어 낸다
 *
 * 조각 수 · 쌍 수 · 어휘 크기를 손으로 적지 않는다. `initialData` 의 낱말 목록에서
 * 세어 payload 에 싣는다 — 말뭉치가 바뀌면 화면의 수도 따라 바뀌어야 한다 (S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** `stepMs` 가 선언에 없을 때의 걸음 간격. */
const DEFAULT_STEP_MS = 800;

export type SpaceIsPartOfItData = {
  type: 'space-is-part-of-it';
  /** 빈칸 표식. SentencePiece 관행의 U+2581. */
  mark: string;
  /** 걸음 하나가 끝난 뒤의 정지 시간 (ms). */
  stepMs: number;
  /** 첫째 문장의 낱말. 맨 앞 낱말에는 표식이 붙지 않는다. */
  lineA: string[];
  /** 둘째 문장의 낱말. */
  lineB: string[];
  /** 어휘에 있는 '안 붙은 꼴' 의 낱말. */
  bareStems: string[];
  /** 어휘에 있는 '붙은 꼴' 의 낱말. 표식은 그림이 앞에 붙여 그린다. */
  spacedStems: string[];
  /** 말뭉치에 안 붙은 꼴로는 한 번도 나오지 않은 낱말. */
  unseen: string;
  /** 그 낱말이 쪼개져 나오는 조각. */
  unseenParts: string[];
};

export async function spaceIsPartOfItAlgorithm(
  base: FacetContext<SpaceIsPartOfItData>,
): Promise<void> {
  const ctx = base as ReactiveContext<SpaceIsPartOfItData>;
  const data = ctx.data;
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : DEFAULT_STEP_MS;

  /** 자동 재생을 한 번 마친 뒤부터는 손으로 넘긴다. */
  let manual = false;

  /** `advance` 가 올 때까지 기다린다. 취소로 깨어났으면 false. */
  async function waitAdvance(): Promise<boolean> {
    for (;;) {
      if (ctx.cancelled) return false;
      let input: ReactiveInputEvent;
      try {
        input = await ctx.waitForInput();
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
        // 올려 러너가 드러내게 둔다 (C8 정본).
        if (!ctx.cancelled) throw err;
        return false;
      }
      if (ctx.cancelled) return false;
      // 받은 것의 종류를 본다 — 위젯 입력이 붙어도 걸음으로 세지 않도록.
      if (input.type === 'advance') return true;
    }
  }

  /**
   * 걸음 사이의 문. 자동 재생 중에는 시간이, 손으로 넘길 때는 단추가 연다.
   *
   * 문은 걸음 *사이*의 것이라 첫 걸음 앞에는 두지 않는다 — emit 뒤에만 놓는다.
   * 마지막 걸음 뒤에도 두지 않는다. 거기서 기다리는 것은 바깥 루프의 몫이다.
   */
  async function gate(): Promise<boolean> {
    return manual ? waitAdvance() : ctx.sleep(stepMs);
  }

  /** 처음부터 끝까지 한 바퀴. 취소로 끊겼으면 false. */
  async function play(): Promise<boolean> {
    const cutCount = data.lineA.length;
    const secondCount = data.lineB.length;
    const spacedCount = data.spacedStems.length;
    const pairs = data.bareStems.filter((stem) => data.spacedStems.includes(stem)).length;
    const vocab = data.bareStems.length + data.spacedStems.length;

    await ctx.emit({ type: 'sentence' });
    if (!(await gate())) return false;

    await ctx.emit({ type: 'mark-gaps' });
    if (!(await gate())) return false;

    await ctx.emit({ type: 'attach' });
    if (!(await gate())) return false;

    await ctx.emit({ type: 'cut', payload: { count: cutCount } });
    if (!(await gate())) return false;

    await ctx.emit({ type: 'second-line', payload: { count: secondCount } });
    if (!(await gate())) return false;

    await ctx.emit({ type: 'shelf-spaced', payload: { count: spacedCount } });
    if (!(await gate())) return false;

    await ctx.emit({ type: 'shelf-bare', payload: { pairs } });
    if (!(await gate())) return false;

    await ctx.emit({
      type: 'split-unseen',
      payload: { token: data.unseen, parts: data.unseenParts },
    });
    if (!(await gate())) return false;

    await ctx.emit({ type: 'done', payload: { vocab } });
    return !ctx.cancelled;
  }

  for (;;) {
    if (!(await play())) return;
    // 다 보였다. 여기서부터는 누르는 사람의 속도로 간다.
    if (!(await waitAdvance())) return;
    manual = true;
    // 되감고 첫 걸음까지 간다 — 되감기만 하면 눌러도 반응이 없는 것으로 읽힌다.
    await ctx.emit({ type: 'rewind' });
    if (ctx.cancelled) return;
  }
}
