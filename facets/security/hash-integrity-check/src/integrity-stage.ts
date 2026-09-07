/**
 * integrity-stage View — 무결성 대조 단일 캔버스.
 *
 * 이 조각이 말하는 것은 대조 절차가 아니라 **경로가 둘이라는 사실**이다. 그래서
 * 화면의 골격도 표가 아니라 원본에서 갈라져 나오는 두 선이다. 위는 파일이 오는
 * 아무 경로, 아래는 해시가 오는 믿는 경로다.
 *
 * 동사는 갈라진다 · 건너온다 · 만난다 이므로, 파일과 해시가 실제로 화면을
 * 가로질러 이동한다 (S-piece). 손대는 일도 도중에 일어난다 — 도착한 뒤에 값이
 * 바뀌면 "오는 길에 당했다" 가 아니라 "받고 나서 달라졌다" 로 읽힌다.
 *
 * 해시 경로만 손대지 못하는 것이 논증의 전부라, 파일이 변조될 때 아래 선은
 * 아무 일도 일어나지 않아야 한다.
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 일치 — palette.success
 *   - 불일치 / 손댄 자리 — palette.danger
 *   - 믿는 경로 — palette.primary
 *   - 아무 경로 — palette.border
 */

import type { View, ViewInstance, ViewMountParams } from '@ffacet/core/runtime';
import { getColors, fonts, fontSizes, PIECE_CANVAS_W } from '@ffacet/core/runtime';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
const H = 268;

// ── 두 끝점 ─────────────────────────────────────────────────────────────
const ORIGIN_X = 56;
const TARGET_X = W - 56;

// ── 두 경로 ─────────────────────────────────────────────────────────────
const FILE_Y = 96;
const HASH_Y = 168;
/** 손대는 자리. 경로 한가운데여야 "오는 길에" 로 읽힌다. */
const TAMPER_X = (ORIGIN_X + TARGET_X) / 2;

const TOKEN_W = 92;
const TOKEN_H = 22;

const CAPTION_BASE_Y = 16;
const CAPTION_EVENT_Y = 34;
const ORIGIN_LABEL_Y = 60;
const VERDICT_Y = 218;
const NOTE_Y = 252;

/** 토큰 하나가 경로를 건너는 시간 (ms). */
const TRAVEL_MS = 620;

/** 해시는 앞 10자만 인쇄한다. 같은지 다른지만 보면 되는 자리다. */
const HEX_HEAD = 10;

