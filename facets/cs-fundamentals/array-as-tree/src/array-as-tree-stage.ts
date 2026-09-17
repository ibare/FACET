/**
 * 빌트인 `tree-layout` 을 쓰지 않은 이유: 이 조각은 배열 한 줄과 나무를 한
 * 캔버스에 같이 놓고 커서 하나가 두 그림을 오간다. 그 view 는 나무만 알고
 * 배열 쪽 짝을 그릴 자리가 없다. 더구나 이 조각의 주장이 "잇는 줄을 저장하지
 * 않는다" 라서 간선을 상시로 그리는 view 는 그림이 주장을 반박한다
 * (원칙 6 의 예외 조건).
 *
 * array-as-tree-stage — 한 화면에 배열 한 줄과 나무 한 그루를 같이 그린다.
 *
 * 위: 번호 순서로 늘어선 칸. 아래: 같은 값을 나무로 본 자리. 커서 하나가 두
 * 그림에 동시에 있고, 점선이 "지금 이 칸이 나무의 어느 자리인가" 를 잇는다.
 * 걸음마다 커서가 실제로 미끄러져 옮겨간다 — 칸에서 칸으로, 자리에서 자리로.
 * 자식이 칸 수를 넘으면 점선 유령 자리가 떠오른다.
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 **전체**를
 * 세우고, 방금 달라진 한 자리만 흐르게 한다 (S-scene). 정적 그리기가 정본이라
 * 운동의 방향이 뒤집힌다 — 커서는 이미 도착 자리에 서 있고, 흐르게 할 때만 출발
 * 자리로 되돌려 놓고 시작한다. 운동이 끝나면 장면을 통째로 다시 세워 흐르며 남은
 * 속성을 지운다.
 *
 * 화면에 새겨진 수(칸 번호 · 값 · 유령 자식의 번호)는 표식이라 그대로 쓰고
 * (C10 판정 3), 문장이 되는 캡션은 장면이 말하려는 것과 인자만 받아 여기서
 * `params.t` 로 만든다.
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

import type { ArrayAsTreeCaption, ArrayAsTreeScene, LeafMark } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const SIDE_MIN = 28;
const CELL_MAX_W = 84;
const ARRAY_TOP = 40;
const CELL_H = 56;
const TREE_GAP = 78;
const LEVEL_GAP = 76;
const NODE_R = 22;
const GHOST_R = 15;
const GHOST_DX = 44;
const GHOST_DY = 54;
const CAPTION_LINE_H = 18;
const CAPTION_MAX_LINES = 3;
const CAPTION_GAP = 20;
const BOTTOM_PAD = 18;
const CAPTION_MAX_CHARS = 60;

const JUMP_MS = 460;
const APPEAR_MS = 260;
const ARC_FADE_MS = 120;
const GHOST_MS = 220;

type Point = { x: number; y: number };

function levelCount(n: number): number {
  return Math.floor(Math.log2(Math.max(1, n))) + 1;
}

function nodeLevel(i: number): number {
  return Math.floor(Math.log2(i + 1));
}

function treeTopY(): number {
  return ARRAY_TOP + CELL_H + TREE_GAP;
}

function lastLevelY(n: number): number {
  return treeTopY() + (levelCount(n) - 1) * LEVEL_GAP;
}

function captionTopY(n: number): number {
  const treeBottom = lastLevelY(n) + NODE_R;
  const ghostBottom = lastLevelY(n) + GHOST_DY + GHOST_R;
  return Math.max(treeBottom, ghostBottom) + CAPTION_GAP;
}

function canvasHeight(n: number): number {
  return captionTopY(n) + CAPTION_LINE_H * CAPTION_MAX_LINES + BOTTOM_PAD;
}

/** 칸의 폭은 캔버스에서 역산한다 — 장면은 번호만 말한다 (S-piece). */
function cellGeom(n: number): { cellW: number; originX: number } {
  const cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / Math.max(1, n)));
  const originX = Math.round((W - n * cellW) / 2);
  return { cellW, originX };
}

