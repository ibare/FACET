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
 * ## 장면을 받아 그린다
 *
 * 걸음마다 부르는 메서드(`splitPaths()` · `deliver()` · `tamper()` · `detect()`) 를
 * 두지 않는다. 그 메서드들은 되돌릴 수 없는 명령이라 임의의 걸음으로 가려면
 * 처음부터 다시 밟는 수밖에 없었다. 대신 `render` 하나가 장면을 받아 화면
 * **전체**를 세우고, 방금 달라진 자리만 흐르게 한다 (S-scene).
 *
 * 정적 그리기가 정본이므로 운동의 방향이 뒤집힌다 — 토큰은 이미 받는 쪽에 서 있고,
 * 흐르게 할 때만 원본 쪽으로 물려 놓고 시작한다.
 *
 * **CSS 전환(`transition`)을 쓰지 않는다 (S-scene MUST NOT).** 옛 stage 는 네 곳에서
 * 전환을 걸어 두고 한 틱 뒤에 끝 값을 대입했다 — 되짚기는 `animate:false` 로 오는데
 * 전환은 그 뒤에도 화면을 저 혼자 흘러가게 한다. 네 곳을 전부 `tween` 보간으로
 * 옮겼고, 프레임은 rAF 가 아니라 `setTimeout` 이라 headless 에서도 실제로 돈다.
 *
 * ## 장부는 쌓인다
 *
 * 옛 stage 는 손대는 걸음에서 앞 판정을 지웠다. 그래서 다 끝난 화면에 "성했을 때는
 * 맞았다" 가 없고 어긋난 줄 하나만 남아, **견줄 짝이 없어** 어긋남이 어긋남으로
 * 읽히지 않았다. 지금은 두 줄이 나란히 서고, 오른쪽의 내걸린 해시가 두 줄에서
 * **글자 하나 다르지 않은 같은 값**이라는 것이 "아래 경로는 못 건드렸다" 를 말한다.
 *
 * 채움(글자 색)은 **값의 형편** — 받은 것의 해시가 맞았나 어긋났나. 테두리는
 * **짚음의 표식** — 지금 받는 쪽에 서 있는 토큰이 어느 편인가. 두 축을 갈라 둔다.
 *
 * 색 토큰 (S-view 결정 트리):
 *   - 일치 — palette.success
 *   - 불일치 / 손댄 자리 — palette.danger
 *   - 믿는 경로 — palette.primary
 *   - 아무 경로 — palette.border
 *
 * 세로는 이 파일이 정하고 가로는 러너가 정한다 (S-piece). 색은 전부
 * design-tokens 경유이며 hex 리터럴은 없다 (S-view).
 */

import {
  PIECE_CANVAS_W,
  fonts,
  fontSizes,
  getColors,
  makeTranslator,
  type CanvasView,
  type SceneRenderer,
  type Translate,
  type ViewInstance,
  type ViewMountParams,
} from '@ffacet/core/runtime';

import type { IntegrityScene, IntegritySide } from './scene.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = PIECE_CANVAS_W;
/** 세로는 내용이 정한다 — 캡션 · 두 경로 · 장부 두 줄. */
const H = 268;

// ── 두 끝점 ─────────────────────────────────────────────────────────────
const ORIGIN_X = 56;
const TARGET_X = W - 56;
/** 토큰이 실제로 건너는 거리. */
const SPAN = TARGET_X - ORIGIN_X;

// ── 두 경로 ─────────────────────────────────────────────────────────────
const FILE_Y = 96;
const HASH_Y = 168;
/** 손대는 자리. 경로 한가운데여야 "오는 길에" 로 읽힌다. */
const TAMPER_X = (ORIGIN_X + TARGET_X) / 2;

const TOKEN_W = 92;
const TOKEN_H = 22;

