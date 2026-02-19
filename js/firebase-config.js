// Replace with your actual Firebase config from the console
const firebaseConfig = {
  apiKey: "AIzaSyCcCQk0YKkWxL7BZ3dEUxsQrVbriepON6w",
  authDomain: "dangmoo-map.firebaseapp.com",
  databaseURL: "https://dangmoo-map-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dangmoo-map",
  storageBucket: "dangmoo-map.firebasestorage.app",
  messagingSenderId: "715114138048",
  appId: "1:715114138048:web:a0f04f997aeb40a099e025",
  measurementId: "G-4N1105JSH7"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase Initialized");
} else {
    console.error("Firebase SDK not loaded");
}
