/**
 * fixed-length-stage View — 고정 길이 출력 단일 캔버스.
 *
 * 이 조각의 동사는 **접힌다** 이므로, 길이가 제각각인 입력이 실제로 같은 폭으로
 * 줄어들며 오른쪽으로 건너가야 한다 (S-piece). 상자 넷을 순서대로 나타나게 하면
 * "무엇을 넣든 같은 길이" 가 "상자 넷이 나란하다" 로 약해진다.
 *
 * 네 줄이 동시에 접히는 것이 요점이다 — 출발 폭은 넷 다 다른데 도착 폭이 하나로
 * 모이는 장면이 이 조각의 주장이다.
 *
 * 두 열로 대비한다:
 *   - 왼쪽: 입력 문자열 그대로. 길이가 제각각이고 가장 긴 것은 잘려 나간다
 *   - 오른쪽: 해시 상자. 넷이 정확히 같은 폭이고, 마지막 걸음에서 좌우 안내선이
 *     그 사실을 짚는다
 *
 * 입력을 막대로 추상하지 않고 문자열 그대로 두는 이유:
 *   길이는 글자 수가 곧 길이다. 막대로 바꾸면 축척을 설명해야 하고, 축척을
 *   설명하는 순간 조각이 두 가지를 말하게 된다. 마지막 행이 화면 밖으로 잘리는
 *   것도 "더 길어도 마찬가지" 를 말없이 전한다.
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 입력 문자열 — palette.text
 *   - 해시 상자 — palette.bgSubtle 바탕에 palette.textMuted 글자
 *   - 안내선과 "언제나 N비트" — palette.accent (사건 강조)
 *   - 각주 — palette.textMuted
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 288;

// ── 열 좌표 ─────────────────────────────────────────────────────────────
const INPUT_X = 20;
/** 입력 문자열이 잘리는 지점. 넘치는 것은 여기서 끊고 페이드로 사라진다. */
const INPUT_CLIP_W = 300;
const BYTES_X = 366;
const ARROW_X = 382;
const BOX_X = 400;
const BOX_W = 200;
const BOX_H = 22;

// ── 행 ──────────────────────────────────────────────────────────────────
const ROW_Y0 = 88;
const ROW_PITCH = 34;

const CAPTION_BASE_Y = 16;
const CAPTION_EVENT_Y = 34;
const HEADER_Y = 68;
const UNIFORM_LABEL_Y = 244;
const NOTE_Y = 268;

/** 행이 하나씩 나타나는 간격 (ms). */
const ROW_STEP_MS = 90;

/** 해시 상자에 들어가는 hex 글자 수. 상자 폭에 맞춰 자른다. */
const HEX_HEAD = 26;

/** 입력이 상자 폭으로 접혀 건너가는 시간 (ms). */
const FOLD_MS = 560;
/** mono 12px 한 글자의 대략적 폭. 접힘 출발 폭을 재는 데 쓴다. */
const CHAR_W = 7.2;
/** 빈 입력도 접히는 것이 보여야 하므로 출발 폭에 하한을 둔다. */
const MIN_SRC_W = 10;

