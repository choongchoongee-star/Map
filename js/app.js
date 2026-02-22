/**
 * Real-time Collaborative Restaurant Map
 */

// 1. State & Variables
let map;
let markers = {};
let infoWindows = {};
let currentUser = null;
let currentSessionId = 'session_001'; // Default: Public session
let currentSessionType = 'public'; // 'public', 'private', 'shared'
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
const sessionSelect = document.getElementById('session-select');
const manageSessionsBtn = document.getElementById('manage-sessions-btn');
const sessionModal = document.getElementById('session-modal');
const closeSessionModal = document.getElementById('close-session-modal');
const newSessionNameInput = document.getElementById('new-session-name');
const createSessionBtn = document.getElementById('create-session-btn');
const joinSessionCodeInput = document.getElementById('join-session-code');
const joinSessionBtn = document.getElementById('join-session-btn');
const userSessionsList = document.getElementById('user-sessions-list');

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
    loginBtn.addEventListener('click', handleGoogleLogin);
    logoutBtn.addEventListener('click', () => firebase.auth().signOut());

    // Session Switching
    sessionSelect.addEventListener('change', (e) => {
        handleSessionSwitch(e.target.value);
    });

    manageSessionsBtn.addEventListener('click', () => {
        if (!currentUser) return alert("세션 관리를 위해서는 로그인이 필요합니다.");
        sessionModal.classList.remove('hidden');
    });

    closeSessionModal.addEventListener('click', () => {
        sessionModal.classList.add('hidden');
    });

    createSessionBtn.addEventListener('click', createSharedSession);
    joinSessionBtn.addEventListener('click', joinSharedSession);

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
        updateSessionOptions(user);
        
        if (user) {
            // Logged In: Switch to personal session by default
            handleSessionSwitch(`private_${user.uid}`);
            usernameDisplay.textContent = user.displayName || '사용자';
            loginBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
        } else {
            // Logged Out: Switch back to public session
            handleSessionSwitch(PUBLIC_SESSION_ID);
            usernameDisplay.textContent = '비로그인 사용자';
            loginBtn.classList.remove('hidden');
            logoutBtn.classList.add('hidden');
        }
    });
}

function updateSessionOptions(user) {
    // Clear and add public session
    sessionSelect.innerHTML = `<option value="${PUBLIC_SESSION_ID}">전체 공유 리스트</option>`;
    
    if (user) {
        // Add private session
        const privateOpt = document.createElement('option');
        privateOpt.value = `private_${user.uid}`;
        privateOpt.textContent = "내 개인 리스트";
        sessionSelect.appendChild(privateOpt);

        // Fetch shared sessions from user profile
        const db = firebase.database();
        db.ref(`users/${user.uid}/sessions`).on('value', (snapshot) => {
            const sessions = snapshot.val() || {};
            // Refresh shared options (keep public/private)
            sessionSelect.innerHTML = `<option value="${PUBLIC_SESSION_ID}">전체 공유 리스트</option>`;
            sessionSelect.appendChild(privateOpt);
            
            Object.keys(sessions).forEach(sid => {
                const opt = document.createElement('option');
                opt.value = sid;
                opt.textContent = sessions[sid].name || "친구와 공유된 리스트";
                sessionSelect.appendChild(opt);
            });

            // Keep correct selection
            sessionSelect.value = currentSessionId;
            
            // Also update the management list in the modal
            renderSessionManagementList(sessions);
        });
    } else {
        renderSessionManagementList({}); // Clear if logged out
    }
}

function renderSessionManagementList(sessions) {
    if (!userSessionsList) return;
    userSessionsList.innerHTML = '';

    if (!currentUser) {
        userSessionsList.innerHTML = '<li>로그인이 필요합니다.</li>';
        return;
    }

    // 1. Add Private Session (The default one)
    const privateSessionId = `private_${currentUser.uid}`;
    addSessionRowToModal(privateSessionId, "내 개인 리스트 (기본)", true);

    // 2. Add Other Shared Sessions
    Object.keys(sessions).forEach(sid => {
        addSessionRowToModal(sid, sessions[sid].name, false);
    });
}

function addSessionRowToModal(sessionId, name, isDefaultPrivate) {
    const li = document.createElement('li');
    li.className = 'session-row';
    
    // We'll need to check if the user is the creator for the delete button
    // For now, let's show delete for any session they joined (Leave) 
    // and creator (Delete)
    
    li.innerHTML = `
        <div class="session-row-info">
            <span class="session-name">${name}</span>
            <span class="session-code-display">코드: ${sessionId}</span>
        </div>
        <div class="session-row-actions">
            <button class="action-btn-small copy-code-btn" onclick="copySessionCode('${sessionId}')">코드 복사</button>
            ${!isDefaultPrivate ? `<button class="action-btn-small delete-session-btn" onclick="deleteSession('${sessionId}', '${name}')">삭제</button>` : ''}
        </div>
    `;
    userSessionsList.appendChild(li);
}