const CAPTION_Y = 22;
const ORIGIN_LABEL_Y = 60;
/** 장부가 무엇의 해시를 견주고 있는지 말하는 머리. */
const LEDGER_HEAD_Y = 202;
const LEDGER_Y = 226;
const LEDGER_ROW_H = 26;

// ── 운동 길이 (ms). stepMs 의 쉼 위에 얹힌다 (S-piece 의 걸음 벽시계).
/** 경로가 갈라져 드러난다. */
const SPLIT_MS = 240;
/** 토큰 하나가 경로를 건너는 시간. */
const TRAVEL_MS = 620;
/** 가위가 드러나는 시간. 건너는 운동 안에 접혀 있다. */
const CUT_MS = 200;
/** 장부의 새 줄이 내려앉는 시간. */
const LEDGER_MS = 220;
/** 보간 프레임 간격. rAF 가 아니라 타이머라 headless 에서도 실제로 돈다. */
const FRAME_MS = 16;

/** 해시는 앞 10자만 인쇄한다. 같은지 다른지만 보면 되는 자리다. */
const HEX_HEAD = 10;
/** 잘린 해시 뒤에 붙는 표식 — 번역 대상이 아니다 (C10). */
const ELLIPSIS = '…';
/** 장부 한 줄 안의 사이 띄움. `xml:space="preserve"` 로 지켜진다. */
const GAP = '   ';

type Attrs = Record<string, string | number>;

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Attrs = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** 해시를 앞자리만 잘라 인쇄한다. */
function head(hash: string): string {
  return hash.slice(0, HEX_HEAD) + ELLIPSIS;
}

/**
 * 정적 그리기가 세운 손잡이.
 *
 * 걸음 함수는 여기서만 요소를 꺼낸다 — 화면을 되읽지도, 지난 화면의 거울을 들고
 * 다니지도 않는다 (프로토콜 4 절 ④·28).
 */
type Drawn = {
  /** 갈라짐이 드러내는 것들 — 두 선과 두 경로 이름. */
  routes: SVGElement[];
  fileToken: SVGGElement | null;
  hashToken: SVGGElement | null;
  cutMark: SVGTextElement | null;
  /** 장부 줄. 차례가 곧 판정이 내려진 차례다. */
  ledger: SVGGElement[];
};

