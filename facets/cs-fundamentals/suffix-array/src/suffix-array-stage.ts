/**
 * suffix-array stage — 줄 세운 꼬리들과, 그 위를 짚어 가는 이분 탐색.
 *
 * 화면은 셋으로 읽힌다.
 *   1. 글        원본 글자와 자리 번호. 꼬리는 여기서 잘라 낸 것이다.
 *   2. 줄        꼬리 열하나. 줄과 줄 사이에 **이웃 겹침**을 적는다 — 이 화면의
 *                주 수치이고, 되풀이가 심할수록 이 수가 커진다.
 *   3. 오른 칸   찾는 패턴 · 남은 구간 · 덩어리 · 이웃 겹침 평균.
 *
 * ── 무엇이 움직이는가
 *
 * 꼬리 줄은 **지속 노드**다. 갱신마다 지우고 다시 그리지 않고 `transform` 으로
 * 자리를 옮긴다. 움직이는 자리는 둘이고, 둘 다 이 완제품의 주장이 걸린 곳이다.
 *
 *   - **줄 서기 한 번의 쓸기** — 자리 순으로 놓인 꼬리들이 사전 순 자리로 한꺼번에
 *     미끄러진다. 정렬 *방법*(삽입 정렬)을 가르치는 것이 아니라 **어느 꼬리가 어느
 *     자리로 가는지**를 보인다. 방법은 조각 `allSuffixesSorted` 의 몫이고 여기서는
 *     결과가 어떻게 맺히는지만 보인다.
 *   - **이분 탐색 커서** — 남은 구간의 괄호가 좁혀지고 가운데를 짚는 표가 그 줄로
 *     옮겨 간다. 구간이 절반씩 주는 것이 눈에 보여야 이 화면이 할 말을 한다.
 *
 * 결과만 보이면 독자는 "왜 그 순서인가" 를 못 본다. 조각이 그 움직임을 보이는데
 * 완제품이 정적이면 완제품이 조각보다 못한 화면이 된다.
 *
 * ── 세로는 고정이다
 *
 * 세로는 mount 에서 한 번 정하고 그 뒤로 바꾸지 않는다 (S-view). 네 단의 글 길이가
 * 모두 11 이라 줄 수도 늘 열하나다 — 손잡이를 밀어도 높이가 흔들리지 않는 것이
 * 그 때문이다. 운동은 전부 이 고정된 캔버스 **안에서** 일어나며 `viewBox` 를 다시
 * 재지 않는다.
 *
 * ── 시간을 거두는 일
 *
 * **타이머를 쓴다.** 걸어 둔 것은 집합에 담고 `destroy()` 가 일괄로 거두며, 기다리던
 * 것을 깨워 emit 이 영영 돌아오지 않는 일이 없게 한다. 되감기·손잡이로 장면이
 * 갈아엎일 때 옛 애니메이션이 새 화면을 건드리지 않도록 `epoch` 로 끊는다.
 */

import {
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 440;
const PAD_X = 24;

/** 글 띠. */
const SRC_Y = 32;
const SRC_H = 28;
const SRC_CELL = 28;
const SRC_NUM_Y = 24;

/** 줄. */
const ROWS_Y = 106;
const ROW_H = 22;
const ROW_STEP = 27;
const RANK_X = 24;
const RANK_W = 20;
const FROM_X = 48;
const FROM_W = 22;
const OVER_X = 76;
const GLYPH_X = 112;
const GLYPH_W = 26;

/** 오른 칸. */
const PANEL_X = 448;
const PANEL_W = 248;

const CAPTION_Y = 424;

/** 시간. */
const FRAME_MS = 16;
const SORT_MS = 620;
const PROBE_MS = 260;
const BAND_MS = 300;

/** 도형에 새겨진 표식 — 번역하면 화면과 어긋난다 (C10). */
const SYM_LO = 'lo';
const SYM_HI = 'hi';
const SYM_MID = 'mid';
/** 아직 셈하기 전임을 뜻하는 자리표. 0 을 적으면 없는 상태를 주장하게 된다. */
const SYM_PENDING = '—';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  return node;
}

