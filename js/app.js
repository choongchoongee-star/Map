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
                <a href="${data.naver_url}" target="_blank" style="font-size:12px; color:#27ae60">네이버 지도로 보기</a>
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
        <div class="category">${data.category}</div>
        <h4>${data.name}</h4>
        <p>${data.address}</p>
        <small>등록자: ${data.added_by}</small>
    `;

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
    const sidebarItem = document.getElementById(`sidebar-${id}`);
    if (sidebarItem) sidebarItem.remove();
}

// 6. Search & Persistence Logic
async function handleSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    console.log(`검색어: ${query}`);
    
    // 네이버 지도 객체가 정상 로드되었는지 확인
    if (typeof naver === 'undefined' || !naver.maps || !naver.maps.Service) {
        alert('네이버 지도 서비스가 아직 준비되지 않았습니다. 잠시 후 다시 시도하거나 페이지를 새로고침해 주세요.');
        return;
    }

    // 네이버 지도 Geocoder 서비스를 사용하여 장소 검색
    naver.maps.Service.geocode({
        query: query
    }, function(status, response) {
        if (status !== naver.maps.Service.Status.OK) {
            console.error('검색 서비스 오류:', status);
            return alert('검색 중 오류가 발생했습니다.');
        }

        const items = response.v2.addresses;
        if (!items || items.length === 0) {
            return alert('검색 결과가 없습니다. (주소나 큰 장소 위주로 검색해 보세요)');
        }

        const results = items.map(item => ({
            name: query, 
            address: item.roadAddress || item.jibunAddress,
            category: "맛집",
            location: { 
                lat: parseFloat(item.y), 
                lng: parseFloat(item.x) 
            },
            naver_url: `https://map.naver.com/v5/search/${encodeURIComponent(query)}`,
            added_by: USERNAME
        }));

        displaySearchResults(results);
    });
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
