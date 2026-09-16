/**
 * select-min-each-pass-stage — 훑음과 옮김이 시간상 떨어져 있음을 보이는 무대.
 *
 * 화면은 세 켜다.
 *   위쪽 레일   훑는 눈길이 지나는 길. 한 번 견줄 때마다 그 자리에 자국이 남는다.
 *   가운데 칸   값이 든 자리. 훑는 동안에는 하나도 움직이지 않는다.
 *   아래 레일   기억의 길. "지금까지 가장 작았던 자리" 표식이 여기를 건너다닌다.
 *
 * 그래서 다 훑고 나면 위에는 자국이 셋, 아래에는 건너간 자국이 하나 남고,
 * 값이 실제로 옮겨지는 것은 그 뒤에 딱 한 번이다. 견줌은 많고 이동은 적다는
 * 것이 세 켜에 남은 자국 수로 드러난다.
 *
 * ── 걸음마다 부르는 메서드는 두지 않는다
 *
 * `render` 하나가 장면을 받아 화면 **전체**를 세우고, 그 다음에 방금 달라진 것만
 * 흐르게 한다 (S-scene). 그래서 되돌릴 명령이 없고, 되짚기가 앞으로 가기와 같은
 * 길을 탄다. 옮기기 전에는 `paintCell(i,'comparing')` 을 다음 걸음이
 * `paintCell(i,'default')` 로 되돌리는 쌍이 있었는데, 되돌림이 없어지면서 그
 * 짝맞추기도 함께 사라졌다.
 *
 * 운동의 방향이 뒤집혀 있다 — 정적 그리기가 정본이라 눈길도 표식도 값도 이미 끝
 * 자리에 서 있고, 애니메이션은 **아직 못 온 만큼을 뒤로 물려** 놓고 시작한다.
 * 그 출발 자리는 장면의 `step` 이 실어 온 자리 번호에서 셈한다. `prev` 는 쓰지
 * 않는다 (S-scene).
 *
 * ── 채움과 테두리를 가른다
 *
 * **채움은 값의 형편**(맨 앞으로 옮겨져 확정됐나), **테두리는 견줌·훑음의 표식**
 * (표식이 가리키나 · 지금 견주나) 이다. 값이 자리를 옮기는 조각이라 고른 쪽을
 * 채움으로 칠하면 옮긴 뒤 그 자리에 밀려난 값이 앉아 읽기가 뒤집힌다.
 *
 * View 는 algorithm 의 타입을 모른다 (원칙 1) — 장면 타입 하나만 안다.
 *
 * 화면 문자는 캡션뿐이고 전부 `params.t` 로 만든다 — 문안은 `facet.ts` 의
 * `messages` 에 있다 (C10). 칸에 적힌 값과 표식의 `min` 은 도형에 새겨진 표식이라
 * 문안이 아니다.
 *
 * 타이머: rAF 와 그것을 기다리는 약속뿐이며 스스로 다음 회차를 예약하는 루프는
 * 없다. `destroy()` 가 걸린 프레임을 모두 걷고 대기 중이던 약속을 즉시 풀어 준다.
 */

