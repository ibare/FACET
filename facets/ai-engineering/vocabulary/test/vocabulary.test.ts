// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  ReactiveInputEvent,
} from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  getProjector,
  mountView,
  registerBuiltinViews,
  registerProjector,
  runFacet,
} from '@ffacet/core/runtime';
import {
  registerVocabulary,
  segmentWord,
  trainMerges,
  vocabulary,
  vocabularyFacet,
  vocabularyIRs,
  vocabularyOf,
  vocabularyStageView,
  type VocabularyData,
} from '../src/index.js';

/**
 * 호스트가 BPE 를 실제로 돌려 잰 표.
 *
 * 합계가 32 로 같은 두 말뭉치가 이 표의 핵심이다 — 합계만 보면 같고, 어느 낱말을
 * 잘 자르는지는 정반대다. 끝 상태만 보면 계기가 누적되는 붕괴를 놓치므로 아래
 * "회차마다" 검사가 판을 거듭하며 같은 수가 나오는지도 본다.
 */
const SPEC = {
  everyday: {
    total: 47,
    size: 14,
    cuts: {
      cellular: 'c e l l u l a r _',
      genetic: 'g en e t i c _',
      indexed: 'i n d e x e d _',
      strings: 's t r i n g s _',
      organism: 'o r g an is m _',
      numbers: 'n u m b e r s _',
    },
  },
  biology: {
    total: 32,
    size: 28,
    cuts: {
      cellular: 'cell u l a r _',
      genetic: 'genetic_',
      indexed: 'in d e x e d _',
      strings: 's t r in g s_',
      organism: 'organ i s m _',
      numbers: 'n u m b e r s_',
    },
  },
  code: {
    total: 32,
    size: 28,
    cuts: {
      cellular: 'c e l l u l ar _',
      genetic: 'g e n et i c _',
      indexed: 'index e d _',
      strings: 'string s_',
      organism: 'o r g a n i s m _',
      numbers: 'number s_',
    },
  },
} as const;

type CorpusName = keyof typeof SPEC;
const NAMES: CorpusName[] = ['everyday', 'biology', 'code'];

function freshData(): VocabularyData {
  return structuredClone(vocabularyFacet.initialData) as unknown as VocabularyData;
}

/** 조각 열을 화면에 보이는 모양으로 — 끝 표식은 `_` 한 글자다. */
function show(parts: readonly string[], endMark: string): string {
  return parts.map((p) => p.replaceAll(endMark, '_')).join(' ');
}

type Settled = {
  corpus: string;
  total: number;
  size: number;
  tieWith: string | null;
  /** 그 순간 계기가 실제로 들고 있던 값. 누적 붕괴는 여기서만 드러난다. */
  metrics: Record<string, number>;
};

type Recorded = {
  events: FacetRuntimeEvent[];
  cuts: { corpus: string; word: string; pieces: number; parts: string[] }[];
  settled: Settled[];
};

/**
 * 알고리즘을 러너 없이 굴린다.
 *
 * `metric` 은 메커니즘과 같은 방식으로 **누적**한다 — 알고리즘이 차이를 잘못 보내면
 * 여기서 수가 쌓여 드러난다. 대본이 비면 취소로 만들어 최상위 `catch` 가 조용히
 * 접게 한다 (러너의 reset / destroy 가 하는 일과 같은 모양).
 */
async function drive(script: ReactiveInputEvent[], data = freshData()): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const cuts: Recorded['cuts'] = [];
  const settled: Settled[] = [];
  const metrics: Record<string, number> = {};
  const queue = [...script];
  let cancelled = false;
  let corpus = '';

  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      if (event.type === 'corpus-chosen') corpus = String(payload.corpus);
      if (event.type === 'word-cut') {
        cuts.push({
          corpus,
          word: String(payload.word),
          pieces: Number(payload.pieces),
          parts: payload.parts as string[],
        });
      }
      if (event.type === 'corpus-settled') {
        settled.push({
          corpus: String(payload.corpus),
          total: Number(payload.total),
          size: Number(payload.size),
          tieWith: typeof payload.tieWith === 'string' ? payload.tieWith : null,
          metrics: { ...metrics },
        });
      }
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

  await vocabulary(ctx as unknown as FacetContext<VocabularyData>);
  return { events, cuts, settled };
}

