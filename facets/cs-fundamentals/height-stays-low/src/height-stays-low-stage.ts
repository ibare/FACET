/**
 * height-stays-low-stage — 자식 수가 다른 두 나무가 같은 잎 수를 각자 덮어
 * 내려가는 모습을 그린다 (S-piece).
 *
 * 두 세로 사다리(칸)를 나란히 두고, 칸마다 층을 한 행씩 쌓는다. 행 수 자체가
 * 그 나무가 목표에 닿기까지 밟는 층수 — 즉 나무 높이 — 라서, 자식이 적은 칸은
 * 행이 많아 사다리가 길고 자식이 많은 칸은 행이 적어 짧다. 걸음마다 그 칸의
 * 커서가 한 행 아래로 실제로 이동하고(cy), 그 행의 막대가 이 층이 덮는 잎 수만큼
 * 자란다(width). 두 운동 다 opacity 가 아니라 위치·크기다.
 *
 * 장면(Scene) 방식이다 — 걸음마다 부르는 메서드를 두지 않고 `render` 하나로
 * 산다 (S-scene). 사다리의 행 수도, 층마다 덮는 잎 수도, 결론 캡션의 두 층수도
 * 전부 장면의 `coveredByLevel` 하나에서 나온다. 옮기기 전에는 행 수를 이 파일이
 * 제 손으로 셈하고 캡션의 층수는 페이로드가 실어 온 수를 썼다 — 화면에 나란히 뜨는
 * 두 항이 서로 다른 출처였다. 이제 그 셈은 `scene.ts` 의 `ladder()` 하나뿐이다.
 *
 * 되짚기가 지나간 뒤 화면이 저 혼자 바뀌지 않게 막는 것은 셋이다.
 *   · `opts.animate` 검사 — 되짚기는 그 길로 오고, 거기서는 타이머도 프레임도
 *     걸지 않는다.
 *   · 세대 빗장 — 흐름이 `await` 를 지나 살아 돌아왔을 때 제 세대가 아니면
 *     화면에 손대지 않는다.
 *   · **CSS transition 을 쓰지 않는다** — 옮기기 전 막대와 커서에 걸려 있던
 *     `style.transition` 이 이 조각의 진짜 지연 발화원이었다. 되감아 곧바로 세운
 *     화면이 360ms 에 걸쳐 저 혼자 흘러갔다. 보간은 전부 세대를 아는 tick 이 한다.
 */

