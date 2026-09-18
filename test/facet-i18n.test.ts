/**
 * facet 문안의 locale 정합성 — 전수.
 *
 * 배포물의 화면 문자를 보는 유일한 검사다. 다른 검사들은 facet 이 **도는지**를
 * 보고, 여기는 facet 이 **무엇이라 말하는지**를 본다.
 *
 * 배포 전 점검에서 셋이 한꺼번에 나왔다. 셋 다 타입도 검사도 통과하고 띄워 본
 * 사람만 아는 종류였다.
 *
 *  - 완제품 여섯이 `t('caption.empty', 'Nothing here yet.')` 를 부르는데 어느
 *    `facet.ts` 에도 그 키가 없었다. 조회가 3층(코드의 en 원본)까지 떨어져
 *    한국어 화면에 영어 한 줄이 튀었다. 한 번 발견된 뒤로도 남아 있었다 —
 *    **검사가 없으면 발견이 남지 않는다.**
 *  - 조각 다섯에 `description` 이 없어 카탈로그 목록에서 제목만 떴다.
 *  - facet 154 개가 열 언어에 못 미쳐, 아랍어 사용자 화면에서 버튼만 아랍어이고
 *    캡션은 영어로 떴다.
 *
 * 계측기 `pnpm i18n:audit` 와 같은 것을 본다. 그쪽은 고치는 동안 진행률을 보려는
 * 것이고 이쪽은 통과/실패를 가른다.
 */

import { describe, expect, it } from 'vitest';
import { collect, missingCount, LOCALES } from '../scripts/i18n-audit.mts';

/**
 * `FACET_ONLY=<디렉터리 이름,...>` 이면 그 facet 만 본다 (`scripts/piece-check.mjs`).
 * 배치 도중에는 형제 조각이 반쯤 만들어진 상태라 전수로 보면 남의 조각 때문에 멎는다.
 */
const only = (process.env.FACET_ONLY ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
const rows = collect().filter((r) => only.length === 0 || only.some((n) => r.path.endsWith(`/${n}`)));

describe('facet 문안', () => {
  it('전수를 세었다 — 목록이 비면 아래 검사가 모두 헛통과한다', () => {
    expect(rows.length).toBeGreaterThanOrEqual(only.length > 0 ? 1 : 179);
  });

  /*
   * facet 고유 키는 프레임워크 번들이 받아 주지 않는다. 선언이 없으면 조회가
   * 코드의 en 원본까지 떨어져, 그 한 줄만 다른 언어로 뜬다.
   *
   * 부르는 이름이 둘이다 — Projector 는 `runtime.t` 를 `tr(` 로, stage view 는
   * `params.t` 를 `t(` 로 부른다. 계측기를 처음 짤 때 `tr(` 만 찾다가 여섯을
   * 통째로 놓칠 뻔했다.
   */
  it('코드가 부르는 facet 고유 키를 facet.ts 가 모두 선언한다', () => {
    const bad = rows.filter((r) => r.undeclared.length > 0).map((r) => `${r.path}: ${r.undeclared.join(', ')}`);
    expect(bad).toEqual([]);
  });

  it('모든 facet 이 description 을 가진다 — 카탈로그 엔트리의 설명이 여기서 온다', () => {
    const bad = rows.filter((r) => r.descLocales.size === 0).map((r) => r.path);
    expect(bad).toEqual([]);
  });

  /*
   * `S-piece:297` — 조각은 en·ko 로 *시작해도* 되나 20종을 넘거나 외부 호스트에
   * 채택되면 열 언어로 맞춘다. 조각은 120 종이고 `@ffacet/*` 는 외부 호스트가
   * 쓰는 배포물이라 두 조건이 다 걸렸다. 완제품에는 애초에 유예가 없다.
   *
   * 실패 메시지가 길어지지 않도록 앞의 몇 개와 총량만 보인다.
   */
  it(`title · description · messages 의 모든 키가 열 언어를 채운다 (${LOCALES.join(' ')})`, () => {
    const short = rows.filter((r) => missingCount(r) > 0);
    const total = short.reduce((a, r) => a + missingCount(r), 0);
    const detail = short.slice(0, 12).map((r) => `${r.path} (문안 ${missingCount(r)} 부족)`);
    expect({ facet: short.length, 문안: total, 앞부분: detail }).toEqual({ facet: 0, 문안: 0, 앞부분: [] });
  });

  /*
   * 플레이스홀더는 번역에서 가장 잘 사라지는 것이다. `{k}` 가 빠지면 그 언어에서만
   * 값이 안 나오는데, 타입도 통과하고 그 언어로 띄워 본 사람만 안다.
   *
   * **개수가 아니라 있고 없음을 견주고, 한쪽 방향만 본다.**
   *
   * 개수를 맞추라 하면 `scc` 의 `caption.closeGroup` 이 걸린다 — en 이 `{v}` 를 두
   * 번 쓰는데 ko 는 한 번 쓰고 두 번째를 "여기부터" 로 받았다. 자연스러운
   * 한국어이지 결함이 아니다.
   *
   * 양쪽을 맞추라 하면 `open-addressing-probe` 의 `caption.probe` 가 걸린다 — ko 가
   * en 에 없는 `{to}` 를 더 쓰는데, projector 가 `{ from, holder, to }` 를 모두
   * 넘기므로 화면에서는 제대로 채워진다. 번역이 더 구체적으로 쓴 것뿐이다.
   *
   * 확실한 결함은 하나다 — **en 이 쓰는 값을 번역이 빠뜨리는 것.** 그때 그 언어에서만
   * 값이 안 나온다. 반대 방향(번역이 더 씀)은 projector 가 그 값을 넘기는 한
   * 정상이고, 넘기는지는 여기서 알 수 없다.
   */
  it('en 이 쓰는 플레이스홀더를 번역이 빠뜨리지 않는다', () => {
    const bad: string[] = [];
    for (const r of rows) {
      for (const [key, locales] of r.keyLocales) {
        const en = r.placeholders.get(`${key} en`);
        if (en === undefined || en === '') continue;
        const want = en.split(',');
        for (const loc of locales) {
          if (loc === 'en') continue;
          const got = new Set((r.placeholders.get(`${key} ${loc}`) ?? '').split(','));
          const missing = want.filter((p) => !got.has(p));
          if (missing.length) bad.push(`${r.path} ${key} [${loc}] {${missing.join('} {')}} 빠짐`);
        }
      }
    }
    expect(bad.slice(0, 20)).toEqual([]);
  });
});
