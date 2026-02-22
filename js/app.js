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
const createSessionGroup = document.getElementById('create-session-group');
const saveTargetModal = document.getElementById('save-target-modal');
const targetSessionsList = document.getElementById('target-sessions-list');
const confirmSaveBtn = document.getElementById('confirm-save-btn');
const closeSaveModal = document.getElementById('close-save-modal');
const mobileListFab = document.getElementById('mobile-list-fab');

// Global state for copying
let lastTargetSessionId = localStorage.getItem('lastTargetSessionId') || null;
let sessionToCopyId = null;
let placeToCopyData = null;
let userSessionsCache = {}; // Cache of user's session names
let savedPlacesMap = {}; // Map of name+address to boolean
let guestSessions = JSON.parse(localStorage.getItem('guestSessions')) || {}; // { id: name }

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
        sessionModal.classList.remove('hidden');
    });

    closeSessionModal.addEventListener('click', () => {
        sessionModal.classList.add('hidden');
    });

    createSessionBtn.addEventListener('click', createSharedSession);
    joinSessionBtn.addEventListener('click', joinSharedSession);

    // Save Modal Events
    closeSaveModal.addEventListener('click', () => {
        saveTargetModal.classList.add('hidden');
    });

    confirmSaveBtn.addEventListener('click', () => {
        if (sessionToCopyId && placeToCopyData) {
            executeCopyPlace(sessionToCopyId, placeToCopyData);
        }
    });

    // Mobile UI Events
    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            toggleSidebar();
        });
    }

    if (mobileListFab) {
        mobileListFab.addEventListener('click', () => {
            toggleSidebar(true);
        });
    }

    // Sidebar Toggle for Mobile
    function toggleSidebar(forceOpen = null) {
        const isActive = forceOpen !== null ? forceOpen : !sidebar.classList.contains('active');
        
        if (isActive) {
            sidebar.classList.add('active');
            if (mobileListFab) mobileListFab.classList.add('hidden');
        } else {
            sidebar.classList.remove('active');
            if (mobileListFab) mobileListFab.classList.remove('hidden');
        }
    }

    // Export toggleSidebar for other functions
    window.appToggleSidebar = toggleSidebar;

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
            if (window.appToggleSidebar) window.appToggleSidebar(false);
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
            // Logged In
            handleSessionSwitch(`private_${user.uid}`);
            usernameDisplay.textContent = user.displayName || '사용자';
            loginBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
            if (createSessionGroup) createSessionGroup.classList.remove('hidden');
        } else {
            // Logged Out
            handleSessionSwitch(PUBLIC_SESSION_ID);
            usernameDisplay.textContent = '비로그인 사용자';
            loginBtn.classList.remove('hidden');
            logoutBtn.classList.add('hidden');
            if (createSessionGroup) createSessionGroup.classList.add('hidden');
        }
    });
}

