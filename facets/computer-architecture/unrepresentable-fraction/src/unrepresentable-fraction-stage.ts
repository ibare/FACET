/**
 * unrepresentable-fraction stage — 되풀이가 눈에 보이는 자리.
 *
 * ── 형태가 어디서 나왔는가
 *
 * 이 조각의 동사는 **되돌아온다** 이다. 그래서 화면의 중심은 "남은 값이 놓이는
 * 자리들의 줄" 이고, 그 위를 값 하나가 왼쪽에서 오른쪽으로 옮겨 간다. 앞에 나온
 * 자리로 다시 닿는 순간 줄 위에 **호가 그어지고 값이 그 호를 타고 되돌아간다** —
 * 되풀이는 색이 바뀌는 일이 아니라 자리를 옮기는 일이라야 한다 (S-piece).
 *
 * 아래의 띠는 뽑혀 나온 자리가 쌓이는 곳이다. 자리는 타일에서 띠로 **떨어져**
 * 내려오고, 고리를 돌 때마다 같은 네 자리가 다시 떨어진다. 그릇이 차면 띠의
 * 꼬리가 오른쪽으로 밀려 떨어져 나간다.
 *
 * ── 좌표
 *
 * 가로는 러너가 `PIECE_CANVAS_W` 로 정하므로 선언하지 않고, 세로만 여기서 정한다
 * (S-piece). 타일 폭과 칸 폭은 캔버스에서 역산하고 상수로는 상한만 둔다.
 *
 * `TRACK_SLOTS` 와 `TAPE_CELLS` 는 **이 그림이 담는 한도**다. 화면에 뜨는 값이
 * 아니라 자리의 수이며, 1/10 은 남은 값 다섯 자리와 스물아홉 자리를 쓴다.
 * 한도를 넘는 것이 들어오면 그리지 않고 흘린다.
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 216;
const SIDE_MIN = 22;

/** 남은 값이 놓이는 자리의 수 — 이 그림이 담는 한도. */
const TRACK_SLOTS = 5;
const TILE_GAP = 24;
const TILE_MAX_W = 96;
const TILE_Y = 50;
const TILE_H = 42;
const DOT_R = 7;
const DOT_Y = TILE_Y - 9;
const ARC_CTRL_Y = -6;
const ARC_LABEL_Y = 13;

/** 자리띠가 담는 칸의 수 — 이 그림이 담는 한도. */
const TAPE_CELLS = 30;
const CELL_MAX_W = 20;
const TAPE_Y = 124;
const CELL_H = 26;
const PREFIX_W = 66;
const TAIL_W = 16;

const RULE_Y = 154;
const BRACKET_Y = 162;
const BRACKET_LABEL_Y = 178;
const CAPTION_Y = 200;

const MOVE_MS = 360;
const DROP_MS = 340;
const ARC_MS = 620;
const LAP_TOTAL_MS = 820;
const CUT_MS = 560;

const tileW = Math.min(
  TILE_MAX_W,
  Math.floor((W - SIDE_MIN * 2 - TILE_GAP * (TRACK_SLOTS - 1)) / TRACK_SLOTS),
);
const trackW = TRACK_SLOTS * tileW + TILE_GAP * (TRACK_SLOTS - 1);
const trackX = Math.round((W - trackW) / 2);

const cellW = Math.min(
  CELL_MAX_W,
  Math.floor((W - SIDE_MIN * 2 - PREFIX_W - TAIL_W) / TAPE_CELLS),
);
const tapeW = TAPE_CELLS * cellW;
const tapeX = Math.round((W - tapeW - PREFIX_W - TAIL_W) / 2) + PREFIX_W;

const tileX = (i: number): number => trackX + i * (tileW + TILE_GAP);
const tileCx = (i: number): number => tileX(i) + tileW / 2;
const cellX = (i: number): number => tapeX + i * cellW;
const cellCx = (i: number): number => cellX(i) + cellW / 2;

