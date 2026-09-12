// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FacetContext, FacetRuntimeEvent, ReactiveInputEvent } from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  getProjector,
  registerBuiltinViews,
  registerProjector,
  runFacet,
} from '@ffacet/core/runtime';
import {
  computeSubwordRun,
  learnMerges,
  registerSubwordSegmentation,
  segmentSentence,
  subwordSegmentation,
  subwordSegmentationFacet,
  subwordSegmentationIRs,
  type SubwordSegmentationData,
} from '../src/index.js';

/**
 * 사양의 손잡이 실측표. 호스트가 BPE 를 실제로 돌려 잰 값이다.
 *
 * 조각 수가 33 → 7 로 **단조 감소**한다. 손잡이를 돌리는 것 자체가 이 완제품의
 * 주장이므로, 그 수가 어긋나면 주장이 무너진다.
 */
const SPEC = [
  {
    merges: 0,
    vocab: 15,
    pieces: 33,
    cut: 't h e _ c r e a t i o n _ o f _ a _ n a t i v e _ s t a t i o n _',
  },
  { merges: 12, vocab: 23, pieces: 16, cut: 'the_ c re ation_ o f _ a _ n a ti v e_ st ation_' },
  { merges: 24, vocab: 23, pieces: 11, cut: 'the_ cre ation_ of_ a _ n a tive_ st ation_' },
  { merges: 36, vocab: 27, pieces: 9, cut: 'the_ cre ation_ of_ a _ n ative_ station_' },
  { merges: 44, vocab: 27, pieces: 7, cut: 'the_ creation_ of_ a _ native_ station_' },
] as const;

function freshData(): SubwordSegmentationData {
  return structuredClone(
    subwordSegmentationFacet.initialData,
  ) as unknown as SubwordSegmentationData;
}

/** 조각 열을 사양의 표기로 — 끝 표식은 `_` 다. */
function show(pieces: readonly string[], endMark: string): string {
  return pieces.map((p) => p.split(endMark).join('_')).join(' ');
}

type Row = {
  type: string;
  payload: Record<string, unknown>;
  /** **그 이벤트를 낼 때** 계기에 실려 있던 값. 누적 붕괴는 여기서만 보인다. */
  metrics: Record<string, number>;
};

/**
 * 알고리즘을 러너 없이 굴린다.
 *
 * `sleep` 은 곧바로 돌아오고 `waitForInput` 은 대본을 하나씩 내어 준다. 대본이
 * 비면 취소로 만들어 최상위 `catch` 가 조용히 접게 한다 — 러너의 reset / destroy 가
 * 하는 일과 같은 모양이다. `metric` 은 러너와 똑같이 **누적**한다. 그래야 델타를
 * 잘못 보내는 순간 수가 어긋난다.
 */
async function drive(
  script: ReactiveInputEvent[],
  data = freshData(),
): Promise<{ rows: Row[]; metrics: Record<string, number> }> {
  const rows: Row[] = [];
  const metrics: Record<string, number> = {};
  const queue = [...script];
  let cancelled = false;

  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      rows.push({
        type: event.type,
        payload: (event.payload ?? {}) as Record<string, unknown>,
        metrics: { ...metrics },
      });
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

  await subwordSegmentation(ctx as unknown as FacetContext<SubwordSegmentationData>);
  return { rows, metrics };
}

const handle = (value: number): ReactiveInputEvent => ({
  type: 'merges',
  payload: { value, segmentIndex: 0, merges: String(value) },
});

describe('선언', () => {
  it('말뭉치 열아홉과 시험 문장이 사양 그대로다', () => {
    const data = freshData();
    expect(data.corpus).toHaveLength(19);
    expect(data.corpus.reduce((n, e) => n + e.freq, 0)).toBe(193);
    expect(data.sentence).toBe('the creation of a native station');
    expect(data.sentence.split(' ')).toHaveLength(6);
    expect(data.sentence.split(' ').join('')).toHaveLength(27);
    expect(data.endMark).toBe('</w>');
    expect(data.mergeCounts).toEqual(SPEC.map((s) => s.merges));
  });

  it('손잡이 기본 구간과 알고리즘의 시작 값이 같다', () => {
    // 둘이 어긋나면 슬라이더는 24 를 가리키는데 화면은 다른 값의 결과를 보인다.
    const controls = (
      subwordSegmentationFacet.blocks.controls as { controls?: Array<Record<string, unknown>> }
    ).controls;
    const slider = controls?.find((c) => c.widget === 'segmented-slider');
    const segments = (slider?.segments ?? []) as Array<{ value: number; default?: boolean }>;
    expect(segments.map((s) => s.value)).toEqual(SPEC.map((s) => s.merges));
    expect(segments.filter((s) => s.default === true)).toHaveLength(1);
    expect(segments.find((s) => s.default === true)?.value).toBe(freshData().initialMerges);
  });
});