describe('말뭉치 셋이 낸 어휘', () => {
  const data = freshData();

  it('여섯 낱말을 실측표 그대로 자른다', () => {
    for (const [index, name] of NAMES.entries()) {
      const corpus = data.corpora[index];
      expect(corpus.name).toBe(name);
      const rules = trainMerges(corpus.words, data.merges, data.endMark);
      for (const word of data.testWords) {
        const parts = segmentWord(word, rules, data.endMark);
        const expected = SPEC[name].cuts[word as keyof (typeof SPEC)['everyday']['cuts']];
        expect(`${name}/${word}: ${show(parts, data.endMark)}`).toBe(`${name}/${word}: ${expected}`);
      }
    }
  });

  it('조각 합계와 어휘 크기가 실측표와 같다', () => {
    for (const [index, name] of NAMES.entries()) {
      const corpus = data.corpora[index];
      const rules = trainMerges(corpus.words, data.merges, data.endMark);
      const total = data.testWords.reduce(
        (sum, word) => sum + segmentWord(word, rules, data.endMark).length,
        0,
      );
      expect({ name, total }).toEqual({ name, total: SPEC[name].total });
      expect({ name, size: vocabularyOf(corpus.words, rules, data.endMark).length }).toEqual({
        name,
        size: SPEC[name].size,
      });
    }
  });

  it('합계가 같은 둘이 정반대의 낱말을 잘 자른다', () => {
    // 합계만 보면 같다.
    expect(SPEC.biology.total).toBe(SPEC.code.total);
    const pieces = (name: CorpusName, word: string): number =>
      SPEC[name].cuts[word as keyof (typeof SPEC)['everyday']['cuts']].split(' ').length;
    // 그런데 낱말별로는 뒤집힌다.
    expect(pieces('biology', 'genetic')).toBe(1);
    expect(pieces('code', 'genetic')).toBe(7);
    expect(pieces('code', 'numbers')).toBe(2);
    expect(pieces('biology', 'numbers')).toBe(7);
    // 그리고 code 의 organism 은 흔한 말 어휘보다도 나쁘다.
    expect(pieces('code', 'organism')).toBe(9);
    expect(pieces('everyday', 'organism')).toBe(7);
  });

  it('사전순 갈림이 없으면 학습이 흔들린다 — 규약 2 가 값을 정한다', () => {
    // 같은 말뭉치를 두 번 학습해도 규칙 열이 글자 하나 다르지 않다.
    const corpus = data.corpora[1];
    const once = trainMerges(corpus.words, data.merges, data.endMark);
    const twice = trainMerges(corpus.words, data.merges, data.endMark);
    expect(twice).toEqual(once);
    // everyday 는 더 합칠 짝이 없어 40 을 못 채우고 39 에서 멈춘다.
    expect(trainMerges(data.corpora[0].words, data.merges, data.endMark)).toHaveLength(39);
  });
});

describe('알고리즘의 발신', () => {
  it('phase 를 하나도 보내지 않는다 — IR 이 없으므로 받을 자리가 없다 (C3)', async () => {
    const { events } = await drive([]);
    expect(events.filter((e) => e.type === 'phase')).toEqual([]);
    expect(vocabularyIRs).toEqual([]);
  });

  it('발신하는 어휘는 주석에 적은 셋뿐이다 (C2)', async () => {
    const { events } = await drive([{ type: 'corpus', payload: { value: 1 } }]);
    expect([...new Set(events.map((e) => e.type))].sort()).toEqual([
      'corpus-chosen',
      'corpus-settled',
      'word-cut',
    ]);
  });

  it('같은 말뭉치를 다시 고르면 다시 돌지 않는다', async () => {
    const { settled } = await drive([{ type: 'corpus', payload: { value: 0 } }]);
    expect(settled).toHaveLength(1);
  });

  it('알 수 없는 조작과 목록에 없는 값은 흘린다', async () => {
    const { settled } = await drive([
      { type: 'nonsense' },
      { type: 'input', payload: { name: 'corpus', value: '1' } },
      { type: 'corpus', payload: { value: 9 } },
      { type: 'corpus', payload: { value: -1 } },
    ]);
    expect(settled).toHaveLength(1);
  });
});