function cellCenter(i: number, cellW: number, originX: number): Point {
  return { x: originX + cellW * (i + 0.5), y: ARRAY_TOP + CELL_H / 2 };
}

/** 나무에서의 자리. 번호 하나가 층과 층 안의 차례를 모두 정한다. */
function nodePos(i: number): Point {
  const level = nodeLevel(i);
  const firstIdx = 2 ** level - 1;
  const posInLevel = i - firstIdx;
  const countInLevel = 2 ** level;
  const slotW = (W - SIDE_MIN * 2) / countInLevel;
  return {
    x: SIDE_MIN + slotW * (posInLevel + 0.5),
    y: treeTopY() + level * LEVEL_GAP,
  };
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  }
  return node;
}

export const arrayAsTreeStageView: CanvasView = {
  canvas: { height: canvasHeight(7) },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<ArrayAsTreeScene> {
    const canvas = params.canvas;
    const palette: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    canvas.textContent = '';

    // ── 층. 한 번만 만들고 안을 매 걸음 비워 다시 채운다. ──────────────────
    const cellsG = el('g');
    const treeG = el('g');
    const jumpArcG = el('g');
    const twinLinkG = el('g');
    const ghostG = el('g');
    const cursorG = el('g');
    const captionG = el('g');
    canvas.append(cellsG, treeG, jumpArcG, twinLinkG, ghostG, cursorG, captionG);

    const captionText = el('text', {
      x: W / 2,
      'text-anchor': 'middle',
      fill: palette.text,
      'font-size': fontSizes.sm,
      'font-family': fonts.body,
    });
    captionG.appendChild(captionText);

    // ── 걸음이 만지는 손잡이. 정적 그리기가 매 걸음 새로 세운다. ───────────
    //
    // 새로 지어지는 것은 **노드**이지 이 변수들이 아니다. 걸음 함수가 `await`
    // 뒤에 이것을 읽으면 옛 세대의 이음매가 새 손잡이를 타고 살아 있는 화면에
    // 쓴다 — 그래서 세대 빗장이 필요하다 (S-scene).
    let cellW = 0;
    let originX = 0;
    let arrayRing: SVGRectElement | null = null;
    let treeRing: SVGCircleElement | null = null;
    let twinLink: SVGLineElement | null = null;

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호.
     *
     * 미끄러짐은 "궤적 띄우기 → 커서 옮기기 → 궤적 걷기" 로 마디가 이어져 있어,
     * 가운데에 되짚기가 끼어들면 남은 마디가 이미 새로 선 화면을 덮는다. 마디마다
     * 자기 번호가 아직 유효한지 보고 물러난다.
     */
    let gen = 0;

    function animate(ms: number, apply: (p: number) => void, live: () => boolean): Promise<void> {
      if (!live()) return Promise.resolve();
      if (destroyed || typeof requestAnimationFrame !== 'function') {
        apply(1);
        return Promise.resolve();
      }
      apply(0);
      return new Promise<void>((resolve) => {
        let origin = -1;
        let settled = false;
        let id = 0;
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
            // 깨워서 끝낼 때는 아무것도 그리지 않는다 — 끝값을 쓰면 그것이 곧
            // 덮어쓰기다.
            finish();
            return;
          }
          if (origin < 0) origin = now;
          const p = ms <= 0 ? 1 : Math.min(1, (now - origin) / ms);
          apply(p);
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

    function positionArrayRing(p: Point): void {
      if (!arrayRing) return;
      arrayRing.setAttribute('x', String(p.x - cellW / 2 - 3));
      arrayRing.setAttribute('y', String(p.y - CELL_H / 2 - 3));
      arrayRing.setAttribute('width', String(cellW + 6));
      arrayRing.setAttribute('height', String(CELL_H + 6));
    }

    function positionTreeRing(p: Point): void {
      if (!treeRing) return;
      treeRing.setAttribute('cx', String(p.x));
      treeRing.setAttribute('cy', String(p.y));
    }

    function setLine(line: SVGLineElement, from: Point, to: Point): void {
      line.setAttribute('x1', String(from.x));
      line.setAttribute('y1', String(from.y));
      line.setAttribute('x2', String(to.x));
      line.setAttribute('y2', String(to.y));
    }

    // ── 캡션 ──────────────────────────────────────────────────────────────

    function setCaption(text: string, n: number): void {
      captionText.textContent = '';
      const lines = text ? wrapText(text, CAPTION_MAX_CHARS).slice(0, CAPTION_MAX_LINES) : [];
      const top = captionTopY(n) + CAPTION_LINE_H;
      lines.forEach((line, idx) => {
        const tspan = el('tspan', { x: W / 2, y: top + idx * CAPTION_LINE_H });
        tspan.textContent = line;
        captionText.appendChild(tspan);
      });
    }

    /** 장면이 말하려는 것을 문장으로. en 원본이 호출부에 리터럴로 있어야 한다 (C10). */
    function captionOf(cap: ArrayAsTreeCaption): string {
      switch (cap.kind) {
        case 'start':
          return t('caption.start', 'Index {i} — the root of the tree.', { i: cap.i });
        case 'descendLeft':
          return t('caption.descendLeft', 'Left child: 2 × {from} + 1 = {to}.', {
            from: cap.from,
            to: cap.to,
          });
        case 'descendRight':
          return t('caption.descendRight', 'Right child: 2 × {from} + 2 = {to}.', {
            from: cap.from,
            to: cap.to,
          });
        case 'ascend':
          return t('caption.ascend', 'Parent: ⌊({from} − 1) / 2⌋ = {to}.', {
            from: cap.from,
            to: cap.to,
          });
        case 'root':
          return t('caption.root', 'Parent: ⌊({from} − 1) / 2⌋ = {to} — back at the root.', {
            from: cap.from,
            to: cap.to,
          });
        case 'leaf':
          return t(
            'caption.leaf',
            '{l} and {r} both fall past the last cell ({n} of them) — {at} has no child. It is a leaf.',
            { at: cap.at, l: cap.l, r: cap.r, n: cap.n },
          );
        case 'saved':
          return t(
            'caption.saved',
            '{n} cells hold {n} values and {links} stored links. The same shape as linked nodes would need {hypo}.',
            { n: cap.n, links: cap.links, hypo: cap.hypo },
          );
      }
    }

    // ── 정적 그리기 ────────────────────────────────────────────────────────
    //
    // 늘 비우고 그 장면이 말하는 것을 전부 다시 세운다. 되돌릴 명령을 따로 둘
    // 필요가 없고, 어느 걸음에서 어느 걸음으로 가든 같은 길이다.

    /** 늘 비우고 시작한다 (S-scene). */
    function rewind(): void {
      cellsG.textContent = '';
      treeG.textContent = '';
      jumpArcG.textContent = '';
      twinLinkG.textContent = '';
      ghostG.textContent = '';
      cursorG.textContent = '';
      // 자식을 비워도 레이어 자신의 opacity 는 남는다 — 비우는 것과 되돌리는 것은
      // 다른 일이다 (S-scene).
      ghostG.removeAttribute('opacity');
      captionText.textContent = '';
      arrayRing = null;
      treeRing = null;
      twinLink = null;
    }

    /** 위의 칸 한 줄. 마무리하면 테두리가 통째로 물든다. */
    function drawCells(values: readonly number[], concluded: boolean): void {
      const stroke = concluded ? palette.itemActive : palette.border;
      for (let i = 0; i < values.length; i += 1) {
        const c = cellCenter(i, cellW, originX);
        cellsG.append(
          el('rect', {
            x: c.x - cellW / 2,
            y: ARRAY_TOP,
            width: cellW,
            height: CELL_H,
            rx: 4,
            ry: 4,
            fill: palette.itemDefault,
            stroke,
            'stroke-width': 1.5,
          }),
        );
        const idxLabel = el('text', {
          x: c.x,
          y: ARRAY_TOP - 8,
          'text-anchor': 'middle',
          fill: palette.textMuted,
          'font-size': fontSizes.xs,
        });
        idxLabel.textContent = String(i);
        const valLabel = el('text', {
          x: c.x,
          y: ARRAY_TOP + CELL_H / 2 + 5,
          'text-anchor': 'middle',
          fill: palette.text,
          'font-size': fontSizes.lg,
          'font-weight': 600,
        });
        valLabel.textContent = String(values[i]);
        cellsG.append(idxLabel, valLabel);
      }
    }

    /** 아래의 나무. 같은 값이 같은 번호로 다시 선다 — 잇는 줄은 그리지 않는다. */
    function drawTree(values: readonly number[], concluded: boolean): void {
      const stroke = concluded ? palette.itemActive : palette.border;
      for (let i = 0; i < values.length; i += 1) {
        const p = nodePos(i);
        treeG.append(
          el('circle', {
            cx: p.x,
            cy: p.y,
            r: NODE_R,
            fill: palette.itemDefault,
            stroke,
            'stroke-width': 1.5,
          }),
        );
        const valLabel = el('text', {
          x: p.x,
          y: p.y + 5,
          'text-anchor': 'middle',
          fill: palette.text,
          'font-size': fontSizes.md,
          'font-weight': 600,
        });
        valLabel.textContent = String(values[i]);
        const idxLabel = el('text', {
          x: p.x,
          y: p.y + NODE_R + 13,
          'text-anchor': 'middle',
          fill: palette.textMuted,
          'font-size': fontSizes.xs,
        });
        idxLabel.textContent = String(i);
        treeG.append(valLabel, idxLabel);
      }
    }

    /** 커서 — 칸 테두리와 마디 동그라미, 그리고 둘을 잇는 점선. */
    function drawCursor(index: number): void {
      const arrAt = cellCenter(index, cellW, originX);
      const treeAt = nodePos(index);

      twinLink = el('line', {
        stroke: palette.itemActive,
        'stroke-width': 1.5,
        'stroke-dasharray': '3,4',
      });
      twinLinkG.appendChild(twinLink);
      setLine(twinLink, arrAt, treeAt);

      arrayRing = el('rect', {
        fill: 'none',
        stroke: palette.itemActive,
        'stroke-width': 3,
        rx: 6,
        ry: 6,
      });
      treeRing = el('circle', {
        fill: 'none',
        stroke: palette.itemActive,
        'stroke-width': 3,
        r: NODE_R + 4,
      });
      cursorG.append(arrayRing, treeRing);
      positionArrayRing(arrAt);
      positionTreeRing(treeAt);
    }

    /** 칸 수를 넘은 자식 하나. 자리는 여기서 셈한다 — 장면은 번호만 말한다. */
    function buildGhost(at: Point, target: Point, label: number): void {
      ghostG.append(
        el('line', {
          x1: at.x,
          y1: at.y,
          x2: target.x,
          y2: target.y,
          stroke: palette.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '2,4',
        }),
        el('circle', {
          cx: target.x,
          cy: target.y,
          r: GHOST_R,
          fill: 'none',
          stroke: palette.ghostOutline,
          'stroke-width': 1.5,
          'stroke-dasharray': '3,3',
        }),
      );
      const d = GHOST_R * 0.55;
      ghostG.append(
        el('line', {
          x1: target.x - d,
          y1: target.y - d,
          x2: target.x + d,
          y2: target.y + d,
          stroke: palette.ghostOutline,
          'stroke-width': 1.5,
        }),
        el('line', {
          x1: target.x - d,
          y1: target.y + d,
          x2: target.x + d,
          y2: target.y - d,
          stroke: palette.ghostOutline,
          'stroke-width': 1.5,
        }),
      );
      const text = el('text', {
        x: target.x,
        y: target.y + GHOST_R + 13,
        'text-anchor': 'middle',
        fill: palette.textMuted,
        'font-size': fontSizes.xs,
      });
      text.textContent = String(label);
      ghostG.appendChild(text);
    }

    function drawGhosts(leaf: LeafMark): void {
      const at = nodePos(leaf.at);
      buildGhost(at, { x: at.x - GHOST_DX, y: at.y + GHOST_DY }, leaf.left);
      buildGhost(at, { x: at.x + GHOST_DX, y: at.y + GHOST_DY }, leaf.right);
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawScene(scene: ArrayAsTreeScene): void {
      rewind();

      const n = scene.values.length;
      const geom = cellGeom(n);
      cellW = geom.cellW;
      originX = geom.originX;
      canvas.setAttribute('viewBox', `0 0 ${W} ${canvasHeight(n)}`);

      drawCells(scene.values, scene.concluded);
      drawTree(scene.values, scene.concluded);
      if (scene.cursor !== null) drawCursor(scene.cursor);
      if (scene.leaf !== null) drawGhosts(scene.leaf);
      if (scene.caption !== null) setCaption(captionOf(scene.caption), n);
    }

    // ── 걸음 함수 ──────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 도착 자리에 세워 두었으므로, 여기서는 출발 그림으로
    // 되돌려 놓고 시작한다. 출발 자리는 `step` 이 말한다 — `prev` 를 들추지
    // 않는다 (S-scene).

    /** 커서가 없던 자리에 떠오른다. */
    function appearCursor(live: () => boolean): Promise<void> {
      const ring = arrayRing;
      const node = treeRing;
      const link = twinLink;
      if (!ring || !node) return Promise.resolve();
      // 점선 짝은 커서가 다 선 뒤에 걸린다 — 정적 그리기가 마지막에 되세운다.
      link?.setAttribute('opacity', '0');
      return animate(
        APPEAR_MS,
        (p) => {
          ring.setAttribute('opacity', String(p));
          node.setAttribute('opacity', String(p));
        },
        live,
      );
    }

    /** 커서가 두 그림에서 동시에 미끄러져 옮겨간다. 한 시계로 함께 움직인다. */
    async function slideCursor(from: number, to: number, live: () => boolean): Promise<void> {
      const arrFrom = cellCenter(from, cellW, originX);
      const arrTo = cellCenter(to, cellW, originX);
      const treeFrom = nodePos(from);
      const treeTo = nodePos(to);

      twinLink?.setAttribute('opacity', '0');

      // 궤적은 이 운동에서만 사는 임시 노드다. 정적 그리기가 다시 짓지 않으므로
      // 세대가 바뀌어도 화면에 남지 않도록 여기서만 쓰고 버린다.
      const arc = el('line', {
        stroke: palette.itemActive,
        'stroke-width': 2,
        'stroke-dasharray': '5,5',
        opacity: 0,
      });
      jumpArcG.appendChild(arc);
      setLine(arc, treeFrom, treeTo);

      await animate(
        JUMP_MS,
        (p) => {
          arc.setAttribute('opacity', String(p < 0.5 ? p * 2 : 1));
          positionArrayRing({ x: arrFrom.x + (arrTo.x - arrFrom.x) * p, y: arrFrom.y });
          positionTreeRing({
            x: treeFrom.x + (treeTo.x - treeFrom.x) * p,
            y: treeFrom.y + (treeTo.y - treeFrom.y) * p,
          });
        },
        live,
      );
      if (!live()) return;
      await animate(ARC_FADE_MS, (p) => arc.setAttribute('opacity', String(1 - p)), live);
    }

    /** 넘쳐난 자식 둘이 떠오른다. */
    function revealGhosts(live: () => boolean): Promise<void> {
      return animate(GHOST_MS, (p) => ghostG.setAttribute('opacity', String(p)), live);
    }

    // ── 장면 그리기 ────────────────────────────────────────────────────────

    async function render(
      next: ArrayAsTreeScene,
      _prev: ArrayAsTreeScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => mine === gen && !destroyed;

      drawScene(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'appear':
          await appearCursor(live);
          break;
        case 'slide':
          await slideCursor(step.from, step.to, live);
          break;
        case 'leaf':
          await revealGhosts(live);
          break;
        case 'conclude':
          // 마무리는 물들이는 일뿐이라 흐르게 할 것이 없다.
          return;
      }

      // 흐르며 남은 opacity·좌표 보간의 끝자리·임시 궤적이 통째로 사라진다.
      // 되돌릴 목록을 손으로 관리하지 않는다 (S-scene).
      if (live()) drawScene(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        canvas.textContent = '';
      },
    };
  },
};
