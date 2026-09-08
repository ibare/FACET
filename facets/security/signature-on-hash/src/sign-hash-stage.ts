/**
 * sign-hash-stage View — 해시에 서명하기 단일 캔버스.
 *
 * 이 조각의 동사는 **접힌다** 이므로, 문서 막대가 실제로 줄어들며 내려가야 한다
 * (S-piece). 막대 셋을 순서대로 나타나게 하면 "접힌다" 가 "크기 목록" 이 된다.
 *
 * 원본은 제자리에 남고 복제본이 줄어들며 내려간다 — 문서가 사라져 해시가 되는
 * 게 아니라, 문서를 재료로 해시가 새로 생기기 때문이다. 서명 단계도 같은
 * 운동이되 이번엔 늘어난다 (32B → 64B).
 *
 * 비율 자체가 논증이라 막대 길이를 눈속임하지 않는다. 다만 32와 64를 구분할
 * 수는 있어야 해서 작은 두 막대에만 최소 폭을 주고, 그 사실은 각주가 밝힌다.
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 문서 — palette.textMuted
 *   - 해시 — palette.primary
 *   - 서명 — palette.accent (사건 강조)
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 250;

const BAR_X = 150;
const BAR_MAX_W = 430;
const BAR_H = 20;
const LABEL_X = 138;

const ROW_Y = [74, 132, 190];

const CAPTION_BASE_Y = 16;
const CAPTION_EVENT_Y = 34;
const NOTE_Y = 236;

/** 작은 두 막대의 최소 폭. 32B 와 64B 를 구분하려면 0px 로 둘 수 없다. */
const MIN_BAR_W = 6;

/** 막대 하나가 다음 마디로 접혀 내려가는 시간 (ms). */
const FOLD_MS = 520;

