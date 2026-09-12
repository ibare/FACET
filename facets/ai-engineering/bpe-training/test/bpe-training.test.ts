// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  ReactiveInputEvent,
  ViewInstance,
} from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  getProjector,
  registerBuiltinViews,
  registerProjector,
  runFacet,
} from '@ffacet/core/runtime';
import {
  bpeTraining,
  bpeTrainingFacet,
  bpeTrainingIRs,
  bpeTrainingProjector,
  registerBpeTraining,
  splitToSymbols,
  trainBpe,
  type BpeTrainingData,
  type StageRankRow,
  type StageRule,
  type StageWord,
} from '../src/index.js';

/**
 * 사양의 실측표. 호스트가 BPE 를 실제로 돌려 잰 값이고, 다섯 손잡이 값이 다섯 가지
 * 다른 병합 차례를 낸다는 것이 이 완제품의 주장이다.
 */
const SPEC: Record<number, string[]> = {
  2: ['i+n(27)', 'g+_(14)', 'in+g_(14)', 'in+k(9)', 'ink+_(9)', 'k+ing_(6)'],
  5: ['i+n(30)', 'g+_(17)', 'in+g_(17)', 'in+k(9)', 'ink+_(9)', 'k+ing_(6)'],
  8: ['i+n(33)', 'g+_(20)', 'in+g_(20)', 'in+k(9)', 'ink+_(9)', 's+ing_(8)'],
  12: ['i+n(37)', 'g+_(24)', 'in+g_(24)', 's+ing_(12)', 'in+k(9)', 'ink+_(9)'],
  18: ['i+n(43)', 'g+_(30)', 'in+g_(30)', 's+ing_(18)', 'in+k(9)', 'ink+_(9)'],
};

/** 다 돌고 난 뒤의 분할. 손잡이가 8 에 닿아야 `sing` 이 통째가 된다. */
const SPLITS: Record<number, Record<string, string>> = {
  2: { sing: 's ing_', ring: 'r ing_', king: 'king_', sink: 's ink_', kind: 'k in d _' },
  8: { sing: 'sing_', ring: 'r ing_', king: 'k ing_', sink: 's ink_', kind: 'k in d _' },
  18: { sing: 'sing_', ring: 'r ing_', king: 'k ing_', sink: 's ink_', kind: 'k in d _' },
};

const END = '</w>';
const show = (token: string): string =>
  token === END ? '_' : token.endsWith(END) ? `${token.slice(0, -END.length)}_` : token;

function freshData(): BpeTrainingData {
  return structuredClone(bpeTrainingFacet.initialData) as unknown as BpeTrainingData;
}

/** `i+n(27)` 꼴로 적는다 — 사양의 표와 같은 서식이다. */
function mark(rule: { left: string; right: string; count: number }): string {
  return `${show(rule.left)}+${show(rule.right)}(${rule.count})`;
}

type MergePayload = {
  step: number;
  left: string;
  right: string;
  token: string;
  count: number;
  tied: boolean;
  whole: boolean;
};

type Recorded = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  /** 판마다의 병합 차례. 회차가 갈리는지 보려면 끝 상태가 아니라 이것을 봐야 한다. */
  rounds: string[][];
};

/**
 * 알고리즘을 러너 없이 굴린다.
 *
 * `sleep` 은 곧바로 돌아오고 `waitForInput` 은 대본을 하나씩 내어 준다. 대본이 비면
 * 취소로 만들어 알고리즘의 최상위 `catch` 가 조용히 접게 한다 — 실제 러너의
 * reset / destroy 가 하는 일과 같은 모양이다.
 */
