/**
 * match-from-back-stage — 거꾸로 짚어 오는 그림.
 *
 * ── 형태가 어디서 나왔는가
 *
 * 동사가 "거꾸로 짚어 온다 — 오른쪽 끝에서 왼쪽으로" 이므로 화면의 주된 운동은
 * **왼쪽으로 가는 표지**다.
 *
 *   눈금    본 글자 위에만 눈금이 선다. 재는 자리에 값을 남기는 것이라 옆에 계기를
 *           두지 않는다 (S-piece).
 *   글      한 줄로 늘어선 스물넷. 자리는 고정이다.
 *   패턴    글 아래에 놓인 슬래브. 자리를 옮길 때마다 가로로 미끄러진다.
 *   표지    슬래브의 **오른쪽 끝**에서 출발해 한 칸씩 왼쪽으로 옮겨 간다. 화살촉이
 *           **왼쪽을 본다** — 다 끝난 화면에도 짚어 온 방향이 남는다.
 *   들림    짚는 칸은 글 쪽으로 들린다. 맞으면 들린 채 붙어 있고 어긋나면 내려앉는다.
 *   자국    **한 자리를 떠날 때 아래에 한 줄이 남는다.** 읽은 만큼만 굵은 토막이고
 *           안 읽고 지나간 앞쪽은 점선이다. 자리마다 얼마나 적게 보고 물러났는지가
 *           여기 쌓인다 — 이 조각이 하려는 말이 그 길이의 차이다.
 *   떨굼    끝에 가서, **한 번도 보지 않은 글자**가 줄에서 내려앉는다. 남아 선 것이
 *           실제로 읽은 글자다.
 *
 * ── 자국은 이행이 새로 세운 것이다
 *
 * 옮기기 전에는 한 자리를 떠날 때 `clearLook()` 이 짚은 자취와 "안 읽음" 표시를
 * 통째로 지웠다. 그래서 다 끝난 화면에 **어느 자리에서 몇 글자만 보고 물러났나** 가
 * 남지 않았고, 조각의 주장이 되짚기 이전에 이미 안 보였다. 자국 줄이 그 자리를
 * 메운다.
 *
 * **어휘를 갈라 둔다.** 자국은 살아 있는 견줌과 같은 모양이면 안 된다 — 견줌은
 * 글자 칸의 **채움**으로 말하고, 자국은 칸 아래 **얇은 토막**으로 말한다. 모양이
 * 달라 한 화면에 함께 서도 부딪히지 않는다.
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편** — 아직 안 보았나 · 같더냐 · 다르더냐 · 끝내 안 보았나.
 * **테두리는 짚음의 표식** — 여기까지 짚었다 · 짚지 않고 지나갔다. 옮기기 전에는
 * `paint[kind]` 한 벌이 `fill` 과 `stroke` 와 `stroke-dasharray` 를 **함께** 정해
 * 두 뜻이 한 채널에 겹쳐 있었다. 겹치면 어느 쪽도 되짚기에서 복원되지 않는다.
 *
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 밟은 걸음
 * 하나만 흐르게 한다 (S-scene). `setCaption()` · `land()` · `compare()` ·
 * `reject()` · `accept()` · `dropUnread()` · `rewind()` 일곱이 통째로 사라졌다.
 * 함께 사라진 것이 넷 더 있다 — 화면의 지금 자리를 거울로 적어 두고 운동의
 * 출발값으로 쓰던 `slabX`·`slabY`·`probeX`, 그리고 이 조각의 결론을 DOM 손잡이
 * 표에 쥐고 있던 `ticks`.
 *
 * ── 운동
 *
 * 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 흐르게 할 때만 **출발
 * 그림으로 도로 물려 놓고** 시작하며, 운동이 끝나면 장면을 통째로 다시 세워 흐른
 * 화면과 곧바로 세운 화면이 속성 하나만큼도 갈리지 않게 한다 (S-scene).
 *
 * CSS transition 은 하나도 쓰지 않고 상시 도는 루프도 없다. 되짚기는
 * `animate: false` 로 오는데 그런 것이 걸려 있으면 그 뒤에도 화면이 저 혼자
 * 흘러간다.
 *
 * 세로는 밟을 자리 수가 정한다 — `init()` 이 없으므로 `viewBox` 도 정적 그리기가
 * 매번 정한다. 가로는 러너가 `PIECE_CANVAS_W` 로 정한다 (S-piece · S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
} from '@ffacet/core/runtime';
import type {
  CanvasView,
  SceneRenderer,
  ViewInstance,
  ViewMountParams,
} from '@ffacet/core/runtime';

import {
  currentAttempt,
  lookedOf,
  probedIndex,
  sameAt,
  unreadFront,
  wasProbed,
  type MatchCaption,
  type MatchFromBackScene,
  type MatchStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── 가로. 크기는 캔버스에서 역산하고 상수는 상한만 잡는다 (S-piece).
const W = PIECE_CANVAS_W;
const SIDE_MIN = 18;
const CELL_MAX_W = 30;
/** 칸 사이에 남기는 틈. 칸의 실제 폭은 `cellW - CELL_GAP` 이다. */
const CELL_GAP = 2;

