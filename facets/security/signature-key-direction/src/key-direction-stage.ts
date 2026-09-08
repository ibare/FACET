/**
 * key-direction-stage View — 키 방향의 역전 단일 캔버스.
 *
 * 두 흐름을 위아래로 나란히 둔다. 각 흐름은 왼쪽에서 오른쪽으로 세 마디다 —
 * 누가 손대는가 / 어느 키를 쓰는가 / 무엇이 되는가.
 *
 * 두 행의 키 칸이 세로로 정렬되어 있어야 교차가 보인다. 그래서 열 좌표를 두
 * 행이 공유하고, 마지막 걸음에서 X 자 연결선이 그 사이를 잇는다.
 *
 * 자물쇠와 열쇠는 RSA facet 과 같은 어휘를 쓴다 — 공개키는 자물쇠, 개인키는
 * 열쇠. 코드를 공유하지는 않지만 (facet 패키지끼리 import 금지) 어휘가 어긋나면
 * 두 화면을 이어 읽는 학습자가 다른 것으로 읽는다.
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 공개키(자물쇠) — categorical(8, 'vivid')[3] 청록
 *   - 개인키(열쇠) — categorical(8, 'vivid')[6] 자주
 *   - 교차선과 "한 사람" 표시 — palette.accent
 */

import type { CanvasView, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, categorical, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 244;

// ── 열 (두 행이 공유한다 — 그래야 교차가 세로로 보인다) ─────────────────
const WHO_X = 92;
const KEY_X = 250;
const RESULT_X = 400;
const WHO2_X = 540;

// ── 행 ──────────────────────────────────────────────────────────────────
const ROW_Y = [98, 172];
const ROW_LABEL_X = 20;

const CAPTION_BASE_Y = 16;
const CAPTION_EVENT_Y = 34;
const NOTE_Y = 232;

type Labels = {
  encryption: string;
  signature: string;
  anyone: string;
  ownerOnly: string;
  publicKey: string;
  privateKey: string;
  sealed: string;
  signed: string;
  reads: string;
  verifies: string;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const keyDirectionStageView: CanvasView = {
  canvas: { height: H },
  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance {
    const palette = getColors(params.theme);
    const cat = categorical(8, 'vivid');
    const LOCK = cat[3] ?? palette.primary;
    const KEY = cat[6] ?? palette.accent;
    const HOT = palette.accent;

    const svg = params.canvas;

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
    const note = text(W / 2, NOTE_Y, { fill: palette.textMuted, size: fontSizes.xs });
    const rowsGroup = el('g');
    const crossGroup = el('g');
    svg.append(captionBase, captionEvent, rowsGroup, crossGroup, note);

    type Row = {
      group: SVGGElement;
      keyBox: SVGRectElement;
      whoStart: SVGTextElement;
      whoEnd: SVGTextElement;
    };
    let rows: Row[] = [];
    let crossLines: SVGLineElement[] = [];

    /** 흐름 한 줄. 열 좌표는 두 행이 공유한다. */
    function buildRow(
      i: number,
      rowLabel: string,
      who: string,
      keyLabel: string,
      keyColor: string,
      result: string,
      who2: string,
    ): Row {
      const y = ROW_Y[i] ?? 0;
      const group = el('g');

      const lab = text(ROW_LABEL_X, y, {
        anchor: 'start',
        fill: palette.textMuted,
        size: fontSizes.xs,
      });
      lab.textContent = rowLabel;

      const whoStart = text(WHO_X, y, { size: fontSizes.sm });
      whoStart.textContent = who;
      whoStart.style.transition = 'fill 200ms ease-out';

      const arrow1 = text((WHO_X + KEY_X) / 2, y, { fill: palette.textMuted });
      arrow1.textContent = '──▶';

      const keyBox = el('rect', {
        x: KEY_X - 58,
        y: y - 15,
        width: 116,
        height: 22,
        rx: 4,
        fill: 'none',
        stroke: keyColor,
        'stroke-width': 1.6,
      });
      const key = text(KEY_X, y, { fill: keyColor, size: fontSizes.xs, weight: '600' });
      key.textContent = keyLabel;

      const arrow2 = text((KEY_X + RESULT_X) / 2 + 22, y, { fill: palette.textMuted });
      arrow2.textContent = '──▶';

      const res = text(RESULT_X, y, { family: fonts.mono, size: fontSizes.xs });
      res.textContent = result;

      const arrow3 = text((RESULT_X + WHO2_X) / 2, y, { fill: palette.textMuted });
      arrow3.textContent = '──▶';

      const whoEnd = text(WHO2_X, y, { size: fontSizes.sm });
      whoEnd.textContent = who2;
      whoEnd.style.transition = 'fill 200ms ease-out';

      group.append(lab, whoStart, arrow1, keyBox, key, arrow2, res, arrow3, whoEnd);
      group.style.opacity = '0';
      group.style.transition = 'opacity 240ms ease-out';
      rowsGroup.appendChild(group);
      return { group, keyBox, whoStart, whoEnd };
    }

    function build(labels: Labels): void {
      rowsGroup.textContent = '';
      crossGroup.textContent = '';
      crossLines = [];

      rows = [
        buildRow(0, labels.encryption, labels.anyone, labels.publicKey, LOCK, labels.sealed, labels.ownerOnly),
        buildRow(1, labels.signature, labels.ownerOnly, labels.privateKey, KEY, labels.signed, labels.anyone),
      ];

      // 두 행의 키 칸을 잇는 X 자. 교차 자체가 이 조각의 주장이다.
      const y0 = (ROW_Y[0] ?? 0) + 10;
      const y1 = (ROW_Y[1] ?? 0) - 18;
      for (const [x1, x2] of [
        [KEY_X - 44, KEY_X + 44],
        [KEY_X + 44, KEY_X - 44],
      ]) {
        const line = el('line', {
          x1,
          y1: y0,
          x2,
          y2: y1,
          stroke: HOT,
          'stroke-width': 1.2,
          'stroke-dasharray': '3 3',
        });
        line.style.opacity = '0';
        line.style.transition = 'opacity 240ms ease-out';
        crossGroup.appendChild(line);
        crossLines.push(line);
      }
    }

    return {
      destroy() {
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },

      reset() {
        captionEvent.textContent = '';
        for (const r of rows) {
          r.group.style.opacity = '0';
          r.whoStart.setAttribute('fill', palette.text);
          r.whoEnd.setAttribute('fill', palette.text);
        }
        for (const l of crossLines) l.style.opacity = '0';
      },

      init(labels: Labels) {
        build(labels);
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

      showEncryption() {
        const r = rows[0];
        if (r) r.group.style.opacity = '1';
      },

      showSignature() {
        const r = rows[1];
        if (r) r.group.style.opacity = '1';
      },

      /** 키가 교차했음을 잇는다. */
      markKeys() {
        for (const l of crossLines) l.style.opacity = '1';
      },

      /**
       * "한 사람" 이 어느 쪽에 서 있는지 물들인다.
       *
       * 암호화는 끝에, 서명은 앞에 있다 — 줄이려는 대상이 읽는 사람이냐
       * 만드는 사람이냐의 차이가 여기서 드러난다.
       */
      markWho() {
        rows[0]?.whoEnd.setAttribute('fill', HOT);
        rows[1]?.whoStart.setAttribute('fill', HOT);
      },
    };
  },
};
