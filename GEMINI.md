# 🥕 당무 지도 (Dangmoo Map) - 프로젝트 상세 기획서

## 1. 프로젝트 개요 (Project Overview)
**당무 지도**는 친구나 팀원들이 맛집 정보를 실시간으로 공유하고 공동으로 관리할 수 있는 **실시간 협업 웹 맵 서비스**입니다.

- **목적:** 소규모 그룹(10인 미만)의 모임 장소 선정 및 맛집 리스트 공유 최적화.
- **핵심 가치:** 실시간 동기화, 사용자 친화적인 검색 인터페이스, 다양한 필터링/정렬 옵션.

---

## 2. 기술 스택 (Technical Stack)

### Frontend
- **Framework & Libraries:** Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Maps API:** Naver Maps JS API V3 (Geocoder 서비스 포함).
- **Backend SDK:** Firebase Web SDK (v10.8.0 - Compat) - 실시간 DB 연동.

### Backend (Serverless)
- **Functions:** Firebase Cloud Functions v2 (Node.js 20 runtime).
- **Search API Proxy:** Naver Local Search API 연동 (CORS 우회 및 보안 강화).
- **Database:** Firebase Realtime Database (RTDB).

---

## 3. 기능 명세 (Feature Specifications)

### 3.1. 실시간 장소 공유 및 관리
- **실시간 동기화:** Firebase RTDB의 이벤트를 통해 장소 추가, 삭제, 좋아요 업데이트 시 모든 접속자에게 즉각 반영.
- **상태 관리:** 로컬 객체와 리얼타임 이벤트를 결합하여 최신 데이터 유지.

### 3.2. 스마트 검색 엔진
- **Naver Search 연동:** Cloud Functions을 통한 안전한 API 호출 및 결과 파싱.
- **Geocoding:** 주소 텍스트를 위/경도 좌표로 변환하여 지도 위 마커 생성.
- **검색 필터링:** 불필요한 HTML 태그 제거 및 데이터 정제 후 사용자에게 제공.

### 3.3. 사이드바 및 리스트 제어
- **페이지네이션:** 쾌적한 UX를 위해 사이드바 목록을 10개 단위로 페이징.
- **카테고리 필터링:** 등록된 장소들의 카테고리를 자동으로 추출하여 특정 카테고리만 모아볼 수 있는 기능.
- **스마트 정렬:** 
  - **최신순:** 가장 최근에 등록된 장소를 상단에 노출.
  - **좋아요순:** 다른 사용자들에게 인기가 많은 순서로 정렬.
  - **거리순:** 현재 지도 중심점(Viewport Center)에서 가까운 순서로 정렬 (Haversine 공식 적용).
- **범위 필터링 (Bounds Filter):** 현재 지도의 보이는 영역 안에 있는 장소만 리스트에 필터링하여 표시하는 기능.

### 3.4. 소셜 상호작용 (Social Features)
- **좋아요 기능:** 하트 버튼 클릭 시 사용자별 좋아요 상태 기록.
- **실시간 카운트:** 좋아요 수의 변화가 실시간으로 모든 사용자에게 시각화됨.

### 3.5. 딥 링크 및 앱 연동
- **App Handoff:** 모바일 브라우저에서 장소 링크 클릭 시, 설치된 네이버 지도 앱으로 자동 전환 및 해당 장소 검색 결과 제공.
- **상호명 검색 방식:** 정확도 향상을 위해 상호명을 기반으로 한 v5 검색 URL 사용.

### 3.6. 반응형 UI 디자인
- **PC 레이아웃:** 고정 사이드바와 넓은 지도 뷰.
- **모바일 레이아웃:** 
  - 햄버거 메뉴를 통한 접이식 사이드바.
  - 모바일 터치 최적화 버튼 및 헤더 디자인.
  - 지도 클릭 시 사이드바 자동 닫힘 기능.

---

## 4. 데이터 아키텍처 (Data Architecture)

### 4.1. 데이터베이스 스키마 (Firebase RTDB)
```json
{
  "shared_sessions": {
    "session_001": {
      "metadata": { "title": "모임 이름", "created_at": 123456789 },
      "places": {
        "PLACE_UNIQUE_ID": {
          "name": "식당 명칭",
          "address": "도로명/지번 주소",
          "category": "음식점 > 카페",
          "location": { "lat": 37.56, "lng": 126.97 },
          "naver_url": "https://map.naver.com/v5/search/...",
          "added_by": "User_456",
          "likes": {
            "User_ID": true
          }
        }
      }
    }
  }
}
```

---

## 5. 환경 설정 및 인증 (Credentials & Config)
- **Naver Client ID:** `3rh84i5w65` (Maps API용)
- **Firebase Project:** `dangmoo-map`
- **주요 설정 파일:** 
  - `js/firebase-config.js` (클라이언트 SDK 설정)
  - `functions/index.js` (서버사이드 API Key 관리)

---

## 6. 보안 및 최적화 전략 (Security & Optimization)

- **API 보안:** 네이버 API Client ID/Secret을 클라이언트 사이드에서 숨기고 Cloud Functions 내부에서 처리.
- **성능 최적화:** 
  - 지도 경계 변경 시 필터링 로직에 디바운스 적용.
  - 거리 계산 시 지도 중심점이 바뀔 때만 재정렬 수행.
- **접근성:** 시맨틱 마크업 사용 및 ARIA 레이블을 통한 접근성 고려.

---

## 6. 개발 로드맵 (Roadmap)

### Phase 1: MVP 완성 (완료)
- [x] 기본 지도 로드 및 마커 표시
- [x] 실시간 장소 추가/삭제 동기화
- [x] 네이버 검색 API 연동

### Phase 2: UX 고도화 (진행중)
- [x] 페이지네이션 및 필터링 시스템
- [x] 다중 정렬 (거리/좋아요/최신순)
- [x] 좋아요 기능 추가
- [x] 모바일 반응형 및 앱 링크 최적화

### Phase 3: 기능 확장 (예정)
- [ ] 개별 모임방(Session) 생성 및 관리 기능
- [ ] 장소별 그룹 채팅 또는 메모 기능
- [ ] 카테고리별 마커 커스텀 아이콘
- [ ] 중복 장소 추가 방지 및 추천 로직