// ── 세로.
const CELL_H = 32;
const TICK_Y = 16;
const TICK_H = 10;
const TEXT_Y = 34;
const PAT_Y = 86;
/** 슬래브 안쪽 좌표 — 자취 선과 표지가 사는 줄. */
const TRAIL_DY = CELL_H + 12;
/** 아직 아무 자리도 안 밟았을 때 슬래브가 서 있는 깊이. */
const PARK_DY = 14;
/** 자국 띠의 첫 줄. 밟을 자리마다 한 줄씩 아래로 쌓인다. */
const FOOT_TOP = 152;
const FOOT_ROW = 8;
const FOOT_BAR = 3;
/** 자국이 내려앉기 전에 떠 있는 높이. */
const FOOT_RISE = 6;
/** 자국 띠 아래에 캡션 한 줄이 쓰는 자리. */
const CAPTION_BAND = 28;
/** 밟을 자리 다섯 기준 세로. 수가 다르면 정적 그리기가 매번 다시 잰다. */
const DEFAULT_H = FOOT_TOP + 5 * FOOT_ROW + CAPTION_BAND;

const LIFT = 6;
const FOUND_RISE = 14;
const DROP = 14;
const DIP = 8;

// ── 지속시간. 걸음 벽시계(운동 + stepMs)의 몫이다 (S-piece).
const ANIM_LAND = 320;
const ANIM_PROBE = 170;
const ANIM_LIFT = 110;
const ANIM_DIP = 260;
const ANIM_RISE = 300;
const ANIM_DROP = 380;

/**
 * 칸이 말하는 **값의 형편**. 테두리(짚음)와 갈라 둔 채움 쪽 어휘다.
 *
 * `comparing` 만 운동 중에만 쓴다 — 짚으러 가는 동안은 아직 판정이 드러나지 않았고,
 * 운동이 끝나면 정적 그리기가 덮는다. 그래서 정지 화면에는 나머지 넷만 선다.
 */
type Fill = 'unknown' | 'comparing' | 'same' | 'differ' | 'never';

/** 칸이 말하는 **짚음의 표식**. 채움(형편)과 갈라 둔 테두리 쪽 어휘다. */
type Edge = 'plain' | 'probed' | 'skipped';

