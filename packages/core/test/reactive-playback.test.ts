/**
 * reactive 메커니즘이 "나아가는 중 · 멈춤 · 입력 대기" 셋을 가르는가.
 *
 * `onRunningChange` 는 오래도록 **알고리즘 함수가 실행 중인가** 만 말했다.
 * 조각은 그것으로 충분했다 — 재생·한 걸음 단추를 쓰지 않으니까. 그런데 조작을
 * 받는 완제품의 알고리즘은 `waitForInput` 에서 영영 돌아오지 않으므로 그 값이
 * 늘 참이었고, control-bar 의 재생·한 걸음이 **마운트 순간부터 끝까지 꺼져**
 * 있었다.
 *
 * 완제품 셋을 서로 못 보는 자리에서 만들었더니 셋 다 이 자리에 걸렸고, 둘이
 * 각자 다른 우회를 냈다(facet 고유 액션으로 갈아 끼우기 / 그냥 감수하기).
 * 같은 결함을 셋이 독립으로 만났다는 것이 규범이 아니라 코어가 문제라는 증거였다.
 *
 * 눈으로는 못 잡는다 — 타입도 통과하고 예외도 안 나며, 단추가 꺼져 있는 것은
 * "아직 준비가 안 됐나 보다" 로 읽힌다. 그래서 여기서 잰다.
 *
 * **`onControl` 로 부른다. `stop()` 을 직접 부르지 않는다.** 처음에 그렇게 짰다가
 * 구멍을 통째로 지나쳤다 — `start`/`stop`/`step` 을 제대로 구현해 놓고도 `onControl`
 * 이 그 셋을 `dispatch` 로 흘려보내고 있어서, 단추를 눌러도 알고리즘의 입력 큐에
 * `{type:'play'}` 가 쌓일 뿐이었다. 메서드를 직접 부르는 검사는 그것을 못 본다.
 * 재는 자리는 **단추가 실제로 지나는 길**이어야 한다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { ReactiveMechanism } from '../src/runtime/mechanism.js';
import { controlBarView } from '../src/views/index.js';
import { mountView } from '../src/runtime/layout-builder.js';
import type { MechanismHooks } from '../src/runtime/mechanism.js';
import type { ProjectorInstance } from '../src/runtime/projector.js';
import type { ReactiveContext } from '../src/runtime/context.js';

const idle = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * 훅이 낸 신호를 그대로 쌓아 둔다. control-bar 가 보는 것과 같은 것이다.
 *
 * 마지막 값만 봐서는 모자란다 — 입력을 받아 잠깐 나아갔다가 곧바로 다시 기다리는
 * 왕복이 한 틱 안에 끝나기 때문이다. 이력을 남겨 그 왕복이 실제로 있었는지 본다.
 */
type Spy = {
  hooks: MechanismHooks;
  running: boolean | null;
  complete: boolean | null;
  completeLog: boolean[];
};

function spy(): Spy {
  const rec: Spy = {
    running: null,
    complete: null,
    completeLog: [],
    hooks: {},
  };
  rec.hooks = {
    onRunningChange(running) {
      rec.running = running;
    },
    onComplete(complete) {
      rec.complete = complete;
      rec.completeLog.push(complete);
    },
  };
  return rec;
}

const noopProjector: ProjectorInstance = { async onEvent() {} };