describe('손잡이를 돌린 회차마다', () => {
  /** everyday(첫 판) → biology → code → everyday → biology. */
  const script: ReactiveInputEvent[] = [
    { type: 'corpus', payload: { value: 1 } },
    { type: 'corpus', payload: { value: 2 } },
    { type: 'corpus', payload: { value: 0 } },
    { type: 'corpus', payload: { value: 1 } },
  ];
  const order: CorpusName[] = ['everyday', 'biology', 'code', 'everyday', 'biology'];

  it('조각 수가 회차마다 실측표와 같다', async () => {
    const { cuts } = await drive(script);
    const data = freshData();
    expect(cuts).toHaveLength(order.length * data.testWords.length);
    for (const [round, name] of order.entries()) {
      for (const [i, word] of data.testWords.entries()) {
        const cut = cuts[round * data.testWords.length + i];
        const expected = SPEC[name].cuts[word as keyof (typeof SPEC)['everyday']['cuts']];
        expect(`${round}:${name}/${cut.word}: ${show(cut.parts, data.endMark)}`).toBe(
          `${round}:${name}/${word}: ${expected}`,
        );
        expect(cut.pieces).toBe(expected.split(' ').length);
      }
    }
  });

  /**
   * 계기는 누적 채널이라 알고리즘이 차이만 보내야 한다. 그냥 보내면 둘째 판에서
   * 47 + 32 = 79 가 뜬다 — 끝 상태만 보는 검사는 이것을 못 잡는다.
   */
  it('계기가 회차마다 그 말뭉치의 값을 그대로 가리킨다', async () => {
    const { settled } = await drive(script);
    expect(settled.map((s) => s.corpus)).toEqual(order);
    for (const [round, name] of order.entries()) {
      expect({ round, ...settled[round].metrics }).toEqual({
        round,
        'piece-sum': SPEC[name].total,
        'vocabulary-size': SPEC[name].size,
      });
      expect(settled[round].total).toBe(SPEC[name].total);
      expect(settled[round].size).toBe(SPEC[name].size);
    }
  });

  it('합계가 같은 앞 말뭉치를 알아본다', async () => {
    const { settled } = await drive(script);
    // everyday(첫 판) 은 견줄 상대가 없고, biology 도 47 과 다르다.
    expect(settled[0].tieWith).toBeNull();
    expect(settled[1].tieWith).toBeNull();
    // code 는 biology 와 합계가 같다.
    expect(settled[2].tieWith).toBe('biology');
    // 다시 everyday 로 오면 47 과 같은 것이 없다.
    expect(settled[3].tieWith).toBeNull();
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

  it('손잡이를 돌리면 자르는 자리가 실제로 옮겨 간다', async () => {
    registerVocabulary();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(vocabularyFacet, host);
    handle.setSpeed(8);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    expect(box).toBe('0 0 700 320');
    // 낱말 여섯은 마운트 순간 이미 서 있다 — 알고리즘을 기다리지 않는다.
    expect(host.querySelectorAll('[data-word]').length).toBe(6);

    const pieces = (word: string): string =>
      host.querySelector(`[data-word="${word}"]`)?.getAttribute('data-pieces') ?? '';
    /** 끝 표식 칸의 가로 자리. 경계가 옮겨 가면 이 값이 바뀐다. */
    const tailX = (word: string, cell: number): string =>
      host
        .querySelector(`[data-word="${word}"] [data-cell="${cell}"]`)
        ?.getAttribute('x') ?? '';
    /** 판이 끝났는지는 캡션이 말한다 — 조각 수만 보면 처음 상태와 구별되지 않는다. */
    const caption = (): string =>
      host.querySelector('[data-role="caption"]')?.textContent ?? '';
    const wait = async (until: () => boolean, ms: number): Promise<void> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && !until()) {
        await new Promise((r) => setTimeout(r, 25));
      }
    };

    // 흔한 말 어휘로 한 판을 돈다.
    await wait(() => caption().includes('Vocabulary everyday'), 25_000);
    expect(caption()).toContain('47');
    expect(pieces('genetic')).toBe('7');
    expect(pieces('organism')).toBe('7');
    expect(pieces('cellular')).toBe('9');
    const everydayTail = tailX('genetic', 7);

    // ── 생물학 어휘로 옮긴다. genetic 이 한 덩이로 모인다.
    const segs = host.querySelectorAll<HTMLElement>('[data-seg-index]');
    expect(segs.length).toBe(3);
    segs[1].click();
    await wait(() => caption().includes('Vocabulary biology'), 25_000);
    expect(pieces('genetic')).toBe('1');
    expect(pieces('organism')).toBe('5');
    expect(pieces('cellular')).toBe('6');
    expect(pieces('numbers')).toBe('7');
    const biologyTail = tailX('genetic', 7);
    // 값만 갈아 끼운 것이 아니다 — 글자가 실제로 옮겨 갔다.
    expect(biologyTail).not.toBe(everydayTail);

    // ── 코드 어휘로 옮긴다. 합계는 같은데 잘 잘리는 낱말이 뒤집힌다.
    segs[2].click();
    await wait(() => caption().includes('Same piece total'), 25_000);
    expect(caption()).toContain('biology');
    expect(caption()).toContain('32');
    expect(pieces('genetic')).toBe('7');
    expect(pieces('organism')).toBe('9');
    expect(pieces('strings')).toBe('2');
    expect(pieces('numbers')).toBe('2');
    expect(tailX('genetic', 7)).not.toBe(biologyTail);

    // 계기도 알고리즘이 셈한 값이다 — 판을 거듭해도 쌓이지 않는다.
    const sum = host.querySelector('.facet-control-bar__metric--piece-sum');
    expect(sum?.textContent).toContain('32');
    const size = host.querySelector('.facet-control-bar__metric--vocabulary-size');
    expect(size?.textContent).toContain('28');

    expect(errors).toEqual([]);
    expect(svg?.getAttribute('viewBox')).toBe(box);

    handle.destroy();
    expect(host.children.length).toBe(0);
    host.remove();
  }, 90_000);

  it('되감기는 손잡이를 처음 자리로 돌리고 첫 어휘로 다시 돈다', async () => {
    registerVocabulary();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(vocabularyFacet, host);
    handle.setSpeed(8);

    const pieces = (word: string): string =>
      host.querySelector(`[data-word="${word}"]`)?.getAttribute('data-pieces') ?? '';
    const caption = (): string =>
      host.querySelector('[data-role="caption"]')?.textContent ?? '';
    const wait = async (until: () => boolean, ms: number): Promise<void> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && !until()) {
        await new Promise((r) => setTimeout(r, 25));
      }
    };

    await wait(() => caption().includes('Vocabulary everyday'), 25_000);
    host.querySelectorAll<HTMLElement>('[data-seg-index]')[2].click();
    await wait(() => caption().includes('Same piece total'), 25_000);
    expect(pieces('numbers')).toBe('2');
    const track = host.querySelector('[role="slider"]');
    expect(track?.getAttribute('aria-valuenow')).toBe('2');

    host.querySelector<HTMLButtonElement>('button[data-control-id="reset"]')?.click();
    // 되감기 뒤에는 다시 첫 말뭉치로 돈다 — 코어가 위젯도 처음 자리로 돌린다.
    await wait(() => caption().includes('Vocabulary everyday'), 25_000);
    expect(track?.getAttribute('aria-valuenow')).toBe('0');
    expect(pieces('numbers')).toBe('8');
    expect(pieces('genetic')).toBe('7');

    expect(errors).toEqual([]);
    handle.destroy();
    host.remove();
  }, 90_000);

  /**
   * stage 의 움직임 promise 를 projector 가 기다리므로, destroy 가 그것을 안 풀면
   * `await ctx.emit` 이 영영 돌아오지 않는다. 매달림은 **아직 안 끝난 onEvent 의
   * 수**로만 드러난다 — 화면은 이미 사라진 뒤라 눈으로는 못 잡는다.
   */
  it('재생 도중 접어도 매달리는 것이 없다', async () => {
    registerVocabulary();
    const inner = getProjector('vocabularyProjector');
    expect(inner).toBeDefined();
    if (!inner) return;

    const tally = { started: 0, finished: 0 };
    registerProjector('vocabularyProjector', (views, runtime) => {
      const instance = inner(views, runtime);
      return {
        ...instance,
        async onEvent(event: FacetRuntimeEvent): Promise<void> {
          tally.started += 1;
          try {
            await instance.onEvent(event);
          } finally {
            tally.finished += 1;
          }
        },
      };
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(vocabularyFacet, host);
    // 움직임이 한창인 때를 고른다 — 그래야 매달릴 자리가 실제로 열려 있다.
    await new Promise((r) => setTimeout(r, 700));
    handle.destroy();
    await new Promise((r) => setTimeout(r, 1_200));

    expect(tally.started).toBeGreaterThan(0);
    expect(tally.started - tally.finished).toBe(0);
    expect(errors).toEqual([]);
    host.remove();
  }, 30_000);
});

describe('stage 혼자서', () => {
  it('되감으면 글자가 다시 저마다 홀로 서고, 접으면 그림만 걷힌다', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = mountView(vocabularyStageView, host, {
      config: {},
      initialData: vocabularyFacet.initialData,
      locale: 'en',
      theme: 'light',
    }) as unknown as {
      cutWord(word: string, parts: string[]): Promise<void>;
      reset(): void;
      destroy(): void;
    };
    const pieces = (word: string): string =>
      host.querySelector(`[data-word="${word}"]`)?.getAttribute('data-pieces') ?? '';

    // 어휘가 없을 때는 글자가 저마다 홀로 선다 (genetic 일곱 글자 + 끝 표식).
    expect(pieces('genetic')).toBe('8');
    await view.cutWord('genetic', ['genetic</w>']);
    expect(pieces('genetic')).toBe('1');

    view.reset();
    expect(pieces('genetic')).toBe('8');

    view.destroy();
    // 캔버스는 러너의 것이라 남고, 그린 것만 걷힌다 (S-view).
    expect(host.querySelector('[data-word]')).toBeNull();
    expect(host.querySelector('svg')).not.toBeNull();
    host.remove();
  });
});
