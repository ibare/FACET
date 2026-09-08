/**
 * requires-sorted-stage — 같은 손이 두 줄에서 갈리는 그림.
 *
 * 화면은 위아래 두 줄이고, 두 줄에 **같은 절차**가 동시에 걸린다. 그래서 좌표계도
 * 한 벌만 있다 — 줄이 다를 뿐 칸 폭 · 짚개 자리 · 구간 자 (bracket) 는 두 줄이
 * 글자 하나 다르지 않게 같은 셈에서 나온다. 두 줄의 그림이 다르면 "같은 절차" 라는
 * 주장이 화면에서 무너진다.
 *
 * 움직이는 것 셋:
 *   짚개(probe)   삼각 표식이 칸에서 칸으로 **가로로 미끄러진다**. 두 줄이 동시에.
 *   구간 자       칸 아래의 자가 **줄어든다**. 버린 절반만큼 짧아지고, 비면 한 점으로
 *                 닫힌다. 채운 사각을 X 로만 늘여 그리므로 선 굵기가 일그러지지 않는다.
 *   답 고리       찾는 값이 실제로 든 칸을 두르는 점선 고리. 처음부터 두 줄 모두에
 *                 있고 끝까지 남는다 — 어긋남은 이 고리가 회색 지대에 남는 것으로
 *                 보인다. 밀려나는 순간 색이 danger 로 바뀌며 한 번 커졌다 돌아온다.
 *
 * 세로는 마운트 뒤 바뀌지 않는다 (S-view). 값 일곱 · 줄 둘로 고정이므로 H 상수 하나면
 * 족하다. 가로는 러너가 PIECE_CANVAS_W 로 정하고, 칸 폭은 그 폭에서 역산한다.
 *
 * 색 (S-view 결정 트리):
 *   짚은 칸    itemComparing  — 짚는 일이 곧 견줌이다 (1. 알고리즘 상태)
 *   찾은 칸    success        — 긍정 신호 (2. severity)
 *   밀려난 고리 danger        — 오류 신호 (2. severity)
 *   답 고리    accent         — "여기 답이 있다" 는 단일 강조 (emphasis)
 *   버린 칸    bgSubtle/textMuted — 알고리즘 상태 어휘에 "버림" 이 없다. 새 state
 *              토큰을 이 조각 혼자 만들면 view 간 어휘가 갈리므로 (S-view 1번 단서)
 *              강조를 낮추는 구조 색으로 떨어뜨린다 (9. structural).
 *
 * destroy: 자기 다음 회차를 예약하는 루프는 없다. 다만 걸음 애니메이션을 재는
 * 유한 타이머를 쓰므로 그것들을 집합에 담아 destroy 에서 모두 걷고, destroyed
 * 플래그로 대기 중인 약속을 즉시 풀어 준다.
 */