type Row = { input: string; bytes: number; hash: string };
type InitPayload = { algorithmLabel: string; hashBits: number; rows: Row[] };

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const fixedLengthStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const palette = getColors(params.theme);
    const HOT = palette.accent;

    const svg = params.canvas;

    // 입력 열을 넘치는 글자에서 끊는 클립. 잘림 자체가 "더 길다" 는 표시다.
    const defs = el('defs');
    const clip = el('clipPath', { id: 'fixedLengthInputClip' });
    clip.appendChild(
      el('rect', { x: INPUT_X, y: 0, width: INPUT_CLIP_W, height: H }),
    );
    defs.appendChild(clip);
    svg.appendChild(defs);

    function text(
      x: number,
      y: number,
      opts: { anchor?: string; fill?: string; size?: string; family?: string; weight?: string } = {},
    ): SVGTextElement {
      return el('text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'middle',
        fill: opts.fill ?? palette.text,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        ...(opts.weight ? { 'font-weight': opts.weight } : {}),
      });
    }

    const captionBase = text(W / 2, CAPTION_BASE_Y);
    const captionEvent = text(W / 2, CAPTION_EVENT_Y, { fill: HOT, weight: '600' });
    const headerIn = text(INPUT_X, HEADER_Y, {
      anchor: 'start',
      fill: palette.textMuted,
      size: fontSizes.xs,
    });
    const headerOut = text(BOX_X, HEADER_Y, {
      anchor: 'start',
      fill: palette.textMuted,
      size: fontSizes.xs,
    });
    const uniformLabel = text(BOX_X + BOX_W / 2, UNIFORM_LABEL_Y, {
      fill: HOT,
      family: fonts.mono,
      weight: '600',
    });
    const note = text(W / 2, NOTE_Y, { fill: palette.textMuted, size: fontSizes.xs });

    /** 접혀 건너가는 중인 복제본들. reset 때 통째로 비운다. */
    const foldingGroup = el('g');
    const inputsGroup = el('g', { 'clip-path': 'url(#fixedLengthInputClip)' });
    const bytesGroup = el('g');
    const outputsGroup = el('g');
    const guidesGroup = el('g');
    svg.append(
      captionBase,
      captionEvent,
      headerIn,
      headerOut,
      inputsGroup,
      bytesGroup,
      outputsGroup,
      foldingGroup,
      guidesGroup,
      uniformLabel,
      note,
    );

    type RowNodes = {
      input: SVGTextElement;
      bytes: SVGTextElement;
      arrow: SVGTextElement;
      box: SVGRectElement;
      hex: SVGTextElement;
      /** 상자와 hex 를 묶은 그룹. 한 번에 나타내고 감추기 위해 잡아 둔다. */
      outRow: SVGGElement;
      /** 접힘이 출발하는 폭. 입력 글자 수에서 잰다. */
      srcW: number;
    };
    let rowNodes: RowNodes[] = [];
    let guides: SVGLineElement[] = [];

    const timers = new Set<ReturnType<typeof setTimeout>>();
    function later(fn: () => void, ms: number): void {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    }
    function clearTimers(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      foldingGroup.textContent = '';
    }

    /**
     * 한 입력을 복제해 상자 폭으로 접으며 오른쪽으로 보낸다.
     *
     * 출발 폭은 글자 수에서 재고 도착 폭은 넷 다 BOX_W 로 같다 — 그 수렴이
     * 이 조각의 주장이라, 도착점을 눈속임하지 않는다.
     */
    function foldToBox(index: number, srcW: number, delayMs: number, onArrive: () => void): void {
      const y = ROW_Y0 + index * ROW_PITCH;
      const from = Math.max(MIN_SRC_W, srcW);
      const ghost = el('rect', {
        x: INPUT_X,
        y,
        width: from,
        height: BOX_H,
        rx: 3,
        fill: palette.bgSubtle,
      });
      ghost.style.transformOrigin = `${INPUT_X}px ${y}px`;
      ghost.style.transition = `transform ${FOLD_MS}ms ease-in-out`;
      ghost.style.opacity = '0';
      foldingGroup.appendChild(ghost);
      later(() => {
        ghost.style.opacity = '1';
        ghost.style.transform = `translate(${BOX_X - INPUT_X}px, 0px) scaleX(${BOX_W / from})`;
      }, delayMs + 16);
      later(() => {
        ghost.remove();
        onArrive();
      }, delayMs + FOLD_MS + 16);
    }

    function buildRows(rows: Row[], emptyLabel: string): void {
      inputsGroup.textContent = '';
      bytesGroup.textContent = '';
      outputsGroup.textContent = '';
      guidesGroup.textContent = '';
      rowNodes = [];
      guides = [];

      rows.forEach((r, i) => {
        const y = ROW_Y0 + i * ROW_PITCH;

        const input = text(INPUT_X, y + 15, {
          anchor: 'start',
          family: fonts.mono,
          size: fontSizes.sm,
        });
        input.textContent = r.input === '' ? emptyLabel : r.input;
        if (r.input === '') input.setAttribute('fill', palette.textMuted);
        input.style.opacity = '0';
        input.style.transition = 'opacity 200ms ease-out';
        inputsGroup.appendChild(input);

        const bytes = text(BYTES_X, y + 15, {
          anchor: 'end',
          fill: palette.textMuted,
          family: fonts.mono,
          size: fontSizes.xs,
        });
        bytes.textContent = `${r.bytes} B`;
        bytes.style.opacity = '0';
        bytes.style.transition = 'opacity 200ms ease-out';
        bytesGroup.appendChild(bytes);

        const arrow = text(ARROW_X, y + 15, {
          anchor: 'middle',
          fill: palette.textMuted,
          size: fontSizes.xs,
        });
        arrow.textContent = '→';
        arrow.style.opacity = '0';
        arrow.style.transition = 'opacity 200ms ease-out';
        bytesGroup.appendChild(arrow);

        const box = el('rect', {
          x: BOX_X,
          y,
          width: BOX_W,
          height: BOX_H,
          rx: 3,
          fill: palette.bgSubtle,
          stroke: 'none',
          'stroke-width': 1.5,
        });
        box.style.transition = 'stroke 180ms ease-out';
        const hex = text(BOX_X + 8, y + 15, {
          anchor: 'start',
          fill: palette.textMuted,
          family: fonts.mono,
          size: fontSizes.xs,
        });
        hex.textContent = `${r.hash.slice(0, HEX_HEAD)}…`;
        const outRow = el('g');
        outRow.append(box, hex);
        outRow.style.opacity = '0';
        outRow.style.transition = 'opacity 200ms ease-out';
        outputsGroup.appendChild(outRow);

        rowNodes.push({ input, bytes, arrow, box, hex, outRow, srcW: (r.input === '' ? emptyLabel : r.input).length * CHAR_W });
      });

      // 출력 상자의 좌우 끝을 짚는 안내선. 마지막 걸음에서만 나타난다.
      for (const x of [BOX_X, BOX_X + BOX_W]) {
        const line = el('line', {
          x1: x,
          y1: ROW_Y0 - 8,
          x2: x,
          y2: ROW_Y0 + rows.length * ROW_PITCH - 6,
          stroke: HOT,
          'stroke-width': 1,
          'stroke-dasharray': '3 3',
        });
        line.style.opacity = '0';
        line.style.transition = 'opacity 220ms ease-out';
        guidesGroup.appendChild(line);
        guides.push(line);
      }
    }

    function hideAll(): void {
      for (const r of rowNodes) {
        r.input.style.opacity = '0';
        r.bytes.style.opacity = '0';
        r.arrow.style.opacity = '0';
        r.box.setAttribute('stroke', 'none');
        r.outRow.style.opacity = '0';
      }
      for (const g of guides) g.style.opacity = '0';
      uniformLabel.textContent = '';
    }

    return {
      destroy() {
        clearTimers();
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },

      reset() {
        clearTimers();
        captionEvent.textContent = '';
        hideAll();
      },

      init(p: InitPayload, emptyLabel: string) {
        clearTimers();
        buildRows(p.rows, emptyLabel);
        captionEvent.textContent = '';
        uniformLabel.textContent = '';
      },

      setBaseCaption(value: string) {
        captionBase.textContent = value;
      },

      setCaption(value: string) {
        captionEvent.textContent = value;
      },

      setHeaders(inLabel: string, outLabel: string) {
        headerIn.textContent = inLabel;
        headerOut.textContent = outLabel;
      },

      setNote(value: string) {
        note.textContent = value;
      },

      /** 길이가 다름을 먼저 보인다 — 마지막 행은 잘려 나간다. */
      revealInputs() {
        rowNodes.forEach((r, i) => {
          later(() => {
            r.input.style.opacity = '1';
            r.bytes.style.opacity = '1';
          }, i * ROW_STEP_MS);
        });
      },

      /** 네 줄이 동시에 접힌다. 출발 폭은 제각각인데 도착 폭이 하나로 모인다. */
      revealOutputs() {
        rowNodes.forEach((r, i) => {
          r.arrow.style.opacity = '1';
          foldToBox(i, r.srcW, i * ROW_STEP_MS, () => {
            r.outRow.style.opacity = '1';
          });
        });
      },

      /** 상자 좌우 끝을 안내선으로 짚는다 — 넷이 같은 자리에서 시작하고 끝난다. */
      markUniform(label: string) {
        for (const g of guides) g.style.opacity = '1';
        for (const r of rowNodes) r.box.setAttribute('stroke', HOT);
        uniformLabel.textContent = label;
      },
    };
  },
};