function updateSessionOptions(user) {
    // Clear and add public session
    sessionSelect.innerHTML = `<option value="${PUBLIC_SESSION_ID}">전체 공유 리스트</option>`;
    
    if (user) {
        // Add private session
        const privateId = `private_${user.uid}`;
        const privateOpt = document.createElement('option');
        privateOpt.value = privateId;
        privateOpt.textContent = "내 개인 리스트";
        sessionSelect.appendChild(privateOpt);

        // Pre-fill cache
        userSessionsCache = { [privateId]: "내 개인 리스트" };
        if (!lastTargetSessionId) lastTargetSessionId = privateId;

        // Fetch shared sessions from user profile
        const db = firebase.database();
        db.ref(`users/${user.uid}/sessions`).on('value', (snapshot) => {
            const dbSessions = snapshot.val() || {};
            // Refresh shared options (keep public/private)
            sessionSelect.innerHTML = `<option value="${PUBLIC_SESSION_ID}">전체 공유 리스트</option>`;
            sessionSelect.appendChild(privateOpt);
            
            userSessionsCache = { [privateId]: "내 개인 리스트" };
            Object.keys(dbSessions).forEach(sid => {
                const opt = document.createElement('option');
                opt.value = sid;
                const name = dbSessions[sid].name || "친구와 공유된 리스트";
                opt.textContent = name;
                sessionSelect.appendChild(opt);
                userSessionsCache[sid] = name;
            });

            // Add Guest Sessions (from LocalStorage)
            Object.keys(guestSessions).forEach(sid => {
                if (!userSessionsCache[sid]) {
                    const opt = document.createElement('option');
                    opt.value = sid;
                    opt.textContent = guestSessions[sid] + " (참여중)";
                    sessionSelect.appendChild(opt);
                    userSessionsCache[sid] = guestSessions[sid];
                }
            });

            // Keep correct selection
            sessionSelect.value = currentSessionId;
            
            // Also update the management list in the modal
            renderSessionManagementList(dbSessions);
            
            // Start listening to all these sessions for "Saved" markers
            listenToAllUserSessions(user.uid, dbSessions);
        });
    } else {
        // Not Logged In: Only Public + Guest (Local)
        userSessionsCache = {};
        Object.keys(guestSessions).forEach(sid => {
            const opt = document.createElement('option');
            opt.value = sid;
            opt.textContent = guestSessions[sid] + " (참여중)";
            sessionSelect.appendChild(opt);
            userSessionsCache[sid] = guestSessions[sid];
        });
        
        renderSessionManagementList({}); 
        savedPlacesMap = {};
    }
}

function listenToAllUserSessions(uid, sessions) {
    const db = firebase.database();
    savedPlacesMap = {};
    
    // For non-logged in users, we only track guestSessions
    const allSessionIds = uid 
        ? [`private_${uid}`, ...Object.keys(sessions), ...Object.keys(guestSessions)]
        : [...Object.keys(guestSessions)];
    
    allSessionIds.forEach(sid => {
        const path = sid.startsWith('private_') ? `user_sessions/${sid}/places` : `shared_sessions/${sid}/places`;
        db.ref(path).on('value', (snapshot) => {
            const places = snapshot.val() || {};
            Object.values(places).forEach(p => {
                savedPlacesMap[`${p.name}|${p.address}`] = true;
            });
            // Update UI to reflect changes
            updateSidebarDisplay();
        });
    });
}

function renderSessionManagementList(sessions) {
    if (!userSessionsList) return;
    userSessionsList.innerHTML = '';

    // 1. Add Private Session (If Logged In)
    if (currentUser) {
        const privateSessionId = `private_${currentUser.uid}`;
        addSessionRowToModal(privateSessionId, "내 개인 리스트 (기본)", true);
    }

    // 2. Add DB Shared Sessions
    Object.keys(sessions).forEach(sid => {
        addSessionRowToModal(sid, sessions[sid].name, false);
    });

    // 3. Add Guest Sessions
    Object.keys(guestSessions).forEach(sid => {
        if (!sessions[sid] && (!currentUser || sid !== `private_${currentUser.uid}`)) {
            addSessionRowToModal(sid, guestSessions[sid], false, true);
        }
    });
}

function addSessionRowToModal(sessionId, name, isDefaultPrivate, isGuest = false) {
    const li = document.createElement('li');
    li.className = 'session-row';
    
    li.innerHTML = `
        <div class="session-row-info">
            <span class="session-name">${name}</span>
            <span class="session-code-display">코드: ${sessionId}</span>
        </div>
        <div class="session-row-actions">
            <button class="action-btn-small copy-code-btn" onclick="copySessionCode('${sessionId}')">코드 복사</button>
            ${!isDefaultPrivate ? `<button class="action-btn-small delete-session-btn" onclick="deleteSession('${sessionId}', '${name}', ${isGuest})">삭제</button>` : ''}
        </div>
    `;
    userSessionsList.appendChild(li);
}

window.copySessionCode = (code) => {
    navigator.clipboard.writeText(code).then(() => {
        alert("초대 코드가 클립보드에 복사되었습니다: " + code);
    }).catch(err => {
        console.error('클립보드 복사 실패:', err);
        const textArea = document.createElement("textarea");
        textArea.value = code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        alert("초대 코드가 복사되었습니다: " + code);
    });
};

