/**
 * all-suffixes-sorted-stage — 꼬리들이 줄을 서는 그림.
 *
 * 화면은 두 자리로 갈린다.
 *   왼쪽  원본 문자열과 거기서 떨어져 나온 꼬리들. 꼬리 i 는 문자열의 칸 i 바로
 *         아래에서 시작하므로 처음에는 계단 모양이 된다.
 *   오른쪽 줄. 사전 순으로 다음 차례인 꼬리가 하나씩 건너와 제 자리에 선다.
 *
 * 동사가 "줄 선다" 이므로 운동은 전부 자리 옮김이다 — 문자열에서 떨어지고(세로),
 * 왼끝을 맞추고(가로), 줄로 건너간다(가로+세로). 색은 그 위에 얹히는 표시일 뿐이다.
 *
 * 가로는 러너가 PIECE_CANVAS_W 로 정하므로 여기 적지 않고, 칸 크기는 그 폭에서
 * 역산한다. 세로만 이 파일의 상수다 (S-piece).
 *
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`cutTails()` · `alignLeft()` · `takePlace()`) 를 두지
 * 않는다. 그 메서드들은 되돌릴 수 없는 명령이라, 임의의 걸음으로 가려면 처음부터
 * 다시 밟는 수밖에 없었다. 대신 `render` 하나가 장면을 받아 화면 **전체**를 세우고,
 * 방금 달라진 것만 흐르게 한다 (S-scene).
 *
 * 정적 그리기가 정본이므로 운동의 방향이 뒤집힌다 — 줄은 이미 끝 자리에 서 있고,
 * 흐르게 할 때만 출발 그림으로 되돌려 놓고 시작한다. **출발 자리는 `prev` 를 들추지
 * 않고 장면에서 셈한다** — 아직 줄에 앉지 않은 꼬리는 왼끝을 맞췄으면 왼쪽 자리에,
 * 아니면 제 계단 자리에 있다. 옮기기 전에는 그것을 `pos` 라는 **화면의 거울**에
 * 적어 두고 거기서 꺼냈고, 되짚어 세운 직후에는 그 표가 옛 화면의 것이라 줄이
 * 엉뚱한 자리에서 출발했다 (프로토콜 4 절의 "DOM 의 거울").
 *
 * ## 채움과 테두리를 가른다
 *
 * **채움은 꼬리의 형편** — 아직 줄 밖(`itemDefault`) · 건너가는 중(`itemActive`) ·
 * 줄에 앉았다(`itemSorted`). **테두리는 나눠 가진 앞머리의 표식** — 한 덩어리로
 * 모인 꼬리들의 같은 앞머리 칸에만 강조 테를 두른다.
 *
 * 옮기기 전에는 그 표식이 **채움**이었다(`fill: accent`). 한 축에 두 뜻이 실려서,
 * 덩어리를 짚는 순간 그 칸들이 "줄에 앉았다" 를 잃었다 — 이 조각의 결론이 바로
 * "줄에 앉고 나니 이웃하더라" 인데 그 둘을 한 화면에서 볼 수 없었다.
 *
 * ## 타이머
 *
 * 이동은 rAF 보간이고, 걸어 둔 프레임과 기다리는 것을 `frames` · `waiters` 에 모아
 * `destroy()` 에서 전부 거둔다 — 취소된 프레임은 아예 불리지 않아 promise 를 풀 길이
 * 사라지고, 그러면 `await ctx.emit` 이 영영 돌아오지 않는다 (S-piece).
 */