export const integrityStageView: CanvasView = {
  canvas: { height: H },

  mount(
    _container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance & SceneRenderer<IntegrityScene> {
    const palette = getColors(params.theme);
    const OK = palette.success;
    const BAD = palette.danger;
    const TRUSTED = palette.primary;
    const ANY = palette.border;

    // 문안은 그리는 쪽이 만든다. 장면은 무엇을 말할지만 담는다 (C10).
    const t: Translate = params.t ?? makeTranslator(params.locale);

    const svg = params.canvas;
    const root = el('g');
    svg.appendChild(root);

    // ── 뒷일 정리 채널 (S-piece) ─────────────────────────────────────────
    let destroyed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const waiters = new Set<() => void>();

    /**
     * 지금 화면을 세운 `render` 의 번호 — 세대 빗장.
     *
     * 건너는 걸음은 마디가 이어진 사슬이다 (파일이 건넌다 → 해시가 건넌다 →
     * 장부가 선다). `destroy` 가 그 가운데 오면 남은 마디가 이미 떨어져 나간
     * 화면에 쓰므로, 프레임마다 자기 번호가 아직 유효한지 보고 물러난다.
     *
     * `isInstant` / `onScrubStart` 는 빗장이 아니다 — 러너가 장면 조각에서 그 둘을
     * 부르지 않는다 (S-scene).
     */
    let gen = 0;
    const alive = (mine: number): boolean => mine === gen && !destroyed;

    /**
     * 보간 한 마디.
     *
     * CSS `transition` 을 쓰지 않는다 (S-scene MUST NOT). `resolve` 를 `waiters` 에
     * 담아 두므로 `destroy` 가 타이머를 취소해도 기다리던 약속이 함께 풀린다 —
     * 콜백 안에만 두면 취소된 tick 이 아예 안 불려 약속이 영영 안 풀린다 (S-piece).
     */
    function tween(ms: number, mine: number, draw: (p: number) => void): Promise<void> {
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
          const p = ms <= 0 ? 1 : clamp01((Date.now() - started) / ms);
          draw(p);
          if (p >= 1) {
            finish();
            return;
          }
          const id = setTimeout(() => {
            timers.delete(id);
            tick();
          }, FRAME_MS);
          timers.add(id);
        };
        // 첫 마디를 곧바로 그린다 — 기다리면 그 사이에 끝 자리가 번쩍인다.
        tick();
      });
    }

    // ── 글자 ─────────────────────────────────────────────────────────────

    function text(
      x: number,
      y: number,
      opts: {
        anchor?: string;
        fill?: string;
        size?: string;
        family?: string;
        weight?: string;
      } = {},
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

    /** 글자 토막 하나. 색과 굵기를 제 몫으로 갖는다. */
    function span(value: string, attrs: Attrs = {}): SVGTSpanElement {
      const node = el('tspan', attrs);
      node.textContent = value;
      return node;
    }

    /**
     * 한 글자만 물들인 내용.
     *
     * "한 글자만 바뀌어도 해시가 통째로 갈린다" 가 이 조각의 주장이라, 바뀐 자리가
     * 어디인지 화면이 직접 말해야 한다. 옛 발신은 그 자리를 `diffIndex` 로 실어
     * 보내고도 화면이 읽지 않아, 손댄 파일이 그냥 통째로 붉어질 뿐이었다.
     */
    function marked(value: string, at: number, mark: string): SVGTSpanElement[] {
      if (at < 0 || at >= value.length) return [span(value)];
      return [
        span(value.slice(0, at)),
        span(value[at], { fill: mark, 'font-weight': 700 }),
        span(value.slice(at + 1)),
      ];
    }

    // ── 배치 ─────────────────────────────────────────────────────────────

    function rewind(): void {
      root.textContent = '';
    }

    /** 두 끝점. 바탕이 아직 없어도 서 있다. */
    function drawEnds(): void {
      const origin = text(ORIGIN_X, ORIGIN_LABEL_Y, { fill: palette.textMuted });
      origin.textContent = t('label.origin', 'origin');
      const target = text(TARGET_X, ORIGIN_LABEL_Y, { fill: palette.textMuted });
      target.textContent = t('label.target', 'you');
      root.append(origin, target);
    }

    /** 원본에서 갈라져 나온 두 선과 그 이름. */
    function drawRoutes(scene: IntegrityScene): SVGElement[] {
      if (!scene.split) return [];
      const fileLine = el('line', {
        x1: ORIGIN_X,
        y1: FILE_Y,
        x2: TARGET_X,
        y2: FILE_Y,
        stroke: ANY,
        'stroke-width': 1.4,
        'stroke-dasharray': '4 4',
      });
      const hashLine = el('line', {
        x1: ORIGIN_X,
        y1: HASH_Y,
        x2: TARGET_X,
        y2: HASH_Y,
        stroke: TRUSTED,
        'stroke-width': 1.4,
      });
      const fileName = text(ORIGIN_X + 74, FILE_Y - 10, {
        anchor: 'start',
        fill: palette.textMuted,
      });
      fileName.textContent = t('label.filePath', 'any route');
      const hashName = text(ORIGIN_X + 74, HASH_Y - 10, { anchor: 'start', fill: TRUSTED });
      hashName.textContent = t('label.hashPath', 'a route you trust');
      root.append(fileLine, hashLine, fileName, hashName);
      return [fileLine, hashLine, fileName, hashName];
    }

    /**
     * 경로 위를 건너는 토큰 하나. 상자와 글자를 묶은 그룹이다.
     *
     * 정적 그리기가 정본이므로 **도착한 자리**에 짓는다. 건너는 운동은 이것을
     * 원본 쪽으로 물려 놓고 시작한다.
     */
    function makeToken(y: number, kids: SVGTSpanElement[], color: string): SVGGElement {
      const g = el('g');
      const box = el('rect', {
        x: TARGET_X - TOKEN_W / 2,
        y: y - TOKEN_H / 2,
        width: TOKEN_W,
        height: TOKEN_H,
        rx: 4,
        fill: palette.bg,
        stroke: color,
        'stroke-width': 1.4,
      });
      const label = text(TARGET_X, y + 4, { family: fonts.mono });
      label.setAttribute('xml:space', 'preserve');
      for (const kid of kids) label.appendChild(kid);
      g.append(box, label);
      root.appendChild(g);
      return g;
    }

    /** 파일 토큰의 글자 — 손댄 편이면 바뀐 글자 하나가 물든다. */
    function fileSpans(scene: IntegrityScene, side: IntegritySide): SVGTSpanElement[] {
      const base = scene.base;
      if (base === null) return [];
      const name = t('label.file', 'file');
      const content = side === 'tampered' ? base.tampered.content : base.intact.content;
      const body =
        side === 'tampered' ? marked(content, base.diffIndex, BAD) : [span(content)];
      return [span(`${name}  `), ...body];
    }

    function drawFileToken(scene: IntegrityScene): SVGGElement | null {
      const side = scene.file;
      if (side === null || scene.base === null) return null;
      return makeToken(FILE_Y, fileSpans(scene, side), side === 'tampered' ? BAD : ANY);
    }

    function drawHashToken(scene: IntegrityScene): SVGGElement | null {
      const base = scene.base;
      if (!scene.hashArrived || base === null) return null;
      const name = t('label.hash', 'hash');
      return makeToken(
        HASH_Y,
        [span(`${name}  `), span(head(base.referenceHash))],
        TRUSTED,
      );
    }

    /** 오는 길에 손댄 자국. 한 번 서면 머문다. */
    function drawCutMark(scene: IntegrityScene): SVGTextElement | null {
      if (!scene.tampered) return null;
      const node = text(TAMPER_X, FILE_Y - 16, { fill: BAD, weight: '700' });
      node.textContent = t('label.scissors', '✂');
      root.appendChild(node);
      return node;
    }

    /**
     * 장부 한 줄 — 받은 내용 · 그 해시 · 대조 · 내걸린 해시.
     *
     * 맞았나 어긋났나를 장면에서 받지 않는다. **그림에 뜬 것과 같은 두 해시**를
     * 여기서 견주어 정하므로, 조각의 결론이 상수로 박힐 자리가 없다.
     */
    function drawLedgerRow(scene: IntegrityScene, side: IntegritySide, row: number): SVGGElement {
      const base = scene.base;
      const g = el('g');
      if (base !== null) {
        const got = side === 'tampered' ? base.tampered : base.intact;
        const agrees = got.hash === base.referenceHash;
        const tone = agrees ? OK : BAD;
        const mark = agrees ? t('label.match', '✓') : t('label.mismatch', '✗');
        const line = text(W / 2, LEDGER_Y + row * LEDGER_ROW_H, { family: fonts.mono });
        line.setAttribute('xml:space', 'preserve');
        for (const kid of marked(got.content, base.diffIndex, tone)) line.appendChild(kid);
        line.append(
          span(GAP),
          span(head(got.hash), { fill: tone }),
          span(GAP),
          span(mark, { fill: tone, 'font-size': fontSizes.lg, 'font-weight': 700 }),
          span(GAP),
          // 내걸린 해시는 두 줄에서 같은 값이다 — 아래 경로는 못 건드렸다는 뜻이다.
          span(head(base.referenceHash), { fill: TRUSTED }),
        );
        g.appendChild(line);
      }
      root.appendChild(g);
      return g;
    }

    function drawLedger(scene: IntegrityScene): SVGGElement[] {
      if (scene.verdicts.length === 0 || scene.base === null) return [];
      const label = text(W / 2, LEDGER_HEAD_Y, { fill: palette.textMuted });
      label.textContent = scene.base.algorithmLabel;
      root.appendChild(label);
      return scene.verdicts.map((side, row) => drawLedgerRow(scene, side, row));
    }

    function drawCaption(scene: IntegrityScene): void {
      const node = text(W / 2, CAPTION_Y, {
        fill: palette.accent,
        size: fontSizes.sm,
        weight: '600',
      });
      const cap = scene.caption;
      node.textContent = cap === null ? '' : captionText(cap.kind);
      root.appendChild(node);
    }

    function captionText(kind: 'split' | 'match' | 'tampered' | 'detected'): string {
      switch (kind) {
        case 'split':
          return t('caption.split', 'Two routes leave the origin — the file, and its hash.');
        case 'match':
          return t('caption.match', 'Both arrive and the two agree.');
        case 'tampered':
          return t('caption.tampered', 'Someone edits the file on the way — one digit.');
        case 'detected':
          return t(
            'caption.detected',
            'They never touched the lower route, so the hash still tells on them.',
          );
      }
    }

    /** 그 장면이 말하는 것을 전부 세운다. 두 번 그려도 사이에 페인트가 끼지 않는다. */
    function drawStatic(scene: IntegrityScene): Drawn {
      rewind();
      const routes = drawRoutes(scene);
      drawEnds();
      const cutMark = drawCutMark(scene);
      const hashToken = drawHashToken(scene);
      const fileToken = drawFileToken(scene);
      const ledger = drawLedger(scene);
      drawCaption(scene);
      return { routes, fileToken, hashToken, cutMark, ledger };
    }

    // ── 걸음 함수 ─────────────────────────────────────────────────────────
    //
    // 정적 그리기가 이미 끝 자리에 세워 두었으므로, 여기서는 출발 그림으로
    // 되돌려 놓고 시작한다. 출발 그림은 `prev` 를 들추지 않고 장면과 배치에서
    // 셈으로 얻는다 (S-scene).

    /** 아직 못 온 만큼을 뒤로 물린다. 끝에서는 속성을 거둔다 (프로토콜 4 절). */
    function place(token: SVGGElement, p: number): void {
      if (p >= 1) {
        token.removeAttribute('transform');
        return;
      }
      token.setAttribute('transform', `translate(${-SPAN * (1 - easeInOut(p))} 0)`);
    }

    function hold(token: SVGGElement | null): void {
      if (token !== null) place(token, 0);
    }

    function fade(node: SVGElement, p: number): void {
      if (p >= 1) {
        node.removeAttribute('opacity');
        return;
      }
      node.setAttribute('opacity', String(p));
    }

    /** 두 경로가 갈라져 드러난다. 선과 이름이 한 뜻이라 한 시계로 흐른다. */
    async function flowSplit(drawn: Drawn, mine: number): Promise<void> {
      for (const node of drawn.routes) fade(node, 0);
      await tween(SPLIT_MS, mine, (p) => {
        for (const node of drawn.routes) fade(node, p);
      });
    }

    /** 장부의 마지막 줄이 내려앉는다. */
    async function flowLedger(drawn: Drawn, mine: number): Promise<void> {
      const row = drawn.ledger[drawn.ledger.length - 1];
      if (row === undefined) return;
      const settle = (p: number): void => {
        fade(row, p);
        if (p >= 1) row.removeAttribute('transform');
        else row.setAttribute('transform', `translate(0 ${6 * (1 - p)})`);
      };
      settle(0);
      await tween(LEDGER_MS, mine, settle);
    }

    /**
     * 파일이 건너고, 이어서 해시가 건너고, 장부에 첫 줄이 선다.
     *
     * 시계를 나누어 돌리지 않는다 — 차례가 곧 논증이라 마디를 이어 기다린다.
     * `render` 의 Promise 는 장부가 다 선 뒤에 풀린다 (S-scene).
     */
    async function flowDeliver(drawn: Drawn, mine: number): Promise<void> {
      const file = drawn.fileToken;
      const hash = drawn.hashToken;
      hold(file);
      hold(hash);
      if (file !== null) await tween(TRAVEL_MS, mine, (p) => place(file, p));
      if (!alive(mine)) return;
      if (hash !== null) await tween(TRAVEL_MS, mine, (p) => place(hash, p));
      if (!alive(mine)) return;
      await flowLedger(drawn, mine);
    }

    /**
     * 파일만 다시 오는데 경로 한가운데에서 손댄다.
     *
     * 가위가 드러나는 것과 글자가 갈리는 것을 건너는 운동 **안으로 접는다** — 시계가
     * 하나라 어느 걸음에서 오든 멎은 화면이 같다 (프로토콜 4 절 30).
     * 아래 해시 경로는 아무 일도 일어나지 않는다. 그 정지가 논증이다.
     */
    async function flowTamper(scene: IntegrityScene, drawn: Drawn, mine: number): Promise<void> {
      const file = drawn.fileToken;
      const cut = drawn.cutMark;
      if (file === null) return;
      const label = file.childNodes[1];
      const box = file.childNodes[0];
      let touched = false;

      /** 그 편의 글자와 테두리로 갈아 놓는다 — 출발 그림도 장면에서 셈한다. */
      const paint = (side: IntegritySide): void => {
        if (label instanceof SVGTextElement) {
          label.textContent = '';
          for (const kid of fileSpans(scene, side)) label.appendChild(kid);
        }
        if (box instanceof SVGRectElement) {
          box.setAttribute('stroke', side === 'tampered' ? BAD : ANY);
        }
      };
      // 아직 손대기 전의 글자로 되돌려 놓고 출발한다.
      paint('intact');
      place(file, 0);
      if (cut !== null) fade(cut, 0);

      await tween(TRAVEL_MS, mine, (p) => {
        place(file, p);
        if (p >= 0.5 && !touched) {
          touched = true;
          paint('tampered');
        }
        if (cut !== null) fade(cut, clamp01((p - 0.5) / (CUT_MS / TRAVEL_MS)));
      });
    }

    // ── 장면 그리기 ───────────────────────────────────────────────────────

    async function render(
      next: IntegrityScene,
      _prev: IntegrityScene | null,
      opts: { animate: boolean },
    ): Promise<void> {
      const mine = (gen += 1);

      const drawn = drawStatic(next);
      // 되짚기는 여기서 끝난다 — 타이머도 프레임도 걸지 않는다 (S-scene).
      if (!opts.animate || destroyed) return;

      const step = next.step;
      if (step === null) return;

      switch (step.kind) {
        case 'split':
          await flowSplit(drawn, mine);
          break;
        case 'deliver':
          await flowDeliver(drawn, mine);
          break;
        case 'tamper':
          await flowTamper(next, drawn, mine);
          break;
        case 'detect':
          await flowLedger(drawn, mine);
          break;
      }

      if (!alive(mine)) return;
      // 운동이 남긴 속성과 보간 끝자리가 노드째 사라진다. 되돌릴 목록을 손으로
      // 관리하지 않는다 (S-scene).
      drawStatic(next);
    }

    return {
      render,

      destroy(): void {
        destroyed = true;
        gen += 1;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        // 걸어 둔 것을 거두는 것만으로는 모자라다 — 취소된 콜백은 아예 불리지
        // 않으므로 기다리던 것을 직접 깨워야 `await ctx.emit` 이 돌아온다 (S-piece).
        for (const wake of [...waiters]) wake();
        waiters.clear();
        root.remove();
      },
    };
  },
};