async function drive(script: ReactiveInputEvent[], data = freshData()): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const queue = [...script];
  let cancelled = false;
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      const next = queue.shift();
      if (next !== undefined) return next;
      cancelled = true;
      throw new Error('cancelled');
    },
  };
  await bpeTraining(ctx as unknown as FacetContext<BpeTrainingData>);

  const rounds: string[][] = [];
  for (const e of events) {
    if (e.type === 'run-begin') rounds.push([]);
    if (e.type === 'merge-chosen' && rounds.length > 0) {
      rounds[rounds.length - 1].push(mark(e.payload as MergePayload));
    }
  }
  return { events, metrics, rounds };
}

describe('BPE 규약 셋', () => {
  it('낱말 끝 표식은 독립 기호다 — sing 은 다섯 원소로 시작한다', () => {
    expect(splitToSymbols('sing', END)).toEqual(['s', 'i', 'n', 'g', END]);
    expect(splitToSymbols('kind', END)).toHaveLength(5);
  });

  it('동률은 사전순으로 가른다 — 이 말뭉치에는 동률이 실제로 있다', () => {
    const data = freshData();
    const tied = (freq: number): number => trainBpe(data, freq).steps.filter((s) => s.rule.tied).length;
    // 사양이 짚은 두 자리. 정해 두지 않으면 실행마다 다른 화면이 나온다.
    expect(tied(2)).toBe(3);
    expect(tied(18)).toBe(2);

    // 고른 것이 정말 사전순 최소인지 본다 — 같은 수를 가진 짝 가운데.
    for (const freq of [2, 5, 8, 12, 18]) {
      for (const step of trainBpe(data, freq).steps) {
        const top = step.rule.count;
        const sameCount = step.ranking
          .filter((r) => r.count === top)
          .map((r) => `${r.left} ${r.right}`)
          .sort();
        expect(`${step.rule.left} ${step.rule.right}`).toBe(sameCount[0]);
      }
    }
  });

  it('자르는 것은 규칙 열이다 — 규칙을 배운 차례대로 훑어 얻은 분할이다', () => {
    const data = freshData();
    const run = trainBpe(data, 12);
    // 규칙을 처음부터 차례대로 한 번씩 적용하면 화면의 분할과 같은 것이 나온다.
    for (const word of run.words) {
      let tokens = splitToSymbols(word.word, END);
      for (const rule of run.steps.map((s) => s.rule)) {
        const out: string[] = [];
        let i = 0;
        while (i < tokens.length) {
          if (i + 1 < tokens.length && tokens[i] === rule.left && tokens[i + 1] === rule.right) {
            out.push(rule.token);
            i += 2;
          } else {
            out.push(tokens[i]);
            i += 1;
          }
        }
        tokens = out;
      }
      expect(tokens).toEqual(word.tokens);
    }
  });
});

describe('손잡이가 병합 차례를 뒤집는다', () => {
  it('다섯 값이 사양의 실측표와 글자 하나 다르지 않다', () => {
    const data = freshData();
    for (const freq of [2, 5, 8, 12, 18]) {
      expect(trainBpe(data, freq).steps.map((s) => mark(s.rule)), `sing=${freq}`).toEqual(
        SPEC[freq],
      );
    }
  });

  it('다섯 값이 다섯 가지 다른 차례를 낸다', () => {
    const data = freshData();
    const orders = [2, 5, 8, 12, 18].map((f) => trainBpe(data, f).steps.map((s) => mark(s.rule)).join(' '));
    expect(new Set(orders).size).toBe(5);
  });

  it('s+ing_ 는 2·5 에서 여섯 걸음에 들지 못하고, 8 에서 여섯째, 12 부터 넷째다', () => {
    const data = freshData();
    const at = (freq: number): number =>
      trainBpe(data, freq).steps.findIndex((s) => s.rule.token === `sing${END}`) + 1;
    expect(at(2)).toBe(0);
    expect(at(5)).toBe(0);
    expect(at(8)).toBe(6);
    expect(at(12)).toBe(4);
    expect(at(18)).toBe(4);
  });

  it('흔한 낱말이 먼저 한 조각이 된다 — 분할이 갈린다', () => {
    const data = freshData();
    for (const freq of [2, 8, 18]) {
      const split: Record<string, string> = {};
      for (const w of trainBpe(data, freq).words) split[w.word] = w.tokens.map(show).join(' ');
      for (const [word, want] of Object.entries(SPLITS[freq])) {
        expect(split[word], `sing=${freq} · ${word}`).toBe(want);
      }
    }
    // 2 에서 여섯째 걸음을 가져가는 것은 king 이다 — sing 보다 흔하기 때문이다.
    expect(trainBpe(data, 2).steps[5].rule.token).toBe(`king${END}`);
  });
});

