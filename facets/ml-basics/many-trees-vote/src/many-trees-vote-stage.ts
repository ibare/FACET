/**
 * many-trees-vote stage — 장면(Scene) 하나를 받아 화면 전체를 세운다.
 *
 * 걸음마다 부르는 메서드를 두지 않는다. `render` 하나가 장면을 받아 그 장면이
 * 말하는 것을 전부 세우므로, 어느 걸음에서 오든 결과가 같고 되돌릴 명령이 필요
 * 없다 (S-scene).
 *
 * ── 그림의 짜임 (좌표는 전부 여기서 캔버스로부터 역산한다)
 *
 *   왼쪽 띠   나무 글리프 + 이름. 나무마다 categorical 색 하나.
 *   가운데 판 행 = 나무, 열 = 물음. 칸마다 답 하나가 놓인다.
 *   아래 두 줄 다수결 / 정답.
 *   오른쪽 띠 맺음에서만 나타나는 맞힌 수.
 *
 * ── 무엇이 움직이는가 (둘 다 위치가 바뀐다)
 *
 *   갈린다 — 열의 답들이 열 축에서 좌우로 **밀려난다**. 고른 답이 `options` 의
 *            몇 번째냐가 밀려나는 쪽을 정하므로, 밀려난 자리 자체가 표다.
 *            표가 4:1 이면 한쪽에 넷, 한쪽에 하나가 남아 크기로 읽힌다.
 *   모인다 — 다수 쪽 답마다 점 하나가 떨어져 나와 다수결 칸으로 **날아가** 겹친다.
 *            원본은 판에 남고 복제본만 움직인다. 점이 닿는 만큼 다수결 칸의 답이
 *            짙어지고, 그다음 정답이 뜨며 어긋난 답에 **빗금이 그어진다** (선이
 *            실제로 칸을 가로질러 자란다).
 *
 * ── 세 축을 갈라 둔다 (한 속성에 두 뜻을 싣지 않는다)
 *
 *   자리(가로 밀림)  그 나무가 무엇에 표를 던졌나 — 표 자체다.
 *   채움             값의 형편. 다수결 칸이 점선 빈 테(아직 안 모였다)인지
 *                    채워진 칸(모였다)인지.
 *   테두리 + 빗금    견줌의 표식. 그 답이 정답과 어긋났나.
 *
 * 진 표는 지우지 않는다. 열이 끝나면 정답과 어긋난 답에 빗금이 그어지고 밀려난
 * 자리에 그대로 남는다 — **완주 화면에 빗금 일곱이 흩어져 있고**, 그것이 "틀림이
 * 물음마다 다른 나무에게 흩어져 있다" 는 이 조각의 주장이다. 정적 그리기가 그것을
 * 세우므로 어느 걸음으로 되짚어 와도 같다.
 *
 * ── 옛 stage 가 화면에만 적어 두던 것
 *
 * 밀려났나와 어느 쪽인가는 `Cell.group` 의 `transform` 에, 어긋났나는 `box` 의
 * `stroke` 와 덧붙은 자식 선에, 모였나는 `majorityHolders[q]` 의 **자식 수**에,
 * 척도는 `let geo` 에 있었다. 이제 `split` · `gathered` · `summed` 가 말하고 좌표와
 * 칠은 전부 거기서 파생된다 (`scene.ts` 참조).
 *
 * ── 운동은 rAF 보간뿐이다
 *
 * 옛 코드는 CSS `transition` 으로 칸을 밀고 점을 날렸다. 되짚기는 `animate:false`
 * 로 오는데 transition 은 그 뒤에도 화면을 저 혼자 흘러가게 해 흔들림의 직접
 * 원인이 된다 (S-scene MUST NOT). 둘 다 `tween` 으로 옮겼고, `style` 은 어디에도
 * 쓰지 않는다.
 *
 * 색은 전부 design-tokens 경유다 (S-view). 나무 색은 개체 식별이므로 `categorical`
 * 이고, **색판의 크기는 바탕의 나무 수에서 한 번에 센다** — 지금까지 드러난 수로
 * 정하면 나무가 늘 때 hue 간격이 통째로 갈린다.
 */

