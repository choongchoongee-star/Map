/**
 * Real-time Collaborative Restaurant Map
 */

// 1. State & Variables
let map;
let markers = {};
let infoWindows = {};
const USERNAME = 'User_' + Math.floor(Math.random() * 1000);
const SESSION_ID = 'session_001'; // Default session

// DOM Elements
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const placeList = document.getElementById('place-list');
const usernameDisplay = document.getElementById('username-display');
const resultsModal = document.getElementById('search-results-modal');
const resultsList = document.getElementById('search-results-list');
const closeModal = document.getElementById('close-modal');

// 2. Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initFirebaseListeners();
    usernameDisplay.textContent = `접속자: ${USERNAME}`;
    
    // UI Events
    searchBtn.addEventListener('click', handleSearch);
    closeModal.addEventListener('click', () => resultsModal.classList.add('hidden'));
});

// 3. Map Logic
function initMap() {
    const mapOptions = {
        center: new naver.maps.LatLng(37.5665, 126.9780), // 서울
        zoom: 13
    };
    map = new naver.maps.Map('map', mapOptions);
}

// 4. Firebase Logic (Real-time Sync)
function initFirebaseListeners() {
    if (typeof firebase === 'undefined') return;

    const db = firebase.database();
    const placesRef = db.ref(`shared_sessions/${SESSION_ID}/places`);

    // Listen for new places added by anyone
    placesRef.on('child_added', (snapshot) => {
        const placeId = snapshot.key;
        const placeData = snapshot.val();
        addPlaceToUI(placeId, placeData);
    });

    // Listen for deletions
    placesRef.on('child_removed', (snapshot) => {
        const placeId = snapshot.key;
        removePlaceFromUI(placeId);
    });
}

// 5. UI Updates
function addPlaceToUI(id, data) {
    // A. Add Marker
    const position = new naver.maps.LatLng(data.location.lat, data.location.lng);
    const marker = new naver.maps.Marker({
        position: position,
        map: map,
        animation: naver.maps.Animation.DROP,
        title: data.name
    });

    markers[id] = marker;

    // Info Window
    const infoWindow = new naver.maps.InfoWindow({
        content: `
            <div style="padding:10px; min-width:150px;">
                <h4 style="margin:0 0 5px 0">${data.name}</h4>
                <p style="font-size:12px; margin:0">${data.address}</p>
                <div style="margin-top:8px;">
                    <a href="${data.naver_url}" target="_blank" style="font-size:12px; color:#27ae60; text-decoration:none; font-weight:bold;">네이버 지도로 보기</a>
                </div>
            </div>
        `
    });
    infoWindows[id] = infoWindow;

    naver.maps.Event.addListener(marker, 'click', () => {
        if (infoWindow.getMap()) {
            infoWindow.close();
        } else {
            infoWindow.open(map, marker);
        }
    });

    // B. Add Sidebar Item
    const li = document.createElement('li');
    li.className = 'place-item';
    li.id = `sidebar-${id}`;
    li.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="flex:1;">
                <div class="category">${data.category}</div>
                <h4>${data.name}</h4>
                <p>${data.address}</p>
                <small>등록자: ${data.added_by}</small>
            </div>
            <button class="delete-btn" style="background:none; border:none; color:#e74c3c; cursor:pointer; font-size:18px; padding:5px;">×</button>
        </div>
    `;

    // 삭제 기능 추가
    li.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation(); // 부모 클릭 이벤트(지도 이동) 방지
        if(confirm(`'${data.name}'을(를) 삭제하시겠습니까?`)) {
            firebase.database().ref(`shared_sessions/${SESSION_ID}/places/${id}`).remove();
        }
    });

    li.addEventListener('click', () => {
        map.panTo(position);
        map.setZoom(16);
        infoWindow.open(map, marker);
    });

    placeList.appendChild(li);
}

function removePlaceFromUI(id) {
    if (markers[id]) {
        markers[id].setMap(null);
        delete markers[id];
    }
    if (infoWindows[id]) {
        delete infoWindows[id];
    }
    const sidebarItem = document.getElementById(`sidebar-${id}`);
    if (sidebarItem) sidebarItem.remove();
}

// 6. Search & Persistence Logic
async function handleSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    console.log(`서버를 통해 맛집 검색 중: ${query}`);
    
    // Firebase Cloud Function URL
    const functionUrl = `https://us-central1-dangmoo-map.cloudfunctions.net/naverSearch?query=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(functionUrl);

        if (!response.ok) {
            throw new Error('서버 검색 실패. (Blaze 플랜 전환 및 Functions 배포 확인 필요)');
        }

        const data = await response.json();
        const items = data.items;

        if (!items || items.length === 0) {
            return alert('검색 결과가 없습니다.');
        }

        const results = [];
        for (const item of items) {
            const cleanTitle = item.title.replace(/<[^>]*>?/gm, '');
            
            const geoResult = await new Promise((resolve) => {
                naver.maps.Service.geocode({ query: item.roadAddress || item.address }, (status, res) => {
                    if (status === naver.maps.Service.Status.OK && res.v2.addresses.length > 0) {
                        resolve(res.v2.addresses[0]);
                    } else {
                        resolve(null);
                    }
                });
            });

            if (geoResult) {
                results.push({
                    name: cleanTitle,
                    address: item.roadAddress || item.address,
                    category: item.category,
                    location: { lat: parseFloat(geoResult.y), lng: parseFloat(geoResult.x) },
                    naver_url: item.link || `https://map.naver.com/v5/search/${encodeURIComponent(cleanTitle)}`,
                    added_by: USERNAME
                });
            }
        }

        displaySearchResults(results);

    } catch (error) {
        console.error('검색 오류:', error);
        alert('검색 중 오류가 발생했습니다. Firebase Functions가 배포되었는지 확인하세요.');
    }
}

function displaySearchResults(results) {
    resultsList.innerHTML = '';
    results.forEach(res => {
        const li = document.createElement('li');
        li.className = 'search-result-item';
        li.innerHTML = `
            <strong>${res.name}</strong><br>
            <small>${res.address}</small>
        `;
        li.onclick = () => savePlaceToFirebase(res);
        resultsList.appendChild(li);
    });
    resultsModal.classList.remove('hidden');
}

function savePlaceToFirebase(placeData) {
    if (typeof firebase === 'undefined') {
        alert("Firebase 설정이 완료되지 않았습니다. js/firebase-config.js를 확인하세요.");
        return;
    }

    const db = firebase.database();
    const placesRef = db.ref(`shared_sessions/${SESSION_ID}/places`);
    
    placesRef.push(placeData)
        .then(() => {
            resultsModal.classList.add('hidden');
            searchInput.value = '';
        })
        .catch(err => console.error("Firebase 저장 오류:", err));
}
