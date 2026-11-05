import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAMqL2sqFW1ox__a3MxUTw_2jNGFDz8p3w",
  authDomain: "carshop-iluminacion.firebaseapp.com",
  projectId: "carshop-iluminacion",
  storageBucket: "carshop-iluminacion.firebasestorage.app",
  messagingSenderId: "160589905564",
  appId: "1:160589905564:web:2c697bf00d096c5d357759",
  measurementId: "G-5X51NGNH0P"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);