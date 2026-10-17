/*
 * storage.js — IndexedDB 단일 사용자 저장, JSON 백업/복원, CSV 내보내기 (REQ-010)
 * 순수 함수(validateBackup, toCsv, csvSafe)는 Node 테스트 가능. IndexedDB 부분은 브라우저 전용.
 */
(function (root, factory) {
  var m = factory();
  if (typeof module === 'object' && module.exports) module.exports = m;
  root.TaxStorage = m;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  var SCHEMA_VERSION = 1;
  var DB_NAME = 'work-tax-planner';
  var STORE = 'app';
  var KEY = 'state';
  var DIR_KEY = 'importDir';

  function emptyState(year) {
    year = year || 2025;
    return {
      schemaVersion: SCHEMA_VERSION,
      profile: {
        year: year,
        expectedGrossAnnual: null,
        expectedNonTaxable: 0,
        salaryForecastMode: 'FIXED',
        employmentStart: year + '-01-01',
        employmentEnd: null,
        referenceMonth: null,
        selfConditions: {
          gender: null, isHouseholdHead: false, isSingleParent: false,
          incomeUnderWomanDeductionLimit: null, marriageRegisteredYear: null,
          smeEmployment: null, isHomeless: null, birthYear: null, disability: false
        },
        cardFamilyInclusion: false,
        mortgageCapKey: null
      },
      family: [],
      payroll: {},
      expenses: [],
      recurring: [],
      deductions: [],
      budget: { remainingBudget: 0, categoryAvailability: {}, methodAvailability: {} }
    };
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB 사용 불가'));
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB open 실패')); };
    });
  }

  function load() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function save(state) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(state, KEY);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error || new Error('저장 실패')); };
        tx.onabort = function () { reject(tx.error || new Error('저장 중단')); };
      });
    });
  }

  function clear() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(KEY);
        tx.objectStore(STORE).delete(DIR_KEY);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  // 카드내역 폴더 연결(File System Access 핸들). 상태(백업 대상)와 분리해 같은 저장소의 별도 키에 둔다.
  function kv(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode); var req = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { resolve(req && req.result); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  function loadDirHandle() { return kv('readonly', function (st) { return st.get(DIR_KEY); }).then(function (h) { return h || null; }); }
  function saveDirHandle(h) { return kv('readwrite', function (st) { return st.put(h, DIR_KEY); }); }
  function clearDirHandle() { return kv('readwrite', function (st) { return st.delete(DIR_KEY); }); }

  function toBackup(state) {
    var copy = JSON.parse(JSON.stringify(state));
    copy.schemaVersion = SCHEMA_VERSION;
    copy.exportedAt = new Date().toISOString();
    copy.note = '연말정산 카드공제 계산기 백업. 유도값(인적공제·근로소득공제 등)은 포함하지 않으며 복원 후 재계산됩니다. 가족 별칭 등 민감정보가 포함될 수 있습니다.';
    return JSON.stringify(copy, null, 2);
  }

  function validateBackup(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'JSON 구문 오류: ' + e.message }; }
    if (!data || typeof data !== 'object') return { ok: false, error: '객체가 아닙니다' };
    if (data.schemaVersion !== SCHEMA_VERSION) return { ok: false, error: 'schemaVersion 불일치(' + data.schemaVersion + ' ≠ ' + SCHEMA_VERSION + ')' };
    if (!data.profile || typeof data.profile.year !== 'number') return { ok: false, error: 'profile.year 없음' };
    var arrays = ['family', 'expenses', 'recurring', 'deductions'];
    for (var i = 0; i < arrays.length; i++) {
      if (!Array.isArray(data[arrays[i]])) return { ok: false, error: arrays[i] + '가 배열이 아닙니다' };
    }
    if (!data.payroll || typeof data.payroll !== 'object') return { ok: false, error: 'payroll 없음' };
    for (var j = 0; j < data.expenses.length; j++) {
      var e = data.expenses[j];
      if (typeof e.amount !== 'number' || !isFinite(e.amount)) return { ok: false, error: '지출 금액 오류: ' + (e.id || j) };
    }
    delete data.exportedAt; delete data.note;
    return { ok: true, state: data };
  }

  function csvSafe(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[",\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(rows, headers) {
    var lines = [headers.map(csvSafe).join(',')];
    rows.forEach(function (r) { lines.push(headers.map(function (h) { return csvSafe(r[h]); }).join(',')); });
    return '﻿' + lines.join('\r\n');
  }

  return { SCHEMA_VERSION: SCHEMA_VERSION, emptyState: emptyState, load: load, save: save, clear: clear, loadDirHandle: loadDirHandle, saveDirHandle: saveDirHandle, clearDirHandle: clearDirHandle, toBackup: toBackup, validateBackup: validateBackup, csvSafe: csvSafe, toCsv: toCsv };
});