type Pt = { x: number; y: number };

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function clear(node: SVGElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function quadAt(from: Pt, ctrl: Pt, to: Pt, p: number): Pt {
  const q = 1 - p;
  return {
    x: q * q * from.x + 2 * q * p * ctrl.x + p * p * to.x,
    y: q * q * from.y + 2 * q * p * ctrl.y + p * p * to.y,
  };
}

const ease = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/** initialData 를 좁히는 자리는 mount 다 (S-piece). projector 는 이것을 다시 좁히지 않는다. */
type Scene = { numerator: number; denominator: number };

function readScene(data: Record<string, unknown> | undefined): Scene {
  const numerator = typeof data?.numerator === 'number' ? Math.trunc(data.numerator) : 1;
  const denominator = typeof data?.denominator === 'number' ? Math.trunc(data.denominator) : 10;
  return { numerator, denominator: denominator === 0 ? 10 : denominator };
}

export const unrepresentableFractionStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const canvas = params.canvas;
    const colors = getColors(params.theme);
    const t = params.t ?? makeTranslator(params.locale);
    const scene = readScene(params.initialData);

    // ── 기다림과 프레임. 걸어 둔 것은 집합에 담아 destroy 에서 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const frames = new Set<number>();
    let destroyed = false;

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

    function tween(ms: number, apply: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (destroyed) {
          apply(1);
          return resolve();
        }
        const started = Date.now();
        let frame = 0;
        const finish = (): void => {
          waiters.delete(finish);
          frames.delete(frame);
          resolve();
        };
        waiters.add(finish);
        const step = (): void => {
          frames.delete(frame);
          if (destroyed) {
            apply(1);
            finish();
            return;
          }
          const p = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          apply(ease(p));
          if (p >= 1) {
            finish();
            return;
          }
          frame = requestAnimationFrame(step);
          frames.add(frame);
        };
        frame = requestAnimationFrame(step);
        frames.add(frame);
      });
    }

    // ── 층. 토큰은 타일 위에, 날아가는 조각은 그보다 위에 둔다.
    const gTape = el('g');
    const gTrack = el('g');
    const gArc = el('g');
    const gTiles = el('g');
    const gDigits = el('g');
    const gVessel = el('g');
    const gToken = el('g');
    const gChips = el('g');
    const caption = el('text', {
      x: W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    const layers = [gTape, gTrack, gArc, gTiles, gDigits, gVessel, gToken, gChips, caption];
    for (const layer of layers) canvas.appendChild(layer);

    // ── 마운트 때 한 번 그리는 것 — 빈 자리, ×2 화살, 띠 바탕.
    for (let i = 0; i < TRACK_SLOTS; i += 1) {
      gTrack.appendChild(
        el('rect', {
          x: tileX(i),
          y: TILE_Y,
          width: tileW,
          height: TILE_H,
          rx: 8,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1,
          'stroke-dasharray': '4 3',
        }),
      );
      if (i === TRACK_SLOTS - 1) continue;
      const y = TILE_Y + TILE_H / 2;
      const from = tileX(i) + tileW + 3;
      const to = tileX(i + 1) - 3;
      gTrack.appendChild(
        el('line', { x1: from, y1: y, x2: to - 4, y2: y, stroke: colors.border, 'stroke-width': 1.5 }),
      );
      gTrack.appendChild(
        el('path', {
          d: `M ${to - 5} ${y - 4} L ${to} ${y} L ${to - 5} ${y + 4} Z`,
          fill: colors.border,
        }),
      );
      const times = el('text', {
        x: (from + to) / 2,
        y: y - 7,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.xs,
        fill: colors.textMuted,
      });
      times.textContent = '×2';
      gTrack.appendChild(times);
    }

    gTape.appendChild(
      el('rect', {
        x: tapeX,
        y: TAPE_Y,
        width: tapeW,
        height: CELL_H,
        rx: 4,
        fill: colors.bgSubtle,
      }),
    );
    const prefix = el('text', {
      x: tapeX - 6,
      y: TAPE_Y + 18,
      'text-anchor': 'end',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      fill: colors.text,
    });
    // 수식 표기라 문안이 아니다 (C10) — 분수는 initialData 가 준다.
    prefix.textContent = `${scene.numerator}/${scene.denominator} = 0.`;
    gTape.appendChild(prefix);

    // ── 움직이는 상태.
    type TileRef = { group: SVGGElement; frame: SVGRectElement; label: SVGTextElement };
    const tiles = new Map<number, TileRef>();
    const digitNodes: SVGTextElement[] = [];
    let digitCount = 0;
    let cursor = 0;
    let cycleFrom = -1;
    let cycleTo = -1;
    let token: SVGCircleElement | null = null;
    let rule: SVGLineElement | null = null;
    let tail: SVGTextElement | null = null;

    function makeTail(): void {
      const node = el('text', {
        x: cellX(0) + 3,
        y: TAPE_Y + 18,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.textMuted,
      });
      node.textContent = '…';
      gDigits.appendChild(node);
      tail = node;
    }

    function moveTail(): void {
      tail?.setAttribute('x', String(cellX(Math.min(digitCount, TAPE_CELLS)) + 3));
    }

    function placeToken(i: number): void {
      token?.setAttribute('cx', String(tileCx(i)));
      token?.setAttribute('cy', String(DOT_Y));
    }

    function showToken(i: number): void {
      if (!token) {
        token = el('circle', {
          r: DOT_R,
          fill: colors.itemActive,
          stroke: colors.bg,
          'stroke-width': 1.5,
        });
        gToken.appendChild(token);
      }
      placeToken(i);
      cursor = i;
    }

    async function revealTile(i: number, text: string): Promise<void> {
      if (i >= TRACK_SLOTS || tiles.has(i)) return;
      const group = el('g');
      const frame = el('rect', {
        x: tileX(i),
        y: TILE_Y,
        width: tileW,
        height: TILE_H,
        rx: 8,
        fill: colors.bg,
        stroke: colors.text,
        'stroke-width': 1.5,
      });
      const label = el('text', {
        x: tileCx(i),
        y: TILE_Y + TILE_H / 2 + 6,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.md,
        fill: colors.text,
      });
      label.textContent = text;
      group.append(frame, label);
      gTiles.appendChild(group);
      tiles.set(i, { group, frame, label });

      const cx = tileCx(i);
      const cy = TILE_Y + TILE_H / 2;
      await tween(180, (p) => {
        const s = 0.86 + 0.14 * p;
        group.setAttribute(
          'transform',
          `translate(${cx} ${cy}) scale(${s.toFixed(3)}) translate(${-cx} ${-cy})`,
        );
      });
      group.removeAttribute('transform');
    }

    async function flyDigit(fromSlot: number, digit: string): Promise<void> {
      if (digitCount >= TAPE_CELLS) return;
      const index = digitCount;
      const from = { x: tileCx(fromSlot), y: TILE_Y + TILE_H + 4 };
      const to = { x: cellCx(index), y: TAPE_Y + 18 };
      const chip = el('text', {
        x: from.x,
        y: from.y,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.itemActive,
      });
      chip.textContent = digit;
      gChips.appendChild(chip);
      await tween(DROP_MS, (p) => {
        chip.setAttribute('x', String(from.x + (to.x - from.x) * p));
        chip.setAttribute('y', String(from.y + (to.y - from.y) * p));
      });
      chip.remove();
      paintDigit(index, digit);
    }

    function paintDigit(index: number, digit: string): void {
      const node = el('text', {
        x: cellCx(index),
        y: TAPE_Y + 18,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      node.textContent = digit;
      gDigits.appendChild(node);
      digitNodes[index] = node;
      digitCount = index + 1;
      moveTail();
      if (rule) rule.setAttribute('x2', String(cellX(Math.min(digitCount, TAPE_CELLS))));
    }

    async function slideToken(from: number, to: number, ms: number): Promise<void> {
      const x0 = tileCx(from);
      const x1 = tileCx(to);
      await tween(ms, (p) => token?.setAttribute('cx', String(x0 + (x1 - x0) * p)));
      cursor = to;
    }

    function arcPoints(from: number, to: number): { p1: Pt; ctrl: Pt; p2: Pt } {
      const p1 = { x: tileCx(from), y: DOT_Y };
      const p2 = { x: tileCx(to), y: DOT_Y };
      return { p1, ctrl: { x: (p1.x + p2.x) / 2, y: ARC_CTRL_Y }, p2 };
    }

    function arcPath(from: number, to: number, upto: number): string {
      const { p1, ctrl, p2 } = arcPoints(from, to);
      const steps = 28;
      let d = `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
      for (let i = 1; i <= steps; i += 1) {
        const pt = quadAt(p1, ctrl, p2, (i / steps) * upto);
        d += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      }
      return d;
    }

    async function flyTokenArc(from: number, to: number, ms: number): Promise<void> {
      const { p1, ctrl, p2 } = arcPoints(from, to);
      await tween(ms, (p) => {
        const pt = quadAt(p1, ctrl, p2, p);
        token?.setAttribute('cx', String(pt.x));
        token?.setAttribute('cy', String(pt.y));
      });
      cursor = to;
    }

    function nextSlot(i: number): number {
      return i === cycleFrom ? cycleTo : i + 1;
    }

    async function hop(from: number, to: number, digit: string, ms: number): Promise<void> {
      const move =
        to <= from && cycleFrom >= 0 ? flyTokenArc(from, to, ms) : slideToken(from, to, ms);
      await Promise.all([move, flyDigit(from, digit)]);
    }

    // 띠의 꼬리는 마운트 순간부터 있어야 한다 — 전개가 끝나지 않는다는 말을
    // 첫 화면이 이미 하고 있어야 하기 때문이다. projector 에는 onInit 이 없으므로
    // (initialData 를 두 번 좁히지 않는다, S-piece) 여기서 한 번 세운다.
    makeTail();

    return {
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        for (const layer of layers) layer.remove();
      },

      setCaption(text: string): void {
        caption.textContent = text;
      },

      reset(): void {
        clear(gArc);
        clear(gTiles);
        clear(gDigits);
        clear(gVessel);
        clear(gChips);
        clear(gToken);
        tiles.clear();
        digitNodes.length = 0;
        digitCount = 0;
        cursor = 0;
        cycleFrom = -1;
        cycleTo = -1;
        token = null;
        rule = null;
        tail = null;
        // finish() 가 흐려 둔 층을 전부 되돌린다. 넷 중 둘만 되돌리면 다시 보기에서
        // 호와 토큰만 흐린 채로 다시 그려진다 — 자식을 지워도 층의 opacity 는 남는다.
        for (const layer of [gTrack, gTiles, gArc, gToken]) layer.removeAttribute('opacity');
        caption.textContent = '';
        makeTail();
      },

      /** 분수가 띠의 왼쪽에서 첫 자리로 올라온다. */
      async seed(p: { rest: string }): Promise<void> {
        const from = { x: tapeX - 30, y: TAPE_Y + 18 };
        const to = { x: tileCx(0), y: TILE_Y + TILE_H / 2 + 6 };
        const chip = el('text', {
          x: from.x,
          y: from.y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.md,
          fill: colors.itemActive,
        });
        chip.textContent = p.rest;
        gChips.appendChild(chip);
        await tween(MOVE_MS, (q) => {
          chip.setAttribute('x', String(from.x + (to.x - from.x) * q));
          chip.setAttribute('y', String(from.y + (to.y - from.y) * q));
        });
        chip.remove();
        await revealTile(0, p.rest);
        showToken(0);
      },

      /**
       * 자리 하나를 뽑는다. 새 자리로 가는 걸음이면 값이 옮겨 가고, 앞에 나온
       * 자리로 되돌아오는 걸음이면 값은 그대로 둔 채 그 자리를 짚어 보인다 —
       * 되돌아가는 운동은 다음 걸음(고리 닫기)이 맡는다.
       */
      async peel(p: { from: number; to: number; digit: string; rest: string }): Promise<void> {
        if (p.to > p.from) {
          await Promise.all([
            slideToken(p.from, p.to, MOVE_MS),
            flyDigit(p.from, p.digit),
            revealTile(p.to, p.rest),
          ]);
          return;
        }
        const mark = tiles.get(p.to);
        mark?.frame.setAttribute('stroke', colors.accent);
        mark?.frame.setAttribute('stroke-width', '3');
        await flyDigit(p.from, p.digit);
      },

      /** 고리가 닫힌다. 호를 긋고 값이 그 호를 타고 되돌아간다. */
      async closeLoop(p: { from: number; to: number }): Promise<void> {
        cycleFrom = p.from;
        cycleTo = p.to;

        const path = el('path', {
          d: arcPath(p.from, p.to, 0),
          fill: 'none',
          stroke: colors.accent,
          'stroke-width': 2,
        });
        gArc.appendChild(path);
        await tween(ARC_MS / 2, (q) => path.setAttribute('d', arcPath(p.from, p.to, q)));

        const head = arcPoints(p.from, p.to).p2;
        gArc.appendChild(
          el('path', {
            d: `M ${head.x - 5} ${head.y - 8} L ${head.x + 5} ${head.y - 8} L ${head.x} ${head.y - 1} Z`,
            fill: colors.accent,
          }),
        );
        const label = el('text', {
          x: (tileCx(p.from) + tileCx(p.to)) / 2,
          y: ARC_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.xs,
          fill: colors.accent,
        });
        label.textContent = t('label.repeat', 'repeats');
        gArc.appendChild(label);

        // 되풀이되는 자리 묶음에 밑줄을 그어 둔다. 이 뒤로 자리가 쌓일 때마다 함께 자란다.
        const line = el('line', {
          x1: cellX(p.to),
          y1: RULE_Y,
          x2: cellX(p.to),
          y2: RULE_Y,
          stroke: colors.accent,
          'stroke-width': 2,
        });
        gDigits.appendChild(line);
        rule = line;

        const x0 = cellX(p.to);
        const x1 = cellX(Math.min(digitCount, TAPE_CELLS));
        await Promise.all([
          flyTokenArc(p.from, p.to, ARC_MS),
          tween(ARC_MS, (q) => line.setAttribute('x2', String(x0 + (x1 - x0) * q))),
        ]);
      },

      /** 고리를 다시 돈다. 한 걸음에 도는 바퀴가 늘수록 빨라진다. */
      async lap(p: { digits: string }): Promise<void> {
        const hops = p.digits.length;
        if (hops === 0) return;
        const ms = Math.max(60, Math.round(LAP_TOTAL_MS / hops));
        for (const digit of p.digits) {
          if (destroyed) return;
          const from = cursor;
          await hop(from, nextSlot(from), digit, ms);
        }
      },

      /** 그릇이 찼다. 넘은 자리는 밀려 떨어지고 마지막 자리는 올림으로 튄다. */
      async cut(p: { keep: number; flipAt: number; flipTo: string }): Promise<void> {
        const keep = Math.max(0, Math.min(p.keep, TAPE_CELLS));
        const edge = cellX(keep);

        const bracket = el('path', {
          d: `M ${tapeX} ${BRACKET_Y} l 0 6 L ${tapeX} ${BRACKET_Y + 6} l 0 -6`,
          fill: 'none',
          stroke: colors.border,
          'stroke-width': 1.5,
        });
        gVessel.appendChild(bracket);
        await tween(CUT_MS / 2, (q) => {
          const x = tapeX + (edge - tapeX) * q;
          bracket.setAttribute(
            'd',
            `M ${tapeX} ${BRACKET_Y} l 0 6 L ${x.toFixed(1)} ${BRACKET_Y + 6} l 0 -6`,
          );
        });
        const vessel = el('text', {
          x: (tapeX + edge) / 2,
          y: BRACKET_LABEL_Y,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        // 그 분야에서 원어 그대로 쓰는 말이라 표식이다 (C10).
        vessel.textContent = 'float32';
        gVessel.appendChild(vessel);

        // 그릇의 끝. 여기서 잘린다.
        gVessel.appendChild(
          el('line', {
            x1: edge,
            y1: TAPE_Y - 6,
            x2: edge,
            y2: TAPE_Y + CELL_H + 6,
            stroke: colors.danger,
            'stroke-width': 2,
          }),
        );

        const overflow = el('g');
        gDigits.appendChild(overflow);
        for (let i = keep; i < digitNodes.length; i += 1) {
          const node = digitNodes[i];
          if (node) overflow.appendChild(node);
        }
        if (tail) overflow.appendChild(tail);
        await tween(CUT_MS, (q) => {
          overflow.setAttribute('transform', `translate(${(64 * q).toFixed(1)} 0)`);
          overflow.setAttribute('opacity', String(1 - q));
        });
        overflow.remove();
        digitNodes.length = keep;
        tail = null;
        rule?.setAttribute('x2', String(edge));

        // 올림 — 마지막 자리가 위로 튀었다 내려오며 값이 바뀐다.
        const flip = p.flipAt > 0 ? digitNodes[p.flipAt - 1] : undefined;
        if (flip && p.flipTo !== '') {
          const base = TAPE_Y + 18;
          let swapped = false;
          flip.setAttribute('fill', colors.accent);
          await tween(320, (q) => {
            flip.setAttribute('y', String(base - 9 * Math.sin(q * Math.PI)));
            if (!swapped && q > 0.5) {
              flip.textContent = p.flipTo;
              swapped = true;
            }
          });
          flip.setAttribute('y', String(base));
        }
      },

      /** 기계는 멎고 그릇에 담긴 것만 남는다. */
      async finish(): Promise<void> {
        await tween(260, (q) => {
          const o = String(1 - 0.55 * q);
          gTrack.setAttribute('opacity', o);
          gTiles.setAttribute('opacity', o);
          gArc.setAttribute('opacity', o);
          gToken.setAttribute('opacity', o);
        });
        await wait(60);
      },
    };
  },
};