function text(
  x: number,
  y: number,
  content: string,
  opts: { fill: string; size?: string; anchor?: string; weight?: string; mono?: boolean },
): SVGTextElement {
  const t = el('text', {
    x,
    y,
    fill: opts.fill,
    'font-size': opts.size ?? fontSizes.xs,
    'font-family': opts.mono ? fonts.mono : fonts.body,
    'text-anchor': opts.anchor ?? 'start',
    'dominant-baseline': 'middle',
  });
  if (opts.weight) t.setAttribute('font-weight', opts.weight);
  t.textContent = content;
  return t;
}

const rowY = (slot: number): number => ROWS_Y + slot * ROW_STEP;

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
}

type Scene = { text: string; pattern: string };

/** initialData 를 좁히는 자리는 여기 하나다. */
function readScene(initialData: unknown): Scene {
  if (typeof initialData !== 'object' || initialData === null) return { text: '', pattern: '' };
  const data = initialData as Record<string, unknown>;
  const level = typeof data.level === 'number' ? data.level : 1;
  const texts = Array.isArray(data.texts) ? data.texts : [];
  const entry = texts[Math.min(Math.max(0, level - 1), Math.max(0, texts.length - 1))];
  if (typeof entry !== 'object' || entry === null) return { text: '', pattern: '' };
  const e = entry as Record<string, unknown>;
  return {
    text: typeof e.text === 'string' ? e.text : '',
    pattern: typeof e.pattern === 'string' ? e.pattern : '',
  };
}