describe('알고리즘의 발신', () => {
  it('발신하는 어휘는 주석에 적은 다섯뿐이다 (C2)', async () => {
    const { events } = await drive([{ type: 'freq', payload: { value: 12 } }]);
    expect([...new Set(events.map((e) => e.type))].sort()).toEqual([
      'merge-chosen',
      'pairs-ranked',
      'run-begin',
      'run-settled',
      'tokens-merged',
    ]);
  });

  it('phase 를 하나도 보내지 않는다 — IR 이 없으므로 받을 자리가 없다 (C3)', async () => {
    const { events } = await drive([]);
    expect(events.filter((e) => e.type === 'phase')).toEqual([]);
    expect(bpeTrainingIRs).toEqual([]);
  });

  it('회차마다 사양의 표와 같다 — 끝 상태가 아니라 판마다 본다', async () => {
    const script = [5, 12, 2, 18].map((value) => ({ type: 'freq', payload: { value } }));
    const { rounds } = await drive(script);
    // 처음 판은 선언의 기본값(8)이다.
    expect(rounds).toEqual([SPEC[8], SPEC[5], SPEC[12], SPEC[2], SPEC[18]]);
  });

  it('같은 값을 다시 고르면 다시 돌지 않고, 목록 밖의 값과 알 수 없는 조작은 흘린다', async () => {
    const { rounds } = await drive([
      { type: 'freq', payload: { value: 8 } },
      { type: 'nonsense' },
      { type: 'input', payload: { name: 'freq', value: '12' } },
      { type: 'freq', payload: { value: 7 } },
    ]);
    expect(rounds).toHaveLength(1);
  });

  it('계기가 판을 거듭해도 쌓이지 않는다', async () => {
    // 네 판을 돌려도 계기는 마지막 판의 값이어야 한다. 누적되면 16 이 뜬다.
    const { metrics } = await drive(
      [12, 18, 12, 18].map((value) => ({ type: 'freq', payload: { value } })).slice(0, 3),
    );
    expect(metrics['whole-word-step']).toBe(4);
    expect(metrics['vocab-piece-count']).toBe(9);
  });

  it('한 조각도 못 된 판에서는 걸음 번호가 0 이다 — 이름은 실린다', async () => {
    const { metrics } = await drive([{ type: 'freq', payload: { value: 2 } }]);
    expect(metrics['whole-word-step']).toBe(0);
    expect(Object.keys(metrics).sort()).toEqual(['vocab-piece-count', 'whole-word-step']);
  });
});

