/*
 * cardimport.js — 카드사 이용내역 엑셀·CSV → 지출 후보 (순수 함수, Node 테스트 가능)
 * 카드사 공식 홈페이지에서 사용자가 직접 내려받은 파일만 다룬다. 파일은 브라우저 안에서만 읽고 전송하지 않는다.
 * 엑셀 해석은 SheetJS(js/vendor/xlsx.full.min.js)에 맡기고, 이 모듈은 표(행 배열)만 받는다.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  root.CardImport = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // 가맹점 키워드 → 사용처 구분. 첫 일치 우선(제외 > 교통 > 문화 > 시장).
  var RULES = [
    { cat: 'EXCLUDED', re: /이체|송금|ATM|현금\s*인출|타행|대체|보험|손해|화재|생명|통신|SKT|SK텔레콤|KT\b|LG\s?U\+|LGU|유플러스|알뜰|관리비|아파트|국세|지방세|세금|과태료|등록금|상품권|면세점|대출|원리금|자동차(리스|할부)/i },
    { cat: 'PUBLIC_TRANSIT', re: /지하철|서울교통|코레일|KORAIL|티머니|T-?MONEY|버스|철도|SRT|캐시비|교통공사|시내버스/i },
    { cat: 'CULTURE', re: /교보문고|영풍문고|예스24|YES24|알라딘|반디앤루니스|CGV|메가박스|롯데시네마|인터파크\s?티켓|멜론티켓|티켓링크|국립|미술관|박물관|공연/i },
    { cat: 'SPORTS_FACILITY', re: /수영장|체력단련|헬스|피트니스|스포츠센터|짐\b|GYM/i },
    { cat: 'TRADITIONAL_MARKET', re: /전통시장|재래시장|[가-힣]{1,6}시장|상점가|온누리/ }
  ];
  function classifyMerchant(name) {
    var n = String(name || '');
    for (var i = 0; i < RULES.length; i++) if (RULES[i].re.test(n)) return { useCategory: RULES[i].cat, matched: true };
    return { useCategory: 'GENERAL', matched: false };
  }

  // 카드 발급사 공식 홈페이지(첫 화면). 로그인·다운로드는 사용자가 직접 한다. 주소 확인 2026-10-18.
  // 전업 카드사 + 은행 겸영 카드(신용·체크) + 인터넷은행·상호금융 체크카드. 목록에 없는 카드도 파일 형식만 맞으면 읽는다.
  var ISSUERS = [
    { group: '카드사', name: '신한카드', url: 'https://www.shinhancard.com/' },
    { group: '카드사', name: '삼성카드', url: 'https://www.samsungcard.com/' },
    { group: '카드사', name: 'KB국민카드', url: 'https://card.kbcard.com/' },
    { group: '카드사', name: '현대카드', url: 'https://www.hyundaicard.com/' },
    { group: '카드사', name: '롯데카드', url: 'https://www.lottecard.co.kr/' },
    { group: '카드사', name: '우리카드', url: 'https://pc.wooricard.com/' },
    { group: '카드사', name: '하나카드', url: 'https://www.hanacard.co.kr/' },
    { group: '카드사', name: 'BC카드', url: 'https://www.bccard.com/' },
    { group: '은행', name: 'NH농협카드', url: 'https://card.nonghyup.com/' },
    { group: '은행', name: 'IBK기업은행', url: 'https://www.ibk.co.kr/' },
    { group: '은행', name: 'iM뱅크(대구)', url: 'https://www.imbank.co.kr/' },
    { group: '은행', name: 'BNK부산은행', url: 'https://www.busanbank.co.kr/' },
    { group: '은행', name: 'BNK경남은행', url: 'https://www.knbank.co.kr/' },
    { group: '은행', name: '광주은행', url: 'https://www.kjbank.com/' },
    { group: '은행', name: '전북은행', url: 'https://www.jbbank.co.kr/' },
    { group: '은행', name: '제주은행', url: 'https://www.jejubank.co.kr/' },
    { group: '은행', name: '수협은행', url: 'https://www.suhyup-bank.com/' },
    { group: '은행', name: 'SC제일은행', url: 'https://www.standardchartered.co.kr/' },
    { group: '은행', name: '씨티카드', url: 'https://www.citibank.co.kr/' },
    { group: '은행', name: 'KDB산업은행', url: 'https://www.kdb.co.kr/' },
    { group: '체크카드', name: '카카오뱅크', url: 'https://www.kakaobank.com/' },
    { group: '체크카드', name: '토스뱅크', url: 'https://www.tossbank.com/' },
    { group: '체크카드', name: '케이뱅크', url: 'https://www.kbanknow.com/' },
    { group: '체크카드', name: '우체국', url: 'https://www.epostbank.go.kr/' },
    { group: '체크카드', name: '새마을금고(MG)', url: 'https://www.kfcc.co.kr/' },
    { group: '체크카드', name: '신협', url: 'https://www.cu.co.kr/' }
  ];

  // 열 제목 인식. 금액은 수수료·잔액·포인트·외화·입금 등 부가 금액 열을 제외한다.
  var COLS = {
    date: /이용\s*일|승인\s*일|거래\s*일|사용\s*일|매출\s*일|일자|날짜|일시/,
    time: /시간|시각/,
    merchant: /가맹점|이용\s*하신\s*곳|이용\s*처|사용\s*처|상호|거래\s*처|이용\s*내역|내용|적요|사용\s*내역/,
    amount: /금액|출금\s*액|사용\s*액|이용\s*액/,
    status: /취소|상태|승인\s*구분|매출\s*구분|거래\s*구분|구분/,
    card: /카드\s*번호|이용\s*카드|카드\s*명|카드/,
    approvalNo: /승인\s*번호/
  };
  var AMOUNT_EXCLUDE = /수수료|이자|잔액|포인트|적립|할인|회차|개월|외화|현지|USD|달러|환율|예정|청구|누적|한도|입금|캐시백/;
  var MERCHANT_EXCLUDE = /카드|금액|번호|일자|날짜|구분/;
  // 금액 열이 여러 개면(국내/해외, 이용/결제 등) 원화 이용금액을 우선한다
  function amountScore(h) {
    if (/해외/.test(h) && !/원화|\(원\)/.test(h)) return 1;
    if (/국내|원화|\(원\)/.test(h)) return 6;
    if (/이용|승인|매출|사용|거래/.test(h)) return 5;
    if (/결제|출금/.test(h)) return 4;
    return 3;
  }

  function cellText(v) { return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim(); }

  // 한 행을 열 제목으로 보고 매핑을 만든다. 날짜·가맹점·금액이 모두 있어야 인정.
  function mapHeader(row) {
    var map = {}, best = 0;
    row.forEach(function (raw, i) {
      var h = cellText(raw); if (!h || h.length > 24) return;
      if (map.approvalNo === undefined && COLS.approvalNo.test(h)) { map.approvalNo = i; return; }
      if (map.cancelDate === undefined && /취소/.test(h) && /일/.test(h)) { map.cancelDate = i; return; }
      if (/결제\s*(예정)?\s*일|청구/.test(h)) return;
      if (COLS.amount.test(h) && !AMOUNT_EXCLUDE.test(h)) { var sc = amountScore(h); if (sc > best) { best = sc; map.amount = i; } return; }
      if (map.date === undefined && COLS.date.test(h) && !/취소/.test(h)) { map.date = i; if (/일시/.test(h)) map.dateHasTime = true; return; }
      if (map.time === undefined && COLS.time.test(h)) { map.time = i; return; }
      if (map.merchant === undefined && COLS.merchant.test(h) && !MERCHANT_EXCLUDE.test(h.replace(/가맹점/, ''))) { map.merchant = i; return; }
      if (map.status === undefined && COLS.status.test(h)) { map.status = i; return; }
      if (map.card === undefined && COLS.card.test(h)) { map.card = i; return; }
    });
    return map.date !== undefined && map.merchant !== undefined && map.amount !== undefined ? map : null;
  }

  // 표 위쪽(안내문·조회조건 줄 다음)에서 열 제목 행을 찾는다. 제목이 두 줄로 나뉜 표(병합 셀)는 두 줄을 합쳐 본다.
  function detectHeader(rows) {
    for (var r = 0; r < Math.min(rows.length, 40); r++) {
      var m = mapHeader(rows[r] || []);
      if (m) { m.headerRow = r; return m; }
      var a = rows[r] || [], b = rows[r + 1] || [];
      if (a.length && b.length) {
        var merged = []; for (var i = 0; i < Math.max(a.length, b.length); i++) merged.push((cellText(a[i]) + ' ' + cellText(b[i])).trim());
        m = mapHeader(merged);
        if (m) { m.headerRow = r + 1; return m; }
      }
    }
    return null;
  }
  // 자동 인식 실패 시 사용자가 열을 고르도록, 글자 칸이 가장 많은 줄을 제목 후보로 돌려준다.
  function guessHeaderRow(rows) {
    var best = 0, bestN = -1;
    for (var r = 0; r < Math.min(rows.length, 40); r++) {
      var n = (rows[r] || []).filter(function (c) { var t = cellText(c); return t && !/^[\d,.\-:\/ ]+$/.test(t); }).length;
      if (n > bestN) { bestN = n; best = r; }
    }
    return best;
  }
  function headerSignature(row) { return (row || []).map(cellText).join('|'); }

  function pad(n) { return String(n).padStart(2, '0'); }
  // Date 객체·엑셀 일련번호·'2025.10.16'·'2025-10-16 14:23'·'20251016'·'25.10.16'·'10/16' 등을 'YYYY-MM-DD'와 'HH:MM'으로
  function parseDateTime(v, year) {
    if (v instanceof Date && !isNaN(v)) return { date: v.getFullYear() + '-' + pad(v.getMonth() + 1) + '-' + pad(v.getDate()), time: (v.getHours() || v.getMinutes()) ? pad(v.getHours()) + ':' + pad(v.getMinutes()) : '' };
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      var ms = Math.round((v - 25569) * 86400000); var d = new Date(ms);
      return { date: d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()), time: (v % 1) ? pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) : '' };
    }
    var s = cellText(v); if (!s) return null;
    var tm = s.match(/(\d{1,2}):(\d{2})/); var time = tm ? pad(+tm[1]) + ':' + tm[2] : '';
    var m = s.match(/^(\d{4})\s*[.\-\/년]\s*(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})/) || s.match(/^(\d{4})(\d{2})(\d{2})(?!\d)/);
    var y, mo, da;
    if (m) { y = +m[1]; mo = +m[2]; da = +m[3]; }
    else if ((m = s.match(/^(\d{2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})(?!\d)/))) { y = 2000 + +m[1]; mo = +m[2]; da = +m[3]; }
    else if ((m = s.match(/^(\d{1,2})\s*[.\-\/월]\s*(\d{1,2})(?!\d)/))) { y = year; mo = +m[1]; da = +m[2]; }
    else return null;
    if (!y || mo < 1 || mo > 12 || da < 1 || da > 31) return null;
    return { date: y + '-' + pad(mo) + '-' + pad(da), time: time };
  }
  function parseAmount(v) {
    if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
    var s = cellText(v).replace(/[원,\s]/g, ''); var neg = /^\(.*\)$/.test(s) || /^[-−]/.test(s);
    s = s.replace(/[()\-−+]/g, ''); if (!/^\d+(\.\d+)?$/.test(s)) return null;
    var n = Math.round(parseFloat(s)); return neg ? -n : n;
  }

  /*
   * 표 → 거래 목록. year: 귀속연도(연도 없는 날짜 보완 + 다른 연도 거래 걸러내기)
   * 반환 items, outOfYear(다른 연도 건수), ignored(합계·빈 줄 등 해석 안 한 줄 수)
   */
  function parseRows(rows, map, year) {
    var items = [], outOfYear = 0, ignored = 0;
    for (var r = map.headerRow + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var dt = parseDateTime(row[map.date], year);
      var amt = parseAmount(row[map.amount]);
      var merchant = cellText(row[map.merchant]);
      if (!dt || amt === null || amt === 0 || !merchant || /^(합\s*계|소\s*계|총\s*계)/.test(merchant)) { ignored++; continue; }
      if (map.time !== undefined && !dt.time) { var t2 = parseDateTime('2000.01.01 ' + cellText(row[map.time]), year); if (t2) dt.time = t2.time; }
      if (dt.date.slice(0, 4) !== String(year)) { outOfYear++; continue; }
      var status = map.status !== undefined ? cellText(row[map.status]) : '';
      var cancel = amt < 0 || /취소|반품|환불/.test(status) || (map.cancelDate !== undefined && !!cellText(row[map.cancelDate]));
      var cardTxt = map.card !== undefined ? cellText(row[map.card]) : '';
      var l4 = cardTxt.match(/(\d{4})\D*$/);
      var cls = classifyMerchant(merchant);
      items.push({
        type: cancel ? 'CANCEL' : 'APPROVAL', date: dt.date, time: dt.time, amount: Math.abs(amt), merchant: merchant,
        last4: l4 ? l4[1] : '', approvalNo: map.approvalNo !== undefined ? cellText(row[map.approvalNo]) : '',
        useCategory: cls.useCategory, classified: cls.matched, checkCard: /체크|직불/.test(cardTxt + ' ' + status)
      });
    }
    return { items: items, outOfYear: outOfYear, ignored: ignored };
  }

  // 파일(ArrayBuffer) → 첫 번째 거래 시트의 행 배열. CSV는 UTF-8이 아니면 EUC-KR로 읽는다.
  function readWorkbookRows(XLSX, buf, fileName) {
    var wb;
    if (/\.csv$/i.test(fileName || '')) {
      var bytes = new Uint8Array(buf), text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { text = new TextDecoder('euc-kr').decode(bytes); }
      wb = XLSX.read(text.replace(/^﻿/, ''), { type: 'string', cellDates: true, raw: true });
    } else wb = XLSX.read(buf, { type: 'array', cellDates: true });
    var fallback = null;
    for (var i = 0; i < wb.SheetNames.length; i++) {
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[i]], { header: 1, raw: true, defval: '' });
      if (detectHeader(rows)) return rows;
      if (!fallback && rows.length) fallback = rows;
    }
    return fallback || [];
  }

  function dedupKey(it) { return ['XL', it.type, it.date, it.time, it.amount, it.last4, it.approvalNo, it.merchant].join('|'); }

  /*
   * 거래 목록을 지출 후보로 변환한다. 상태를 바꾸지 않는다.
   * cards: 등록 카드 [{ id, last4, paymentMethod, spenderId }]  defaultCard: 이 파일의 카드(사용자 선택, 없으면 null)
   * 같은 파일 안의 똑같은 거래(시각 없는 같은 가맹점·금액)는 순번을 붙여 각각 인정하고, 같은 파일을 다시 올리면 전부 중복으로 제외된다.
   * 반환 added, skipped(중복), unmatchedCancels(원거래를 못 찾은 취소 — 카드사가 원거래를 이미 빼고 보여준 경우가 대부분)
   */
  function buildExpenses(items, existing, cards, uid, rules, defaultCard) {
    var cardBy = {}; (cards || []).forEach(function (c) { if (c.last4) cardBy[c.last4] = c; });
    var seen = {}; (existing || []).forEach(function (e) { if (e.sourceKey) seen[e.sourceKey] = true; });
    var added = [], skipped = [], unmatchedCancels = [];
    var pool = (existing || []).filter(function (e) { return !e.refundOf && e.sourceKey; });
    var occ = {};
    var ordered = items.filter(function (i) { return i.type === 'APPROVAL'; }).concat(items.filter(function (i) { return i.type === 'CANCEL'; }));
    ordered.forEach(function (it) {
      var base = dedupKey(it); occ[base] = (occ[base] || 0) + 1;
      var key = base + '#' + occ[base];
      if (seen[key]) { skipped.push(it); return; }
      var card = (it.last4 && cardBy[it.last4]) || defaultCard || null;
      var ex = {
        id: uid(), date: it.date, amount: it.amount, paymentMethod: card ? card.paymentMethod : (it.checkCard ? 'DEBIT' : 'CREDIT'), useCategory: it.useCategory,
        spenderId: card ? (card.spenderId || 'self') : 'self', deductionTags: [], status: 'ACTUAL',
        memo: (card ? card.alias + ' ' : '') + it.merchant, source: 'EXCEL', merchant: it.merchant, sourceKey: key,
        cardLast4: it.last4 || (card && card.last4) || undefined, needsReview: !it.classified || !card
      };
      if (it.type !== 'CANCEL' && rules && rules[it.merchant]) { ex.useCategory = rules[it.merchant]; ex.needsReview = !card; }
      if (it.type === 'CANCEL') {
        var orig = pool.concat(added.filter(function (a) { return !a.refundOf; })).filter(function (o) {
          return o.amount === it.amount && o.date <= it.date && o.merchant === it.merchant && (!it.last4 || !o.cardLast4 || o.cardLast4 === it.last4) &&
            !(existing || []).concat(added).some(function (r) { return r.refundOf === o.id; });
        }).sort(function (a, b) { return a.date < b.date ? 1 : -1; })[0];
        if (!orig) { unmatchedCancels.push(it); return; }
        ex.refundOf = orig.id; ex.paymentMethod = orig.paymentMethod; ex.useCategory = orig.useCategory; ex.spenderId = orig.spenderId; ex.needsReview = false;
      }
      seen[key] = true;
      added.push(ex);
    });
    return { added: added, skipped: skipped, unmatchedCancels: unmatchedCancels };
  }

  // 폴더 자동 확인에서 이미 처리한 파일인지 판정하는 키(이름·크기·수정시각)
  function fileKey(f) { return [f.name, f.size, f.lastModified].join('|'); }
  function isSheetFile(name) { return /\.(xlsx|xls|csv)$/i.test(name || '') && !/^~\$/.test(name); }

  return {
    ISSUERS: ISSUERS, classifyMerchant: classifyMerchant, mapHeader: mapHeader, detectHeader: detectHeader, guessHeaderRow: guessHeaderRow, headerSignature: headerSignature,
    parseDateTime: parseDateTime, parseAmount: parseAmount, parseRows: parseRows, readWorkbookRows: readWorkbookRows, buildExpenses: buildExpenses, dedupKey: dedupKey,
    fileKey: fileKey, isSheetFile: isSheetFile
  };
});