export const suffixArrayStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },

  mount(
    // 컨테이너에는 손대지 않는다 — 그릴 자리는 러너가 이미 붙여 준 캔버스다.
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    // 컨테이너를 비우지 않는다 — 러너가 캔버스를 먼저 붙여 두었으므로 비우면
    // 그림이 통째로 사라진다 (S-view). 지울 것은 캔버스 안쪽뿐이다.
    const svg = params.canvas;
    svg.textContent = '';

    const colors: Palette = getColors(params.theme);
    const tr: Translate = params.t ?? makeTranslator(params.locale);

    const initial = readScene(params.initialData);

    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.bg }));

    const srcG = el('g', {});
    const bandG = el('g', {});
    const slotG = el('g', {});
    const rowsG = el('g', {});
    const markG = el('g', {});
    const panelG = el('g', {});
    const capG = el('g', {});
    // 덩어리 띠는 줄보다 뒤에 있어야 하므로 먼저 붙인다.
    svg.append(srcG, bandG, slotG, rowsG, markG, panelG, capG);

    // ── 지금 화면이 들고 있는 것.
    let curText = initial.text;
    let curPattern = initial.pattern;
    /**
     * 꼬리의 시작 칸 → 줄 자리. 처음에는 자리 순 그대로다.
     *
     * 반대 방향(자리 → 꼬리)은 들고 있지 않다. `showSorted` 가 받은 `sa` 는 새
     * 자리를 셈하는 동안만 쓰이고, 그 뒤로 화면이 묻는 것은 늘 "이 꼬리가 지금
     * 몇 번째 줄인가" 라 이 방향 하나면 된다.
     */
    let slotOf: number[] = [];
    let overlaps: number[] = [];
    let avg: number | null = null;
    let probeWindow: { lo: number; hi: number; mid: number; cmp: 'lt' | 'ge' } | null = null;
    let block: { start: number; size: number } | null = null;
    const matched = new Set<number>();

    /** 꼬리마다의 지속 노드. 지우고 다시 그리지 않고 이것을 옮긴다. */
    const rowNodes: SVGGElement[] = [];
    const cellRects: SVGRectElement[][] = [];
    const cellTexts: SVGTextElement[][] = [];
    /** 꼬리가 지금 놓인 세로 자리. tween 이 이어서 움직이려면 알고 있어야 한다. */
    const curY: number[] = [];

    // ── 시간. 걸어 둔 것은 집합에 담고 destroy 가 일괄로 거둔다.
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    let destroyed = false;
    /** 장면이 갈아엎인 뒤 옛 애니메이션이 화면을 건드리지 않게 하는 표. */
    let epoch = 0;

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) return resolve();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const id = setTimeout(() => {
          timers.delete(id);
          finish();
        }, ms);
        timers.add(id);
      });
    }

    /** apply 는 0→1 의 날 진행을 받는다. 어떻게 휘게 할지는 부르는 쪽이 정한다. */
    async function tween(duration: number, apply: (p: number) => void): Promise<void> {
      const mine = epoch;
      const frames = Math.max(1, Math.round(duration / FRAME_MS));
      for (let f = 1; f <= frames; f += 1) {
        await wait(FRAME_MS);
        if (destroyed || epoch !== mine) return;
        apply(f / frames);
      }
    }

    // ── 글 띠.
    function drawSource(): void {
      srcG.textContent = '';
      srcG.appendChild(
        text(PAD_X, 14, tr('label.text', 'Text'), {
          fill: colors.textMuted,
          size: fontSizes.sm,
        }),
      );
      for (let i = 0; i < curText.length; i += 1) {
        const x = PAD_X + i * SRC_CELL;
        srcG.appendChild(
          text(x + SRC_CELL / 2, SRC_NUM_Y, String(i), {
            fill: colors.textMuted,
            anchor: 'middle',
            mono: true,
          }),
        );
        srcG.appendChild(
          el('rect', {
            x,
            y: SRC_Y,
            width: SRC_CELL,
            height: SRC_H,
            rx: 4,
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        srcG.appendChild(
          text(x + SRC_CELL / 2, SRC_Y + SRC_H / 2, curText.charAt(i), {
            fill: colors.text,
            size: fontSizes.lg,
            anchor: 'middle',
            mono: true,
          }),
        );
      }
      srcG.appendChild(
        text(PAD_X, 88, tr('label.inOrder', 'Tails in order'), {
          fill: colors.textMuted,
          size: fontSizes.sm,
        }),
      );
      srcG.appendChild(
        text(OVER_X + 14, 88, tr('label.overlap', 'Overlap'), {
          fill: colors.textMuted,
          anchor: 'middle',
        }),
      );
    }

    /** 줄 자리에 붙박인 것 — 자리 번호와 이웃 겹침. 꼬리를 따라 움직이지 않는다. */
    function drawSlots(): void {
      slotG.textContent = '';
      for (let slot = 0; slot < curText.length; slot += 1) {
        const y = rowY(slot);
        slotG.appendChild(
          text(RANK_X + RANK_W / 2, y + ROW_H / 2, String(slot), {
            fill: colors.textMuted,
            anchor: 'middle',
            mono: true,
          }),
        );
        const over = overlaps[slot];
        if (slot > 0 && over !== undefined) {
          slotG.appendChild(
            text(OVER_X + 14, y + ROW_H / 2, String(over), {
              fill: over > 0 ? colors.text : colors.textMuted,
              anchor: 'middle',
              weight: over > 0 ? '600' : '400',
              mono: true,
            }),
          );
        }
      }
    }

    /** 꼬리마다 지속 노드를 한 번 짓는다. 그 뒤로는 옮기기만 한다. */
    function buildRows(): void {
      rowsG.textContent = '';
      rowNodes.length = 0;
      cellRects.length = 0;
      cellTexts.length = 0;
      curY.length = 0;
      slotOf = [];

      for (let from = 0; from < curText.length; from += 1) {
        const g = el('g', { transform: `translate(0, ${rowY(from)})` });
        g.appendChild(
          el('rect', {
            x: FROM_X,
            y: 2,
            width: FROM_W,
            height: ROW_H - 4,
            rx: 4,
            fill: colors.bgSubtle,
            stroke: colors.border,
            'stroke-width': 1,
          }),
        );
        g.appendChild(
          text(FROM_X + FROM_W / 2, ROW_H / 2, String(from), {
            fill: colors.text,
            anchor: 'middle',
            mono: true,
          }),
        );

        const glyphs = curText.slice(from);
        const rects: SVGRectElement[] = [];
        const texts: SVGTextElement[] = [];
        for (let j = 0; j < glyphs.length; j += 1) {
          const x = GLYPH_X + j * GLYPH_W;
          const rect = el('rect', {
            x,
            y: 0,
            width: GLYPH_W,
            height: ROW_H,
            rx: 3,
            fill: colors.itemDefault,
            stroke: colors.border,
            'stroke-width': 1,
          });
          const glyph = text(x + GLYPH_W / 2, ROW_H / 2, glyphs.charAt(j), {
            fill: colors.text,
            size: fontSizes.sm,
            anchor: 'middle',
            mono: true,
          });
          g.append(rect, glyph);
          rects.push(rect);
          texts.push(glyph);
        }
        rowsG.appendChild(g);
        rowNodes.push(g);
        cellRects.push(rects);
        cellTexts.push(texts);
        curY.push(rowY(from));
        slotOf.push(from);
      }
    }

    /** 꼬리 하나를 세로로 옮긴다. 운동은 전부 이 한 곳을 지난다. */
    function placeRow(from: number, y: number): void {
      rowNodes[from]?.setAttribute('transform', `translate(0, ${Math.round(y)})`);
      curY[from] = y;
    }

    /** 칸 색 — 지금 짚는 줄, 덩어리로 밝혀진 줄, 패턴과 같은 앞머리. */
    function paintRows(): void {
      for (let from = 0; from < rowNodes.length; from += 1) {
        const slot = slotOf[from] ?? from;
        const isMid = probeWindow !== null && probeWindow.mid === slot;
        const isMatched = matched.has(slot);
        const shared = isMatched ? curPattern.length : 0;
        const rects = cellRects[from] ?? [];
        const texts = cellTexts[from] ?? [];
        for (let j = 0; j < rects.length; j += 1) {
          const onPattern = j < shared;
          const fill = onPattern ? colors.accent : isMid ? colors.itemActive : colors.itemDefault;
          rects[j]?.setAttribute('fill', fill);
          rects[j]?.setAttribute(
            'stroke',
            onPattern ? colors.accent : isMid ? colors.itemActive : colors.border,
          );
          texts[j]?.setAttribute('fill', onPattern || isMid ? colors.stateInk : colors.text);
        }
      }
    }

    // ── 이분 탐색의 표. 괄호와 화살표를 지속 노드로 두고 모양을 바꾼다.
    const bracket = el('path', {
      d: '',
      fill: 'none',
      stroke: colors.auxCursor,
      'stroke-width': 2,
      opacity: 0,
    });
    const arrow = el('path', { d: '', fill: colors.itemActive, opacity: 0 });
    markG.append(bracket, arrow);

    let brTop = rowY(0);
    let brBottom = rowY(0) + ROW_H;
    let arrowY = rowY(0) + ROW_H / 2;

    function drawMarks(): void {
      const x = RANK_X - 12;
      bracket.setAttribute(
        'd',
        `M ${x + 5} ${brTop} L ${x} ${brTop} L ${x} ${brBottom} L ${x + 5} ${brBottom}`,
      );
      const ax = GLYPH_X + curText.length * GLYPH_W + 8;
      arrow.setAttribute('d', `M ${ax} ${arrowY} l 10 -5 l 0 10 z`);
    }

    // ── 덩어리 띠.
    const band = el('rect', {
      x: RANK_X - 6,
      y: rowY(0),
      width: 10,
      height: 0,
      rx: 8,
      fill: colors.sortedTailBg,
      stroke: colors.sortedTailBorder,
      'stroke-width': 1,
      opacity: 0,
    });
    bandG.appendChild(band);

    function drawPanel(): void {
      panelG.textContent = '';
      panelG.appendChild(
        text(PANEL_X, 14, tr('label.pattern', 'Looking for'), {
          fill: colors.textMuted,
          size: fontSizes.sm,
        }),
      );
      for (let i = 0; i < curPattern.length; i += 1) {
        const x = PANEL_X + i * SRC_CELL;
        panelG.appendChild(
          el('rect', {
            x,
            y: SRC_Y,
            width: SRC_CELL,
            height: SRC_H,
            rx: 4,
            fill: colors.accent,
            stroke: colors.accent,
            'stroke-width': 1,
          }),
        );
        panelG.appendChild(
          text(x + SRC_CELL / 2, SRC_Y + SRC_H / 2, curPattern.charAt(i), {
            fill: colors.stateInk,
            size: fontSizes.lg,
            anchor: 'middle',
            mono: true,
          }),
        );
      }

      let y = ROWS_Y + 6;
      panelG.appendChild(
        text(PANEL_X, y, tr('label.range', 'Search range'), {
          fill: colors.textMuted,
          size: fontSizes.sm,
        }),
      );
      y += 24;
      // `lo` · `hi` · `mid` 는 그 분야에서 원어 그대로 통용되는 도식 라벨이라
      // 표식이다 (C10 의 "표식이냐 문안이냐").
      const cells: [string, string][] = [
        [SYM_LO, probeWindow === null ? SYM_PENDING : String(probeWindow.lo)],
        [SYM_HI, probeWindow === null ? SYM_PENDING : String(probeWindow.hi)],
        [SYM_MID, probeWindow === null ? SYM_PENDING : String(probeWindow.mid)],
      ];
      cells.forEach(([label, value], i) => {
        const x = PANEL_X + i * 84;
        panelG.appendChild(text(x, y, label, { fill: colors.textMuted, mono: true }));
        panelG.appendChild(
          text(x + 26, y, value, {
            fill: colors.text,
            size: fontSizes.md,
            weight: '600',
            mono: true,
          }),
        );
      });

      y += 44;
      panelG.appendChild(
        text(PANEL_X, y, tr('label.block', 'One block'), {
          fill: colors.textMuted,
          size: fontSizes.sm,
        }),
      );
      y += 26;
      panelG.appendChild(
        el('rect', {
          x: PANEL_X,
          y: y - 13,
          width: PANEL_W,
          height: 30,
          rx: 6,
          fill: block === null ? colors.bg : colors.sortedTailBg,
          stroke: block === null ? colors.border : colors.sortedTailBorder,
          'stroke-width': 1,
        }),
      );
      panelG.appendChild(
        text(
          PANEL_X + 12,
          y + 2,
          block === null || block.size === 0
            ? SYM_PENDING
            : `${block.start} .. ${block.start + block.size - 1}`,
          { fill: colors.text, size: fontSizes.md, weight: '600', mono: true },
        ),
      );

      y += 62;
      panelG.appendChild(
        text(PANEL_X, y, tr('label.avgOverlap', 'Average neighbour overlap'), {
          fill: colors.textMuted,
          size: fontSizes.sm,
        }),
      );
      y += 36;
      panelG.appendChild(
        text(PANEL_X, y, avg === null ? SYM_PENDING : avg.toFixed(2), {
          fill: colors.text,
          size: fontSizes.xl,
          weight: '600',
          mono: true,
        }),
      );
    }

    function setCaption(value: string): void {
      capG.textContent = '';
      capG.appendChild(
        text(PAD_X, CAPTION_Y, value, { fill: colors.textMuted, size: fontSizes.sm }),
      );
    }

    function clearScene(): void {
      epoch += 1;
      overlaps = [];
      avg = null;
      probeWindow = null;
      block = null;
      matched.clear();
      bracket.setAttribute('opacity', '0');
      arrow.setAttribute('opacity', '0');
      band.setAttribute('opacity', '0');
      band.setAttribute('height', '0');
    }

    function reset(): void {
      curText = initial.text;
      curPattern = initial.pattern;
      clearScene();
      drawSource();
      buildRows();
      drawSlots();
      paintRows();
      drawMarks();
      drawPanel();
      capG.textContent = '';
    }

    reset();

    return {
      destroy() {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 emit 이 영영 돌아오지 않는다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },

      showSetup(s: { level: number; text: string; pattern: string }) {
        curText = s.text;
        curPattern = s.pattern;
        clearScene();
        drawSource();
        buildRows();
        drawSlots();
        paintRows();
        drawMarks();
        drawPanel();
      },

      showCut(list: { from: number; text: string }[]) {
        // 꼬리는 이미 자리 순으로 놓여 있다. 자르는 몸짓은 조각의 몫이라
        // 여기서는 자리만 확인한다.
        for (const tail of list) placeRow(tail.from, rowY(tail.from));
        paintRows();
      },

      /** 줄 서기 — 꼬리들이 사전 순 자리로 한꺼번에 미끄러진다. */
      async showSorted(s: {
        sa: number[];
        overlaps: number[];
        overlapSum: number;
        overlapAvg: number;
      }): Promise<void> {
        overlaps = s.overlaps;
        avg = s.overlapAvg;

        const fromY = [...curY];
        const toY: number[] = [...curY];
        const nextSlot: number[] = [...slotOf];
        s.sa.forEach((from, slot) => {
          toY[from] = rowY(slot);
          nextSlot[from] = slot;
        });

        await tween(SORT_MS, (p) => {
          const e = ease(p);
          for (let from = 0; from < rowNodes.length; from += 1) {
            const a = fromY[from] ?? 0;
            const b = toY[from] ?? 0;
            placeRow(from, a + (b - a) * e);
          }
        });
        for (let from = 0; from < rowNodes.length; from += 1) placeRow(from, toY[from] ?? 0);
        slotOf = nextSlot;

        drawSlots();
        paintRows();
        drawPanel();
      },

      /** 이분 탐색 — 구간의 괄호가 좁혀지고 가운데를 짚는 표가 옮겨 간다. */
      async showProbe(p: {
        lo: number;
        hi: number;
        mid: number;
        rank: number;
        cmp: 'lt' | 'ge';
      }): Promise<void> {
        const first = probeWindow === null;
        probeWindow = { lo: p.lo, hi: p.hi, mid: p.mid, cmp: p.cmp };

        const toTop = rowY(p.lo) - 3;
        const toBottom = rowY(Math.max(p.lo, p.hi - 1)) + ROW_H + 3;
        const toArrow = rowY(p.mid) + ROW_H / 2;

        if (first) {
          // 첫 걸음에는 옮겨 올 앞자리가 없다. 제자리에서 떠오른다.
          brTop = toTop;
          brBottom = toBottom;
          arrowY = toArrow;
          drawMarks();
          bracket.setAttribute('opacity', '1');
          arrow.setAttribute('opacity', '1');
        } else {
          const f = { t: brTop, b: brBottom, a: arrowY };
          await tween(PROBE_MS, (pr) => {
            const e = ease(pr);
            brTop = f.t + (toTop - f.t) * e;
            brBottom = f.b + (toBottom - f.b) * e;
            arrowY = f.a + (toArrow - f.a) * e;
            drawMarks();
          });
          brTop = toTop;
          brBottom = toBottom;
          arrowY = toArrow;
          drawMarks();
        }

        paintRows();
        drawPanel();
      },

      /** 덩어리 — 띠가 위에서 아래로 펴진다. */
      async showBlock(b: { start: number; size: number; ranks: number[] }): Promise<void> {
        block = { start: b.start, size: b.size };
        // 덩어리가 밝혀지면 가운데를 짚던 표는 할 일을 마쳤다.
        probeWindow = null;
        bracket.setAttribute('opacity', '0');
        arrow.setAttribute('opacity', '0');
        paintRows();
        drawPanel();

        if (b.size <= 0) return;
        const top = rowY(b.start) - 4;
        const full = b.size * ROW_STEP - (ROW_STEP - ROW_H) + 8;
        band.setAttribute('x', String(RANK_X - 6));
        band.setAttribute('width', String(GLYPH_X + curText.length * GLYPH_W - RANK_X + 12));
        band.setAttribute('y', String(top));
        band.setAttribute('opacity', '1');
        await tween(BAND_MS, (p) => {
          band.setAttribute('height', String(Math.round(full * ease(p))));
        });
        band.setAttribute('height', String(full));
      },

      showMatch(m: { rank: number; from: number }) {
        matched.add(m.rank);
        paintRows();
      },

      setCaption,
      reset,
    };
  },
};