describe('Projector 배선', () => {
  it('순위표와 규칙 칸으로 옮기고, 판정에 따라 다른 말을 한다', async () => {
    const ranked: { rows: StageRankRow[]; winner: string | null }[] = [];
    const rules: StageRule[] = [];
    const words: StageWord[][] = [];
    const captions: string[] = [];
    let cleared = 0;

    const stage = {
      setWords(next: StageWord[]) {
        words.push(next);
      },
      setRanking(rows: StageRankRow[], winner: string | null) {
        ranked.push({ rows, winner });
      },
      addRule(_index: number, rule: StageRule) {
        rules.push(rule);
      },
      clearRules() {
        cleared += 1;
      },
      setCaption(line: string) {
        captions.push(line);
      },
      reset() {},
      destroy() {},
    } as unknown as ViewInstance;

    const projector = bpeTrainingProjector({ stage });
    projector.onInit?.(bpeTrainingFacet.initialData);

    const { events } = await drive([{ type: 'freq', payload: { value: 12 } }]);
    for (const e of events) await projector.onEvent(e);

    expect(cleared).toBe(2);
    expect(ranked).toHaveLength(12);
    expect(rules).toHaveLength(12);
    expect(words.length).toBeGreaterThan(12);

    // 줄 세운 것의 맨 위가 곧 이긴 짝이다.
    for (const r of ranked) {
      expect(r.winner).toBe(`${r.rows[0].left} ${r.rows[0].right}`);
    }

    // 손잡이를 올리면 s+ing_ 가 순위표에서 올라온다 — 넷째 걸음의 자리가 갈린다.
    const rankOf = (at: number): number =>
      ranked[at].rows.findIndex((r) => r.left === 's' && r.right === `ing${END}`);
    expect(rankOf(3)).toBeGreaterThan(0); // sing=8 의 넷째 걸음에서는 아래에 있고
    expect(rankOf(9)).toBe(0); // sing=12 의 넷째 걸음에서는 맨 위다

    // 통째가 되는 짝은 화면에서 따로 표시된다.
    expect(ranked[9].rows[0].whole).toBe(true);
    expect(rules[9].whole).toBe(true);

    // 캡션은 판마다 다른 말을 한다 — 통째가 된 판과 그렇지 않은 판.
    const settled = captions.filter((c) => c.includes('step') || c.includes('merge'));
    expect(settled.length).toBeGreaterThan(0);
    expect(captions.some((c) => c.includes('alphabetically'))).toBe(true);
  });

  it('되감기는 화면을 처음으로 돌린다', () => {
    let reset = 0;
    const stage = { reset: () => { reset += 1; }, destroy() {} } as unknown as ViewInstance;
    const projector = bpeTrainingProjector({ stage });
    projector.onReset?.();
    expect(reset).toBe(1);
  });
});

