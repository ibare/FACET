/**
 * greedy-can-fail-stage — 같은 선반에서 동전을 집어 나란히 나아가는 두 줄.
 *
 * ── 왜 이 모양인가
 *
 * 물음은 "눈앞의 최선이 끝의 최선인가" 이고, 동사는 **두 길이 갈려 다른 데
 * 닿는다** 이다. 그래서 나무도 막대그래프도 아니다. 화면은 **같은 자로 잰 두
 * 줄**이고, 걸음마다 그 두 줄이 벌어지는 것이 전부다.
 *
 *   - 선반은 하나다. 두 줄이 똑같은 동전을 쓴다는 것을 눈으로 못박는다.
 *   - 걸음마다 동전이 선반에서 **두 갈래로 갈라져 날아간다.** 갈림은 그 궤적이다.
 *   - 동전은 같은 너비의 칸에 놓인다. 칸이 같으니 **줄의 길이가 곧 개수**다.
 *     액면은 지름으로 읽힌다 — 큰 것을 집은 줄이 오히려 길어지는 역전이
 *     보이려면 크기와 길이가 따로 읽혀야 한다.
 *   - 오른쪽 기둥은 "아직 만들어야 하는 몫" 이다. 맨 위 목표가 두 줄로 내려가
 *     각자 줄어들고, 먼저 0 에 닿은 줄에 눈금이 선다.
 *   - 끝에 두 줄 밑으로 잣대가 그어진다. 큰 것부터 집은 줄이 넘어간 만큼이 붉다.
 *
 * ── 세로
 *
 * 마운트한 뒤 `viewBox` 를 다시 재지 않는다 (S-view). 내용으로 정해지는 것은
 * 칸 **너비** 하나이며, 그것도 `goal-set` 이 알려 준 capacity 로 역산한다.
 *
 * ── 뒷일
 *
 * 스스로 다음 회차를 예약하는 루프는 없다. 다만 애니메이션 마무리를 위한 유한
 * 타이머를 쓰므로 전부 `timers` 에 담아 `destroy()` 에서 거두고, 그때 대기 중인
 * 약속도 함께 풀어 준다 — 풀지 않으면 알고리즘이 영영 그 자리에 선다.
 *
 * ── projector 계약
 *
 *   init(coins, target)   정적 틀을 다시 세운다 (마운트 · 되감기 · 리셋)
 *   showGoal              목표가 두 줄로 내려간다
 *   takeCoins             선반에서 동전이 갈라져 날아가 칸에 놓인다
 *   settleLane            먼저 끝난 줄에 눈금이 선다
 *   showVerdict           두 줄 밑에 잣대를 긋고, 넘어간 만큼을 붉게 남긴다
 *   setCaption            지금 화면에서 무슨 일이 일어나는지 (문안은 projector 가 준다)
 */

