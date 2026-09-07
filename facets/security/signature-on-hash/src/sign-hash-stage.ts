/**
 * sign-hash-stage View — 해시에 서명하기 단일 캔버스.
 *
 * 세로로 내려오는 세 마디다. 문서 막대는 화면 폭을 넘어 잘리고, 해시는 점만
 * 하고, 서명은 그보다 조금 크다. 비율 자체가 논증이라 막대 길이를 눈속임하지
 * 않는다 — 32바이트를 억지로 키우면 "작다" 는 말이 사라진다.
 *
 * 다만 32와 64를 구분할 수는 있어야 해서, 작은 두 막대에만 최소 폭을 준다.
 * 그 사실은 각주가 밝힌다.
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 문서 — palette.textMuted
 *   - 해시 — palette.primary
 *   - 서명 — palette.accent (사건 강조)
 */

import type { View, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 620;
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

export const signHashStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    const palette = getColors(params.theme);
    const DOC = palette.textMuted;
    const DIGEST = palette.primary;
    const SIG = palette.accent;

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img' });
    svg.style.maxWidth = `${W}px`;
    svg.style.display = 'block';
    svg.style.margin = '0 auto';
    container.appendChild(svg);

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
    svg.append(captionBase, captionEvent, arrowsGroup, rowsGroup, note);

    type Row = { group: SVGGElement; bar: SVGRectElement; size: SVGTextElement };
    let rows: Row[] = [];
    let arrows: SVGGElement[] = [];

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
      return { group, bar, size: sizeText };
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
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },

      reset() {
        captionEvent.textContent = '';
        for (const r of rows) r.group.style.opacity = '0';
        for (const a of arrows) a.style.opacity = '0';
      },

      init(
        p: InitPayload,
        labels: { document: string; digest: string; signature: string; bytes: (n: number) => string },
      ) {
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

      hashIt() {
        const a = arrows[0];
        const r = rows[1];
        if (a) a.style.opacity = '1';
        if (r) r.group.style.opacity = '1';
      },

      signIt() {
        const a = arrows[1];
        const r = rows[2];
        if (a) a.style.opacity = '1';
        if (r) r.group.style.opacity = '1';
      },

      /** 서명 크기가 문서 크기와 무관함을 짚는다. */
      compare() {
        const r = rows[2];
        if (r) r.size.setAttribute('fill', SIG);
      },
    };
  },
};
