/*
 * 규칙팩 2026 귀속 — LAW_CHECKED 단계(공식 계산 사례 없음).
 * 2025 팩을 기준으로 2026 적용분 변경 후보만 표시하고, 확인되지 않은 값은 null + 사유로 둔다.
 * 엔진은 null 항목을 "확인 필요"로 표시하고 확정 계산에 쓰지 않는다.
 */
(function (root, factory) {
  var pack = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = pack;
  root.TaxRules = root.TaxRules || {};
  root.TaxRules[pack.year] = pack;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  var base;
  if (typeof module === 'object' && module.exports) base = require('./2025.js');
  else base = (root.TaxRules && root.TaxRules[2025]) || null;
  if (!base) throw new Error('rules/2025.js must be loaded before rules/2026.js');

  var pack = JSON.parse(JSON.stringify(base));
  pack.year = 2026;
  pack.version = '2026.v0.1';
  pack.verificationLevel = 'LAW_CHECKED';
  pack.verificationNote = '2025 팩 값을 기준으로 함. 2026 귀속 개정 사항(카드 자녀 한도 가산, 자녀세액공제 나이 등)은 조문 확인 전까지 null(확인 필요).';
  pack.verifiedAt = '2026-10-16';
  pack.effectiveFrom = '2026-01-01';
  pack.effectiveTo = '2026-12-31';

  pack.card.childLimitBonus = null;
  pack.card.childLimitBonusNote = '2026년 지출분부터 기본공제대상 자녀당 한도 가산(보도 기준 7천만원 이하 50만원·최대 100만원, 초과 25만원·최대 50만원) — 조특법 §126의2 현행 조문 확인 전 null';
  pack.card.sportsFacilityFrom = '2025-07-01';

  pack.childTaxCredit.minAgeNote = '2026 팩 자녀세액공제 대상 나이 변경 여부(블로그 출처 9세) 확인 필요 — 확인 전 2025 값(8세) 유지, 화면에 확인 필요 표시';
  pack.childTaxCredit.minAgeUnverified = true;

  pack.premiums = {
    confidence: 'UNVERIFIED',
    note: '2026년 4대보험 요율·국민연금 상·하한 미확인. 확인 전까지 자동 추정 불가(확인 필요).',
    base: 'TAXABLE_GROSS',
    periods: [],
    rounding: 'WON_FLOOR'
  };

  pack.sources['card.childLimitBonus'] = '조특법 §126의2(2026 적용분) 확인 필요';
  pack.sources['premiums'] = '2026 공단 고시 미확인';
  return pack;
});