type InitPayload = {
  hashLabel: string;
  signatureLabel: string;
  documentBytes: number;
  digestBytes: number;
  signatureBytes: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const signHashStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const palette = getColors(params.theme);
    const DOC = palette.textMuted;
    const DIGEST = palette.primary;
    const SIG = palette.accent;

    const svg = params.canvas;

    function text(
      x: number,
      y: number,
      opts: { anchor?: string; fill?: string; size?: string; family?: string; weight?: string } = {},
    ): SVGTextElement {
      return el('text', {
        x,
        y,
        'text-anchor': opts.anchor ?? 'start',
        fill: opts.fill ?? palette.text,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.sm,
        ...(opts.weight ? { 'font-weight': opts.weight } : {}),
      });
    }

    const captionBase = text(W / 2, CAPTION_BASE_Y, { anchor: 'middle' });
    const captionEvent = text(W / 2, CAPTION_EVENT_Y, {
      anchor: 'middle',
      fill: SIG,
      weight: '600',
    });
    const note = text(W / 2, NOTE_Y, {
      anchor: 'middle',
      fill: palette.textMuted,
      size: fontSizes.xs,
    });
    const rowsGroup = el('g');
    const arrowsGroup = el('g');
    /** 접혀 내려가는 중인 복제본들. reset 때 통째로 비운다. */
    const foldingGroup = el('g');
    svg.append(captionBase, captionEvent, arrowsGroup, rowsGroup, foldingGroup, note);

    type Row = { group: SVGGElement; bar: SVGRectElement; size: SVGTextElement; width: number; color: string };
    let rows: Row[] = [];
    let arrows: SVGGElement[] = [];

    const timers = new Set<ReturnType<typeof setTimeout>>();
    function later(fn: () => void, ms: number): void {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    }
    function clearFolding(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      foldingGroup.textContent = '';
    }

    /**
     * 한 마디를 복제해 다음 마디 자리로 접어 내린다.
     *
     * 왼쪽 끝을 고정한 채 가로로만 줄여야 "접힌다" 로 읽힌다. 원본은 남고
     * 복제본만 움직인다 — 위가 사라져 아래가 되는 게 아니라 위를 재료로
     * 아래가 생기기 때문이다.
     */
    function fold(from: number, to: number, onArrive: () => void): void {
      const src = rows[from];
      const dst = rows[to];
      if (!src || !dst) return;
      const yFrom = ROW_Y[from] ?? 0;
      const yTo = ROW_Y[to] ?? 0;
      const ghost = el('rect', {
        x: BAR_X,
        y: yFrom,
        width: src.width,
        height: BAR_H,
        rx: 3,
        fill: src.color,
      });
      ghost.style.transformOrigin = `${BAR_X}px ${yFrom}px`;
      ghost.style.transition = `transform ${FOLD_MS}ms ease-in-out, fill ${FOLD_MS}ms ease-in-out`;
      foldingGroup.appendChild(ghost);
      later(() => {
        ghost.style.transform = `translate(0px, ${yTo - yFrom}px) scaleX(${dst.width / src.width})`;
        ghost.setAttribute('fill', dst.color);
      }, 16);
      later(() => {
        ghost.remove();
        onArrive();
      }, FOLD_MS + 16);
    }

    function buildRow(i: number, label: string, width: number, color: string, size: string): Row {
      const y = ROW_Y[i] ?? 0;
      const group = el('g');
      const lab = text(LABEL_X, y + 14, {
        anchor: 'end',
        fill: palette.textMuted,
        size: fontSizes.xs,
      });
      lab.textContent = label;
      const bar = el('rect', {
        x: BAR_X,
        y,
        width,
        height: BAR_H,
        rx: 3,
        fill: color,
      });
      const sizeText = text(BAR_X + width + 10, y + 14, {
        family: fonts.mono,
        size: fontSizes.xs,
        fill: palette.text,
      });
      sizeText.textContent = size;
      group.append(lab, bar, sizeText);
      group.style.opacity = '0';
      group.style.transition = 'opacity 240ms ease-out';
      rowsGroup.appendChild(group);
      return { group, bar, size: sizeText, width, color };
    }

    function buildArrow(i: number, label: string): SVGGElement {
      const yTop = (ROW_Y[i] ?? 0) + BAR_H;
      const yBottom = ROW_Y[i + 1] ?? 0;
      const g = el('g');
      const line = el('line', {
        x1: BAR_X + 10,
        y1: yTop + 4,
        x2: BAR_X + 10,
        y2: yBottom - 4,
        stroke: palette.border,
        'stroke-width': 1.4,
      });
      const lab = text(BAR_X + 22, (yTop + yBottom) / 2 + 4, {
        fill: palette.textMuted,
        size: fontSizes.xs,
      });
      lab.textContent = label;
      g.append(line, lab);
      g.style.opacity = '0';
      g.style.transition = 'opacity 240ms ease-out';
      arrowsGroup.appendChild(g);
      return g;
    }

    function build(p: InitPayload, labels: { document: string; digest: string; signature: string; bytes: (n: number) => string }): void {
      rowsGroup.textContent = '';
      arrowsGroup.textContent = '';

      // 문서 막대는 화면 폭을 넘어간다 — 잘림이 곧 "얼마든지 커진다" 는 표시다.
      const docW = BAR_MAX_W;
      const scale = BAR_MAX_W / p.documentBytes;
      const digestW = Math.max(MIN_BAR_W, p.digestBytes * scale);
      const sigW = Math.max(MIN_BAR_W * 2, p.signatureBytes * scale);

      rows = [
        buildRow(0, labels.document, docW, DOC, labels.bytes(p.documentBytes)),
        buildRow(1, labels.digest, digestW, DIGEST, labels.bytes(p.digestBytes)),
        buildRow(2, labels.signature, sigW, SIG, labels.bytes(p.signatureBytes)),
      ];
      arrows = [buildArrow(0, p.hashLabel), buildArrow(1, p.signatureLabel)];
    }

    return {
      destroy() {
        clearFolding();
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },

      reset() {
        clearFolding();
        captionEvent.textContent = '';
        for (const r of rows) r.group.style.opacity = '0';
        for (const a of arrows) a.style.opacity = '0';
      },

      init(
        p: InitPayload,
        labels: { document: string; digest: string; signature: string; bytes: (n: number) => string },
      ) {
        clearFolding();
        build(p, labels);
        captionEvent.textContent = '';
      },

      setBaseCaption(value: string) {
        captionBase.textContent = value;
      },

      setCaption(value: string) {
        captionEvent.textContent = value;
      },

      setNote(value: string) {
        note.textContent = value;
      },

      showDocument() {
        const r = rows[0];
        if (r) r.group.style.opacity = '1';
      },

      /** 문서가 접혀 해시가 된다. */
      hashIt() {
        const a = arrows[0];
        if (a) a.style.opacity = '1';
        fold(0, 1, () => {
          const r = rows[1];
          if (r) r.group.style.opacity = '1';
        });
      },

      /** 해시가 서명이 된다. 같은 운동이되 이번엔 늘어난다. */
      signIt() {
        const a = arrows[1];
        if (a) a.style.opacity = '1';
        fold(1, 2, () => {
          const r = rows[2];
          if (r) r.group.style.opacity = '1';
        });
      },

      /** 서명 크기가 문서 크기와 무관함을 짚는다. */
      compare() {
        const r = rows[2];
        if (r) r.size.setAttribute('fill', SIG);
      },
    };
  },
};