describe('reactive 의 세 상태', () => {
  it('걸음을 잇는 동안은 나아가는 중이고, 입력을 기다리면 그렇지 않다', async () => {
    const rec = spy();
    let stepsTaken = 0;
    const m = new ReactiveMechanism(async (ctx: ReactiveContext) => {
      for (let i = 0; i < 3; i += 1) {
        if (!(await ctx.sleep(20))) return;
        stepsTaken += 1;
      }
      // 자동 재생이 끝나고 조작을 기다린다.
      for (;;) {
        if (ctx.cancelled) return;
        await ctx.waitForInput();
      }
    });
    m.init(noopProjector, { stepMs: 20 }, { hooks: rec.hooks });

    await idle(10);
    expect(rec.running, '마운트 직후에는 나아가는 중이다').toBe(true);

    await idle(200);
    expect(stepsTaken).toBe(3);
    expect(rec.running, '입력을 기다리는 동안은 나아가지 않는다').toBe(false);
    expect(rec.complete, '되돌리기 말고는 누를 것이 없는 상태다').toBe(true);

    // 위젯 입력이 오면 잠깐 나아갔다가 다시 기다린다.
    const seen = rec.completeLog.length;
    m.dispatch({ type: 'threshold', payload: 0.8 });
    await idle(30);
    expect(
      rec.completeLog.slice(seen),
      '입력을 받으면 끝난 상태가 한 번 풀렸다가 다시 걸린다',
    ).toEqual([false, true]);

    void m.destroy();
  });

  it('멈추면 걸음이 서고, 이으면 다시 간다', async () => {
    const rec = spy();
    let steps = 0;
    const m = new ReactiveMechanism(async (ctx: ReactiveContext) => {
      for (;;) {
        if (!(await ctx.sleep(20))) return;
        steps += 1;
      }
    });
    m.init(noopProjector, {}, { hooks: rec.hooks });

    await idle(120);
    const before = steps;
    expect(before, '스스로 나아가고 있어야 한다').toBeGreaterThan(1);

    m.onControl('pause'); // 단추가 지나는 실제 경로
    await idle(30); // 걸음의 경계까지 간다
    expect(rec.running, '멈추면 나아가는 중이 아니다').toBe(false);
    const paused = steps;
    await idle(120);
    expect(steps, '멈춘 동안은 한 걸음도 더 가지 않는다').toBe(paused);

    m.onControl('play');
    await idle(120);
    expect(rec.running, '이으면 다시 나아간다').toBe(true);
    expect(steps, '이은 뒤에는 걸음이 는다').toBeGreaterThan(paused);

    void m.destroy();
  });

  it('한 걸음 단추는 딱 한 걸음만 나아간다', async () => {
    const rec = spy();
    let steps = 0;
    const m = new ReactiveMechanism(async (ctx: ReactiveContext) => {
      for (;;) {
        if (!(await ctx.sleep(20))) return;
        steps += 1;
      }
    });
    m.init(noopProjector, {}, { hooks: rec.hooks });

    await idle(60);
    m.onControl('pause');
    await idle(40);
    const paused = steps;

    m.onControl('step');
    await idle(120);
    expect(steps - paused, '한 걸음만 간다').toBe(1);
    expect(rec.running, '그 한 걸음 뒤에는 다시 멈춰 있다').toBe(false);

    m.onControl('step');
    await idle(120);
    expect(steps - paused, '또 누르면 또 한 걸음').toBe(2);

    void m.destroy();
  });

  it('멈춘 채 접어도 알고리즘이 돌아온다', async () => {
    // destroy 가 멈춤 대기를 안 풀면 `awaitResume` 에 매달린 알고리즘이 영영
    // 안 돌아온다. reset 에는 푸는 세 줄이 있고 destroy 에는 빠져 있었다.
    const rec = spy();
    let returned = false;
    const m = new ReactiveMechanism(async (ctx: ReactiveContext) => {
      for (;;) {
        if (!(await ctx.sleep(20))) break;
      }
      returned = true;
    });
    m.init(noopProjector, {}, { hooks: rec.hooks });
    await idle(60);
    m.onControl('pause');
    await idle(60);
    expect(returned, '아직 멈춰 있을 뿐이다').toBe(false);

    m.destroy();
    await idle(60);
    expect(returned, '접으면 돌아와야 한다').toBe(true);
  });

  it('멈춘 채 되돌려도 매달리지 않는다', async () => {
    const rec = spy();
    let steps = 0;
    const m = new ReactiveMechanism(async (ctx: ReactiveContext) => {
      for (;;) {
        if (!(await ctx.sleep(20))) return;
        steps += 1;
      }
    });
    m.init(noopProjector, {}, { hooks: rec.hooks });
    await idle(60);
    m.onControl('pause');
    await idle(40);
    const paused = steps;

    // 깨어날 길을 열어 주지 않으면 여기서 영영 돌아오지 않는다.
    await m.reset();
    await idle(120);
    expect(steps, '되돌린 뒤에는 다시 스스로 나아간다').toBeGreaterThan(paused);

    void m.destroy();
  });
});

describe('되감기와 위젯', () => {
  it('되감으면 슬라이더도 처음 자리로 돌아간다', () => {
    // 알고리즘만 되돌리고 위젯을 그대로 두면, 슬라이더는 15 를 가리키는데
    // 화면은 3 의 결과를 보이게 된다. 조작이 논증을 지는 완제품에서는 그
    // 어긋남 자체가 거짓말이다.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const sent: unknown[] = [];
    const instance = mountView(controlBarView, container, {
      config: {
        controls: [
          {
            widget: 'segmented-slider',
            action: 'k',
            name: 'k',
            segments: [
              { value: 1, label: { en: '1' } },
              { value: 3, label: { en: '3' }, default: true },
              { value: 15, label: { en: '15' } },
            ],
          },
        ],
      },
    } as never);

    const bar = instance as unknown as {
      resetInputs?(): void;
      onAction?(fn: (action: string, payload?: unknown) => void): void;
    };
    // control-bar 는 dispatch 가 아니라 onAction 채널로 낸다 — 러너가 그것을
    // 받아 mechanism.onControl 로 넘긴다.
    bar.onAction?.((action, payload) => sent.push({ action, payload }));
    const track = container.querySelector('[role="slider"]') as HTMLElement | null;
    expect(track, '슬라이더가 떠 있어야 한다').not.toBeNull();
    expect(track?.getAttribute('aria-valuenow'), '기본은 두 번째 칸').toBe('1');

    // 마지막 칸으로 옮긴다 (키보드 경로가 실제 사용자 경로 중 하나다).
    track?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(track?.getAttribute('aria-valuenow'), '옮겨졌다').toBe('2');
    const afterMove = sent.length;
    expect(afterMove, '옮기면 알고리즘에 알린다').toBeGreaterThan(0);

    bar.resetInputs?.();
    expect(track?.getAttribute('aria-valuenow'), '되감으면 처음 자리로').toBe('1');
    expect(
      sent.length,
      '되감기는 값만 돌린다 — 여기서 또 보내면 그 걸음이 두 번 세어진다',
    ).toBe(afterMove);

    instance.destroy?.();
    container.remove();
  });

  it('되감으면 값 입력칸도 처음 자리로 돌아간다', () => {
    // 슬라이더만 되돌리면 값 입력칸이 낡은 채 남고, 그 뒤 facet 고유 button 이
    // 보내는 payload(`{...inputState}`)까지 거짓이 된다.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = mountView(controlBarView, container, {
      config: {
        controls: [{ widget: 'value-input', action: 'seed', name: 'seed', default: '42' }],
      },
    } as never);

    const bar = instance as unknown as { resetInputs?(): void };
    const input = container.querySelector('input[data-input-name="seed"]') as HTMLInputElement | null;
    expect(input, '입력칸이 떠 있어야 한다').not.toBeNull();
    expect(input?.value).toBe('42');

    input!.value = '99';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input?.value).toBe('99');

    bar.resetInputs?.();
    expect(input?.value, '되감으면 처음 값으로').toBe('42');

    instance.destroy?.();
    container.remove();
  });
});