import {
  getColors,
  makeTranslator,
  PIECE_CANVAS_W,
  type CanvasView,
  type SceneRenderer,
  type Theme,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { SelectMinEachPassCaption, SelectMinEachPassScene } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 268;

/** 칸 폭은 캔버스에서 역산하고 상수로는 상한만 둔다 (S-piece). */
const CELL_MAX_W = 132;
const SIDE_MIN = 40;
const CELL_GAP = 24;

const SCAN_RAIL_Y = 26;
const EYE_TIP_Y = 52;
const CELL_TOP = 108;
const CELL_H = 64;
const CELL_BOT = CELL_TOP + CELL_H;
const CHIP_TOP = 186;
const CHIP_H = 30;
const CHIP_W = 104;
const MEM_RAIL_Y = CHIP_TOP + CHIP_H / 2;
const CAP_Y1 = 238;
const CAP_Y2 = 256;

/** 값이 들려 올라가는 높이. 훑는 장치가 물러난 자리를 지나간다. */
const LIFT_DY = -48;
/** 표식이 아래에서 올라오기 전에 물려 있는 정도. */
const MARK_DY = 18;
/** 눈길이 물러나며 올라가는 높이. */
const RETRACT_DY = -46;

const MARK_MS = 300;
const EYE_MS = 200;
const LINK_MS = 180;
const HOP_MS = 300;
const RETRACT_MS = 240;
/** 들려 올라가 건너가 내려앉기까지. 한 뜻의 운동이라 **한 시계**로 돈다. */
const MOVE_MS = 680;
const LIFT_END = 0.25;
const CROSS_END = 0.75;
/**
 * 마지막 걸음은 흐를 것이 없어 벽시계가 `stepMs` 그대로였다 — 얇은 걸음이다
 * (S-piece). `stepMs` 를 올리면 이미 긴 걸음이 함께 길어지므로, 그 걸음에만
 * 얇은 운동을 얹는다. 자국을 하나씩 세어 나가는 꼴이 "견줌 몇 번" 과 같은 동사다.
 */
const TALLY_MS = 280;

/** 자국 — 그냥 훑은 자리 / 표식이 건너온 자리 / 세어 볼 때 부푸는 폭. */
const DOT_R = 3.5;
const DOT_HOP_R = 5.5;
const DOT_SWELL = 2.5;

/** 칸 테두리 — 기본 / 지금 견주는 칸 / 표식이 가리키는 칸. */
const STROKE_PLAIN = 1.5;
const STROKE_LOOKING = 3;
const STROKE_MARKED = 4;

/** 도형에 새겨진 글자 — 번역 대상이 아니다 (C10 표식 판정 1·2). */
const MIN_MARK = 'min';

const CAP_LINE_MAX = 60;

const ease = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[K];
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * 표식이 쥔 값. 옮긴 뒤에는 그 값이 맨 앞자리에 앉아 있으므로 거기서 읽는다 —
 * 표식이 서 있는 자리에는 밀려난 값이 와 있다.
 */
function heldValue(s: SelectMinEachPassScene): number | null {
  if (s.best === null) return null;
  const at = s.settled === null ? s.best : s.settled;
  const v = s.values[at];
  return typeof v === 'number' ? v : null;
}

/** 표식의 테두리가 설 칸. 손을 뗀 뒤에는 어느 칸도 아니다. */
function markedCell(s: SelectMinEachPassScene): number | null {
  return s.retired ? null : s.best;
}

export const selectMinEachPassStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<SelectMinEachPassScene> {
    const svg = params.canvas;
    const theme: Theme = params.theme ?? 'light';
    const c = getColors(theme);
    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const tr = params.t ?? makeTranslator(params.locale);

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

    // ── 켜 나누기. 뒤에 붙은 것이 위에 그려진다.
    const railLayer = el('g');
    const trailLayer = el('g');
    const cellLayer = el('g');
    const chipLayer = el('g');
    const linkLayer = el('g');
    const eyeLayer = el('g');
    const flyLayer = el('g');
    const capLayer = el('g');
    const layers = [railLayer, trailLayer, cellLayer, chipLayer, linkLayer, eyeLayer, flyLayer];
    for (const layer of [...layers, capLayer]) svg.appendChild(layer);

    // 캡션은 재건 밖 요소다 — 정적 경로가 매번 문자를 명시로 쓴다. 빠뜨리면 앞
    // 걸음의 문장이 남아 되짚기 판정에서 어긋난다.
    const capLine1 = el('text', {
      x: W / 2,
      y: CAP_Y1,
      'text-anchor': 'middle',
      'font-size': 14,
      fill: c.textMuted,
    });
    const capLine2 = el('text', {
      x: W / 2,
      y: CAP_Y2,
      'text-anchor': 'middle',
      'font-size': 14,
      fill: c.textMuted,
    });
    capLayer.append(capLine1, capLine2);

    // ── 기하. 칸 수가 폭을 정하므로 장면의 `origin` 길이에서 매번 역산한다.
    //    자리를 **먼저 한 번에 셈하고** 그 다음에 그린다 — 그리면서 재면 순회
    //    순서가 곧 숨은 상태가 된다.
    let cellW = CELL_MAX_W;
    let originX = SIDE_MIN;

    function layout(n: number): void {
      cellW = Math.min(CELL_MAX_W, Math.floor((W - SIDE_MIN * 2 - CELL_GAP * (n - 1)) / n));
      const span = n * cellW + CELL_GAP * (n - 1);
      originX = Math.round((W - span) / 2);
    }

    const cellX = (i: number): number => originX + i * (cellW + CELL_GAP);
    const cellCX = (i: number): number => cellX(i) + cellW / 2;

    // ── 이번 장면이 세운 DOM 손잡이. 장면 상태가 아니라 그리기의 부산물이다.
    let cellRects: SVGRectElement[] = [];
    let cellTexts: SVGTextElement[] = [];
    let trailDots = new Map<number, SVGCircleElement>();
    let chipG: SVGGElement | null = null;
    let chipStem: SVGLineElement | null = null;
    let eyeG: SVGGElement | null = null;

    // ── 걸어 둔 것과 세대 빗장.
    //
    // 정적 그리기가 모든 요소를 매번 새로 짓지만, 운동이 끝난 뒤 장면을 **통째로
    // 다시 세우는** 마무리가 있다. 지난 세대의 운동이 살아 있으면 그 마무리가
    // 이미 새로 선 화면을 옛 장면으로 덮는다. 그래서 `render` 첫머리에서 세대를
    // 올리고, 운동은 `await` 뒤마다 자기 세대를 확인한 뒤에만 화면에 손을 댄다.
    //
    // `isInstant` 와 `onScrubStart` 는 빗장이 아니다 — 러너는 장면 조각에서 그
    // 둘을 부르지 않는다 (S-scene). 실효 있는 것은 `opts.animate` 검사와 이것뿐이다.
    let gen = 0;
    let destroyed = false;
    const frames = new Set<number>();
    const waiters = new Set<() => void>();
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /** 한 걸음을 한 시계로 흐르게 한다. 세대가 지나면 화면에 손대지 않고 물러난다. */
    function animate(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
      return new Promise<void>((resolve) => {
        if (!alive(mine)) {
          resolve();
          return;
        }
        const started = Date.now();
        const finish = (): void => {
          waiters.delete(finish);
          resolve();
        };
        waiters.add(finish);
        const tick = (): void => {
          if (!alive(mine)) {
            finish();
            return;
          }
          const raw = Math.min(1, (Date.now() - started) / ms);
          draw(ease(raw));
          if (raw >= 1) {
            finish();
            return;
          }
          const id = requestAnimationFrame(() => {
            frames.delete(id);
            tick();
          });
          frames.add(id);
        };
        tick();
      });
    }

    // ── 부품 짓기.

    function makeEye(index: number): SVGGElement {
      const g = el('g');
      g.appendChild(el('circle', { cx: 0, cy: SCAN_RAIL_Y, r: 5, fill: c.text }));
      g.appendChild(
        el('line', {
          x1: 0,
          y1: SCAN_RAIL_Y + 5,
          x2: 0,
          y2: EYE_TIP_Y - 11,
          stroke: c.text,
          'stroke-width': 2,
        }),
      );
      g.appendChild(
        el('path', {
          d: `M -7 ${EYE_TIP_Y - 11} L 7 ${EYE_TIP_Y - 11} L 0 ${EYE_TIP_Y} Z`,
          fill: c.text,
        }),
      );
      g.setAttribute('transform', `translate(${cellCX(index)} 0)`);
      eyeLayer.appendChild(g);
      return g;
    }

    /**
     * 기억의 표식. 아직 답을 쥐고 있으면 칸 바닥까지 줄기가 닿아 있고, 답을
     * 내놓은 뒤에는 손을 떼고 뒤로 물러난다 — 줄기는 **숨기지 않고 짓지 않는다.**
     */
    function makeChip(s: SelectMinEachPassScene, at: number, value: number): void {
      const g = el('g');
      if (!s.retired) {
        const stem = el('line', {
          x1: 0,
          y1: CELL_BOT,
          x2: 0,
          y2: CHIP_TOP,
          stroke: c.itemPivot,
          'stroke-width': 3,
        });
        g.appendChild(stem);
        chipStem = stem;
      }
      g.appendChild(
        el('rect', {
          x: -CHIP_W / 2,
          y: CHIP_TOP,
          width: CHIP_W,
          height: CHIP_H,
          rx: CHIP_H / 2,
          fill: s.retired ? c.bgSubtle : c.itemPivot,
          stroke: s.retired ? c.border : c.itemPivot,
          'stroke-width': 1.5,
        }),
      );
      const mark = el('text', {
        x: -CHIP_W / 2 + 15,
        y: MEM_RAIL_Y + 4,
        'font-size': 12,
        'letter-spacing': 0.5,
        fill: s.retired ? c.textMuted : c.stateInk,
      });
      mark.textContent = MIN_MARK;
      const valueText = el('text', {
        x: CHIP_W / 2 - 15,
        y: MEM_RAIL_Y + 6,
        'text-anchor': 'end',
        'font-size': 18,
        'font-weight': 600,
        fill: s.retired ? c.textMuted : c.stateInk,
      });
      valueText.textContent = String(value);
      g.append(mark, valueText);
      g.setAttribute('transform', `translate(${cellCX(at)} 0)`);
      chipLayer.appendChild(g);
      chipG = g;
    }

    /** 자리를 옮기는 동안만 쓰는 값 타일. 운동이 끝나면 재건이 통째로 거둔다. */
    function makeFlyTile(index: number, value: number, sorted: boolean): SVGGElement {
      const g = el('g');
      g.appendChild(
        el('rect', {
          x: cellX(index),
          y: CELL_TOP,
          width: cellW,
          height: CELL_H,
          rx: 10,
          fill: sorted ? c.itemSorted : c.itemDefault,
          stroke: sorted ? c.itemSorted : c.border,
          'stroke-width': STROKE_PLAIN,
        }),
      );
      const text = el('text', {
        x: cellCX(index),
        y: CELL_TOP + CELL_H / 2 + 9,
        'text-anchor': 'middle',
        'font-size': 26,
        'font-weight': 600,
        fill: sorted ? c.textInverse : c.text,
      });
      text.textContent = String(value);
      g.appendChild(text);
      g.setAttribute('transform', 'translate(0 0)');
      flyLayer.appendChild(g);
      return g;
    }

    // ── 장면이 정하는 칠. 채움은 **값의 형편**, 테두리는 **견줌·훑음의 표식**이다.

    function paintCell(s: SelectMinEachPassScene, i: number): void {
      const rect = cellRects[i];
      const text = cellTexts[i];
      if (!rect || !text) return;
      const sorted = s.settled === i;
      rect.setAttribute('fill', sorted ? c.itemSorted : c.itemDefault);
      if (markedCell(s) === i) {
        rect.setAttribute('stroke', c.itemPivot);
        rect.setAttribute('stroke-width', String(STROKE_MARKED));
      } else if (s.looking === i) {
        rect.setAttribute('stroke', c.itemComparing);
        rect.setAttribute('stroke-width', String(STROKE_LOOKING));
      } else {
        rect.setAttribute('stroke', sorted ? c.itemSorted : c.border);
        rect.setAttribute('stroke-width', String(STROKE_PLAIN));
      }
      text.setAttribute('fill', sorted ? c.textInverse : c.text);
    }

    /** 값이 날아가는 동안 그 칸을 비워 둔다. 운동이 끝나면 재건이 되돌린다. */
    function emptyCell(i: number): void {
      const rect = cellRects[i];
      const text = cellTexts[i];
      if (!rect || !text) return;
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', c.ghostOutline);
      rect.setAttribute('stroke-width', String(STROKE_PLAIN));
      rect.setAttribute('stroke-dasharray', '5 5');
      text.setAttribute('opacity', '0');
    }

    /** 늘 비우고 시작한다 — 되돌릴 명령이 필요 없다 (S-scene). */
    function rewind(): void {
      for (const layer of layers) layer.replaceChildren();
      cellRects = [];
      cellTexts = [];
      trailDots = new Map();
      chipG = null;
      chipStem = null;
      eyeG = null;
    }

    /**
     * 그 장면이 말하는 것을 전부 세운다.
     *
     * 레일 · 훑은 자국 · 칸 · 표식 · 눈길이 모두 여기서 난다. **머무는 강조**
     * (훑은 자국 · 표식이 건너온 자국 · 확정된 칸)를 여기 넣어야 되짚었을 때 남는다.
     */
    function drawStatic(s: SelectMinEachPassScene): void {
      const n = Math.max(1, s.origin.length);
      layout(n);

      railLayer.appendChild(
        el('line', {
          x1: cellCX(0),
          y1: SCAN_RAIL_Y,
          x2: cellCX(n - 1),
          y2: SCAN_RAIL_Y,
          stroke: c.border,
          'stroke-width': 2,
        }),
      );
      railLayer.appendChild(
        el('line', {
          x1: cellCX(0),
          y1: MEM_RAIL_Y,
          x2: cellCX(n - 1),
          y2: MEM_RAIL_Y,
          stroke: c.border,
          'stroke-width': 2,
          'stroke-dasharray': '3 6',
        }),
      );

      // 훑은 자국. 되돌리는 명령이 없어 쌓이던 것인데, 그 누적이 곧 "이 바퀴에서
      // 어디까지 보았나" 라는 이 조각의 주장이다. 장면이 말하므로 되짚어도 남는다.
      for (const i of s.scanned) {
        const hopped = s.hopAt.includes(i);
        const dot = el('circle', {
          cx: cellCX(i),
          cy: SCAN_RAIL_Y,
          r: hopped ? DOT_HOP_R : DOT_R,
          fill: hopped ? c.itemPivot : c.textMuted,
        });
        if (hopped) {
          dot.setAttribute('stroke', c.text);
          dot.setAttribute('stroke-width', '1.5');
        }
        trailLayer.appendChild(dot);
        trailDots.set(i, dot);
      }

      for (let i = 0; i < n; i += 1) {
        const rect = el('rect', {
          x: cellX(i),
          y: CELL_TOP,
          width: cellW,
          height: CELL_H,
          rx: 10,
          'stroke-dasharray': 'none',
        });
        const text = el('text', {
          x: cellCX(i),
          y: CELL_TOP + CELL_H / 2 + 9,
          'text-anchor': 'middle',
          'font-size': 26,
          'font-weight': 600,
          opacity: 1,
        });
        // 값 표기는 숫자 표식이다 (C10) — 키를 만들지 않는다.
        text.textContent = String(s.values[i]);
        cellLayer.append(rect, text);
        cellRects.push(rect);
        cellTexts.push(text);
        paintCell(s, i);
      }

      const held = heldValue(s);
      if (s.best !== null && held !== null) makeChip(s, s.best, held);

      if (s.eye !== null) eyeG = makeEye(s.eye);
    }

    // ── 캡션. 장면은 무엇을 말할지만 담고 문자는 여기서 만든다 (C10).

    function splitCaption(text: string): [string, string] {
      if (text.length <= CAP_LINE_MAX) return [text, ''];
      const words = text.split(' ');
      let head = '';
      let i = 0;
      while (i < words.length) {
        const next = head ? `${head} ${words[i]}` : String(words[i]);
        if (head && next.length > CAP_LINE_MAX) break;
        head = next;
        i += 1;
      }
      return [head, words.slice(i).join(' ')];
    }

    function captionText(cap: SelectMinEachPassCaption): string {
      switch (cap.kind) {
        case 'remember':
          return tr('caption.remember', 'Remember the first cell as the smallest so far.');
        case 'compare': {
          const question = tr('caption.compare', 'Is {value} smaller than {best}?', {
            value: cap.value,
            best: cap.best,
          });
          // 더 작지 않으면 그 걸음 안에서 답까지 난다 — 다음 걸음이 오지 않으므로
          // 물음만 남기면 "아니다" 를 말할 자리가 없어진다.
          if (cap.smaller) return question;
          return `${question} ${tr('caption.keep', 'No. The marker stays where it is.')}`;
        }
        case 'hop':
          return tr('caption.hop', 'Yes. The marker hops over to {value}.', { value: cap.value });
        case 'scanEnd':
          return tr(
            'caption.scanEnd',
            'Scan over: {compares} comparisons, {hops} marker hop, and not one value has moved.',
            { compares: cap.compares, hops: cap.hops },
          );
        case 'move':
          return tr(
            'caption.move',
            'Only now does anything move: the marked value goes to the front.',
          );
        case 'done':
          return tr('caption.done', 'One pass: {compares} comparisons, {moves} value move.', {
            compares: cap.compares,
            moves: cap.moves,
          });
      }
    }

    function drawCaption(cap: SelectMinEachPassCaption | null): void {
      const [a, b] = cap === null ? ['', ''] : splitCaption(captionText(cap));
      capLine1.textContent = a;
      capLine2.textContent = b;
    }

    // ── 걸음 함수. 정적 그리기가 이미 끝 자리를 세워 두었으므로, 흐르게 할 때만
    //    출발 자리로 되돌려 놓고 시작한다. 출발 자리는 `step` 이 실어 온 자리
    //    번호에서 셈한다 — `prev` 에서 꺼내지 않는다 (S-scene).

    /** 표식이 아래 레일에서 올라와 첫 자리에 앉는다. */
    function raise(at: number, mine: number): Promise<void> {
      const g = chipG;
      if (g === null) return Promise.resolve();
      const x = cellCX(at);
      return animate(MARK_MS, mine, (p) => {
        g.setAttribute('transform', `translate(${x} ${MARK_DY * (1 - p)})`);
        g.setAttribute('opacity', String(p));
      });
    }

    /**
     * 눈길이 한 칸 걸어가 견준다.
     *
     * 걸어감과 견줌은 뜻이 다른 두 마디라 차례로 흐른다. 잇는 선이 칸이 아니라
     * 표식으로 내려가는 것이, 견줌이 값에 닿지 않는다는 뜻이다.
     */
    async function walk(
      s: SelectMinEachPassScene,
      step: { from: number; to: number; smaller: boolean },
      mine: number,
    ): Promise<void> {
      const g = eyeG;
      const x0 = cellCX(step.from);
      const x1 = cellCX(step.to);
      if (g !== null && x0 !== x1) {
        await animate(EYE_MS, mine, (p) => {
          g.setAttribute('transform', `translate(${x0 + (x1 - x0) * p} 0)`);
        });
      }
      if (!alive(mine) || s.best === null) return;

      const from = cellCX(step.to);
      const to = cellCX(s.best);
      const link = el('path', {
        d: `M ${from} ${CELL_BOT + 2} Q ${(from + to) / 2} ${CHIP_TOP + 24} ${to} ${CHIP_TOP - 3}`,
        fill: 'none',
        stroke: c.itemComparing,
        'stroke-width': 2,
        'stroke-linecap': 'round',
      });
      // 실측 대신 현을 넉넉히 잡는다 — 넘치는 dashoffset 은 그냥 다 감춘 상태다.
      const reach = Math.round((Math.abs(from - to) + (CHIP_TOP - CELL_BOT)) * 1.8);
      link.setAttribute('stroke-dasharray', `${reach} ${reach}`);
      link.setAttribute('stroke-dashoffset', String(reach));
      linkLayer.appendChild(link);

      await animate(LINK_MS, mine, (p) => {
        link.setAttribute('stroke-dashoffset', String(Math.round(reach * (1 - p))));
      });
      if (!alive(mine) || step.smaller) return;
      // 더 작지 않았다. 되돌아 걷힌다 — 아무 자국도 남기지 않는다.
      await animate(LINK_MS, mine, (p) => {
        link.setAttribute('stroke-dashoffset', String(Math.round(reach * p)));
      });
    }

    /** 표식이 떼어져 새 자리로 건너간다. 건너온 자국이 함께 부푼다 — 한 뜻이다. */
    function hop(step: { from: number; to: number }, mine: number): Promise<void> {
      const g = chipG;
      if (g === null) return Promise.resolve();
      const x0 = cellCX(step.from);
      const x1 = cellCX(step.to);
      const dot = trailDots.get(step.to);
      // 건너는 동안은 칸에서 손을 뗀다. 재건이 도로 붙인다.
      if (chipStem !== null) chipStem.setAttribute('opacity', '0');
      return animate(HOP_MS, mine, (p) => {
        g.setAttribute('transform', `translate(${x0 + (x1 - x0) * p} 0)`);
        if (dot) dot.setAttribute('r', String(DOT_HOP_R + Math.sin(p * Math.PI) * DOT_SWELL));
      });
    }

    /** 훑는 장치가 물러난다. 정적 그리기는 물러난 뒤를 세우므로 잠깐만 짓는다. */
    function retract(from: number, mine: number): Promise<void> {
      const g = makeEye(from);
      const x = cellCX(from);
      return animate(RETRACT_MS, mine, (p) => {
        g.setAttribute('transform', `translate(${x} ${RETRACT_DY * p})`);
        g.setAttribute('opacity', String(1 - p));
      });
    }

    /**
     * 비로소 한 번. 표식이 가리킨 값이 들려 올라가 맨 앞으로 건너가고, 앞에 있던
     * 값은 빈 자리로 미끄러진다.
     *
     * 둘이 한 맞바꿈이라 **한 시계**로 돈다 — 시계를 나누면 lockstep 이 우연히
     * 맞는 꼴이 되고, 하나를 `void` 로 흘릴 여지가 생긴다 (S-scene).
     */
    function carry(
      s: SelectMinEachPassScene,
      step: { from: number; to: number },
      mine: number,
    ): Promise<void> {
      // 옮겨진 뒤의 배치가 정본이므로 출발 그림을 자리 번호에서 되세운다.
      const moving = s.values[step.to];
      const displacedValue = s.values[step.from];
      if (typeof moving !== 'number' || typeof displacedValue !== 'number') {
        return Promise.resolve();
      }
      const carried = makeFlyTile(step.from, moving, true);
      const displaced = makeFlyTile(step.to, displacedValue, false);
      emptyCell(step.from);
      emptyCell(step.to);

      const dx = cellX(step.to) - cellX(step.from);
      return animate(MOVE_MS, mine, (p) => {
        const lift = clamp01(p / LIFT_END);
        const cross = clamp01((p - LIFT_END) / (CROSS_END - LIFT_END));
        const drop = clamp01((p - CROSS_END) / (1 - CROSS_END));
        carried.setAttribute('transform', `translate(${dx * cross} ${LIFT_DY * (lift - drop)})`);
        displaced.setAttribute('transform', `translate(${-dx * cross} 0)`);
      });
    }

    /** 남은 자국을 하나씩 세어 나간다. 마지막 걸음의 말과 같은 동사다. */
    function tally(s: SelectMinEachPassScene, mine: number): Promise<void> {
      const marks: { dot: SVGCircleElement; r: number }[] = [];
      for (const i of s.scanned) {
        const dot = trailDots.get(i);
        if (dot) marks.push({ dot, r: s.hopAt.includes(i) ? DOT_HOP_R : DOT_R });
      }
      if (marks.length === 0) return Promise.resolve();
      return animate(TALLY_MS, mine, (p) => {
        for (let k = 0; k < marks.length; k += 1) {
          const mark = marks[k];
          const local = clamp01(p * (marks.length + 1) - k);
          mark.dot.setAttribute('r', String(mark.r + Math.sin(local * Math.PI) * DOT_SWELL));
        }
      });
    }

    function flow(s: SelectMinEachPassScene, mine: number): Promise<void> {
      const step = s.step;
      if (step === null) return Promise.resolve();
      switch (step.kind) {
        case 'mark':
          return raise(step.at, mine);
        case 'scan':
          return walk(s, step, mine);
        case 'hop':
          return hop(step, mine);
        case 'endScan':
          return retract(step.from, mine);
        case 'move':
          return carry(s, step, mine);
        case 'tally':
          return tally(s, mine);
      }
    }

    /**
     * 장면을 그린다.
     *
     * 늘 비우고 그 장면이 말하는 것을 전부 세운 뒤, 방금 달라진 것만 흐르게 한다.
     * 흐름이 끝나면 장면을 **통째로 다시 세운다** — 보간의 끝자리와 흐르며 얹힌
     * 임시 속성(`opacity` · 빈 칸의 점선 · 나는 타일)이 한꺼번에 사라져, 흐른
     * 화면과 곧바로 세운 화면이 갈리지 않는다.
     *
     * `prev` 는 쓰지 않는다. 출발 그림이 필요한 운동은 전부 `step` 이 실어 온 자리
     * 번호에서 셈한다 (S-scene).
     */
    async function render(
      next: SelectMinEachPassScene,
      _prev: SelectMinEachPassScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);
      rewind();
      drawStatic(next);
      drawCaption(next.caption);

      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      await flow(next, mine);
      if (!alive(mine)) return;
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
        for (const wake of [...waiters]) wake();
        waiters.clear();
        rewind();
        drawCaption(null);
        for (const layer of [...layers, capLayer]) {
          if (layer.parentNode) layer.parentNode.removeChild(layer);
        }
      },
    };
  },
};
