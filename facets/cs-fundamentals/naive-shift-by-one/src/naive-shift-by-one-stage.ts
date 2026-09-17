/**
 * naive-shift-by-one stage — 텍스트 한 줄 아래에서 패턴 띠가 한 칸씩 밀린다.
 *
 * ── 형태가 어디서 나왔는가
 *
 * 질문의 동사는 **"도로 물러난다"** 다. 그래서 화면에는 서로 반대 방향의 운동
 * 둘이 같은 가로축 위에 놓인다.
 *
 *   이음 띠   맞힌 글자만큼 왼쪽에서 오른쪽으로 차오르다가, 어긋나는 순간
 *             **0 으로 도로 줄어든다.** 여태 맞힌 것을 버리는 일 그 자체다.
 *   커서      견주는 자리를 따라 오른쪽으로 가다가, 어긋나면 패턴 맨 앞으로
 *             **되돌아온다.**
 *   패턴 띠   그렇게 다 버리고 나서 겨우 **한 칸** 오른쪽으로 미끄러진다.
 *
 * 네 칸이나 차오른 띠가 무너지고 띠는 한 칸만 가는 것 — 그 길이의 대비가 이
 * 조각이 보여야 할 전부다. 페이드가 아니라 폭과 자리가 실제로 변한다.
 *
 * ── 헛수고는 남는다
 *
 * 아래쪽 **자취 더미**가 자리마다 몇 번을 견줬는지를 쌓아 올린다. 맞힌 견줌은
 * 이음 띠와 같은 색, 어긋난 견줌은 어긋남의 색이라, 자리 0 의 더미는 넷이 맞고
 * 하나가 어긋난 다섯 칸으로 서고 그 옆 자리 1 의 더미는 한 칸으로 선다. 그 대비가
 * 다 훑고 난 뒤에도 **화면에 남는 것**이 이 조각의 결론이다.
 *
 * 명령 방식에서는 이 자리가 없었다 — 걸음마다 `clearMarks()` 가 지워, 완주 화면에
 * 헛수고가 한 톨도 남지 않았다. 장면으로 옮기며 세운 것이다.
 *
 * ── 어휘를 가른다
 *
 *   채움      **지금 이 자리의 형편** — 맞았나 어긋났나. 다음 자리로 가면 걷힌다.
 *   자취 더미 **여태 들인 품** — 누적이고 끝까지 남는다.
 *
 * 둘이 서로 다른 요소에 실려 있어 헛짚은 자국과 지금 보는 자리가 부딪히지 않는다.
 *
 * 걸음마다 부르는 메서드는 두지 않는다. `render` 하나가 장면을 받아 화면 전체를
 * 세우고, 방금 밟은 걸음 하나만 흐르게 한다 (S-scene).
 *
 * 세로는 여기서 정하고 가로는 러너가 `PIECE_CANVAS_W` 로 준다 (S-piece · S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import {
  matchedOf,
  type NaiveShiftByOneScene,
  type NaiveShiftCaption,
  type ShiftAttempt,
} from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 캔버스 세로. 자취 더미가 설 자리를 아래에 둔 높이다 (S-view). */
const CANVAS_H = 252;

/** 왼쪽에 'text' · 'pattern' 표식이 서는 자리. */
const LABEL_W = 70;
const SIDE_MIN = 26;
const CELL_MAX_W = 56;
const CELL_H = 46;
const CELL_GAP = 4;

const CURSOR_Y = 12;
const CURSOR_H = 11;
const TEXT_Y = 30;
const FOUND_Y = 80;
const FOUND_H = 3;
const SEAM_Y = 90;
const SEAM_H = 10;
const PAT_Y = 108;

/** 자취 더미가 자라는 자리. 바닥 눈금 위로 쌓인다. */
const TRAIL_TOP = 168;
const TRAIL_BASE = 212;
/** 견줌 한 번이 차지하는 높이의 **상한**. 패턴이 길면 여기서 줄어든다. */
const TRAIL_STEP_MAX = 8;
const TRAIL_SEG_GAP = 2;
/** 아직 가 보지 않은 자리도 자리라는 것을 말하는 바닥 눈금. */
const TRAIL_RULE_H = 2;