function deleteSession(sessionId, name, isGuest = false) {
    if (!confirm(`'${name}' 목록을 삭제하시겠습니까?`)) return;

    if (isGuest) {
        delete guestSessions[sessionId];
        localStorage.setItem('guestSessions', JSON.stringify(guestSessions));
        if (currentSessionId === sessionId) handleSessionSwitch(PUBLIC_SESSION_ID);
        updateSessionOptions(currentUser);
        return;
    }

    if (!currentUser) return;
    const db = firebase.database();
    
    // 1. Check if user is the creator (for shared sessions)
    if (sessionId.startsWith('shared_')) {
        db.ref(`shared_sessions/${sessionId}/metadata/creator`).once('value', (snapshot) => {
            const creatorUid = snapshot.val();
            if (creatorUid === currentUser.uid) {
                // User IS creator: Fully delete shared session
                if (confirm("귀하는 이 목록의 생성자입니다. 목록을 완전히 삭제하시겠습니까? (모든 참여자의 화면에서 사라집니다)")) {
                    db.ref(`shared_sessions/${sessionId}`).remove();
                    // Cleanup user's reference too
                    db.ref(`users/${currentUser.uid}/sessions/${sessionId}`).remove();
                    finalizeDelete(sessionId, name);
                }
            } else {
                // User IS NOT creator: Just leave/remove from own profile
                db.ref(`users/${currentUser.uid}/sessions/${sessionId}`).remove();
                db.ref(`shared_sessions/${sessionId}/members/${currentUser.uid}`).remove();
                finalizeDelete(sessionId, name);
            }
        });
    } else {
        // Private sessions: Just remove from profile (owner is implied)
        db.ref(`users/${currentUser.uid}/sessions/${sessionId}`).remove();
        finalizeDelete(sessionId, name);
    }
}

