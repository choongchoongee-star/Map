/**
 * Real-time Collaborative Restaurant Map
 */

// 1. State & Variables
let map;
let markers = {};
let infoWindows = {};
const USERNAME = 'User_' + Math.floor(Math.random() * 1000);
const SESSION_ID = 'session_001'; // Default session

// Pagination & Filtering State
let allPlaces = []; 
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let filterVisibleOnly = false;

// DOM Elements
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const placeList = document.getElementById('place-list');
const usernameDisplay = document.getElementById('username-display');
const resultsModal = document.getElementById('search-results-modal');
const resultsList = document.getElementById('search-results-list');
const closeModal = document.getElementById('close-modal');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
const filterVisibleCheckbox = document.getElementById('filter-visible');
const paginationContainer = document.getElementById('pagination');

// 2. Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initFirebaseListeners();
    usernameDisplay.textContent = `접속자: ${USERNAME}`;
    
    // UI Events
    searchBtn.addEventListener('click', handleSearch);
    
    // Enter key for search
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });

    closeModal.addEventListener('click', () => resultsModal.classList.add('hidden'));

    // Sidebar Toggle for Mobile
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });

    // Map filter toggle
    if (filterVisibleCheckbox) {
        filterVisibleCheckbox.addEventListener('change', (e) => {
            filterVisibleOnly = e.target.checked;
            currentPage = 1;
            updateSidebarDisplay();
        });
    }
});

// 3. Map Logic
function initMap() {
    const mapOptions = {
        center: new naver.maps.LatLng(37.5665, 126.9780), // 서울
        zoom: 13
    };
    map = new naver.maps.Map('map', mapOptions);

    // Close sidebar on mobile when map is clicked
    naver.maps.Event.addListener(map, 'click', () => {
        if (window.innerWidth <= 768 && sidebar.classList.contains('active')) {
            sidebar.classList.remove('active');
        }
    });

    // Re-render sidebar when map bounds change (if filter is active)
    naver.maps.Event.addListener(map, 'bounds_changed', () => {
        if (filterVisibleOnly) {
            currentPage = 1;
            updateSidebarDisplay();
        }
    });
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
        
        // Add to local state
        allPlaces.push({ id: placeId, ...placeData });
        
        // Add marker immediately
        addMarker(placeId, placeData);
        
        // Update sidebar
        updateSidebarDisplay();
    });

    // Listen for deletions
    placesRef.on('child_removed', (snapshot) => {
        const placeId = snapshot.key;
        
        // Remove from local state
        allPlaces = allPlaces.filter(p => p.id !== placeId);
        
        // Remove marker
        removeMarkerFromUI(placeId);
        
        // Update sidebar
        updateSidebarDisplay();
    });
}

// 5. UI Updates (Marker)
function addMarker(id, data) {
    // Use mobile-optimized URL which redirects correctly on both PC and Mobile
    const reliableNaverUrl = `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(data.name + ' ' + data.address)}`;

    const position = new naver.maps.LatLng(data.location.lat, data.location.lng);
    const marker = new naver.maps.Marker({
        position: position,
        map: map,
        animation: naver.maps.Animation.DROP,
        title: data.name
    });

    markers[id] = marker;

    const infoWindow = new naver.maps.InfoWindow({
        content: `
            <div style="padding:10px; min-width:150px;">
                <h4 style="margin:0 0 5px 0">${data.name}</h4>
                <p style="font-size:12px; margin:0">${data.address}</p>
                <div style="margin-top:8px;">
                    <a href="${reliableNaverUrl}" target="_blank" rel="noopener noreferrer" style="font-size:12px; color:#27ae60; text-decoration:none; font-weight:bold;">네이버 지도로 보기</a>
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
}

function removeMarkerFromUI(id) {
    if (markers[id]) {
        markers[id].setMap(null);
        delete markers[id];
    }
    if (infoWindows[id]) {
        delete infoWindows[id];
    }
}

// Sidebar Display Update (Filtering & Pagination)
function updateSidebarDisplay() {
    let filtered = [...allPlaces];
    
    // Filter by map bounds if toggle is active
    if (filterVisibleOnly && map) {
        const bounds = map.getBounds();
        filtered = filtered.filter(place => {
            const pos = new naver.maps.LatLng(place.location.lat, place.location.lng);
            return bounds.hasLatLng(pos);
        });
    }

    // Pagination logic
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
    
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageItems = filtered.slice(startIndex, endIndex);

    renderPlaceList(pageItems);
    renderPagination(totalPages);
}

function renderPlaceList(items) {
    placeList.innerHTML = '';
    
    if (items.length === 0) {
        placeList.innerHTML = '<li style="text-align:center; color:#999; padding:20px;">검색 결과가 없습니다.</li>';
        return;
    }

    items.forEach(place => {
        const reliableNaverUrl = `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(place.name + ' ' + place.address)}`;
        const li = document.createElement('li');
        li.className = 'place-item';
        li.id = `sidebar-${place.id}`;
        li.innerHTML = `
            <div class="place-content">
                <div class="place-info">
                    <div class="category">${place.category}</div>
                    <h4>${place.name}</h4>
                    <p>${place.address}</p>
                    <div style="margin-bottom: 5px;">
                        <a href="${reliableNaverUrl}" target="_blank" rel="noopener noreferrer" class="naver-link" style="font-size: 12px; color: #27ae60; text-decoration: none; font-weight: bold;">네이버 지도로 보기</a>
                    </div>
                </div>
                <button class="delete-btn" title="삭제" onclick="deletePlace('${place.id}', '${place.name}')">×</button>
            </div>
        `;

        li.querySelector('.naver-link').addEventListener('click', (e) => {
            e.stopPropagation();
        });

        li.addEventListener('click', () => {
            const position = new naver.maps.LatLng(place.location.lat, place.location.lng);
            map.panTo(position);
            map.setZoom(16);
            if (infoWindows[place.id]) infoWindows[place.id].open(map, markers[place.id]);
            
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
            }
        });

        placeList.appendChild(li);
    });
}

function renderPagination(totalPages) {
    paginationContainer.innerHTML = '';
    
    if (totalPages <= 1) return;

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
        btn.textContent = i;
        btn.onclick = () => {
            currentPage = i;
            updateSidebarDisplay();
            sidebar.scrollTop = 0; // Scroll back to top
        };
        paginationContainer.appendChild(btn);
    }
}

// Global deletion function (to handle onclick from dynamic HTML)
window.deletePlace = (id, name) => {
    if(confirm(`'${name}'을(를) 삭제하시겠습니까?`)) {
        firebase.database().ref(`shared_sessions/${SESSION_ID}/places/${id}`).remove();
    }
};

// 6. Search & Persistence Logic
async function handleSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    console.log(`당무 지도를 통해 맛집 검색 중: ${query}`);
    
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
                const searchAddress = item.roadAddress || item.address;
                results.push({
                    name: cleanTitle,
                    address: searchAddress,
                    category: item.category,
                    location: { lat: parseFloat(geoResult.y), lng: parseFloat(geoResult.x) },
                    // Save as mobile-optimized search URL
                    naver_url: `https://m.map.naver.com/search2/search.naver?query=${encodeURIComponent(cleanTitle + ' ' + searchAddress)}`,
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
