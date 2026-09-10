/**
 * random-forest-stage — 확신 밭 · 나무 띠 · 물음점의 표를 한 폭에 그린다.
 *
 * 왼쪽은 평면이다. 32×32 격자 칸마다 앞에서부터 `size` 그루가 던진 표를 받아,
 * **이긴 쪽 색으로 칠하되 얼마나 이겼는지를 짙기로 낸다.** 만장일치면 짙고,
 * 표가 갈릴수록 옅어진다. 나무가 하나뿐이면 표는 언제나 만장일치라 평면 전체가
 * 고르게 짙고, 그것이 "나무 하나는 어디서나 100% 확신한다" 의 그림이다. 숲이
 * 커지면 경계 부근에 옅은 띠가 생긴다.
 *
 * 오른쪽은 셈의 장부다. 기른 나무 띠 · 물음점이 받은 표 · 확신 눈금.
 * 물음점 하나를 나무마다 태워 내려가는 동안, 그 점을 담고 있는 영역이 한 축씩
 * 좁아지는 것을 평면 위 점선 네모로 보인다 — 코드 패널의 while 루프가 도는
 * 것과 같은 것이다.
 *
 * ── 크기
 *
 * viewBox 는 마운트에서 한 번 정해지고 그 뒤로 바뀌지 않는다. 내용이 늘어도
 * (나무가 자라도) 자리는 처음부터 열여섯 칸을 잡아 두었다 (S-view).
 *
 * ── 뒷일
 *
 * 타이머도 프레임 루프도 관찰자도 쓰지 않는다. 모든 갱신은 projector 가 부르는
 * 메서드 안에서 곧바로 끝난다. `destroy()` 는 자기가 만든 노드만 거둔다.
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type Palette,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const CANVAS_W = 680;
const CANVAS_H = 400;

/** 평면. 왼쪽 정사각형 한 폭. */
const PLANE = { x: 40, y: 20, side: 300 };
/** 오른쪽 장부. */
const PANEL_X = 372;
const PANEL_W = 268;

const SLOT = 18;
const SLOT_GAP = 5;
const SLOTS_PER_ROW = 8;
const SLOT_Y1 = 42;
const SLOT_Y2 = SLOT_Y1 + SLOT + SLOT_GAP;

const BAR_X = PANEL_X + 20;
const BAR_W = PANEL_W - 20;
const BAR_H = 16;
const BAR_A_Y = 134;
const BAR_B_Y = BAR_A_Y + BAR_H + 6;

const RAMP_Y = 230;
const RAMP_H = 12;
const RAMP_STEPS = 10;

const CAPTION_Y1 = 356;
const CAPTION_Y2 = 374;
/** 한 줄에 담기는 글자 폭 (전각은 둘로 센다). 12px 글자 600px 기준. */
const CAPTION_WIDTH = 92;

/** 두 갈래를 가르는 색. A 와 B 는 도형에 새겨지는 표식이라 번역하지 않는다. */
const CLASS_MARK = ['A', 'B'] as const;

type Point = { x: number; y: number; label: number };

type Scene = {
  points: Point[];
  gridSize: number;
  planeMax: number;
  treeCount: number;
  probe: { x: number; y: number };
};

function readScene(initial: Record<string, unknown> | undefined): Scene {
  const d = (initial ?? {}) as {
    points?: unknown;
    gridSize?: unknown;
    planeMax?: unknown;
    treeCount?: unknown;
    probe?: unknown;
  };
  const points: Point[] = [];
  if (Array.isArray(d.points)) {
    for (const raw of d.points) {
      if (typeof raw !== 'object' || raw === null) continue;
      const p = raw as { x?: unknown; y?: unknown; label?: unknown };
      if (typeof p.x !== 'number' || typeof p.y !== 'number') continue;
      points.push({ x: p.x, y: p.y, label: p.label === 1 ? 1 : 0 });
    }
  }
  const probeRaw =
    typeof d.probe === 'object' && d.probe !== null
      ? (d.probe as { x?: unknown; y?: unknown })
      : {};
  return {
    points,
    gridSize: typeof d.gridSize === 'number' && d.gridSize > 0 ? d.gridSize : 32,
    planeMax: typeof d.planeMax === 'number' && d.planeMax > 0 ? d.planeMax : 7,
    treeCount: typeof d.treeCount === 'number' && d.treeCount > 0 ? d.treeCount : 16,
    probe: {
      x: typeof probeRaw.x === 'number' ? probeRaw.x : 0,
      y: typeof probeRaw.y === 'number' ? probeRaw.y : 0,
    },
  };
}

/** 전각 글자는 둘로 세는 대략 폭. 캡션을 두 줄에 나눠 담을 때만 쓴다. */
function visualLen(s: string): number {
  let n = 0;
  for (const ch of s) n += ch.codePointAt(0)! > 0x2e7f ? 2 : 1;
  return n;
}