const CAPTION_Y = 238;

const SLIDE_MS = 300;
const CURSOR_MS = 170;
const SEAM_MS = 110;
const COLLAPSE_MS = 340;
const SETTLE_MS = 280;
/** 커서를 거두는 데 드는 시간. 마지막 걸음이 0ms 로 서지 않게 하는 몫이다. */
const RETIRE_MS = 220;
/** 패턴 띠가 처음 놓일 때 위에서 내려앉는 높이. */
const RISE = 22;
/** 찾은 자리에서 한 번 내려앉는 깊이. */
const SETTLE_DIP = 5;
const FRAME_MS = 16;

/**
 * 도형에 새겨진 표식 — 그 분야에서 원어 그대로 통용되는 말이라 키를 만들지
 * 않는다 (C10 의 표식 판정 1·2번).
 */
const MARK_TEXT = 'text';
const MARK_PATTERN = 'pattern';

/** 칸 하나의 형편. 지금 자리에서 무슨 일이 있었나만 말한다. */
type CellState = 'idle' | 'hit' | 'miss';

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const ease = (p: number): number => 1 - (1 - p) * (1 - p);

/**
 * `-0` 을 `0` 으로 되돌린다.
 *
 * `-RISE * (1 - e)` 는 `e === 1` 에서 `-0` 이 되고, 그것이 문자열로 굳으면 흘려
 * 세운 화면과 곧바로 세운 화면이 눈에 안 보이는 만큼 갈린다.
 */
const z = (v: number): number => (v === 0 ? 0 : v);

