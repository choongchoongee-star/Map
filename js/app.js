/**
 * Real-time Collaborative Restaurant Map
 */

// 1. State & Variables
let map;
let markers = {};
let infoWindows = {};
let currentUser = null;
let currentSessionId = 'session_001'; // Default: Public session
const PUBLIC_SESSION_ID = 'session_001';

// Pagination & Filtering State
let allPlaces = []; 
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let filterVisibleOnly = false;
let sortOrder = 'date'; // Default: date, others: likes, distance
let currentCategory = 'all';

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
const sortSelect = document.getElementById('sort-select');
const categorySelect = document.getElementById('category-select');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

// 2. Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initAuthListener();
    
    // UI Events
    searchBtn.addEventListener('click', handleSearch);
    
    // Enter key for search
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });

    closeModal.addEventListener('click', () => resultsModal.classList.add('hidden'));

    // Auth Events
    loginBtn.addEventListener('click', handleNaverLogin);
    logoutBtn.addEventListener('click', () => firebase.auth().signOut());

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

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            sortOrder = e.target.value;
            currentPage = 1;
            updateSidebarDisplay();
        });
    }

    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            currentCategory = e.target.value;
            currentPage = 1;
            updateSidebarDisplay();
        });
    }

    // Update distances when map moves (if distance sort is active)
    naver.maps.Event.addListener(map, 'dragend', () => {
        if (sortOrder === 'distance') {
            updateSidebarDisplay();
        }
    });
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
function initAuthListener() {
    if (typeof firebase === 'undefined') return;

    firebase.auth().onAuthStateChanged((user) => {
        currentUser = user;
        if (user) {
            // Logged In: Switch to personal session
            currentSessionId = `private_${user.uid}`;
            usernameDisplay.textContent = user.displayName || '사용자';
            loginBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
        } else {
            // Logged Out: Switch back to public session
            currentSessionId = PUBLIC_SESSION_ID;
            usernameDisplay.textContent = '비로그인 사용자';
            loginBtn.classList.remove('hidden');
            logoutBtn.classList.add('hidden');
        }
        
        // Reset state and re-initialize listeners for the new session
        clearExistingMapData();
        initFirebaseListeners();
    });
}

function handleNaverLogin() {
    // Note: Naver login requires Firebase Console setup for 'OpenID Connect' or 'Generic OAuth'
    // This is a placeholder for the logic; users need to configure the provider first.
    alert("네이버 로그인은 Firebase Console에서 'Generic OAuth'를 설정해야 활성화됩니다. 현재는 개발 모드로 동작합니다.");
    
    // Temporary: Simulating login with an anonymous or custom user for testing phase
    firebase.auth().signInAnonymously()
        .catch(err => console.error("Login Error:", err));
}

function clearExistingMapData() {
    // Clear Markers
    Object.keys(markers).forEach(id => markers[id].setMap(null));
    markers = {};
    infoWindows = {};
    allPlaces = [];
    updateSidebarDisplay();
}

function initFirebaseListeners() {
    if (typeof firebase === 'undefined') return;

    const db = firebase.database();
    const path = currentSessionId === PUBLIC_SESSION_ID 
        ? `shared_sessions/${PUBLIC_SESSION_ID}/places`
        : `user_sessions/${currentSessionId}/places`;
        
    const placesRef = db.ref(path);

    // Remove old listeners to avoid duplicates when switching sessions
    placesRef.off();

    // Listen for new places added by anyone
    placesRef.on('child_added', (snapshot) => {
        const placeId = snapshot.key;
        const placeData = snapshot.val();
        
        // Add to local state
        allPlaces.push({ id: placeId, ...placeData });
        
        // Add marker immediately
        addMarker(placeId, placeData);
        
        // Refresh category options and update sidebar
        updateCategoryOptions();
        updateSidebarDisplay();
    });

    // Listen for changes (like updates)
    placesRef.on('child_changed', (snapshot) => {
        const placeId = snapshot.key;
        const placeData = snapshot.val();
        
        // Update local state
        const idx = allPlaces.findIndex(p => p.id === placeId);
        if (idx !== -1) {
            allPlaces[idx] = { id: placeId, ...placeData };
            updateCategoryOptions();
            updateSidebarDisplay();
        }
    });

    // Listen for deletions
    placesRef.on('child_removed', (snapshot) => {
        const placeId = snapshot.key;
        
        // Remove from local state
        allPlaces = allPlaces.filter(p => p.id !== placeId);
        
        // Remove marker
        removeMarkerFromUI(placeId);
        
        // Refresh category options and update sidebar
        updateCategoryOptions();
        updateSidebarDisplay();
    });
}