window.copySessionCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
        alert("초대 코드가 클립보드에 복사되었습니다: " + code);
    }).catch(err => {
        console.error('클립보드 복사 실패:', err);
        // Fallback for some environments
        const textArea = document.createElement("textarea");
        textArea.value = code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert("초대 코드가 복사되었습니다: " + code);
    });
};

function deleteSession(sessionId, name) {
    if (!currentUser) return;
    if (!confirm(`'${name}' 목록을 삭제하시겠습니까? (더 이상 이 리스트를 볼 수 없게 됩니다)`)) return;

    const db = firebase.database();
    
    // 1. Remove from user's sessions list
    db.ref(`users/${currentUser.uid}/sessions/${sessionId}`).remove()
        .then(() => {
            // 2. If it's a shared session, we could check if user is creator to delete entirely
            // but for now, "delete" just means "remove from my view" unless we want full cleanup.
            // Let's also remove user from session members.
            if (sessionId.startsWith('shared_')) {
                return db.ref(`shared_sessions/${sessionId}/members/${currentUser.uid}`).remove();
            }
        })
        .then(() => {
            if (currentSessionId === sessionId) {
                handleSessionSwitch(PUBLIC_SESSION_ID);
            }
            alert(`'${name}' 목록이 삭제되었습니다.`);
        })
        .catch(err => console.error("세션 삭제 오류:", err));
}

function handleSessionSwitch(sessionId) {
    currentSessionId = sessionId;
    
    if (sessionId === PUBLIC_SESSION_ID) {
        currentSessionType = 'public';
    } else if (sessionId.startsWith('private_')) {
        currentSessionType = 'private';
    } else {
        currentSessionType = 'shared';
    }

    sessionSelect.value = sessionId;
    
    // Reset state and re-initialize listeners
    clearExistingMapData();
    initFirebaseListeners();
}

function createSharedSession() {
    if (!currentUser) return;
    const name = newSessionNameInput.value.trim();
    if (!name) return alert("세션 이름을 입력하세요.");

    const db = firebase.database();
    const sessionId = 'shared_' + Math.random().toString(36).substr(2, 9);
    
    const sessionData = {
        metadata: {
            name: name,
            creator: currentUser.uid,
            created_at: firebase.database.ServerValue.TIMESTAMP
        },
        members: {
            [currentUser.uid]: true
        }
    };

    // 1. Create the session
    db.ref(`shared_sessions/${sessionId}`).set(sessionData)
        .then(() => {
            // 2. Add to user's list
            return db.ref(`users/${currentUser.uid}/sessions/${sessionId}`).set({ name: name });
        })
        .then(() => {
            alert(`새 목록 '${name}'이(가) 생성되었습니다.`);
            newSessionNameInput.value = '';
            sessionModal.classList.add('hidden');
            handleSessionSwitch(sessionId);
        })
        .catch(err => console.error("세션 생성 오류:", err));
}

function joinSharedSession() {
    if (!currentUser) return;
    const code = joinSessionCodeInput.value.trim();
    if (!code) return alert("초대 코드를 입력하세요.");

    const db = firebase.database();
    
    // Logic to handle both shared_ and private_ sessions
    let sessionPath = '';
    if (code.startsWith('private_')) {
        // If it's a private session, it's stored in user_sessions
        // We'll treat its "places" as the shared data
        sessionPath = `user_sessions/${code}/places`;
        
        // Check if it exists by checking for places or just trying to join
        db.ref(`user_sessions/${code}`).once('value', (snapshot) => {
            if (!snapshot.exists()) return alert("유효하지 않은 초대 코드입니다.");
            
            // Add to user's profile
            db.ref(`users/${currentUser.uid}/sessions/${code}`).set({ name: "공유받은 개인 리스트" })
                .then(() => {
                    alert(`개인 리스트에 성공적으로 참여했습니다!`);
                    joinSessionCodeInput.value = '';
                    sessionModal.classList.add('hidden');
                    handleSessionSwitch(code);
                });
        });
        return;
    }

    // Standard shared session logic
    db.ref(`shared_sessions/${code}/metadata`).once('value', (snapshot) => {
        const metadata = snapshot.val();
        if (!metadata) return alert("유효하지 않은 초대 코드입니다.");

        // 2. Add user to session members
        db.ref(`shared_sessions/${code}/members/${currentUser.uid}`).set(true)
            .then(() => {
                // 3. Add session to user's profile
                return db.ref(`users/${currentUser.uid}/sessions/${code}`).set({ name: metadata.name });
            })
            .then(() => {
                alert(`'${metadata.name}' 세션에 성공적으로 참여했습니다!`);
                joinSessionCodeInput.value = '';
                sessionModal.classList.add('hidden');
                handleSessionSwitch(code);
            })
            .catch(err => console.error("세션 참여 오류:", err));
    });
}

function handleGoogleLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider)
        .then((result) => {
            console.log("Login Success:", result.user.displayName);
        })
        .catch(err => {
            console.error("Login Error:", err);
            alert("로그인 중 오류가 발생했습니다: " + err.message);
        });
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
    let path = '';
    
    if (currentSessionType === 'public') {
        path = `shared_sessions/${PUBLIC_SESSION_ID}/places`;
    } else if (currentSessionType === 'private') {
        path = `user_sessions/${currentSessionId}/places`;
    } else {
        path = `shared_sessions/${currentSessionId}/places`;
    }
        
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
        const userId = currentUser ? currentUser.uid : 'anon';
        const isLiked = !!likes[userId];
        const showSaveBtn = currentUser && currentSessionId === PUBLIC_SESSION_ID;

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
                        ${showSaveBtn ? `
                        <button class="save-to-my-btn" onclick="event.stopPropagation(); copyPlace('${place.id}')" title="내 리스트로 저장">
                            📥 저장
                        </button>
                        ` : ''}
                        <a href="${reliableNaverUrl}" target="_blank" rel="noopener noreferrer" class="naver-link" style="font-size: 12px; color: #27ae60; text-decoration: none; font-weight: bold;">네이버 지도로 보기</a>
                    </div>
                </div>
                ${currentSessionId !== PUBLIC_SESSION_ID ? `<button class="delete-btn" title="삭제" onclick="deletePlace('${place.id}', '${place.name}')">×</button>` : ''}
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
    if (currentSessionType === 'public') {
        alert("전체 공유 리스트의 장소는 삭제할 수 없습니다.");
        return;
    }
    
    if(confirm(`'${name}'을(를) 삭제하시겠습니까?`)) {
        const path = currentSessionType === 'private'
            ? `user_sessions/${currentSessionId}/places/${id}`
            : `shared_sessions/${currentSessionId}/places/${id}`;
        firebase.database().ref(path).remove();
    }
};

window.toggleLike = (id) => {
    const place = allPlaces.find(p => p.id === id);
    if (!place) return;

    const likes = place.likes || {};
    const userId = currentUser ? currentUser.uid : 'anon_' + Math.random().toString(36).substr(2, 5);
    
    let path = '';
    if (currentSessionType === 'public') {
        path = `shared_sessions/${PUBLIC_SESSION_ID}/places/${id}/likes/${userId}`;
    } else if (currentSessionType === 'private') {
        path = `user_sessions/${currentSessionId}/places/${id}/likes/${userId}`;
    } else {
        path = `shared_sessions/${currentSessionId}/places/${id}/likes/${userId}`;
    }

    const ref = firebase.database().ref(path);

    if (likes[userId]) {
        ref.remove();
    } else {
        ref.set(true);
    }
};

window.copyPlace = (id) => {
    if (!currentUser) {
        alert("내 리스트에 저장하려면 로그인이 필요합니다.");
        return;
    }

    const placeToCopy = allPlaces.find(p => p.id === id);
    if (!placeToCopy) return;

    // By default, copy to the user's private session.
    // In a more advanced version, we could show a modal to choose the target session.
    const targetSessionId = `private_${currentUser.uid}`;
    const targetPath = `user_sessions/${targetSessionId}/places`;
    const db = firebase.database();

    // Check for duplicates in the target private session
    db.ref(targetPath).once('value', (snapshot) => {
        const privatePlaces = snapshot.val() || {};
        const isAlreadyAdded = Object.values(privatePlaces).some(p => 
            p.name === placeToCopy.name && p.address === placeToCopy.address
        );

        if (isAlreadyAdded) {
            alert(`'${placeToCopy.name}'은(는) 이미 내 리스트에 있습니다.`);
            return;
        }

        // Copy the data (exclude the ID and old likes)
        const newPlaceData = {
            name: placeToCopy.name,
            address: placeToCopy.address,
            category: placeToCopy.category,
            location: placeToCopy.location,
            naver_url: placeToCopy.naver_url,
            added_by: currentUser.displayName || currentUser.email,
            copied_from: currentSessionId,
            created_at: firebase.database.ServerValue.TIMESTAMP
        };

        db.ref(targetPath).push(newPlaceData)
            .then(() => alert(`'${placeToCopy.name}'을(를) 내 리스트에 저장했습니다!`))
            .catch(err => console.error("복사 오류:", err));
    });
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
    let path = '';
    
    if (currentSessionType === 'public') {
        path = `shared_sessions/${PUBLIC_SESSION_ID}/places`;
    } else if (currentSessionType === 'private') {
        path = `user_sessions/${currentSessionId}/places`;
    } else {
        path = `shared_sessions/${currentSessionId}/places`;
    }
        
    const placesRef = db.ref(path);
    
    placesRef.push(placeData)
        .then(() => {
            resultsModal.classList.add('hidden');
            searchInput.value = '';
        })
        .catch(err => console.error("Firebase 저장 오류:", err));
}
