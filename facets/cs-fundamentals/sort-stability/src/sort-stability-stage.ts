/**
 * sort-stability-stage — 정렬 안정성 조각 전용 캔버스.
 *
 * ── 화면이 하는 일
 *
 * 한 줄의 입력에서 두 줄의 결과가 **갈라져 나오고**, 그 둘이 위아래로 나란히
 * 놓인 채 **딱 한 짝에서 어긋난다.** 값만 그리면 두 줄은 구별되지 않으므로
 * (둘 다 1 1 3 3), 항목마다 "어디서 왔는가" 를 들고 있는 이름표 칩을 달고,
 * 두 결과 줄 사이에 같은 항목끼리 실을 잇는다. 나란한 실 둘, 엇갈린 실 둘 —
 * 그 교차 하나가 이 조각이 말하려는 전부다.
 *
 *   caption
 *   입력        [B|3] [A|1] [C|3] [D|1]
 *                  ╳ 항목이 실제로 자리를 옮겨 내려앉는다
 *   안정 정렬   [A|1] [D|1] [B|3] [C|3]
 *                  │  │  ╳     실 — 둘은 나란하고 한 짝은 어긋난다
 *   선택 정렬   [A|1] [D|1] [C|3] [B|3]
 *
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 달라진 것만
 * 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 없고, 되짚기가 앞으로 가기와 같은
 * 길을 탄다. 옮기기 전에는 `hideTags()` 와 `linkOrigin()` 이 접고 펴는 쌍이었고,
 * 그 "지금 접혀 있나" 가 칩의 `transform` 에만 남아 있었다. 지금은 장면이 말한다.
 *
 * 운동의 방향이 뒤집혀 있다 — 정적 그리기가 정본이라 타일도 이름표도 실도 이미
 * 끝 모습으로 서 있고, 애니메이션은 **아직 못 온 만큼을 뒤로 물려** 놓고 시작한다.
 * 출발 모습은 전부 장면에서 셈한다. `prev` 는 쓰지 않는다 (S-scene).
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편**(입력 줄인가 결과 줄인가 · 이름표 색은 어느 항목인가),
 * **테두리는 견줌·어긋남의 표식**이다. 이 조각은 값이 실제로 자리를 옮기므로,
 * 어긋난 짝을 채움으로 칠하면 옮긴 뒤 그 자리에 다른 값이 앉아 읽기가 뒤집힌다.
 *
 * ── 아직 없는 것은 숨기지 않고 짓지 않는다
 *
 * 이름표가 접힌 걸음에서는 칩을 `opacity:0` 으로 숨기지 않고 **아예 짓지 않는다.**
 * 숨기기만 하면 앞 걸음의 `transform` 과 `opacity` 가 함께 남아 되짚기 판정이
 * 어긋난다. 접히는 운동을 보이는 동안만 잠깐 짓고, 운동 뒤 재건이 거둔다.
 *
 * View 는 algorithm 의 타입을 모른다 (원칙 1) — 장면 타입 하나만 안다.
 *
 * 화면 문자는 캡션과 줄 이름표뿐이고 전부 `params.t` 로 만든다 — 문안은 `facet.ts`
 * 의 `messages` 에 있다 (C10). 타일에 적힌 값과 칩의 이름표는 도형에 새겨진 표식이라
 * 문안이 아니다.
 *
 * ── 세로
 *
 * 마운트 뒤 바뀌지 않는다. 줄 셋 + 실 띠 한 칸이 전부라 내용으로 늘어날 곳이 없다
 * (S-view).
 *
 * ── 뒷일
 *
 * 타이머는 rAF 와 그것을 기다리는 약속뿐이며 스스로 다음 회차를 예약하는 루프는
 * 없다. `destroy()` 가 걸린 프레임을 모두 걷고 **대기 중이던 약속을 즉시 풀어
 * 준다** — 취소된 tick 은 아예 불리지 않으므로 거두기만 해서는 `await ctx.emit` 이
 * 영영 돌아오지 않는다 (S-piece).
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  radii,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  itemOf,
  mismatchedLabels,
  originColumn,
  type SortStabilityCaption,
  type SortStabilityRow,
  type SortStabilityScene,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 자리. 가로는 캔버스에서 역산하고 상수는 상한만 둔다 (S-piece).
const W = PIECE_CANVAS_W;
const H = 284;
const GUTTER = 96; // 줄 이름표 자리. 이름표는 오른쪽 정렬이라 긴 문안은 왼쪽으로 자란다
const SIDE_R = 24;
const SLOT_MAX_W = 132;
const TILE_GAP = 16;
const TILE_H = 46;

const CAPTION_Y = 24;
const ROW_INPUT_Y = 44;
const ROW_STABLE_Y = 128;
const ROW_SELECTION_Y = 222;

const CHIP_X = 8;
const CHIP_Y = 10;
const CHIP_W = 26;
const CHIP_H = 26;

/** 실이 두 결과 줄 사이에서 휘는 정도. 제어점의 세로 물림이다. */
const THREAD_BOW = 20;