import {
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type {
  AllSuffixesSortedCaption,
  AllSuffixesSortedScene,
  AllSuffixesSortedStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 세로는 내용이 정한다 — 글자 칸 한 줄 + 꼬리 여섯 줄 + 캡션 한 줄. */
const CANVAS_H = 348;

const PAD_X = 22;
const LANE_GAP = 44;
const CHIP_W = 26;
const CHIP_GAP = 8;
const CELL_MAX_W = 40;
const ROW_H = 30;
const ROW_GAP = 8;

const NUM_Y = 22;
const SOURCE_Y = 28;
const LABEL_Y = 80;
const ROWS_Y = 90;
const CAPTION_Y = 334;

const CUT_MS = 620;
const ALIGN_MS = 460;
const TRAVEL_MS = 480;
const CLUSTER_MS = 380;
/** 줄로 건너갈 때 살짝 떠오르는 높이 — 자리를 뜨는 몸짓. */
const LIFT = 12;
/** 꼬리 하나가 떨어지는 데 쓰는 몫. 나머지는 여섯이 차례로 물리는 데 쓴다. */
const CUT_WINDOW = 0.45;
/** 덩어리 띠가 줄 바깥으로 물러나는 여백. */
const BAND_PAD = 6;
/** 나눠 가진 앞머리를 두르는 테의 굵기. */
const MARK_W = 2.5;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function ease(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
}

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name) as SVGElementTagNameMap[K];
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

type TextSpec = {
  x: number;
  y: number;
  size: string;
  fill: string;
  family: string;
  anchor?: 'start' | 'middle';
};

function textNode(spec: TextSpec, content: string): SVGTextElement {
  const node = el('text', {
    x: spec.x,
    y: spec.y,
    fill: spec.fill,
    'font-family': spec.family,
    'font-size': spec.size,
    'text-anchor': spec.anchor ?? 'middle',
    'dominant-baseline': 'middle',
  });
  node.textContent = content;
  return node;
}

/**
 * 캔버스 폭에서 역산한 자리들. 장면의 바탕 글 길이 하나가 전부 정한다.
 *
 * 이름이 `Scene` 이 아니라 `Layout` 인 까닭은 장면 쪽에 이미 그 이름이 있기
 * 때문이다 — 같은 파일에 두 뜻이 겹치면 읽는 사람이 헷갈린다.
 */
type Layout = {
  n: number;
  cellW: number;
  chipBlock: number;
  poolCellsX: number;
  lineCellsX: number;
  rowY: (k: number) => number;
};

function layoutFor(n: number): Layout {
  const laneW = Math.floor((PIECE_CANVAS_W - PAD_X * 2 - LANE_GAP) / 2);
  const chipBlock = CHIP_W + CHIP_GAP;
  const cellW = Math.min(CELL_MAX_W, Math.floor((laneW - chipBlock) / Math.max(1, n)));
  return {
    n,
    cellW,
    chipBlock,
    poolCellsX: PAD_X + chipBlock,
    lineCellsX: PAD_X + laneW + LANE_GAP + chipBlock,
    rowY: (k: number): number => ROWS_Y + k * (ROW_H + ROW_GAP),
  };
}

/** 꼬리의 형편. 채움이 말하는 것이지 표식이 아니다. */
type TailTone = 'waiting' | 'moving' | 'placed';

function toneOf(tone: TailTone, c: Palette): { fill: string; ink: string; stroke: string } {
  if (tone === 'moving') return { fill: c.itemActive, ink: c.stateInk, stroke: c.border };
  if (tone === 'placed') return { fill: c.itemSorted, ink: c.textInverse, stroke: c.itemSorted };
  return { fill: c.itemDefault, ink: c.text, stroke: c.border };
}

/** 꼬리 하나의 손잡이. 걸음이 색을 갈아 끼울 때만 쓴다. */
type RowHandle = {
  g: SVGGElement;
  rects: SVGRectElement[];
  glyphs: SVGTextElement[];
  chip: SVGTextElement;
};

export const allSuffixesSortedStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<AllSuffixesSortedScene> {
    const canvas = params.canvas;
    // 캔버스 *안쪽* 만 비운다. 컨테이너를 비우면 캔버스가 통째로 떨어져 나간다 (S-view).
    canvas.textContent = '';

    const c = getColors(params.theme);
    // 장면은 문안을 담지 않으므로 문자는 여기서 만든다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    const root = el('g');
    canvas.appendChild(root);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호 — 세대 빗장.
     *
     * 걸음 함수가 `await` 를 지나므로, 되짚기가 가운데 끼어들면 남은 프레임이 이미
     * 새로 선 화면을 덮는다. 정적 그리기가 줄을 매번 새로 짓기는 하지만 살아남은
     * 운동이 쥔 것은 손잡이 변수가 아니라 **노드**라, 빗장 없이 두면 옛 세대가 제가
     * 쥔 노드를 계속 민다. 마디마다 자기 번호가 유효한지 보고 아니면 화면에 손대지
     * 않고 물러난다 (S-scene).
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다.
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 취소 가능한 시간 진행.
     *
     * 깨워서 끝낼 때는 아무것도 그리지 않는다 — 끝값을 쓰면 그것이 곧 덮어쓰기다.
     */
    function animate(ms: number, onFrame: (p: number) => void, live: () => boolean): Promise<void> {
      if (!live()) return Promise.resolve();
      if (destroyed || typeof requestAnimationFrame !== 'function') {
        onFrame(1);
        return Promise.resolve();
      }
      onFrame(0);
      return new Promise<void>((resolve) => {
        let id = 0;
        let origin = -1;
        let settled = false;
        const finish = (): void => {
          if (settled) return;
          settled = true;
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (now: number): void => {
          frames.delete(id);
          if (settled) return;
          if (destroyed || !live()) {
            finish();
            return;
          }
          if (origin < 0) origin = now;
          const p = ms <= 0 ? 1 : clamp01((now - origin) / ms);
          onFrame(p);
          if (p >= 1) {
            finish();
            return;
          }
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    // ── 장면이 정하는 것들. 매 render 마다 새로 세운다.
    let geo: Layout | null = null;
    let rowHandles: (RowHandle | null)[] = [];
    let bandNode: SVGRectElement | null = null;
    let markNodes: SVGRectElement[] = [];

    function place(node: SVGGraphicsElement, x: number, y: number): void {
      node.setAttribute('transform', `translate(${Math.round(x)}, ${Math.round(y)})`);
    }

    function paintRow(i: number, tone: TailTone): void {
      const row = rowHandles[i];
      if (!row) return;
      const paint = toneOf(tone, c);
      for (const rect of row.rects) {
        rect.setAttribute('fill', paint.fill);
        rect.setAttribute('stroke', paint.stroke);
      }
      for (const glyph of row.glyphs) glyph.setAttribute('fill', paint.ink);
      row.chip.setAttribute('fill', tone === 'waiting' ? c.textMuted : c.text);
    }

    // ── 장면에서 셈하는 것들 ────────────────────────────────────────────────
    //
    // 화면의 지금 자리를 따로 적어 두지 않는다. 그 표는 되짚어 세운 직후에 옛 화면의
    // 것이라 운동이 엉뚱한 자리에서 출발한다 (프로토콜 4 절).

    /** 꼬리 `i` 가 이 장면에서 서 있는 자리. */
    function rowSpot(scene: AllSuffixesSortedScene, g: Layout, i: number): { x: number; y: number } {
      const rank = scene.placed.indexOf(i);
      if (rank >= 0) return { x: g.lineCellsX, y: g.rowY(rank) };
      if (scene.aligned) return { x: g.poolCellsX, y: g.rowY(i) };
      return { x: g.poolCellsX + i * g.cellW, y: g.rowY(i) };
    }

    /** 덩어리 띠가 덮는 네모. 정적 그리기와 걸음이 같은 셈을 쓴다. */
    function bandBox(
      ranks: readonly number[],
      g: Layout,
    ): { x: number; y: number; width: number; height: number } {
      const top = g.rowY(Math.min(...ranks)) - BAND_PAD;
      const bottom = g.rowY(Math.max(...ranks)) + ROW_H + BAND_PAD;
      return {
        x: g.lineCellsX - g.chipBlock - BAND_PAD,
        y: top,
        width: g.chipBlock + g.n * g.cellW + BAND_PAD * 2,
        height: bottom - top,
      };
    }

    // ── 정적 그리기 ────────────────────────────────────────────────────────

    function clear(): void {
      root.textContent = '';
      rowHandles = [];
      markNodes = [];
      bandNode = null;
    }

    /** 줄 자리를 미리 그어 둔다. 건너올 곳이 보여야 "줄" 로 읽힌다. */
    function drawLaneGuides(g: Layout): void {
      for (let k = 0; k < g.n; k += 1) {
        root.appendChild(
          el('line', {
            x1: g.lineCellsX - g.chipBlock,
            y1: g.rowY(k) + ROW_H + 3,
            x2: g.lineCellsX + g.n * g.cellW,
            y2: g.rowY(k) + ROW_H + 3,
            stroke: c.border,
            'stroke-width': 1,
            'stroke-dasharray': '3 5',
          }),
        );
      }
    }

    /**
     * 앞머리가 같은 구간을 덮을 띠. 줄보다 뒤에 있어야 하므로 먼저 붙인다.
     *
     * 덩어리가 아직 없으면 **숨기지 않고 짓지 않는다** — 높이 0 짜리 네모를 두면
     * 운동이 남긴 속성이 그 위에 쌓인다 (프로토콜 4 절).
     */
    function drawBand(scene: AllSuffixesSortedScene, g: Layout): void {
      if (scene.cluster === null || scene.cluster.ranks.length === 0) return;
      const box = bandBox(scene.cluster.ranks, g);
      const node = el('rect', {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        rx: 8,
        fill: c.sortedTailBg,
        stroke: c.sortedTailBorder,
        'stroke-width': 1,
      });
      root.appendChild(node);
      bandNode = node;
    }

    /** 원본 문자열. 꼬리들은 이 칸들 바로 아래에서 시작한다. */
    function drawSource(scene: AllSuffixesSortedScene, g: Layout): void {
      for (let i = 0; i < g.n; i += 1) {
        const x = g.poolCellsX + i * g.cellW;
        root.appendChild(
          textNode(
            { x: x + g.cellW / 2, y: NUM_Y, size: fontSizes.xs, fill: c.textMuted, family: fonts.mono },
            String(i),
          ),
        );
        root.appendChild(
          el('rect', {
            x,
            y: SOURCE_Y,
            width: g.cellW,
            height: ROW_H,
            rx: 4,
            fill: c.bgSubtle,
            stroke: c.border,
            'stroke-width': 1,
          }),
        );
        root.appendChild(
          textNode(
            {
              x: x + g.cellW / 2,
              y: SOURCE_Y + ROW_H / 2,
              size: fontSizes.lg,
              fill: c.text,
              family: fonts.mono,
            },
            scene.text.charAt(i),
          ),
        );
      }
    }

    /** 두 자리의 이름. */
    function drawLaneLabels(g: Layout): void {
      root.appendChild(
        textNode(
          {
            x: PAD_X,
            y: LABEL_Y,
            size: fontSizes.sm,
            fill: c.textMuted,
            family: fonts.body,
            anchor: 'start',
          },
          t('label.byPosition', 'By position'),
        ),
      );
      root.appendChild(
        textNode(
          {
            x: g.lineCellsX - g.chipBlock,
            y: LABEL_Y,
            size: fontSizes.sm,
            fill: c.textMuted,
            family: fonts.body,
            anchor: 'start',
          },
          t('label.inOrder', 'In order'),
        ),
      );
    }

    /** 꼬리 하나를 짓는다. 아직 잘리지 않았으면 부르지 않는다 — 짓지 않는다. */
    function buildRow(scene: AllSuffixesSortedScene, g: Layout, i: number): RowHandle {
      const group = el('g');
      group.appendChild(
        el('rect', {
          x: -g.chipBlock,
          y: 4,
          width: CHIP_W,
          height: ROW_H - 8,
          rx: 5,
          fill: c.bgSubtle,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );
      const chip = textNode(
        {
          x: -g.chipBlock + CHIP_W / 2,
          y: ROW_H / 2,
          size: fontSizes.xs,
          fill: c.textMuted,
          family: fonts.mono,
        },
        String(i),
      );
      group.appendChild(chip);

      const rects: SVGRectElement[] = [];
      const glyphs: SVGTextElement[] = [];
      for (let j = 0; j < g.n - i; j += 1) {
        const rect = el('rect', {
          x: j * g.cellW,
          y: 0,
          width: g.cellW,
          height: ROW_H,
          rx: 4,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 1,
        });
        const glyph = textNode(
          {
            x: j * g.cellW + g.cellW / 2,
            y: ROW_H / 2,
            size: fontSizes.lg,
            fill: c.text,
            family: fonts.mono,
          },
          scene.text.charAt(i + j),
        );
        group.appendChild(rect);
        group.appendChild(glyph);
        rects.push(rect);
        glyphs.push(glyph);
      }
      root.appendChild(group);
      return { g: group, rects, glyphs, chip };
    }

    /**
     * 나눠 가진 앞머리를 두르는 테. **남는 표식이라 정적 그리기가 세운다.**
     *
     * 채움을 건드리지 않고 그 위에 겹쳐 두른다 — 채움은 꼬리의 형편을 말하는 축이고
     * 이것은 표식의 축이라, 한 축에 두 뜻을 실으면 어느 쪽도 읽히지 않는다.
     */
    function drawPrefixMarks(scene: AllSuffixesSortedScene, g: Layout): void {
      const run = scene.cluster;
      if (run === null) return;
      const shared = Math.max(1, run.prefix.length);
      for (const rank of run.ranks) {
        const i = scene.placed[rank];
        if (i === undefined) continue;
        const row = rowHandles[i];
        if (!row) continue;
        for (let j = 0; j < shared && j < row.rects.length; j += 1) {
          const mark = el('rect', {
            x: j * g.cellW,
            y: 0,
            width: g.cellW,
            height: ROW_H,
            rx: 4,
            fill: 'none',
            stroke: c.accent,
            'stroke-width': MARK_W,
          });
          row.g.appendChild(mark);
          markNodes.push(mark);
        }
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function captionText(kind: AllSuffixesSortedCaption, text: string): string {
      switch (kind.kind) {
        case 'cutTails':
          return t('caption.cutTails', 'Cut at every position — each cut leaves a tail.');
        case 'alignLeft':
          return t('caption.alignLeft', 'Line up the left edges — now the tails can be compared.');
        case 'takePlace':
          return t('caption.takePlace', 'Next in line: {tail}', { tail: text.slice(kind.from) });
        case 'cluster':
          return t(
            'caption.cluster',
            'Tails that start alike now sit together — one stretch to search.',
          );
      }
    }

    function drawCaption(scene: AllSuffixesSortedScene): void {
      root.appendChild(
        textNode(
          {
            x: PIECE_CANVAS_W / 2,
            y: CAPTION_Y,
            size: fontSizes.md,
            fill: c.text,
            family: fonts.body,
          },
          scene.caption === null ? '' : captionText(scene.caption, scene.text),
        ),
      );
    }

    function drawStatic(scene: AllSuffixesSortedScene): void {
      clear();
      const g = layoutFor(scene.text.length);
      geo = g;

      drawLaneGuides(g);
      drawBand(scene, g);
      drawSource(scene, g);
      drawLaneLabels(g);

      // 자리를 먼저 한 번에 셈하고 그 다음에 그린다. 그리면서 이웃의 지금 좌표를
      // 재면 순회 순서가 곧 숨은 상태가 된다.
      if (scene.cut) {
        for (let i = 0; i < g.n; i += 1) {
          const row = buildRow(scene, g, i);
          rowHandles[i] = row;
          const spot = rowSpot(scene, g, i);
          place(row.g, spot.x, spot.y);
        }
        for (let i = 0; i < g.n; i += 1) {
          paintRow(i, scene.placed.includes(i) ? 'placed' : 'waiting');
        }
        drawPrefixMarks(scene, g);
      }

      drawCaption(scene);
    }

    // ── 걸음 함수 ──────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 출발 그림으로 되돌려
    // 놓고 시작해 끝 자리까지 흘린다.

    /** 자리마다 한 줄씩 흘려 떨어뜨린다 — 여섯이 한꺼번에 쏟아지면 세기지 않는다. */
    function flowCut(g: Layout, live: () => boolean): Promise<void> {
      return animate(
        CUT_MS,
        (p) => {
          for (let i = 0; i < g.n; i += 1) {
            const row = rowHandles[i];
            if (!row) continue;
            const begin = g.n > 1 ? (i / (g.n - 1)) * (1 - CUT_WINDOW) : 0;
            const q = ease(clamp01((p - begin) / CUT_WINDOW));
            row.g.setAttribute('opacity', String(q));
            place(row.g, g.poolCellsX + i * g.cellW, SOURCE_Y + (g.rowY(i) - SOURCE_Y) * q);
          }
        },
        live,
      );
    }

    /** 왼끝을 맞춘다. 여섯이 한 시계로 함께 미끄러져야 "맞춘다" 로 읽힌다. */
    function flowAlign(g: Layout, live: () => boolean): Promise<void> {
      return animate(
        ALIGN_MS,
        (p) => {
          const e = ease(p);
          for (let i = 0; i < g.n; i += 1) {
            const row = rowHandles[i];
            if (!row) continue;
            const x0 = g.poolCellsX + i * g.cellW;
            place(row.g, x0 + (g.poolCellsX - x0) * e, g.rowY(i));
          }
        },
        live,
      );
    }

    /**
     * 꼬리 하나가 줄로 건너간다.
     *
     * 출발 자리는 장면이 말한다 — 아직 앉지 않은 꼬리는 왼끝을 맞췄으면 왼쪽 자리에,
     * 아니면 제 계단 자리에 있다. `prev` 를 들추지 않는다 (S-scene).
     */
    async function flowPlace(
      step: Extract<AllSuffixesSortedStep, { kind: 'place' }>,
      scene: AllSuffixesSortedScene,
      g: Layout,
      live: () => boolean,
    ): Promise<void> {
      const row = rowHandles[step.from];
      if (!row) return;
      const startX = scene.aligned ? g.poolCellsX : g.poolCellsX + step.from * g.cellW;
      const startY = g.rowY(step.from);
      const endY = g.rowY(step.rank);
      paintRow(step.from, 'moving');
      await animate(
        TRAVEL_MS,
        (p) => {
          const e = ease(p);
          const lift = -LIFT * Math.sin(Math.PI * p);
          place(row.g, startX + (g.lineCellsX - startX) * e, startY + (endY - startY) * e + lift);
        },
        live,
      );
    }

    /**
     * 덩어리를 짚는다. 띠가 자라는 것과 앞머리 테가 드러나는 것이 한 뜻이라
     * **시계를 둘로 나누지 않는다** (프로토콜 3 절).
     */
    function flowCluster(
      scene: AllSuffixesSortedScene,
      g: Layout,
      live: () => boolean,
    ): Promise<void> {
      const band = bandNode;
      const run = scene.cluster;
      if (band === null || run === null) return Promise.resolve();
      const box = bandBox(run.ranks, g);
      const marks = markNodes;
      return animate(
        CLUSTER_MS,
        (p) => {
          const e = ease(p);
          band.setAttribute('height', String(Math.round(box.height * e)));
          for (const mark of marks) mark.setAttribute('opacity', String(e));
        },
        live,
      );
    }

    // ── 장면 그리기 ────────────────────────────────────────────────────────

    async function render(
      next: AllSuffixesSortedScene,
      _prev: AllSuffixesSortedScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => alive(mine);

      drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;

      const step = next.step;
      const g = geo;
      if (step === null || g === null) return;

      switch (step.kind) {
        case 'cut':
          await flowCut(g, live);
          break;
        case 'align':
          await flowAlign(g, live);
          break;
        case 'place':
          await flowPlace(step, next, g, live);
          break;
        case 'cluster':
          await flowCluster(next, g, live);
          break;
      }

      if (!live()) return;
      // 흐르며 남은 opacity·보간의 끝자리가 통째로 사라진다. 정적 경로가 두 번
      // 그려도 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다.
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다. 취소된 프레임은 아예 불리지 않아 이 길이 없으면
        // `await ctx.emit` 이 영영 돌아오지 않는다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