describe('마운트와 조작', () => {
  let errors: string[] = [];
  let spy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
    errors = [];
    spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
  });

  afterEach(() => {
    spy?.mockRestore();
  });

  it('캔버스가 붙고 세로가 안 바뀌며 손잡이가 병합 차례를 바꾼다', async () => {
    registerBpeTraining();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(bpeTrainingFacet, host);
    handle.setSpeed(60);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    expect(box).toBe('0 0 760 380');
    // 말뭉치는 마운트 순간 이미 서 있다 — 알고리즘을 기다리지 않는다.
    expect(host.querySelectorAll('[data-word]')).toHaveLength(6);

    /** 아래 칸에 쌓인 규칙을 차례대로 읽는다. */
    const learned = (): string[] =>
      [...host.querySelectorAll('[data-rule-index]')]
        .sort((a, b) => Number(a.getAttribute('data-rule-index')) - Number(b.getAttribute('data-rule-index')))
        .map((g) => g.querySelectorAll('text')[0]?.textContent ?? '');
    /** 순위표 줄이 지금 어디에 있는가. */
    const places = (): string =>
      [...host.querySelectorAll('[data-rank-key]')]
        .map((g) => `${g.getAttribute('data-rank-key')}@${g.getAttribute('transform')}`)
        .join(' ');
    const wait = async (until: () => boolean, ms: number): Promise<void> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && !until()) {
        await new Promise((r) => setTimeout(r, 20));
      }
    };

    await wait(() => learned().length === 6, 25_000);
    expect(learned()).toEqual(['in', 'g_', 'ing_', 'ink', 'ink_', 'sing_']);
    expect(svg?.getAttribute('viewBox')).toBe(box);

    // ── 손잡이가 논증을 진다. 12 로 옮기면 차례가 재배열된다.
    const segs = host.querySelectorAll<HTMLElement>('[data-seg-index]');
    expect(segs).toHaveLength(5);
    const before = places();
    segs[3].click();
    await wait(() => learned().join(' ') === 'in g_ ing_ sing_ ink ink_', 25_000);
    expect(learned()).toEqual(['in', 'g_', 'ing_', 'sing_', 'ink', 'ink_']);

    // 값만 갈아 끼운 것이 아니다 — 줄이 실제로 자리를 옮겼다.
    expect(places()).not.toBe(before);
    expect(svg?.getAttribute('viewBox')).toBe(box);

    // 계기의 수도 알고리즘이 셈한 것이다.
    const metric = (name: string): string =>
      host.querySelector(`.facet-control-bar__metric--${name}`)?.textContent ?? '';
    expect(metric('whole-word-step')).toContain('4');
    expect(metric('vocab-piece-count')).toContain('9');

    expect(errors).toEqual([]);

    handle.destroy();
    expect(host.querySelector('svg')).toBeNull();
    expect(host.children.length).toBe(0);
    host.remove();
  }, 90_000);

  it('되감기는 아래 칸을 비우고 손잡이를 처음 자리로 돌린다', async () => {
    registerBpeTraining();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(bpeTrainingFacet, host);
    handle.setSpeed(60);

    const learned = (): number => host.querySelectorAll('[data-rule-index]').length;
    const tokens = (): string[] =>
      [...host.querySelectorAll('[data-rule-index]')].map(
        (g) => g.querySelectorAll('text')[0]?.textContent ?? '',
      );
    const wait = async (until: () => boolean, ms: number): Promise<void> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && !until()) {
        await new Promise((r) => setTimeout(r, 20));
      }
    };

    await wait(() => learned() === 6, 25_000);
    const segs = host.querySelectorAll<HTMLElement>('[data-seg-index]');
    segs[0].click();
    await wait(() => tokens().includes('king_'), 25_000);
    expect(tokens()).toEqual(['in', 'g_', 'ing_', 'ink', 'ink_', 'king_']);

    host.querySelector<HTMLButtonElement>('button[data-control-id="reset"]')?.click();
    // 되감기 뒤에는 다시 기본 빈도로 돈다 — 코어가 위젯도 처음 자리로 돌린다.
    await wait(() => tokens().includes('sing_'), 25_000);
    expect(tokens()).toEqual(['in', 'g_', 'ing_', 'ink', 'ink_', 'sing_']);

    expect(errors).toEqual([]);
    handle.destroy();
    host.remove();
  }, 90_000);

  it('재생 도중 접어도 알고리즘이 매달리지 않는다', async () => {
    // stage 의 애니메이션 promise 를 projector 가 기다리므로, destroy 가 그것을 풀지
    // 않으면 `await ctx.emit` 이 영영 돌아오지 않는다. 매달림을 세는 법은 **아직 안
    // 끝난 onEvent 의 수**다 (packages/core 의 전수 검사와 같은 방법).
    registerBpeTraining();
    const tally = { started: 0, finished: 0 };
    const original = getProjector('bpeTrainingProjector');
    expect(original).toBeDefined();
    registerProjector('bpeTrainingProjector', (views, runtime) => {
      const inner = original!(views, runtime);
      return {
        ...inner,
        async onEvent(event) {
          tally.started += 1;
          try {
            await inner.onEvent(event);
          } finally {
            tally.finished += 1;
          }
        },
      };
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(bpeTrainingFacet, host);
    const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

    // 재생이 한창인 때를 고른다 — 첫 걸음이 나가고 애니메이션이 아직 도는 무렵이다.
    await delay(700);
    expect(tally.started).toBeGreaterThan(0);
    handle.destroy();

    await delay(1_200);
    expect(tally.started - tally.finished).toBe(0);
    expect(errors).toEqual([]);
    host.remove();
  }, 30_000);
});
