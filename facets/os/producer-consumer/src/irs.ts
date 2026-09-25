/**
 * producer-consumer 의 IR — 두지 않는다.
 *
 * 이 완제품의 주장은 두 쪽이 따로 돌며 세마포어가 잠재우고 깨우는 데 있다. 두 쪽이 따로 도는 것 ·
 * 잠듦 · 깸 · 표 넘겨주기는 IR 어휘(`packages/core/src/types/ir.ts`)에 없다. 흉내 셈을 코드 패널에
 * 띄우면 패널이 `acquire` 가 아니라 흉내를 보이게 된다. 그래서 IR 은 빈 배열이고 facet 에 codePanel 이 없다.
 * 두 쪽의 한 번 일은 stage 가 가상 표기 줄(initialData.producerCode · consumerCode)로 곁에 둔다.
 */
import type { IR } from '@ffacet/core';

export const producerConsumerIRs: IR[] = [];
