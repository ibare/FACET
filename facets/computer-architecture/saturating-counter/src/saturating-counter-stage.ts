/**
 * 포화 카운터 stage — 바늘이 문턱을 넘나든다.
 *
 * 왼쪽은 카운터 자체다. 문턱 선을 가운데 두고 "탄다" 칸이 위로, "안 탄다" 칸이 아래로
 * 쌓인다. 비트를 늘리면 칸이 문턱에서 바깥으로 자라 나오고(2 → 4 → 8), 처음 상태인
 * 꼭대기가 그만큼 문턱에서 멀어진다. 바늘은 걸음마다 한 칸씩 오르내린다.
 *
 * 오른쪽은 같은 세로 축을 시간으로 펼친 것이다. 바늘이 지나간 자리가 선으로 남아,
 * 선이 문턱을 넘는 자리가 곧 짐작이 뒤바뀌는 자리다. 앞 판의 선은 옅게 남겨 두어
 * 새 판의 선이 그것과 어떻게 갈리는지 보인다.
 *
 * 칸 하나하나는 "문턱에서 몇 번째인가" 로 이름 붙는다(위쪽 k, 아래쪽 k). 그래야
 * 비트가 바뀔 때 칸이 문턱을 가로질러 뒤섞이지 않고 바깥으로 자라기만 한다.
 */

import { categorical, fonts, fontSizes, getColors, makeTranslator } from '@ffacet/core/runtime';
import type { CanvasView, ViewInstance } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 720;
const H = 400;

/** 문턱 선의 세로 자리 — 비트가 바뀌어도 움직이지 않는다. */
const Y0 = 210;
/** 칸 하나의 높이. 3 비트(한쪽 네 칸)가 들어갈 자리를 처음부터 잡는다. */
const CELL_H = 22;
/** 한쪽에 설 수 있는 칸의 최대 — 사다리 끝 3 비트의 절반 2^2. */
const MAX_HALF = 4;

const GAUGE_X = 62;
const GAUGE_W = 64;

const PLOT_X0 = 184;
const PLOT_X1 = 692;

const ROW_OUTCOME = 72;
const ROW_GUESS = 100;
const ROW_MARK = 326;
const ROW_SEGMENT = 356;
const ROW_TALLY = 378;

const TWEEN_MS = 260;

/** 칸 채움 색의 순번 — categorical(2, 'pastel') 에서 "탄다" 와 "안 탄다" 를 가른다. */
const SIDE_TAKEN = 0;
const SIDE_NOT_TAKEN = 1;

export type SaturatingCounterStage = ViewInstance & {
  setCounter(top: number, threshold: number, state: number, steps: number, turnAt: number): void;
  showGuess(step: number, state: number, guess: number): void;
  showCheck(step: number, outcome: number, hit: boolean, loopMisses: number, turnMisses: number): void;
  moveNeedle(step: number, from: number, to: number, threshold: number): void;
  setCaption(text: string): void;
  clear(): void;
};

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
  parent.appendChild(node);
  return node;
}

/** 위(1) 또는 아래(0)를 가리키는 작은 세모. */
function trianglePoints(cx: number, cy: number, up: boolean, r: number): string {
  return up
    ? `${cx - r},${cy + r * 0.8} ${cx + r},${cy + r * 0.8} ${cx},${cy - r * 0.9}`
    : `${cx - r},${cy - r * 0.8} ${cx + r},${cy - r * 0.8} ${cx},${cy + r * 0.9}`;
}

