/**
 * requires-sorted-stage — 같은 손이 두 줄에서 갈리는 그림.
 *
 * 화면은 위아래 두 줄이고, 두 줄에 **같은 절차**가 동시에 걸린다. 그래서 좌표계도
 * 한 벌만 있다 — 줄이 다를 뿐 칸 폭 · 짚개 자리 · 구간 자 (bracket) 는 두 줄이
 * 글자 하나 다르지 않게 같은 셈에서 나온다. 두 줄의 그림이 다르면 "같은 절차" 라는
 * 주장이 화면에서 무너진다.
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 밟은 걸음
 * 하나만 흐르게 한다. 걸음마다 부르는 메서드는 없다 — 그 메서드들이 곧 되돌릴 수
 * 없는 명령이었다 (S-scene).
 *
 * ── 칠을 무엇으로 가르나
 *
 * **채움은 값의 형편, 테두리는 짚음의 표식.** 한 속성에 두 뜻을 겹쳐 얹지 않는다.
 *
 *   채움  찾아 멈춘 칸 success · **찾는 값이 든 칸 accent** · 버린 구간 bgSubtle ·
 *         남은 구간 itemDefault
 *   테두리 짚어 본 적 있는 칸 itemComparing (굵게) · 아니면 border
 *
 * 옛 화면은 `paintCells` 가 채움과 테두리를 늘 함께 바꿔 둘이 한 뜻이었고, 게다가
 * **짚은 칸을 한 칸만 물들였다** — 다음 걸음이 오면 앞서 짚어 본 자리가 사라졌다.
 * 여기서는 짚은 자취가 테두리로 쌓여 마지막 화면까지 남는다.
 *
 * ── 이 조각의 결론을 무엇이 남기나
 *
 * 흐트러진 줄이 **있는 값을 놓친다** 는 것이 결론이므로, 다 끝난 화면에 셋이 함께
 * 서 있어야 한다.
 *
 *   ① 찾는 값이 든 칸  accent 채움. 처음부터 끝까지, 두 줄 모두.
 *   ② 그 칸을 버렸다   **놓친 구간 자** — 살아 있는 구간 자와 같은 높이에 danger 로
 *                      서는 또 하나의 자. 밀어낸 짚기가 버린 구간을 덮는다. 살아 있는
 *                      구간은 늘 남긴 쪽 안에 있으므로 둘이 가로로 겹치지 않는다.
 *   ③ 왜 못 갔나       그 자 하나가 "여기를 짚고 이쪽으로 돌아섰다" 를 말한다 —
 *                      자의 한 끝이 짚은 칸이고 그 칸의 테두리가 짚음을 증언한다.
 *                      답이 든 칸에는 danger 고리가 둘린다.
 *
 * 옛 화면은 ②와 ③이 아예 없었고 ①도 고리 하나의 `stroke` 칠로만 남았다.
 *
 * 움직이는 것:
 *   짚개(probe)   삼각 표식이 칸에서 칸으로 **가로로 뛴다**. 두 줄이 동시에.
 *   구간 자       버린 절반만큼 **줄어든다**. 버려지는 칸들은 옛 모습 그대로 아래로
 *                 가라앉으며 회색 바탕을 드러낸다.
 *   놓친 구간 자  돌아선 그 칸에서 **자라 나와** 버린 구간을 덮는다.
 *   답            줄마다의 답이 오른쪽에서 들어와 앉고, 답이 든 칸이 들렸다 내린다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 값 일곱 · 줄 둘로 고정이므로 H 상수 하나면
 * 족하다. 가로는 러너가 PIECE_CANVAS_W 로 정하고, 칸 폭은 그 폭에서 역산한다.
 *
 * destroy: 걸어 둔 프레임을 집합에 담아 일괄로 거두고, **기다리던 약속을 반드시
 * 푼다** — 프레임을 취소하면 그 tick 이 아예 안 불려 resolve 가 지나가지 않는다
 * (S-piece).
 */

import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  radii,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  answerSlot,
  atLatestRound,
  droppedSpan,
  foundSlot,
  isClosed,
  justProbedSlot,
  lastLook,
  lostLook,
  probedSlots,
  windowOf,
  type RequiresSortedCaption,
  type RequiresSortedScene,
  type SceneRow,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 세로 배치. 값 일곱 · 줄 둘로 고정이라 상수 한 벌로 끝난다.