function wrapTwoLines(text: string, width: number): [string, string] {
  if (visualLen(text) <= width) return [text, ''];
  const words = text.split(' ');
  let first = '';
  let rest = '';
  for (const w of words) {
    const candidate = first === '' ? w : `${first} ${w}`;
    if (rest === '' && visualLen(candidate) <= width) first = candidate;
    else rest = rest === '' ? w : `${rest} ${w}`;
  }
  if (first === '') {
    // 띄어쓰기가 없는 언어. 폭에 맞춰 글자 단위로 자른다.
    let acc = '';
    for (const ch of text) {
      if (visualLen(acc + ch) > width) break;
      acc += ch;
    }
    return [acc, text.slice(acc.length)];
  }
  if (visualLen(rest) > width) {
    let acc = '';
    for (const ch of rest) {
      if (visualLen(acc + ch) > width - 1) break;
      acc += ch;
    }
    rest = `${acc}…`;
  }
  return [first, rest];
}

export const randomForestStageView: CanvasView = {
  canvas: { width: CANVAS_W, height: CANVAS_H, fit: 'fill' },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const svg = params.canvas;
    // 컨테이너가 아니라 캔버스 **안쪽**을 비운다 (S-view).
    svg.textContent = '';
    const colors: Palette = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);

    const vivid = categorical(2, 'vivid');
    const pastel = categorical(2, 'pastel');
    const classFill = [vivid[0]!, vivid[1]!];
    const classWash = [pastel[0]!, pastel[1]!];

    const el = <K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number>,
      parent: SVGElement = svg,
    ): SVGElementTagNameMap[K] => {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
      parent.appendChild(node);
      return node;
    };

    const text = (
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end' = 'start',
    ): SVGTextElement =>
      el('text', {
        x,
        y,
        'font-family': fonts.body,
        'font-size': size,
        fill,
        'text-anchor': anchor,
      });

    // ── 평면 좌표 변환. 그림의 좌표는 stage 가 셈한다.
    const sx = (v: number): number => PLANE.x + (v / scene.planeMax) * PLANE.side;
    const sy = (v: number): number => PLANE.y + PLANE.side - (v / scene.planeMax) * PLANE.side;

    el('rect', {
      x: PLANE.x,
      y: PLANE.y,
      width: PLANE.side,
      height: PLANE.side,
      fill: colors.bg,
      stroke: colors.border,
      'stroke-width': 1,
    });

    // ── 확신 밭. 칸은 마운트에서 한 번 만들고 그 뒤로 색만 갈아 끼운다.
    const cellSide = PLANE.side / scene.gridSize;
    const cells: SVGRectElement[] = [];
    const fieldLayer = el('g', { class: 'facet-rf-field' });
    for (let gy = 0; gy < scene.gridSize; gy += 1) {
      for (let gx = 0; gx < scene.gridSize; gx += 1) {
        cells.push(
          el(
            'rect',
            {
              x: PLANE.x + gx * cellSide,
              y: PLANE.y + PLANE.side - (gy + 1) * cellSide,
              width: cellSide + 0.5,
              height: cellSide + 0.5,
              fill: classWash[0]!,
              'fill-opacity': 0,
            },
            fieldLayer,
          ),
        );
      }
    }

    const leafRect = el('rect', {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      fill: classWash[0]!,
      'fill-opacity': 0,
      stroke: 'none',
      'stroke-width': 1.5,
    });
    const walkRect = el('rect', {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      fill: 'none',
      stroke: colors.accent,
      'stroke-width': 2,
      'stroke-dasharray': '5 3',
      opacity: 0,
    });

    const pointLayer = el('g', {});
    for (const p of scene.points) {
      el(
        'circle',
        {
          cx: sx(p.x),
          cy: sy(p.y),
          r: 4.5,
          fill: classFill[p.label]!,
          stroke: colors.bg,
          'stroke-width': 1.5,
        },
        pointLayer,
      );
    }

    // 물음점 — 나무마다 이 점을 태워 내려간다.
    el('circle', {
      cx: sx(scene.probe.x),
      cy: sy(scene.probe.y),
      r: 7,
      fill: 'none',
      stroke: colors.text,
      'stroke-width': 1.8,
    });
    el('circle', {
      cx: sx(scene.probe.x),
      cy: sy(scene.probe.y),
      r: 2,
      fill: colors.text,
    });

    const axisLo = text(PLANE.x, PLANE.y + PLANE.side + 14, fontSizes.xs, colors.textMuted);
    axisLo.textContent = '0';
    const axisHi = text(
      PLANE.x + PLANE.side,
      PLANE.y + PLANE.side + 14,
      fontSizes.xs,
      colors.textMuted,
      'end',
    );
    axisHi.textContent = String(scene.planeMax);

    // ── 장부. 기른 나무 띠.
    const grownLabel = text(PANEL_X, 34, fontSizes.xs, colors.textMuted);
    grownLabel.textContent = tr('label.grown', 'trees grown');

    const slots: SVGRectElement[] = [];
    for (let i = 0; i < scene.treeCount; i += 1) {
      const row = Math.floor(i / SLOTS_PER_ROW);
      const col = i % SLOTS_PER_ROW;
      slots.push(
        el('rect', {
          x: PANEL_X + col * (SLOT + SLOT_GAP),
          y: row === 0 ? SLOT_Y1 : SLOT_Y2,
          width: SLOT,
          height: SLOT,
          rx: 3,
          fill: colors.bg,
          stroke: colors.border,
          'stroke-width': 1,
        }),
      );
    }

    const treeStat = text(PANEL_X, 100, fontSizes.xs, colors.textMuted);

    const votesLabel = text(PANEL_X, 126, fontSizes.xs, colors.textMuted);
    votesLabel.textContent = tr('label.votes', 'votes at the probe point');

    const markA = text(PANEL_X, BAR_A_Y + 12, fontSizes.sm, colors.text);
    markA.textContent = CLASS_MARK[0];
    const markB = text(PANEL_X, BAR_B_Y + 12, fontSizes.sm, colors.text);
    markB.textContent = CLASS_MARK[1];

    el('rect', {
      x: BAR_X,
      y: BAR_A_Y,
      width: BAR_W,
      height: BAR_H,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 1,
    });
    el('rect', {
      x: BAR_X,
      y: BAR_B_Y,
      width: BAR_W,
      height: BAR_H,
      fill: colors.bgSubtle,
      stroke: colors.border,
      'stroke-width': 1,
    });
    const fillA = el('rect', {
      x: BAR_X,
      y: BAR_A_Y,
      width: 0,
      height: BAR_H,
      fill: classFill[0]!,
    });
    const fillB = el('rect', {
      x: BAR_X,
      y: BAR_B_Y,
      width: 0,
      height: BAR_H,
      fill: classFill[1]!,
    });
    const countA = text(BAR_X + BAR_W, BAR_A_Y + 12, fontSizes.sm, colors.text, 'end');
    const countB = text(BAR_X + BAR_W, BAR_B_Y + 12, fontSizes.sm, colors.text, 'end');
    countA.textContent = '0';
    countB.textContent = '0';

    const verdict = text(PANEL_X, 194, fontSizes.sm, colors.text);

    const rampLabel = text(PANEL_X, 222, fontSizes.xs, colors.textMuted);
    rampLabel.textContent = tr('label.sureness', 'how sure the forest is');
    const rampW = PANEL_W / RAMP_STEPS;
    for (let i = 0; i < RAMP_STEPS; i += 1) {
      el('rect', {
        x: PANEL_X + i * rampW,
        y: RAMP_Y,
        width: rampW + 0.5,
        height: RAMP_H,
        fill: classWash[1]!,
        'fill-opacity': 0.12 + (0.78 * i) / (RAMP_STEPS - 1),
      });
    }
    const rampLo = text(PANEL_X, RAMP_Y + RAMP_H + 14, fontSizes.xs, colors.textMuted);
    rampLo.textContent = tr('label.rampSplit', 'split');
    const rampHi = text(
      PANEL_X + PANEL_W,
      RAMP_Y + RAMP_H + 14,
      fontSizes.xs,
      colors.textMuted,
      'end',
    );
    rampHi.textContent = tr('label.rampSure', 'unanimous');

    const seen = text(PANEL_X, 284, fontSizes.xs, colors.textMuted);
    seen.textContent = tr('label.seen', 'looking at {n} of {total} trees', {
      n: 0,
      total: scene.treeCount,
    });

    const caption1 = text(PLANE.x, CAPTION_Y1, fontSizes.sm, colors.text);
    const caption2 = text(PLANE.x, CAPTION_Y2, fontSizes.sm, colors.textMuted);

    // ── 갱신 메서드 ─────────────────────────────────────────────────────────

    let visible = 0;
    let grownCount = 0;

    const paintSlots = (): void => {
      for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i]!;
        if (i >= grownCount) {
          slot.setAttribute('fill', colors.bg);
          slot.setAttribute('stroke', colors.border);
        } else if (i < visible) {
          slot.setAttribute('fill', colors.itemSorted);
          slot.setAttribute('stroke', colors.border);
        } else {
          // 길렀지만 지금 보는 숲에는 들지 않은 나무.
          slot.setAttribute('fill', colors.bgSubtle);
          slot.setAttribute('stroke', colors.textMuted);
        }
      }
    };

    const setActiveSlot = (index: number): void => {
      paintSlots();
      const slot = slots[index];
      if (!slot) return;
      slot.setAttribute('fill', colors.accent);
      slot.setAttribute('stroke', colors.text);
    };

    const placeRect = (
      node: SVGRectElement,
      x0: number,
      x1: number,
      y0: number,
      y1: number,
    ): void => {
      const left = sx(Math.min(x0, x1));
      const right = sx(Math.max(x0, x1));
      const top = sy(Math.max(y0, y1));
      const bottom = sy(Math.min(y0, y1));
      node.setAttribute('x', String(left));
      node.setAttribute('y', String(top));
      node.setAttribute('width', String(Math.max(0, right - left)));
      node.setAttribute('height', String(Math.max(0, bottom - top)));
    };

    const instance: ViewInstance = {
      setGrown(index: number, leaves: number, distinct: number, outOfBag: number): void {
        grownCount = Math.max(grownCount, index + 1);
        paintSlots();
        treeStat.textContent = tr(
          'label.treeStat',
          'tree {t}: {distinct} rows drawn, {left} left out, {leaves} leaves',
          { t: index + 1, distinct, left: outOfBag, leaves },
        );
      },

      setField(votesA: number[], size: number, _splitCells: number, _correct: number): void {
        visible = size;
        paintSlots();
        seen.textContent = tr('label.seen', 'looking at {n} of {total} trees', {
          n: size,
          total: scene.treeCount,
        });
        for (let i = 0; i < cells.length; i += 1) {
          const cell = cells[i]!;
          const a = votesA[i] ?? 0;
          if (size <= 0) {
            cell.setAttribute('fill-opacity', '0');
            continue;
          }
          const b = size - a;
          const winner = b > a ? 1 : 0;
          const share = Math.max(a, b) / size;
          cell.setAttribute('fill', classWash[winner]!);
          cell.setAttribute('fill-opacity', String(0.12 + 0.78 * (2 * share - 1)));
        }
      },

      setTally(votesA: number, votesB: number, size: number): void {
        const denom = Math.max(1, size);
        fillA.setAttribute('width', String((BAR_W * votesA) / denom));
        fillB.setAttribute('width', String((BAR_W * votesB) / denom));
        countA.textContent = String(votesA);
        countB.textContent = String(votesB);
      },

      setWalk(tree: number, x0: number, x1: number, y0: number, y1: number): void {
        if (tree < 0) {
          walkRect.setAttribute('opacity', '0');
          paintSlots();
          return;
        }
        setActiveSlot(tree);
        placeRect(walkRect, x0, x1, y0, y1);
        walkRect.setAttribute('opacity', '1');
      },

      setLeaf(tree: number, x0: number, x1: number, y0: number, y1: number, label: number): void {
        if (tree < 0 || label < 0) {
          leafRect.setAttribute('fill-opacity', '0');
          leafRect.setAttribute('stroke', 'none');
          return;
        }
        placeRect(leafRect, x0, x1, y0, y1);
        leafRect.setAttribute('fill', classWash[label === 1 ? 1 : 0]!);
        leafRect.setAttribute('fill-opacity', '0.55');
        leafRect.setAttribute('stroke', classFill[label === 1 ? 1 : 0]!);
      },

      setVerdict(label: number | null, votesA: number, votesB: number, size: number): void {
        if (label === null) {
          verdict.textContent = '';
          return;
        }
        verdict.textContent = tr('label.verdict', '{size} trees say {mark} ({a} to {b})', {
          size,
          mark: CLASS_MARK[label === 1 ? 1 : 0],
          a: votesA,
          b: votesB,
        });
      },

      setCaption(value: string): void {
        const [a, b] = wrapTwoLines(value, CAPTION_WIDTH);
        caption1.textContent = a;
        caption2.textContent = b;
      },

      resetScene(): void {
        visible = 0;
        grownCount = 0;
        paintSlots();
        for (const cell of cells) cell.setAttribute('fill-opacity', '0');
        walkRect.setAttribute('opacity', '0');
        leafRect.setAttribute('fill-opacity', '0');
        leafRect.setAttribute('stroke', 'none');
        fillA.setAttribute('width', '0');
        fillB.setAttribute('width', '0');
        countA.textContent = '0';
        countB.textContent = '0';
        treeStat.textContent = '';
        verdict.textContent = '';
        caption1.textContent = '';
        caption2.textContent = '';
        seen.textContent = tr('label.seen', 'looking at {n} of {total} trees', {
          n: 0,
          total: scene.treeCount,
        });
      },

      destroy(): void {
        // 타이머도 프레임 루프도 관찰자도 걸지 않았다. 거둘 것은 캔버스 안에
        // 그려 넣은 노드뿐이며, 캔버스 자체는 러너가 만든 것이라 두고 간다.
        svg.textContent = '';
      },
    };

    return instance;
  },
};