export const saturatingCounterStageView: CanvasView = {
  canvas: { width: W, height: H, fit: 'fill' },
  mount(_container, params) {
    const svg = params.canvas;
    const tr = params.t ?? makeTranslator(params.locale);
    const c = getColors(params.theme);
    const [takenFill, notTakenFill] = [
      categorical(2, 'pastel')[SIDE_TAKEN] ?? c.bgSubtle,
      categorical(2, 'pastel')[SIDE_NOT_TAKEN] ?? c.bgSubtle,
    ];
    const isInstant = params.isInstant ?? (() => false);

    const init = params.initialData ?? {};
    const rawOutcomes = (init as { outcomes?: unknown }).outcomes;
    const outcomes: number[] = Array.isArray(rawOutcomes)
      ? rawOutcomes.map((x) => (x === 1 ? 1 : 0))
      : [];
    const rawTurn = (init as { turnAt?: unknown }).turnAt;
    let steps = Math.max(1, outcomes.length);
    let turnAt = typeof rawTurn === 'number' ? rawTurn : steps;
    const colW = () => (PLOT_X1 - PLOT_X0) / steps;
    const colX = (k: number) => PLOT_X0 + k * colW();
    const colCx = (k: number) => PLOT_X0 + (k + 0.5) * colW();

    // ── 되짚기 · 해체 때 거둘 것
    let destroyed = false;
    const anims = new Map<string, number>();
    const stopAll = () => {
      if (typeof cancelAnimationFrame === 'function') for (const id of anims.values()) cancelAnimationFrame(id);
      anims.clear();
    };
    params.onScrubStart?.(stopAll);
    const stop = (key: string) => {
      const id = anims.get(key);
      if (id !== undefined && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
      anims.delete(key);
    };

    /** 이름 붙은 채널 하나의 tween. 같은 채널의 앞 tween 은 거두고 새로 건다. */
    const tween = (key: string, draw: (t: number) => void): void => {
      stop(key);
      if (destroyed || isInstant() || typeof requestAnimationFrame !== 'function') {
        draw(1);
        return;
      }
      const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const tick = (now: number) => {
        if (destroyed) return;
        const t = Math.min(1, (now - start) / TWEEN_MS);
        draw(1 - (1 - t) * (1 - t));
        if (t < 1) anims.set(key, requestAnimationFrame(tick));
        else anims.delete(key);
      };
      anims.set(key, requestAnimationFrame(tick));
    };
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    // ── 판의 상태
    let half = 1;
    let threshold = 1;
    /** 지금 판의 바늘 자취 (점 좌표). */
    let tracePts: Array<[number, number]> = [];

    /** 상태 s 의 칸 한가운데 세로 자리. 문턱에서 떨어진 거리로 정해진다. */
    const stateY = (s: number, h: number = half): number =>
      s >= h ? Y0 - (s - h + 0.5) * CELL_H : Y0 + (h - 1 - s + 0.5) * CELL_H;

    // ── 머리 캡션
    const caption = el('text', {
      x: 24, y: 30, 'font-family': fonts.body, 'font-size': fontSizes.md, fill: c.text,
    }, svg);

    // ── 줄 이름
    const rowLabel = (y: number, text: string) =>
      el('text', {
        x: PLOT_X0 - 12, y: y + 4, 'text-anchor': 'end',
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
      }, svg).textContent = text;
    rowLabel(ROW_OUTCOME, tr('label.outcome', 'outcome'));
    rowLabel(ROW_GUESS, tr('label.guess', 'guess'));
    rowLabel(ROW_MARK, tr('label.hit', 'right?'));

    // ── 지금 걸음의 기둥
    const cursor = el('rect', {
      x: PLOT_X0, y: ROW_OUTCOME - 16, width: colW(), height: ROW_MARK + 14 - (ROW_OUTCOME - 16),
      fill: c.bgSubtle, opacity: 0,
    }, svg);

    // ── 뒤집히는 자리
    const divider = el('line', {
      x1: colX(turnAt), x2: colX(turnAt), y1: ROW_OUTCOME - 18, y2: ROW_SEGMENT - 10,
      stroke: c.border, 'stroke-dasharray': '4 4',
    }, svg);

    // ── 카운터 칸 (위쪽 k · 아래쪽 k)
    type Cell = { rect: SVGRectElement; label: SVGTextElement; y: number; h: number };
    const makeCell = (fill: string): Cell => {
      const rect = el('rect', {
        x: GAUGE_X, y: Y0, width: GAUGE_W, height: 0, fill, stroke: c.bg, 'stroke-width': 2, rx: 3,
      }, svg);
      const label = el('text', {
        x: GAUGE_X + GAUGE_W / 2, y: Y0, 'text-anchor': 'middle',
        'font-family': fonts.mono, 'font-size': fontSizes.sm, fill: c.stateInk, opacity: 0,
      }, svg);
      return { rect, label, y: Y0, h: 0 };
    };
    const upCells: Cell[] = [];
    const downCells: Cell[] = [];
    for (let k = 0; k < MAX_HALF; k += 1) {
      upCells.push(makeCell(takenFill));
      downCells.push(makeCell(notTakenFill));
    }

    /** 칸 하나를 (y, h) 로 옮긴다. 라벨은 칸 한가운데. */
    const placeCell = (cell: Cell, y: number, h: number) => {
      cell.y = y;
      cell.h = h;
      cell.rect.setAttribute('y', String(y));
      cell.rect.setAttribute('height', String(Math.max(0, h)));
      cell.label.setAttribute('y', String(y + h / 2 + 4));
      cell.label.setAttribute('opacity', h > CELL_H * 0.6 ? '1' : '0');
    };

    /** 비트 수가 정한 칸 배치로 자란다(또는 줄어든다). */
    const layoutCells = (nextHalf: number) => {
      const from = [...upCells, ...downCells].map((cell) => [cell.y, cell.h] as const);
      const to: Array<readonly [number, number]> = [];
      for (let k = 0; k < MAX_HALF; k += 1) {
        const up = upCells[k]!;
        const down = downCells[k]!;
        up.label.textContent = String(nextHalf + k);
        down.label.textContent = String(nextHalf - 1 - k);
        to.push(k < nextHalf ? [Y0 - (k + 1) * CELL_H, CELL_H] : [Y0 - nextHalf * CELL_H, 0]);
      }
      for (let k = 0; k < MAX_HALF; k += 1) {
        to.push(k < nextHalf ? [Y0 + k * CELL_H, CELL_H] : [Y0 + nextHalf * CELL_H, 0]);
      }
      const all = [...upCells, ...downCells];
      tween('cells', (t) => {
        all.forEach((cell, i) => {
          const [fy, fh] = from[i]!;
          const [ty, th] = to[i]!;
          placeCell(cell, lerp(fy, ty, t), lerp(fh, th, t));
        });
      });
    };

    // ── 문턱 선
    const thresholdLine = el('line', {
      x1: GAUGE_X - 18, x2: PLOT_X1, y1: Y0, y2: Y0, stroke: c.text, 'stroke-width': 2,
    }, svg);
    // 칸 더미의 두 쪽 이름 — 바늘 왼쪽에 세로로 세워 자취와 겹치지 않게 한다.
    const sideLabel = (dy: number, text: string) => {
      const x = 28;
      const y = Y0 + dy;
      const t = el('text', {
        x, y, 'text-anchor': 'middle', transform: `rotate(-90 ${x} ${y})`,
        'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
      }, svg);
      t.textContent = text;
    };
    sideLabel(-MAX_HALF * CELL_H / 2, tr('label.taken', 'predict taken'));
    sideLabel(MAX_HALF * CELL_H / 2, tr('label.notTaken', 'predict not taken'));
    const thresholdName = el('text', {
      x: (GAUGE_X + GAUGE_W + PLOT_X0) / 2, y: Y0 - 6, 'text-anchor': 'middle',
      'font-family': fonts.body, 'font-size': fontSizes.xs, fill: c.textMuted,
    }, svg);
    thresholdName.textContent = '';

    // ── 자취 (앞 판은 옅게, 지금 판은 진하게)
    const ghost = el('polyline', {
      points: '', fill: 'none', stroke: c.textMuted, 'stroke-width': 1.5,
      'stroke-dasharray': '3 3', opacity: 0.7,
    }, svg);
    const trace = el('polyline', {
      points: '', fill: 'none', stroke: c.itemActive, 'stroke-width': 2.5,
      'stroke-linejoin': 'round',
    }, svg);
    const traceHead = el('circle', { cx: PLOT_X0, cy: Y0, r: 4, fill: c.itemActive, opacity: 0 }, svg);
    const pointsAttr = (pts: Array<[number, number]>) => pts.map(([x, y]) => `${x},${y}`).join(' ');

    // ── 바늘
    const needle = el('g', {}, svg);
    el('polygon', {
      points: `${GAUGE_X - 16},-8 ${GAUGE_X - 16},8 ${GAUGE_X - 2},0`, fill: c.itemActive,
    }, needle);
    el('rect', {
      x: GAUGE_X, y: -CELL_H / 2, width: GAUGE_W, height: CELL_H, rx: 3,
      fill: 'none', stroke: c.itemActive, 'stroke-width': 2.5,
    }, needle);
    let needleY = Y0 - CELL_H / 2;
    /** 바늘이 가고 있는 자리. tween 도중에도 목적지는 이것이다. */
    let needleTarget = needleY;
    const placeNeedle = (y: number) => {
      needleY = y;
      needle.setAttribute('transform', `translate(0 ${y})`);
    };
    placeNeedle(needleY);

    // ── 걸음마다 채우는 세 줄
    type Column = { outcome: SVGPolygonElement; guess: SVGPolygonElement; mark: SVGGElement };
    const columns: Column[] = [];
    const buildColumns = () => {
      for (const col of columns) {
        col.outcome.remove();
        col.guess.remove();
        col.mark.remove();
      }
      columns.length = 0;
      for (let k = 0; k < steps; k += 1) {
        const cx = colCx(k);
        const up = (outcomes[k] ?? 0) === 1;
        const outcome = el('polygon', {
          points: trianglePoints(cx, ROW_OUTCOME, up, 7),
          fill: up ? c.text : 'none', stroke: c.text, 'stroke-width': 1.5, opacity: 0.25,
        }, svg);
        const guess = el('polygon', {
          points: trianglePoints(cx, ROW_GUESS, true, 6), fill: c.textMuted, opacity: 0,
        }, svg);
        const mark = el('g', { opacity: 0 }, svg);
        columns.push({ outcome, guess, mark });
      }
    };

    // ── 구간 이름과 틀림 셈
    const segText = (x: number, y: number, size: string, fill: string) =>
      el('text', {
        x, y, 'text-anchor': 'middle', 'font-family': fonts.body, 'font-size': size, fill,
      }, svg);
    const loopName = segText(0, ROW_SEGMENT, fontSizes.xs, c.textMuted);
    const turnName = segText(0, ROW_SEGMENT, fontSizes.xs, c.textMuted);
    const loopTally = segText(0, ROW_TALLY, fontSizes.sm, c.text);
    const turnTally = segText(0, ROW_TALLY, fontSizes.sm, c.text);
    loopName.textContent = tr('label.loop', 'inner loop, three times');
    turnName.textContent = tr('label.turn', 'after the flip');
    const placeSegments = () => {
      const lx = (colX(0) + colX(turnAt)) / 2;
      const tx = (colX(turnAt) + colX(steps)) / 2;
      loopName.setAttribute('x', String(lx));
      loopTally.setAttribute('x', String(lx));
      turnName.setAttribute('x', String(tx));
      turnTally.setAttribute('x', String(tx));
      divider.setAttribute('x1', String(colX(turnAt)));
      divider.setAttribute('x2', String(colX(turnAt)));
    };
    const setTallies = (loop: number, turn: number) => {
      loopTally.textContent = tr('label.tally', '{n} missed', { n: loop });
      turnTally.textContent = tr('label.tally', '{n} missed', { n: turn });
    };

    buildColumns();
    placeSegments();
    setTallies(0, 0);

    const instance: SaturatingCounterStage = {
      setCounter(top, nextThreshold, state, nextSteps, nextTurnAt) {
        const nextHalf = Math.max(1, Math.min(MAX_HALF, Math.floor((top + 1) / 2)));
        if (nextSteps > 0 && nextSteps !== steps) {
          steps = nextSteps;
          buildColumns();
        }
        turnAt = nextTurnAt;
        placeSegments();
        for (const col of columns) {
          col.outcome.setAttribute('opacity', '0.25');
          col.guess.setAttribute('opacity', '0');
          col.mark.setAttribute('opacity', '0');
          while (col.mark.firstChild) col.mark.removeChild(col.mark.firstChild);
        }
        setTallies(0, 0);
        cursor.setAttribute('opacity', '0');

        // 앞 판의 자취는 옅게 남는다 — 새 판의 자취가 그 위에 다시 그려진다.
        if (tracePts.length > 1) ghost.setAttribute('points', pointsAttr(tracePts));

        half = nextHalf;
        threshold = nextThreshold;
        thresholdName.textContent = tr('label.threshold', '≥ {t}', { t: threshold });
        layoutCells(nextHalf);

        const startY = stateY(state);
        stop('trace');
        stop('threshold');
        thresholdLine.setAttribute('stroke', c.text);
        thresholdLine.setAttribute('stroke-width', '2');
        tracePts = [[colX(0), startY]];
        trace.setAttribute('points', pointsAttr(tracePts));
        traceHead.setAttribute('cx', String(colX(0)));
        traceHead.setAttribute('cy', String(startY));
        traceHead.setAttribute('opacity', '1');

        const fromY = needleY;
        needleTarget = startY;
        tween('needle', (t) => placeNeedle(lerp(fromY, startY, t)));
      },

      showGuess(step, state, guess) {
        const col = columns[step];
        if (!col) return;
        cursor.setAttribute('x', String(colX(step)));
        cursor.setAttribute('width', String(colW()));
        cursor.setAttribute('opacity', '1');
        col.guess.setAttribute('points', trianglePoints(colCx(step), ROW_GUESS, guess === 1, 6));
        col.guess.setAttribute('fill', c.itemActive);
        col.guess.setAttribute('opacity', '1');
        // 바늘이 지금 칸을 가리키는지 맞춰 둔다 (되짚기 뒤에도 자리가 맞게).
        const y = stateY(state);
        if (Math.abs(y - needleTarget) > 0.5) {
          const fromY = needleY;
          needleTarget = y;
          tween('needle', (t) => placeNeedle(lerp(fromY, y, t)));
        }
      },

      showCheck(step, outcome, hit, loopMisses, turnMisses) {
        const col = columns[step];
        if (!col) return;
        const up = outcome === 1;
        col.outcome.setAttribute('points', trianglePoints(colCx(step), ROW_OUTCOME, up, 7));
        col.outcome.setAttribute('fill', up ? c.text : 'none');
        col.outcome.setAttribute('opacity', '1');
        while (col.mark.firstChild) col.mark.removeChild(col.mark.firstChild);
        const cx = colCx(step);
        if (hit) {
          el('circle', { cx, cy: ROW_MARK, r: 6, fill: 'none', stroke: c.text, 'stroke-width': 2 }, col.mark);
        } else {
          el('line', { x1: cx - 6, y1: ROW_MARK - 6, x2: cx + 6, y2: ROW_MARK + 6, stroke: c.danger, 'stroke-width': 2.5 }, col.mark);
          el('line', { x1: cx - 6, y1: ROW_MARK + 6, x2: cx + 6, y2: ROW_MARK - 6, stroke: c.danger, 'stroke-width': 2.5 }, col.mark);
        }
        col.mark.setAttribute('opacity', '1');
        setTallies(loopMisses, turnMisses);
      },

      moveNeedle(step, from, to, moveThreshold) {
        const fromY = needleY;
        const toY = stateY(to);
        const x0 = colX(step);
        const x1 = colX(step + 1);
        const base = tracePts.slice();
        const y0 = base.length > 0 ? base[base.length - 1]![1] : stateY(from);
        needleTarget = toY;
        tween('needle', (t) => placeNeedle(lerp(fromY, toY, t)));
        tween('trace', (t) => {
          const hx = lerp(x0, x1, t);
          const hy = lerp(y0, toY, t);
          trace.setAttribute('points', pointsAttr([...base, [hx, hy]]));
          traceHead.setAttribute('cx', String(hx));
          traceHead.setAttribute('cy', String(hy));
        });
        tracePts = [...base, [x1, toY]];

        // 문턱을 넘은 걸음이면 문턱 선이 한 번 굵어졌다 돌아온다.
        const crossed = (from >= moveThreshold) !== (to >= moveThreshold);
        if (crossed) {
          thresholdLine.setAttribute('stroke', c.danger);
          tween('threshold', (t) => {
            thresholdLine.setAttribute('stroke-width', String(2 + 3 * (1 - t)));
            if (t >= 1) thresholdLine.setAttribute('stroke', c.text);
          });
        }
      },

      setCaption(text) {
        caption.textContent = text;
      },

      clear() {
        stopAll();
        caption.textContent = '';
        ghost.setAttribute('points', '');
        trace.setAttribute('points', '');
        traceHead.setAttribute('opacity', '0');
        tracePts = [];
        cursor.setAttribute('opacity', '0');
        thresholdLine.setAttribute('stroke', c.text);
        thresholdLine.setAttribute('stroke-width', '2');
        for (const col of columns) {
          col.outcome.setAttribute('opacity', '0.25');
          col.guess.setAttribute('opacity', '0');
          col.mark.setAttribute('opacity', '0');
        }
        setTallies(0, 0);
      },

      destroy() {
        destroyed = true;
        stopAll();
        // 러너가 붙여 준 캔버스는 떼지 않는다 — 우리가 그린 것만 거둔다.
        while (svg.firstChild) svg.removeChild(svg.firstChild);
      },
    };
    return instance;
  },
};