import {
  PIECE_CANVAS_W,
  categorical,
  fontSizes,
  fonts,
  getColors,
  makeTranslator,
  type CanvasView,
  type Palette,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  captionFor,
  isGathered,
  isSplit,
  isWinner,
  isWrong,
  majorityOf,
  majorityScoreOf,
  optionIndexOf,
  treeScoresOf,
  type ManyTreesVoteScene,
  type VoteStep,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 캔버스 세로. 가로는 러너가 정한다 (S-view) — 줄이 늘면 행 간격을 줄여 담는다. */
const H = 318;

const PAD_X = 12;
const CAPTION_Y = 20;
const HEADER_Y = 46;
const GRID_TOP = 58;
const ROW_MAX_H = 33;
const LABEL_W = 66;
const SCORE_W = 58;
const TOKEN_MAX_W = 36;
const TOKEN_H = 24;
const SLOT_GAP = 4;
/** 빗금이 칸 안쪽으로 물러나는 여백. */
const STRIKE_INSET = 5;

const SPLIT_MS = 380;
const GATHER_MS = 440;
const STRIKE_MS = 240;
const SCORE_MS = 260;
/** 맞힌 수가 오른쪽에서 미끄러져 들어오는 거리. */
const SCORE_SLIDE = 14;
/** 점이 다수결 칸에 닿기 시작하는 지점 — 그 뒤로 답이 짙어진다. */
const LAND_FROM = 0.55;

const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * 한 번에 셈해 둔 자리.
 *
 * 장면에는 좌표가 없으므로 그릴 때마다 여기서 낸다. **그리기 전에 전부 낸다** —
 * 그리면서 이웃을 재면 순회 순서가 화면을 가른다 (S-scene 의 함정).
 */
type Layout = {
  tokenW: number;
  sepY: number;
  majY: number;
  truthY: number;
  /** 나무마다의 색. 색판의 크기는 바탕의 나무 수에서 한 번에 정해진다. */
  treeInk: readonly string[];
  colCx(q: number): number;
  rowCy(t: number): number;
  /** 답이 `options` 의 몇 번째냐로 정해지는, 열 축에서의 밀림. */
  offsetOf(optionIndex: number): number;
};

/** 정적 그리기가 세워 둔 손잡이. `render` 안에서만 살고 밖으로 새지 않는다. */
type Drawn = {
  layout: Layout;
  /** `[나무][물음]` — 칸을 묶은 `<g>`. 운동만 이것의 `transform` 을 쓴다. */
  cells: readonly (readonly (SVGGElement | null)[])[];
  boxes: readonly (readonly (SVGRectElement | null)[])[];
  glyphs: readonly (readonly (SVGTextElement | null)[])[];
  /** 정답과 어긋난 칸에만 있다. */
  strikes: readonly (readonly (SVGLineElement | null)[])[];
  /** 물음마다 — 모인 답이 앉은 칸. 아직 모이지 않았으면 null. */
  majTokens: readonly (SVGGElement | null)[];
  /** 물음마다 — 정답과 맞음 표시. 아직 견주지 않았으면 null. */
  truthMarks: readonly (SVGGElement | null)[];
  /** 맺음의 맞힌 수. 맺음 전이면 null. */
  scoreG: SVGGElement | null;
};

export const manyTreesVoteStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<ManyTreesVoteScene> {
    const svg = params.canvas;
    const c: Palette = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);
    // 캔버스는 러너가 이미 컨테이너에 붙여 놓았다. 안쪽만 비운다 (S-view).
    svg.textContent = '';

    // ── 층. 그리는 순서가 곧 겹치는 순서다. 걸음마다 통째로 다시 세운다.
    const gGrid = el('g');
    const gCell = el('g');
    const gSlot = el('g');
    const gFlight = el('g');
    const gScore = el('g');
    const gCaption = el('g');
    const layers = [gGrid, gCell, gSlot, gFlight, gScore, gCaption];
    for (const g of layers) svg.appendChild(g);

    // ── 걸어 둔 것과 기다리는 것. destroy 가 일괄로 거둔다 (S-piece).
    const waiters = new Set<() => void>();
    // 타이머는 쓰지 않는다 — 운동이 전부 rAF 보간이라 거둘 것이 프레임뿐이다.
    const frames = new Set<number>();
    let destroyed = false;

    /**
     * 지금 화면을 세운 `render` 의 번호 — 세대 빗장.
     *
     * 모임 걸음이 rAF 마디 둘을 이어 달린다. 가운데에 `destroy` 가 끼어들면 남은
     * 마디가 이미 떨어져 나간 노드를 만지므로, 마디마다 그리고 프레임마다 자기
     * 번호가 아직 유효한지 보고 물러난다. `isInstant` 는 빗장이 아니다 — 러너는
     * 장면 조각에서 그것을 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    const canAnimate = typeof requestAnimationFrame === 'function';

    /**
     * rAF 보간 한 마디.
     *
     * `resolve` 를 콜백 **안에만** 두지 않는다 — `destroy` 가 프레임을 취소하면 그
     * 콜백이 아예 안 불려 약속이 영영 안 풀린다 (S-piece MUST). `finish` 를
     * `waiters` 에 담아 `destroy` 가 깨우게 한다.
     */
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
          if (!alive(mine)) return finish();
          const p = duration <= 0 ? 1 : clamp01((now() - started) / duration);
          draw(p);
          if (p >= 1) return finish();
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        // 첫 프레임을 기다리지 않고 곧바로 출발 그림을 세운다 — 기다리면 끝 자리가
        // 한 프레임 번쩍인다.
        tick();
      });
    }

    function el<K extends keyof SVGElementTagNameMap>(
      tag: K,
      attrs: Record<string, string | number> = {},
    ): SVGElementTagNameMap[K] {
      const node = document.createElementNS(SVG_NS, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
      return node;
    }

    function label(
      value: string,
      x: number,
      y: number,
      size: string,
      fill: string,
      anchor: 'start' | 'middle' | 'end',
      weight = '500',
    ): SVGTextElement {
      const node = el('text', {
        x,
        y,
        'text-anchor': anchor,
        'dominant-baseline': 'middle',
        'font-family': fonts.body,
        'font-size': size,
        'font-weight': weight,
        fill,
      });
      node.textContent = value;
      return node;
    }

    // ── 자리 셈 ───────────────────────────────────────────────────────────

    /** 그 장면의 자리를 한 번에 셈한다. 바탕만 쓰므로 어느 걸음에서든 같다. */
    function layoutOf(scene: ManyTreesVoteScene): Layout {
      const cols = Math.max(1, scene.questions.length);
      const rows = Math.max(1, scene.trees.length);
      const opts = Math.max(1, scene.options.length);

      const gridX0 = PAD_X + LABEL_W;
      const gridX1 = W - PAD_X - SCORE_W;
      const colW = (gridX1 - gridX0) / cols;

      const truthY = H - 24;
      const majY = truthY - 36;
      const sepY = majY - 24;
      const rowH = Math.min(ROW_MAX_H, Math.floor((sepY - 8 - GRID_TOP) / rows));

      // 상수는 상한만 쥐고, 실제 크기는 열 폭에서 역산한다 (S-piece).
      const tokenW = Math.min(TOKEN_MAX_W, Math.floor((colW - SLOT_GAP * 2) / opts));

      return {
        tokenW,
        sepY,
        majY,
        truthY,
        // 색판의 크기는 바탕 전체에서 한 번에 센다 (프로토콜 4 절 12).
        treeInk: categorical(Math.max(2, scene.trees.length), 'vivid'),
        colCx: (q) => gridX0 + colW * (q + 0.5),
        rowCy: (row) => GRID_TOP + rowH * row + rowH / 2,
        offsetOf: (optionIndex) => (optionIndex - (opts - 1) / 2) * (tokenW + SLOT_GAP),
      };
    }

    /** 칸의 가로 중심 — 갈린 열이면 고른 답 쪽으로 밀려 있다. */
    function cellCx(scene: ManyTreesVoteScene, layout: Layout, tree: number, q: number): number {
      const oi = optionIndexOf(scene, tree, q);
      const pushed = isSplit(scene, q) && oi >= 0 ? layout.offsetOf(oi) : 0;
      return layout.colCx(q) + pushed;
    }

    /**
     * 빗금이 지나는 두 끝.
     *
     * 정적 그리기와 운동이 **이 한 벌**을 쓴다 — 두 벌이 되면 자라던 선의 끝자리가
     * 정지 화면과 어긋난다.
     */
    function strikeSpan(
      layout: Layout,
      cx: number,
      cy: number,
    ): { x1: number; y1: number; x2: number; y2: number } {
      return {
        x1: cx - layout.tokenW / 2 + STRIKE_INSET,
        y1: cy + TOKEN_H / 2 - STRIKE_INSET,
        x2: cx + layout.tokenW / 2 - STRIKE_INSET,
        y2: cy - TOKEN_H / 2 + STRIKE_INSET,
      };
    }

    // ── 캡션 ──────────────────────────────────────────────────────────────

    function captionText(scene: ManyTreesVoteScene): string {
      const said = captionFor(scene);
      if (said === null) return '';
      switch (said.kind) {
        case 'intro':
          return t('caption.intro', '{trees} trees, {questions} questions, {total} answers.', {
            trees: said.trees,
            questions: said.questions,
            total: said.total,
          });
        case 'split':
          return t(
            'caption.split',
            '{q}: the answers split — {countA} chose {optionA}, {countB} chose {optionB}.',
            {
              q: said.q,
              optionA: said.optionA,
              optionB: said.optionB,
              countA: said.countA,
              countB: said.countB,
            },
          );
        case 'gather':
          return said.agreed
            ? t(
                'caption.gatherRight',
                'The larger side gathers into one answer: {majority}. The truth is {truth}.',
                { majority: said.majority, truth: said.truth },
              )
            : t(
                'caption.gatherWrong',
                'The larger side gathers into one answer: {majority}. But the truth is {truth}.',
                { majority: said.majority, truth: said.truth },
              );
        case 'sum':
          return said.perfect === 0
            ? t(
                'caption.doneNone',
                'No tree got all {total}. Best tree: {best}/{total}. The vote: {majorityScore}/{total}.',
                { total: said.total, best: said.best, majorityScore: said.majorityScore },
              )
            : t(
                'caption.donePerfect',
                'Trees with all {total}: {perfect}. Best tree: {best}/{total}. The vote: {majorityScore}/{total}.',
                {
                  total: said.total,
                  perfect: said.perfect,
                  best: said.best,
                  majorityScore: said.majorityScore,
                },
              );
      }
    }

    // ── 정적 그리기 ───────────────────────────────────────────────────────

    /** 늘 비우고 시작한다. 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of layers) g.textContent = '';
    }

    /** 나무 하나 — 두 단 수관과 줄기. 색이 곧 그 나무의 표식이다. */
    function drawTree(cx: number, cy: number, fill: string): void {
      gGrid.appendChild(
        el('path', {
          d:
            `M ${cx} ${cy - 10}` +
            ` L ${cx + 5} ${cy - 3} L ${cx + 2.5} ${cy - 3}` +
            ` L ${cx + 8} ${cy + 4} L ${cx - 8} ${cy + 4}` +
            ` L ${cx - 2.5} ${cy - 3} L ${cx - 5} ${cy - 3} Z`,
          fill,
          stroke: fill,
          'stroke-width': 1,
          'stroke-linejoin': 'round',
        }),
      );
      gGrid.appendChild(
        el('line', { x1: cx, y1: cy + 4, x2: cx, y2: cy + 9, stroke: fill, 'stroke-width': 2.4 }),
      );
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawScene(scene: ManyTreesVoteScene): Drawn {
      rewind();
      const layout = layoutOf(scene);

      // ── 물음 이름 줄.
      for (let q = 0; q < scene.questions.length; q += 1) {
        gGrid.appendChild(
          label(
            scene.questions[q] ?? '',
            layout.colCx(q),
            HEADER_Y,
            fontSizes.sm,
            c.textMuted,
            'middle',
          ),
        );
      }

      // ── 나무 띠와 답표.
      const cells: (SVGGElement | null)[][] = [];
      const boxes: (SVGRectElement | null)[][] = [];
      const glyphs: (SVGTextElement | null)[][] = [];
      const strikes: (SVGLineElement | null)[][] = [];

      for (let tree = 0; tree < scene.trees.length; tree += 1) {
        const cy = layout.rowCy(tree);
        drawTree(PAD_X + 9, cy, layout.treeInk[tree] ?? c.text);
        gGrid.appendChild(
          label(scene.trees[tree] ?? '', PAD_X + 23, cy, fontSizes.sm, c.text, 'start'),
        );

        const rowCells: (SVGGElement | null)[] = [];
        const rowBoxes: (SVGRectElement | null)[] = [];
        const rowGlyphs: (SVGTextElement | null)[] = [];
        const rowStrikes: (SVGLineElement | null)[] = [];

        for (let q = 0; q < scene.questions.length; q += 1) {
          const cx = cellCx(scene, layout, tree, q);
          const wrong = isGathered(scene, q) && isWrong(scene, tree, q);
          const group = el('g');

          const box = el('rect', {
            x: cx - layout.tokenW / 2,
            y: cy - TOKEN_H / 2,
            width: layout.tokenW,
            height: TOKEN_H,
            rx: 5,
            fill: c.bg,
            // 테두리는 견줌의 표식이다 — 정답과 어긋났나.
            stroke: wrong ? c.danger : c.border,
            'stroke-width': wrong ? 1.6 : 1,
          });
          group.appendChild(box);

          const glyph = label(
            scene.answers[tree]?.[q] ?? '',
            cx,
            cy,
            fontSizes.sm,
            wrong ? c.danger : c.text,
            'middle',
            '600',
          );
          group.appendChild(glyph);

          let strike: SVGLineElement | null = null;
          if (wrong) {
            // 어긋난 답은 지우지 않는다 — 빗금이 그어져 밀려난 자리에 그대로 남는다.
            strike = el('line', {
              ...strikeSpan(layout, cx, cy),
              stroke: c.danger,
              'stroke-width': 1.6,
              'stroke-linecap': 'round',
            });
            group.appendChild(strike);
          }

          gCell.appendChild(group);
          rowCells.push(group);
          rowBoxes.push(box);
          rowGlyphs.push(glyph);
          rowStrikes.push(strike);
        }

        cells.push(rowCells);
        boxes.push(rowBoxes);
        glyphs.push(rowGlyphs);
        strikes.push(rowStrikes);
      }

      // ── 가름선과 아래 두 줄의 이름.
      gGrid.appendChild(
        el('line', {
          x1: PAD_X,
          y1: layout.sepY,
          x2: W - PAD_X,
          y2: layout.sepY,
          stroke: c.border,
          'stroke-width': 1,
        }),
      );
      gGrid.appendChild(
        label(
          t('label.majority', 'Majority'),
          PAD_X,
          layout.majY,
          fontSizes.sm,
          c.text,
          'start',
          '600',
        ),
      );
      gGrid.appendChild(
        label(t('label.truth', 'Truth'), PAD_X, layout.truthY, fontSizes.sm, c.textMuted, 'start'),
      );

      // ── 다수결 칸과 정답 줄. 채움이 형편을 말한다 — 빈 점선 테냐 채운 칸이냐.
      const majTokens: (SVGGElement | null)[] = [];
      const truthMarks: (SVGGElement | null)[] = [];

      for (let q = 0; q < scene.questions.length; q += 1) {
        const cx = layout.colCx(q);

        if (!isGathered(scene, q)) {
          // 아직 모이지 않은 칸 — 답이 앉을 자리만 점선으로 비어 있다.
          gSlot.appendChild(
            el('rect', {
              x: cx - layout.tokenW / 2,
              y: layout.majY - TOKEN_H / 2,
              width: layout.tokenW,
              height: TOKEN_H,
              rx: 5,
              fill: 'none',
              stroke: c.border,
              'stroke-width': 1,
              'stroke-dasharray': '3 3',
            }),
          );
          majTokens.push(null);
          truthMarks.push(null);
          continue;
        }

        const majority = majorityOf(scene, q);
        const truthValue = scene.truth[q] ?? '';
        const agreed = majority === truthValue;

        const majG = el('g');
        majG.appendChild(
          el('rect', {
            x: cx - layout.tokenW / 2,
            y: layout.majY - TOKEN_H / 2,
            width: layout.tokenW,
            height: TOKEN_H,
            rx: 5,
            fill: c.accent,
            stroke: c.accent,
            'stroke-width': 1,
          }),
        );
        majG.appendChild(
          label(majority, cx, layout.majY, fontSizes.sm, c.stateInk, 'middle', '700'),
        );
        gSlot.appendChild(majG);
        majTokens.push(majG);

        const truthG = el('g');
        truthG.appendChild(
          label(
            truthValue,
            cx,
            layout.truthY,
            fontSizes.sm,
            agreed ? c.textMuted : c.danger,
            'middle',
            '600',
          ),
        );
        const mx = cx + layout.tokenW / 2 + 5;
        truthG.appendChild(
          el('path', {
            d: agreed
              ? `M ${mx} ${layout.majY} l 4 4 l 7 -9`
              : `M ${mx} ${layout.majY - 4} l 8 8 M ${mx + 8} ${layout.majY - 4} l -8 8`,
            fill: 'none',
            stroke: agreed ? c.text : c.danger,
            'stroke-width': 2,
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          }),
        );
        gSlot.appendChild(truthG);
        truthMarks.push(truthG);
      }

      // ── 맺음의 맞힌 수. 나무별과 다수결을 나란히 놓는다.
      let scoreG: SVGGElement | null = null;
      if (scene.summed) {
        const g = el('g');
        const sx = W - PAD_X - SCORE_W / 2;
        const total = scene.questions.length;
        g.appendChild(
          label(t('label.score', 'Correct'), sx, HEADER_Y, fontSizes.xs, c.textMuted, 'middle'),
        );
        const scores = treeScoresOf(scene);
        for (let tree = 0; tree < scene.trees.length; tree += 1) {
          g.appendChild(
            label(
              `${scores[tree] ?? 0}/${total}`,
              sx,
              layout.rowCy(tree),
              fontSizes.sm,
              c.textMuted,
              'middle',
            ),
          );
        }
        g.appendChild(
          el('rect', {
            x: sx - SCORE_W / 2 + 4,
            y: layout.majY - 11,
            width: SCORE_W - 8,
            height: 22,
            rx: 5,
            fill: c.accent,
          }),
        );
        g.appendChild(
          label(
            `${majorityScoreOf(scene)}/${total}`,
            sx,
            layout.majY,
            fontSizes.sm,
            c.stateInk,
            'middle',
            '700',
          ),
        );
        gScore.appendChild(g);
        scoreG = g;
      }

      // ── 캡션. 고정 자리라 매번 새로 지어 속성이 남지 않게 한다.
      gCaption.appendChild(
        label(captionText(scene), PAD_X, CAPTION_Y, fontSizes.md, c.text, 'start', '600'),
      );

      return { layout, cells, boxes, glyphs, strikes, majTokens, truthMarks, scoreG };
    }

    // ── 걸음의 운동 ───────────────────────────────────────────────────────

    /**
     * 갈린다 — 이 열의 칸들이 제자리에서 고른 답 쪽으로 밀려난다.
     *
     * 정적 그리기가 이미 밀린 자리에 세워 두었으므로, 운동은 **아직 못 온 만큼을
     * 뒤로 물리는** 꼴이다 (`dx * (e - 1)`). 한 열이 한 뜻으로 움직이므로 시계도
     * 하나다.
     */
    function flowSplit(
      scene: ManyTreesVoteScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const q = scene.split - 1;
      const moves: { g: SVGGElement; dx: number }[] = [];
      for (let tree = 0; tree < scene.trees.length; tree += 1) {
        const g = drawn.cells[tree]?.[q] ?? null;
        const oi = optionIndexOf(scene, tree, q);
        if (g === null || oi < 0) continue;
        moves.push({ g, dx: drawn.layout.offsetOf(oi) });
      }
      if (moves.length === 0) return Promise.resolve();
      return tween(SPLIT_MS, mine, (p) => {
        const e = easeOut(p);
        for (const move of moves) {
          // 끝에서는 보간값이 아니라 속성을 거둔다 — `-0` 과 끝자리가 남지 않는다.
          if (p >= 1) move.g.removeAttribute('transform');
          else move.g.setAttribute('transform', `translate(${move.dx * (e - 1)} 0)`);
        }
      });
    }

    /**
     * 모인다 — 다수 쪽 표마다 점이 떨어져 나와 다수결 칸으로 날아가고, 그다음
     * 정답이 드러나며 어긋난 답에 빗금이 그어진다.
     *
     * 뜻이 둘이라 마디를 둘로 나누되 **이어 달린다** — `render` 의 약속은 둘 다
     * 선 뒤에 풀린다 (S-scene).
     */
    async function flowGather(
      scene: ManyTreesVoteScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      const q = scene.gathered - 1;
      const { layout } = drawn;
      const cx = layout.colCx(q);
      const majG = drawn.majTokens[q] ?? null;
      const truthG = drawn.truthMarks[q] ?? null;

      /** 이 걸음이 새로 세운 것 — 모이기 전 화면으로 되물려 두고 흐르게 한다. */
      const late: {
        box: SVGRectElement;
        glyph: SVGTextElement;
        line: SVGLineElement;
        span: { x1: number; y1: number; x2: number; y2: number };
      }[] = [];
      for (let tree = 0; tree < scene.trees.length; tree += 1) {
        const line = drawn.strikes[tree]?.[q] ?? null;
        const box = drawn.boxes[tree]?.[q] ?? null;
        const glyph = drawn.glyphs[tree]?.[q] ?? null;
        if (line === null || box === null || glyph === null) continue;
        box.setAttribute('stroke', c.border);
        box.setAttribute('stroke-width', '1');
        glyph.setAttribute('fill', c.text);
        line.setAttribute('opacity', '0');
        late.push({
          box,
          glyph,
          line,
          span: strikeSpan(layout, cellCx(scene, layout, tree, q), layout.rowCy(tree)),
        });
      }

      // ① 점이 날아가 겹치고, 닿는 만큼 다수결 칸의 답이 짙어진다.
      const dots: { dot: SVGCircleElement; x0: number; y0: number }[] = [];
      for (let tree = 0; tree < scene.trees.length; tree += 1) {
        if (!isWinner(scene, tree, q)) continue;
        const dot = el('circle', { r: 5, fill: layout.treeInk[tree] ?? c.text });
        gFlight.appendChild(dot);
        dots.push({
          dot,
          x0: cellCx(scene, layout, tree, q),
          y0: layout.rowCy(tree),
        });
      }
      await tween(GATHER_MS, mine, (p) => {
        const e = easeInOut(p);
        for (const { dot, x0, y0 } of dots) {
          dot.setAttribute('cx', `${x0 + (cx - x0) * e}`);
          dot.setAttribute('cy', `${y0 + (layout.majY - y0) * e}`);
          dot.setAttribute('opacity', `${0.9 - 0.75 * e}`);
        }
        if (majG === null) return;
        if (p >= 1) majG.removeAttribute('opacity');
        else majG.setAttribute('opacity', `${clamp01((p - LAND_FROM) / (1 - LAND_FROM))}`);
      });
      if (!alive(mine)) return;
      gFlight.textContent = '';

      // ② 견준다 — 정답이 뜨고 빗금이 칸을 가로질러 자란다.
      if (truthG === null && late.length === 0) return;
      truthG?.setAttribute('opacity', '0');
      for (const item of late) {
        item.box.setAttribute('stroke', c.danger);
        item.box.setAttribute('stroke-width', '1.6');
        item.glyph.setAttribute('fill', c.danger);
      }
      await tween(STRIKE_MS, mine, (p) => {
        const e = easeOut(p);
        if (truthG !== null) {
          if (p >= 1) truthG.removeAttribute('opacity');
          else truthG.setAttribute('opacity', `${e}`);
        }
        for (const { line, span } of late) {
          if (p >= 1) {
            // 끝에서는 상수를 그대로 쓴다. 보간 끝자리를 남기지 않는다.
            line.removeAttribute('opacity');
            line.setAttribute('x2', `${span.x2}`);
            line.setAttribute('y2', `${span.y2}`);
            continue;
          }
          if (p <= 0) {
            // 길이 0 짜리 선은 둥근 끝 때문에 점이 된다 — 아직 없는 것은 안 보인다.
            line.setAttribute('opacity', '0');
            continue;
          }
          line.setAttribute('opacity', '1');
          line.setAttribute('x2', `${span.x1 + (span.x2 - span.x1) * e}`);
          line.setAttribute('y2', `${span.y1 + (span.y2 - span.y1) * e}`);
        }
      });
    }

    /**
     * 맺음 — 맞힌 수가 오른쪽에서 미끄러져 들어와 앉는다.
     *
     * 처음 뜨는 줄이라 "앉는 꼴"로 골랐다. 옛 stage 는 이 걸음에 운동을 아예 걸지
     * 않아 (projector 의 `onEvent` 가 `void` 를 돌려주어도 됐으므로) 결론이 툭
     * 나타났다.
     */
    function flowSum(drawn: Drawn, mine: number): Promise<void> {
      const g = drawn.scoreG;
      if (g === null) return Promise.resolve();
      return tween(SCORE_MS, mine, (p) => {
        const e = easeOut(p);
        if (p >= 1) {
          g.removeAttribute('transform');
          g.removeAttribute('opacity');
          return;
        }
        g.setAttribute('transform', `translate(${SCORE_SLIDE * (1 - e)} 0)`);
        g.setAttribute('opacity', `${e}`);
      });
    }

    function flowFor(
      step: VoteStep,
      scene: ManyTreesVoteScene,
      drawn: Drawn,
      mine: number,
    ): Promise<void> {
      switch (step.kind) {
        case 'board':
          // 판은 바탕이라 처음부터 서 있다. 이 걸음은 말만 얹는다.
          return Promise.resolve();
        case 'split':
          return flowSplit(scene, drawn, mine);
        case 'gather':
          return flowGather(scene, drawn, mine);
        case 'sum':
          return flowSum(drawn, mine);
      }
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: ManyTreesVoteScene,
      _prev: ManyTreesVoteScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawScene(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed || !canAnimate) return;

      const step = next.step;
      if (step === null) return;

      await flowFor(step, next, drawn, mine);
      if (!alive(mine)) return;

      /*
       * 운동이 남긴 속성·보간 끝자리가 노드째 사라진다. 되돌릴 목록을 손으로
       * 관리하지 않는다 (S-scene). 정적 경로가 두 번 그려도 그 사이에 타이머도
       * 프레임도 없어 깜빡이지 않는다.
       */
      drawScene(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of frames) cancelAnimationFrame(id);
        frames.clear();
        // 기다리던 것을 깨운다 — 안 깨우면 render 의 await 가 영영 안 돌아온다.
        for (const wake of [...waiters]) wake();
        waiters.clear();
        svg.textContent = '';
      },
    };
  },
};