/** DOM 손잡이 묶음. 뜻도 수치도 담지 않는다 — 그것은 전부 장면이 말한다. */
type Cell = {
  group: SVGGElement;
  rect: SVGRectElement;
  glyph: SVGGraphicsElement;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function lerp(from: number, to: number, p: number): number {
  return from + (to - from) * p;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
}

function clearGroup(g: SVGGElement): void {
  while (g.firstChild) g.removeChild(g.firstChild);
}

export const matchFromBackStageView: CanvasView = {
  canvas: { height: DEFAULT_H, fit: 'fill' },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<MatchFromBackScene> {
    const svg = params.canvas;
    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    const fillOf: Record<Fill, string> = {
      unknown: c.bg,
      comparing: c.itemComparing,
      same: c.itemPivot,
      differ: c.danger,
      never: c.bgSubtle,
    };
    const inkOf: Record<Fill, string> = {
      unknown: c.text,
      comparing: c.stateInk,
      same: c.stateInk,
      differ: c.stateInk,
      never: c.textMuted,
    };
    const edgeOf: Record<Edge, { stroke: string; width: number; dash: string }> = {
      plain: { stroke: c.border, width: 1, dash: 'none' },
      probed: { stroke: c.itemComparing, width: 2, dash: 'none' },
      skipped: { stroke: c.ghostOutline, width: 1, dash: '3 3' },
    };

    const root = el('g');
    svg.appendChild(root);

    // 레이어 순서: 눈금 → 글 → 실 → 슬래브 → 자국. 다섯 다 장면마다 통째로 다시 짓는다.
    const gTick = el('g');
    const gText = el('g');
    const gLink = el('g');
    const gSlab = el('g');
    const gFoot = el('g');
    root.append(gTick, gText, gLink, gSlab, gFoot);

    // 고정 자리의 캡션 한 줄. 다시 짓지 않고 내용만 갈아 낀다. 재건 밖에 있으므로
    // 정적 경로가 **매번 명시로** 내용과 자리를 쓴다 (빈 줄도 명시로 쓴다).
    const caption = el('text', {
      x: W / 2,
      y: DEFAULT_H - 12,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.sm,
      fill: c.text,
    });
    root.appendChild(caption);

    // ── 걸어 둔 것과 세대. destroy 와 되짚기가 함께 쓴다.
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    /**
     * 세대 빗장 (S-scene).
     *
     * `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 아예 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 번호뿐이다.
     * 걸음 함수가 `await` 를 여럿 지나므로, 살아남은 앞 세대가 새로 선 화면을 덮지
     * 못하게 한다.
     */
    let gen = 0;

    function animate(ms: number, draw: (p: number) => void, live: () => boolean): Promise<void> {
      // 빗장이 화면 쓰기보다 앞에 온다. 뒤에 두면 깨어난 앞 세대가 첫 프레임 하나를
      // 새로 선 화면에 쓰고 나서야 물러난다.
      if (!live()) return Promise.resolve();
      draw(0);
      return new Promise<void>((resolve) => {
        if (destroyed || typeof requestAnimationFrame !== 'function') {
          if (live()) draw(1);
          resolve();
          return;
        }
        const started = Date.now();
        let id = 0;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          frames.delete(id);
          draw(1);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (done) return;
          frames.delete(id);
          // 내 세대가 아니면 화면에 손대지 않고 물러난다.
          if (destroyed || !live()) {
            done = true;
            waiters.delete(finish);
            resolve();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          if (raw >= 1) {
            finish();
            return;
          }
          draw(easeInOut(raw));
          id = requestAnimationFrame(tick);
          frames.add(id);
        };
        id = requestAnimationFrame(tick);
        frames.add(id);
      });
    }

    // ── 기하. 자리는 장면의 구조에서 역산한다 (S-piece).
    let n = 1;
    let m = 1;
    let cellW = CELL_MAX_W;
    let boxW = CELL_MAX_W - CELL_GAP;
    let originX = SIDE_MIN;
    let height = DEFAULT_H;

    function layout(scene: MatchFromBackScene): void {
      n = Math.max(1, scene.text.length);
      m = Math.max(1, scene.pattern.length);
      cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2) / n));
      boxW = cellW - CELL_GAP;
      originX = Math.round((W - n * cellW) / 2);
      height = FOOT_TOP + Math.max(1, scene.shifts.length) * FOOT_ROW + CAPTION_BAND;
      svg.setAttribute('viewBox', `0 0 ${W} ${height}`);
    }

    const cellX = (i: number): number => originX + i * cellW;
    const cellCenter = (i: number): number => cellX(i) + boxW / 2;
    /** 슬래브 안쪽 좌표 — 패턴 칸 `k` 의 가운데. */
    const patCenter = (k: number): number => k * cellW + boxW / 2;
    /** 슬래브 안쪽 좌표 — 패턴의 오른쪽 끝. 표지가 출발하는 자리다. */
    const patRight = (): number => m * cellW - CELL_GAP;

    // ── 이번 장면이 세운 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다.
    let textCells: Cell[] = [];
    let patCells: Cell[] = [];
    let slabNode: SVGGElement | null = null;
    let trailNode: SVGLineElement | null = null;
    let markerNode: SVGPathElement | null = null;
    let linkNode: SVGLineElement | null = null;
    let footRows: (SVGGElement | null)[] = [];

    function dress(cell: Cell, fill: Fill, edge: Edge): void {
      const e = edgeOf[edge];
      cell.rect.setAttribute('fill', fillOf[fill]);
      cell.rect.setAttribute('stroke', e.stroke);
      cell.rect.setAttribute('stroke-width', String(e.width));
      cell.rect.setAttribute('stroke-dasharray', e.dash);
      cell.glyph.setAttribute('fill', inkOf[fill]);
    }

    function makeCell(x: number, y: number, ch: string): Cell {
      const group = el('g', { transform: 'translate(0, 0)' });
      const rect = el('rect', { x, y, width: boxW, height: CELL_H, rx: 3 });
      group.appendChild(rect);

      // 빈칸은 글자가 없다 — 낮은 막대 하나로 자리만 보인다 (도형이라 문안이 아니다).
      const glyph: SVGGraphicsElement =
        ch === ' '
          ? el('rect', {
              x: x + boxW / 2 - cellW * 0.2,
              y: y + CELL_H * 0.66,
              width: cellW * 0.4,
              height: 2,
            })
          : el('text', {
              x: x + boxW / 2,
              y: y + CELL_H * 0.68,
              'text-anchor': 'middle',
              'font-family': fonts.mono,
              'font-size': fontSizes.md,
            });
      if (ch !== ' ') glyph.textContent = ch;
      group.appendChild(glyph);
      return { group, rect, glyph };
    }

    /** 슬래브가 쉬는 자리. 좌표가 아니라 **어느 단계에 있나** 가 이것을 정한다. */
    function slabSpot(scene: MatchFromBackScene): { x: number; y: number } {
      const attempt = currentAttempt(scene);
      if (attempt === null) return { x: cellX(0), y: PAT_Y + PARK_DY };
      return {
        x: cellX(attempt.shift),
        y: attempt.verdict === 'found' ? PAT_Y - FOUND_RISE : PAT_Y,
      };
    }

    /** 본 글자 위에 서는 눈금. 자취에서 세므로 화면과 결론이 한 자료를 쓴다. */
    function drawTicks(scene: MatchFromBackScene): void {
      clearGroup(gTick);
      const looked = lookedOf(scene);
      // 자리 순서로 돈다 — 집합의 순서가 화면을 가르지 않게 (순회 순서는 상태다).
      for (let i = 0; i < scene.text.length; i += 1) {
        if (!looked.has(i)) continue;
        gTick.appendChild(
          el('rect', {
            x: cellCenter(i) - 1,
            y: TICK_Y,
            width: 2,
            height: TICK_H,
            rx: 1,
            fill: c.textMuted,
          }),
        );
      }
    }

    function drawText(scene: MatchFromBackScene): void {
      clearGroup(gText);
      textCells = [];
      const looked = lookedOf(scene);
      const attempt = currentAttempt(scene);
      for (let i = 0; i < scene.text.length; i += 1) {
        const cell = makeCell(cellX(i), TEXT_Y, scene.text[i]);
        const rel = attempt === null ? -1 : i - attempt.shift;
        const probed =
          attempt !== null && rel >= 0 && rel < m && wasProbed(attempt, rel, m);
        const never = scene.tallied && !looked.has(i);
        const fill: Fill = never
          ? 'never'
          : probed && attempt !== null
            ? sameAt(scene, attempt.shift, rel)
              ? 'same'
              : 'differ'
            : 'unknown';
        dress(cell, fill, probed ? 'probed' : 'plain');
        cell.group.setAttribute('transform', `translate(0, ${never ? DROP : 0})`);
        gText.appendChild(cell.group);
        textCells.push(cell);
      }
    }

    /**
     * 짚고 있는 글자와 패턴 글자를 잇는 세로 실.
     *
     * 짚는 중일 때만 있다 — 판정이 나면 걷힌다. 아직 없는 것은 숨기지 말고 짓지
     * 않는다 (길이 0 짜리 선이 남으면 앞 걸음의 좌표도 함께 남는다).
     */
    function drawLink(scene: MatchFromBackScene): void {
      clearGroup(gLink);
      linkNode = null;
      const attempt = currentAttempt(scene);
      if (attempt === null || attempt.verdict !== null || attempt.probed === 0) return;
      const k = probedIndex(attempt.probed - 1, m);
      const x = cellCenter(attempt.shift + k);
      linkNode = el('line', {
        x1: x,
        x2: x,
        y1: TEXT_Y + CELL_H,
        y2: slabSpot(scene).y,
        stroke: c.text,
        'stroke-width': 1.5,
      });
      gLink.appendChild(linkNode);
    }

    function drawSlab(scene: MatchFromBackScene): void {
      clearGroup(gSlab);
      patCells = [];
      trailNode = null;
      markerNode = null;

      const spot = slabSpot(scene);
      gSlab.setAttribute('transform', `translate(${spot.x}, ${spot.y})`);
      slabNode = gSlab;

      const attempt = currentAttempt(scene);
      for (let k = 0; k < scene.pattern.length; k += 1) {
        const cell = makeCell(k * cellW, 0, scene.pattern[k]);
        const probed = attempt !== null && wasProbed(attempt, k, m);
        const same = attempt !== null && sameAt(scene, attempt.shift, k);
        const fill: Fill = probed ? (same ? 'same' : 'differ') : 'unknown';
        // 짚지 않고 지나간 앞쪽은 자리를 떠날 때 비로소 "안 읽음" 이 된다.
        const edge: Edge = probed
          ? 'probed'
          : attempt !== null && attempt.verdict === 'rejected'
            ? 'skipped'
            : 'plain';
        dress(cell, fill, edge);
        cell.group.setAttribute('transform', `translate(0, ${probed && same ? -LIFT : 0})`);
        gSlab.appendChild(cell.group);
        patCells.push(cell);
      }

      if (attempt === null || attempt.probed === 0) return;
      const tip = patCenter(probedIndex(attempt.probed - 1, m));
      trailNode = el('line', {
        x1: patRight(),
        x2: tip,
        y1: TRAIL_DY,
        y2: TRAIL_DY,
        stroke: c.textMuted,
        'stroke-width': 2,
      });
      gSlab.appendChild(trailNode);
      // 화살촉이 왼쪽을 본다 — 짚어 온 방향이 정지 화면에도 남는다.
      markerNode = el('path', {
        d: `M 0 ${TRAIL_DY} l 6 -5 l 0 10 z`,
        fill: c.text,
        transform: `translate(${tip}, 0)`,
      });
      gSlab.appendChild(markerNode);
    }

    /**
     * 자리마다 남는 자국.
     *
     * 굵은 토막이 **읽은 만큼**, 점선이 **안 읽고 지나간 만큼**이다. 한 번 보고
     * 물러난 자리는 토막이 한 칸뿐이라, 다섯 줄이 나란히 서면 "뒤에서부터 견주면
     * 얼마나 적게 보고 끝나는가" 가 길이의 차이로 보인다.
     */
    function drawFoot(scene: MatchFromBackScene): void {
      clearGroup(gFoot);
      footRows = [];
      for (const attempt of scene.attempts) {
        if (attempt.verdict === null) {
          footRows.push(null);
          continue;
        }
        const row = el('g', { transform: 'translate(0, 0)' });
        const y = FOOT_TOP + footRows.length * FOOT_ROW;
        const front = unreadFront(attempt, m);
        if (front > 0) {
          row.appendChild(
            el('line', {
              x1: cellX(attempt.shift),
              x2: cellX(attempt.shift + front) - CELL_GAP,
              y1: y + FOOT_BAR / 2,
              y2: y + FOOT_BAR / 2,
              stroke: c.ghostOutline,
              'stroke-width': 1,
              'stroke-dasharray': '3 3',
            }),
          );
        }
        row.appendChild(
          el('rect', {
            x: cellX(attempt.shift + front),
            y,
            width: attempt.probed * cellW - CELL_GAP,
            height: FOOT_BAR,
            rx: 1,
            fill: attempt.verdict === 'found' ? c.itemPivot : c.itemComparing,
          }),
        );
        gFoot.appendChild(row);
        footRows.push(row);
      }
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: MatchCaption | null): void {
      caption.setAttribute('y', String(height - 12));
      if (cap === null) {
        caption.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'land':
          caption.textContent = t(
            'caption.land',
            'The pattern is lined up at position {shift}.',
            { shift: cap.shift },
          );
          return;
        case 'killedAtOnce':
          caption.textContent = t(
            'caption.killedAtOnce',
            'One comparison at the back rules this position out. Characters left unread: {unread}.',
            { unread: cap.unread },
          );
          return;
        case 'brokeAfterTail':
          caption.textContent = t(
            'caption.brokeAfterTail',
            'The back matches for a while, then breaks. Characters matched: {matched}.',
            { matched: cap.matched },
          );
          return;
        case 'found':
          caption.textContent = t(
            'caption.found',
            'Every character matches from the back. The pattern sits at position {shift}.',
            { shift: cap.shift },
          );
          return;
        case 'tally':
          caption.textContent = t(
            'caption.tally',
            'Comparisons made: {comparisons}. Characters never looked at: {never}.',
            { comparisons: cap.comparisons, never: cap.never },
          );
          return;
      }
    }

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      clearGroup(gTick);
      clearGroup(gText);
      clearGroup(gLink);
      clearGroup(gSlab);
      clearGroup(gFoot);
      textCells = [];
      patCells = [];
      footRows = [];
      slabNode = null;
      trailNode = null;
      markerNode = null;
      linkNode = null;
      caption.textContent = '';
    }

    /** 그 장면이 말하는 것을 전부 세운다. 자리는 여기서 셈한다 (S-piece). */
    function drawStatic(scene: MatchFromBackScene): void {
      layout(scene);
      drawTicks(scene);
      drawText(scene);
      drawLink(scene);
      drawSlab(scene);
      drawFoot(scene);
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 자리를 세워 두었으므로, 흐르게 할 때만
    //    출발 그림으로 도로 물려 놓고 시작한다.

    function setLift(k: number, dy: number): void {
      patCells[k]?.group.setAttribute('transform', `translate(0, ${-dy})`);
    }

    /**
     * 패턴이 그 자리로 미끄러져 내려앉는다.
     *
     * 출발 자리는 `step.from` 이 싣고 오므로 `prev` 를 들추지 않는다 (S-scene).
     */
    function flowLand(
      step: { from: number | null },
      scene: MatchFromBackScene,
      live: () => boolean,
    ): Promise<void> {
      const slab = slabNode;
      const attempt = currentAttempt(scene);
      if (slab === null || attempt === null) return Promise.resolve();
      const fromX = step.from === null ? cellX(0) : cellX(step.from);
      const fromY = step.from === null ? PAT_Y + PARK_DY : PAT_Y;
      const toX = cellX(attempt.shift);
      return animate(
        ANIM_LAND,
        (p) => {
          slab.setAttribute(
            'transform',
            `translate(${lerp(fromX, toX, p)}, ${lerp(fromY, PAT_Y, p)})`,
          );
        },
        live,
      );
    }

    /**
     * 표지가 왼쪽으로 한 칸 옮겨 가 짚고, 짚은 칸이 글 쪽으로 든다.
     *
     * 표지 · 자취 · 실 셋이 **한 뜻**이라 한 목록 한 시계로 흐른다. 들림은 그 다음에
     * 오는 딴 동작이라 뒤이어 흐른다.
     */
    async function flowProbe(
      step: { from: number | null },
      scene: MatchFromBackScene,
      live: () => boolean,
    ): Promise<void> {
      const attempt = currentAttempt(scene);
      if (attempt === null || attempt.probed === 0) return;
      const k = probedIndex(attempt.probed - 1, m);
      const textCell = textCells[attempt.shift + k];
      const patCell = patCells[k];
      const slabX = cellX(attempt.shift);
      const fromTip = step.from === null ? patRight() : patCenter(step.from);
      const toTip = patCenter(k);

      // 짚으러 가는 동안은 아직 판정이 드러나지 않았다. 끝에서 정적 그리기가 덮는다.
      if (patCell) dress(patCell, 'comparing', 'probed');
      if (textCell) dress(textCell, 'comparing', 'probed');

      await animate(
        ANIM_PROBE,
        (p) => {
          const tip = lerp(fromTip, toTip, p);
          trailNode?.setAttribute('x2', String(tip));
          markerNode?.setAttribute('transform', `translate(${tip}, 0)`);
          linkNode?.setAttribute('x1', String(slabX + tip));
          linkNode?.setAttribute('x2', String(slabX + tip));
        },
        live,
      );
      if (!live()) return;

      await animate(ANIM_LIFT, (p) => setLift(k, LIFT * p), live);
      if (!live()) return;

      if (sameAt(scene, attempt.shift, k)) return;
      // 어긋났다 — 들렸던 칸이 도로 내려앉는다.
      if (patCell) dress(patCell, 'differ', 'probed');
      if (textCell) dress(textCell, 'differ', 'probed');
      await animate(ANIM_LIFT, (p) => setLift(k, LIFT * (1 - p)), live);
    }

    /**
     * 자리를 떠난다 — 슬래브가 한 번 꿀렁하고 그 자리의 자국이 아래에 내려앉는다.
     *
     * 둘이 한 뜻(이 자리를 접는다)이라 한 시계로 흐른다.
     */
    function flowLeave(
      scene: MatchFromBackScene,
      live: () => boolean,
      shape: 'dip' | 'rise',
    ): Promise<void> {
      const slab = slabNode;
      const attempt = currentAttempt(scene);
      if (slab === null || attempt === null) return Promise.resolve();
      const baseX = cellX(attempt.shift);
      const row = footRows[scene.attempts.length - 1] ?? null;
      return animate(
        shape === 'dip' ? ANIM_DIP : ANIM_RISE,
        (p) => {
          const dy =
            shape === 'dip'
              ? p >= 1
                ? 0
                : Math.sin(p * Math.PI) * DIP
              : -FOUND_RISE * p;
          slab.setAttribute('transform', `translate(${baseX}, ${PAT_Y + dy})`);
          row?.setAttribute('opacity', String(p));
          row?.setAttribute('transform', `translate(0, ${-FOOT_RISE * (1 - p)})`);
        },
        live,
      );
    }

    /** 한 번도 보지 않은 글자가 줄에서 내려앉는다. */
    function flowTally(scene: MatchFromBackScene, live: () => boolean): Promise<void> {
      const looked = lookedOf(scene);
      const falling: Cell[] = [];
      for (let i = 0; i < scene.text.length; i += 1) {
        if (looked.has(i)) continue;
        const cell = textCells[i];
        if (cell) falling.push(cell);
      }
      if (falling.length === 0) return Promise.resolve();
      return animate(
        ANIM_DROP,
        (p) => {
          for (const cell of falling) {
            cell.group.setAttribute('transform', `translate(0, ${DROP * p})`);
          }
        },
        live,
      );
    }

    function flowOf(
      step: MatchStep,
      scene: MatchFromBackScene,
      live: () => boolean,
    ): Promise<void> {
      switch (step.kind) {
        case 'land':
          return flowLand(step, scene, live);
        case 'probe':
          return flowProbe(step, scene, live);
        case 'reject':
          return flowLeave(scene, live, 'dip');
        case 'found':
          return flowLeave(scene, live, 'rise');
        case 'tally':
          return flowTally(scene, live);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 밟은 걸음 하나만 흐르게
     * 한다. `prev` 는 쓰지 않는다 — 출발 그림에 필요한 계기값을 `step` 이 싣고
     * 오므로 고를 것이 `step` 하나뿐이다 (S-scene).
     */
    async function render(
      next: MatchFromBackScene,
      _prev: MatchFromBackScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      const live = (): boolean => mine === gen && !destroyed;

      rewind();
      drawStatic(next);
      drawCaption(next.caption);

      // 되짚기는 여기서 끝난다. 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate) return;
      const step = next.step;
      if (step === null) return;

      await flowOf(step, next, live);
      if (!live()) return;

      // 흐르며 남은 opacity·보간된 좌표 문자열·견주는 중의 칠이 통째로 사라진다.
      // 그 사이에 타이머도 프레임도 없어 깜빡이지 않는다 (S-scene).
      rewind();
      drawStatic(next);
      drawCaption(next.caption);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 취소된 프레임은 아예 불리지 않는다. 기다리던 것을 여기서 깨우지 않으면
        // `await ctx.emit` 이 영영 돌아오지 않는다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