describe('손잡이 다섯 값 — 사양의 실측표', () => {
  it('어휘와 조각 수와 분할이 표와 같다', () => {
    const data = freshData();
    for (const spec of SPEC) {
      const { rules, vocabSize } = learnMerges(data.corpus, data.endMark, spec.merges);
      const pieces = segmentSentence(data.sentence, data.endMark, rules);
      expect(rules).toHaveLength(spec.merges);
      expect(vocabSize, `어휘 @${spec.merges}`).toBe(spec.vocab);
      expect(pieces.length, `조각 수 @${spec.merges}`).toBe(spec.pieces);
      expect(show(pieces, data.endMark), `분할 @${spec.merges}`).toBe(spec.cut);
    }
  });

  it('조각 수가 단조로 줄어든다 — 손잡이가 논증을 진다', () => {
    const counts = SPEC.map((s) => s.pieces);
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]!, `${SPEC[i]!.merges} 번`).toBeLessThan(counts[i - 1]!);
    }
  });

  it('낱말 끝 표식은 독립 기호다 — 빼면 수가 재현되지 않는다', () => {
    const data = freshData();
    // 표식 없이 배우면 같은 44 번으로도 다른 분할이 나온다.
    const withMark = computeSubwordRun(data, 44);
    const noMark = computeSubwordRun({ ...data, endMark: '' }, 44);
    expect(withMark.pieces.length).toBe(7);
    expect(show(noMark.pieces, '')).not.toBe(SPEC[4]!.cut);
  });

  it('동률은 사전순으로 가른다 — 첫 규칙이 e + 끝표식이다', () => {
    const data = freshData();
    const { rules } = learnMerges(data.corpus, data.endMark, 5);
    expect(rules[0]).toEqual({ left: 'e', right: '</w>' });
    expect(rules[4]).toEqual({ left: 'ti', right: 'on</w>' });
  });
});

describe('알고리즘의 발신', () => {
  it('phase 를 하나도 보내지 않는다 — IR 이 없으므로 받을 자리가 없다 (C3)', async () => {
    const { rows } = await drive([]);
    expect(rows.filter((r) => r.type === 'phase')).toEqual([]);
    expect(subwordSegmentationIRs).toEqual([]);
  });

  it('발신하는 어휘는 주석에 적은 셋뿐이다 (C2)', async () => {
    const { rows } = await drive([handle(44)]);
    expect([...new Set(rows.map((r) => r.type))].sort()).toEqual([
      'pair-merged',
      'run-begin',
      'run-settled',
    ]);
  });

  it('한 판은 낱글자에서 시작해 규칙마다 조각이 준다', async () => {
    const { rows } = await drive([]);
    const begin = rows.find((r) => r.type === 'run-begin');
    expect(begin?.payload.pieceCount).toBe(33);
    const counts = rows.filter((r) => r.type === 'pair-merged').map((r) => r.payload.pieceCount);
    expect(counts.length).toBeGreaterThan(0);
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i] as number).toBeLessThan(counts[i - 1] as number);
    }
    // 한 규칙이 여러 자리에 동시에 먹는 걸음이 실제로 있다.
    const merged = rows.filter((r) => r.type === 'pair-merged');
    expect(merged.some((r) => (r.payload.mergedAt as number[]).length > 1)).toBe(true);
  });

  it('같은 값을 다시 고르면 다시 돌지 않고, 목록에 없는 값과 모르는 조작은 흘린다', async () => {
    const { rows } = await drive([
      handle(24),
      handle(7),
      { type: 'nonsense' },
      { type: 'input', payload: { name: 'merges', value: '44' } },
    ]);
    expect(rows.filter((r) => r.type === 'run-settled')).toHaveLength(1);
  });
});

