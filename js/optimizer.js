/*
 * optimizer.js — 남은 예산의 결제수단·사용처 배분안 격자 탐색 (REQ-007 / DEV-007)
 * 세액은 engine.calcWithExtra로 전체 재평가(공제액×세율 근사 금지).
 */
(function (root, factory) {
  var m = factory(typeof require === 'function' ? require('./engine.js') : root.TaxEngine);
  if (typeof module === 'object' && module.exports) module.exports = m;
  root.TaxOptimizer = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine) {
  'use strict';
  var STEPS = [10000, 20000, 50000, 100000, 200000, 500000, 1000000];
  var MAX_EVALS = 40000;

  function combinations(n, k) { var r = 1; for (var i = 1; i <= k; i++) r = r * (n + i) / i; return r; }

  function buildBuckets(state, rules, gross, budget) {
    var ma = budget.methodAvailability || {};
    var ca = budget.categoryAvailability || {};
    var credit = ma.CREDIT !== false;
    var debit = ma.DEBIT !== false || ma.CASH_RECEIPT !== false;
    var debitMethod = ma.DEBIT !== false ? 'DEBIT' : 'CASH_RECEIPT';
    var anyMethod = credit ? 'CREDIT' : (debit ? debitMethod : null);
    var buckets = [];
    if (credit) buckets.push({ key: 'CREDIT_GENERAL', label: '신용카드·일반', method: 'CREDIT', category: 'GENERAL', cap: Infinity, rate: rules.card.rates.CREDIT });
    if (debit) buckets.push({ key: 'DEBIT_GENERAL', label: (ma.DEBIT !== false ? '체크·직불·선불' : '현금영수증') + '·일반', method: debitMethod, category: 'GENERAL', cap: Infinity, rate: rules.card.rates.DEBIT });
    function capOf(k) { var v = ca[k]; if (v === 0) return 0; if (typeof v === 'number' && v > 0) return v; return Infinity; }
    var pmSpecial = debit ? debitMethod : anyMethod;
    if (pmSpecial) {
      var mc = capOf('TRADITIONAL_MARKET'), tc = capOf('PUBLIC_TRANSIT');
      if (mc > 0 || tc > 0) buckets.push({ key: 'SPECIAL40', label: '전통시장·대중교통', method: pmSpecial, category: 'TRADITIONAL_MARKET', cap: mc + tc, capMarket: mc, capTransit: tc, rate: rules.card.rates.TRADITIONAL_MARKET });
      var cc = capOf('CULTURE');
      if (cc > 0 && gross <= rules.card.cultureGrossCap) buckets.push({ key: 'CULTURE', label: '문화체육', method: pmSpecial, category: 'CULTURE', cap: cc, rate: rules.card.rates.CULTURE });
    }
    return buckets;
  }

  function chooseStep(budget, freeDims) {
    for (var i = 0; i < STEPS.length; i++) {
      var n = Math.floor(budget / STEPS[i]);
      if (combinations(n, freeDims) <= MAX_EVALS) return STEPS[i];
    }
    return STEPS[STEPS.length - 1];
  }

  function evaluate(state, rules, buckets, alloc, date) {
    var extras = [];
    buckets.forEach(function (b, i) {
      if (alloc[i] > 0) extras.push(Engine.mkExtra('opt:' + b.key, alloc[i], b.method, b.category, date));
    });
    var r = Engine.calcWithExtra(state, rules, extras);
    return { alloc: alloc.slice(), tax: r.totalTax, deduction: r.card.total_deduction, result: r };
  }

  function statusQuoAlloc(state, buckets, budget) {
    var year = String(state.profile.year);
    var sums = { CREDIT_GENERAL: 0, DEBIT_GENERAL: 0, SPECIAL40: 0, CULTURE: 0 };
    state.expenses.forEach(function (e) {
      if (!e.date || e.date.slice(0, 4) !== year || (e.spenderId || 'self') !== 'self' || e.useCategory === 'EXCLUDED' || e.paymentMethod === 'CASH_NONE' || e.refundOf) return;
      var c = e.useCategory || 'GENERAL';
      if (c === 'TRADITIONAL_MARKET' || c === 'PUBLIC_TRANSIT') sums.SPECIAL40 += e.amount;
      else if (c === 'CULTURE' || c === 'SPORTS_FACILITY') sums.CULTURE += e.amount;
      else if (e.paymentMethod === 'CREDIT') sums.CREDIT_GENERAL += e.amount;
      else sums.DEBIT_GENERAL += e.amount;
    });
    var total = buckets.reduce(function (s, b) { return s + (sums[b.key] || 0); }, 0);
    var alloc = buckets.map(function () { return 0; });
    if (total <= 0) {
      var idx = buckets.findIndex(function (b) { return b.key === 'CREDIT_GENERAL'; });
      if (idx < 0) idx = 0;
      alloc[idx] = Math.min(budget, buckets[idx].cap);
      return alloc;
    }
    var remaining = budget;
    buckets.forEach(function (b, i) { alloc[i] = Math.min(Math.floor(budget * (sums[b.key] || 0) / total), b.cap); remaining -= alloc[i]; });
    if (remaining > 0) { var j = buckets.findIndex(function (b) { return b.key === 'CREDIT_GENERAL'; }); if (j < 0) j = 0; alloc[j] += remaining; }
    return alloc;
  }

  function optimize(state, rules) {
    var base = Engine.calc(state, rules);
    if (base.blocked) return { available: false, reason: '연봉 미입력' };
    var budget = Math.max(0, Math.floor((state.budget && state.budget.remainingBudget) || 0));
    var range = Engine.employmentRange(state.profile);
    var date = range.end;
    var buckets = buildBuckets(state, rules, base.gross, state.budget || {});
    var notes = [];
    if (!buckets.length) return { available: false, reason: '사용 가능한 결제수단이 없습니다', baseline: base };
    if (budget <= 0) notes.push('남은 예산이 0이므로 배분할 금액이 없습니다');
    // 나머지 버킷 = 공제율이 가장 낮은 버킷
    var remIdx = 0;
    buckets.forEach(function (b, i) { if (b.rate < buckets[remIdx].rate) remIdx = i; });
    var free = buckets.map(function (_, i) { return i; }).filter(function (i) { return i !== remIdx; });
    var step = chooseStep(budget, free.length);
    var evals = 0;
    var best = null, bestDed = null, ties = [];
    var alloc = buckets.map(function () { return 0; });
    function recurse(fi, remaining) {
      if (fi === free.length) {
        alloc[remIdx] = Math.min(remaining, buckets[remIdx].cap);
        var ev = evaluate(state, rules, buckets, alloc, date); evals++;
        if (!best || ev.tax < best.tax) { best = ev; ties = []; }
        else if (ev.tax === best.tax && evals > 1) { if (ties.length < 3) ties.push(ev); }
        if (!bestDed || ev.deduction > bestDed.deduction || (ev.deduction === bestDed.deduction && ev.tax < bestDed.tax)) bestDed = ev;
        return;
      }
      var bi = free[fi];
      var maxAmt = Math.min(remaining, buckets[bi].cap);
      for (var a = 0; a <= maxAmt; a += step) { alloc[bi] = a; recurse(fi + 1, remaining - a); }
      if (maxAmt % step !== 0 && maxAmt > 0) { alloc[bi] = maxAmt; recurse(fi + 1, remaining - maxAmt); }
      alloc[bi] = 0;
    }
    recurse(0, budget);
    var sq = evaluate(state, rules, buckets, statusQuoAlloc(state, buckets, budget), date);
    function pack(ev, label) {
      var spent = ev.alloc.reduce(function (s, a) { return s + a; }, 0);
      var items = buckets.map(function (b, i) {
        var it = { key: b.key, label: b.label, method: b.method, category: b.category, amount: ev.alloc[i] };
        if (b.key === 'SPECIAL40') {
          var m = Math.min(ev.alloc[i], b.capMarket === Infinity ? ev.alloc[i] : b.capMarket);
          it.market = m; it.transit = ev.alloc[i] - m;
        }
        return it;
      });
      return { label: label, items: items, spent: spent, unspent: budget - spent, tax: ev.tax, deduction: ev.deduction, taxSaving: base.totalTax - ev.tax, deductionGain: ev.deduction - base.card.total_deduction, determinedTax: ev.result.determinedTax, limitsReached: { basic: ev.result.card.general >= ev.result.card.basicLimit, extra: ev.result.card.extra >= ev.result.card.extraLimit } };
    }
    var rec = pack(best, '추천안(세액 기준)');
    var ref = pack(bestDed, '참고안(공제 최대)');
    var sqp = pack(sq, '현상유지안');
    if (base.determinedTax === 0) notes.push('내야 할 세금이 0이므로 추가 절세 효과가 없습니다');
    if (rec.taxSaving === 0 && budget > 0) notes.push('추가 지출로 세액이 줄지 않습니다(한도 도달 또는 내야 할 세금 0)');
    if (!rec.limitsReached.basic && budget > 0) notes.push('예산 안에서 기본 공제 한도에 도달하지 못합니다');
    if (ties.length) notes.push('세액이 같은 대안 ' + ties.length + '개 있음');
    var months = remainingMonths(state);
    return { available: true, step: step, evaluations: evals, budget: budget, buckets: buckets.map(function (b) { return { key: b.key, label: b.label, cap: b.cap === Infinity ? null : b.cap }; }), recommended: rec, reference: ref, statusQuo: sqp, ties: ties.map(function (t) { return pack(t, '대안'); }), baselineTax: base.totalTax, baselineDeduction: base.card.total_deduction, notes: notes, remainingMonths: months, baseline: base };
  }

  function remainingMonths(state) {
    var range = Engine.employmentRange(state.profile);
    var months = Engine.monthsInRange(range);
    var ref = state.profile.referenceMonth;
    if (!ref) return months;
    var after = months.filter(function (m) { return m > ref; });
    return after.length ? after : months.slice(-1);
  }

  return { optimize: optimize, buildBuckets: buildBuckets, chooseStep: chooseStep, remainingMonths: remainingMonths };
});
