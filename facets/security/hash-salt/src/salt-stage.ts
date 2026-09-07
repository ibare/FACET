/**
 * salt-stage View — 소금 치기 단일 캔버스.
 *
 * 표 한 장이다. 두 행이 사람 하나씩이고, 열은 비밀번호 / 소금 / 저장되는 값.
 *
 * 주인공은 "저장되는 값" 열이다. 같은 값 둘로 시작했다가 소금이 붙는 순간
 * 눈앞에서 갈라진다. 같은 자리가 변하는 것이 이 조각의 논증이라, 소금 열을
 * 나중에 등장시키고 값 열은 처음부터 자리를 지킨다.
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 같아서 위험한 값 — palette.danger
 *   - 갈라져 안전해진 값 — palette.success
 *   - 소금 — palette.accent (사건 강조)
 *   - 비밀번호 / 이름 — palette.text
 */

import type { View, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 238;

// ── 열 좌표 ─────────────────────────────────────────────────────────────
const NAME_X = 24;
const PW_X = 110;
const SALT_X = 232;
const STORED_X = 348;

// ── 행 ──────────────────────────────────────────────────────────────────
const HEADER_Y = 72;
const ROW_Y0 = 104;
const ROW_PITCH = 40;

const CAPTION_BASE_Y = 16;
const CAPTION_EVENT_Y = 34;
const VERDICT_Y = 190;
const NOTE_Y = 224;

/** hex 앞머리만 인쇄한다. 요점은 값의 내용이 아니라 같은지 다른지다. */
const HEX_HEAD = 22;

type User = { name: string; salt: string; hash: string };
type InitPayload = {
  password: string;
  unsaltedHash: string;
  users: User[];
};

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

export const saltStageView: View = {
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance {
    const palette = getColors(params.theme);
    const SAME = palette.danger;
    const DIFFERENT = palette.success;
    const SALT = palette.accent;

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
      fill: SALT,
      weight: '600',
    });
    const note = text(W / 2, NOTE_Y, {
      anchor: 'middle',
      fill: palette.textMuted,
      size: fontSizes.xs,
    });

    const headerPw = text(PW_X, HEADER_Y, { fill: palette.textMuted, size: fontSizes.xs });
    const headerSalt = text(SALT_X, HEADER_Y, { fill: palette.textMuted, size: fontSizes.xs });
    const headerStored = text(STORED_X, HEADER_Y, { fill: palette.textMuted, size: fontSizes.xs });
    headerSalt.style.opacity = '0';
    headerSalt.style.transition = 'opacity 220ms ease-out';

    /** 두 값이 같은지 다른지를 값 열 아래에서 한 마디로 판정한다. */
    const verdict = text(STORED_X, VERDICT_Y, { family: fonts.mono, weight: '600' });

    const rowsGroup = el('g');
    svg.append(
      captionBase,
      captionEvent,
      headerPw,
      headerSalt,
      headerStored,
      rowsGroup,
      verdict,
      note,
    );

    type Row = {
      group: SVGGElement;
      name: SVGTextElement;
      pw: SVGTextElement;
      saltBox: SVGRectElement;
      salt: SVGTextElement;
      /** rect+text 를 감싼 그룹. 한 번에 나타내려고 잡아 둔다. */
      saltGroup: SVGGElement;
      stored: SVGTextElement;
    };
    let rows: Row[] = [];
    let snapshot: InitPayload | null = null;

    function buildRow(i: number, u: User, password: string): Row {
      const y = ROW_Y0 + i * ROW_PITCH;
      const group = el('g');

      const name = text(NAME_X, y, { fill: palette.textMuted, size: fontSizes.sm });
      name.textContent = u.name;

      const pw = text(PW_X, y, { family: fonts.mono, size: fontSizes.sm });
      pw.textContent = password;

      const saltBox = el('rect', {
        x: SALT_X - 6,
        y: y - 14,
        width: 76,
        height: 20,
        rx: 3,
        fill: 'none',
        stroke: SALT,
        'stroke-width': 1.2,
      });
      const salt = text(SALT_X, y, { family: fonts.mono, size: fontSizes.sm, fill: SALT });
      salt.textContent = u.salt;
      const saltGroup = el('g');
      saltGroup.append(saltBox, salt);
      saltGroup.style.opacity = '0';
      saltGroup.style.transition = 'opacity 240ms ease-out';

      const stored = text(STORED_X, y, {
        family: fonts.mono,
        size: fontSizes.xs,
        fill: palette.textMuted,
      });
      stored.style.transition = 'fill 200ms ease-out';

      group.append(name, pw, saltGroup, stored);
      group.style.opacity = '0';
      group.style.transition = 'opacity 220ms ease-out';
      rowsGroup.appendChild(group);
      return { group, name, pw, saltBox, salt, saltGroup, stored };
    }

    return {
      destroy() {
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },

      reset() {
        captionEvent.textContent = '';
        verdict.textContent = '';
        headerSalt.style.opacity = '0';
        for (const r of rows) {
          r.group.style.opacity = '0';
          r.stored.textContent = '';
          r.stored.setAttribute('fill', palette.textMuted);
          r.saltGroup.style.opacity = '0';
        }
      },

      init(p: InitPayload, headers: { password: string; salt: string; stored: string }) {
        snapshot = p;
        rowsGroup.textContent = '';
        rows = p.users.map((u, i) => buildRow(i, u, p.password));
        headerPw.textContent = headers.password;
        headerSalt.textContent = headers.salt;
        headerStored.textContent = headers.stored;
        captionEvent.textContent = '';
        verdict.textContent = '';
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

      revealUsers() {
        for (const r of rows) r.group.style.opacity = '1';
      },

      /** 소금 없이 해싱하면 저장된 값이 둘 다 같다 — 그것이 문제다. */
      hashUnsalted(verdictLabel: string) {
        if (!snapshot) return;
        for (const r of rows) {
          r.stored.textContent = `${snapshot.unsaltedHash.slice(0, HEX_HEAD)}…`;
          r.stored.setAttribute('fill', SAME);
        }
        verdict.textContent = verdictLabel;
        verdict.setAttribute('fill', SAME);
      },

      /** 소금이 붙는 순간. 이 조각의 주인공이라 값보다 먼저 보인다. */
      addSalt() {
        headerSalt.style.opacity = '1';
        for (const r of rows) r.saltGroup.style.opacity = '1';
      },

      /** 같은 자리의 값이 눈앞에서 갈라진다. */
      hashSalted(verdictLabel: string) {
        rows.forEach((r, i) => {
          const u = snapshot?.users[i];
          if (!u) return;
          r.stored.textContent = `${u.hash.slice(0, HEX_HEAD)}…`;
          r.stored.setAttribute('fill', DIFFERENT);
        });
        verdict.textContent = verdictLabel;
        verdict.setAttribute('fill', DIFFERENT);
      },
    };
  },
};