// 5. UI Updates (Marker)
function addMarker(id, data) {
    // Search by name only and use v5 URL for better App Handoff support
    const reliableNaverUrl = `https://map.naver.com/v5/search/${encodeURIComponent(data.name)}`;

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

function updateCategoryOptions() {
    if (!categorySelect) return;

    const categories = new Set();
    allPlaces.forEach(place => {
        if (place.category) {
            // Take the first part of the category (e.g., '카페' from '음식점 > 카페')
            const mainCat = place.category.split('>').pop().trim();
            categories.add(mainCat);
        }
    });

    // Save current selection
    const previousSelection = categorySelect.value;
    
    // Clear and add 'all'
    categorySelect.innerHTML = '<option value="all">모든 카테고리</option>';
    
    // Add sorted categories
    Array.from(categories).sort().forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        categorySelect.appendChild(option);
    });

    // Restore selection if it still exists
    if (Array.from(categories).includes(previousSelection)) {
        categorySelect.value = previousSelection;
    } else {
        currentCategory = 'all';
    }
}

// Sidebar Display Update (Filtering, Sorting & Pagination)
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

    // Filter by category
    if (currentCategory !== 'all') {
        filtered = filtered.filter(place => {
            const mainCat = place.category.split('>').pop().trim();
            return mainCat === currentCategory;
        });
    }

    // Sorting Logic
    if (sortOrder === 'likes') {
        filtered.sort((a, b) => {
            const aLikes = a.likes ? Object.keys(a.likes).length : 0;
            const bLikes = b.likes ? Object.keys(b.likes).length : 0;
            return bLikes - aLikes; // Descending
        });
    } else if (sortOrder === 'distance' && map) {
        const center = map.getCenter();
        filtered.sort((a, b) => {
            const distA = getDistance(center.lat(), center.lng(), a.location.lat, a.location.lng);
            const distB = getDistance(center.lat(), center.lng(), b.location.lat, b.location.lng);
            return distA - distB; // Ascending
        });
    } else if (sortOrder === 'date') {
        // Assume later ID or index means newer if no timestamp, 
        // but let's reverse the array for 'latest' behavior
        filtered.reverse();
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

// Distance calculation (Haversine formula)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function renderPlaceList(items) {
    placeList.innerHTML = '';
    
    if (items.length === 0) {
        placeList.innerHTML = '<li style="text-align:center; color:#999; padding:20px;">검색 결과가 없습니다.</li>';
        return;
    }

    items.forEach(place => {
        const reliableNaverUrl = `https://map.naver.com/v5/search/${encodeURIComponent(place.name)}`;
        const likes = place.likes || {};
        const likeCount = Object.keys(likes).length;
        const isLiked = !!likes[USERNAME];

        const li = document.createElement('li');
        li.className = 'place-item';
        li.id = `sidebar-${place.id}`;
        li.innerHTML = `
            <div class="place-content">
                <div class="place-info">
                    <div class="category">${place.category}</div>
                    <h4>${place.name}</h4>
                    <p>${place.address}</p>
                    <div class="place-actions">
                        <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="event.stopPropagation(); toggleLike('${place.id}')">
                            <span class="heart-icon">${isLiked ? '❤️' : '🤍'}</span>
                            <span class="like-count">${likeCount}</span>
                        </button>
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
    if (currentSessionId === PUBLIC_SESSION_ID) {
        alert("전체 공유 리스트의 장소는 삭제할 수 없습니다.");
        return;
    }
    
    if(confirm(`'${name}'을(를) 삭제하시겠습니까?`)) {
        const path = `user_sessions/${currentSessionId}/places/${id}`;
        firebase.database().ref(path).remove();
    }
};

window.toggleLike = (id) => {
    const place = allPlaces.find(p => p.id === id);
    if (!place) return;

    const likes = place.likes || {};
    const userId = currentUser ? currentUser.uid : 'anon_' + Math.random().toString(36).substr(2, 5);
    
    const path = currentSessionId === PUBLIC_SESSION_ID 
        ? `shared_sessions/${PUBLIC_SESSION_ID}/places/${id}/likes/${userId}`
        : `user_sessions/${currentSessionId}/places/${id}/likes/${userId}`;

    const ref = firebase.database().ref(path);

    if (likes[userId]) {
        ref.remove();
    } else {
        ref.set(true);
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
                const displayName = currentUser ? (currentUser.displayName || currentUser.email) : '익명';
                results.push({
                    name: cleanTitle,
                    address: searchAddress,
                    category: item.category,
                    location: { lat: parseFloat(geoResult.y), lng: parseFloat(geoResult.x) },
                    // Save as v5 search URL with name only for App Handoff support
                    naver_url: `https://map.naver.com/v5/search/${encodeURIComponent(cleanTitle)}`,
                    added_by: displayName
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

    // Duplicate Check: compare by name and address
    const isDuplicate = allPlaces.some(p => 
        p.name === placeData.name && p.address === placeData.address
    );

    if (isDuplicate) {
        alert(`'${placeData.name}'은(는) 이미 리스트에 추가된 장소입니다.`);
        return;
    }

    const db = firebase.database();
    const path = currentSessionId === PUBLIC_SESSION_ID 
        ? `shared_sessions/${PUBLIC_SESSION_ID}/places`
        : `user_sessions/${currentSessionId}/places`;
        
    const placesRef = db.ref(path);
    
    placesRef.push(placeData)
        .then(() => {
            resultsModal.classList.add('hidden');
            searchInput.value = '';
        })
        .catch(err => console.error("Firebase 저장 오류:", err));
}
