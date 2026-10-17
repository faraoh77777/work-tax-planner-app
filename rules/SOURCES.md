# 규칙팩 출처 기록 (rules/SOURCES.md)

확인일: 2026-10-16. 1차 출처 = 국세청 「2025년 귀속 연말정산 세액계산 및 지급명세서 제출 방법 안내」 사본 `docs/참고_국세청_2025귀속_연말정산안내.pdf`(106쪽). 아래 "p.N"은 안내 인쇄 쪽번호이며 PDF 뷰어 쪽 = N + 3.

## 2025 팩 (rules/2025.js, 2025.v1.0, LAW_CHECKED)
| 규칙 키 | 값 요약 | 출처 | 확인 |
|---|---|---|---|
| card.minUseRate / rates / limitTiers | 25% · 15/30/30/40/40 · 7천만원 이하 300+300, 초과 250+200 | 안내 p.28 공제율·한도표, p.41 산식 ①②③, p.42 사례 | GUIDE, TC-006B 공식 사례 530만원 단계별 일치 |
| card.cultureGrossCap / sportsFacilityFrom | 7천만원 · 2025-07-01 | 안내 p.24(개정), p.28 | GUIDE |
| card.deductionOrder | ㉮→㉯㉰→㉱㉲ 차감 | 안내 p.41 ① | GUIDE |
| card.childLimitBonus / consumptionIncreaseBonus | null(2025 없음) | 안내에 산식 없음 | GUIDE |
| card.usedCarInclusionRate | 10% | 조특법 §126의2 시행령(안내 미수록) | LAW |
| overallDeductionCap | 2,500만원, 7종 | 안내 p.29 · 조특법 §132의2 | GUIDE |
| earnedIncomeDeduction | 구간표, 한도 2천만원 | 소득세법 §47 · 안내 종교인 비교표(총급여 5,000만 → 1,225만원, TC-009 일치) | LAW+GUIDE |
| taxBrackets | 6/15/24/35/38/40/42/45%, 누진공제 | 소득세법 §55①(안내 미수록) | LAW — 조문 재확인 권장 |
| earnedIncomeTaxCredit | 55%/30%, 한도 74·66·50·20만원 | 안내 p.30 · 소득세법 §59 | GUIDE |
| standardTaxCredit | 13만원 | 안내 p.32 | GUIDE |
| personal | 기본 150만, 경로 100만(70세), 장애 200만, 부녀자 50만(종합소득 3천만), 한부모 100만, 나이·소득 요건 | 안내 p.26 | GUIDE |
| childTaxCredit | 8세 이상, 25/55/55+40만, 출산입양 30/50/70 | 안내 p.5·p.30 | GUIDE |
| marriageCredit | 50만원, 2024~2026 혼인신고, 생애 1회 | 안내 p.30 | GUIDE |
| smeReduction | 70%(3년)/청년 90%(5년), 연 200만 | 안내 p.29 | GUIDE |
| housing | 청약 40%·300만·7천만, 임차 원리금 40%·합산 400만, 담보 이자 600~2,000만 | 안내 p.27~28 | GUIDE |
| insurance | 12%·100만, 장애인전용 15%·100만 | 안내 p.31 | GUIDE |
| medical | 3% 문턱, 15/20/30%, 700만, 안경 50만, 산후조리 200만 | 안내 p.31 | GUIDE |
| education | 15%, 300만/900만, 교복 50만, 체험 30만, 학원비 불인정 | 안내 p.31 | GUIDE |
| donation | 정치·고향사랑 10만 100/110, 15%(25%/30%), 특례·일반 15/30%, 한도 100/30/10% | 안내 p.32~33 | GUIDE |
| pensionAccount | 600만/900만, 15%/12%(5,500만), ISA 10%·300만 | 안내 p.30 | GUIDE |
| rent | 15/17%(5,500만), 1,000만, 8천만 | 안내 p.32 | GUIDE |
| creditOrder | 16단계 | 안내 p.33 · 소득세법 §60·§61 | GUIDE |
| localIncomeTax | 10% | 지방세법 §103의3 | LAW |
| rounding | 원 미만 버림 | 지급명세서 작성 방법 2 | GUIDE |
| premiums(4대보험) | 국민연금 4.5%(상한 617만→637만 7월, 하한 39만→40만), 건강 3.545%, 장기요양 건강보험료의 12.95%, 고용 0.9% | 국민연금공단·건강보험공단·고용노동부 공표값 — **안내 PDF에 없음, 미대조** | UNVERIFIED → 화면에 "확인 필요" 배지, 사용자 수정 가능 |

## 2026 팩 (rules/2026.js, 2026.v0.1, LAW_CHECKED)
- 2025 값 복사. 카드 자녀 한도 가산(2026 지출분부터) = null(조특법 §126의2 확인 전). 자녀세액공제 나이 변경 여부 미확인(8세 유지 + 확인 필요 표시). 4대보험 2026 요율 없음 → 자동 추정 불가(확인 필요).

## 공식 근거 출발점(00_Claude_시작안내)
- 국세청 연말정산 종합 안내 https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=238938&mi=2304
- 국가법령정보센터 https://www.law.go.kr/ — 소득세법 §47·§50~52·§55·§59·§59의2·§59의4·§60·§61, 조특법 §126의2·§132의2·§30, 지방세법 §103의3

## 검증단계 판정
- 2025 팩: LAW_CHECKED. 카드공제 모듈은 공식 사례(p.42) 단계별 일치. 전체 세액(TC-009)은 공식 사례가 없어 수기 대조만 수행 → CASE_VERIFIED로 올리려면 홈택스 모의계산 결과 1건 이상과 대조 필요.