describe('손잡이를 돌려도 계기가 쌓이지 않는다', () => {
  it('회차마다 계기가 그 판의 값과 정확히 같다', async () => {
    // 끝 상태만 보면 누적 붕괴를 못 잡는다 — 둘째 판부터 수가 불어나기 때문이다.
    const order = [24, 44, 0, 12, 36] as const;
    const { rows } = await drive(order.slice(1).map((m) => handle(m)));
    const settled = rows.filter((r) => r.type === 'run-settled');
    expect(settled.map((r) => r.payload.merges)).toEqual([...order]);

    for (const row of settled) {
      const spec = SPEC.find((s) => s.merges === row.payload.merges);
      expect(row.payload.pieceCount, `조각 수 @${String(row.payload.merges)}`).toBe(spec?.pieces);
      expect(row.payload.vocabSize, `어휘 @${String(row.payload.merges)}`).toBe(spec?.vocab);
      // 계기도 같은 수여야 한다. 차이가 아니라 값을 보내면 여기서 부풀어 걸린다.
      expect(row.metrics['piece-count'], `계기 조각 수 @${String(row.payload.merges)}`).toBe(
        spec?.pieces,
      );
      expect(row.metrics['vocab-size'], `계기 어휘 @${String(row.payload.merges)}`).toBe(
        spec?.vocab,
      );
    }
  });

  it('판이 시작될 때마다 계기가 낱글자 줄로 되돌아간다', async () => {
    const { rows } = await drive([handle(44), handle(12)]);
    for (const row of rows.filter((r) => r.type === 'run-begin')) {
      expect(row.metrics['piece-count']).toBe(33);
      expect(row.metrics['vocab-size']).toBe(15);
    }
  });

  it('갈리지 않는 값에서도 계기 이름이 실린다', async () => {
    // 12 와 24 는 어휘가 둘 다 23 이다. 델타가 0 이라고 안 보내면 그 회차에 이름이
    // 통째로 빠져 "선언한 계기가 없는 것" 과 구별되지 않는다.
    const { rows } = await drive([handle(12)]);
    const settled = rows.filter((r) => r.type === 'run-settled');
    expect(settled.map((r) => r.metrics['vocab-size'])).toEqual([23, 23]);
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

  it('손잡이가 화면을 바꾸고 줄이 실제로 짧아진다', async () => {
    registerSubwordSegmentation();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const run = runFacet(subwordSegmentationFacet, host);
    run.setSpeed(30);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const box = svg?.getAttribute('viewBox');
    expect(box).toBe('0 0 760 210');
    // 마운트 순간 이미 낱글자 줄이 서 있다 — 알고리즘을 기다리지 않는다.
    expect(host.querySelectorAll('[data-piece-index]').length).toBe(33);

    const tiles = (): Element[] => [...host.querySelectorAll('[data-piece-index]')];
    /** 마지막 타일의 왼쪽 끝. 줄이 짧아지면 이 수가 준다. */
    const rowEnd = (): number => {
      const last = tiles()[tiles().length - 1];
      const m = /translate\(([-\d.]+),/.exec(last?.getAttribute('transform') ?? '');
      return m ? Number(m[1]) : -1;
    };
    const metric = (name: string): string =>
      host.querySelector(`.facet-control-bar__metric--${name}`)?.textContent ?? '';
    const wait = async (until: () => boolean, ms: number): Promise<void> => {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline && !until()) {
        await new Promise((r) => setTimeout(r, 20));
      }
    };

    const openEnd = rowEnd();
    expect(openEnd).toBeGreaterThan(0);

    // 기본 손잡이 24 로 한 판이 돈다. 어휘는 판이 앉을 때 실리므로 그것을 기다린다.
    await wait(() => tiles().length === 11 && metric('vocab-size').includes('23'), 25_000);
    expect(tiles().length).toBe(11);
    expect(metric('piece-count')).toContain('11');
    expect(metric('vocab-size')).toContain('23');
    const end24 = rowEnd();
    expect(end24, '조각이 줄면 줄도 짧아진다').toBeLessThan(openEnd);

    // 손잡이를 44 로. 화면이 실제로 갈린다.
    const segs = host.querySelectorAll<HTMLElement>('[data-seg-index]');
    expect(segs.length).toBe(5);
    segs[4]?.click();
    await wait(() => tiles().length === 7 && metric('vocab-size').includes('27'), 25_000);
    expect(tiles().length).toBe(7);
    expect(metric('piece-count')).toContain('7');
    expect(metric('vocab-size')).toContain('27');
    expect(rowEnd(), '더 뭉치면 더 짧아진다').toBeLessThan(end24);

    // 0 으로 되돌리면 낱글자 줄이고, 길이도 처음 자리로 돌아온다.
    segs[0]?.click();
    await wait(
      () => tiles().length === 33 && metric('vocab-size').includes('15'),
      25_000,
    );
    expect(tiles().length).toBe(33);
    expect(metric('piece-count')).toContain('33');
    expect(metric('vocab-size')).toContain('15');
    expect(rowEnd()).toBe(openEnd);

    // 세로는 마운트한 뒤 바뀌지 않는다.
    expect(svg?.getAttribute('viewBox')).toBe(box);
    expect(errors).toEqual([]);

    run.destroy();
    expect(host.querySelector('svg')).toBeNull();
    expect(host.children.length).toBe(0);
    host.remove();
  }, 90_000);

  it('재생 도중 접어도 알고리즘이 매달리지 않는다', async () => {
    // stage 의 애니메이션 promise 를 projector 가 기다리므로, destroy 가 그것을
    // 풀지 않으면 unmount 된 뒤에도 알고리즘·projector·SVG 가 통째로 붙들린다.
    // 화면은 이미 사라진 뒤라 눈으로는 못 잡는다 — 안 끝난 `onEvent` 를 센다.
    registerSubwordSegmentation();
    const name = subwordSegmentationFacet.projector.replace(/^module:/, '');
    const original = getProjector(name);
    if (!original) throw new Error(`projector 미등록: ${name}`);
    const tally = { started: 0, finished: 0 };
    registerProjector(name, (views, runtime) => {
      const inner = original(views, runtime);
      return {
        ...inner,
        async onEvent(event: FacetRuntimeEvent) {
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
    const run = runFacet(subwordSegmentationFacet, host);

    // 타일이 서로에게 미끄러지는 한복판에서 접는다.
    await new Promise((r) => setTimeout(r, 500));
    expect(tally.started).toBeGreaterThan(0);
    run.destroy();

    await new Promise((r) => setTimeout(r, 800));
    expect(tally.started - tally.finished, '기다리던 것이 남았다').toBe(0);
    expect(errors).toEqual([]);
    host.remove();
  }, 30_000);
});