import {
  getColors,
  categorical,
  fonts,
  fontSizes,
  radii,
  PIECE_CANVAS_W,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type Theme,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';
import type { HeightStaysLowScene, LadderScene, TreeId } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const ROW_H = 18;
const HEADER_H = 30;
const TOP_PAD = 14;
const CAPTION_H = 46;
const BOTTOM_PAD = 14;
const SIDE_PAD = 20;
const COL_GAP = 24;
const GUTTER_W = 18;
const LEVEL_W = 22;
const COUNT_W = 78;
const GAP = 6;
const BAR_H = 10;

const W = PIECE_CANVAS_W;
const COL_W = (W - SIDE_PAD * 2 - COL_GAP) / 2;
const BAR_MAX_W = COL_W - GUTTER_W - LEVEL_W - GAP - COUNT_W - GAP;
const COL_X: readonly number[] = [SIDE_PAD, SIDE_PAD + COL_W + COL_GAP];
const ROW_TOP = TOP_PAD + HEADER_H;

/** 한 층 내려가는 데 드는 시간. 옮기기 전 CSS transition 과 같은 길이. */
const SLIDE_MS = 380;
const FRAME_MS = 16;

/** 커서가 아직 내려가기 전 쉬는 자리. 1층 행보다 살짝 위다. */
const RESTING_OPACITY = 0.35;

function rowY(level: number): number {
  return ROW_TOP + (level - 1) * ROW_H;
}
function rowCenterY(level: number): number {
  return rowY(level) + ROW_H / 2;
}
/** 커서가 `level` 층에 섰을 때의 중심. 0 층은 쉬는 자리. */
function markerY(level: number): number {
  return level < 1 ? rowY(1) - 6 : rowCenterY(level) - 4;
}
function heightFor(maxLevels: number): number {
  return TOP_PAD + HEADER_H + maxLevels * ROW_H + CAPTION_H + BOTTOM_PAD;
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

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * 막대 길이. 백만까지 선형으로 그리면 앞 열여덟 층이 전부 0 에 붙어 보이지 않으므로
 * 로그 축척으로 잰다 — "층마다 자식 수만큼 곱해진다" 가 일정한 걸음으로 드러난다.
 */
function barWidth(covered: number, target: number): number {
  if (target <= 1) return BAR_MAX_W;
  const frac = Math.min(1, Math.log10(Math.max(1, covered)) / Math.log10(target));
  return Math.max(0, frac * BAR_MAX_W);
}

type RowHandles = {
  outline: SVGRectElement;
  fillBar: SVGRectElement;
  countText: SVGTextElement;
};

type ColumnHandles = {
  rows: RowHandles[];
  marker: SVGCircleElement;
};

export const heightStaysLowStageView: CanvasView = {
  canvas: { height: 480 },
  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<HeightStaysLowScene> {
    const theme: Theme | undefined = params.theme;
    const colors = getColors(theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10 의 조회는
    // 저작자 오버라이드가 얹힌 `params.t` 로).
    const t = params.t ?? makeTranslator(params.locale);
    const svg = params.canvas;

    /** 자릿점 서식. locale 은 마운트 때 받은 것을 쓴다 — 'en-US' 로 굳히지 않는다. */
    const formatCount = (n: number): string => n.toLocaleString(params.locale);

    container.textContent = '';
    const root = document.createElement('div');
    root.style.background = colors.bg;
    root.style.border = `1px solid ${colors.border}`;
    root.style.borderRadius = radii.md;
    root.style.boxSizing = 'border-box';
    root.style.fontFamily = fonts.body;
    svg.style.display = 'block';
    root.appendChild(svg);
    container.appendChild(root);

    const identity = categorical(2, 'vivid');

    // ── 시간 자원. destroy 에서 모두 거둔다 (S-view).
    const timers = new Set<ReturnType<typeof setTimeout>>();
    /**
     * 기다리다 만 것을 깨우는 자리. 타이머를 거두는 것만으로는 모자란다 — 취소된
     * tick 은 아예 불리지 않아 promise 를 풀 길이 사라지고, 러너가 `render` 의
     * Promise 를 기다리므로 걸음이 영영 돌아오지 않는다 (S-view).
     */
    const waiters = new Set<() => void>();
    let disposed = false;

    /**
     * 그림의 세대. `render` 가 화면을 새로 세울 때마다 올린다.
     *
     * 행과 커서는 `drawStatic` 이 매번 새로 지으므로 살아남은 옛 흐름이 쥔 것은 이미
     * 떨어져 나간 노드다. 그러나 흐름 끝의 **`drawStatic(next)`** 는 살아 있는 화면을
     * 통째로 다시 세운다 — 그 자리를 막는 것이 이 빗장이다 (S-scene).
     */
    let gen = 0;
    const alive = (myGen: number): boolean => !disposed && myGen === gen;

    /**
     * 시간 기반 tick 애니메이션.
     *
     * 스스로 다음 회차를 예약하는 루프이므로 세대가 갈리거나 destroy 되면 멈춘다 —
     * 떨어져 나간 노드를 16ms 마다 건드리면 유한하더라도 "관찰 가능한 뒷일" 이
     * 남는다 (S-view).
     */
    const animate = (ms: number, onTick: (t: number) => void, myGen: number): Promise<void> =>
      new Promise((resolve) => {
        if (ms <= 0) {
          if (alive(myGen)) onTick(1);
          resolve();
          return;
        }
        const start = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(myGen)) {
            finish();
            return;
          }
          const frac = Math.min(1, (Date.now() - start) / ms);
          onTick(frac);
          if (frac >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });

    // ── 정적 그리기가 매번 다시 채우는 손잡이. 배치는 장면의 사다리에서만 나오므로
    //    여기 쥐는 것은 DOM 손잡이뿐이다.
    const columns = new Map<TreeId, ColumnHandles>();

    function drawColumn(ladder: LadderScene, index: number, target: number): void {
      const colX = COL_X[index] ?? SIDE_PAD;
      const color = identity[index] ?? identity[0]!;
      const levels = ladder.coveredByLevel.length;

      const g = el('g');
      g.setAttribute('class', `hsl-col hsl-col--${ladder.id}`);
      svg.appendChild(g);

      // 헤더: 정체성 점 + "×n" 표식.
      g.appendChild(
        el('circle', { cx: colX + GUTTER_W + 5, cy: TOP_PAD + 9, r: 5, fill: color }),
      );
      const headerText = el('text', {
        x: colX + GUTTER_W + 16,
        y: TOP_PAD + 13,
        'font-family': fonts.mono,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      headerText.textContent = `×${ladder.branch}`;
      g.appendChild(headerText);

      const contentX = colX + GUTTER_W;
      const rx = radii.sm.replace('px', '');
      const rows: RowHandles[] = [];

      for (let level = 1; level <= levels; level++) {
        const cy = rowCenterY(level);
        const covered = ladder.coveredByLevel[level - 1] ?? 1;
        // 밟은 층인가. 밟은 층의 수와 막대가 사다리에 **남는다** — 그 자취가 곧
        // "층마다 자식 수만큼 곱해진다" 는 주장이다 (S-scene PREFER).
        const walked = level <= ladder.reached;
        // 목표에 닿은 층. 사다리의 마지막 행이고, 남는 강조라 정적으로도 그린다.
        const arrived = walked && level === levels;

        const outline = el('rect', {
          x: contentX + LEVEL_W + GAP,
          y: cy - BAR_H / 2,
          width: BAR_MAX_W,
          height: BAR_H,
          rx,
          fill: colors.bgSubtle,
          stroke: arrived ? colors.accent : colors.border,
          'stroke-width': 1,
        });
        g.appendChild(outline);

        const fillBar = el('rect', {
          x: contentX + LEVEL_W + GAP,
          y: cy - BAR_H / 2,
          width: walked ? barWidth(covered, target) : 0,
          height: BAR_H,
          rx,
          fill: arrived ? colors.accent : color,
        });
        g.appendChild(fillBar);

        const levelText = el('text', {
          x: contentX,
          y: cy + 3,
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: colors.textMuted,
        });
        levelText.textContent = String(level);
        g.appendChild(levelText);

        // 셈은 막대 바깥, 캔버스 배경 위에 있다. 닿은 층이라고 textInverse 로
        // 바꾸면 배경과 같은 색이 되어 하필 결론이 되는 숫자만 사라진다.
        // (success 는 text 와 값이 완전히 같아 강조가 되지 않는다 — 강조는
        //  막대 쪽 accent 가 맡는다.)
        const countText = el('text', {
          x: colX + COL_W,
          y: cy + 3,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.xs,
          fill: walked ? colors.text : colors.textMuted,
        });
        countText.textContent = walked ? formatCount(covered) : '—';
        g.appendChild(countText);

        rows.push({ outline, fillBar, countText });
      }

      const marker = el('circle', {
        cx: colX + GUTTER_W / 2,
        cy: markerY(ladder.reached),
        r: 4,
        fill: color,
        opacity: ladder.reached < 1 ? RESTING_OPACITY : 1,
      });
      g.appendChild(marker);

      columns.set(ladder.id, { rows, marker });
    }

    /** 캡션이 말할 것. 견줄 두 층수는 사다리의 행 수에서 센다. */
    function captionFor(scene: HeightStaysLowScene): string {
      if (!scene.concluded) {
        return t('caption.goal', 'Both trees have to cover the same {target} leaves.', {
          target: formatCount(scene.target),
        });
      }
      return t(
        'caption.result',
        '{a} levels down on one side, {b} on the other — same leaves, same walk to read.',
        {
          a: scene.ladders[0]?.coveredByLevel.length ?? 0,
          b: scene.ladders[1]?.coveredByLevel.length ?? 0,
        },
      );
    }

    function drawCaption(text: string, maxLevels: number): void {
      const captionText = el('text', {
        x: W / 2,
        'text-anchor': 'middle',
        'font-family': fonts.body,
        'font-size': fontSizes.sm,
        fill: colors.text,
      });
      svg.appendChild(captionText);

      const maxChars = 60;
      const lines: string[] = [];
      let cur = '';
      for (const word of text.split(' ')) {
        const next = cur ? `${cur} ${word}` : word;
        if (next.length > maxChars && cur) {
          lines.push(cur);
          cur = word;
        } else {
          cur = next;
        }
      }
      if (cur) lines.push(cur);

      const baseY = TOP_PAD + HEADER_H + maxLevels * ROW_H + 20;
      lines.forEach((line, i) => {
        const tspan = el('tspan', { x: W / 2, y: baseY + i * 16 });
        tspan.textContent = line;
        captionText.appendChild(tspan);
      });
    }

    // ── 장면 그리기 ─────────────────────────────────────────────────────────
    //
    // 늘 비우고 그 장면이 말하는 사다리를 통째로 다시 세운다. 되돌릴 명령을 따로 둘
    // 필요가 없고, 캔버스 세로도 여기서 다시 정한다 — 사다리 행 수가 높이를 정하므로
    // 마운트 때 한 번 재고 마는 값이 아니다 (프로토콜 4 절).
    function drawStatic(scene: HeightStaysLowScene): void {
      svg.textContent = '';
      columns.clear();

      const maxLevels = Math.max(
        1,
        ...scene.ladders.map((l) => l.coveredByLevel.length),
      );
      const H = heightFor(maxLevels);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      svg.setAttribute('height', String(H));

      scene.ladders.forEach((ladder, i) => drawColumn(ladder, i, scene.target));
      drawCaption(captionFor(scene), maxLevels);
    }

    /**
     * 한 층 내려가는 운동.
     *
     * 정적 그리기가 이미 끝 자리에 세워 두었으므로 **아직 못 온 만큼을 뒤로 물린
     * 채로** 시작한다. 출발 자리는 `step.level` 이 말해 주므로 `prev` 를 들추지
     * 않는다 (S-scene). 첫 tick 이 동기로 돌아 물림을 박으므로 끝 자리가 번쩍이지
     * 않는다.
     */
    function runDescend(
      ladder: LadderScene,
      level: number,
      target: number,
      myGen: number,
    ): Promise<void> {
      const col = columns.get(ladder.id);
      const row = col?.rows[level - 1];
      if (!col || !row) return Promise.resolve();

      const covered = ladder.coveredByLevel[level - 1] ?? 1;
      const finalW = barWidth(covered, target);
      const fromY = markerY(level - 1);
      const toY = markerY(level);
      const fromOpacity = level <= 1 ? RESTING_OPACITY : 1;

      return animate(
        SLIDE_MS,
        (frac) => {
          const e = easeOutCubic(frac);
          row.fillBar.setAttribute('width', String(finalW * e));
          col.marker.setAttribute('cy', String(fromY + (toY - fromY) * e));
          col.marker.setAttribute('opacity', String(fromOpacity + (1 - fromOpacity) * e));
        },
        myGen,
      );
    }

    async function render(
      next: HeightStaysLowScene,
      /** 흐를 것을 `step` 이 말하므로 앞 장면을 들추지 않는다 (S-scene). */
      _prev: HeightStaysLowScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      gen += 1;
      const myGen = gen;
      drawStatic(next);

      // 되짚기는 여기서 끝. 타이머도 프레임도 걸지 않는다.
      if (!opts.animate) return;

      const step = next.step;
      if (!step) return;
      const ladder = next.ladders.find((l) => l.id === step.treeId);
      if (!ladder) return;

      await runDescend(ladder, step.level, next.target, myGen);

      // 흐름이 끝나면 그 장면을 통째로 다시 세운다 — 흐르며 선 화면과 곧바로 세운
      // 화면이 보간의 끝자리 하나까지 같아진다 (S-scene). 옛 세대면 손대지 않고
      // 물러난다.
      if (!alive(myGen)) return;
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        disposed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        for (const wake of [...waiters]) wake();
        waiters.clear();
        columns.clear();
        svg.textContent = '';
        // 붙인 DOM 은 스스로 거둔다 — 러너의 destroy 경로는 컨테이너를 비우지
        // 않으므로, 두면 다시 마운트할 때 남는다.
        root.remove();
      },
    };
  },
};
