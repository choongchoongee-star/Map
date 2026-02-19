# Real-time Collaborative Restaurant Map (FoodScout)

## Project Overview
A web-based interactive map allowing small groups (<10 people) to search, add, and synchronize "Restaurant Places" in real-time. Changes made by one user are immediately reflected on all connected clients without page refreshes.

## Tech Stack
- **Frontend:** HTML5, CSS3 (Vanilla), JavaScript (ES6)
- **Map Engine:** Naver Maps API JS V3
- **Backend/Database:** Firebase Realtime Database (RTDB)
- **SDKs:** Firebase Compat (v10.8.0)

## Core Features
- **Dynamic Map:** Responsive Naver Map instance centered on Seoul.
- **Real-time Sync:** `child_added` and `child_removed` listeners ensure state consistency across all users.
- **Shared Sidebar:** Persistent list of added restaurants with metadata (category, who added).
- **Focus Sync:** Clicking a sidebar item pans the map to the specific restaurant marker.
- **Deep Linking:** Markers include direct links to official Naver Map entries.

## Data Schema (Firebase RTDB)
```json
{
  "shared_sessions": {
    "session_001": {
      "metadata": {
        "title": "Weekend Foodies",
        "created_at": 1712345678
      },
      "places": {
        "auto_generated_id": {
          "name": "Jinmi Pyeongyang Naengmyeon",
          "address": "123, Hakdong-ro, Gangnam-gu, Seoul",
          "category": "Korean > Cold Noodles",
          "location": { "lat": 37.513, "lng": 127.034 },
          "naver_url": "https://pcmap.place.naver.com/restaurant/12345",
          "added_by": "User_Alpha"
        }
      }
    }
  }
}
```

## Credentials & Config
- **Naver Client ID:** `3rh84i5w65`
- **Firebase Project:** `dangmoo-map`
- **Configuration File:** `js/firebase-config.js`

## Current Implementation Status
- [x] Project scaffolding (HTML/CSS/JS)
- [x] Naver Maps initialization
- [x] Firebase RTDB integration
- [x] Real-time markers and sidebar synchronization
- [x] Mock search interface (Prototype)
- [ ] Production-ready Naver Local Search API (Requires backend proxy)
