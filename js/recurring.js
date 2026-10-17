/*
 * recurring.js — 고정지출 템플릿 → 월별 Expense 생성 (REQ-014 / DEV-014)
 * 순수 함수. 생성된 Expense는 일반 Expense와 같은 집계 경로를 탄다.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  root.TaxRecurring = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function ymToIndex(ym) { var p = ym.split('-'); return parseInt(p[0], 10) * 12 + (parseInt(p[1], 10) - 1); }
  function indexToYm(i) { var y = Math.floor(i / 12); var m = i % 12 + 1; return y + '-' + (m < 10 ? '0' : '') + m; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function defaultStartMonth(year, employmentStart) {
    var jan = year + '-01';
    if (!employmentStart) return jan;
    var es = employmentStart.slice(0, 7);
    return es > jan ? es : jan;
  }

  function validateTemplate(t, year) {
    var errors = [];
    if (!t.name) errors.push('명칭을 입력하세요');
    if (!(t.amount >= 0) || !isFinite(t.amount)) errors.push('금액은 0 이상 숫자');
    if (!t.startMonth || !/^\d{4}-\d{2}$/.test(t.startMonth)) errors.push('시작 월 형식 오류');
    if (t.endMonth && !/^\d{4}-\d{2}$/.test(t.endMonth)) errors.push('종료 월 형식 오류');
    if (t.startMonth && t.endMonth && t.endMonth < t.startMonth) errors.push('종료 월이 시작 월보다 앞섭니다');
    if (t.startMonth && t.startMonth.slice(0, 4) !== String(year)) errors.push('시작 월이 귀속연도 밖입니다');
    if (t.loan && t.loan.type === 'MORTGAGE' && !(t.loan.interest >= 0)) errors.push('담보대출 이자 금액을 입력하세요');
    return errors;
  }

  /**
   * expandRecurring(template, year, referenceMonth, existing)
   * existing: 이 템플릿으로 이미 생성된 Expense 배열(recurringOverride 보존용)
   * 반환: { expenses: Expense[], replaced: number, kept: number }
   */
  function expandRecurring(t, year, referenceMonth, existing) {
    existing = existing || [];
    var start = ymToIndex(t.startMonth);
    var end = ymToIndex(t.endMonth || (year + '-12'));
    var yearEnd = ymToIndex(year + '-12');
    if (end > yearEnd) end = yearEnd;
    var refIdx = referenceMonth ? ymToIndex(referenceMonth) : null;
    var keptByMonth = {};
    existing.forEach(function (e) {
      if (e.recurringOverride && e.recurringOverride !== 'NONE') keptByMonth[e.date.slice(0, 7)] = e;
    });
    var out = [];
    var replaced = 0, kept = 0;
    var day = t.paymentDay && t.paymentDay >= 1 && t.paymentDay <= 28 ? t.paymentDay : 1;
    for (var i = start; i <= end; i++) {
      var ym = indexToYm(i);
      if (keptByMonth[ym]) { out.push(keptByMonth[ym]); kept++; continue; }
      var amount = t.amount;
      var tags = (t.deductionTags || []).slice();
      var useCategory = t.useCategory || 'EXCLUDED';
      if (t.loan && t.loan.type) {
        amount = (t.loan.principal || 0) + (t.loan.interest || 0);
        useCategory = 'EXCLUDED';
        if (t.loan.type === 'MORTGAGE' && tags.indexOf('MORTGAGE_INTEREST') < 0) tags.push('MORTGAGE_INTEREST');
        if (t.loan.type === 'RENT_LOAN' && tags.indexOf('RENT_LOAN') < 0) tags.push('RENT_LOAN');
      }
      if (tags.indexOf('RENT_CREDIT') >= 0) useCategory = 'EXCLUDED';
      var isActual = refIdx === null ? true : i <= refIdx;
      out.push({
        id: t.id + ':' + ym,
        date: ym + '-' + pad2(day),
        amount: amount,
        paymentMethod: t.paymentMethod || 'CASH_NONE',
        useCategory: useCategory,
        spenderId: t.spenderId || 'self',
        deductionTags: tags,
        status: isActual ? 'ACTUAL' : 'FORECAST',
        memo: t.memo || '',
        recurringId: t.id,
        recurringOverride: 'NONE',
        loan: t.loan ? { type: t.loan.type, principal: t.loan.principal || 0, interest: t.loan.interest || 0 } : undefined
      });
      replaced++;
    }
    return { expenses: out, replaced: replaced, kept: kept };
  }

  /** 템플릿 적용: state.expenses에서 이 템플릿의 기존 항목을 걷어내고 재생성(원자적 교체) */
  function applyTemplate(state, template, mode) {
    // mode: 'ALL' (시작 월부터 전체) | 'FROM_REFERENCE' (기준월부터)
    var year = state.profile.year;
    var ref = state.profile.referenceMonth || null;
    var mine = state.expenses.filter(function (e) { return e.recurringId === template.id; });
    var others = state.expenses.filter(function (e) { return e.recurringId !== template.id; });
    var result;
    if (mode === 'FROM_REFERENCE' && ref) {
      var refIdx = ymToIndex(ref);
      var before = mine.filter(function (e) { return ymToIndex(e.date.slice(0, 7)) < refIdx; });
      var after = mine.filter(function (e) { return ymToIndex(e.date.slice(0, 7)) >= refIdx; });
      var t2 = Object.assign({}, template, { startMonth: ref > template.startMonth ? ref : template.startMonth });
      result = expandRecurring(t2, year, ref, after);
      result.expenses = before.concat(result.expenses);
    } else {
      result = expandRecurring(template, year, ref, mine);
    }
    var seen = {};
    result.expenses = result.expenses.filter(function (e) {
      var k = e.recurringId + '|' + e.date.slice(0, 7);
      if (seen[k]) return false; seen[k] = true; return true;
    });
    state.expenses = others.concat(result.expenses);
    var idx = state.recurring.findIndex(function (r) { return r.id === template.id; });
    if (idx >= 0) state.recurring[idx] = template; else state.recurring.push(template);
    return result;
  }

  function removeTemplate(state, templateId, keepOverrides) {
    state.recurring = state.recurring.filter(function (r) { return r.id !== templateId; });
    state.expenses = state.expenses.filter(function (e) {
      if (e.recurringId !== templateId) return true;
      if (keepOverrides && e.recurringOverride && e.recurringOverride !== 'NONE') { e.recurringId = null; return true; }
      return false;
    });
  }

  return { ymToIndex: ymToIndex, indexToYm: indexToYm, defaultStartMonth: defaultStartMonth, validateTemplate: validateTemplate, expandRecurring: expandRecurring, applyTemplate: applyTemplate, removeTemplate: removeTemplate };
});
