/**
 * integrity-stage View — 무결성 대조 단일 캔버스.
 *
 * 위에 기준 해시 한 줄을 두고, 아래 두 행이 각각 그것과 견준다. 판정 표시(✓/✗)가
 * 화면의 주인공이다 — 이 조각이 말하는 것은 해시가 어떻게 생겼는지가 아니라
 * 대조가 어떻게 끝나는지이기 때문이다.
 *
 * 기준선을 세로 점선으로 내려 두 해시가 같은 자리에서 견줘짐을 표시한다.
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 일치 — palette.success
 *   - 불일치 / 바뀐 글자 — palette.danger
 *   - 기준 해시 — palette.text
 *   - 나머지 hex — palette.textMuted
 */

import type { View, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 620;
const H = 262;

const LABEL_X = 20;
const HASH_X = 150;
const VERDICT_X = 560;

const REF_Y = 74;
const RULE_Y = 96;
const ROW_Y0 = 128;
const ROW_PITCH = 56;

const CAPTION_BASE_Y = 16;
const CAPTION_EVENT_Y = 34;
const NOTE_Y = 250;

/** hex 앞머리만 인쇄한다. 전체는 화면에 들어가지 않고 요점도 아니다. */
const HEX_HEAD = 30;

type Item = { content: string; hash: string };
type InitPayload = {
  referenceHash: string;
  intact: Item;
  tampered: Item;
  diffIndex: number;
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const integrityStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    const palette = getColors(params.theme);
    const OK = palette.success;
    const BAD = palette.danger;

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
      fill: palette.accent,
      weight: '600',
    });
    const refLabel = text(LABEL_X, REF_Y, { fill: palette.textMuted, size: fontSizes.xs });
    const refHash = text(HASH_X, REF_Y, { family: fonts.mono, size: fontSizes.xs });
    const rule = el('line', {
      x1: LABEL_X,
      y1: RULE_Y,
      x2: W - LABEL_X,
      y2: RULE_Y,
      stroke: palette.border,
      'stroke-width': 1,
    });
    const note = text(W / 2, NOTE_Y, {
      anchor: 'middle',
      fill: palette.textMuted,
      size: fontSizes.xs,
    });
    const rowsGroup = el('g');
    svg.append(captionBase, captionEvent, refLabel, refHash, rule, rowsGroup, note);
    refLabel.style.opacity = '0';
    refHash.style.opacity = '0';
    rule.style.opacity = '0';

    type Row = {
      group: SVGGElement;
      label: SVGTextElement;
      content: SVGTextElement;
      hash: SVGTextElement;
      verdict: SVGTextElement;
    };
    let rows: Row[] = [];
    let snapshot: InitPayload | null = null;

    function buildRow(i: number, label: string, item: Item): Row {
      const y = ROW_Y0 + i * ROW_PITCH;
      const group = el('g');
      const lab = text(LABEL_X, y, { fill: palette.textMuted, size: fontSizes.xs });
      lab.textContent = label;
      const content = text(LABEL_X, y + 18, { family: fonts.mono, size: fontSizes.sm });
      content.textContent = item.content;
      const hash = text(HASH_X + 100, y + 18, {
        family: fonts.mono,
        size: fontSizes.xs,
        fill: palette.textMuted,
      });
      hash.textContent = `${item.hash.slice(0, HEX_HEAD)}…`;
      const verdict = text(VERDICT_X, y + 18, {
        anchor: 'middle',
        family: fonts.mono,
        size: fontSizes.lg,
        weight: '700',
      });
      group.append(lab, content, hash, verdict);
      group.style.opacity = '0';
      group.style.transition = 'opacity 220ms ease-out';
      rowsGroup.appendChild(group);
      return { group, label: lab, content, hash, verdict };
    }

    /** 바뀐 글자만 물들인다 — 어디가 손댔는지 화면이 짚어야 한다. */
    function paintDiffChar(node: SVGTextElement, value: string, idx: number): void {
      node.textContent = '';
      [...value].forEach((ch, i) => {
        const span = el('tspan', {
          fill: i === idx ? BAD : palette.text,
          'font-weight': i === idx ? '700' : '400',
        });
        span.textContent = ch;
        node.appendChild(span);
      });
    }

    return {
      destroy() {
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },

      reset() {
        captionEvent.textContent = '';
        refLabel.style.opacity = '0';
        refHash.style.opacity = '0';
        rule.style.opacity = '0';
        for (const r of rows) {
          r.group.style.opacity = '0';
          r.verdict.textContent = '';
          r.hash.setAttribute('fill', palette.textMuted);
        }
        const tamperedRow = rows[1];
        if (snapshot && tamperedRow) {
          paintDiffChar(tamperedRow.content, snapshot.tampered.content, -1);
        }
      },

      init(p: InitPayload, labels: { intact: string; tampered: string }) {
        snapshot = p;
        rowsGroup.textContent = '';
        rows = [buildRow(0, labels.intact, p.intact), buildRow(1, labels.tampered, p.tampered)];
        refHash.textContent = `${p.referenceHash.slice(0, HEX_HEAD)}…`;
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

      revealReference(label: string) {
        refLabel.textContent = label;
        refLabel.style.opacity = '1';
        refHash.style.opacity = '1';
        rule.style.opacity = '1';
      },

      /** 온전한 것 — 기준과 한 글자도 다르지 않다. */
      checkIntact(mark: string) {
        const r = rows[0];
        if (!r) return;
        r.group.style.opacity = '1';
        r.verdict.textContent = mark;
        r.verdict.setAttribute('fill', OK);
        r.hash.setAttribute('fill', OK);
      },

      /** 손댄 것 — 알아볼 수 없을 만큼 달라졌다. */
      checkTampered(mark: string) {
        const r = rows[1];
        if (!r) return;
        r.group.style.opacity = '1';
        r.verdict.textContent = mark;
        r.verdict.setAttribute('fill', BAD);
        r.hash.setAttribute('fill', BAD);
      },

      /** 내용에서 바뀐 글자를 짚는다. 해시의 차이는 이미 보였으므로 원인 쪽이다. */
      markDifference() {
        if (!snapshot || !rows[1]) return;
        paintDiffChar(rows[1].content, snapshot.tampered.content, snapshot.diffIndex);
      },
    };
  },
};
