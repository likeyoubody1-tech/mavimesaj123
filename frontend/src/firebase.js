import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getAnalytics, isSupported } from "firebase/analytics";
const firebaseConfig = {
    apiKey: "AIzaSyDBsWjNIFFdg8hERTBz3NqqL4i54wfdu_0",
    authDomain: "mavimesaj.firebaseapp.com",
    databaseURL: "https://mavimesaj-default-rtdb.firebaseio.com",
    projectId: "mavimesaj",
    storageBucket: "mavimesaj.firebasestorage.app",
    messagingSenderId: "606818406046",
    appId: "1:606818406046:web:a2b9f9d7716a38c43bf58f",
    measurementId: "G-X7GQH5JXYR"
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
isSupported().then(ok => { if (ok)
    getAnalytics(app); }).catch(() => { });