import {
  categorical,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  radii,
  PIECE_CANVAS_W,
  type CanvasView,
  type Palette,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type GreedyLane = 'greedy' | 'fewest';

/** 무대를 세우는 데 필요한 것 — 액면과 목표뿐이다. */
export type GreedyCanFailStageInit = { coins: number[]; target: number };

/** 한 줄이 한 번 집은 결과. */
export type GreedyCanFailStagePick = { value: number; remaining: number };

const LANES: readonly GreedyLane[] = ['greedy', 'fewest'];

const px = (token: string): number => Number.parseFloat(token);

// ── 자리. 가로는 캔버스에서 역산하고 상수는 상한만 잡는다 (S-piece).
const W = PIECE_CANVAS_W;
const H = 328;
const SIDE = 24;
const NAME_W = 128;
const PILL_W = 84;
const PILL_H = 32;
const PILL_GAP = 18;
const TRACK_X = SIDE + NAME_W;
const TRACK_RIGHT = W - SIDE - PILL_W - PILL_GAP;
const TRACK_W = TRACK_RIGHT - TRACK_X;
const RIGHT_X = TRACK_RIGHT + PILL_GAP;

const COIN_R_MAX = 30;
const COIN_R_MIN = 14;
const CELL_MAX = COIN_R_MAX * 2 + 26;

const SHELF_Y = 84;
const CHIP_H = 44;
const CHIP_Y = SHELF_Y - 52;
const RAIL_Y: Record<GreedyLane, number> = { greedy: 170, fewest: 262 };
const BAR_DY = 10;
const BAR_WIDTH = 5;
const CAPTION_Y = 298;
const CAPTION_LEAD = 18;

// ── 지속시간. 걸음 하나는 여기에 stepMs 가 더해진 길이다 (S-piece).
const FLY_MS = 400;
const GOAL_MS = 380;
const SETTLE_MS = 300;
const DRAW_MS = 440;
const EXCESS_MS = 240;
const SWAP_OUT_MS = 130;
const SWAP_IN_MS = 170;

type TextOpts = {
  size?: string;
  fill?: string;
  weight?: number;
  anchor?: 'start' | 'middle' | 'end';
};

type LaneParts = {
  railY: number;
  countEl: SVGTextElement;
  pillBox: SVGRectElement;
  pillNum: SVGTextElement;
  placed: number;
  settled: boolean;
};

type ShelfCoin = { x: number; y: number; r: number; fill: string };

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

/** 액면을 지름으로 읽힌다. 가장 큰 액면이 상한을 쓴다. */
function coinRadius(value: number, maxCoin: number): number {
  if (maxCoin <= 0) return COIN_R_MIN;
  const ratio = Math.min(1, Math.max(0, value / maxCoin));
  return COIN_R_MIN + (COIN_R_MAX - COIN_R_MIN) * ratio;
}

/**
 * 글자 폭을 어림한다. 한글·한자·가나는 라틴 글자의 두 배 폭으로 센다 —
 * 글자 수로만 재면 한국어 캡션이 화면 밖으로 나간다.
 */
function widthUnits(s: string): number {
  let units = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60);
    units += wide ? 2 : 1;
  }
  return units;
}

/** 캡션을 정해진 줄 수 안으로 접는다. SVG text 는 스스로 접히지 않는다. */
function wrapLines(message: string, maxUnits: number, maxLines: number): string[] {
  const words = message.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (widthUnits(candidate) > maxUnits && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) lines.push(current);
  if (lines.length <= maxLines) return lines;
  // 줄 수를 넘기면 마지막 줄에 남은 것을 몰아 담는다. 잘라 버리지는 않는다.
  const folded = lines.slice(0, maxLines - 1);
  folded.push(lines.slice(maxLines - 1).join(' '));
  return folded;
}