const TRAVEL_MS = 520;
const TRAVEL_STAGGER_MS = 50;
const FOLD_MS = 320;
const THREAD_MS = 460;
const PULSE_MS = 520;

/** 테두리 — 기본 / 어긋난 짝의 표식. 실도 같은 굵기 잣대를 쓴다. */
const STROKE_PLAIN = 1.4;
const STROKE_THREAD = 1.6;
const STROKE_MARK = 2.4;
const PULSE_SWELL = 1.4;

/** 실 길이를 잴 때 쪼개는 마디 수. 화면을 도로 읽지 않고 제어점에서 셈한다. */
const ARC_STEPS = 24;

type StageTile = {
  g: SVGGElement;
  rect: SVGRectElement;
  /** 이름표 칩. 접힌 걸음에서는 아예 짓지 않으므로 `null` 이다. */
  chip: SVGGElement | null;
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** 3차 베지어 한 점. 실 길이를 재는 데만 쓴다. */
function cubicAt(t: number, a: number, b: number, c: number, d: number): number {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
}

export const sortStabilityStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SortStabilityScene> {
    // 러너가 붙여 준 캔버스다. container 를 비우면 이 캔버스가 떨어져 나간다 (S-view).
    const svg = params.canvas;
    svg.textContent = '';

    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const rx = Number.parseFloat(radii.md);
    const chipRx = Number.parseFloat(radii.sm);

    // ── 그림 층. 실은 타일 아래에 깔린다. 앞 셋은 걸음마다 통째로 다시 세운다.
    const slotLayer = el('g');
    const threadLayer = el('g');
    const tileLayer = el('g');
    const fixedLayer = el('g');
    const rebuilt = [slotLayer, threadLayer, tileLayer];
    for (const layer of [...rebuilt, fixedLayer]) svg.appendChild(layer);

    // 캡션은 재건 밖 요소다 — 정적 경로가 매번 문자를 명시로 쓴다. 빠뜨리면 앞
    // 걸음의 문장이 남아 되짚기 판정에서 어긋난다.
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    fixedLayer.appendChild(caption);

    // 줄 이름표는 자리도 문안도 장면과 무관하다. 한 번 짓고 두면 된다.
    const rowLabel = (text: string, rowY: number): void => {
      const node = el('text', {
        x: GUTTER - 10,
        y: rowY + TILE_H / 2 + 4,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        fill: c.textMuted,
      });
      node.textContent = text;
      fixedLayer.appendChild(node);
    };
    rowLabel(t('label.rowInput', 'input'), ROW_INPUT_Y);
    rowLabel(t('label.rowStable', 'stable sort'), ROW_STABLE_Y);
    rowLabel(t('label.rowSelection', 'selection sort'), ROW_SELECTION_Y);

    // ── 기하. 항목 수가 폭을 정하므로 장면의 `items` 길이에서 매번 역산한다.
    //    자리를 **먼저 한 번에 셈하고** 그 다음에 그린다 — 그리면서 재면 순회
    //    순서가 곧 숨은 상태가 된다.
    let slotW = SLOT_MAX_W;
    let tileW = SLOT_MAX_W - TILE_GAP;
    let originX = GUTTER;
    let palette: readonly string[] = [];

    function layout(n: number): void {
      const span = W - GUTTER - SIDE_R;
      slotW = Math.min(SLOT_MAX_W, Math.floor(span / Math.max(1, n)));
      tileW = slotW - TILE_GAP;
      originX = GUTTER + Math.round((span - slotW * n) / 2);
      // 색판 씨앗은 바탕의 항목 수다. "지금까지 드러난 수" 로 정하면 항목이 하나
      // 더 드러날 때 이미 칠한 이름표의 색이 바뀐다.
      palette = categorical(Math.max(1, n), 'vivid');
    }

    const colX = (col: number): number => originX + col * slotW + TILE_GAP / 2;
    const rowY = (row: SortStabilityRow): number =>
      row === 'stable' ? ROW_STABLE_Y : ROW_SELECTION_Y;

    // ── 이번 장면이 세운 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다.
    let stableTiles = new Map<string, StageTile>();
    let selectionTiles = new Map<string, StageTile>();
    let threadPaths = new Map<string, SVGPathElement>();
    let threadLengths = new Map<string, number>();

    const tilesOf = (row: SortStabilityRow): Map<string, StageTile> =>
      row === 'stable' ? stableTiles : selectionTiles;

    // ── 걸어 둔 것과 세대 빗장.
    //
    // 정적 그리기가 모든 요소를 매번 새로 짓지만, 새로 지어지는 것은 **노드**이지
    // 그 노드를 가리키는 클로저 변수가 아니다. `stableTiles` 같은 손잡이를 걸음
    // 함수가 `await` 뒤에 읽으면 옛 세대가 새 손잡이를 타고 살아 있는 화면에 쓴다.
    // 그래서 `render` 첫머리에서 세대를 올리고, 운동은 `await` 뒤마다 자기 세대를
    // 확인한 뒤에만 화면에 손을 댄다.
    //
    // `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너는 장면 조각에서 그
    // 둘을 부르지 않는다 (S-scene). 실효 있는 것은 `opts.animate` 검사와 이것뿐이다.
    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 한 걸음을 **한 시계**로 흐르게 한다. 세대가 지나면 화면에 손대지 않고 물러난다.
     *
     * `draw` 는 0..1 의 **날 것**을 받는다 — 이 조각은 한 시계 안에서 항목마다
     * 어긋난 마디를 돌리므로 (`fanOut` 의 stagger) 완화를 마디마다 따로 먹인다.
     */
    function animate(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine) || typeof requestAnimationFrame !== 'function') {
          if (alive(mine)) draw(1);
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(mine)) {
            finish();
            return;
          }
          const p = clamp01((Date.now() - started) / ms);
          draw(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 부품 짓기.

    const place = (g: SVGGElement, x: number, y: number): void => {
      g.setAttribute('transform', `translate(${x} ${y})`);
    };

    /** 이름표 칩. "어디서 왔는가" 를 들고 있는 유일한 표시다. */
    function makeChip(label: string, identity: number): SVGGElement {
      // n 개 카테고리 식별이므로 categorical 시드에서 뽑는다 (S-view 결정 트리 3).
      const chip = el('g', { transform: `translate(${CHIP_X} ${CHIP_Y})` });
      chip.appendChild(
        el('rect', {
          x: 0,
          y: 0,
          width: CHIP_W,
          height: CHIP_H,
          rx: chipRx,
          fill: palette[identity] ?? c.itemDefault,
        }),
      );
      const text = el('text', {
        x: CHIP_W / 2,
        y: 17,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': 700,
        fill: c.stateInk,
      });
      text.textContent = label;
      chip.appendChild(text);
      return chip;
    }

    /**
     * 항목 하나의 타일.
     *
     * 채움은 **값의 형편**(입력 줄인가 결과 줄인가), 테두리는 **어긋남의 표식**이다.
     */
    function makeTile(
      label: string,
      value: number,
      identity: number,
      opts: { source: boolean; tagged: boolean; flagged: boolean },
    ): StageTile {
      const g = el('g');
      const rect = el('rect', {
        x: 0,
        y: 0,
        width: tileW,
        height: TILE_H,
        rx,
        fill: opts.source ? c.bgSubtle : c.itemDefault,
        stroke: opts.flagged ? c.itemSwapping : c.border,
        'stroke-width': opts.flagged ? STROKE_MARK : STROKE_PLAIN,
      });
      g.appendChild(rect);

      let chip: SVGGElement | null = null;
      if (opts.tagged) {
        chip = makeChip(label, identity);
        g.appendChild(chip);
      }

      const valueText = el('text', {
        x: (CHIP_X + CHIP_W + tileW) / 2,
        y: 31,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xl,
        'font-weight': 700,
        fill: c.text,
      });
      // 값 표기는 숫자 표식이다 (C10) — 키를 만들지 않는다.
      valueText.textContent = String(value);
      g.appendChild(valueText);

      tileLayer.appendChild(g);
      return { g, rect, chip };
    }

    /**
     * 두 결과 줄의 빈 자리. 처음부터 그려 둬야 "한 입력에서 두 줄이 나온다" 는
     * 짜임이 첫 프레임에 서고, 세로가 내용으로 늘어나지 않는다 (S-view).
     * 타일이 내려앉으면 같은 자리에 정확히 덮인다.
     */
    function buildSlots(n: number): void {
      for (const y of [ROW_STABLE_Y, ROW_SELECTION_Y]) {
        for (let col = 0; col < n; col += 1) {
          slotLayer.appendChild(
            el('rect', {
              x: colX(col),
              y,
              width: tileW,
              height: TILE_H,
              rx,
              fill: 'none',
              stroke: c.border,
              'stroke-width': 1.2,
              'stroke-dasharray': '4 5',
            }),
          );
        }
      }
    }

    /** 한 줄을 세운다. 입력 줄은 `items` 차례 그대로, 결과 줄은 그 결과 차례로. */
    function buildRow(
      s: SortStabilityScene,
      order: readonly string[],
      y: number,
      opts: { source: boolean; tagged: boolean; flagged: ReadonlySet<string> },
      into: Map<string, StageTile> | null,
    ): void {
      order.forEach((label, col) => {
        const item = itemOf(s, label);
        if (item === null) return;
        const tile = makeTile(label, item.value, originColumn(s, label), {
          source: opts.source,
          tagged: opts.tagged,
          flagged: opts.flagged.has(label),
        });
        place(tile.g, colX(col), y);
        into?.set(label, tile);
      });
    }

    /**
     * 두 결과 줄 사이의 실. 같은 항목끼리 잇는다.
     *
     * 길이는 제어점에서 셈한다 — 옮기기 전에는 `getTotalLength()` 로 **화면을 도로
     * 읽었고**, 되감아 세운 직후에는 그 값이 아직 옛 화면의 것이었다.
     */
    function buildThreads(s: SortStabilityScene, flagged: ReadonlySet<string>): void {
      const { stable, selection } = s;
      if (stable === null || selection === null) return;
      const y1 = ROW_STABLE_Y + TILE_H;
      const y2 = ROW_SELECTION_Y;
      stable.forEach((label, fromCol) => {
        const toCol = selection.indexOf(label);
        if (toCol < 0) return;
        const x1 = colX(fromCol) + tileW / 2;
        const x2 = colX(toCol) + tileW / 2;
        const isMark = s.marked && flagged.has(label);
        const path = el('path', {
          d: `M ${x1} ${y1} C ${x1} ${y1 + THREAD_BOW} ${x2} ${y2 - THREAD_BOW} ${x2} ${y2}`,
          fill: 'none',
          // 어긋난 짝이 짚인 뒤에는 나란한 실이 물러나고 엇갈린 실만 남는다.
          // **머무는 표식이라 정적으로 세운다** — 이 조각의 결론이 여기 있다.
          stroke: s.marked ? (isMark ? c.itemSwapping : c.border) : c.textMuted,
          'stroke-width': isMark ? STROKE_MARK : STROKE_THREAD,
          'stroke-linecap': 'round',
        });
        threadLayer.appendChild(path);
        threadPaths.set(label, path);

        let len = 0;
        let px = x1;
        let py = y1;
        for (let k = 1; k <= ARC_STEPS; k += 1) {
          const u = k / ARC_STEPS;
          const qx = cubicAt(u, x1, x1, x2, x2);
          const qy = cubicAt(u, y1, y1 + THREAD_BOW, y2 - THREAD_BOW, y2);
          len += Math.hypot(qx - px, qy - py);
          px = qx;
          py = qy;
        }
        threadLengths.set(label, len);
      });
    }

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of rebuilt) layer.replaceChildren();
      stableTiles = new Map();
      selectionTiles = new Map();
      threadPaths = new Map();
      threadLengths = new Map();
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 빈 자리 · 실 · 세 줄의 타일이 모두 여기서 난다. **머무는 표식**(어긋난 짝의
     * 테두리와 굵어진 실)을 여기 넣어야 되짚었을 때도, 다 끝난 화면에도 남는다.
     */
    function drawStatic(s: SortStabilityScene): void {
      const n = s.items.length;
      layout(n);
      buildSlots(n);

      const flagged = new Set(s.marked ? mismatchedLabels(s) : []);
      // 실은 타일 아래에 깔린다. 층이 이미 갈려 있으므로 순서를 걱정하지 않는다.
      if (s.threaded) buildThreads(s, flagged);

      buildRow(
        s,
        s.items.map((item) => item.label),
        ROW_INPUT_Y,
        { source: true, tagged: true, flagged: new Set<string>() },
        null,
      );
      // 아직 갈라져 나오지 않은 줄은 짓지 않는다 — 빈 자리만 남는다.
      if (s.stable !== null) {
        buildRow(
          s,
          s.stable,
          ROW_STABLE_Y,
          { source: false, tagged: !s.tagsHidden, flagged },
          stableTiles,
        );
      }
      if (s.selection !== null) {
        buildRow(
          s,
          s.selection,
          ROW_SELECTION_Y,
          { source: false, tagged: !s.tagsHidden, flagged },
          selectionTiles,
        );
      }
    }

    // ── 캡션. 장면은 무엇을 말할지만 담고 문자는 여기서 만든다 (C10).

    function captionText(cap: SortStabilityCaption): string {
      switch (cap.kind) {
        case 'input':
          return t('caption.input', 'Four items. Each carries a name tag and a value.');
        case 'stable':
          return t(
            'caption.stable',
            'Stable sort — items of equal value keep their input order.',
          );
        case 'selection':
          return t('caption.selection', 'Selection sort — swap the smallest one to the front.');
        case 'tagsHidden':
          return t(
            'caption.tagsHidden',
            'Hide the name tags and the two rows read exactly the same.',
          );
        case 'linkOrigin':
          return t('caption.linkOrigin', 'Link each item to where it came from: one pair crosses.');
        case 'mismatch':
          return t(
            'caption.mismatch',
            'Only the top row kept the input order of the two {value}s — that is stability.',
            { value: cap.value },
          );
      }
    }

    function drawCaption(cap: SortStabilityCaption | null): void {
      caption.textContent = cap === null ? '' : captionText(cap);
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 모습을 세워 두었으므로, 흐르게 할 때만
    //    출발 모습으로 되돌려 놓고 시작한다. 출발 모습은 전부 장면에서 셈한다 —
    //    `prev` 에서 꺼내지 않는다 (S-scene).

    const foldTo = (chips: readonly SVGGElement[], k: number): void => {
      const transform = `translate(${CHIP_X} ${CHIP_Y}) scale(${k} 1)`;
      for (const chip of chips) {
        chip.setAttribute('transform', transform);
        chip.setAttribute('opacity', String(k));
      }
    };

    /**
     * 그 줄이 입력 줄에서 갈라져 내려앉는다. 자리를 실제로 옮기는 것이 이 조각의
     * 동사다.
     *
     * 항목마다 조금씩 어긋나게 떠나지만 **시계는 하나다** — 나누면 나란함이 우연히
     * 맞는 꼴이 되고, 하나를 `void` 로 흘릴 여지가 생긴다 (S-scene).
     */
    function fanOut(s: SortStabilityScene, row: SortStabilityRow, mine: number): Promise<void> {
      const order = row === 'stable' ? s.stable : s.selection;
      if (order === null) return Promise.resolve();
      const y = rowY(row);
      const tiles = tilesOf(row);

      const moving: { g: SVGGElement; sx: number; dx: number; delay: number }[] = [];
      order.forEach((label, dest) => {
        const tile = tiles.get(label);
        const from = originColumn(s, label);
        if (tile === undefined || from < 0) return;
        moving.push({ g: tile.g, sx: colX(from), dx: colX(dest), delay: dest * TRAVEL_STAGGER_MS });
      });
      if (moving.length === 0) return Promise.resolve();

      // 첫 프레임에 끝 자리가 번쩍이지 않게 미리 물려 둔다.
      for (const m of moving) place(m.g, m.sx, ROW_INPUT_Y);

      const total = TRAVEL_MS + TRAVEL_STAGGER_MS * Math.max(0, order.length - 1);
      return animate(total, mine, (p) => {
        const elapsed = p * total;
        for (const m of moving) {
          const e = ease(clamp01((elapsed - m.delay) / TRAVEL_MS));
          place(m.g, m.sx + (m.dx - m.sx) * e, ROW_INPUT_Y + (y - ROW_INPUT_Y) * e);
        }
      });
    }

    /**
     * 이름표가 접힌다. 값만 남으면 두 결과 줄이 글자 하나 다르지 않게 같아진다.
     *
     * 접힌 뒤의 화면에는 칩이 **없으므로**(짓지 않는다) 접히는 동안만 잠깐 짓는다.
     * 운동 뒤 재건이 통째로 거둔다.
     */
    function fold(s: SortStabilityScene, mine: number): Promise<void> {
      const chips: SVGGElement[] = [];
      for (const row of ['stable', 'selection'] as const) {
        for (const [label, tile] of tilesOf(row)) {
          if (tile.chip !== null) continue;
          const chip = makeChip(label, originColumn(s, label));
          tile.g.insertBefore(chip, tile.rect.nextSibling);
          chips.push(chip);
        }
      }
      if (chips.length === 0) return Promise.resolve();
      return animate(FOLD_MS, mine, (p) => foldTo(chips, 1 - ease(p)));
    }

    /**
     * 이름표가 도로 펴지고, 같은 항목끼리 실이 이어진다.
     *
     * 뜻이 다른 두 마디라 차례로 흐른다 — 하나로 묶인 운동이 아니므로 `Promise.all`
     * 로 겹치지 않는다. 둘 다 `await` 를 지나므로 이 함수의 Promise 는 두 마디가
     * 다 선 뒤에 풀린다.
     */
    async function linkOrigin(mine: number): Promise<void> {
      const chips: SVGGElement[] = [];
      for (const row of ['stable', 'selection'] as const) {
        for (const tile of tilesOf(row).values()) {
          if (tile.chip !== null) chips.push(tile.chip);
        }
      }
      if (chips.length > 0) {
        foldTo(chips, 0);
        await animate(FOLD_MS, mine, (p) => foldTo(chips, ease(p)));
        if (!alive(mine)) return;
      }

      const drawing: { path: SVGPathElement; len: number }[] = [];
      for (const [label, path] of threadPaths) {
        const len = threadLengths.get(label);
        if (len === undefined || len <= 0) continue;
        path.setAttribute('stroke-dasharray', String(len));
        path.setAttribute('stroke-dashoffset', String(len));
        drawing.push({ path, len });
      }
      if (drawing.length === 0) return;
      await animate(THREAD_MS, mine, (p) => {
        const e = ease(p);
        for (const one of drawing) {
          one.path.setAttribute('stroke-dashoffset', String(one.len * (1 - e)));
        }
      });
    }

    /**
     * 어긋난 짝을 짚는다. 엇갈린 실과 그 실이 잇는 네 타일이 함께 부풀었다 돌아온다.
     *
     * 두 결과 줄을 한꺼번에 짚는 **한 뜻의 운동**이라 **한 시계**로 돈다.
     */
    function pulse(s: SortStabilityScene, mine: number): Promise<void> {
      const flagged = new Set(mismatchedLabels(s));
      const marked: Element[] = [];
      for (const label of flagged) {
        const path = threadPaths.get(label);
        if (path !== undefined) marked.push(path);
      }
      for (const row of ['stable', 'selection'] as const) {
        for (const [label, tile] of tilesOf(row)) {
          if (flagged.has(label)) marked.push(tile.rect);
        }
      }
      if (marked.length === 0) return Promise.resolve();
      return animate(PULSE_MS, mine, (p) => {
        // 끝에서는 보간값이 아니라 상수를 그대로 쓴다 — `sin(π)` 의 끝자리가
        // 문자열을 가른다.
        const width = p >= 1 ? STROKE_MARK : STROKE_MARK + PULSE_SWELL * Math.sin(p * Math.PI);
        for (const node of marked) node.setAttribute('stroke-width', String(width));
      });
    }

    function flow(s: SortStabilityScene, mine: number): Promise<void> {
      const step = s.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'fanOut':
          return fanOut(s, step.row, mine);
        case 'fold':
          return fold(s, mine);
        case 'link':
          return linkOrigin(mine);
        case 'mark':
          return pulse(s, mine);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 것만 흐르게 한다.
     * 흐름이 끝나면 장면을 **통째로 다시 세운다** — 보간의 끝자리와 흐르며 얹힌
     * 임시 속성(칩의 `scale`·`opacity`, 실의 `stroke-dasharray`, 부푼 굵기)이
     * 한꺼번에 사라져, 흐른 화면과 곧바로 세운 화면이 갈리지 않는다.
     *
     * `prev` 는 쓰지 않는다. 출발 모습이 필요한 운동은 전부 장면에서 셈한다.
     */
    async function render(
      next: SortStabilityScene,
      _prev: SortStabilityScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      rewind();
      drawStatic(next);
      drawCaption(next.caption);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, mine);
      if (!alive(mine)) return;
      rewind();
      drawStatic(next);
      drawCaption(next.caption);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        if (typeof cancelAnimationFrame === 'function') {
          for (const id of frames) cancelAnimationFrame(id);
        }
        frames.clear();
        // 걸린 것을 거두는 것만으로는 모자라다 — 취소된 tick 은 아예 불리지
        // 않으므로 기다리던 약속을 여기서 깨운다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        rewind();
        drawCaption(null);
        for (const layer of [...rebuilt, fixedLayer]) layer.remove();
      },
    };
  },
};