type Item = { content: string; hash: string };
type InitPayload = {
  referenceHash: string;
  intact: Item;
  tampered: Item;
  diffIndex: number;
};
type Labels = {
  origin: string;
  target: string;
  filePath: string;
  hashPath: string;
  file: string;
  hash: string;
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
    const TRUSTED = palette.primary;

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
        'text-anchor': opts.anchor ?? 'middle',
        fill: opts.fill ?? palette.text,
        'font-family': opts.family ?? fonts.body,
        'font-size': opts.size ?? fontSizes.xs,
        ...(opts.weight ? { 'font-weight': opts.weight } : {}),
      });
    }

    const captionBase = text(W / 2, CAPTION_BASE_Y, { size: fontSizes.sm });
    const captionEvent = text(W / 2, CAPTION_EVENT_Y, {
      fill: palette.accent,
      size: fontSizes.sm,
      weight: '600',
    });
    const note = text(W / 2, NOTE_Y, { fill: palette.textMuted });

    // ── 두 끝점과 두 경로 ───────────────────────────────────────────────
    const originLabel = text(ORIGIN_X, ORIGIN_LABEL_Y, { fill: palette.textMuted });
    const targetLabel = text(TARGET_X, ORIGIN_LABEL_Y, { fill: palette.textMuted });

    function pathLine(y: number, stroke: string, dashed: boolean): SVGLineElement {
      const line = el('line', {
        x1: ORIGIN_X,
        y1: y,
        x2: TARGET_X,
        y2: y,
        stroke,
        'stroke-width': 1.4,
        ...(dashed ? { 'stroke-dasharray': '4 4' } : {}),
      });
      line.style.opacity = '0';
      line.style.transition = 'opacity 240ms ease-out';
      return line;
    }
    const filePath = pathLine(FILE_Y, palette.border, true);
    const hashPath = pathLine(HASH_Y, TRUSTED, false);

    const filePathLabel = text(ORIGIN_X + 74, FILE_Y - 10, {
      anchor: 'start',
      fill: palette.textMuted,
    });
    const hashPathLabel = text(ORIGIN_X + 74, HASH_Y - 10, {
      anchor: 'start',
      fill: TRUSTED,
    });
    for (const n of [filePathLabel, hashPathLabel]) {
      n.style.opacity = '0';
      n.style.transition = 'opacity 240ms ease-out';
    }

    // ── 손대는 자리 ─────────────────────────────────────────────────────
    const tamperMark = text(TAMPER_X, FILE_Y - 16, { fill: BAD, weight: '700' });
    tamperMark.textContent = '✂';
    tamperMark.style.opacity = '0';
    tamperMark.style.transition = 'opacity 200ms ease-out';

    // ── 도착 지점의 대조 ────────────────────────────────────────────────
    const verdictHashes = text(W / 2, VERDICT_Y, {
      family: fonts.mono,
      fill: palette.textMuted,
    });
    const verdictMark = text(W / 2, VERDICT_Y + 22, {
      family: fonts.mono,
      size: fontSizes.lg,
      weight: '700',
    });

    const travelGroup = el('g');
    svg.append(
      captionBase,
      captionEvent,
      filePath,
      hashPath,
      filePathLabel,
      hashPathLabel,
      originLabel,
      targetLabel,
      tamperMark,
      travelGroup,
      verdictHashes,
      verdictMark,
      note,
    );

    let snapshot: InitPayload | null = null;
    let labels: Labels | null = null;
    /**
     * 도착해 자리를 지키는 파일 토큰. 손댄 뒤 다시 보낼 때 갈아 끼운다.
     *
     * 해시 토큰은 잡아 두지 않는다 — 도착한 뒤 아무도 손대지 못하는 것이
     * 이 조각의 논증이라, 코드에서도 다시 건드릴 일이 없다.
     */
    let arrivedFile: SVGGElement | null = null;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    function later(fn: () => void, ms: number): void {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    }
    function clearTravel(): void {
      for (const id of timers) clearTimeout(id);
      timers.clear();
      travelGroup.textContent = '';
      arrivedFile = null;
    }

    /** 경로 위를 건너는 토큰 하나. 상자와 글자를 묶은 그룹으로 만든다. */
    function makeToken(y: number, label: string, color: string): SVGGElement {
      const g = el('g');
      const box = el('rect', {
        x: ORIGIN_X - TOKEN_W / 2,
        y: y - TOKEN_H / 2,
        width: TOKEN_W,
        height: TOKEN_H,
        rx: 4,
        fill: palette.bg,
        stroke: color,
        'stroke-width': 1.4,
      });
      const t = text(ORIGIN_X, y + 4, { family: fonts.mono, fill: palette.text });
      t.textContent = label;
      g.append(box, t);
      g.style.transition = `transform ${TRAVEL_MS}ms ease-in-out`;
      travelGroup.appendChild(g);
      return g;
    }

    /**
     * 토큰을 원본에서 받는 쪽까지 보낸다.
     *
     * `onMidway` 는 경로 한가운데에서 불린다 — 손대는 일이 도중에 일어나야
     * "오는 길에 당했다" 로 읽히기 때문이다.
     */
    function travel(
      token: SVGGElement,
      delayMs: number,
      onArrive: () => void,
      onMidway?: () => void,
    ): void {
      later(() => {
        token.style.transform = `translate(${TARGET_X - ORIGIN_X}px, 0px)`;
      }, delayMs + 16);
      if (onMidway) later(onMidway, delayMs + TRAVEL_MS / 2);
      later(onArrive, delayMs + TRAVEL_MS + 16);
    }

    /** 도착한 토큰의 글자를 갈아 끼운다 (손댄 뒤의 내용). */
    function retitle(token: SVGGElement | null, label: string, color: string): void {
      if (!token) return;
      const t = token.childNodes[1];
      const box = token.childNodes[0];
      if (t instanceof SVGTextElement) {
        t.textContent = label;
        t.setAttribute('fill', color);
      }
      if (box instanceof SVGRectElement) box.setAttribute('stroke', color);
    }

    function showVerdict(left: string, right: string, mark: string, color: string): void {
      verdictHashes.textContent = `${left.slice(0, HEX_HEAD)}…   ${right.slice(0, HEX_HEAD)}…`;
      verdictHashes.setAttribute('fill', color);
      verdictMark.textContent = mark;
      verdictMark.setAttribute('fill', color);
    }

    return {
      destroy() {
        clearTravel();
        if (svg.parentNode) svg.parentNode.removeChild(svg);
      },

      reset() {
        clearTravel();
        captionEvent.textContent = '';
        verdictHashes.textContent = '';
        verdictMark.textContent = '';
        tamperMark.style.opacity = '0';
        for (const n of [filePath, hashPath, filePathLabel, hashPathLabel]) {
          n.style.opacity = '0';
        }
      },

      init(p: InitPayload, l: Labels) {
        clearTravel();
        snapshot = p;
        labels = l;
        originLabel.textContent = l.origin;
        targetLabel.textContent = l.target;
        filePathLabel.textContent = l.filePath;
        hashPathLabel.textContent = l.hashPath;
        verdictHashes.textContent = '';
        verdictMark.textContent = '';
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

      /** 원본에서 두 경로가 갈라진다. 갈라짐 자체가 이 조각의 전제다. */
      splitPaths() {
        for (const n of [filePath, hashPath, filePathLabel, hashPathLabel]) {
          n.style.opacity = '1';
        }
      },

      /** 둘 다 건너와 만난다. 대조가 맞는다. */
      deliver(mark: string) {
        const snap = snapshot;
        const l = labels;
        if (!snap || !l) return;
        const fileToken = makeToken(FILE_Y, `${l.file}  ${snap.intact.content}`, palette.border);
        const hashToken = makeToken(HASH_Y, `${l.hash}  ${snap.referenceHash.slice(0, 8)}…`, TRUSTED);
        arrivedFile = fileToken;
        travel(fileToken, 0, () => {
          travel(hashToken, 0, () => {
            showVerdict(snap.intact.hash, snap.referenceHash, mark, OK);
          });
        });
      },

      /**
       * 파일만 다시 오는데 도중에 손댄다.
       *
       * 아래 해시 경로는 아무 일도 일어나지 않는다 — 그 정지가 논증이다.
       */
      tamper(markLabel: string) {
        const snap = snapshot;
        const l = labels;
        if (!snap || !l) return;
        verdictHashes.textContent = '';
        verdictMark.textContent = '';
        if (arrivedFile) arrivedFile.remove();
        const fileToken = makeToken(FILE_Y, `${l.file}  ${snap.intact.content}`, palette.border);
        arrivedFile = fileToken;
        travel(
          fileToken,
          0,
          () => {
            /* 도착만 하고 판정은 다음 걸음이 한다 */
          },
          () => {
            tamperMark.style.opacity = '1';
            tamperMark.textContent = markLabel;
            retitle(fileToken, `${l.file}  ${snap.tampered.content}`, BAD);
          },
        );
      },

      /** 대조가 어긋난다. 해시는 다른 경로라 손댈 수 없었다. */
      detect(mark: string) {
        const snap = snapshot;
        if (!snap) return;
        showVerdict(snap.tampered.hash, snap.referenceHash, mark, BAD);
      },
    };
  },
};