export const greedyCanFailStageView: CanvasView = {
  canvas: { height: H },

  mount(_container: HTMLElement, params: ViewMountParams & { canvas: SVGSVGElement }): ViewInstance {
    const canvas = params.canvas;
    const pal: Palette = getColors(params.theme);
    // 러너 밖 마운트를 위한 fallback. 러너가 주면 저작자 문안이 얹힌 조회기다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    let destroyed = false;
    const timers = new Map<ReturnType<typeof setTimeout>, () => void>();

    /** 유한 타이머. destroy 때 거두고, 기다리던 약속은 풀어 준다. */
    function later(fn: () => void, ms: number): void {
      const id = setTimeout(() => {
        timers.delete(id);
        if (!destroyed) fn();
      }, ms);
      timers.set(id, () => undefined);
    }

    function wait(ms: number): Promise<void> {
      return new Promise<void>((resolve) => {
        const id = setTimeout(() => {
          timers.delete(id);
          resolve();
        }, ms);
        timers.set(id, resolve);
      });
    }

    const root = svgEl('g', {});
    canvas.appendChild(root);

    function text(x: number, y: number, content: string, opts: TextOpts = {}): SVGTextElement {
      const node = svgEl('text', {
        x,
        y,
        'font-family': fonts.body,
        'font-size': opts.size ?? fontSizes.md,
        'font-weight': opts.weight ?? 400,
        fill: opts.fill ?? pal.text,
        'text-anchor': opts.anchor ?? 'start',
      });
      node.textContent = content;
      return node;
    }

    function rule(x1: number, y1: number, x2: number, y2: number, stroke: string, width: number): SVGLineElement {
      return svgEl('line', { x1, y1, x2, y2, stroke, 'stroke-width': width, 'stroke-linecap': 'round' });
    }

    function place(node: SVGElement, x: number, y: number): void {
      node.style.transform = `translate(${x}px, ${y}px)`;
    }

    /** 선을 왼쪽에서 오른쪽으로 그어 나간다. 색 전환이 아니라 그리는 운동이다. */
    function drawStroke(node: SVGElement, length: number, ms: number): void {
      node.style.strokeDasharray = String(length);
      node.style.strokeDashoffset = String(length);
      node.style.transition = `stroke-dashoffset ${ms}ms ease-out`;
      later(() => {
        node.style.strokeDashoffset = '0';
      }, 20);
    }

    function coinFontSize(r: number): number {
      return Math.max(px(fontSizes.sm), Math.min(px(fontSizes.lg), Math.round(r * 0.85)));
    }

    function coinNode(value: number, r: number, fill: string): SVGGElement {
      const group = svgEl('g', {});
      group.appendChild(svgEl('circle', { cx: 0, cy: 0, r, fill }));
      const size = coinFontSize(r);
      const label = text(0, size * 0.35, String(value), {
        size: `${size}px`,
        weight: 700,
        // categorical 은 테마를 따라 뒤집지 않는 고정 타일이라 잉크도 고정한다.
        fill: pal.stateInk,
        anchor: 'middle',
      });
      group.appendChild(label);
      return group;
    }

    // ── 무대 상태
    let coins: number[] = [];
    let target = 0;
    let capacity = 1;
    let cell = CELL_MAX;
    const shelf = new Map<number, ShelfCoin>();
    const lanes = new Map<GreedyLane, LaneParts>();
    let captionLines: SVGTextElement[] = [];
    let captionText = '';

    const laneLabel = (lane: GreedyLane): string =>
      lane === 'greedy'
        ? tr('label.laneGreedy', 'largest first')
        : tr('label.laneFewest', 'fewest coins');

    function coinX(slot: number): number {
      return TRACK_X + cell * (slot + 0.5);
    }

    function build(): void {
      while (root.firstChild) root.removeChild(root.firstChild);
      shelf.clear();
      lanes.clear();
      captionLines = [];

      const denominations = [...new Set(coins)].filter((c) => c > 0).sort((a, b) => b - a);
      const maxCoin = denominations[0] ?? 0;
      const tone = categorical(Math.max(1, denominations.length), 'vivid');

      // 선반 — 두 줄이 함께 쓰는 동전.
      root.appendChild(rule(TRACK_X, SHELF_Y, TRACK_RIGHT, SHELF_Y, pal.border, 1.5));
      denominations.forEach((value, i) => {
        const r = coinRadius(value, maxCoin);
        const x = TRACK_X + (TRACK_W * (i + 0.5)) / denominations.length;
        const y = SHELF_Y - r;
        const fill = tone[i % tone.length] ?? pal.itemDefault;
        shelf.set(value, { x, y, r, fill });
        const node = coinNode(value, r, fill);
        place(node, x, y);
        root.appendChild(node);
      });

      // 목표 — 오른쪽 기둥의 머리.
      root.appendChild(
        svgEl('rect', {
          x: RIGHT_X,
          y: CHIP_Y,
          width: PILL_W,
          height: CHIP_H,
          rx: px(radii.md),
          fill: pal.bgSubtle,
          stroke: pal.border,
          'stroke-width': 1,
        }),
      );
      root.appendChild(
        text(RIGHT_X + PILL_W / 2, CHIP_Y + 16, tr('label.target', 'target'), {
          size: fontSizes.xs,
          fill: pal.textMuted,
          anchor: 'middle',
        }),
      );
      root.appendChild(
        text(RIGHT_X + PILL_W / 2, CHIP_Y + 36, String(target), {
          size: fontSizes.xl,
          weight: 700,
          anchor: 'middle',
        }),
      );

      // 두 줄.
      for (const lane of LANES) {
        const railY = RAIL_Y[lane];
        root.appendChild(rule(TRACK_X, railY, TRACK_RIGHT, railY, pal.border, 1.5));
        root.appendChild(text(SIDE, railY - 6, laneLabel(lane), { weight: 600 }));
        const countEl = text(SIDE, railY + 18, '', { size: fontSizes.sm, fill: pal.textMuted });
        root.appendChild(countEl);

        const pillBox = svgEl('rect', {
          x: RIGHT_X,
          y: railY - PILL_H / 2,
          width: PILL_W,
          height: PILL_H,
          rx: px(radii.md),
          fill: pal.bg,
          stroke: pal.border,
          'stroke-width': 1,
        });
        pillBox.style.transition = 'fill 220ms ease-out, stroke 220ms ease-out';
        root.appendChild(pillBox);
        const pillNum = text(RIGHT_X + PILL_W / 2, railY + 6, '', {
          size: fontSizes.lg,
          weight: 700,
          anchor: 'middle',
        });
        root.appendChild(pillNum);

        lanes.set(lane, { railY, countEl, pillBox, pillNum, placed: 0, settled: false });
      }

      // 캡션 두 줄.
      for (let i = 0; i < 2; i += 1) {
        const line = text(SIDE, CAPTION_Y + CAPTION_LEAD * i, '', {
          size: fontSizes.md,
          fill: pal.textMuted,
        });
        captionLines.push(line);
        root.appendChild(line);
      }
      paintCaption();
    }

    function paintCaption(): void {
      const maxUnits = Math.floor((W - SIDE * 2) / (px(fontSizes.md) * 0.52));
      const lines = wrapLines(captionText, maxUnits, captionLines.length);
      captionLines.forEach((node, i) => {
        node.textContent = lines[i] ?? '';
      });
    }

    /** 남은 몫의 숫자가 위로 빠지고 아래에서 새 숫자가 올라온다. */
    function swapNumber(node: SVGTextElement, next: number): void {
      node.style.transition = `transform ${SWAP_OUT_MS}ms ease-in, opacity ${SWAP_OUT_MS}ms ease-in`;
      node.style.transform = 'translateY(-10px)';
      node.style.opacity = '0';
      later(() => {
        node.textContent = String(next);
        node.style.transition = 'none';
        node.style.transform = 'translateY(10px)';
        later(() => {
          node.style.transition = `transform ${SWAP_IN_MS}ms ease-out, opacity ${SWAP_IN_MS}ms ease-out`;
          node.style.transform = 'translateY(0)';
          node.style.opacity = '1';
        }, 20);
      }, SWAP_OUT_MS + 10);
    }

    function markSettled(parts: LaneParts, count: number): void {
      parts.settled = true;
      parts.pillBox.setAttribute('fill', pal.itemSorted);
      parts.pillBox.setAttribute('stroke', pal.itemSorted);
      parts.pillNum.setAttribute('fill', pal.textInverse);
      const x = TRACK_X + cell * count;
      const tick = rule(x, parts.railY - 12, x, parts.railY + BAR_DY + 8, pal.text, 2);
      drawStroke(tick, BAR_DY + 20, SETTLE_MS);
      root.appendChild(tick);
    }

    // ── projector 가 부르는 메서드

    function init(next: GreedyCanFailStageInit): void {
      coins = Array.isArray(next.coins) ? [...next.coins] : [];
      target = typeof next.target === 'number' ? next.target : 0;
      capacity = 1;
      cell = CELL_MAX;
      build();
    }

    async function showGoal(spec: { target: number; capacity: number }): Promise<void> {
      target = spec.target;
      capacity = Math.max(1, spec.capacity);
      cell = Math.min(CELL_MAX, TRACK_W / capacity);

      // 같은 목표가 두 줄로 내려간다 — 여기서부터 둘은 같은 데서 출발한다.
      const flying: SVGTextElement[] = [];
      for (const lane of LANES) {
        const parts = lanes.get(lane);
        if (!parts) continue;
        const token = text(0, 0, String(target), {
          size: fontSizes.lg,
          weight: 700,
          anchor: 'middle',
        });
        place(token, RIGHT_X + PILL_W / 2, CHIP_Y + 36);
        root.appendChild(token);
        flying.push(token);
        later(() => {
          token.style.transition = `transform ${GOAL_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
          place(token, RIGHT_X + PILL_W / 2, parts.railY + 6);
        }, 20);
      }
      await wait(GOAL_MS + 60);
      for (const token of flying) token.remove();
      for (const lane of LANES) {
        const parts = lanes.get(lane);
        if (parts) parts.pillNum.textContent = String(target);
      }
    }

    async function takeCoins(picks: Partial<Record<GreedyLane, GreedyCanFailStagePick>>): Promise<void> {
      const landing: Array<{ parts: LaneParts; remaining: number }> = [];
      for (const lane of LANES) {
        const pick = picks[lane];
        const parts = lanes.get(lane);
        if (!pick || !parts) continue;
        const source = shelf.get(pick.value);
        const baseR = source?.r ?? COIN_R_MIN;
        // 칸이 좁아지면 동전도 그만큼 줄인다. 칸이 넉넉하면 선반과 같은 크기다.
        const r = Math.min(baseR, cell / 2 - 3);
        const fill = source?.fill ?? pal.itemDefault;
        const node = coinNode(pick.value, r, fill);
        place(node, source?.x ?? TRACK_X, source?.y ?? SHELF_Y - baseR);
        root.appendChild(node);

        const slot = parts.placed;
        parts.placed += 1;
        later(() => {
          node.style.transition = `transform ${FLY_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`;
          place(node, coinX(slot), parts.railY - r);
        }, 20);
        landing.push({ parts, remaining: pick.remaining });
      }
      // 숫자는 동전이 내려앉는 동안 함께 바뀐다.
      later(() => {
        for (const { parts, remaining } of landing) swapNumber(parts.pillNum, remaining);
      }, Math.max(20, FLY_MS - 80));
      await wait(FLY_MS + 140);
    }

    async function settleLane(spec: { lane: GreedyLane; count: number }): Promise<void> {
      const parts = lanes.get(spec.lane);
      if (!parts) return;
      markSettled(parts, spec.count);
      await wait(SETTLE_MS);
    }

    async function showVerdict(spec: { greedyCount: number; fewestCount: number }): Promise<void> {
      const counts: Record<GreedyLane, number> = {
        greedy: spec.greedyCount,
        fewest: spec.fewestCount,
      };
      for (const lane of LANES) {
        const parts = lanes.get(lane);
        if (!parts) continue;
        const count = counts[lane];
        if (!parts.settled) markSettled(parts, count);
        parts.countEl.textContent = tr('label.count', '{n} coins', { n: count });
        const length = cell * count;
        const bar = rule(TRACK_X, parts.railY + BAR_DY, TRACK_X + length, parts.railY + BAR_DY, pal.text, BAR_WIDTH);
        drawStroke(bar, length, DRAW_MS);
        root.appendChild(bar);
      }
      await wait(DRAW_MS + 60);

      // 넘어간 만큼. 같은 자로 재서 남는 부분이 곧 그리디가 치른 값이다.
      if (spec.greedyCount > spec.fewestCount) {
        const parts = lanes.get('greedy');
        if (parts) {
          const from = TRACK_X + cell * spec.fewestCount;
          const to = TRACK_X + cell * spec.greedyCount;
          const excess = rule(from, parts.railY + BAR_DY, to, parts.railY + BAR_DY, pal.danger, BAR_WIDTH);
          drawStroke(excess, to - from, EXCESS_MS);
          root.appendChild(excess);
          await wait(EXCESS_MS + 40);
        }
      }
    }

    function setCaption(message: string): void {
      captionText = message;
      paintCaption();
    }

    // 마운트 시점의 초기 데이터로 정적 틀을 세운다. 러너는 곧 projector.onInit 으로
    // 같은 것을 다시 세우지만, 러너 밖에서 띄워도 화면이 비어 있지 않게 한다.
    const seed = params.initialData as { coins?: unknown; target?: unknown } | undefined;
    const seedCoins = seed?.coins;
    const seedTarget = seed?.target;
    init({
      coins: Array.isArray(seedCoins) ? seedCoins.filter((v): v is number => typeof v === 'number') : [],
      target: typeof seedTarget === 'number' ? seedTarget : 0,
    });

    return {
      init,
      showGoal,
      takeCoins,
      settleLane,
      showVerdict,
      setCaption,
      destroy() {
        destroyed = true;
        for (const [id, resolve] of timers) {
          clearTimeout(id);
          resolve();
        }
        timers.clear();
        root.remove();
      },
    };
  },
};
