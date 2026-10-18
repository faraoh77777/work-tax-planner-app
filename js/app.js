/* app.js — 화면 연결(해시 라우팅). 계산은 전부 TaxEngine/TaxOptimizer에 맡기고 숫자는 규칙팩에서만 읽는다. */
(function () {
  'use strict';
  var E = TaxEngine, CI = CardImport, R = TaxRecurring, O = TaxOptimizer, S = TaxStorage;
  var RULES = globalThis.TaxRules || {};
  var app = document.getElementById('app');
  var state = null;
  var ui = { inputTab: 'payroll', expenseMonth: '', editingExpense: null, editingRecurring: null, editingPayroll: null, confirm: null, dedCategory: 'MEDICAL', editingFamily: null, restorePending: null, lastOpt: null, importQueue: [], dir: null };

  // ---------- 라벨 ----------
  var L = {
    pm: { CREDIT: '신용카드', DEBIT: '체크·직불·선불', CASH_RECEIPT: '현금영수증', CASH_NONE: '현금·이체(공제 없음)' },
    cat: { GENERAL: '일반', TRADITIONAL_MARKET: '전통시장', PUBLIC_TRANSIT: '대중교통', CULTURE: '문화체육(도서·공연·영화 등)', SPORTS_FACILITY: '문화체육(수영장·체력단련장)', EXCLUDED: '공제제외', USED_CAR: '중고차(10% 산입)' },
    rel: { SPOUSE: '배우자', LINEAL_ASCENDANT: '직계존속', LINEAL_DESCENDANT: '직계비속(자녀·손자녀)', SIBLING: '형제자매', FOSTER_CHILD: '위탁아동', WELFARE_RECIPIENT: '수급자', OTHER: '기타' },
    tag: { INSURANCE: '보장성보험', INSURANCE_DISABLED: '장애인전용보험', MEDICAL: '의료비', EDUCATION: '교육비', DONATION_POLITICAL: '정치자금기부금', DONATION_HOMETOWN: '고향사랑기부금', DONATION_SPECIAL: '특례기부금', DONATION_GENERAL: '일반기부금(종교 외)', DONATION_RELIGIOUS: '일반기부금(종교단체)', PENSION_SAVING: '연금저축', IRP: 'IRP·퇴직연금', ISA_CONVERSION: 'ISA 만기 연금계좌 전환', HOUSING_SUBSCRIPTION: '주택청약', RENT_LOAN: '주택임차차입금 원리금(전세대출)', MORTGAGE_INTEREST: '장기주택저당차입금 이자(담보대출)', RENT_CREDIT: '월세(세액공제)' },
    level: { LAW_CHECKED: '법령 확인 단계', CASE_VERIFIED: '공식 사례 검증', UNSUPPORTED: '미지원' },
    sme: { YOUTH: '청년(15~34세)', SENIOR: '60세 이상', DISABLED: '장애인', CAREER_BREAK: '경력단절' },
    medGroup: { GENERAL: '그 외 부양가족(700만원 한도)', UNLIMITED: '본인·65세 이상·6세 이하·장애인·산정특례(한도 없음)', INFERTILITY: '난임시술(30%)', PREMATURE: '미숙아·선천성이상아(20%)' },
    medKind: { NORMAL: '일반 의료비', GLASSES: '안경·렌즈(1인 50만원)', POSTNATAL: '산후조리원(출산 1회 200만원)', COSMETIC: '미용·성형(공제 제외)', HEALTH_SUPPLEMENT: '건강증진 의약품(공제 제외)' },
    eduLevel: { PRESCHOOL: '취학전(300만원)', SCHOOL: '초·중·고(300만원)', UNIVERSITY: '대학(900만원)', SELF: '본인(한도 없음)', DISABLED_SPECIAL: '장애인 특수교육(한도 없음)' },
    eduKind: { NORMAL: '일반', ACADEMY_SCHOOL: '초·중·고 학원비(불인정)', UNIFORM: '교복(50만원)', FIELD_TRIP: '현장체험학습(30만원)' }
  };

  // ---------- 유틸 ----------
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function won(n) { if (n === null || n === undefined || isNaN(n)) return '—'; return Math.round(n).toLocaleString('ko-KR') + '원'; }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function rate(x) { return (Math.round(x * 1000) / 10) + '%'; }
  function uid() { return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function num(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(String(v).replace(/,/g, '')); return isFinite(n) ? n : null; }
  function todayYm() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
  function rules() { return RULES[state.profile.year] || null; }
  function opts(map, sel, blank) { var h = blank ? '<option value="">' + esc(blank) + '</option>' : ''; Object.keys(map).forEach(function (k) { h += '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>' + esc(map[k]) + '</option>'; }); return h; }
  function familyOpts(sel) { var m = { self: '본인' }; state.family.forEach(function (f) { m[f.id] = (f.alias || L.rel[f.relation]) + '(' + L.rel[f.relation] + ')'; }); return opts(m, sel || 'self'); }
  var toastTimer;
  function toast(msg, isErr) { var t = document.createElement('div'); t.className = 'toast' + (isErr ? ' err' : ''); t.textContent = msg; document.body.appendChild(t); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, isErr ? 4000 : 2000); }
  function persist() { return S.save(state).then(function () { return true; }).catch(function (e) { toast('저장 실패: ' + (e && e.message || e), true); return false; }); }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function badge(text, cls) { return '<span class="badge ' + (cls || '') + '">' + esc(text) + '</span>'; }
  function bar(p, green) { return '<div class="bar' + (green ? ' green' : '') + '"><div style="width:' + Math.round(Math.min(1, Math.max(0, p)) * 100) + '%"></div></div>'; }
  function basisLink(row) { return '<a class="faint" href="#/basis' + (row ? '?row=' + row : '') + '">기준 ›</a>'; }

  // ---------- 상태 초기화 ----------
  function ensureDefaults(st) {
    if (!st.profile.referenceMonth) { var t = todayYm(); var dec = st.profile.year + '-12'; st.profile.referenceMonth = t < dec ? t : dec; }
    if (!st.cards) st.cards = [];
    if (!st.merchantRules) st.merchantRules = {};
    if (!st.importedFiles) st.importedFiles = {};
    if (!st.importMappings) st.importMappings = {};
    if (!st.scenario) st.scenario = {};
    // 예전 버전에서 설계 화면에만 저장된 담보대출 조건을 공용 설정으로 옮긴다
    if (st.scenario.mortgageCapKey) { if (!st.profile.mortgageCapKey) st.profile.mortgageCapKey = st.scenario.mortgageCapKey; delete st.scenario.mortgageCapKey; }
    if (!st.budget) st.budget = { remainingBudget: 0, categoryAvailability: {}, methodAvailability: {} };
    if (!st.profile.selfConditions) st.profile.selfConditions = {};
    return st;
  }

  // ---------- 셸 ----------
  var NAV = [['#/plan', '플랜', '◎'], ['#/home', '홈', '⌂'], ['#/input', '입력', '✎'], ['#/deductions', '공제', '☑'], ['#/design', '설계', '▥'], ['#/settings', '설정', '⚙']];
  function shell(title, body, extraBadges, hideNav) {
    var rp = rules();
    var badges = badge(state.profile.year + '년 연말정산', 'navy') + (rp ? '' : badge('이 연도는 계산 기준 없음', 'red')) + (extraBadges || '');
    var cur = (location.hash || '#/plan').split(/[?/]/).slice(0, 2).join('/');
    if (cur === '#/maximize') cur = '#/plan';
    var nav = hideNav ? '' : '<nav class="bottom" aria-label="주 메뉴">' + NAV.map(function (n) { return '<a href="' + n[0] + '" class="' + (cur === n[0] ? 'on' : '') + '"><span class="ico" aria-hidden="true">' + n[2] + '</span>' + n[1] + '</a>'; }).join('') + '</nav>';
    app.innerHTML = '<header class="top"><div class="row-between"><h1>' + esc(title) + '</h1>' + (hideNav ? '<a class="btn small" href="#/settings">← 뒤로</a>' : '<a class="btn small" href="#/settings" aria-label="설정">설정</a>') + '</div><div class="badges">' + badges + '</div></header><main>' + body + '</main>' + nav;
  }

  // ---------- S00 플랜 ----------
  function viewPlan() {
    var rp = rules();
    if (!rp) return shell('최적 사용 플랜', '<div class="err">' + state.profile.year + '년 규칙팩이 없어 계산할 수 없습니다. 설정에서 연도를 바꾸세요.</div>');
    var g = E.grossFromState(state);
    if (g.gross === null) {
      return shell('최적 사용 플랜', '<section class="card"><h3>연봉을 먼저 알려주세요</h3><p class="muted">연봉(세전)과 비과세를 넣으면 연봉에 따라 달라지는 공제 구간·한도·요율을 자동으로 적용해 "얼마까지 어떤 수단으로 쓰면 절세가 최대인지" 보여줍니다. 입력값은 이 기기에만 저장됩니다.</p><form data-form="quick-gross" class="form"><label>예상 세전연봉(원)<input name="gross" inputmode="numeric" required placeholder="예: 52000000"></label><label>연간 비과세(식대 등, 원)<input name="nontax" inputmode="numeric" placeholder="0"></label><div class="full btns"><button class="btn primary" type="submit">플랜 보기</button><a class="btn" href="#/settings">설정에서 자세히 입력</a></div></form>' + (g.missing.length ? '<div class="faint">' + esc(g.missing.join(', ')) + '</div>' : '') + '</section>');
    }
    var plan = E.buildOptimalPlan(state, rp);
    var a = plan.autoApplied;
    var stages = plan.stages.map(function (s, i) {
      return '<div class="stage"><div class="row-between"><div><span class="num">' + (i + 1) + '</span><b>' + esc(s.label) + '</b></div>' + (s.progress >= 1 ? badge('달성', 'green') : badge(pct(s.progress) + ' 달성', 'gray')) + '</div><div class="muted">' + esc(s.method) + '</div>' + bar(s.progress, s.progress >= 1) +
        '<div class="kv"><span>' + (s.key === 'THRESHOLD' ? '카드 공제 시작선(연봉 25%)' : '목표 공제') + '</span><b>' + won(s.target) + '</b></div>' +
        '<div class="kv"><span>지금부터 더 써야 하는 금액</span><b>' + (s.need > 0 ? won(s.need) : '없음(도달)') + '</b></div>' +
        (s.key !== 'THRESHOLD' ? '<div class="kv"><span>이 단계 소득공제</span><b>' + won(s.deduction) + '</b></div>' : '') +
        '<div class="kv"><span>이 단계 예상 절세(소득세+지방세)</span><b>' + (s.key === 'THRESHOLD' ? '0원(공제 없는 구간)' : won(s.taxSaving)) + '</b></div><div class="faint">' + esc(s.why) + '</div></div>';
    }).join('');
    var sum = E.buildPlanSummary(state, rp, plan), t = sum.totals;
    var sumRows = sum.rows.map(function (r) {
      var tag = r.conditional ? ' ' + badge('조건부', 'amber') : (r.na ? ' ' + badge('대상 아님', 'gray') : '');
      return '<tr' + (r.conditional || r.na ? ' class="dim"' : '') + '><td><b>' + esc(r.label) + '</b>' + tag + '<div class="faint">' + esc(r.sub) + (r.note ? ' · ' + esc(r.note) : '') + '</div></td><td>' + esc(r.rate) + '<div class="faint">' + esc(r.type) + '</div></td><td class="num">' + (r.maxUse > 0 ? won(r.maxUse) : (r.na ? '—' : '없음(도달)')) + '</td><td class="num">' + won(r.deduction) + '</td><td class="num"><b>' + won(r.taxSaving) + '</b></td></tr>';
    }).join('');
    // 휴대폰 폭: 표 대신 항목별 카드(가로 스크롤 없이 한눈에)
    var sumList = sum.rows.map(function (r) {
      var tag = r.conditional ? ' ' + badge('조건부', 'amber') : (r.na ? ' ' + badge('대상 아님', 'gray') : '');
      return '<div class="sum-item' + (r.conditional || r.na ? ' dim' : '') + '"><div class="row-between"><div><b>' + esc(r.label) + '</b>' + tag + '</div><b class="save">' + won(r.taxSaving) + '</b></div><div class="faint">' + esc(r.rate) + ' ' + esc(r.type) + ' · ' + esc(r.sub) + (r.note ? ' · ' + esc(r.note) : '') + '</div>' +
        '<div class="sum-nums"><div><span>최대 사용·납입</span>' + (r.maxUse > 0 ? won(r.maxUse) : (r.na ? '—' : '없음(도달)')) + '</div><div><span>공제금액</span>' + won(r.deduction) + '</div><div><span>돌려받는 돈</span>' + won(r.taxSaving) + '</div></div></div>';
    }).join('') + '<div class="sum-item total"><div class="row-between"><b>합계</b><b class="save">' + won(t.taxSaving) + '</b></div><div class="faint">조건부·대상 아님 제외</div><div class="sum-nums"><div><span>최대 사용·납입</span>' + won(t.maxUse) + '</div><div><span>소득공제</span>' + won(t.incomeDeduction) + '</div><div><span>세액공제</span>' + won(t.taxCredit) + '</div></div></div>';
    // 이미 입력한 공제(담보대출 이자·보험·의료·교육·기부·월세·연금·부양가족): 현재 세금에 반영된 혜택. 각 항목만 뺐을 때 늘어나는 세금
    var b0 = plan.baseline, sv = E.itemTaxSavings(state, rp);
    var entered = [
      { label: '부양가족 인적공제', input: state.family.length ? state.family.length + '명' : 0, ded: b0.personal.total - rp.personal.basic, save: sv.PERSONAL_FAMILY, kind: '소득공제' },
      { label: '주택담보대출 이자', input: b0.housing.mortgageInterest, ded: b0.housing.mortgageDeduction, save: null, kind: '소득공제', note: b0.housing.mortgageNote },
      { label: '주택청약·전세대출', input: b0.housing.subscription + b0.housing.rentLoan, ded: b0.housing.combined, save: null, kind: '소득공제' },
      { label: '연금계좌(입력분)', input: b0.pension.saving + b0.pension.irp, ded: b0.pension.credit, save: sv.PENSION_ACCOUNT, kind: '세액공제' },
      { label: '보장성보험', input: b0.insurance.base + b0.insurance.baseDisabled, ded: b0.insurance.credit, save: sv.INSURANCE, kind: '세액공제' },
      { label: '의료비', input: b0.medical.total, ded: b0.medical.credit, save: sv.MEDICAL, kind: '세액공제', note: b0.medical.belowThreshold && b0.medical.total ? '연봉 3% 미달' : '' },
      { label: '교육비', input: b0.education.base, ded: b0.education.credit, save: sv.EDUCATION, kind: '세액공제' },
      { label: '기부금', input: b0.donation.amounts.political + b0.donation.amounts.hometown + b0.donation.amounts.special + b0.donation.amounts.general + b0.donation.amounts.religious, ded: b0.donation.political + b0.donation.hometown + b0.donation.specialGeneral, save: (sv.POLITICAL || 0) + (sv.HOMETOWN || 0) + (sv.DONATION_SPECIAL_GENERAL || 0), kind: '세액공제' },
      { label: '월세', input: b0.rent.amount, ded: b0.rent.credit, save: sv.RENT, kind: '세액공제', note: b0.rent.amount && !b0.rent.eligible ? b0.rent.reasons.join(', ') : '' }
    ].filter(function (x) { return x.input; });
    // 주택자금은 담보대출·청약·전세대출을 한 번에 빼서 계산하므로 금액이 있는 쪽에 나눠 표시
    var housingRows = entered.filter(function (x) { return x.label === '주택담보대출 이자' || x.label === '주택청약·전세대출'; });
    housingRows.forEach(function (x, i) { x.save = i === 0 ? sv.HOUSING : 0; if (housingRows.length > 1 && i === 0) x.note = (x.note ? x.note + ' · ' : '') + '주택자금 합산 혜택'; });
    var enteredHtml = entered.length ? '<h4 class="sub-title">이미 입력한 공제 <span class="faint">(현재 세금에 반영됨)</span></h4>' + entered.map(function (x) {
      return '<div class="sum-item"><div class="row-between"><div><b>' + esc(x.label) + '</b> <span class="faint">' + esc(x.kind) + '</span></div><b class="save">' + won(x.save || 0) + '</b></div>' + (x.note ? '<div class="faint warn-ink">' + esc(x.note) + '</div>' : '') +
        '<div class="sum-nums"><div><span>입력 금액</span>' + (typeof x.input === 'number' ? won(x.input) : esc(x.input)) + '</div><div><span>공제금액</span>' + won(x.ded) + '</div><div><span>돌려받는 돈</span>' + won(x.save || 0) + '</div></div></div>';
    }).join('') + '<div class="faint">각 항목만 뺐을 때 늘어나는 세금입니다(합계는 기본 세액공제(13만원) 전환 등으로 전체와 다를 수 있음). 입력·수정은 <a href="#/deductions">공제 관리</a>.</div>' : '';
    var summary = '<section class="card"><div class="row-between"><h3>한눈에 보기 — 항목별 최대 혜택</h3>' + basisLink() + '</div>' +
      '<div class="sum-list">' + sumList + '</div>' +
      '<div class="tbl-wrap sum-wide"><table class="sum-table"><thead><tr><th>항목</th><th>요율</th><th class="num">최대 사용·납입액<br><span class="faint">(지금부터)</span></th><th class="num">공제금액</th><th class="num">돌려받는 돈<br><span class="faint">(소득세+지방세)</span></th></tr></thead><tbody>' + sumRows + '</tbody>' +
      '<tfoot><tr><td colspan="2"><b>합계</b><div class="faint">조건부·대상 아님 제외</div></td><td class="num"><b>' + won(t.maxUse) + '</b></td><td class="num">소득 ' + won(t.incomeDeduction) + '<br>세액 ' + won(t.taxCredit) + '</td><td class="num"><b>' + won(t.taxSaving) + '</b></td></tr></tfoot></table></div>' + enteredHtml +
      '<div class="grid2" style="margin-top:8px"><div><div class="muted">카드 등 사용 합계(한도 도달점)</div><b>' + won(plan.saturation) + '</b><div class="faint">이번에 더 쓸 금액 ' + won(t.cardMaxUse) + ' · 넘는 카드 사용은 공제 0</div></div><div><div class="muted">예상 세금(소득세+지방세)</div><b>' + won(sum.baselineTax) + ' → ' + won(sum.finalTax) + '</b><div class="faint">위 항목을 모두 채웠을 때</div></div></div>' +
      '<div class="faint">소득공제는 소득에서 빼주고, 세액공제는 세금에서 바로 빼줘요. 연금계좌·청약은 쓰는 돈이 아니라 저축이에요.</div><div class="btns"><a class="btn primary" href="#/maximize">부양가족·의료비·교육비·주거까지 전체 절세 설계 ›</a></div></section>';
    var body = planTabs('plan') + summary + '<h2 class="section-title">세부 내용</h2><section class="card dark"><h2>' + (plan.hasInputs ? '현재 입력값 포함 · 추정' : '다른 공제 미입력 기준 · 추정') + '</h2><div class="kv"><span>연봉(비과세 제외)</span><b>' + won(plan.gross) + '</b></div><p class="muted" style="margin:0">지출을 늘리라는 뜻이 아닙니다. <b style="color:#fff">어차피 쓸 돈의 결제수단과 순서</b>를 바꾸는 것만으로 공제가 달라집니다. 아래 금액·구간은 연봉에 따라 자동 적용됩니다.</p></section>' +
      '<section class="card"><div class="row-between"><h3>카드 사용 순서 플랜</h3>' + basisLink('card') + '</div>' + stages + '<div class="kv"><span>세 단계 모두 채우면 카드 소득공제</span><b>' + won(plan.totalDeduction) + '</b></div><div class="kv"><span>예상 절세 합계</span><b>' + won(plan.totalTaxSaving) + '</b></div><div class="faint">이 순서로 쓸 때 한도가 모두 채워지는 카드 사용 합계는 약 ' + won(plan.saturation) + '입니다(결제수단 구성이 달라지면 지점도 달라짐). 그 뒤 추가 사용은 공제 0. 소득공제는 소득공제 최대 한도 ' + won(rp.overallDeductionCap.amount) + ' 안에서만 적용.</div></section>' +
      '<section class="card"><div class="row-between"><h3>의료비</h3>' + basisLink('medical') + '</div><div class="kv"><span>혜택 시작(연봉 3%)</span><b>' + won(plan.medical.threshold) + '</b></div>' + bar(plan.medical.progress) + '<div class="kv"><span>지금까지 입력한 의료비</span><b>' + won(plan.medical.current) + '</b></div><div class="muted">초과분의 ' + rate(plan.medical.rate) + ' 세액공제. 일반 부양가족은 공제대상 ' + won(plan.medical.generalCap) + ' 한도, 본인·65세 이상·6세 이하·장애인은 한도 없음. 실손보험금 보전분 제외.</div></section>' +
      '<section class="card"><div class="row-between"><h3>기부금</h3>' + basisLink('donation') + '</div><div class="kv"><span>고향사랑기부 ' + won(plan.donation.hometownLowCap) + '까지</span><b>100/110 전액 공제</b></div><div class="kv"><span>고향사랑 초과분</span><b>' + rate(plan.donation.hometownRate) + '</b></div><div class="kv"><span>특례·일반 ' + won(plan.donation.generalLowUpTo) + ' 이하</span><b>' + rate(plan.donation.generalLowRate) + '</b></div><div class="kv"><span>특례·일반 초과분</span><b>' + rate(plan.donation.generalHighRate) + '</b></div><div class="muted">' + esc(plan.donation.capNote) + '. 세액공제는 내야 할 세금(' + won(a.determinedTax) + ') 범위에서만 효과가 있습니다.</div></section>' +
      '<section class="card"><h3>연봉에 따라 자동 적용된 값</h3><div class="pill-list">' +
      '<span class="chip">' + esc(a.limitTier.label) + ' · 기본 ' + won(a.limitTier.basic) + ' + 추가 ' + won(a.limitTier.extra) + '</span>' +
      '<span class="chip">카드 공제 시작선 ' + won(a.minUse) + '</span>' +
      '<span class="chip">문화체육 30% ' + (a.cultureEligible ? '적용' : '미적용(7천만원 초과)') + '</span>' +
      '<span class="chip">의료비 문턱 ' + won(a.medicalThreshold) + '</span>' +
      '<span class="chip">월세 ' + (a.rent.eligibleByGross ? rate(a.rent.rate) + '(무주택 세대주 요건 별도)' : '대상 아님(8천만원 초과)') + '</span>' +
      '<span class="chip">연금계좌 ' + rate(a.pensionRate) + '</span>' +
      '<span class="chip">주택청약 ' + (a.subscriptionEligibleByGross ? '대상(7천만원 이하)' : '대상 아님') + '</span>' +
      '<span class="chip">세금 매기는 소득 ' + won(a.taxBase) + ' → 세율 ' + rate(a.marginal.rate) + ' 구간(추정)</span>' +
      '<span class="chip">내야 할 세금(추정) ' + won(a.determinedTax) + '</span></div><div class="faint">예상 금액이에요(확정 환급액 아님).</div></section>' +
      '<div class="btns"><a class="btn primary" href="#/home">홈으로</a><a class="btn" href="#/settings">연봉·가족 수정</a><a class="btn" href="#/input">지출 입력</a></div>';
    shell('최적 사용 플랜', body);
  }

  // ---------- 전체 절세 설계 ----------
  // 실제 입력과 별개인 시뮬레이션. 선택·금액은 state.scenario 에 저장해 다시 열어도 유지된다.
  function planTabs(on) { return '<div class="tabs"><a class="btn' + (on === 'plan' ? ' on' : '') + '" href="#/plan">카드 사용 플랜</a><a class="btn' + (on === 'max' ? ' on' : '') + '" href="#/maximize">전체 절세 설계</a></div>'; }
  function viewMaximize() {
    var rp = rules();
    if (!rp) return shell('전체 절세 설계', '<div class="err">' + state.profile.year + '년 규칙팩이 없습니다.</div>');
    var d = E.buildTaxDesign(state, rp, state.scenario);
    if (!d.available) return shell('전체 절세 설계', planTabs('max') + '<section class="card"><h3>연봉을 먼저 입력하세요</h3><p class="muted">연봉을 넣으면 돌려받을 수 있는 돈을 항목별로 모두 계산합니다.</p><a class="btn primary" href="#/plan">연봉 입력하러 가기</a></section>');
    var sc = state.scenario;
    var top = '<section class="card dark"><h2>최대로 돌려받는 설계 · 추정</h2>' +
      '<div class="grid2"><div><div class="muted">아무 공제도 안 했을 때 세금</div><b style="font-size:18px">' + won(d.baselineTax) + '</b></div><div><div class="muted">이 설계대로 했을 때 세금</div><b style="font-size:18px">' + won(d.finalTax) + '</b></div></div>' +
      '<div class="kv"><span>총 돌려받는 돈(소득세+지방세)</span><b style="font-size:20px">' + won(d.totalSaving) + '</b></div>' +
      '<div class="kv"><span>선택 항목 ' + d.selectedCount + '개 · 사용·납입 합계</span><b>' + won(d.totalUse) + '</b></div>' +
      '<p class="muted" style="margin:6px 0 0">체크한 항목을 위에서부터 차례로 더하며 세금을 다시 계산했습니다. 체크 안 한 항목은 “선택 시 +금액”으로 추가 효과를 보여줍니다. 실제 입력(지출·공제)과 별개인 설계이며 확정 환급액이 아닙니다.</p></section>';
    if (d.taxExhausted) top += '<div class="warn"><b>세금이 0원이 되었습니다.</b><span>더 선택해도 줄일 세금이 없습니다. 혜택이 0원으로 나온 항목은 빼도 되고, 연금저축처럼 큰 금액이 드는 항목의 금액을 줄여도 결과가 같은지 확인해 보세요.</span></div>';
    if (d.estimatedPayroll) top += '<div class="faint">급여 입력이 없어 4대보험 공제는 연봉을 월할한 추정치로 넣었습니다.</div>';
    // 조건은 해당 항목 옆에서 바로 고른다(위에 따로 모아두면 체크와 헷갈림)
    var homelessCtl = function (where) { return '<label class="dctl"><input type="checkbox" data-action="design-cond" name="homelessHead"' + (d.homelessHead ? ' checked' : '') + '> 나는 <b>무주택 세대주</b>입니다' + (where ? ' <span class="faint">(' + esc(where) + ')</span>' : '') + '</label>'; };
    var mortgageCtl = '<label class="dctl">대출 조건(한도 결정)<select data-action="design-cond" name="mortgageCapKey">' + (state.profile.mortgageCapKey ? '' : '<option value="" selected>미선택 — 대출 약정서 보고 선택</option>') + rp.housing.mortgageInterest.capOptions.map(function (o) { return '<option value="' + o.key + '"' + (state.profile.mortgageCapKey === o.key ? ' selected' : '') + '>' + esc(o.label) + ' · 한도 ' + won(o.cap) + '</option>'; }).join('') + '</select></label>';
    var smeCtl = '<label class="dctl">감면 구분<select data-action="design-cond" name="smeCategory">' + opts(L.sme, d.smeCategory) + '</select></label>';
    var rowCtl = { SUBSCRIPTION: homelessCtl('주거 공제와 같은 조건'), MORTGAGE: mortgageCtl, SME: smeCtl };
    function saveCell(r) {
      if (r.na) return '<span class="faint">대상 아님</span>';
      if (r.locked) return '<span class="faint">조건 필요</span>';
      if (r.on) return '<b class="save">' + won(r.saving || 0) + '</b>' + (r.deduction > 0 && !r.saving ? '<div class="faint">세금 소진</div>' : '');
      return '<span class="pot">선택 시 +' + won(r.potential || 0) + '</span>';
    }
    var groups = d.groups.map(function (g) {
      var head = '<div class="row-between dgroup-head"><h3>' + esc(g.label) + ' <span class="faint">' + esc(g.type) + '</span></h3><b class="save">' + won(g.saving) + '</b></div>' + (g.key === 'HOUSING' ? '<div class="dgroup-ctl">' + homelessCtl('월세·전세대출·주택청약 공제 요건') + '</div>' : '');
      var items;
      if (g.key === 'FAMILY') {
        items = '<div class="ditem self"><span></span><div class="dmain"><b>본인</b><div class="faint">기본공제 ' + won(rp.personal.basic) + '(항상 포함, 기준 세금에 반영)</div></div><div class="dsave"></div><div class="dnums"></div></div>' +
          g.items.map(function (r) {
            var who = (r.alias || r.label || L.rel[r.relation]) + ' · ' + L.rel[r.relation] + (r.birthYear ? ' · ' + r.birthYear + '년생' : '');
            var why = r.flag ? (r.flag.isBasicDeductionTarget ? '기본공제 대상' + (r.flag.isSenior ? ' · 경로우대' : '') + (r.flag.isDisabled ? ' · 장애인' : '') + (r.flag.isChildTaxCreditTarget ? ' · 자녀세액공제' : '') : r.flag.reasonBasic) : '';
            return '<div class="ditem' + (r.on ? '' : ' off') + '"><label class="dchk"><input type="checkbox" data-action="design-fam" data-id="' + esc(r.id) + '"' + (r.virtual ? ' data-virtual="1"' : '') + (r.on ? ' checked' : '') + '></label><div class="dmain"><b>' + esc(who) + '</b> ' + (r.virtual ? badge('가상', 'gray') + ' <button class="btn link" data-action="design-fam-del" data-id="' + esc(r.id) + '">삭제</button>' : badge('내 가족', 'navy')) + '<div class="faint">' + esc(why) + (r.on && r.creditNote ? ' · 자녀·출산 세액공제 +' + won(r.creditNote) : '') + '</div>' + famBreakdown(r) + '</div><div class="dsave">' + saveCell(r) + '</div><div class="dnums"><div><span>공제금액</span>' + won(r.on ? r.deduction : r.potentialDeduction) + '</div></div></div>';
          }).join('') +
          '<form data-form="design-family" class="form dadd"><b class="full">부양가족 추가(가상)</b><label>관계<select name="relation">' + opts(L.rel, 'LINEAL_ASCENDANT') + '</select></label><label>별칭<input name="alias" placeholder="예: 어머니"></label><label>출생연도<input name="birthYear" inputmode="numeric" placeholder="예: 1955" required></label><label class="row"><input type="checkbox" name="disability">장애인</label><label class="row"><input type="checkbox" name="born">올해 출생·입양</label><label>자녀 순번(출생·입양 시)<select name="childOrder"><option value="">-</option><option value="1">첫째</option><option value="2">둘째</option><option value="3">셋째 이상</option></select></label><div class="faint full">연소득 100만원 이하(근로소득만 있으면 연봉 500만원 이하)라고 가정합니다. 실제 가족은 설정에서 입력하세요.</div><div class="full btns"><button class="btn" type="submit">가족 추가</button></div></form>';
      } else {
        items = g.items.map(function (r) {
          var amt = r.toggleOnly ? '<span class="faint">' + esc(r.cap) + '</span>' : '<input class="damt" inputmode="numeric" data-action="design-amount" data-key="' + r.key + '" value="' + Math.round(r.amount || 0).toLocaleString('ko-KR') + '"' + (r.na || r.locked ? ' disabled' : '') + '>' + (r.fromActual ? '<div class="faint">내 입력값</div>' : (r.example && !r.max ? '<div class="faint">예시 금액</div>' : ''));
          return '<div class="ditem' + (r.on ? '' : ' off') + (r.na ? ' na' : '') + '"><label class="dchk"><input type="checkbox" data-action="design-toggle" data-key="' + r.key + '"' + (r.on ? ' checked' : '') + (r.na || r.locked ? ' disabled' : '') + '></label><div class="dmain"><b>' + esc(r.label) + '</b><div class="faint">' + esc(r.sub) + (r.blockedReason ? ' · <span class="warn-ink">' + esc(r.blockedReason) + '</span>' : '') + '</div>' + (rowCtl[r.key] || '') + '</div><div class="dsave">' + saveCell(r) + '</div>' +
            '<div class="dnums"><div><span>요율</span>' + esc(r.rate) + '</div><div><span>한도</span>' + esc(r.cap) + '</div><div><span>' + (r.toggleOnly ? '금액' : '사용·납입액') + '</span>' + amt + '</div><div><span>공제금액</span>' + won(r.on ? r.deduction : r.potentialDeduction) + '</div></div></div>';
        }).join('');
      }
      return '<section class="card dgroup">' + head + items + '</section>';
    }).join('');
    // 대분류별 예상 세제혜택 합계(선택한 항목 기준) + 화면 아래 고정 합계 바
    var gsum = d.groups.map(function (g) {
      var on = g.items.filter(function (r) { return r.on; });
      return { label: g.label, n: on.length, use: g.use, ded: on.reduce(function (s2, r) { return s2 + (r.deduction || 0); }, 0), saving: g.saving };
    });
    var totals = '<section class="card"><h3>대분류별 돌려받는 돈 합계</h3><div class="tbl-wrap"><table class="sum-table"><thead><tr><th>대분류</th><th class="num">선택</th><th class="num">사용·납입액</th><th class="num">공제금액</th><th class="num">돌려받는 돈</th></tr></thead><tbody>' +
      gsum.map(function (x) { return '<tr' + (x.n ? '' : ' class="dim"') + '><td>' + esc(x.label) + '</td><td class="num">' + x.n + '개</td><td class="num">' + (x.use ? won(x.use) : '—') + '</td><td class="num">' + won(x.ded) + '</td><td class="num"><b>' + won(x.saving) + '</b></td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td><b>합계</b></td><td class="num"><b>' + d.selectedCount + '개</b></td><td class="num"><b>' + won(d.totalUse) + '</b></td><td class="num">—</td><td class="num"><b>' + won(d.totalSaving) + '</b></td></tr></tfoot></table></div>' +
      '<div class="faint">세금 ' + won(d.baselineTax) + ' → ' + won(d.finalTax) + '. 공제금액은 소득공제·세액공제가 섞여 있어 합계를 내지 않습니다. 돌려받는 돈 합계 = 기준 세금 − 설계 후 세금.</div></section>';
    var bar = '<div class="total-bar"><span>돌려받는 돈 합계</span><b>' + won(d.totalSaving) + '</b><span class="faint">세금 ' + won(d.baselineTax) + ' → ' + won(d.finalTax) + '</span></div>';
    shell('전체 절세 설계', planTabs('max') + top + totals + groups + '<div class="btns"><button class="btn small" data-action="design-reset">설계 초기화(선택·금액 처음 상태로)</button></div>' + bar + '<div class="faint">항목별 요건(무주택, 소득요건, 장애인 등)을 충족해야 실제 공제돼요. ' + basisLink() + '</div>');
  }
  // 인적공제 구성 표시: 기본 150만 + 한부모 100만 처럼. 한부모·부녀자는 자동 판정이라 이유를 덧붙인다.
  function famBreakdown(r) {
    var b = r.breakdown || []; if (!b.length) return '';
    var why = { singleParent: '배우자 없이 기본공제 대상 자녀가 있어 자동 적용', woman: '여성 근로자 요건 충족으로 자동 적용' };
    return '<div class="fam-bd">' + b.map(function (x) { return '<span class="chip' + (x.amount < 0 ? ' neg' : '') + '">' + esc(x.label) + ' ' + (x.amount > 0 ? '+' : '−') + won(Math.abs(x.amount)) + '</span>'; }).join('') +
      b.filter(function (x) { return why[x.key]; }).map(function (x) { return '<div class="faint">' + esc(x.label) + (x.amount > 0 ? ' 공제 포함: ' + why[x.key] : ' 공제 제외: 이 가족을 넣으면 요건에서 빠짐(예: 배우자 추가 시 한부모 공제 대신 배우자 기본공제)') + '</div>'; }).join('') + '</div>';
  }
  function saveScenario() { var y = window.scrollY; return persist().then(function () { render(); window.scrollTo(0, y); }); }
  function scenarioItem(key) { state.scenario.items = state.scenario.items || {}; return (state.scenario.items[key] = state.scenario.items[key] || {}); }

  // ---------- S01 홈 ----------
  function viewHome() {
    var rp = rules();
    if (!rp) return shell('연말정산 카드공제 계산기', '<div class="err">규칙팩 없음</div>');
    var r = E.calc(state, rp);
    var body = '';
    if (r.blocked) {
      body += '<section class="card"><h3>시작하기</h3><p class="muted">연봉이 없어 계산을 보류했습니다: ' + esc(r.missingFields.join(', ')) + '</p><div class="btns"><a class="btn primary" href="#/plan">연봉 입력하고 플랜 보기</a><a class="btn" href="#/settings">설정</a><button class="btn" data-action="demo">예시 데이터 불러오기</button></div></section>';
      return shell('연말정산 카드공제 계산기', body);
    }
    var gi = r.grossInfo;
    body += '<section class="card"><div class="row-between"><h2>예상 연봉(비과세 제외)</h2><span class="muted">' + (gi.mode === 'MONTHLY' ? '월별 추정 방식' : '예상연봉 고정 방식') + '</span></div><div class="big">' + won(r.gross) + '</div>' + (gi.mode === 'MONTHLY' ? '<div class="grid2"><div><div class="muted">실제 입력</div><b>' + won(gi.actual) + '</b></div><div><div class="muted">예상</div><b>' + won(gi.forecast) + '</b></div></div>' : '') + '</section>';
    var c = r.card;
    body += '<section class="card"><div class="row-between"><h2>카드 등 사용액(공제대상, 본인' + (c.familyIncluded.length ? '+가족 ' + c.familyIncluded.length + '명' : '') + ')</h2>' + (c.eligible ? badge('카드 공제 시작선 도달', 'green') : badge('카드 공제 시작선 미달', 'amber')) + '</div><div class="mid">' + won(c.total) + '</div>' +
      '<div class="kv muted"><span>카드 공제 시작선 ' + won(c.minUse) + '(연봉 25%)</span><span>' + (c.minUse ? pct(c.total / c.minUse) : '-') + '</span></div>' + bar(c.minUse ? c.total / c.minUse : 0, true) +
      '<div class="kv muted"><span>기본 공제 한도 ' + won(c.basicLimit) + ' 중 공제 ' + won(c.general) + '</span><span>' + pct(c.general / c.basicLimit) + '</span></div>' + bar(c.general / c.basicLimit) +
      '<div class="kv muted"><span>시장·교통 추가 한도 ' + won(c.extraLimit) + ' 중 공제 ' + won(c.extra) + '</span><span>' + pct(c.extra / c.extraLimit) + '</span></div>' + bar(c.extra / c.extraLimit) +
      '<div class="kv"><span>카드 소득공제(현재)</span><b>' + won(c.total_deduction) + '</b></div>' + (Object.keys(c.bySpender).length > 1 ? '<details><summary>사용자별 분리 집계</summary>' + Object.keys(c.bySpender).map(function (k) { var f = state.family.find(function (x) { return x.id === k; }); return '<div class="kv muted"><span>' + esc(k === 'self' ? '본인' : (f ? f.alias || L.rel[f.relation] : k)) + '</span><span>' + won(c.bySpender[k].total) + (k !== 'self' && c.familyIncluded.indexOf(k) < 0 ? ' · 분리(본인 공제에 넣지 않음)' : '') + '</span></div>'; }).join('') + '</details>' : '') + '<a href="#/detail">정산 상세 보기 ›</a></section>';
    var plan = E.buildOptimalPlan(state, rp);
    var next = plan.stages.filter(function (s) { return s.need > 0; })[0];
    body += '<section class="card dark"><h2>권장 행동</h2>' + (next ? '<p style="margin:0">다음 단계 <b>' + esc(next.label) + '</b>: ' + esc(next.method) + '로 <b>' + won(next.need) + '</b> 더 쓰면 ' + (next.key === 'THRESHOLD' ? '공제 구간에 들어갑니다' : '소득공제 ' + won(next.deduction) + ', 절세 약 ' + won(next.taxSaving)) + '.</p>' : '<p style="margin:0">카드 한도를 모두 채웠습니다. 추가 카드 사용은 공제가 없습니다.</p>') + '<div class="btns"><a class="btn" style="background:#fff" href="#/plan">플랜 전체 보기</a><a class="btn" style="background:#fff" href="#/design">배분안 비교</a></div></section>';
    body += '<section class="card"><div class="row-between"><h2>예상 정산</h2>' + badge(r.standardChoice === 'STANDARD' ? '기본 세액공제(13만원) 적용' : '특별공제 적용', 'gray') + '</div><div class="grid2"><div><div class="muted">내야 할 세금+지방소득세</div><b>' + won(r.totalTax) + '</b></div><div><div class="muted">정산액</div><b>' + (r.settlement === null ? '보류(미리 낸 세금 미입력)' : (r.settlement < 0 ? '환급 예상 ' + won(-r.settlement) : '추가 납부 예상 ' + won(r.settlement))) + '</b></div></div><div class="faint">확정값이 아닌 예상치입니다.</div></section>';
    var issues = r.missingFields.concat(r.warnings);
    if (issues.length) body += '<section class="warn"><b>확인 ' + issues.length + '건</b>' + issues.map(function (w) { return '<span>· ' + esc(w) + '</span>'; }).join('') + '<a href="#/input">입력하러 가기 ›</a></section>';
    shell('연말정산 카드공제 계산기', body);
  }

  // ---------- S02 입력 ----------
  function viewInput(sub) {
    ui.inputTab = (sub === 'sms' ? 'cards' : sub) || ui.inputTab || 'payroll';
    var tabs = '<div class="tabs">' + [['payroll', '급여'], ['expenses', '지출'], ['recurring', '고정지출'], ['cards', '카드내역']].map(function (t) { return '<a class="btn' + (ui.inputTab === t[0] ? ' on' : '') + '" href="#/input/' + t[0] + '">' + t[1] + '</a>'; }).join('') + '</div>';
    var body = tabs;
    if (ui.inputTab === 'payroll') body += payrollTab();
    else if (ui.inputTab === 'expenses') body += expensesTab();
    else if (ui.inputTab === 'cards') body += cardsTab();
    else body += recurringTab();
    shell('월별 입력', body);
  }


  // ---------- 카드내역 업로드 ----------
  // 카드사 공식 홈페이지에서 사용자가 직접 로그인·다운로드한 엑셀/CSV만 읽는다. PC 크롬·엣지는 연결한 폴더를 자동 확인하고, 그 외에는 파일 선택.
  var canWatchDir = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  function pad2(n) { return String(n).padStart(2, '0'); }
  // 홈택스에서 받은 현금영수증 파일은 카드 대신 이 가상 수단으로 처리(결제수단 = 현금영수증)
  var CASH = { id: '__cash', alias: '현금영수증', paymentMethod: 'CASH_RECEIPT', spenderId: 'self' };
  function findCard(id) { return id === '__cash' ? CASH : (state.cards.find(function (c) { return c.id === id; }) || null); }
  function buildPreview(en) {
    en.result = null; en.parsed = null;
    if (!en.map) return;
    en.parsed = CI.parseRows(en.rows, en.map, state.profile.year);
    en.result = CI.buildExpenses(en.parsed.items, state.expenses, state.cards, uid, state.merchantRules, findCard(en.cardId));
  }
  function ingestFile(name, key, buf) {
    if (ui.importQueue.some(function (q) { return q.key === key; })) return;
    var en = { name: name, key: key, cardId: '' };
    try {
      if (typeof XLSX === 'undefined') throw new Error('엑셀 읽기 모듈(js/vendor/xlsx.full.min.js)을 불러오지 못했습니다');
      en.rows = CI.readWorkbookRows(XLSX, buf, name);
      en.map = CI.detectHeader(en.rows);
      if (!en.map) { var hr = CI.guessHeaderRow(en.rows); en.guessRow = hr; en.map = state.importMappings[CI.headerSignature(en.rows[hr])] || null; }
      var guess = state.cards.find(function (c) { return c.alias && name.indexOf(c.alias) >= 0; });
      if (guess) en.cardId = guess.id;
      if (CI.isCashReceiptFile(en.rows, name)) en.cardId = '__cash';
      buildPreview(en);
    } catch (e) { en.error = e && e.message || String(e); }
    ui.importQueue.push(en);
    if (location.hash.indexOf('#/input') === 0 && ui.inputTab === 'cards') render(); else toast('새 카드내역 파일: ' + name + ' — 월별 입력 › 카드내역에서 확인하세요');
  }
  function readAndIngest(file) {
    var key = CI.fileKey(file);
    if (state.importedFiles[key]) { toast('이미 처리한 파일입니다: ' + file.name); return Promise.resolve(); }
    return file.arrayBuffer().then(function (buf) { ingestFile(file.name, key, buf); });
  }
  // 휴대폰 '공유하기'로 받은 파일(sw.js가 share-inbox 캐시에 넣어 둠)을 꺼내 미리보기로 보낸다
  function takeSharedFiles() {
    if (typeof caches === 'undefined') return Promise.resolve();
    return caches.open('share-inbox').then(function (cache) {
      return cache.keys().then(function (reqs) {
        return reqs.reduce(function (p, req) {
          return p.then(function () { return cache.match(req); }).then(function (res) {
            if (!res) return;
            var name = decodeURIComponent(res.headers.get('X-File-Name') || '공유파일.xlsx');
            return res.arrayBuffer().then(function (buf) {
              var key = 'share|' + name + '|' + buf.byteLength;
              if (state.importedFiles[key]) toast('이미 처리한 파일입니다: ' + name); else ingestFile(name, key, buf);
              return cache.delete(req);
            });
          });
        }, Promise.resolve()).then(function () { if (reqs.length) { ui.inputTab = 'cards'; go('#/input/cards'); } });
      });
    }).catch(function () { /* 캐시 사용 불가 환경 */ });
  }
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').catch(function () { /* http(비보안) 주소 등에서는 공유하기만 빠지고 앱은 그대로 동작 */ });
  }

  var scanning = false;
  function scanDir() {
    if (scanning || !ui.dir || ui.dir.perm !== 'granted') return Promise.resolve();
    scanning = true;
    var found = [], it = ui.dir.handle.values();
    function next() { return it.next().then(function (r) { if (r.done) return; if (r.value.kind === 'file' && CI.isSheetFile(r.value.name)) found.push(r.value); return next(); }); }
    return next().then(function () {
      return found.reduce(function (p, h) {
        return p.then(function () { return h.getFile(); }).then(function (f) {
          var key = CI.fileKey(f);
          if (state.importedFiles[key] || ui.importQueue.some(function (q) { return q.key === key; })) return;
          return f.arrayBuffer().then(function (buf) { ingestFile(f.name, key, buf); });
        });
      }, Promise.resolve());
    }).catch(function () { ui.dir.perm = 'prompt'; }).then(function () { scanning = false; ui.dir.lastScan = new Date(); });
  }
  function connectDir() {
    window.showDirectoryPicker({ id: 'card-statements', mode: 'read', startIn: 'downloads' }).then(function (h) {
      ui.dir = { handle: h, name: h.name, perm: 'granted' };
      return S.saveDirHandle(h).then(function () { toast('폴더 연결됨: ' + h.name); return scanDir(); }).then(render);
    }).catch(function (e) { if (e && e.name !== 'AbortError') toast('폴더 연결 실패: ' + e.message + ' (다운로드 폴더 자체는 연결할 수 없으니 그 안에 "카드내역" 폴더를 만들어 고르세요)', true); });
  }
  function regrantDir() {
    ui.dir.handle.requestPermission({ mode: 'read' }).then(function (p) { ui.dir.perm = p; if (p === 'granted') return scanDir(); }).then(render);
  }
  function restoreDir() {
    if (!canWatchDir) return;
    S.loadDirHandle().then(function (h) {
      if (!h) return;
      ui.dir = { handle: h, name: h.name, perm: 'prompt' };
      return h.queryPermission({ mode: 'read' }).then(function (p) { ui.dir.perm = p; if (p === 'granted') return scanDir(); });
    }).catch(function () { /* 핸들 복원 불가 브라우저는 파일 선택만 사용 */ }).then(function () { if (ui.inputTab === 'cards') render(); });
  }
  setInterval(function () { if (ui.dir && ui.dir.perm === 'granted' && !document.hidden) scanDir(); }, 5000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && ui.dir && ui.dir.perm === 'granted') scanDir(); });

  // 월별 사용 합계(결제수단별): 카드·현금영수증 내역을 올리면 달마다 얼마 썼는지 한눈에. 취소는 빼고, 공제 안 되는 지출은 제외
  function monthlyUsage() {
    var y = String(state.profile.year), M = {};
    (state.expenses || []).forEach(function (e) {
      if (!e.date || e.date.slice(0, 4) !== y || e.useCategory === 'EXCLUDED' || e.paymentMethod === 'CASH_NONE') return;
      var m = e.date.slice(5, 7), v = e.refundOf ? -e.amount : e.amount, r = M[m] = M[m] || { CREDIT: 0, DEBIT: 0, CASH_RECEIPT: 0, mt: 0, total: 0 };
      if (r[e.paymentMethod] !== undefined) r[e.paymentMethod] += v;
      if (e.useCategory === 'TRADITIONAL_MARKET' || e.useCategory === 'PUBLIC_TRANSIT') r.mt += v;
      r.total += v;
    });
    var ms = Object.keys(M).sort(); if (!ms.length) return '';
    var T = { CREDIT: 0, DEBIT: 0, CASH_RECEIPT: 0, mt: 0, total: 0 };
    var rows = ms.map(function (m) { var r = M[m]; Object.keys(T).forEach(function (k) { T[k] += r[k]; }); return '<tr><td>' + Number(m) + '월</td><td class="num">' + won(r.CREDIT) + '</td><td class="num">' + won(r.DEBIT) + '</td><td class="num">' + won(r.CASH_RECEIPT) + '</td><td class="num">' + won(r.mt) + '</td><td class="num"><b>' + won(r.total) + '</b></td></tr>'; }).join('');
    return '<section class="card"><h3>월별 사용 합계 <span class="faint">(' + y + '년, 공제 대상만)</span></h3><div class="tbl-wrap"><table class="pay-table"><thead><tr><th>월</th><th class="num">신용카드</th><th class="num">체크·직불</th><th class="num">현금영수증</th><th class="num">그중 시장·교통</th><th class="num">합계</th></tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td><b>합계</b></td><td class="num">' + won(T.CREDIT) + '</td><td class="num">' + won(T.DEBIT) + '</td><td class="num">' + won(T.CASH_RECEIPT) + '</td><td class="num">' + won(T.mt) + '</td><td class="num"><b>' + won(T.total) + '</b></td></tr></tfoot></table></div><div class="faint">취소 건은 빼고 계산했어요. 보험료·세금 등 공제 안 되는 지출은 넣지 않았어요.</div></section>';
  }

  function cardsTab() {
    var links = '<section class="card"><h3>1. 카드사 홈페이지에서 이용내역 받기</h3><div class="faint">버튼을 누르면 카드사 공식 홈페이지가 새 창으로 열립니다. 직접 로그인해 이용내역을 엑셀로 내려받으세요(월말 권장). 문자·메일로 받은 링크나 첨부파일은 쓰지 마세요. 목록에 없는 카드도 엑셀·CSV 파일이면 올릴 수 있습니다.</div>' +
      ['현금영수증', '카드사', '은행', '체크카드'].map(function (g) { return '<div class="faint" style="margin-top:6px">' + (g === '현금영수증' ? '<b>현금영수증</b> — 홈택스 로그인 → 조회/발급 → 현금영수증 → 현금영수증 조회(사용내역) → 기간(월)을 고르고 엑셀 내려받기' : g === '은행' ? '은행 카드(신용·체크)' : g === '체크카드' ? '인터넷은행·우체국·상호금융 체크카드' : '카드사') + '</div><div class="btns">' + CI.ISSUERS.filter(function (i) { return i.group === g; }).map(function (i) { return '<a class="btn small" href="' + i.url + '" target="_blank" rel="noopener noreferrer">' + esc(i.name) + '</a>'; }).join('') + '</div>'; }).join('') + '</section>';
    var dirBox;
    if (!canWatchDir) dirBox = '<div class="faint">이 브라우저는 폴더 자동 확인을 지원하지 않습니다(휴대폰 등). 휴대폰에서 이 앱을 홈 화면에 설치했다면, 내려받은 파일을 <b>공유 → 연말정산</b>으로 보내면 바로 아래에 미리보기가 나타납니다. 또는 파일 선택을 쓰세요.</div>';
    else if (!ui.dir) dirBox = '<div class="faint">PC에서 한 번만 연결하면, 그 폴더에 저장한 카드내역 파일을 앱이 자동으로 읽습니다. 다운로드 폴더 안에 <b>카드내역</b> 폴더를 만들어 연결하세요(다운로드 폴더 자체는 브라우저가 막습니다). 권한을 물으면 ‘방문할 때마다 허용’을 고르세요.</div><div class="btns"><button class="btn primary" data-action="connect-dir">카드내역 폴더 연결</button></div>';
    else if (ui.dir.perm !== 'granted') dirBox = '<div class="faint">연결된 폴더: <b>' + esc(ui.dir.name) + '</b> — 브라우저가 다시 허용을 요청합니다.</div><div class="btns"><button class="btn primary" data-action="regrant-dir">폴더 다시 허용</button><button class="btn" data-action="disconnect-dir">연결 해제</button></div>';
    else dirBox = '<div>' + badge('자동 확인 중', 'green') + ' 연결된 폴더: <b>' + esc(ui.dir.name) + '</b>' + (ui.dir.lastScan ? ' <span class="faint">· 마지막 확인 ' + pad2(ui.dir.lastScan.getHours()) + ':' + pad2(ui.dir.lastScan.getMinutes()) + ':' + pad2(ui.dir.lastScan.getSeconds()) + '</span>' : '') + '</div><div class="faint">이 폴더에 새 파일을 저장하면 몇 초 안에 아래에 미리보기가 나타납니다.</div><div class="btns"><button class="btn small" data-action="scan-dir">지금 확인</button><button class="btn small" data-action="disconnect-dir">연결 해제</button></div>';
    var upload = '<section class="card"><h3>2. 내려받은 파일 올리기</h3>' + dirBox + '<div class="btns"><label class="btn" style="cursor:pointer">파일 선택(.xlsx·.xls·.csv)<input type="file" accept=".xlsx,.xls,.csv" multiple data-action="import-file" style="display:none"></label></div><div class="faint">파일은 이 브라우저 안에서만 읽고 어디에도 보내지 않습니다. 같은 파일을 다시 올려도 중복 추가되지 않습니다.</div></section>';
    var queue = ui.importQueue.map(function (en, qi) {
      var head = '<section class="card"><h3>3. 확인 후 추가 — ' + esc(en.name) + '</h3>';
      var skipBtn = '<button class="btn" data-action="import-skip" data-qi="' + qi + '">이 파일 건너뛰기</button>';
      if (en.error) return head + '<div class="err">읽지 못했습니다: ' + esc(en.error) + '</div><div class="btns">' + skipBtn + '</div></section>';
      if (!en.map) {
        var hdr = en.rows[en.guessRow] || [];
        var colSel = function (label, name, optional) { return '<label>' + label + '<select name="' + name + '">' + (optional ? '<option value="">없음</option>' : '') + hdr.map(function (h, i) { return '<option value="' + i + '">' + (i + 1) + '열: ' + esc(String(h).slice(0, 20)) + '</option>'; }).join('') + '</select></label>'; };
        return head + '<div class="warn">열 제목을 자동으로 찾지 못했습니다. 열을 골라 주세요(같은 양식은 기억해 다음부터 자동 적용).</div><form data-form="import-map" class="form"><input type="hidden" name="qi" value="' + qi + '">' + colSel('이용일', 'date') + colSel('가맹점', 'merchant') + colSel('이용금액', 'amount') + colSel('취소·상태(선택)', 'status', true) + colSel('카드번호(선택)', 'card', true) + '<div class="full btns"><button class="btn primary" type="submit">이 열로 읽기</button>' + skipBtn + '</div></form></section>';
      }
      var r = en.result;
      var rows = r.added.map(function (x, i) {
        return '<tr><td>' + x.date + '<br>' + (x.refundOf ? badge('취소', 'gray') : badge('승인', 'green')) + '</td><td class="num">' + (x.refundOf ? '−' : '') + won(x.amount) + '</td><td>' + esc(x.merchant) + (x.needsReview ? '<br>' + badge('확인 필요', 'gray') : '') + '</td><td>' + (x.refundOf ? esc(L.cat[x.useCategory]) : '<select name="cat_' + qi + '_' + i + '">' + opts(L.cat, x.useCategory) + '</select>') + '</td><td>' + (x.refundOf ? esc(L.pm[x.paymentMethod]) : '<select name="pm_' + qi + '_' + i + '">' + opts(L.pm, x.paymentMethod) + '</select>') + '</td></tr>';
      }).join('');
      var notes = '';
      if (r.skipped.length) notes += '<div class="faint">이미 추가된 거래라 제외: ' + r.skipped.length + '건</div>';
      if (en.parsed.outOfYear) notes += '<div class="faint">연말정산 연도(' + state.profile.year + ') 밖 거래 제외: ' + en.parsed.outOfYear + '건</div>';
      if (en.parsed.notDeductible) notes += '<div class="faint">사업자용(지출증빙)·불공제 현금영수증 제외: ' + en.parsed.notDeductible + '건</div>';
      if (r.unmatchedCancels.length) notes += '<div class="faint">원거래가 없는 취소(이미 상계된 것으로 보고 제외): ' + r.unmatchedCancels.map(function (c) { return esc(c.date + ' ' + won(c.amount) + ' ' + c.merchant); }).join(', ') + '</div>';
      var cardSel = '<label class="full">이 파일의 카드<select data-action="import-card" data-qi="' + qi + '"><option value="">미지정(신용카드·본인으로 처리)</option><option value="__cash"' + (en.cardId === '__cash' ? ' selected' : '') + '>현금영수증(국세청 자료)</option>' + state.cards.map(function (c) { return '<option value="' + c.id + '"' + (c.id === en.cardId ? ' selected' : '') + '>' + esc(c.alias) + ' (' + esc(c.last4) + ' · ' + esc(L.pm[c.paymentMethod]) + ')</option>'; }).join('') + '</select></label>';
      return head + '<div class="form">' + cardSel + '</div><div class="faint">사용처 구분을 고치면 다음부터 같은 가맹점에 자동 적용됩니다. 분류가 불확실하면 일반으로 집계되며 ‘확인 필요’가 붙습니다.</div><div class="tbl-wrap"><table><thead><tr><th>일자</th><th class="num">금액</th><th>가맹점</th><th>사용처 구분</th><th>결제수단</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5" class="muted">추가할 건이 없습니다</td></tr>') + '</tbody></table></div>' + notes +
        '<div class="btns"><button class="btn primary" data-action="import-commit" data-qi="' + qi + '"' + (r.added.length ? '' : ' disabled') + '>' + r.added.length + '건 추가</button>' + skipBtn + '</div></section>';
    }).join('');
    var cardRows = state.cards.map(function (c) { return '<tr><td>' + esc(c.alias) + '</td><td>' + esc(c.last4) + '</td><td>' + esc(L.pm[c.paymentMethod]) + '</td><td>' + esc(c.spenderId === 'self' ? '본인' : (state.family.find(function (f) { return f.id === c.spenderId; }) || {}).alias || c.spenderId) + '</td><td><button class="btn small danger" data-action="del-card" data-id="' + c.id + '">삭제</button></td></tr>'; }).join('');
    var cards = '<section class="card"><h3>카드 등록(끝 4자리만 저장)</h3><div class="faint">이용내역 파일에는 신용/체크 구분이 없는 경우가 많아, 등록한 카드로 결제수단과 사용자를 판정합니다. 별명을 카드사 이름(예: 우리카드)으로 하면 파일 이름으로 카드를 자동 선택합니다. 카드번호 전체·비밀번호는 입력하지 마세요.</div><form data-form="card" class="form"><label>별명<input name="alias" required placeholder="예: 우리카드"></label><label>끝 4자리<input name="last4" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" required></label><label>종류<select name="paymentMethod">' + opts({ CREDIT: L.pm.CREDIT, DEBIT: L.pm.DEBIT }, 'CREDIT') + '</select></label><label>사용자<select name="spenderId">' + familyOpts('self') + '</select></label><div class="full btns"><button class="btn primary" type="submit">카드 추가</button></div></form><div class="tbl-wrap"><table><thead><tr><th>별명</th><th>끝4자리</th><th>종류</th><th>사용자</th><th></th></tr></thead><tbody>' + (cardRows || '<tr><td colspan="5" class="muted">등록된 카드 없음(미지정 파일은 신용카드·본인으로 가정하고 확인 필요 표시)</td></tr>') + '</tbody></table></div></section>';
    return links + upload + queue + monthlyUsage() + cards;
  }

  // 급여 화면용: 큰 금액은 '49만 5천원'처럼 읽기 쉽게, 어려운 말 옆 ? 한 줄 풀이
  function wonS(n) {
    if (n === null || n === undefined || isNaN(n)) return '—';
    n = Math.round(n); var neg = n < 0; n = Math.abs(n); var s;
    if (n >= 100000000) { var eok = Math.floor(n / 1e8), man0 = Math.round((n % 1e8) / 1e4); s = eok + '억' + (man0 ? ' ' + man0.toLocaleString('ko-KR') + '만' : '') + '원'; }
    else if (n >= 10000) { var man = Math.floor(n / 10000), cheon = Math.round((n % 10000) / 1000); if (cheon === 10) { man++; cheon = 0; } s = man.toLocaleString('ko-KR') + '만' + (cheon ? ' ' + cheon + '천' : '') + '원'; }
    else s = n.toLocaleString('ko-KR') + '원';
    return (neg ? '-' : '') + s;
  }
  var GLOSSARY = {
    비과세: '세금을 안 매기는 급여예요. 대표적으로 식대 월 20만원까지.',
    원천징수: '회사가 매달 월급에서 미리 떼어 낸 세금이에요. 급여명세서의 "소득세"·"지방소득세" 칸이에요.'
  };
  function q(term) { return GLOSSARY[term] ? '<details class="q"><summary aria-label="' + esc(term) + ' 설명">?</summary><span>' + esc(GLOSSARY[term]) + '</span></details>' : ''; }

  function payrollTab() {
    var rp = rules();
    var range = E.employmentRange(state.profile);
    var months = E.monthsInRange(range);
    var edit = ui.editingPayroll ? state.payroll[ui.editingPayroll] || { yearMonth: ui.editingPayroll } : null;
    // 급여표의 [입력]·[수정]을 눌렀을 때만 그 달 입력칸을 연다(입력 경로를 하나로)
    var fmt = function (v) { return v != null && v !== '' ? Number(v).toLocaleString('ko-KR') : ''; };
    var form = !edit ? '' : '<section class="card pay-edit"><h3>' + edit.yearMonth + ' 급여 ' + (state.payroll[edit.yearMonth] ? '수정' : '입력') + '</h3><form data-form="payroll" class="form"><input type="hidden" name="ym" value="' + edit.yearMonth + '">' +
      '<label>급여+상여(세전, 원)<input name="gross" inputmode="numeric" required value="' + fmt(edit.gross) + '"></label>' +
      '<label><span>비과세(원, 식대 등) ' + q('비과세') + '</span><input name="nonTaxable" inputmode="numeric" value="' + (edit.nonTaxable != null ? fmt(edit.nonTaxable) : fmt(Math.round((state.profile.expectedNonTaxable || 0) / 12))) + '"></label>' +
      '<label><span>소득세(급여명세서) ' + q('원천징수') + '</span><input name="incomeTaxWithheld" inputmode="numeric" value="' + fmt(edit.incomeTaxWithheld) + '"></label>' +
      '<label>지방소득세(급여명세서)<input name="localTaxWithheld" inputmode="numeric" value="' + fmt(edit.localTaxWithheld) + '"></label>' +
      '<div class="full btns"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-action="cancel-payroll">취소</button></div></form>' +
      '<div class="faint">4대보험은 자동으로 계산돼요. 급여명세서와 다르면 [보험료]에서 고치세요.</div></section>';
    var rows = months.map(function (m) {
      var p = state.payroll[m];
      if (!p) return '<tr><td><b>' + m + '</b><div class="btns"><button class="btn small primary" data-action="edit-payroll" data-ym="' + m + '">입력</button></div></td><td colspan="6" class="muted">미입력</td></tr>';
      var pr = p.premiums || {};
      function pc(k) { var x = pr[k]; if (!x) return '—'; return (x.amount === null ? '<span class="badge red">확인 필요</span>' : won(x.amount)) + ' ' + badge(x.source === 'MANUAL' ? '수동' : '자동', x.source === 'MANUAL' ? 'navy' : (x.status === 'UNVERIFIED' ? 'amber' : '')); }
      return '<tr><td><b>' + m + '</b> ' + badge(p.status === 'FORECAST' ? '예상' : '실제', p.status === 'FORECAST' ? 'gray' : 'green') + '<div class="btns"><button class="btn small" data-action="edit-payroll" data-ym="' + m + '">수정</button><button class="btn small" data-action="edit-premiums" data-ym="' + m + '">보험료</button><button class="btn small danger" data-action="del-payroll" data-ym="' + m + '">삭제</button></div></td><td class="num">' + won(p.gross) + '<br><span class="faint">비과세 ' + won(p.nonTaxable) + '</span></td><td class="num">' + won(p.incomeTaxWithheld) + '<br><span class="faint">지방 ' + won(p.localTaxWithheld) + '</span></td>' +
        '<td class="num">' + pc('nationalPension') + '</td><td class="num">' + pc('healthInsurance') + '</td><td class="num">' + pc('longTermCare') + '</td><td class="num">' + pc('employmentInsurance') + '</td></tr>';
    }).join('');
    var premForm = '';
    if (ui.editingPremiums && state.payroll[ui.editingPremiums]) {
      var pm = state.payroll[ui.editingPremiums]; var pr2 = pm.premiums || {};
      premForm = '<section class="card"><h3>' + ui.editingPremiums + ' 4대보험 수정(급여명세서 값)</h3><form data-form="premiums" class="form"><input type="hidden" name="ym" value="' + ui.editingPremiums + '">' + ['nationalPension', 'healthInsurance', 'longTermCare', 'employmentInsurance'].map(function (k, i) { var lab = ['국민연금', '건강보험', '장기요양', '고용보험'][i]; var x = pr2[k] || {}; return '<label>' + lab + ' (' + (x.source === 'MANUAL' ? '수동' : '자동') + (x.basis ? ' · ' + esc(x.basis) : '') + ')<input name="' + k + '" inputmode="numeric" value="' + (x.amount == null ? '' : x.amount) + '"></label>'; }).join('') + '<div class="full btns"><button class="btn primary" type="submit">수동값 저장</button><button class="btn" type="button" data-action="reset-premiums" data-ym="' + ui.editingPremiums + '">자동으로 되돌리기</button><button class="btn" type="button" data-action="cancel-premiums">닫기</button></div></form></section>';
    }
    // 입력한 달 합계(표 맨 아래 줄 + 위쪽 요약)
    var T = { n: 0, gross: 0, nt: 0, inc: 0, loc: 0, np: 0, hi: 0, lt: 0, ei: 0 };
    months.forEach(function (m) { var p = state.payroll[m]; if (!p) return; var pr = p.premiums || {}; var pv = function (k) { return pr[k] && typeof pr[k].amount === 'number' ? pr[k].amount : 0; };
      T.n++; T.gross += p.gross || 0; T.nt += p.nonTaxable || 0; T.inc += p.incomeTaxWithheld || 0; T.loc += p.localTaxWithheld || 0; T.np += pv('nationalPension'); T.hi += pv('healthInsurance'); T.lt += pv('longTermCare'); T.ei += pv('employmentInsurance'); });
    var sumBox = T.n ? '<section class="card pay-sum"><h3>' + T.n + '개월 합계</h3><div class="sum-nums"><div><span>급여(세전)</span>' + wonS(T.gross) + '</div><div><span>미리 낸 세금 ' + q('원천징수') + '</span>' + wonS(T.inc + T.loc) + '</div><div><span>4대보험</span>' + wonS(T.np + T.hi + T.lt + T.ei) + '</div></div><div class="faint">비과세 ' + wonS(T.nt) + ' · 소득세 ' + won(T.inc) + ' · 지방소득세 ' + won(T.loc) + '</div>' + (T.n < months.length ? '<div class="btns" style="margin-top:8px"><button class="btn small" data-action="payroll-fill">남은 ' + (months.length - T.n) + '개월을 마지막 달과 같은 금액으로 채우기</button></div>' : '') + '</section>' : '<section class="card"><p class="muted" style="margin:0">아래 표에서 달마다 <b>[입력]</b>을 눌러 급여명세서 금액을 넣어 주세요. 한 달만 넣으면 남은 달을 같은 금액으로 한 번에 채울 수 있어요.</p></section>';
    var foot = T.n ? '<tfoot><tr><td><b>합계</b><div class="faint">' + T.n + '개월</div></td><td class="num"><b>' + won(T.gross) + '</b><br><span class="faint">비과세 ' + won(T.nt) + '</span></td><td class="num"><b>' + won(T.inc) + '</b><br><span class="faint">지방 ' + won(T.loc) + '</span></td><td class="num">' + won(T.np) + '</td><td class="num">' + won(T.hi) + '</td><td class="num">' + won(T.lt) + '</td><td class="num">' + won(T.ei) + '</td></tr></tfoot>' : '';
    return form + premForm + sumBox + '<section class="card"><h3>월별 급여표(재직기간 ' + range.start + ' ~ ' + range.end + ')</h3><div class="tbl-wrap"><table class="pay-table"><thead><tr><th>월</th><th class="num">급여</th><th class="num">미리 낸 세금</th><th class="num">국민연금</th><th class="num">건강</th><th class="num">장기요양</th><th class="num">고용</th></tr></thead><tbody>' + rows + '</tbody>' + foot + '</table></div><div class="faint">연봉 계산 방식은 설정에서 "예상연봉 고정" 또는 "월별 추정" 중 선택합니다(현재: ' + (state.profile.salaryForecastMode === 'MONTHLY' ? '월별 추정' : '예상연봉 고정') + ').</div></section>';
  }

  function expensesTab() {
    var year = String(state.profile.year);
    var months = E.monthsInRange(E.employmentRange(state.profile));
    var allMonths = []; for (var i = 1; i <= 12; i++) allMonths.push(year + '-' + String(i).padStart(2, '0'));
    var e = ui.editingExpense ? state.expenses.find(function (x) { return x.id === ui.editingExpense; }) : null;
    var tagChecks = Object.keys(L.tag).map(function (k) { return '<label class="row"><input type="checkbox" name="tags" value="' + k + '"' + (e && (e.deductionTags || []).indexOf(k) >= 0 ? ' checked' : '') + '>' + esc(L.tag[k]) + '</label>'; }).join('');
    var refundOpts = '<option value="">(일반 지출)</option>' + state.expenses.filter(function (x) { return !x.refundOf && (!e || x.id !== e.id); }).map(function (x) { return '<option value="' + x.id + '"' + (e && e.refundOf === x.id ? ' selected' : '') + '>' + x.date + ' ' + won(x.amount) + ' ' + esc(L.pm[x.paymentMethod]) + '</option>'; }).join('');
    var form = '<section class="card"><h3>' + (e ? '지출 수정' : '지출 추가') + '</h3><form data-form="expense" class="form"><input type="hidden" name="id" value="' + (e ? e.id : '') + '">' +
      '<label>일자<input type="date" name="date" required value="' + (e ? e.date : (state.profile.referenceMonth + '-01')) + '"></label>' +
      '<label>금액(원)<input name="amount" inputmode="numeric" required value="' + (e ? e.amount : '') + '"></label>' +
      '<label>결제수단<select name="paymentMethod">' + opts(L.pm, e ? e.paymentMethod : 'CREDIT') + '</select></label>' +
      '<label>사용처 구분<select name="useCategory">' + opts(L.cat, e ? e.useCategory : 'GENERAL') + '</select></label>' +
      '<label>사용자<select name="spenderId">' + familyOpts(e ? e.spenderId : 'self') + '</select></label>' +
      '<label>구분<select name="status"><option value="ACTUAL"' + (!e || e.status !== 'FORECAST' ? ' selected' : '') + '>실제</option><option value="FORECAST"' + (e && e.status === 'FORECAST' ? ' selected' : '') + '>예상</option></select></label>' +
      '<label class="full">취소(환불)인 경우 원거래<select name="refundOf">' + refundOpts + '</select></label>' +
      '<details class="full"><summary>공제항목 태그(의료비·기부금·월세 등 세액공제 입력)</summary><div class="grid2">' + tagChecks + '</div><div class="faint">의료비·교육비 세부 구분(대상자 그룹·안경·학원비 등)은 공제 관리 화면의 수동 입력을 쓰세요. 월세 태그를 붙이면 카드공제에서 자동 제외됩니다.</div></details>' +
      '<label class="full">메모<input name="memo" value="' + esc(e ? e.memo : '') + '"></label>' +
      '<div class="full btns"><button class="btn primary" type="submit">' + (e ? '수정 저장' : '추가') + '</button>' + (e ? '<button class="btn" type="button" data-action="cancel-expense">취소</button>' : '') + '</div></form><div class="faint">공제제외 자동 지정 대상: ' + esc(rules().card.excludedCategories.join(', ')) + '. 전통시장 신용카드 10만원은 전체지출 10만원으로만 집계됩니다(중복 없음).</div></section>';
    var sel = ui.expenseMonth;
    var list = state.expenses.filter(function (x) { return x.date && x.date.slice(0, 4) === year && (!sel || x.date.slice(0, 7) === sel); }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var filter = '<div class="row-between"><h3>지출 목록 ' + (sel ? sel : '전체') + ' · ' + list.length + '건 · ' + won(list.reduce(function (s, x) { return s + (x.refundOf ? -x.amount : x.amount); }, 0)) + '</h3><select style="width:auto" data-action="filter-month"><option value="">전체</option>' + allMonths.map(function (m) { return '<option value="' + m + '"' + (sel === m ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></div>';
    var rows = list.map(function (x) {
      var who = x.spenderId === 'self' || !x.spenderId ? '본인' : (function () { var f = state.family.find(function (y) { return y.id === x.spenderId; }); return f ? (f.alias || L.rel[f.relation]) : x.spenderId; })();
      var ro = x.recurringId ? (x.recurringOverride && x.recurringOverride !== 'NONE' ? badge('고정·수정', 'amber') : badge('고정', 'gray')) : '';
      return '<tr><td>' + x.date + '<br>' + badge(x.status === 'FORECAST' ? '예상' : '실제', x.status === 'FORECAST' ? 'gray' : 'green') + ro + '</td><td class="num">' + (x.refundOf ? '−' : '') + won(x.amount) + '</td><td>' + esc(L.pm[x.paymentMethod] || x.paymentMethod) + '<br><span class="faint">' + esc(L.cat[x.useCategory] || x.useCategory) + '</span></td><td>' + esc(who) + (x.deductionTags && x.deductionTags.length ? '<br><span class="faint">' + x.deductionTags.map(function (t) { return esc(L.tag[t] || t); }).join(', ') + '</span>' : '') + (x.refundOf ? '<br><span class="faint">취소(원거래 ' + esc(x.refundOf) + ')</span>' : '') + '</td><td>' + esc(x.memo || '') + '</td><td><div class="btns"><button class="btn small" data-action="edit-expense" data-id="' + x.id + '">수정</button>' + (x.recurringId ? '<button class="btn small" data-action="skip-expense" data-id="' + x.id + '">이 달 건너뛰기</button>' : '') + '<button class="btn small danger" data-action="del-expense" data-id="' + x.id + '">삭제</button></div></td></tr>';
    }).join('');
    return form + '<section class="card">' + filter + '<div class="tbl-wrap"><table><thead><tr><th>일자</th><th class="num">금액</th><th>수단/사용처</th><th>사용자/공제</th><th>메모</th><th></th></tr></thead><tbody>' + (rows || '<tr><td colspan="6" class="muted">지출이 없습니다</td></tr>') + '</tbody></table></div><div class="btns"><button class="btn small" data-action="csv">CSV 내보내기</button></div></section>';
  }

  function recurringTab() {
    var t = ui.editingRecurring ? state.recurring.find(function (x) { return x.id === ui.editingRecurring; }) : null;
    var defStart = R.defaultStartMonth(state.profile.year, state.profile.employmentStart);
    var loan = t && t.loan ? t.loan : {};
    var tagOpts = '<option value="">(없음)</option>' + Object.keys(L.tag).map(function (k) { return '<option value="' + k + '"' + (t && (t.deductionTags || [])[0] === k ? ' selected' : '') + '>' + esc(L.tag[k]) + '</option>'; }).join('');
    var form = '<section class="card"><h3>' + (t ? '고정지출 템플릿 수정' : '고정지출 템플릿 추가') + '</h3><form data-form="recurring" class="form"><input type="hidden" name="id" value="' + (t ? t.id : '') + '">' +
      '<label>명칭<input name="name" required value="' + esc(t ? t.name : '') + '" placeholder="예: 실손보험료"></label>' +
      '<label>월 금액(원)<input name="amount" inputmode="numeric" value="' + (t ? t.amount : '') + '"></label>' +
      '<label>결제수단<select name="paymentMethod">' + opts(L.pm, t ? t.paymentMethod : 'CASH_NONE') + '</select></label>' +
      '<label>사용처 구분<select name="useCategory">' + opts(L.cat, t ? t.useCategory : 'EXCLUDED') + '</select></label>' +
      '<label>사용자<select name="spenderId">' + familyOpts(t ? t.spenderId : 'self') + '</select></label>' +
      '<label>공제항목<select name="tag">' + tagOpts + '</select></label>' +
      '<label>시작 월<input type="month" name="startMonth" required value="' + (t ? t.startMonth : defStart) + '"></label>' +
      '<label>종료 월(선택)<input type="month" name="endMonth" value="' + (t && t.endMonth ? t.endMonth : '') + '"></label>' +
      '<label>결제일<input name="paymentDay" inputmode="numeric" value="' + (t && t.paymentDay ? t.paymentDay : 1) + '"></label>' +
      '<label>주택 대출 종류<select name="loanType"><option value="">해당 없음</option><option value="RENT_LOAN"' + (loan.type === 'RENT_LOAN' ? ' selected' : '') + '>전세대출 원리금(원금+이자 40%)</option><option value="MORTGAGE"' + (loan.type === 'MORTGAGE' ? ' selected' : '') + '>주택담보대출(이자만 공제)</option></select></label>' +
      mortgageCapSelect('주택담보대출 조건(담보대출일 때만)') +
      '<label>월 원금(대출만)<input name="principal" inputmode="numeric" value="' + (loan.principal || '') + '"></label><label>월 이자(대출만)<input name="interest" inputmode="numeric" value="' + (loan.interest || '') + '"></label>' +
      '<label class="full">메모<input name="memo" value="' + esc(t ? t.memo : '') + '"></label>' +
      (t ? '<label class="full">적용 범위<select name="mode"><option value="ALL">시작 월부터 전체(개별 수정한 월은 유지)</option><option value="FROM_REFERENCE">기준 달(' + state.profile.referenceMonth + ')부터</option></select></label>' : '') +
      '<div class="full btns"><button class="btn primary" type="submit">' + (t ? '수정 적용' : '등록(시작 월부터 월별 생성)') + '</button>' + (t ? '<button class="btn" type="button" data-action="cancel-recurring">취소</button>' : '') + '</div></form><div class="faint">시작 월 기본값은 연말정산 연도 1월과 재직 시작 월 중 늦은 쪽입니다. 연중에 등록해도 기본값 그대로 두면 1월부터 소급 생성됩니다. 기준 달 이전은 실제, 이후는 예상으로 표시됩니다.</div></section>';
    var rows = state.recurring.map(function (x) {
      var cnt = state.expenses.filter(function (e) { return e.recurringId === x.id; });
      var sum = cnt.reduce(function (s, e) { return s + e.amount; }, 0);
      var confirm = ui.confirm && ui.confirm.type === 'del-recurring' && ui.confirm.id === x.id ? '<div class="inline-confirm"><b>"' + esc(x.name) + '" 삭제</b><span>생성된 월 항목 ' + cnt.length + '건을 어떻게 할까요?</span><div class="btns"><button class="btn small danger" data-action="confirm-del-recurring" data-id="' + x.id + '" data-keep="0">전체 삭제</button><button class="btn small" data-action="confirm-del-recurring" data-id="' + x.id + '" data-keep="1">개별 수정분만 남기기</button><button class="btn small" data-action="cancel-confirm">취소</button></div></div>' : '';
      return '<div class="stage"><div class="row-between"><b>' + esc(x.name) + '</b><span>' + won(x.loan && x.loan.type ? (x.loan.principal || 0) + (x.loan.interest || 0) : x.amount) + '/월</span></div><div class="muted">' + x.startMonth + ' ~ ' + (x.endMonth || state.profile.year + '-12') + ' · ' + esc(L.pm[x.paymentMethod]) + ' · ' + esc(L.cat[x.useCategory]) + (x.deductionTags && x.deductionTags.length ? ' · ' + x.deductionTags.map(function (k) { return esc(L.tag[k] || k); }).join(', ') : '') + (x.loan && x.loan.type ? ' · ' + (x.loan.type === 'MORTGAGE' ? '담보대출(이자 ' + won(x.loan.interest) + '만 공제)' : '전세대출(원리금 전체)') : '') + '</div><div class="kv muted"><span>생성 ' + cnt.length + '건</span><span>연 합계 ' + won(sum) + '</span></div><div class="btns"><button class="btn small" data-action="edit-recurring" data-id="' + x.id + '">수정</button><button class="btn small" data-action="end-recurring" data-id="' + x.id + '">이번 달로 종료</button><button class="btn small danger" data-action="del-recurring" data-id="' + x.id + '">삭제</button></div>' + confirm + '</div>';
    }).join('');
    return form + '<section class="card"><h3>템플릿 ' + state.recurring.length + '개</h3>' + (rows || '<div class="muted">등록된 고정지출이 없습니다</div>') + '</section>';
  }

  // ---------- S03 공제 ----------
  function statusBadge(s) { return { OK: badge('가능', 'green'), CONFIRM: badge('확인 필요', 'amber'), NO: badge('대상 아님', 'gray'), UNSUPPORTED: badge('미지원', 'red') }[s] || ''; }
  function viewDeductions() {
    var rp = rules();
    var r = E.calc(state, rp);
    if (r.blocked) return shell('공제 관리', '<div class="warn">연봉을 먼저 입력하세요. <a href="#/plan">플랜</a></div>');
    var P = r.personal;
    var sv = E.itemTaxSavings(state, rp);
    // saving: 이 항목 때문에 줄어든 세금(소득세+지방세). savingLabel 로 문구를 바꿀 수 있다
    function card(title, amount, status, lines, row, auto, saving, savingLabel) {
      return '<article class="card"><div class="row-between"><div><b>' + esc(title) + '</b> ' + statusBadge(status) + '</div><b>' + won(amount) + '</b></div>' + (typeof saving === 'number' ? '<div class="row-between"><span class="faint">' + esc(savingLabel || '돌려받는 돈(소득세+지방세)') + '</span><b class="save">' + won(saving) + '</b></div>' : '') + (lines || []).map(function (l) { return '<div class="muted">' + l + '</div>'; }).join('') + '<div class="row-between"><span></span>' + basisLink(row) + '</div></article>';
    }
    var fam = P.flags.map(function (f) { return esc(f.alias || L.rel[f.relation]) + ': ' + esc(f.reasonBasic) + (f.isSenior ? ' · 경로우대' : '') + (f.isDisabled && f.isBasicDeductionTarget ? ' · 장애인' : '') + (f.isChildTaxCreditTarget ? ' · 자녀세액공제 대상' : ''); });
    var body = '<h2 class="muted" style="margin:0">소득공제</h2>' +
      card('인적공제(기본 ' + P.basicCount + '명' + (P.seniorCount ? ', 경로 ' + P.seniorCount : '') + (P.disabledCount ? ', 장애 ' + P.disabledCount : '') + (P.singleParent ? ', 한부모' : '') + (P.woman ? ', 부녀자' : '') + ')', P.total, P.flags.some(function (f) { return f.needsConfirmation; }) ? 'CONFIRM' : 'OK', ['본인 ' + won(rp.personal.basic) + ' 포함. 입력란 없이 가족 조건으로 판정.'].concat(fam).concat(P.womanEligibleButSuppressed ? ['부녀자공제는 한부모공제와 중복 배제'] : []), 'personal', true, sv.PERSONAL_FAMILY, '부양가족으로 줄어든 세금(본인 기본공제 제외)') +
      card('근로소득공제', r.earnedIncomeDeduction, 'OK', ['연봉 ' + won(r.gross) + ' 구간표 적용 → 근로소득 ' + won(r.earnedIncome)], 'earnedIncomeDeduction', true) +
      card('연금보험료공제(국민연금)', r.pensionPremiumDeduction, r.premiums.needsConfirm ? 'CONFIRM' : 'OK', ['월별 급여표의 국민연금 합계(수동값 우선)' + (r.premiums.unverified ? ' · 추정값(급여명세서 값으로 고칠 수 있음)' : '')], 'premiums', true, sv.PENSION_PREMIUM) +
      card('건강·고용보험료 공제(건강·장기요양·고용)', r.insurancePremiumDeduction, 'OK', ['월별 급여표 합계. 기본 세액공제(13만원)과 비교해 유리한 쪽 적용(현재 ' + (r.standardChoice === 'STANDARD' ? '표준' : '특별') + ')'], 'premiums', true, sv.INSURANCE_PREMIUM) +
      card('주택자금·주택마련저축', r.housing.combined + r.housing.mortgageDeduction, r.housing.mortgageNote ? 'CONFIRM' : (r.housing.subscription + r.housing.rentLoan + r.housing.mortgageInterest > 0 ? 'OK' : 'NO'), ['청약 ' + won(r.housing.subscription) + ' → ' + won(r.housing.subscriptionDeduction) + (r.housing.subscription && !r.housing.subscriptionEligible ? ' (요건 미충족: 7천만원 이하·무주택 세대주)' : ''), '전세대출 원리금 ' + won(r.housing.rentLoan) + ' → ' + won(r.housing.rentLoanDeduction) + ' (청약과 합산 ' + won(rp.housing.rentLoan.combinedCapWithSubscription) + ' 한도)', '담보대출 이자 ' + won(r.housing.mortgageInterest) + ' → ' + won(r.housing.mortgageDeduction) + (r.housing.mortgageNote ? ' · ' + esc(r.housing.mortgageNote) : '')], 'housing', false, sv.HOUSING) +
      card('신용카드 등 사용액(본인 사용분' + (r.card.familyIncluded.length ? '+가족' : '') + ')', r.card.total_deduction, r.card.eligible ? 'OK' : 'NO', ['사용 ' + won(r.card.total) + ' · 카드 공제 시작선 ' + won(r.card.minUse) + ' · 공제제외금액 ' + won(r.card.excludedDeduction) + ' ' + esc(r.card.excludedCase), '일반 ' + won(r.card.general) + '/' + won(r.card.basicLimit) + ' + 추가 ' + won(r.card.extra) + '/' + won(r.card.extraLimit), '제외 지출 ' + r.card.excludedCount + '건(' + won(r.card.excludedAmount) + ')' + (r.card.outsideEmploymentCount ? ' · 재직기간 밖 ' + r.card.outsideEmploymentCount + '건' : '')], 'card', true, sv.CARD) +
      (r.overallCap.excess ? '<div class="warn">소득공제 소득공제 최대 한도 ' + won(r.overallCap.cap) + ' 초과분 ' + won(r.overallCap.excess) + '은 세금 매기는 소득에 가산</div>' : '') +
      '<h2 class="muted" style="margin:0">세액공제·감면</h2>';
    r.credits.forEach(function (c) {
      var extra = [];
      if (c.key === 'MEDICAL') extra = ['대상액 ' + won(r.medical.total) + ' · 문턱(3%) ' + won(r.medical.threshold) + (r.medical.belowThreshold ? ' · 문턱 미달' : '')];
      if (c.key === 'EDUCATION') extra = ['공제대상 ' + won(r.education.base)].concat(r.education.rejected.map(function (x) { return esc(x.reason); }));
      if (c.key === 'RENT') extra = ['월세 ' + won(r.rent.amount) + (r.rent.eligible ? ' × ' + rate(r.rent.rate) : ' · ' + esc(r.rent.reasons.join(', ')))];
      if (c.key === 'PENSION_ACCOUNT') extra = ['연금저축 ' + won(r.pension.saving) + ' + IRP ' + won(r.pension.irp) + ' + ISA ' + won(r.pension.isa) + ' → 대상 ' + won(r.pension.base) + ' × ' + rate(r.pension.rate) + (r.pensionCreditUnused ? ' · 공제 전 세금 초과로 ' + won(r.pensionCreditUnused) + ' 미적용' : '')];
      if (c.key === 'DONATION_SPECIAL_GENERAL') extra = ['특례 ' + won(r.donation.amounts.special) + ' · 일반 ' + won(r.donation.amounts.general) + ' · 종교 ' + won(r.donation.amounts.religious) + (r.donation.carryover ? ' · 한도 초과 이월 ' + won(r.donation.carryover) : '')];
      if (c.key === 'CHILD') extra = [r.child.count + '명 ' + won(r.child.credit) + (r.child.birthAdoption ? ' + 출산·입양 ' + won(r.child.birthAdoption) : '') + (r.child.minAgeUnverified ? ' · 대상 나이 확인 필요(2026)' : '')];
      if (c.key === 'INSURANCE') extra = ['보장성 ' + won(r.insurance.base) + ' × ' + rate(rp.insurance.rate) + ' + 장애인전용 ' + won(r.insurance.baseDisabled) + ' × ' + rate(rp.insurance.disabledRate)];
      if (c.note) extra.push(esc(c.note));
      var st = c.applied > 0 ? 'OK' : (c.key === 'RENT' && r.rent.needsConfirm && r.rent.amount > 0 ? 'CONFIRM' : 'NO');
      var auto = ['EARNED_INCOME', 'MARRIAGE', 'CHILD', 'STANDARD'].indexOf(c.key) >= 0;
      body += card(c.label, c.applied, st, extra, c.key.toLowerCase(), auto, sv[c.key], ['EARNED_INCOME', 'STANDARD', 'CHILD'].indexOf(c.key) >= 0 ? '돌려받는 돈(지방세 포함 추정)' : null);
    });
    body += card('중소기업 취업자 소득세 감면', r.sme.amount, r.sme.active ? 'OK' : 'NO', [esc(r.sme.reason)], 'smeReduction', true, sv.SME);
    body += manualDeductionForm();
    shell('공제 관리', body);
  }

  // 주택담보대출 이자 공제 한도 구간 선택(설정과 같은 값을 공유). 미선택이면 이자 공제 0 + 확인 필요
  function mortgageCapSelect(label) {
    var rp = rules(); if (!rp) return '';
    return '<label class="full">' + esc(label || '주택담보대출 조건(이자 공제 한도)') + '<select data-action="mortgage-cap"><option value="">미선택(이자 공제 0, 확인 필요)</option>' + rp.housing.mortgageInterest.capOptions.map(function (o) { return '<option value="' + o.key + '"' + (state.profile.mortgageCapKey === o.key ? ' selected' : '') + '>' + esc(o.label) + ' ' + won(o.cap) + '</option>'; }).join('') + '</select><span class="faint">대출 약정서의 상환기간·금리·거치 여부로 고릅니다. 설정 화면과 같은 값입니다.</span></label>';
  }
  function manualDeductionForm() {
    var cat = ui.dedCategory || 'MEDICAL';
    var meta = '';
    if (cat === 'MEDICAL') meta = '<label>대상자 그룹<select name="group">' + opts(L.medGroup, 'GENERAL') + '</select></label><label>종류<select name="kind">' + opts(L.medKind, 'NORMAL') + '</select></label><label>실손보험 보전액(원)<input name="reimbursed" inputmode="numeric" value="0"></label>';
    if (cat === 'EDUCATION') meta = '<label>대상 구분<select name="level">' + opts(L.eduLevel, 'SCHOOL') + '</select></label><label>종류<select name="kind">' + opts(L.eduKind, 'NORMAL') + '</select></label>';
    if (cat === 'DONATION_HOMETOWN') meta = '<label class="row"><input type="checkbox" name="disaster">특별재난지역 기부(30%)</label>';
    if (cat === 'MORTGAGE_INTEREST') meta = mortgageCapSelect() + '<div class="faint full">금액은 올해 낸 <b>이자</b>만 입력합니다(원금 제외). 요건: 무주택 또는 1주택 세대주, 취득 당시 기준시가 6억원 이하.</div>';
    var list = (state.deductions || []).map(function (d) { var who = d.beneficiaryId === 'self' || !d.beneficiaryId ? '본인' : (function () { var f = state.family.find(function (y) { return y.id === d.beneficiaryId; }); return f ? (f.alias || L.rel[f.relation]) : d.beneficiaryId; })(); return '<tr><td>' + esc(L.tag[d.category] || d.category) + '</td><td>' + esc(who) + '</td><td class="num">' + won(d.amount) + '</td><td class="faint">' + esc(Object.keys(d.meta || {}).map(function (k) { return k + '=' + d.meta[k]; }).join(' ')) + '</td><td>' + (d.evidence ? badge('증빙 확인', 'green') : badge('증빙 미확인', 'gray')) + '</td><td><button class="btn small danger" data-action="del-deduction" data-id="' + d.id + '">삭제</button></td></tr>'; }).join('');
    return '<section class="card"><h3>공제 항목 수동 입력(연간 합계 또는 건별)</h3><form data-form="deduction" class="form"><label>항목<select name="category" data-action="ded-category">' + opts(L.tag, cat) + '</select></label><label>금액(원)<input name="amount" inputmode="numeric" required></label><label>대상자<select name="beneficiaryId">' + familyOpts('self') + '</select></label>' + meta + '<label class="row full"><input type="checkbox" name="evidence">증빙(간소화 자료 등) 확인함</label><div class="full btns"><button class="btn primary" type="submit">추가</button></div></form><div class="faint">월별로 반복되는 보험료·연금·월세는 입력 화면의 고정지출 템플릿으로 등록하면 자동 생성됩니다.</div><div class="tbl-wrap"><table><thead><tr><th>항목</th><th>대상자</th><th class="num">금액</th><th>세부</th><th>증빙</th><th></th></tr></thead><tbody>' + (list || '<tr><td colspan="6" class="muted">수동 입력 항목 없음</td></tr>') + '</tbody></table></div></section>';
  }

  // ---------- S04 설계 ----------
  function viewDesign() {
    var rp = rules();
    var b = state.budget;
    var ca = b.categoryAvailability || {}, ma = b.methodAvailability || {};
    function avail(k) { var v = ca[k]; return v === 0 ? 'NO' : (typeof v === 'number' ? 'CAP' : 'ANY'); }
    function availSel(k, label) { var a = avail(k); return '<label>' + label + ' 이용<select name="' + k + '_mode"><option value="ANY"' + (a === 'ANY' ? ' selected' : '') + '>제한 없음</option><option value="CAP"' + (a === 'CAP' ? ' selected' : '') + '>상한 금액</option><option value="NO"' + (a === 'NO' ? ' selected' : '') + '>이용 불가</option></select></label><label>' + label + ' 상한(원)<input name="' + k + '_cap" inputmode="numeric" value="' + (a === 'CAP' ? ca[k] : '') + '"></label>'; }
    var ref = state.profile.referenceMonth;
    var fixedFuture = state.expenses.filter(function (e) { return e.recurringId && e.date.slice(0, 7) > ref && e.date.slice(0, 4) === String(state.profile.year); }).reduce(function (s, e) { return s + e.amount; }, 0);
    var form = '<section class="card"><h3>남은 예산과 제약</h3><form data-form="budget" class="form"><label>남은 생활비 예산(원, 기준 달 이후 연말까지)<input name="remainingBudget" inputmode="numeric" value="' + (b.remainingBudget || '') + '"></label><div class="full muted">확정된 향후 고정지출 합계(예상, 템플릿 생성분): ' + won(fixedFuture) + ' — 이미 기존 지출로 포함되며 예산에서 따로 빼지 않습니다.</div>' + availSel('TRADITIONAL_MARKET', '전통시장') + availSel('PUBLIC_TRANSIT', '대중교통') + availSel('CULTURE', '문화체육') + '<div class="full"><div class="muted">결제 가능 수단</div>' + ['CREDIT', 'DEBIT', 'CASH_RECEIPT'].map(function (k) { return '<label class="row"><input type="checkbox" name="pm_' + k + '"' + (ma[k] !== false ? ' checked' : '') + '>' + L.pm[k] + '</label>'; }).join('') + '</div><div class="full btns"><button class="btn primary" type="submit">배분안 계산</button></div></form><div class="faint">예산은 고정하고 배분만 비교합니다(한도를 채우기 위해 예산을 늘리지 않음). 카드사 할인·적립은 계산에 없습니다.</div></section>';
    var body = form;
    var res = ui.lastOpt;
    if (res && res.available) {
      function planCard(p, primary) {
        return '<article class="card' + (primary ? ' dark' : '') + '"><div class="row-between"><h3>' + esc(p.label) + '</h3><b>절세 ' + won(p.taxSaving) + '</b></div>' + p.items.filter(function (i) { return i.amount > 0; }).map(function (i) { return '<div class="kv"><span>' + esc(i.label) + (i.key === 'SPECIAL40' && i.market !== undefined ? ' (시장 ' + won(i.market) + ' · 교통 ' + won(i.transit) + ')' : '') + '</span><b>' + won(i.amount) + '</b></div>'; }).join('') + '<div class="kv muted"><span>총지출 ' + won(p.spent) + (p.unspent ? ' · 미배분 ' + won(p.unspent) : '') + '</span><span>소득공제 +' + won(p.deductionGain) + '</span></div><div class="kv muted"><span>내야 할 세금 ' + won(p.determinedTax) + '</span><span>' + (p.limitsReached.basic ? '기본 공제 한도 도달' : '기본 공제 한도 미달') + ' · ' + (p.limitsReached.extra ? '시장·교통 추가 한도 도달' : '시장·교통 추가 한도 미달') + '</span></div></article>';
      }
      body += planCard(res.recommended, true) + planCard(res.reference) + planCard(res.statusQuo) + res.ties.map(function (t) { return planCard(t); }).join('');
      var months = res.remainingMonths;
      body += '<section class="card"><h3>추천안 월별 배분(남은 ' + months.length + '개월 균등, 표시용)</h3>' + res.recommended.items.filter(function (i) { return i.amount > 0; }).map(function (i) { return '<div class="kv"><span>' + esc(i.label) + '</span><b>' + won(Math.floor(i.amount / months.length)) + '/월</b></div>'; }).join('') + '<div class="faint">월별 금액 합계 = 연간 권장액(끝자리 차이는 마지막 달에 반영). 세액은 연간 합계로 결정되므로 월 배분은 안내용입니다.</div></section>';
      if (res.notes.length) body += '<div class="warn">' + res.notes.map(function (n) { return '<span>· ' + esc(n) + '</span>'; }).join('') + '</div>';
    } else if (res && !res.available) body += '<div class="warn">' + esc(res.reason) + '</div>';
    shell('지출 설계', body);
  }

  // ---------- S05 상세 ----------
  function viewDetail() {
    var rp = rules();
    var r = E.calc(state, rp);
    if (r.blocked) return shell('정산 상세', '<div class="warn">연봉 미입력 → 계산 보류</div>');
    function row(k, v, note) { return '<tr><td>' + k + '</td><td class="num">' + v + '</td><td class="faint">' + (note || '') + '</td></tr>'; }
    var t = '<section class="card"><div class="tbl-wrap"><table><tbody>' +
      row('연봉(비과세 제외)', won(r.gross)) + row('(−) 근로소득공제', won(r.earnedIncomeDeduction)) + row('= 근로소득', won(r.earnedIncome)) +
      row('(−) 인적공제', won(r.personal.total)) + row('(−) 연금보험료공제', won(r.pensionPremiumDeduction)) + row('(−) 보험료·주택자금 공제', won(r.specialIncomeDeduction), r.standardChoice === 'STANDARD' ? '기본 세액공제(13만원) 선택으로 미적용' : '') + row('(−) 그 밖의 소득공제(카드·주택마련저축)', won(r.otherDeduction)) + (r.overallCap.excess ? row('(+) 소득공제 최대 한도 초과분', won(r.overallCap.excess)) : '') +
      row('= 세금 매기는 소득', won(r.taxBase), '세율 ' + rate(r.marginal.rate) + ' 구간') + row('공제 전 세금', won(r.calculatedTax)) + (r.sme.active ? row('(−) 세액감면(중소기업 취업자)', won(r.sme.amount)) : '') +
      r.credits.map(function (c, i) { return row('(−) ' + (i + 1) + '. ' + c.label, won(c.applied), c.note); }).join('') +
      row('= 내야 할 세금', won(r.determinedTax)) + row('지방소득세(10%)', won(r.localTax)) + row('합계', won(r.totalTax)) +
      row('미리 낸 세금(소득세+지방)', r.withheld.any ? won(r.withheld.income + r.withheld.local) : '미입력') + row(r.settlement === null ? '정산액' : (r.settlement < 0 ? '환급 예상' : '추가 납부 예상'), r.settlement === null ? '보류' : won(Math.abs(r.settlement))) +
      '</tbody></table></div><div class="faint">세액공제 합계가 공제 전 세금보다 크면 연금계좌 공제부터 덜 받아요. 예상 금액이에요.</div></section>';
    if (r.warnings.length) t += '<div class="warn">' + r.warnings.map(function (w) { return '<span>· ' + esc(w) + '</span>'; }).join('') + '</div>';
    shell('정산 상세', t);
  }

  // ---------- S06 설정 ----------
  function viewSettings() {
    var p = state.profile, sc = p.selfConditions || {}; var sme = sc.smeEmployment || {};
    var rp = rules();
    var r = rp ? E.calc(state, rp) : null;
    var flags = r && !r.blocked ? r.personal.flags : state.family.map(function (m) { return rp ? E.deriveFamilyFlags(m, p, rp) : {}; });
    var years = Object.keys(RULES).map(Number).sort();
    // 주제별 상자로 묶는다: 연봉 → 나 → 집 → 올해 있었던 일 → 해당자만 → 거의 안 바꾸는 것
    var box = function (title, note, inner) { return '<fieldset class="full group"><legend>' + title + (note ? ' <span class="faint">(' + note + ')</span>' : '') + '</legend><div class="form">' + inner + '</div></fieldset>'; };
    var prof = '<section class="card"><h3>연간 설정</h3><form data-form="profile" class="form">' +
      box('① 연봉', '', '<label>세전 연봉(원)<input name="expectedGrossAnnual" inputmode="numeric" value="' + (p.expectedGrossAnnual || '') + '"></label><label>1년 비과세(원, 식대 등)<input name="expectedNonTaxable" inputmode="numeric" value="' + (p.expectedNonTaxable || 0) + '"></label>' +
        '<label class="full">연봉 계산 방식<select name="salaryForecastMode"><option value="FIXED"' + (p.salaryForecastMode !== 'MONTHLY' ? ' selected' : '') + '>위 연봉으로 계산</option><option value="MONTHLY"' + (p.salaryForecastMode === 'MONTHLY' ? ' selected' : '') + '>입력한 월별 급여 합계로 계산</option></select></label>') +
      box('② 나', '', '<label>태어난 해<input name="birthYear" inputmode="numeric" value="' + (sc.birthYear || '') + '"></label><label>성별<select name="gender">' + opts({ M: '남', F: '여' }, sc.gender, '선택') + '</select></label>' +
        '<label class="row"><input type="checkbox" name="disability"' + (sc.disability ? ' checked' : '') + '>장애인이에요</label>') +
      box('③ 집', '', '<label class="row"><input type="checkbox" name="isHouseholdHead"' + (sc.isHouseholdHead ? ' checked' : '') + '>세대주예요</label><label class="row"><input type="checkbox" name="isHomeless"' + (sc.isHomeless ? ' checked' : '') + '>집이 없어요(무주택 — 월세·청약·전세대출 공제 요건)</label>') +
      box('④ 올해 있었던 일', '해당될 때만', '<label class="full">혼인신고 연도(2024~2026, 생애 1회)<input name="marriageRegisteredYear" inputmode="numeric" value="' + (sc.marriageRegisteredYear || '') + '"></label>' +
        '<label>입사일(올해 입사했을 때만 바꾸기)<input type="date" name="employmentStart" value="' + (p.employmentStart || '') + '"></label><label>퇴사일(올해 퇴사했을 때만)<input type="date" name="employmentEnd" value="' + (p.employmentEnd || '') + '"></label>') +
      '<div class="full group-title">⑤ 해당자만</div>' +
      '<fieldset class="full group"><legend>주택담보대출 이자 공제 <span class="faint">(대출 있는 사람만)</span></legend><label>대출 조건(이자 공제 한도)<select name="mortgageCapKey"><option value="">미선택(대출 없음 또는 모름)</option>' + (rp ? rp.housing.mortgageInterest.capOptions.map(function (o) { return '<option value="' + o.key + '"' + (p.mortgageCapKey === o.key ? ' selected' : '') + '>' + esc(o.label) + ' ' + won(o.cap) + '</option>'; }).join('') : '') + '</select></label><div class="faint">대출 약정서의 상환기간·금리·거치 여부로 고릅니다. 이자 금액은 공제 관리에서 입력해요.</div></fieldset>' +
      '<fieldset class="full group"><legend>중소기업 취업자 소득세 감면 <span class="faint">(해당자만)</span></legend><div class="faint">중소기업에 취업한 청년(15~34세) 90%·5년, 60세 이상·장애인·경력단절 70%·3년, 연 200만원까지 소득세를 깎아줘요.</div><label>나의 구분<select name="smeCategory">' + opts(L.sme, sme.category, '해당 없음') + '</select></label>' + (sme.category ? '<label>그 회사 입사일(감면 기간 계산용)<input type="date" name="smeEmployedAt" value="' + (sme.employedAt || '') + '"></label>' : '') + '</fieldset>' +
      box('가족 카드 합산', '선택', '<label class="row full"><input type="checkbox" name="cardFamilyInclusion"' + (p.cardFamilyInclusion ? ' checked' : '') + '>소득이 거의 없는 가족의 카드 사용액을 내 카드 공제에 합치기(기본은 따로 계산)</label>') +
      '<details class="full more"><summary>거의 바꿀 일 없음: 연말정산 연도·기준 달</summary><div class="form">' +
        '<label>연말정산 연도<select name="year">' + years.map(function (y) { return '<option value="' + y + '"' + (y === p.year ? ' selected' : '') + '>' + y + '년</option>'; }).join('') + '</select></label>' +
        '<label>기준 달(보통 이번 달)<input type="month" name="referenceMonth" value="' + p.referenceMonth + '"></label></div></details>' +
      '<div class="full btns sticky-save"><button class="btn primary" type="submit">저장</button></div></form><div class="faint">입력값은 바꾸는 즉시 자동 저장됩니다. 한부모·부녀자·배우자 유무는 가족 입력에서 자동 판정합니다(입력란 없음).</div></section>';
    var fe = ui.editingFamily ? state.family.find(function (f) { return f.id === ui.editingFamily; }) : null;
    var famForm = '<section class="card"><h3>' + (fe ? '가족 수정' : '가족 추가') + '</h3><form data-form="family" class="form"><input type="hidden" name="id" value="' + (fe ? fe.id : '') + '"><label>별칭<input name="alias" value="' + esc(fe ? fe.alias : '') + '" placeholder="예: 아내, 첫째"></label><label>관계<select name="relation">' + opts(L.rel, fe ? fe.relation : 'SPOUSE') + '</select></label><label>생년<input name="birthYear" inputmode="numeric" value="' + (fe && fe.birthYear ? fe.birthYear : '') + '"></label><label>연소득 100만원 이하(근로소득만 연봉 500만원 이하)<select name="incomeUnderLimit"><option value=""' + (!fe || fe.incomeUnderLimit == null ? ' selected' : '') + '>미확인</option><option value="true"' + (fe && fe.incomeUnderLimit === true ? ' selected' : '') + '>예</option><option value="false"' + (fe && fe.incomeUnderLimit === false ? ' selected' : '') + '>아니오(소득 있음)</option></select></label><label class="row"><input type="checkbox" name="disability"' + (fe && fe.disability ? ' checked' : '') + '>장애인</label><label class="row"><input type="checkbox" name="cohabiting"' + (!fe || fe.cohabiting !== false ? ' checked' : '') + '>동거</label><label class="row"><input type="checkbox" name="bornOrAdoptedThisYear"' + (fe && fe.bornOrAdoptedThisYear ? ' checked' : '') + '>' + p.year + '년 출생·입양</label><label>출산·입양 순번(첫째 1)<input name="childOrder" inputmode="numeric" value="' + (fe && fe.childOrder ? fe.childOrder : '') + '"></label><div class="full btns"><button class="btn primary" type="submit">' + (fe ? '수정 저장' : '가족 저장') + '</button>' + (fe ? '<button class="btn" type="button" data-action="cancel-family">취소</button>' : '') + '</div></form>' +
      (state.family.length ? '<div class="tbl-wrap"><table><thead><tr><th>가족</th><th>판정(자동)</th><th></th></tr></thead><tbody>' + state.family.map(function (f, i) { var fl = flags[i] || {}; return '<tr><td>' + esc(f.alias || '') + '<br><span class="faint">' + esc(L.rel[f.relation]) + (f.birthYear ? ' · ' + f.birthYear + '년생' : '') + '</span></td><td>' + (fl.isBasicDeductionTarget ? badge('기본공제 대상', 'green') : (fl.needsConfirmation ? badge('확인 필요', 'amber') : badge('대상 아님', 'gray'))) + ' ' + (fl.isCardAggregationTarget ? badge('카드 합산 가능(옵션)') : badge('카드 분리', 'gray')) + (fl.isChildTaxCreditTarget ? ' ' + badge('자녀세액공제', 'green') : '') + (fl.birthAdoptionCreditAmount ? ' ' + badge('출산·입양 ' + won(fl.birthAdoptionCreditAmount), 'green') : '') + '<br><span class="faint">' + esc(fl.reasonBasic || '') + ' · ' + esc(fl.reasonCard || '') + '</span></td><td><div class="btns"><button class="btn small" data-action="edit-family" data-id="' + f.id + '">수정</button><button class="btn small danger" data-action="del-family" data-id="' + f.id + '">삭제</button></div></td></tr>'; }).join('') + '</tbody></table></div>' : '<div class="muted">가족 없음(본인만)</div>') + '</section>';
    var packs = '<section class="card"><a href="#/basis">계산 기준과 출처 보기 ›</a></section>';
    var confirmDel = ui.confirm && ui.confirm.type === 'wipe' ? '<div class="inline-confirm"><b>모든 데이터를 삭제합니다</b><span>급여·지출·가족·설정이 이 기기에서 지워지며 복구할 수 없습니다. 먼저 JSON 백업을 권장합니다.</span><div class="btns"><button class="btn small danger" data-action="confirm-wipe">삭제 확정</button><button class="btn small" data-action="cancel-confirm">취소</button></div></div>' : '';
    var restore = ui.restorePending ? '<div class="inline-confirm"><b>백업 복원</b><span>현재 데이터를 백업 파일(' + ui.restorePending.state.profile.year + '년, 지출 ' + ui.restorePending.state.expenses.length + '건)로 교체합니다. 교체 전 현재 데이터 백업이 자동 다운로드됩니다.</span><div class="btns"><button class="btn small primary" data-action="confirm-restore">복원</button><button class="btn small" data-action="cancel-confirm">취소</button></div></div>' : '';
    var data = '<section class="card"><h3>자료</h3><div class="btns"><button class="btn" data-action="backup">JSON 백업 다운로드</button><label class="btn" style="cursor:pointer">백업 복원<input type="file" accept="application/json,.json" data-action="restore-file" style="display:none"></label><button class="btn" data-action="csv">지출 CSV</button><button class="btn danger" data-action="wipe">전체 삭제</button></div>' + confirmDel + restore + '<div class="faint">데이터는 이 브라우저(IndexedDB)에만 저장됩니다. 백업 파일에는 가족 별칭 등 민감정보가 포함될 수 있습니다. 주민등록번호·카드번호·홈택스 비밀번호는 수집하지 않습니다.</div></section>';
    shell('설정/자료', prof + famForm + packs + data);
  }

  // ---------- S07 계산 기준 ----------
  function viewBasis() {
    var rp = rules();
    var r = E.calc(state, rp);
    var q = (location.hash.split('?')[1] || '').replace('row=', '');
    var c = rp.card;
    function row(id, item, basis, mine, src) { return '<tr id="row-' + id + '"' + (q === id ? ' style="background:#FFF4E0"' : '') + '><td>' + item + '</td><td>' + basis + '</td><td class="num">' + mine + '</td><td class="faint">' + esc(src) + '</td></tr>'; }
    var ok = !r.blocked;
    var rows = [
      row('card', '카드공제 공제율', '신용 ' + rate(c.rates.CREDIT) + ' / 현금영수증·체크·직불·선불 ' + rate(c.rates.DEBIT) + ' / 문화체육 ' + rate(c.rates.CULTURE) + '(연봉 ' + won(c.cultureGrossCap) + ' 이하, 수영장·체력단련장 ' + c.sportsFacilityFrom + '~) / 전통시장·대중교통 ' + rate(c.rates.TRADITIONAL_MARKET), ok ? won(r.card.total_deduction) : '—', rp.sources.card),
      row('card_limit', '카드공제 한도', c.limitTiers.map(function (t) { return (t.grossUpTo ? won(t.grossUpTo) + ' 이하' : '초과') + ' 기본 ' + won(t.basic) + '+추가 ' + won(t.extra); }).join(' / ') + ' · 카드 공제 시작선 연봉 ' + rate(c.minUseRate), ok ? '기본 ' + won(r.card.basicLimit) + ' + 추가 ' + won(r.card.extraLimit) + ' · 최저 ' + won(r.card.minUse) : '—', rp.sources.card),
      row('card_order', '카드 공제 시작선 차감 순서', '㉮신용 15% → ㉯㉰현금영수증·체크·문화체육 30% → ㉱㉲전통시장·대중교통 40%. 소비증가분 추가공제 ' + (c.consumptionIncreaseBonus ? '있음' : '없음') + ', 자녀 한도 가산 ' + (c.childLimitBonus ? '있음' : '없음(' + esc(c.childLimitBonusNote) + ')'), ok ? '공제제외금액 ' + won(r.card.excludedDeduction) + ' ' + esc(r.card.excludedCase) : '—', rp.sources.card),
      row('card_family', '가족 사용분', '배우자·직계존비속(소득요건, 나이 무관) 합산 가능 · 형제자매 불가 · 앱 기본 분리 집계', ok ? (r.card.familyIncluded.length ? '포함 ' + r.card.familyIncluded.length + '명' : '본인만') : '—', rp.sources.card),
      row('overall', '소득공제 소득공제 최대 한도', won(rp.overallDeductionCap.amount) + ' · ' + rp.overallDeductionCap.items.join(', '), ok ? '초과 ' + won(r.overallCap.excess) : '—', rp.sources.overallDeductionCap),
      row('personal', '인적공제', '기본 ' + won(rp.personal.basic) + '/인 · 경로우대 ' + won(rp.personal.senior) + '(' + rp.personal.seniorAge + '세) · 장애인 ' + won(rp.personal.disabled) + ' · 부녀자 ' + won(rp.personal.woman) + ' · 한부모 ' + won(rp.personal.singleParent) + ' · 소득 ' + won(rp.personal.incomeLimit) + ' 이하 · 직계존속 60세↑, 직계비속 20세↓', ok ? won(r.personal.total) : '—', rp.sources.personal),
      row('earnedIncomeDeduction', '근로소득공제', rp.earnedIncomeDeduction.brackets.map(function (b) { return (b.upTo ? won(b.upTo) + ' 이하 ' : '초과 ') + won(b.base) + '+' + rate(b.rate); }).join(' / ') + ' · 한도 ' + won(rp.earnedIncomeDeduction.cap), ok ? won(r.earnedIncomeDeduction) : '—', rp.sources.earnedIncomeDeduction),
      row('tax', '기본세율', rp.taxBrackets.map(function (b) { return (b.upTo ? won(b.upTo) : '초과') + ' ' + rate(b.rate); }).join(' / '), ok ? '세금 매기는 소득 ' + won(r.taxBase) + ' → ' + won(r.calculatedTax) : '—', rp.sources.taxBrackets),
      row('premiums', '4대보험 요율(추정)', rp.premiums.periods.map(function (pp) { return pp.effectiveFrom + '~ 국민연금 ' + rate(pp.nationalPension.rate) + '(기준소득월액 ' + won(pp.nationalPension.baseMin) + '~' + won(pp.nationalPension.baseMax) + ') 건강 ' + rate(pp.healthInsurance.rate) + ' 장기요양 건강보험료×' + rate(pp.longTermCare.rateOfHealth) + ' 고용 ' + rate(pp.employmentInsurance.rate); }).join(' / ') + (rp.premiums.confidence === 'UNVERIFIED' ? ' · 확인 필요' : ''), ok ? won(r.pensionPremiumDeduction + r.insurancePremiumDeduction) : '—', rp.sources.premiums),
      row('earned_income', '근로소득세액공제', '공제 전 세금 ' + won(rp.earnedIncomeTaxCredit.threshold) + ' 이하 ' + rate(rp.earnedIncomeTaxCredit.rateBelow) + ', 초과 ' + won(rp.earnedIncomeTaxCredit.baseAbove) + '+' + rate(rp.earnedIncomeTaxCredit.rateAbove) + ' · 한도 74/66/50/20만원(연봉별)', ok ? won((r.credits.find(function (x) { return x.key === 'EARNED_INCOME'; }) || {}).applied) : '—', rp.sources.earnedIncomeTaxCredit),
      row('marriage', '혼인세액공제', won(rp.marriageCredit.amount) + ' · ' + rp.marriageCredit.yearsFrom + '~' + rp.marriageCredit.yearsTo + ' 혼인신고, 생애 1회', ok ? won(r.marriage.amount) : '—', rp.sources.marriageCredit),
      row('child', '자녀세액공제', rp.childTaxCredit.minAge + '세 이상 · 1명 ' + won(rp.childTaxCredit.amounts.one) + ' 2명 ' + won(rp.childTaxCredit.amounts.two) + ' 3명↑ +' + won(rp.childTaxCredit.amounts.threePlusEach) + ' · 출산입양 ' + won(rp.childTaxCredit.birthAdoption.first) + '/' + won(rp.childTaxCredit.birthAdoption.second) + '/' + won(rp.childTaxCredit.birthAdoption.thirdPlus), ok ? won(r.child.credit + r.child.birthAdoption) : '—', rp.sources.childTaxCredit),
      row('insurance', '보장성보험료', rate(rp.insurance.rate) + ' · ' + won(rp.insurance.cap) + ' / 장애인전용 ' + rate(rp.insurance.disabledRate), ok ? won(r.insurance.credit) : '—', rp.sources.insurance),
      row('medical', '의료비', '연봉 ' + rate(rp.medical.thresholdRate) + ' 초과분 ' + rate(rp.medical.rate) + '(난임 ' + rate(rp.medical.infertilityRate) + ', 미숙아 ' + rate(rp.medical.prematureRate) + ') · 일반 ' + won(rp.medical.generalCap) + ' 한도 · 안경 ' + won(rp.medical.glassesCapPerPerson) + ' · 산후조리 ' + won(rp.medical.postnatalCapPerBirth), ok ? '문턱 ' + won(r.medical.threshold) + ' → ' + won(r.medical.credit) : '—', rp.sources.medical),
      row('education', '교육비', rate(rp.education.rate) + ' · 취학전·초중고 ' + won(rp.education.caps.SCHOOL) + ' · 대학 ' + won(rp.education.caps.UNIVERSITY) + ' · 본인 무한도 · 학원비 불인정', ok ? won(r.education.credit) : '—', rp.sources.education),
      row('donation', '기부금', '정치·고향사랑 ' + won(rp.donation.hometown.lowCap) + ' 이하 100/110, 초과 ' + rate(rp.donation.hometown.rate) + ' · 특례·일반 ' + won(rp.donation.general.lowUpTo) + ' 이하 ' + rate(rp.donation.general.lowRate) + ', 초과 ' + rate(rp.donation.general.highRate) + ' · 한도 근로소득의 100/30/10%', ok ? won(r.donation.political + r.donation.hometown + r.donation.specialGeneral) : '—', rp.sources.donation),
      row('pension_account', '연금계좌', '연금저축 ' + won(rp.pensionAccount.savingCap) + ' · IRP 합산 ' + won(rp.pensionAccount.totalCap) + ' · 연봉 ' + won(rp.pensionAccount.grossThreshold) + ' 이하 ' + rate(rp.pensionAccount.rateLow) + ' 초과 ' + rate(rp.pensionAccount.rateHigh), ok ? won(r.pension.credit) : '—', rp.sources.pensionAccount),
      row('rent', '월세', rate(rp.rent.rate) + '(연봉 ' + won(rp.rent.lowGrossCap) + ' 이하 ' + rate(rp.rent.lowRate) + ') · 월세 ' + won(rp.rent.rentCap) + ' 한도 · 연봉 ' + won(rp.rent.grossCap) + ' 이하 무주택 세대주', ok ? won(r.rent.credit) : '—', rp.sources.rent),
      row('housing', '주택자금·청약', '청약 ' + rate(rp.housing.subscription.rate) + '·납입 ' + won(rp.housing.subscription.annualPayCap) + '·연봉 ' + won(rp.housing.subscription.grossCap) + ' · 임차 원리금 ' + rate(rp.housing.rentLoan.rate) + ' 합산 ' + won(rp.housing.rentLoan.combinedCapWithSubscription) + ' · 담보 이자 ' + rp.housing.mortgageInterest.capOptions.map(function (o) { return won(o.cap); }).join('/'), ok ? won(r.housing.combined + r.housing.mortgageDeduction) : '—', rp.sources.housing),
      row('standard', '기본 세액공제(13만원)', won(rp.standardTaxCredit.amount) + ' · 특별소득·세액공제·월세 미신청 시', ok ? (r.standardChoice === 'STANDARD' ? won(rp.standardTaxCredit.amount) : '미적용(특별공제 유리)') : '—', rp.sources.standardTaxCredit),
      row('smereduction', '중소기업 취업자 감면', '70%(3년)·청년 90%(5년) · 연 ' + won(rp.smeReduction.annualCap), ok ? won(r.sme.amount) : '—', rp.sources.smeReduction),
      row('order', '세액감면·공제 적용 순서', rp.creditOrder.join(' → ') + ' · 합계가 공제 전 세금 초과 시 연금계좌부터 차감', ok ? r.credits.length + '단계 적용' : '—', rp.sources.creditOrder),
      row('local', '지방소득세', rate(rp.localIncomeTax.rate), ok ? won(r.localTax) : '—', rp.sources.localIncomeTax)
    ].join('');
    var body = '<div class="muted">귀속 ' + rp.year + ' · 규칙팩 ' + rp.version + ' · ' + L.level[rp.verificationLevel] + ' · 검증일 ' + rp.verifiedAt + '. ' + esc(rp.verificationNote) + ' "내게 적용" 열은 공제 관리·정산 상세와 같은 계산 결과입니다.</div>' + (rp.verificationLevel !== 'CASE_VERIFIED' ? '<div class="warn">이 연도 규칙팩은 공식 계산 사례로 전체 검증되지 않았습니다(' + L.level[rp.verificationLevel] + '). 환급액은 예상치입니다.</div>' : '') + '<section class="card"><div class="tbl-wrap"><table><thead><tr><th>항목</th><th>기준(요율·한도)</th><th class="num">내게 적용</th><th>출처</th></tr></thead><tbody>' + rows + '</tbody></table></div><div class="faint">출처 p.N = 국세청 2025 귀속 연말정산 안내 인쇄 쪽(docs/참고_국세청_2025귀속_연말정산안내.pdf, PDF 쪽 = N+3). 상세는 rules/SOURCES.md.</div></section>';
    shell('계산 기준', body, '', true);
    if (q) { var el = document.getElementById('row-' + q); if (el) el.scrollIntoView({ block: 'center' }); }
  }

  // ---------- 라우팅 ----------
  function render() {
    var h = (location.hash || '#/plan').split('?')[0];
    var parts = h.replace(/^#\//, '').split('/');
    try {
      switch (parts[0]) {
        case 'home': return viewHome();
        case 'input': return viewInput(parts[1]);
        case 'deductions': return viewDeductions();
        case 'design': return viewDesign();
        case 'detail': return viewDetail();
        case 'settings': return viewSettings();
        case 'basis': return viewBasis();
        case 'maximize': return viewMaximize();
        default: return viewPlan();
      }
    } catch (err) {
      app.innerHTML = '<main><div class="err">화면 오류: ' + esc(err.message) + '</div><a class="btn" href="#/settings">설정으로</a></main>';
      console.error(err);
    }
  }

  // ---------- 이벤트 ----------
  function fd(form) { var o = {}; new FormData(form).forEach(function (v, k) { if (o[k] !== undefined) { if (!Array.isArray(o[k])) o[k] = [o[k]]; o[k].push(v); } else o[k] = v; }); return o; }
  function checked(form, name) { var el = form.querySelector('[name="' + name + '"]'); return !!(el && el.checked); }
  function tagsOf(form) { return Array.prototype.map.call(form.querySelectorAll('input[name="tags"]:checked'), function (x) { return x.value; }); }

  app.addEventListener('submit', function (ev) {
    var form = ev.target; var kind = form.getAttribute('data-form'); if (!kind) return;
    ev.preventDefault();
    var d = fd(form);
    var rp = rules();
    if (kind === 'card') {
      var l4 = String(d.last4 || '').trim(); if (!/^\d{4}$/.test(l4)) return toast('끝 4자리 숫자만 입력하세요', true);
      if (state.cards.some(function (c) { return c.last4 === l4; })) return toast('이미 등록된 끝 4자리입니다', true);
      state.cards.push({ id: uid(), alias: d.alias, last4: l4, paymentMethod: d.paymentMethod, spenderId: d.spenderId || 'self' });
      ui.importQueue.forEach(buildPreview);
      persist().then(function (ok) { if (ok) toast('카드 등록됨: ' + d.alias + ' (' + l4 + ')'); render(); }); return;
    }
    if (kind === 'design-family') {
      var by = num(d.birthYear); if (!by || by < 1900 || by > state.profile.year) return toast('출생연도를 확인하세요', true);
      state.scenario.extraFamily = (state.scenario.extraFamily || []).concat([{ id: uid(), alias: d.alias || L.rel[d.relation], relation: d.relation, birthYear: by, disability: checked(form, 'disability'), incomeUnderLimit: true, bornOrAdoptedThisYear: checked(form, 'born'), childOrder: num(d.childOrder), on: true }]);
      saveScenario().then(function () { toast('부양가족 추가(가상): ' + (d.alias || L.rel[d.relation])); }); return;
    }
    if (kind === 'import-map') {
      var en = ui.importQueue[Number(d.qi)]; if (!en) return;
      var mp = { headerRow: en.guessRow, date: Number(d.date), merchant: Number(d.merchant), amount: Number(d.amount) };
      if (d.status !== '') mp.status = Number(d.status);
      if (d.card !== '') mp.card = Number(d.card);
      en.map = mp; state.importMappings[CI.headerSignature(en.rows[en.guessRow])] = mp; buildPreview(en);
      persist().then(render); return;
    }
    if (kind === 'quick-gross') {
      var g = num(d.gross); if (!g || g <= 0) return toast('연봉을 숫자로 입력하세요', true);
      state.profile.expectedGrossAnnual = g; state.profile.expectedNonTaxable = num(d.nontax) || 0; state.profile.salaryForecastMode = 'FIXED';
      persist().then(render); return;
    }
    if (kind === 'payroll') {
      var ym = d.ym; var gross = num(d.gross); if (gross === null || gross < 0) return toast('급여를 확인하세요', true);
      var nt = num(d.nonTaxable) || 0; if (nt > gross) return toast('비과세가 급여를 초과합니다', true);
      var prev = state.payroll[ym] || {};
      var auto = E.estimatePremiums(ym, gross, nt, rp);
      state.payroll[ym] = { yearMonth: ym, gross: gross, nonTaxable: nt, incomeTaxWithheld: num(d.incomeTaxWithheld), localTaxWithheld: num(d.localTaxWithheld), status: ym <= todayYm() ? 'ACTUAL' : 'FORECAST', premiums: E.mergePremiums(prev.premiums, auto) };
      ui.editingPayroll = null; persist().then(function (ok) { if (ok) toast(ym + ' 급여 저장됨'); render(); }); return;
    }
    if (kind === 'premiums') {
      var pm = state.payroll[d.ym]; if (!pm) return;
      pm.premiums = pm.premiums || {};
      ['nationalPension', 'healthInsurance', 'longTermCare', 'employmentInsurance'].forEach(function (k) { var v = num(d[k]); var cur = pm.premiums[k] || {}; if (v !== null && v !== cur.amount) pm.premiums[k] = { amount: v, source: 'MANUAL', basis: '급여명세서 입력', status: 'OK' }; });
      ui.editingPremiums = null; persist().then(function (ok) { if (ok) toast(d.ym + ' 4대보험 저장됨'); render(); }); return;
    }
    if (kind === 'expense') {
      var amt = num(d.amount); if (amt === null || amt < 0) return toast('금액은 0 이상이어야 합니다(취소는 원거래를 선택)', true);
      if (!d.date || d.date.slice(0, 4) !== String(state.profile.year)) return toast('연말정산 연도(' + state.profile.year + ') 안의 날짜만 입력', true);
      if (d.refundOf) { var orig = state.expenses.find(function (x) { return x.id === d.refundOf; }); var refunded = state.expenses.filter(function (x) { return x.refundOf === d.refundOf && x.id !== d.id; }).reduce(function (s, x) { return s + x.amount; }, 0); if (!orig || refunded + amt > orig.amount) return toast('취소 금액이 원거래 금액을 초과합니다', true); }
      var ex = d.id ? state.expenses.find(function (x) { return x.id === d.id; }) : null;
      var obj = { id: ex ? ex.id : uid(), date: d.date, amount: amt, paymentMethod: d.paymentMethod, useCategory: d.useCategory, spenderId: d.spenderId || 'self', deductionTags: tagsOf(form), status: d.status, memo: d.memo || '', refundOf: d.refundOf || undefined, recurringId: ex ? ex.recurringId : undefined, recurringOverride: ex && ex.recurringId ? 'AMOUNT' : (ex ? ex.recurringOverride : undefined), loan: ex ? ex.loan : undefined };
      if (obj.deductionTags.indexOf('RENT_CREDIT') >= 0) obj.useCategory = 'EXCLUDED';
      if (ex) Object.assign(ex, obj); else state.expenses.push(obj);
      ui.editingExpense = null; persist().then(render); return;
    }
    if (kind === 'recurring') {
      var t = { id: d.id || uid(), name: d.name, amount: num(d.amount) || 0, paymentMethod: d.paymentMethod, useCategory: d.useCategory, spenderId: d.spenderId || 'self', deductionTags: d.tag ? [d.tag] : [], startMonth: d.startMonth, endMonth: d.endMonth || null, paymentDay: num(d.paymentDay) || 1, memo: d.memo || '', year: state.profile.year, loan: d.loanType ? { type: d.loanType, principal: num(d.principal) || 0, interest: num(d.interest) || 0 } : undefined };
      var errs = R.validateTemplate(t, state.profile.year); if (errs.length) return toast(errs.join(' / '), true);
      var range = E.employmentRange(state.profile);
      if (t.startMonth < range.startYm) toast('시작 월이 재직기간 밖입니다(카드공제 제외, 지출에는 포함)');
      R.applyTemplate(state, t, d.mode || 'ALL');
      ui.editingRecurring = null; persist().then(render); return;
    }
    if (kind === 'deduction') {
      var a2 = num(d.amount); if (a2 === null || a2 < 0) return toast('금액을 확인하세요', true);
      var meta = {};
      if (d.category === 'MEDICAL') meta = { group: d.group, kind: d.kind, reimbursed: num(d.reimbursed) || 0 };
      if (d.category === 'EDUCATION') meta = { level: d.level, kind: d.kind };
      if (d.category === 'DONATION_HOMETOWN') meta = { disaster: checked(form, 'disaster') };
      state.deductions.push({ id: uid(), category: d.category, beneficiaryId: d.beneficiaryId || 'self', amount: a2, meta: meta, evidence: checked(form, 'evidence') });
      persist().then(render); return;
    }
    if (kind === 'budget') {
      var ca = {};
      ['TRADITIONAL_MARKET', 'PUBLIC_TRANSIT', 'CULTURE'].forEach(function (k) { var m = d[k + '_mode']; if (m === 'NO') ca[k] = 0; else if (m === 'CAP') ca[k] = num(d[k + '_cap']) || 0; });
      state.budget = { remainingBudget: num(d.remainingBudget) || 0, categoryAvailability: ca, methodAvailability: { CREDIT: checked(form, 'pm_CREDIT'), DEBIT: checked(form, 'pm_DEBIT'), CASH_RECEIPT: checked(form, 'pm_CASH_RECEIPT') } };
      persist().then(function () { ui.lastOpt = O.optimize(state, rp); render(); }); return;
    }
    if (kind === 'profile') { saveProfile(form, true); return; }
    if (kind === 'family') {
      var fm = { id: d.id || uid(), alias: d.alias || L.rel[d.relation], relation: d.relation, birthYear: num(d.birthYear), incomeUnderLimit: d.incomeUnderLimit === '' ? null : d.incomeUnderLimit === 'true', disability: checked(form, 'disability'), cohabiting: checked(form, 'cohabiting'), bornOrAdoptedThisYear: checked(form, 'bornOrAdoptedThisYear'), childOrder: num(d.childOrder) };
      var i = state.family.findIndex(function (f) { return f.id === fm.id; }); var isNew = i < 0; if (isNew) state.family.push(fm); else state.family[i] = fm;
      ui.editingFamily = null; persist().then(function (ok) { if (ok) toast((isNew ? '가족 저장됨: ' : '가족 수정됨: ') + fm.alias); render(); }); return;
    }
  });

  // 연간 설정 저장. 제출(rerender=true)과 입력 즉시 자동 저장(false) 공용 — 자동 저장은 입력 중 포커스를 잃지 않게 다시 그리지 않음
  function saveProfile(form, rerender) {
    var d = fd(form); var rp = rules();
    var y = Number(d.year); if (!RULES[y]) return toast('규칙팩이 없는 연도', true);
    var eg = num(d.expectedGrossAnnual), ent = num(d.expectedNonTaxable) || 0;
    if (eg !== null && ent > eg) return toast('비과세가 연봉을 초과합니다', true);
    if (d.employmentEnd && d.employmentStart && d.employmentEnd < d.employmentStart) return toast('퇴사일이 입사일보다 앞섭니다', true);
    var my = num(d.marriageRegisteredYear);
    if (my !== null && (my < rp.marriageCredit.yearsFrom || my > rp.marriageCredit.yearsTo)) toast('혼인신고 연도가 적용 기간(' + rp.marriageCredit.yearsFrom + '~' + rp.marriageCredit.yearsTo + ') 밖 → 혼인세액공제 대상 아님');
    state.profile.year = y; state.profile.referenceMonth = d.referenceMonth || state.profile.referenceMonth; state.profile.salaryForecastMode = d.salaryForecastMode;
    state.profile.expectedGrossAnnual = eg; state.profile.expectedNonTaxable = ent; state.profile.employmentStart = d.employmentStart || (y + '-01-01'); state.profile.employmentEnd = d.employmentEnd || null;
    state.profile.cardFamilyInclusion = checked(form, 'cardFamilyInclusion'); state.profile.mortgageCapKey = d.mortgageCapKey || null;
    state.profile.selfConditions = Object.assign({}, state.profile.selfConditions, { gender: d.gender || null, birthYear: num(d.birthYear), isHouseholdHead: checked(form, 'isHouseholdHead'), isHomeless: checked(form, 'isHomeless'), disability: checked(form, 'disability'), marriageRegisteredYear: my, smeEmployment: d.smeCategory ? { category: d.smeCategory, employedAt: d.smeEmployedAt || null } : null });
    persist().then(function (ok) { if (!ok) return; toast(rerender ? '저장됨 · 전체 재계산' : '자동 저장됨'); if (rerender) render(); });
  }

  app.addEventListener('change', function (ev) {
    var el = ev.target; var act = el.getAttribute('data-action');
    var pf = el.closest && el.closest('form[data-form="profile"]');
    if (pf) { saveProfile(pf, el.name === 'year' || el.name === 'smeCategory'); return; } // 감면 구분을 고르면 입사일 칸이 나타나도록 다시 그림
    if (act === 'filter-month') { ui.expenseMonth = el.value; render(); }
    if (act === 'ded-category') { ui.dedCategory = el.value; render(); }
    if (act === 'mortgage-cap') { state.profile.mortgageCapKey = el.value || null; var y0 = window.scrollY; persist().then(function (ok) { if (ok) toast(el.value ? '대출 조건 저장됨 · 전체 재계산' : '대출 조건 미선택'); render(); window.scrollTo(0, y0); }); return; }
    if (act === 'design-toggle') { scenarioItem(el.getAttribute('data-key')).on = el.checked; saveScenario(); return; }
    if (act === 'design-amount') { var v = num(el.value); if (v === null || v < 0) { toast('금액을 숫자로 입력하세요', true); return; } scenarioItem(el.getAttribute('data-key')).amount = v; saveScenario(); return; }
    // 담보대출 조건은 설정·공제 관리와 같은 값(profile)을 쓴다 — 한 곳에서 바꾸면 모든 화면에 반영
    if (act === 'design-cond' && el.name === 'mortgageCapKey') { state.profile.mortgageCapKey = el.value || null; delete state.scenario.mortgageCapKey; saveScenario(); return; }
    if (act === 'design-cond') { state.scenario[el.name] = el.type === 'checkbox' ? el.checked : el.value; saveScenario(); return; }
    if (act === 'design-fam') {
      var fid = el.getAttribute('data-id');
      if (el.getAttribute('data-virtual')) { (state.scenario.extraFamily || []).forEach(function (m) { if (m.id === fid) m.on = el.checked; }); }
      else { state.scenario.family = state.scenario.family || {}; state.scenario.family[fid] = el.checked; }
      saveScenario(); return;
    }
    if (act === 'import-card') { var en = ui.importQueue[Number(el.getAttribute('data-qi'))]; if (en) { en.cardId = el.value; buildPreview(en); render(); } }
    if (act === 'import-file') {
      var files = Array.prototype.slice.call(el.files || []);
      files.reduce(function (p, file) { return p.then(function () { return readAndIngest(file); }); }, Promise.resolve()).then(render);
      el.value = '';
    }
    if (act === 'restore-file') {
      var f = el.files && el.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { var v = S.validateBackup(String(reader.result)); if (!v.ok) { toast('복원 거부: ' + v.error + ' (현재 데이터 유지)', true); return; } ui.restorePending = v; render(); };
      reader.readAsText(f);
    }
  });

  function download(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
  function exportCsv() {
    var rows = state.expenses.map(function (x) { return { 일자: x.date, 금액: x.refundOf ? -x.amount : x.amount, 결제수단: L.pm[x.paymentMethod] || x.paymentMethod, 사용처구분: L.cat[x.useCategory] || x.useCategory, 사용자: x.spenderId, 공제항목: (x.deductionTags || []).map(function (t) { return L.tag[t] || t; }).join('|'), 구분: x.status === 'FORECAST' ? '예상' : '실제', 고정지출: x.recurringId ? 'Y' : '', 메모: x.memo || '' }; });
    download('expenses_' + state.profile.year + '.csv', S.toCsv(rows, ['일자', '금액', '결제수단', '사용처구분', '사용자', '공제항목', '구분', '고정지출', '메모']), 'text/csv');
  }

  // 표 아래쪽 버튼으로 연 입력칸이 화면 밖에 있으면 보이지 않아 반응이 없는 것처럼 보이므로, 입력칸으로 이동하고 커서를 둔다
  function focusForm(kind, field) {
    var f = app.querySelector('form[data-form="' + kind + '"]'); if (!f) return;
    f.closest('section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    var el = f.querySelector('[name="' + field + '"]'); if (el) setTimeout(function () { el.focus({ preventScroll: true }); }, 300);
  }

  app.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-action]'); if (!btn || btn.tagName === 'SELECT' || btn.tagName === 'INPUT') return;
    var act = btn.getAttribute('data-action'), id = btn.getAttribute('data-id'), ym = btn.getAttribute('data-ym');
    var rp = rules();
    switch (act) {
      case 'demo': loadDemo(); break;
      case 'edit-payroll': ui.editingPayroll = ym; ui.editingPremiums = null; render(); focusForm('payroll', 'gross'); break;
      case 'cancel-payroll': ui.editingPayroll = null; render(); break;
      case 'payroll-fill': {
        // 비어 있는 달만, 가장 최근에 입력한 달과 같은 금액으로 채운다(이미 입력한 달은 그대로)
        var ms = E.monthsInRange(E.employmentRange(state.profile)), done = ms.filter(function (m) { return state.payroll[m]; });
        if (!done.length) break;
        var src = state.payroll[done[done.length - 1]], filled = 0;
        ms.forEach(function (m) { if (state.payroll[m]) return; state.payroll[m] = { yearMonth: m, gross: src.gross, nonTaxable: src.nonTaxable, incomeTaxWithheld: src.incomeTaxWithheld, localTaxWithheld: src.localTaxWithheld, status: m <= todayYm() ? 'ACTUAL' : 'FORECAST', premiums: E.mergePremiums(null, E.estimatePremiums(m, src.gross, src.nonTaxable, rp)) }; filled++; });
        persist().then(function () { toast(filled + '개월을 ' + done[done.length - 1] + '과 같은 금액으로 채웠어요'); render(); }); break;
      }
      case 'del-payroll': delete state.payroll[ym]; persist().then(render); break;
      case 'edit-premiums': ui.editingPremiums = ym; render(); focusForm('premiums', 'nationalPension'); break;
      case 'cancel-premiums': ui.editingPremiums = null; render(); break;
      case 'reset-premiums': { var p = state.payroll[ym]; if (p) { p.premiums = E.mergePremiums(null, E.estimatePremiums(ym, p.gross, p.nonTaxable, rp)); persist().then(render); } break; }
      case 'del-card': state.cards = state.cards.filter(function (x) { return x.id !== id; }); persist().then(render); break;
      case 'design-reset': state.scenario = {}; saveScenario().then(function () { toast('설계를 초기화했습니다'); }); break;
      case 'design-fam-del': state.scenario.extraFamily = (state.scenario.extraFamily || []).filter(function (m) { return m.id !== id; }); saveScenario(); break;
      case 'connect-dir': connectDir(); break;
      case 'regrant-dir': regrantDir(); break;
      case 'scan-dir': scanDir().then(render); break;
      case 'disconnect-dir': ui.dir = null; S.clearDirHandle().then(function () { toast('폴더 연결을 해제했습니다'); render(); }); break;
      case 'import-skip': {
        var qs = Number(btn.getAttribute('data-qi')), es = ui.importQueue[qs]; if (!es) break;
        state.importedFiles[es.key] = { name: es.name, at: new Date().toISOString(), skipped: true };
        ui.importQueue.splice(qs, 1); persist().then(function () { toast('건너뜀: ' + es.name); render(); }); break;
      }
      case 'import-commit': {
        var qc = Number(btn.getAttribute('data-qi')), ec = ui.importQueue[qc]; if (!ec || !ec.result) break;
        ec.result.added.forEach(function (x, i) {
          var c = app.querySelector('[name="cat_' + qc + '_' + i + '"]'), m = app.querySelector('[name="pm_' + qc + '_' + i + '"]');
          if (c) { if (c.value !== x.useCategory && x.merchant) state.merchantRules[x.merchant] = c.value; x.useCategory = c.value; } if (m) x.paymentMethod = m.value;
          delete x.needsReview; state.expenses.push(x);
        });
        var n2 = ec.result.added.length;
        state.importedFiles[ec.key] = { name: ec.name, at: new Date().toISOString(), added: n2 };
        ui.importQueue.splice(qc, 1); ui.importQueue.forEach(buildPreview);
        persist().then(function () { toast(n2 + '건을 지출에 추가했습니다'); render(); }); break;
      }
      case 'edit-expense': ui.editingExpense = id; render(); window.scrollTo(0, 0); break;
      case 'cancel-expense': ui.editingExpense = null; render(); break;
      case 'del-expense': state.expenses = state.expenses.filter(function (x) { return x.id !== id && x.refundOf !== id; }); persist().then(render); break;
      case 'skip-expense': { var sx = state.expenses.find(function (x) { return x.id === id; }); if (sx) { sx.amount = 0; sx.recurringOverride = 'SKIP'; persist().then(render); } break; }
      case 'edit-recurring': ui.editingRecurring = id; render(); window.scrollTo(0, 0); break;
      case 'cancel-recurring': ui.editingRecurring = null; render(); break;
      case 'end-recurring': { var t = state.recurring.find(function (x) { return x.id === id; }); if (t) { var ref = state.profile.referenceMonth; var t2 = Object.assign({}, t, { endMonth: ref < t.startMonth ? t.startMonth : ref }); R.applyTemplate(state, t2, 'ALL'); persist().then(render); } break; }
      case 'del-recurring': ui.confirm = { type: 'del-recurring', id: id }; render(); break;
      case 'confirm-del-recurring': R.removeTemplate(state, id, btn.getAttribute('data-keep') === '1'); ui.confirm = null; persist().then(render); break;
      case 'cancel-confirm': ui.confirm = null; ui.restorePending = null; render(); break;
      case 'del-deduction': state.deductions = state.deductions.filter(function (x) { return x.id !== id; }); persist().then(render); break;
      case 'edit-family': ui.editingFamily = id; render(); break;
      case 'cancel-family': ui.editingFamily = null; render(); break;
      case 'del-family': state.family = state.family.filter(function (x) { return x.id !== id; }); persist().then(render); break;
      case 'backup': download('tax-planner-backup-' + state.profile.year + '-' + todayYm() + '.json', S.toBackup(state)); toast('백업 파일을 내려받았습니다(민감정보 포함 가능)'); break;
      case 'csv': exportCsv(); break;
      case 'wipe': ui.confirm = { type: 'wipe' }; render(); break;
      case 'confirm-wipe': S.clear().then(function () { state = ensureDefaults(S.emptyState(2025)); ui.confirm = null; ui.dir = null; ui.importQueue = []; toast('삭제 완료'); go('#/plan'); render(); }).catch(function (e) { toast('삭제 실패: ' + e.message, true); }); break;
      case 'confirm-restore': { var v = ui.restorePending; if (!v) break; download('tax-planner-before-restore-' + Date.now() + '.json', S.toBackup(state)); var old = state; state = ensureDefaults(v.state); ui.restorePending = null; S.save(state).then(function () { toast('복원 완료(재계산됨)'); render(); }).catch(function (e) { state = old; toast('복원 저장 실패, 기존 데이터 유지: ' + e.message, true); render(); }); break; }
    }
  });

  function loadDemo() {
    var y = state.profile.year;
    state.profile.expectedGrossAnnual = 52000000; state.profile.expectedNonTaxable = 0; state.profile.salaryForecastMode = 'FIXED';
    state.profile.selfConditions = Object.assign({}, state.profile.selfConditions, { gender: 'M', birthYear: 1985, isHouseholdHead: true, isHomeless: true });
    state.family = [{ id: 'demo-sp', alias: '아내(예시)', relation: 'SPOUSE', birthYear: 1987, incomeUnderLimit: false, cohabiting: true }, { id: 'demo-k1', alias: '첫째(예시)', relation: 'LINEAL_DESCENDANT', birthYear: 2015, incomeUnderLimit: true, cohabiting: true }];
    var ex = [];
    for (var m = 1; m <= 9; m++) { var mm = String(m).padStart(2, '0'); ex.push({ id: 'demo-c' + m, date: y + '-' + mm + '-15', amount: 1200000, paymentMethod: 'CREDIT', useCategory: 'GENERAL', spenderId: 'self', deductionTags: [], status: 'ACTUAL', memo: '예시' }); ex.push({ id: 'demo-d' + m, date: y + '-' + mm + '-20', amount: 300000, paymentMethod: 'DEBIT', useCategory: 'GENERAL', spenderId: 'self', deductionTags: [], status: 'ACTUAL', memo: '예시' }); ex.push({ id: 'demo-m' + m, date: y + '-' + mm + '-05', amount: 80000, paymentMethod: 'DEBIT', useCategory: 'TRADITIONAL_MARKET', spenderId: 'self', deductionTags: [], status: 'ACTUAL', memo: '예시' }); ex.push({ id: 'demo-w' + m, date: y + '-' + mm + '-10', amount: 320000, paymentMethod: 'CREDIT', useCategory: 'GENERAL', spenderId: 'demo-sp', deductionTags: [], status: 'ACTUAL', memo: '예시(배우자, 분리)' }); }
    state.expenses = ex;
    state.deductions = [{ id: 'demo-med', category: 'MEDICAL', beneficiaryId: 'self', amount: 900000, meta: { group: 'UNLIMITED', kind: 'NORMAL', reimbursed: 0 }, evidence: false }];
    persist().then(function () { toast('예시 데이터를 불러왔습니다(모든 값은 예시)'); render(); });
  }

  // ---------- 시작 ----------
  S.load().then(function (saved) { state = ensureDefaults(saved || S.emptyState(2025)); render(); restoreDir(); takeSharedFiles(); registerServiceWorker(); }).catch(function (e) { state = ensureDefaults(S.emptyState(2025)); render(); toast('저장소를 열 수 없어 이 세션에만 유지됩니다: ' + e.message, true); });
  window.addEventListener('hashchange', function () { ui.confirm = null; render(); });
})();