export const naiveShiftByOneStageView: CanvasView = {
  canvas: { height: CANVAS_H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<NaiveShiftByOneScene> {
    const canvas = params.canvas;
    // 컨테이너가 아니라 캔버스 안쪽을 비운다 — 컨테이너를 비우면 러너가 먼저
    // 붙여 준 이 캔버스가 통째로 떨어져 나간다 (S-view).
    canvas.textContent = '';

    const c = getColors(params.theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t = params.t ?? makeTranslator(params.locale);

    const root = el('g');
    canvas.appendChild(root);

    // 레이어 순서: 자취 → 표식 → 텍스트 → 찾은 자국 → 패턴 띠 → 커서.
    // 여섯 다 장면마다 통째로 다시 짓는다.
    const gTrail = el('g');
    const gLabels = el('g');
    const gText = el('g');
    const gFound = el('g');
    const gStrip = el('g');
    const gCursor = el('g');
    root.append(gTrail, gLabels, gText, gFound, gStrip, gCursor);

    // ── 고정 자리의 캡션 한 줄. 다시 짓지 않고 내용만 갈아 낀다. 재건 밖에 있으므로
    //    정적 경로가 **매번 명시로** 내용을 쓴다 (빈 줄도 명시로 쓴다).
    const caption = el('text', {
      x: PIECE_CANVAS_W / 2,
      y: CAPTION_Y,
      'text-anchor': 'middle',
      'font-family': fonts.body,
      'font-size': fontSizes.md,
      fill: c.text,
    });
    root.appendChild(caption);

    // ── 걸어 둔 것과 세대. destroy 와 되짚기가 함께 쓴다.
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();
    let destroyed = false;
    /**
     * 세대 빗장 (S-scene).
     *
     * `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 아예 부르지 않는다. 실효 있는 것은 `opts.animate` 검사와 이 세대 번호뿐이다.
     * 걸음 함수가 `await` 를 지나고, 그 뒤에 읽는 손잡이는 정적 그리기가 갈아
     * 끼우는 모듈 스코프 변수라 빗장이 없으면 앞 세대가 새 화면에 쓴다.
     */
    let gen = 0;

    function animate(ms: number, draw: (e: number) => void, live: () => boolean): Promise<void> {
      // 빗장이 화면 쓰기보다 앞에 온다. 뒤에 두면 깨어난 앞 세대가 첫 프레임 하나를
      // 새로 선 화면에 쓰고 나서야 물러난다.
      if (!live()) return Promise.resolve();
      draw(0);
      return new Promise<void>((resolve) => {
        if (destroyed) {
          if (live()) draw(1);
          resolve();
          return;
        }
        const started = Date.now();
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          waiters.delete(finish);
          resolve();
        };
        // `destroy` 가 타이머를 취소하면 아래 콜백은 아예 안 불린다. 깨울 길을
        // 여기 걸어 두지 않으면 `await ctx.emit` 이 영영 돌아오지 않는다 (S-piece).
        waiters.add(finish);
        const tick = (): void => {
          if (done) return;
          // 내 세대가 아니면 화면에 손대지 않고 물러난다.
          if (destroyed || !live()) {
            finish();
            return;
          }
          const raw = ms <= 0 ? 1 : Math.min(1, (Date.now() - started) / ms);
          if (raw >= 1) {
            draw(1);
            finish();
            return;
          }
          draw(ease(raw));
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        tick();
      });
    }

    // ── 기하. 자리는 장면의 구조에서 역산한다 (S-piece). 정적 그리기가 장면마다
    //    다시 정하므로 걸음 함수는 언제나 그 장면의 자리를 읽는다.
    let cellW = CELL_MAX_W;
    let originX = LABEL_W;
    let trailStep = TRAIL_STEP_MAX;

    const colCenter = (i: number): number => originX + i * cellW + cellW / 2;
    const shiftX = (s: number): number => originX + s * cellW;

    // ── 장면이 갈아 끼우는 손잡이. 걸음 함수가 `await` 뒤에 읽으므로 세대 빗장이
    //    함께 있어야 한다.
    let textCells: SVGRectElement[] = [];
    let textGlyphs: SVGTextElement[] = [];
    let patCells: SVGRectElement[] = [];
    let patGlyphs: SVGTextElement[] = [];
    let strip: SVGGElement | null = null;
    let seam: SVGRectElement | null = null;
    let cursor: SVGGElement | null = null;

    // ── 장면에서 셈하는 것들 ─────────────────────────────────────────────────

    /** 지금 견주고 있는 시도. 아직 자리를 잡지 않았으면 `undefined`. */
    function current(scene: NaiveShiftByOneScene): ShiftAttempt | undefined {
      return scene.attempts[scene.attempts.length - 1];
    }

    /**
     * 커서가 서 있어야 할 칸의 가운데. `finished` 는 보지 않는다 — 거두는 운동이
     * 마지막으로 서 있던 자리를 알아야 하기 때문이다.
     */
    function cursorAt(scene: NaiveShiftByOneScene): number {
      const shift = scene.attempts.length - 1;
      if (shift < 0) return colCenter(0);
      const attempt = scene.attempts[shift]!;
      // 물러난 자리에서는 패턴 맨 앞으로 돌아와 있다.
      if (attempt.outcome === 'dropped' || attempt.probes.length === 0) return colCenter(shift);
      return colCenter(shift + attempt.probes.length - 1);
    }

    /** 이음 띠의 폭. 버린 자리에서는 0 이다. */
    function seamWidthOf(attempt: ShiftAttempt | undefined): number {
      if (!attempt || attempt.outcome === 'dropped') return 0;
      return matchedOf(attempt) * cellW;
    }

    // ── 정적 그리기 ─────────────────────────────────────────────────────────

    function paintCell(cell: SVGRectElement, glyph: SVGTextElement, state: CellState): void {
      // 타일이 고정색이면 잉크도 고정색으로 간다 (design-tokens 의 stateInk 표).
      const fill = state === 'hit' ? c.itemPivot : state === 'miss' ? c.itemSwapping : c.itemDefault;
      cell.setAttribute('fill', fill);
      cell.setAttribute('stroke', state === 'idle' ? c.border : fill);
      glyph.setAttribute('fill', state === 'idle' ? c.text : c.stateInk);
    }

    function clear(g: SVGGElement): void {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const g of [gTrail, gLabels, gText, gFound, gStrip, gCursor]) clear(g);
      textCells = [];
      textGlyphs = [];
      patCells = [];
      patGlyphs = [];
      strip = null;
      seam = null;
      cursor = null;
      caption.textContent = '';
    }

    /**
     * 자리마다 들인 품을 쌓아 올린다.
     *
     * 더미의 높이가 그 자리에서 견준 횟수이고, 칸 하나하나의 색이 그 견줌의 결과다.
     * 전부 더하면 처음부터 여기까지의 견준 횟수와 같다 — 화면에 뜨는 수와 그림이
     * 같은 자료를 쓴다.
     */
    function drawTrail(scene: NaiveShiftByOneScene, lastShift: number): void {
      const w = Math.max(2, cellW - CELL_GAP * 2);
      for (let s = 0; s <= lastShift; s += 1) {
        gTrail.appendChild(
          el('rect', {
            x: shiftX(s) + CELL_GAP,
            y: TRAIL_BASE,
            width: w,
            height: TRAIL_RULE_H,
            rx: TRAIL_RULE_H / 2,
            fill: c.border,
          }),
        );
        const attempt = scene.attempts[s];
        if (!attempt) continue;
        const segH = Math.max(2, trailStep - TRAIL_SEG_GAP);
        attempt.probes.forEach((hit, k) => {
          gTrail.appendChild(
            el('rect', {
              x: shiftX(s) + CELL_GAP,
              y: TRAIL_BASE - (k + 1) * trailStep,
              width: w,
              height: segH,
              rx: 2,
              fill: hit ? c.itemPivot : c.itemSwapping,
            }),
          );
        });
      }
    }

    /** 그 장면이 말하는 것을 전부 세운다. 자리는 여기서 셈한다 (S-piece). */
    function drawStatic(scene: NaiveShiftByOneScene): void {
      const text = scene.text;
      const pattern = scene.pattern;
      const n = Math.max(1, text.length);
      const m = Math.max(1, pattern.length);
      const lastShift = Math.max(0, text.length - pattern.length);

      // 크기는 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece).
      cellW = Math.min(CELL_MAX_W, Math.floor((PIECE_CANVAS_W - LABEL_W - SIDE_MIN) / n));
      const spanW = n * cellW;
      originX = LABEL_W + Math.round((PIECE_CANVAS_W - LABEL_W - SIDE_MIN - spanW) / 2);
      trailStep = Math.max(3, Math.min(TRAIL_STEP_MAX, Math.floor((TRAIL_BASE - TRAIL_TOP) / m)));

      drawTrail(scene, lastShift);

      for (const [mark, y] of [
        [MARK_TEXT, TEXT_Y + CELL_H / 2 + 4],
        [MARK_PATTERN, PAT_Y + CELL_H / 2 + 4],
      ] as const) {
        const label = el('text', {
          x: originX - 12,
          y,
          'text-anchor': 'end',
          'font-family': fonts.mono,
          'font-size': fontSizes.sm,
          fill: c.textMuted,
        });
        label.textContent = mark;
        gLabels.appendChild(label);
      }

      // 지금 자리의 형편만 칠한다. 다음 자리로 가면 새 시도가 빈 목록으로 시작해
      // 저절로 걷힌다 — 지우는 명령이 따로 없다.
      const attempt = current(scene);
      const shift = scene.attempts.length - 1;

      for (let i = 0; i < text.length; i += 1) {
        const cell = el('rect', {
          x: originX + i * cellW + CELL_GAP / 2,
          y: TEXT_Y,
          width: cellW - CELL_GAP,
          height: CELL_H,
          rx: 5,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 1.5,
        });
        const glyph = el('text', {
          x: colCenter(i),
          y: TEXT_Y + CELL_H / 2 + 7,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          fill: c.text,
        });
        glyph.textContent = text[i] ?? '';
        textCells.push(cell);
        textGlyphs.push(glyph);
        gText.append(cell, glyph);
      }

      // 찾은 자국은 걸음이 지나가도 남는다. 정적 그리기가 세우지 않으면 되짚었을
      // 때 사라진다 (S-scene).
      scene.attempts.forEach((a, s) => {
        if (a.outcome !== 'found') return;
        gFound.appendChild(
          el('rect', {
            x: shiftX(s) + CELL_GAP / 2,
            y: FOUND_Y,
            width: m * cellW - CELL_GAP,
            height: FOUND_H,
            rx: FOUND_H / 2,
            fill: c.itemPivot,
          }),
        );
      });

      // 패턴 띠 — 통째로 옮겨 다닌다. 이음 띠도 같이 움직여야 하므로 한 무리에 둔다.
      const stripX = shiftX(Math.max(0, shift));
      const g = el('g', { transform: `translate(${stripX}, ${PAT_Y})` });
      const seamRect = el('rect', {
        x: 0,
        y: SEAM_Y - PAT_Y,
        width: seamWidthOf(attempt),
        height: SEAM_H,
        rx: SEAM_H / 2,
        fill: c.itemPivot,
      });
      g.appendChild(seamRect);
      for (let j = 0; j < pattern.length; j += 1) {
        const cell = el('rect', {
          x: j * cellW + CELL_GAP / 2,
          y: 0,
          width: cellW - CELL_GAP,
          height: CELL_H,
          rx: 5,
          fill: c.itemDefault,
          stroke: c.border,
          'stroke-width': 1.5,
        });
        const glyph = el('text', {
          x: j * cellW + cellW / 2,
          y: CELL_H / 2 + 7,
          'text-anchor': 'middle',
          'font-family': fonts.mono,
          'font-size': fontSizes.xl,
          fill: c.text,
        });
        glyph.textContent = pattern[j] ?? '';
        patCells.push(cell);
        patGlyphs.push(glyph);
        g.append(cell, glyph);
      }
      gStrip.appendChild(g);
      strip = g;
      seam = seamRect;

      if (attempt) {
        attempt.probes.forEach((hit, k) => {
          const i = shift + k;
          const state: CellState = hit ? 'hit' : 'miss';
          if (textCells[i] && textGlyphs[i]) paintCell(textCells[i]!, textGlyphs[i]!, state);
          if (patCells[k] && patGlyphs[k]) paintCell(patCells[k]!, patGlyphs[k]!, state);
        });
      }

      // 다 훑고 나면 견줄 것이 없다. 숨기지 말고 **짓지 않는다** — 숨기기만 하면
      // 앞 걸음의 자리가 속성에 남아 되짚기 판정이 어긋난다.
      if (!scene.finished) cursor = buildCursor(cursorAt(scene));
    }

    function buildCursor(x: number): SVGGElement {
      const g = el('g', { transform: `translate(${z(x)}, ${CURSOR_Y})` });
      g.appendChild(el('path', { d: `M -7 0 L 7 0 L 0 ${CURSOR_H} Z`, fill: c.itemComparing }));
      gCursor.appendChild(g);
      return g;
    }

    /** 캡션은 장면이 무엇을 말할지만 담는다. 문자는 여기서 만든다 (C10). */
    function drawCaption(cap: NaiveShiftCaption | null): void {
      if (!cap) {
        caption.textContent = '';
        return;
      }
      switch (cap.kind) {
        case 'align':
          caption.textContent = t(
            'caption.align',
            'Line up and compare from the front. Position: {shift}.',
            { shift: cap.shift },
          );
          return;
        case 'retreatNone':
          caption.textContent = t(
            'caption.retreatNone',
            'The very first letter is a mismatch. Slide by one.',
          );
          return;
        case 'retreat':
          caption.textContent = t(
            'caption.retreat',
            'A mismatch. Throw away everything matched so far and slide by one. Matched: {matched}.',
            { matched: cap.matched },
          );
          return;
        case 'found':
          caption.textContent = t('caption.found', 'The whole pattern matched. Found at: {shift}.', {
            shift: cap.shift,
          });
          return;
        case 'done':
          caption.textContent = t(
            'caption.done',
            'No positions left to slide to. Comparisons: {comparisons}.',
            { comparisons: cap.comparisons },
          );
          return;
      }
    }

    // ── 걸음의 운동 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 정본이라 요소는 이미 끝 자리에 서 있다. 그래서 운동은 **아직
    // 못 온 만큼을 뒤로 물리는** 꼴이고, 끝나면 `render` 가 장면을 통째로 다시
    // 세워 보간이 남긴 속성·끝자리를 지운다.

    function placeStrip(x: number, dy: number): void {
      strip?.setAttribute('transform', `translate(${z(x)}, ${z(PAT_Y + dy)})`);
    }

    function placeCursor(x: number): void {
      cursor?.setAttribute('transform', `translate(${z(x)}, ${CURSOR_Y})`);
    }

    function setSeam(w: number): void {
      seam?.setAttribute('width', String(z(Math.max(0, w))));
    }

    /**
     * 자리를 하나 잡는다.
     *
     * 처음 놓는 자리면 **위에서 내려앉고**, 그 다음부터는 한 칸 오른쪽으로
     * 미끄러진다. 커서도 함께 패턴 맨 앞으로 간다 — 한 뜻의 운동이라 시계는 하나다.
     */
    function slide(scene: NaiveShiftByOneScene, live: () => boolean): Promise<void> {
      const shift = scene.attempts.length - 1;
      if (shift < 0) return Promise.resolve();
      const to = shiftX(shift);
      const front = colCenter(shift);
      const prev = scene.attempts[shift - 1];
      // 앞 자리에서 커서가 어디까지 갔었는지는 그 시도의 자취가 말한다.
      const fromCursor =
        prev === undefined
          ? front
          : prev.outcome === 'dropped' || prev.probes.length === 0
            ? colCenter(shift - 1)
            : colCenter(shift - 1 + prev.probes.length - 1);
      const from = prev === undefined ? to : shiftX(shift - 1);
      const entering = prev === undefined;

      return animate(
        SLIDE_MS,
        (e) => {
          placeStrip(from + (to - from) * e, entering ? -RISE * (1 - e) : 0);
          placeCursor(fromCursor + (front - fromCursor) * e);
        },
        live,
      );
    }

    /** 한 글자를 견준다. 커서가 그 칸으로 가고, 맞았으면 이음 띠가 그만큼 찬다. */
    async function probe(scene: NaiveShiftByOneScene, live: () => boolean): Promise<void> {
      const shift = scene.attempts.length - 1;
      const attempt = shift >= 0 ? scene.attempts[shift]! : undefined;
      if (!attempt || attempt.probes.length === 0) return;

      const k = attempt.probes.length - 1;
      const hit = attempt.probes[k]!;
      const target = colCenter(shift + k);
      const from = k === 0 ? colCenter(shift) : colCenter(shift + k - 1);
      const before: ShiftAttempt = { probes: attempt.probes.slice(0, -1), outcome: null };
      const fromW = matchedOf(before) * cellW;

      // 견주기 전으로 물린다 — 커서는 앞 칸에, 이 칸의 칠은 아직 없고, 띠도 앞 폭이다.
      if (textCells[shift + k] && textGlyphs[shift + k]) {
        paintCell(textCells[shift + k]!, textGlyphs[shift + k]!, 'idle');
      }
      if (patCells[k] && patGlyphs[k]) paintCell(patCells[k]!, patGlyphs[k]!, 'idle');
      setSeam(fromW);

      await animate(CURSOR_MS, (e) => placeCursor(from + (target - from) * e), live);
      if (!live()) return;

      // 가서 보고 나서 판정한다 — 그 순서가 이 조각이 하는 말이다.
      const state: CellState = hit ? 'hit' : 'miss';
      if (textCells[shift + k] && textGlyphs[shift + k]) {
        paintCell(textCells[shift + k]!, textGlyphs[shift + k]!, state);
      }
      if (patCells[k] && patGlyphs[k]) paintCell(patCells[k]!, patGlyphs[k]!, state);
      if (!hit) return;

      const toW = matchedOf(attempt) * cellW;
      await animate(SEAM_MS, (e) => setSeam(fromW + (toW - fromW) * e), live);
    }

    /**
     * 도로 물러난다 — 이음 띠가 0 으로 줄고 커서가 패턴 맨 앞으로 돌아온다.
     *
     * 한 뜻으로 묶인 운동이라 시계를 둘로 나누지 않는다. 어긋난 칸은 그 까닭이
     * 보이도록 물러나는 동안에도, 물러난 뒤에도 켜 둔 채로 둔다.
     */
    function collapse(scene: NaiveShiftByOneScene, live: () => boolean): Promise<void> {
      const shift = scene.attempts.length - 1;
      const attempt = shift >= 0 ? scene.attempts[shift]! : undefined;
      if (!attempt) return Promise.resolve();
      const fromW = matchedOf(attempt) * cellW;
      const front = colCenter(shift);
      const fromCursor =
        attempt.probes.length === 0 ? front : colCenter(shift + attempt.probes.length - 1);

      return animate(
        COLLAPSE_MS,
        (e) => {
          setSeam(fromW * (1 - e));
          placeCursor(fromCursor + (front - fromCursor) * e);
        },
        live,
      );
    }

    /** 다 맞았다. 자리를 잡는 느낌으로 한 번 내려앉는다. 양 끝에서 깊이가 0 이다. */
    function settle(scene: NaiveShiftByOneScene, live: () => boolean): Promise<void> {
      const shift = scene.attempts.length - 1;
      if (shift < 0) return Promise.resolve();
      const x = shiftX(shift);
      return animate(
        SETTLE_MS,
        (e) => placeStrip(x, Math.sin(e * Math.PI) * SETTLE_DIP),
        live,
      );
    }

    /**
     * 더 밀 자리가 없다. 커서를 거둔다.
     *
     * 정지 화면에는 커서가 없으므로 운동 중에만 짓는다 — `opacity` 만 되돌리면
     * 앞 걸음의 좌표가 남아 되짚기 판정이 어긋난다.
     */
    async function retire(scene: NaiveShiftByOneScene, live: () => boolean): Promise<void> {
      if (!live()) return;
      const ghost = buildCursor(cursorAt(scene));
      await animate(RETIRE_MS, (e) => ghost.setAttribute('opacity', String(z(1 - e))), live);
      ghost.remove();
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 밟은 걸음 하나만 흐르게
     * 한다. `prev` 는 쓰지 않는다 — 출발 그림(앞 자리 · 앞 커서 자리 · 앞 띠 폭)이
     * 전부 `attempts` 에서 셈으로 나오기 때문이다 (S-scene).
     */
    async function render(
      next: NaiveShiftByOneScene,
      _prev: NaiveShiftByOneScene | null,
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

      switch (step.kind) {
        case 'align':
          await slide(next, live);
          break;
        case 'compare':
          await probe(next, live);
          break;
        case 'retreat':
          await collapse(next, live);
          break;
        case 'found':
          await settle(next, live);
          break;
        case 'done':
          await retire(next, live);
          break;
      }
      if (!live()) return;

      // 흐르며 남은 보간 끝자리·임시 커서가 통째로 사라진다. 그 사이에 타이머도
      // 프레임도 없어 깜빡이지 않는다 (S-scene).
      rewind();
      drawStatic(next);
      drawCaption(next.caption);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 취소된 타이머의 콜백은 아예 불리지 않는다. 기다리던 것을 여기서 깨우지
        // 않으면 `await ctx.emit` 이 영영 돌아오지 않는다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        canvas.textContent = '';
      },
    };
  },
};