import {
  getColors,
  makeTranslator,
  fonts,
  fontSizes,
  radii,
  PIECE_CANVAS_W,
  type CanvasView,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 세로 배치. 값 일곱 · 줄 둘로 고정이라 상수 한 벌로 끝난다.
const H = 302;
const CHIP_Y = 6;
const CHIP_H = 22;
const CHIP_W = 30;
const ROW_TOP = [34, 146];
const ROW_LABEL_BASE = 11;
const PROBE_TOP = 16;
const PROBE_W = 16;
const PROBE_H = 14;
const CELL_DY = 38;
const CELL_H = 46;
const RING_INSET = 5;
const BRACKET_DY = 100;
const TICK_H = 9;
const TICK_W = 2;
const BASE_H = 2;
const CAP_Y1 = 276;
const CAP_Y2 = 294;
/** 캡션이 두 줄 안에 담기도록 재는 폭과 글자 크기. fontSizes.sm 과 짝이다. */
const CAP_SIDE = 80;
const CAP_FONT_PX = 12;

// ── 가로. 상수는 상한만 두고 실제 폭은 캔버스에서 역산한다 (S-piece).
const CELL_MAX_W = 80;
const SIDE_MIN = 26;
const CELL_GAP = 6;

// ── 걸음 애니메이션. stepMs 위에 얹히므로 짧게 유지한다 (S-piece).
const MOVE_MS = 300;
const SHRINK_MS = 280;
const PULSE_MS = 200;
const FADE_MS = 240;

export type ProbeSpec = { row: string; index: number; value: number };
export type SettleSpec = {
  row: string;
  action: 'left' | 'right' | 'found' | 'empty';
  lo: number;
  hi: number;
  foundAt: number;
};
export type VerdictSpec = { row: string; found: boolean; index: number };

type RowInput = { key: string; values: number[] };

type RowParts = {
  key: string;
  values: number[];
  answerAt: number;
  top: number;
  cellRects: SVGRectElement[];
  cellTexts: SVGTextElement[];
  ring: SVGRectElement;
  ringWrap: SVGGElement;
  probe: SVGGElement;
  bracketBase: SVGRectElement;
  tickL: SVGRectElement;
  tickR: SVGRectElement;
  verdict: SVGTextElement;
  lo: number;
  hi: number;
  probed: number;
  found: number;
  closed: boolean;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** 한글·전각 글자는 한 칸, 그 밖은 0.55 칸으로 센다. */
const WIDE_CHAR = /[\u1100-\u11ff\u3000-\u303f\u3130-\u318f\uac00-\ud7af\uff00-\uffef]/;

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

function readRows(initial: Record<string, unknown> | undefined): {
  rows: RowInput[];
  target: number;
} {
  const target = typeof initial?.target === 'number' ? initial.target : NaN;
  const raw = Array.isArray(initial?.rows) ? initial.rows : [];
  const rows: RowInput[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue;
    const rec = r as { key?: unknown; values?: unknown };
    if (typeof rec.key !== 'string' || !Array.isArray(rec.values)) continue;
    const values = rec.values.filter((v): v is number => typeof v === 'number');
    if (values.length === 0) continue;
    rows.push({ key: rec.key, values });
  }
  return { rows, target };
}

export const requiresSortedStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const svg = params.canvas;
    const c = getColors(params.theme);
    const tr = params.t ?? makeTranslator(params.locale);
    const W = PIECE_CANVAS_W;

    // 러너가 붙여 준 캔버스는 떼지 않는다. 비울 것은 캔버스 안쪽이다 (S-view).
    svg.textContent = '';

    const { rows: rowInputs, target } = readRows(params.initialData);
    const count = rowInputs[0]?.values.length ?? 0;

    // 폭은 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
    const cellW = count > 0 ? Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / count)) : 0;
    const originX = Math.round((W - count * cellW) / 2);
    const cellX = (i: number): number => originX + i * cellW + CELL_GAP / 2;
    const cellRectW = Math.max(1, cellW - CELL_GAP);
    const centerX = (i: number): number => cellX(i) + cellRectW / 2;

    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const wait = (ms: number): Promise<void> =>
      new Promise<void>((resolve) => {
        if (destroyed) {
          resolve();
          return;
        }
        const id = setTimeout(() => {
          timers.delete(id);
          resolve();
        }, ms);
        timers.add(id);
      });

    // ── 찾는 값 표시. accent 위의 글자는 stateInk 가 정본 짝이다.
    const chip = el('rect', {
      x: originX,
      y: CHIP_Y,
      width: CHIP_W,
      height: CHIP_H,
      rx: parseFloat(radii.sm),
      fill: c.accent,
    });
    svg.appendChild(chip);
    const chipText = el('text', {
      x: originX + CHIP_W / 2,
      y: CHIP_Y + CHIP_H - 6,
      'text-anchor': 'middle',
      'font-family': fonts.mono,
      'font-size': fontSizes.sm,
      'font-weight': '700',
      fill: c.stateInk,
    });
    chipText.textContent = Number.isFinite(target) ? String(target) : '';
    svg.appendChild(chipText);

    const chipLabel = el('text', {
      x: originX + CHIP_W + 8,
      y: CHIP_Y + CHIP_H - 6,
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.textMuted,
    });
    chipLabel.textContent = tr('label.target', 'both rows look for this value');
    svg.appendChild(chipLabel);

    // ── 줄 둘. 같은 셈에서 나온 같은 좌표계.
    const parts: RowParts[] = rowInputs.slice(0, ROW_TOP.length).map((row, ri) => {
      const top = ROW_TOP[ri] as number;
      const g = el('g', {});
      svg.appendChild(g);

      const label = el('text', {
        x: originX,
        y: top + ROW_LABEL_BASE,
        'font-family': fonts.body,
        'font-size': fontSizes.xs,
        'letter-spacing': '0.08em',
        fill: c.textMuted,
      });
      label.textContent =
        row.key === 'sorted'
          ? tr('label.sortedRow', 'in order')
          : tr('label.shuffledRow', 'out of order');
      g.appendChild(label);

      const verdict = el('text', {
        x: originX + count * cellW - CELL_GAP / 2,
        y: top + ROW_LABEL_BASE,
        'text-anchor': 'end',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        'font-weight': '600',
        fill: c.textMuted,
        opacity: '0',
      });
      verdict.style.transition = `opacity ${FADE_MS}ms ease, transform ${FADE_MS}ms ease`;
      g.appendChild(verdict);

      // 구간 자 — 채운 사각을 X 로만 늘인다. 선 굵기가 일그러지지 않는다.
      const bracketBase = el('rect', {
        x: 0,
        y: 0,
        width: 1,
        height: BASE_H,
        fill: c.primary,
      });
      const tickL = el('rect', { x: 0, y: 0, width: TICK_W, height: TICK_H, fill: c.primary });
      const tickR = el('rect', { x: 0, y: 0, width: TICK_W, height: TICK_H, fill: c.primary });
      for (const n of [bracketBase, tickL, tickR]) {
        n.style.transition = `transform ${SHRINK_MS}ms ease, fill ${SHRINK_MS}ms ease`;
        g.appendChild(n);
      }

      const cellRects: SVGRectElement[] = [];
      const cellTexts: SVGTextElement[] = [];
      row.values.forEach((v, i) => {
        const rect = el('rect', {
          x: cellX(i),
          y: top + CELL_DY,
          width: cellRectW,
          height: CELL_H,
          rx: parseFloat(radii.sm),
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 1.5,
        });
        rect.style.transition = `fill ${SHRINK_MS}ms ease, stroke ${SHRINK_MS}ms ease`;
        g.appendChild(rect);
        cellRects.push(rect);

        const txt = el('text', {
          x: centerX(i),
          y: top + CELL_DY + CELL_H / 2 + 6,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.lg,
          'font-weight': '600',
          fill: c.text,
        });
        txt.textContent = String(v);
        txt.style.transition = `fill ${SHRINK_MS}ms ease`;
        g.appendChild(txt);
        cellTexts.push(txt);
      });

      // 답 고리 — 찾는 값이 실제로 든 칸. 처음부터 끝까지 남는다.
      const answerAt = row.values.indexOf(target);
      const ringWrap = el('g', {});
      ringWrap.style.transition = `transform ${PULSE_MS}ms ease`;
      const ring = el('rect', {
        x: answerAt >= 0 ? cellX(answerAt) - RING_INSET : -999,
        y: top + CELL_DY - RING_INSET,
        width: cellRectW + RING_INSET * 2,
        height: CELL_H + RING_INSET * 2,
        rx: parseFloat(radii.md),
        fill: 'none',
        stroke: c.accent,
        'stroke-width': 2,
        'stroke-dasharray': '5 4',
      });
      ring.style.transition = `stroke ${PULSE_MS}ms ease, stroke-width ${PULSE_MS}ms ease`;
      ringWrap.appendChild(ring);
      g.appendChild(ringWrap);

      // 짚개 — 가로로 미끄러지는 삼각 표식.
      const probe = el('g', {});
      probe.style.transition = `transform ${MOVE_MS}ms ease, opacity ${MOVE_MS}ms ease`;
      const tri = el('polygon', {
        points: `0,0 ${PROBE_W},0 ${PROBE_W / 2},${PROBE_H}`,
        fill: c.itemComparing,
      });
      probe.appendChild(tri);
      g.appendChild(probe);

      return {
        key: row.key,
        values: row.values,
        answerAt,
        top,
        cellRects,
        cellTexts,
        ring,
        ringWrap,
        probe,
        bracketBase,
        tickL,
        tickR,
        verdict,
        lo: 0,
        hi: row.values.length - 1,
        probed: -1,
        found: -1,
        closed: false,
      };
    });

    const capLine1 = el('text', {
      x: W / 2,
      y: CAP_Y1,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.text,
    });
    const capLine2 = el('text', {
      x: W / 2,
      y: CAP_Y2,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.text,
    });
    svg.appendChild(capLine1);
    svg.appendChild(capLine2);

    // ── 그리기 ────────────────────────────────────────────────────────────

    function paintCells(p: RowParts): void {
      p.cellRects.forEach((rect, i) => {
        const inWindow = !p.closed && i >= p.lo && i <= p.hi;
        const txt = p.cellTexts[i] as SVGTextElement;
        if (i === p.found) {
          rect.setAttribute('fill', c.success);
          rect.setAttribute('stroke', c.success);
          txt.setAttribute('fill', c.textInverse);
        } else if (i === p.probed) {
          rect.setAttribute('fill', c.itemComparing);
          rect.setAttribute('stroke', c.itemComparing);
          txt.setAttribute('fill', c.stateInk);
        } else if (inWindow) {
          rect.setAttribute('fill', c.itemDefault);
          rect.setAttribute('stroke', c.border);
          txt.setAttribute('fill', c.text);
        } else {
          rect.setAttribute('fill', c.bgSubtle);
          rect.setAttribute('stroke', c.border);
          txt.setAttribute('fill', c.textMuted);
        }
      });
    }

    function placeBracket(p: RowParts): void {
      const y = p.top + BRACKET_DY;
      const open = !p.closed && p.lo <= p.hi;
      const startX = open
        ? cellX(p.lo)
        : originX + Math.min(Math.max(p.lo, 0), count) * cellW - TICK_W / 2;
      const w = open ? (p.hi - p.lo + 1) * cellW - CELL_GAP : 0;
      const tone = p.closed ? c.danger : c.primary;
      p.bracketBase.setAttribute('fill', tone);
      p.tickL.setAttribute('fill', tone);
      p.tickR.setAttribute('fill', tone);
      p.bracketBase.style.transform = `translate(${startX}px, ${y}px) scale(${Math.max(w, 0.001)}, 1)`;
      p.tickL.style.transform = `translate(${startX}px, ${y - TICK_H}px)`;
      p.tickR.style.transform = `translate(${startX + Math.max(w - TICK_W, 0)}px, ${y - TICK_H}px)`;
    }

    function placeProbe(p: RowParts, index: number, active: boolean): void {
      p.probe.style.opacity = active ? '1' : '0.28';
      p.probe.style.transform = `translate(${centerX(index) - PROBE_W / 2}px, ${p.top + PROBE_TOP}px)`;
    }

    async function pulseRing(p: RowParts, stroke: string): Promise<void> {
      p.ring.setAttribute('stroke', stroke);
      p.ring.setAttribute('stroke-width', '3.5');
      const cx = cellX(p.answerAt) + cellRectW / 2;
      const cy = p.top + CELL_DY + CELL_H / 2;
      p.ringWrap.style.transformOrigin = `${cx}px ${cy}px`;
      p.ringWrap.style.transform = 'scale(1.14)';
      await wait(PULSE_MS);
      p.ringWrap.style.transform = 'scale(1)';
      p.ring.setAttribute('stroke-width', '2.5');
      await wait(PULSE_MS);
    }

    function findRow(key: string): RowParts | undefined {
      return parts.find((p) => p.key === key);
    }

    // ── projector 계약 ────────────────────────────────────────────────────

    function reset(): void {
      for (const p of parts) {
        p.lo = 0;
        p.hi = p.values.length - 1;
        p.probed = -1;
        p.found = -1;
        p.closed = false;
        p.ring.setAttribute('stroke', c.accent);
        p.ring.setAttribute('stroke-width', '2');
        p.ringWrap.style.transform = 'scale(1)';
        p.verdict.textContent = '';
        p.verdict.style.opacity = '0';
        p.verdict.style.transform = 'translate(8px, 0px)';
        p.verdict.setAttribute('fill', c.textMuted);
        paintCells(p);
        placeBracket(p);
        placeProbe(p, 0, false);
      }
    }

    async function showProbe(probes: ProbeSpec[]): Promise<void> {
      for (const pr of probes) {
        const p = findRow(pr.row);
        if (!p || pr.index < 0 || pr.index >= p.values.length) continue;
        p.probed = pr.index;
        placeProbe(p, pr.index, true);
        paintCells(p);
      }
      await wait(MOVE_MS);
    }

    async function settle(results: SettleSpec[]): Promise<void> {
      for (const r of results) {
        const p = findRow(r.row);
        if (!p) continue;
        p.lo = r.lo;
        p.hi = r.hi;
        if (r.action === 'found') {
          p.found = r.foundAt;
          p.probed = -1;
          // 찾은 줄은 더 볼 것이 없다. 구간 자를 그 한 칸으로 오므려 끝났음을 보인다.
          p.lo = r.foundAt;
          p.hi = r.foundAt;
        } else if (r.action === 'empty') {
          p.closed = true;
          p.probed = -1;
        } else {
          p.probed = -1;
        }
        paintCells(p);
        placeBracket(p);
      }
      await wait(SHRINK_MS);
    }

    async function markAnswerLost(row: string): Promise<void> {
      const p = findRow(row);
      if (!p || p.answerAt < 0) return;
      await pulseRing(p, c.danger);
    }

    async function finish(verdicts: VerdictSpec[]): Promise<void> {
      for (const v of verdicts) {
        const p = findRow(v.row);
        if (!p) continue;
        p.verdict.textContent = v.found
          ? tr('verdict.found', 'found at slot {i}', { i: v.index })
          : tr('verdict.absent', 'answers: not here', {});
        p.verdict.setAttribute('fill', v.found ? c.success : c.danger);
        p.verdict.style.opacity = '1';
        p.verdict.style.transform = 'translate(0px, 0px)';
        if (!v.found && p.answerAt >= 0) {
          const txt = p.cellTexts[p.answerAt];
          if (txt) txt.setAttribute('fill', c.danger);
        }
      }
      await wait(FADE_MS);
      // 마지막 울림은 두 줄이 나란히. 차례로 울리면 "같은 절차" 라는 짝이 풀린다.
      await Promise.all(
        verdicts.map((v) => {
          const p = findRow(v.row);
          if (!p || p.answerAt < 0) return Promise.resolve();
          return pulseRing(p, v.found ? c.success : c.danger);
        }),
      );
    }

    function setCaption(text: string): void {
      const [l1, l2] = wrapCaption(text, W - CAP_SIDE, CAP_FONT_PX);
      capLine1.textContent = l1;
      capLine2.textContent = l2;
    }

    reset();

    return {
      reset,
      showProbe,
      settle,
      markAnswerLost,
      finish,
      setCaption,
      destroy(): void {
        destroyed = true;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        svg.textContent = '';
      },
    };
  },
};