const H = 334;
const CHIP_Y = 6;
const CHIP_H = 22;
const CHIP_W = 30;
const ROW_TOP = [36, 166];
const ROW_LABEL_BASE = 11;
const PROBE_TOP = 18;
const PROBE_W = 16;
const PROBE_H = 14;
const CELL_DY = 38;
const CELL_H = 46;
const RING_INSET = 5;
const BRACKET_DY = 100;
const TICK_H = 9;
const TICK_W = 2;
const BASE_H = 2;
const CAP_Y1 = 302;
const CAP_Y2 = 320;
/** 캡션이 두 줄 안에 담기도록 재는 폭과 글자 크기. fontSizes.sm 과 짝이다. */
const CAP_SIDE = 80;
const CAP_FONT_PX = 12;

// ── 가로. 상수는 상한만 두고 실제 폭은 캔버스에서 역산한다 (S-piece).
const CELL_MAX_W = 80;
const SIDE_MIN = 26;
const CELL_GAP = 6;

// ── 테두리 굵기. 오직 "짚어 보았나" 한 뜻만 진다.
const EDGE_PLAIN = 1.5;
const EDGE_PROBED = 2.5;

// ── 걸음 운동. stepMs 위에 얹히므로 짧게 유지한다 (S-piece).
const PROBE_MS = 320;
const SETTLE_MS = 380;
const LOST_MS = 440;
const VERDICT_MS = 380;
/** 짚개가 옆 칸으로 뛸 때 솟는 높이. 이미 서 있던 것이 걸어가는 꼴이다. */
const HOP_RISE = 12;
/** 처음 내려꽂을 때 위에서 떨어지는 거리. */
const PROBE_DROP = 20;
/** 버려지는 칸이 가라앉는 깊이. */
const SINK_DY = 14;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 한글·전각 글자는 한 칸, 그 밖은 0.55 칸으로 센다. */
const WIDE_CHAR = /[ᄀ-ᇿ　-〿㄰-㆏가-힯＀-￯]/;

/** 화면 폭에 맞춰 캡션을 두 줄로 접는다. */
function wrapCaption(text: string, maxPx: number, fontPx: number): [string, string] {
  const width = (s: string): number => {
    let w = 0;
    for (const ch of s) w += WIDE_CHAR.test(ch) ? 1 : 0.55;
    return w * fontPx;
  };
  if (width(text) <= maxPx) return [text, ''];
  const words = text.split(' ');
  let head = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = head ? `${head} ${words[i]}` : (words[i] as string);
    if (width(next) > maxPx && head) break;
    head = next;
  }
  return [head, words.slice(i).join(' ')];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

function now(): number {
  return typeof performance === 'object' ? performance.now() : Date.now();
}

/** 칸 자리 셈. 장면은 칸 번호만 말하고 자리는 여기서 캔버스로 역산한다 (S-piece). */
type Geom = {
  count: number;
  cellW: number;
  cellRectW: number;
  originX: number;
  cellX(i: number): number;
  centerX(i: number): number;
};

/** 구간 자 한 벌. 채운 사각 셋이라 선 굵기가 일그러지지 않는다. */
type Bracket = { base: SVGRectElement; tickL: SVGRectElement; tickR: SVGRectElement };

/** 이번 장면이 세운 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다. */
type RowNodes = {
  row: SceneRow;
  top: number;
  cells: SVGRectElement[];
  texts: SVGTextElement[];
  probe: SVGGElement | null;
  live: Bracket | null;
  lost: Bracket | null;
  ring: SVGRectElement | null;
  verdict: SVGTextElement | null;
};

