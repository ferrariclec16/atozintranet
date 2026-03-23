# AtoZ ELECTRON 인트라넷

## 개요

AtoZ ELECTRON(에이투지 일렉트론) 사내 인트라넷 시스템. 부품 검색, 발주서 정리, DB 조회/업데이트 기능을 제공합니다.

- **배포 도메인**: adminatoz.com (A 레코드 → 34.111.179.208)
- **패키지 관리**: pnpm workspaces (모노레포)
- **Node.js**: 24, TypeScript 5.9

## 구조

```text
artifacts/
├── api-server/          # Express 5 백엔드 서버
│   └── src/
│       ├── config/
│       │   └── employees.ts        # 직원 목록 (세션 기반 인증)
│       ├── routes/
│       │   ├── auth.ts             # 로그인/로그아웃
│       │   ├── parts.ts            # 부품 검색 (Nexar GraphQL)
│       │   ├── purchase-history.ts # 발주 이력 CRUD (PostgreSQL)
│       │   ├── admin.ts            # 관리자 접근 로그
│       │   └── health.ts
│       └── types/session.d.ts
│
└── web/                 # React + Vite 프론트엔드
    └── src/
        ├── App.tsx                  # 라우팅
        ├── components/
        │   └── layout/
        │       └── sidebar.tsx      # 사이드바 네비게이션
        └── pages/
            ├── login.tsx            # 로그인 페이지
            ├── dashboard.tsx        # 대시보드
            ├── parts-search.tsx     # 부품 검색기 (feature1)
            ├── order-processing.tsx # 발주서 정리 (feature2)
            ├── db-view.tsx          # DB 조회
            ├── db-update.tsx        # DB 업데이트
            ├── not-found.tsx
            └── admin/
                └── access-log.tsx   # 관리자 접근 로그
```

## 라우팅 (프론트엔드)

| 경로 | 컴포넌트 | 설명 |
|------|----------|------|
| `/` | Dashboard | 대시보드 |
| `/feature1` | PartsSearch | 부품 검색기 |
| `/feature2` | OrderProcessing | 발주서 정리 |
| `/db-view` | DbView | DB 조회 |
| `/db-update` | DbUpdate | DB 업데이트 |
| `/admin/access-log` | AccessLog | 관리자 전용 |
| `/login` | Login | 로그인 (공개) |

## 백엔드 API

| 엔드포인트 | 설명 |
|-----------|------|
| `POST /api/auth/login` | 로그인 |
| `POST /api/auth/logout` | 로그아웃 |
| `GET /api/auth/me` | 현재 사용자 |
| `POST /api/parts/search` | Nexar GraphQL 부품 검색 |
| `GET /api/purchase-history` | 발주 이력 조회 |
| `POST /api/purchase-history` | 발주 이력 저장 |
| `GET /api/admin/access-log` | 관리자 접근 로그 |

## 외부 서비스

- **Supabase** (`https://ifkhmtqxqlqhfbawpyoy.supabase.co`): `excel_mappings`, `master_data` 테이블
- **Nexar GraphQL API**: 부품 검색 (CLIENT_ID/SECRET 환경변수)
- **Replit PostgreSQL**: `purchase_history` 테이블 (DATABASE_URL)

## 인증

- 세션 기반 로그인 (`express-session`)
- 직원 목록 하드코딩 (`artifacts/api-server/src/config/employees.ts`)
- 역할: `admin` / 일반 직원
- 로그인 레이블: "아이디"

## 빌드 & 배포

- 빌드 스크립트: `scripts/build-deploy.sh`
- 프론트엔드 빌드 → `artifacts/web/dist/public/`
- API 서버가 빌드된 정적 파일 서빙
- `.replit` build command: `["bash", "scripts/build-deploy.sh"]`
- GitHub 원격: `https://${GITHUB_PERSONAL_TOKEN}@github.com/ferrariclec16/atozintranet.git`

## 주요 비즈니스 로직

### 부품 검색기 (parts-search.tsx)
- Excel 파일 업로드 (드래그앤드롭 또는 클릭)
- 파트넘버 파싱 규칙: `->` 뒤 부분 사용, `abc(def)` → 두 번 검색, `,` → 마지막 세그먼트
- 공급업체 화이트리스트 필터링
- Nexar API로 가격 조회 후 최저가 정렬

### 발주서 정리 (order-processing.tsx)
- 업체별 Excel 업로드 → 발주완결 항목 추출
- Supabase `excel_mappings`로 컬럼 매핑
- 발주 데이터 PostgreSQL 저장
- 마진 계산: `발주수량 × (발주단가 - 원가)`

### DB 조회 (db-view.tsx)
- 업체 선택 즉시 발주 이력 조회
- 합계 행 포함
- DB 형식 Excel 출력

### DB 업데이트 (db-update.tsx)
- `master_data` 테이블 업데이트
- 업체 선택 드롭다운 (기본값: "— 선택 —")