function finalizeDelete(sessionId, name) {
    if (currentSessionId === sessionId) {
        handleSessionSwitch(PUBLIC_SESSION_ID);
    }
    alert(`'${name}' 목록이 처리되었습니다.`);
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
    const code = joinSessionCodeInput.value.trim();
    if (!code) return alert("초대 코드를 입력하세요.");

    console.log("Attempting to join session:", code);
    const db = firebase.database();
    
    // Success handler
    const finalizeJoin = (sid, name) => {
        console.log("Successfully joined:", sid, name);
        guestSessions[sid] = name;
        localStorage.setItem('guestSessions', JSON.stringify(guestSessions));
        
        if (currentUser) {
            db.ref(`users/${currentUser.uid}/sessions/${sid}`).set({ name: name });
        }
        
        alert(`'${name}' 목록에 성공적으로 참여했습니다!`);
        joinSessionCodeInput.value = '';
        sessionModal.classList.add('hidden');
        
        // Switch to the new session
        handleSessionSwitch(sid);
        // Refresh the switcher options
        updateSessionOptions(currentUser);
    };

    // 1. Private session check
    if (code.startsWith('private_')) {
        db.ref(`user_sessions/${code}`).once('value', (snapshot) => {
            if (snapshot.exists()) {
                finalizeJoin(code, "공유받은 개인 리스트");
            } else {
                alert("유효하지 않은 초대 코드입니다. (해당 개인 리스트를 찾을 수 없음)");
            }
        }).catch(err => {
            console.error("Join error (private):", err);
            alert("참여 중 오류가 발생했습니다. (권한 문제일 수 있습니다)");
        });
        return;
    }

    // 2. Shared session check
    db.ref(`shared_sessions/${code}/metadata`).once('value', (snapshot) => {
        const metadata = snapshot.val();
        if (metadata) {
            if (currentUser) {
                db.ref(`shared_sessions/${code}/members/${currentUser.uid}`).set(true);
            }
            finalizeJoin(code, metadata.name);
        } else {
            alert("유효하지 않은 초대 코드입니다. (세션이 존재하지 않음)");
        }
    }).catch(err => {
        console.error("Join error (shared):", err);
        alert("참여 중 오류가 발생했습니다. (권한 문제일 수 있습니다)");
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
        const isSaved = savedPlacesMap[`${place.name}|${place.address}`];
        const showSaveBtn = currentUser && currentSessionId === PUBLIC_SESSION_ID;

        const bookmarkIcon = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"></path>
            </svg>
        `;

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
                        <button class="save-to-my-btn ${isSaved ? 'is-saved' : ''}" onclick="event.stopPropagation(); copyPlace('${place.id}')" title="내 리스트에 저장">
                            ${bookmarkIcon}
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
                if (window.appToggleSidebar) window.appToggleSidebar(false);
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
    if (!currentUser && currentSessionType !== 'public') {
        alert("공유 리스트에서 좋아요를 누르려면 로그인이 필요합니다. (전체 공유 리스트는 비로그인도 가능)");
        return;
    }

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

    placeToCopyData = placeToCopy;
    openSaveTargetModal();
};

function openSaveTargetModal() {
    targetSessionsList.innerHTML = '';
    
    // Default selection: lastTargetSessionId or the private one
    if (!lastTargetSessionId && currentUser) {
        lastTargetSessionId = `private_${currentUser.uid}`;
    }
    
    sessionToCopyId = lastTargetSessionId;

    Object.keys(userSessionsCache).forEach(sid => {
        const li = document.createElement('li');
        li.className = 'session-row';
        li.style.cursor = 'pointer';
        li.style.padding = '12px';
        li.style.border = sid === sessionToCopyId ? '2px solid #4285F4' : '1px solid #eee';

        li.innerHTML = `
            <div class="session-row-info">
                <span class="session-name">${userSessionsCache[sid]}</span>
                <span class="session-code-display">${sid.startsWith('private_') ? '개인 보관함' : '공유 세션'}</span>
            </div>
            ${sid === sessionToCopyId ? '<span style="color:#4285F4; font-weight:bold;">✔ 선택됨</span>' : ''}
        `;
        
        li.onclick = () => {
            sessionToCopyId = sid;
            openSaveTargetModal(); // Refresh to show selection
        };
        targetSessionsList.appendChild(li);
    });

    saveTargetModal.classList.remove('hidden');
}

function executeCopyPlace(targetSessionId, placeData) {
    const targetPath = targetSessionId.startsWith('private_') 
        ? `user_sessions/${targetSessionId}/places`
        : `shared_sessions/${targetSessionId}/places`;
    const db = firebase.database();

    // Check for duplicates in the target session
    db.ref(targetPath).once('value', (snapshot) => {
        const places = snapshot.val() || {};
        const isAlreadyAdded = Object.values(places).some(p => 
            p.name === placeData.name && p.address === placeData.address
        );

        if (isAlreadyAdded) {
            alert(`'${placeData.name}'은(는) 이미 선택한 목록에 있습니다.`);
            return;
        }

        // Copy the data (exclude the ID and old likes)
        const newPlaceData = {
            name: placeData.name,
            address: placeData.address,
            category: placeData.category,
            location: placeData.location,
            naver_url: placeData.naver_url,
            added_by: currentUser.displayName || currentUser.email,
            copied_from: currentSessionId,
            created_at: firebase.database.ServerValue.TIMESTAMP
        };

        db.ref(targetPath).push(newPlaceData)
            .then(() => {
                lastTargetSessionId = targetSessionId;
                localStorage.setItem('lastTargetSessionId', targetSessionId);
                alert(`'${placeData.name}'을(를) '${userSessionsCache[targetSessionId]}' 목록에 저장했습니다!`);
                saveTargetModal.classList.add('hidden');
            })
            .catch(err => console.error("복사 오류:", err));
    });
}

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

    if (!currentUser && currentSessionType !== 'public') {
        alert("공유 리스트에 장소를 추가하려면 로그인이 필요합니다. (전체 공유 리스트는 비로그인도 가능)");
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