export const requiresSortedStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<RequiresSortedScene> {
    const svg = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    // 러너가 붙여 준 캔버스는 떼지 않는다. 비울 것은 캔버스 안쪽이다 (S-view).
    svg.textContent = '';

    /**
     * 장면마다 통째로 다시 짓는 뿌리.
     *
     * 고정 자리에 남겨 두는 요소를 하나도 두지 않는다. 남겨 두면 정적 경로가 그
     * 속성을 매번 명시로 쓰는지 따로 확인해야 하고, 빠뜨린 속성 하나가 되짚기
     * 판정을 가른다 (S-scene 의 "재건 밖 요소").
     */
    const root = el('g', {});
    svg.appendChild(root);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 세대 빗장 (S-scene).
     *
     * `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 아예 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 번호뿐이다.
     * 걸음 함수가 프레임을 여러 번 지나고 운동 뒤에 장면을 다시 세우는 길도 지나므로,
     * 살아남은 앞 세대가 새로 선 화면을 덮지 않게 마디마다 자기 번호를 본다.
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;
    const canAnimate = typeof requestAnimationFrame === 'function';

    function tween(duration: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) return resolve();
        const started = now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          // 세대가 바뀌었으면 그리지 않고 물러난다. 남은 프레임이 새 화면을 덮는
          // 길을 여기서 끊는다.
          if (!alive(mine)) return finish();
          const p = duration <= 0 ? 1 : clamp01((now() - started) / duration);
          draw(easeOutCubic(p));
          if (p >= 1) return finish();
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    function geomOf(scene: RequiresSortedScene): Geom {
      const count = scene.rows[0]?.values.length ?? 0;
      // 요소 크기는 상한만 두고 남는 폭을 좌우 여백으로 버리지 않는다 (S-piece).
      const cellW = count > 0 ? Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / count)) : 0;
      const originX = Math.round((W - count * cellW) / 2);
      const cellRectW = Math.max(1, cellW - CELL_GAP);
      return {
        count,
        cellW,
        cellRectW,
        originX,
        cellX: (i: number): number => originX + i * cellW + CELL_GAP / 2,
        centerX: (i: number): number => originX + i * cellW + CELL_GAP / 2 + cellRectW / 2,
      };
    }

    /** 칸 번호 구간 → 자의 왼쪽 끝과 길이. 두 자가 같은 셈을 지난다. */
    function spanPx(geo: Geom, lo: number, hi: number): { x: number; w: number } {
      return { x: geo.cellX(lo), w: Math.max(0, (hi - lo + 1) * geo.cellW - CELL_GAP) };
    }

    function newBracket(tone: string): Bracket {
      const base = el('rect', { x: 0, y: 0, width: 0, height: BASE_H, fill: tone });
      const tickL = el('rect', { x: 0, y: 0, width: TICK_W, height: TICK_H, fill: tone });
      const tickR = el('rect', { x: 0, y: 0, width: TICK_W, height: TICK_H, fill: tone });
      root.append(base, tickL, tickR);
      return { base, tickL, tickR };
    }

    function placeBracket(b: Bracket, x: number, w: number, y: number): void {
      const width = Math.max(0, w);
      b.base.setAttribute('x', String(x));
      b.base.setAttribute('y', String(y));
      b.base.setAttribute('width', String(width));
      b.tickL.setAttribute('x', String(x));
      b.tickL.setAttribute('y', String(y - TICK_H));
      b.tickR.setAttribute('x', String(x + Math.max(0, width - TICK_W)));
      b.tickR.setAttribute('y', String(y - TICK_H));
    }

    // ── 칠 ───────────────────────────────────────────────────────────────

    /**
     * 칸의 채움과 글자 잉크 — **값의 형편**만 말한다.
     *
     * 찾은 칸이 곧 답이 든 칸이므로 위가 이긴다. 답이 든 칸은 버린 구간 안에 들어가도
     * accent 를 지킨다 — 회색 구간 한가운데 accent 한 칸이 서 있는 것이 이 조각의
     * 결론 그 자체다.
     */
    function cellPaint(
      scene: RequiresSortedScene,
      row: SceneRow,
      i: number,
    ): { fill: string; ink: string } {
      if (i === foundSlot(row)) return { fill: c.success, ink: c.textInverse };
      if (i === answerSlot(scene, row)) return { fill: c.accent, ink: c.stateInk };
      const w = windowOf(row);
      const live = !isClosed(row) && i >= w.lo && i <= w.hi;
      return live ? { fill: c.itemDefault, ink: c.text } : { fill: c.bgSubtle, ink: c.textMuted };
    }

    // ── 정적 그리기 ────────────────────────────────────────────────────────

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      root.replaceChildren();
    }

    function drawChip(scene: RequiresSortedScene, geo: Geom): void {
      // accent 위의 글자는 stateInk 가 정본 짝이다.
      root.appendChild(
        el('rect', {
          x: geo.originX,
          y: CHIP_Y,
          width: CHIP_W,
          height: CHIP_H,
          rx: parseFloat(radii.sm),
          fill: c.accent,
        }),
      );
      const value = el('text', {
        x: geo.originX + CHIP_W / 2,
        y: CHIP_Y + CHIP_H - 6,
        'text-anchor': 'middle',
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        'font-weight': '700',
        fill: c.stateInk,
      });
      value.textContent = Number.isFinite(scene.target) ? String(scene.target) : '';
      root.appendChild(value);

      const label = el('text', {
        x: geo.originX + CHIP_W + 8,
        y: CHIP_Y + CHIP_H - 6,
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: c.textMuted,
      });
      label.textContent = t('label.target', 'both rows look for this value');
      root.appendChild(label);
    }

    function drawRow(scene: RequiresSortedScene, geo: Geom, row: SceneRow, top: number): RowNodes {
      const label = el('text', {
        x: geo.originX,
        y: top + ROW_LABEL_BASE,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'letter-spacing': '0.08em',
        fill: c.textMuted,
      });
      label.textContent =
        row.key === 'sorted'
          ? t('label.sortedRow', 'in order')
          : t('label.shuffledRow', 'out of order');
      root.appendChild(label);

      const probed = new Set(probedSlots(row));
      const cells: SVGRectElement[] = [];
      const texts: SVGTextElement[] = [];
      row.values.forEach((v, i) => {
        const paint = cellPaint(scene, row, i);
        const mark = probed.has(i);
        const rect = el('rect', {
          x: geo.cellX(i),
          y: top + CELL_DY,
          width: geo.cellRectW,
          height: CELL_H,
          rx: parseFloat(radii.sm),
          fill: paint.fill,
          // 테두리는 짚음의 표식 하나만 진다. 짚어 본 칸은 끝까지 이 테를 두른다.
          stroke: mark ? c.itemComparing : c.border,
          'stroke-width': mark ? EDGE_PROBED : EDGE_PLAIN,
        });
        root.appendChild(rect);
        cells.push(rect);

        const txt = el('text', {
          x: geo.centerX(i),
          y: top + CELL_DY + CELL_H / 2 + 6,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': '600',
          fill: paint.ink,
        });
        txt.textContent = String(v);
        root.appendChild(txt);
        texts.push(txt);
      });

      // 살아 있는 구간 자. 닫힌 줄에는 **짓지 않는다** — 숨기기만 하면 앞 걸음의 두
      // 끝이 속성에 남아 되짚기 판정이 어긋난다 (S-scene).
      let live: Bracket | null = null;
      if (!isClosed(row) || foundSlot(row) !== null) {
        const w = windowOf(row);
        if (w.lo <= w.hi) {
          live = newBracket(foundSlot(row) !== null ? c.success : c.primary);
          const px = spanPx(geo, w.lo, w.hi);
          placeBracket(live, px.x, px.w, top + BRACKET_DY);
        }
      }

      // 놓친 구간 자 — 답을 밀어낸 짚기가 버린 구간. 밝혀진 뒤로는 남는다.
      let lost: Bracket | null = null;
      let ring: SVGRectElement | null = null;
      const miss = lostLook(row);
      const missSpan = miss === null ? null : droppedSpan(miss);
      if (missSpan !== null) {
        lost = newBracket(c.danger);
        const px = spanPx(geo, missSpan.lo, missSpan.hi);
        placeBracket(lost, px.x, px.w, top + BRACKET_DY);

        const at = answerSlot(scene, row);
        if (at >= 0) {
          ring = el('rect', {
            x: geo.cellX(at) - RING_INSET,
            y: top + CELL_DY - RING_INSET,
            width: geo.cellRectW + RING_INSET * 2,
            height: CELL_H + RING_INSET * 2,
            rx: parseFloat(radii.md),
            fill: 'none',
            stroke: c.danger,
            'stroke-width': EDGE_PROBED,
            'stroke-dasharray': '5 4',
          });
          root.appendChild(ring);
        }
      }

      // 짚개 — 아직 아무것도 안 짚었으면 짓지 않는다.
      let probe: SVGGElement | null = null;
      const last = lastLook(row);
      if (last !== null) {
        probe = el('g', { opacity: isClosed(row) ? 0.3 : 1 });
        probe.setAttribute(
          'transform',
          `translate(${geo.centerX(last.slot) - PROBE_W / 2} ${top + PROBE_TOP})`,
        );
        probe.appendChild(
          el('polygon', {
            points: `0,0 ${PROBE_W},0 ${PROBE_W / 2},${PROBE_H}`,
            fill: c.itemComparing,
          }),
        );
        root.appendChild(probe);
      }

      // 줄마다의 답. `done` 전에는 짓지 않는다.
      let verdict: SVGTextElement | null = null;
      if (scene.announced) {
        const at = foundSlot(row);
        verdict = el('text', {
          x: geo.originX + geo.count * geo.cellW - CELL_GAP / 2,
          y: top + ROW_LABEL_BASE,
          'text-anchor': 'end',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          'font-weight': '600',
          fill: at !== null ? c.success : c.danger,
        });
        verdict.textContent =
          at !== null
            ? t('verdict.found', 'found at slot {i}', { i: at })
            : t('verdict.absent', 'answers: not here', {});
        root.appendChild(verdict);
      }

      return { row, top, cells, texts, probe, live, lost, ring, verdict };
    }

    /** 캡션 문안. 장면은 무엇을 말할지만 담고 인자는 장면에서 도로 읽는다 (C10). */
    function captionText(scene: RequiresSortedScene, cap: RequiresSortedCaption): string {
      const target = Number.isFinite(scene.target) ? String(scene.target) : '';
      switch (cap.kind) {
        case 'setup':
          return t(
            'caption.setup',
            'Two rows, the same seven values, the same binary search. One row is in order, the other is not.',
            {},
          );
        case 'probeBoth':
          return t(
            'caption.probeBoth',
            'The same procedure probes the middle of both rows — slot {i}.',
            { i: justProbedSlot(scene) ?? 0 },
          );
        case 'probeOne':
          return t('caption.probeOne', 'Only the lower row is still running. It probes slot {i}.', {
            i: justProbedSlot(scene) ?? 0,
          });
        case 'probeApart':
          return t('caption.probeApart', 'Each row probes the middle of its own live range.', {});
        case 'dropRight':
          return t(
            'caption.dropRight',
            '{target} is smaller than both probes, so both rows throw away the right half.',
            { target },
          );
        case 'dropLeft':
          return t(
            'caption.dropLeft',
            '{target} is larger than both probes, so both rows throw away the left half.',
            { target },
          );
        case 'narrow':
          return t('caption.narrow', 'Each row drops the half that cannot hold {target}.', {
            target,
          });
        case 'split':
          return t(
            'caption.split',
            'The ordered row lands on {target} and stops. The other sees a smaller value and turns right.',
            { target },
          );
        case 'empty':
          return t(
            'caption.empty',
            'The range closes on nothing. The lower row answers: {target} is not here.',
            { target },
          );
        case 'lost':
          return t(
            'caption.lost',
            'The unordered row just threw away the half that actually holds {target}.',
            { target },
          );
        case 'verdict':
          return t(
            'caption.verdict',
            'Same procedure, same seven values: found above, "not here" below — while {target} sits in the ringed slot all along.',
            { target },
          );
      }
    }

    function drawCaption(scene: RequiresSortedScene): void {
      const text = scene.caption === null ? '' : captionText(scene, scene.caption);
      const [l1, l2] = wrapCaption(text, W - CAP_SIDE, CAP_FONT_PX);
      for (const [line, y] of [
        [l1, CAP_Y1],
        [l2, CAP_Y2],
      ] as [string, number][]) {
        const node = el('text', {
          x: W / 2,
          y,
          'text-anchor': 'middle',
          'font-family': fonts.body,
          'font-size': fontSizes.sm,
          fill: c.text,
        });
        node.textContent = line;
        root.appendChild(node);
      }
    }

    /** 그 장면이 말하는 것을 전부 세운다. 앞 화면과 견주지 않는다 (S-scene). */
    function drawStatic(scene: RequiresSortedScene): Map<string, RowNodes> {
      rewind();
      const geo = geomOf(scene);
      drawChip(scene, geo);
      const drawn = new Map<string, RowNodes>();
      scene.rows.slice(0, ROW_TOP.length).forEach((row, ri) => {
        drawn.set(row.key, drawRow(scene, geo, row, ROW_TOP[ri] as number));
      });
      drawCaption(scene);
      return drawn;
    }

    // ── 걸음 운동 ─────────────────────────────────────────────────────────

    /**
     * 짚는다 — 삼각 표식이 앞서 짚은 칸에서 이번 칸으로 뛴다.
     *
     * 출발 칸은 **그 줄의 자취**가 말한다 (`looks[n-2]`). `prev` 에서 꺼내면 "고르는
     * 데만" 을 어긴다 (S-scene). 처음 짚는 줄은 뛸 데가 없으므로 위에서 내려꽂는다.
     */
    function flowProbe(
      scene: RequiresSortedScene,
      drawn: Map<string, RowNodes>,
      mine: number,
    ): Promise<void> {
      const geo = geomOf(scene);
      type Hop = {
        probe: SVGGElement;
        cell: SVGRectElement | null;
        fromX: number;
        toX: number;
        top: number;
        /** 처음 짚는 줄이라 뛰어 올 데가 없다. */
        fresh: boolean;
      };
      const hops: Hop[] = [];
      for (const row of scene.rows) {
        const nodes = drawn.get(row.key);
        const last = lastLook(row);
        if (nodes === undefined || nodes.probe === null || last === null) continue;
        if (last.narrow !== null) continue; // 이번에 짚은 줄만 움직인다
        const before = row.looks[row.looks.length - 2];
        hops.push({
          probe: nodes.probe,
          cell: nodes.cells[last.slot] ?? null,
          fromX: geo.centerX(before === undefined ? last.slot : before.slot) - PROBE_W / 2,
          toX: geo.centerX(last.slot) - PROBE_W / 2,
          top: nodes.top,
          fresh: before === undefined,
        });
      }
      if (hops.length === 0) return Promise.resolve();

      // 두 줄을 한 시계로 흘린다. 뜻이 하나이므로 시계를 나누지 않는다 (S-scene).
      return tween(PROBE_MS, mine, (p) => {
        for (const hop of hops) {
          const x = hop.fromX + (hop.toX - hop.fromX) * p;
          const rise = hop.fresh ? -PROBE_DROP * (1 - p) : -HOP_RISE * Math.sin(Math.PI * p);
          hop.probe.setAttribute('transform', `translate(${x} ${hop.top + PROBE_TOP + rise})`);
          // 테두리는 짚는 동안 굵어져 끝값에 닿는다. 정적 그리기가 정본이라 도착점이
          // 이미 그 값이다.
          hop.cell?.setAttribute(
            'stroke-width',
            String(EDGE_PLAIN + (EDGE_PROBED - EDGE_PLAIN) * p),
          );
        }
      });
    }

    /**
     * 버린다 — 구간 자가 줄고, 버려지는 칸들이 옛 모습 그대로 가라앉는다.
     *
     * 가라앉는 것은 **덧그린 옛 모습**이다. 밑에는 정적 그리기가 세운 회색 칸이 이미
     * 서 있으므로, 옛 모습이 내려가며 흐려지면 회색이 드러난다. 운동의 방향이
     * 뒤집힌 꼴이다 (S-scene).
     */
    function flowSettle(
      scene: RequiresSortedScene,
      drawn: Map<string, RowNodes>,
      mine: number,
    ): Promise<void> {
      const geo = geomOf(scene);
      type Shrink = {
        bracket: Bracket;
        y: number;
        from: { x: number; w: number };
        to: { x: number; w: number };
        /** 구간이 닫힌 줄이라 자가 사라지며 끝난다. */
        fade: boolean;
      };
      type Land = { rect: SVGRectElement; text: SVGTextElement; cx: number; cy: number };
      const shrinks: Shrink[] = [];
      const sinks: SVGGElement[] = [];
      const lands: Land[] = [];

      for (const row of atLatestRound(scene)) {
        const nodes = drawn.get(row.key);
        const last = lastLook(row);
        if (nodes === undefined || last === null || last.narrow === null) continue;
        const y = nodes.top + BRACKET_DY;
        const from = spanPx(geo, last.from.lo, last.from.hi);
        const closed = last.narrow.lo > last.narrow.hi;
        // 닫힌 줄은 정적 화면에 자가 없다. 줄어드는 것을 보이려면 이번 걸음에만 쓸
        // 자를 따로 세워 끝에서 함께 거둔다.
        const bracket = nodes.live ?? newBracket(c.primary);
        const to = closed
          ? { x: geo.cellX(last.slot) + geo.cellRectW / 2, w: 0 }
          : spanPx(geo, last.narrow.lo, last.narrow.hi);
        shrinks.push({ bracket, y, from, to, fade: closed });

        // 이번에 버려진 칸들. 답이 든 칸은 칠이 바뀌지 않으므로 덧그리지 않는다.
        const at = answerSlot(scene, row);
        const probed = new Set(probedSlots(row));
        for (let i = last.from.lo; i <= last.from.hi; i += 1) {
          const dropped = closed || i < last.narrow.lo || i > last.narrow.hi;
          if (!dropped || i === at) continue;
          const ghost = el('g', {});
          ghost.appendChild(
            el('rect', {
              x: geo.cellX(i),
              y: nodes.top + CELL_DY,
              width: geo.cellRectW,
              height: CELL_H,
              rx: parseFloat(radii.sm),
              fill: c.itemDefault,
              stroke: probed.has(i) ? c.itemComparing : c.border,
              'stroke-width': probed.has(i) ? EDGE_PROBED : EDGE_PLAIN,
            }),
          );
          const txt = el('text', {
            x: geo.centerX(i),
            y: nodes.top + CELL_DY + CELL_H / 2 + 6,
            'text-anchor': 'middle',
            'font-family': fonts.mono,
            'font-size': fontSizes.lg,
            'font-weight': '600',
            fill: c.text,
          });
          txt.textContent = String(row.values[i]);
          ghost.appendChild(txt);
          root.appendChild(ghost);
          sinks.push(ghost);
        }

        // 찾아 멈춘 칸은 가라앉는 대신 부풀었다 내려앉는다.
        const landed = foundSlot(row);
        if (landed !== null && last.narrow.action === 'found') {
          const rect = nodes.cells[landed];
          const text = nodes.texts[landed];
          if (rect !== undefined && text !== undefined) {
            lands.push({
              rect,
              text,
              cx: geo.centerX(landed),
              cy: nodes.top + CELL_DY + CELL_H / 2,
            });
          }
        }
      }

      if (shrinks.length === 0 && sinks.length === 0) return Promise.resolve();

      return tween(SETTLE_MS, mine, (p) => {
        for (const s of shrinks) {
          placeBracket(
            s.bracket,
            s.from.x + (s.to.x - s.from.x) * p,
            s.from.w + (s.to.w - s.from.w) * p,
            s.y,
          );
          if (s.fade) {
            for (const n of [s.bracket.base, s.bracket.tickL, s.bracket.tickR]) {
              n.setAttribute('opacity', String(1 - p));
            }
          }
        }
        for (const ghost of sinks) {
          ghost.setAttribute('transform', `translate(0 ${SINK_DY * p})`);
          ghost.setAttribute('opacity', String(1 - p));
        }
        for (const l of lands) {
          const k = 1 + 0.12 * (1 - p);
          const pose = `translate(${l.cx} ${l.cy}) scale(${k}) translate(${-l.cx} ${-l.cy})`;
          l.rect.setAttribute('transform', pose);
          l.text.setAttribute('transform', pose);
        }
      });
    }

    /**
     * 놓쳤다 — 돌아선 그 칸에서 danger 자가 자라 나와 버린 구간을 덮고, 답이 든 칸에
     * 고리가 조여 든다. 이 조각의 결론이 서는 걸음이다.
     */
    function flowLost(
      scene: RequiresSortedScene,
      drawn: Map<string, RowNodes>,
      key: string,
      mine: number,
    ): Promise<void> {
      const geo = geomOf(scene);
      const row = scene.rows.find((r) => r.key === key);
      const nodes = drawn.get(key);
      if (row === undefined || nodes === undefined || nodes.lost === null) return Promise.resolve();
      const miss = lostLook(row);
      const span = miss === null ? null : droppedSpan(miss);
      if (miss === null || span === null) return Promise.resolve();

      const bracket = nodes.lost;
      const y = nodes.top + BRACKET_DY;
      const from = { x: geo.centerX(miss.slot), w: 0 };
      const to = spanPx(geo, span.lo, span.hi);
      const ring = nodes.ring;
      const at = answerSlot(scene, row);
      const cx = geo.centerX(at);
      const cy = nodes.top + CELL_DY + CELL_H / 2;

      // 자가 자라는 것과 고리가 조이는 것은 한 뜻이라 한 시계로 돈다.
      return tween(LOST_MS, mine, (p) => {
        placeBracket(bracket, from.x + (to.x - from.x) * p, from.w + (to.w - from.w) * p, y);
        if (ring !== null) {
          const k = 1 + 0.45 * (1 - p);
          ring.setAttribute(
            'transform',
            `translate(${cx} ${cy}) scale(${k}) translate(${-cx} ${-cy})`,
          );
          ring.setAttribute('stroke-width', String(EDGE_PROBED + 2 * (1 - p)));
        }
      });
    }

    /** 답한다 — 줄마다의 답이 오른쪽에서 들어와 앉고, 답이 든 칸이 들렸다 내린다. */
    function flowVerdict(
      scene: RequiresSortedScene,
      drawn: Map<string, RowNodes>,
      mine: number,
    ): Promise<void> {
      type Say = {
        text: SVGTextElement;
        /** 답이 든 칸. 답과 함께 들렸다 내린다. */
        rect: SVGRectElement | null;
        ink: SVGTextElement | null;
      };
      const says: Say[] = [];
      for (const row of scene.rows) {
        const nodes = drawn.get(row.key);
        if (nodes === undefined || nodes.verdict === null) continue;
        const at = foundSlot(row) ?? answerSlot(scene, row);
        says.push({
          text: nodes.verdict,
          rect: at >= 0 ? (nodes.cells[at] ?? null) : null,
          ink: at >= 0 ? (nodes.texts[at] ?? null) : null,
        });
      }
      if (says.length === 0) return Promise.resolve();

      // 두 줄이 나란히. 차례로 울리면 "같은 절차" 라는 짝이 풀린다.
      return tween(VERDICT_MS, mine, (p) => {
        for (const s of says) {
          s.text.setAttribute('opacity', String(p));
          s.text.setAttribute('transform', `translate(${14 * (1 - p)} 0)`);
          const lift = `translate(0 ${-7 * (1 - p)})`;
          s.rect?.setAttribute('transform', lift);
          s.ink?.setAttribute('transform', lift);
        }
      });
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 밟은 걸음 하나만 흐르게
     * 한다. `prev` 는 쓰지 않는다 — 출발 그림에 필요한 것이 전부 `looks` 자취에서
     * 나오므로 고를 것이 `step` 하나뿐이다 (S-scene).
     */
    async function render(
      next: RequiresSortedScene,
      _prev: RequiresSortedScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const drawn = drawStatic(next);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;
      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'probe':
          await flowProbe(next, drawn, mine);
          break;
        case 'settle':
          await flowSettle(next, drawn, mine);
          break;
        case 'lost':
          await flowLost(next, drawn, step.row, mine);
          break;
        case 'verdict':
          await flowVerdict(next, drawn, mine);
          break;
      }
      if (!alive(mine)) return;

      // 흐르며 남은 보간 좌표 끝자리 · 임시 자 · 가라앉은 덧그림이 노드째 사라진다.
      // 되돌릴 목록을 손으로 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 프레임을 취소하면 그 tick 이 아예 안 불려 resolve 가
        // 지나가지 않는다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
