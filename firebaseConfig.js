import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCZjaEIDt5r1qw8uAezdPn3L2hwB9o9L9A",
  authDomain: "sidurim-32a9b.firebaseapp.com",
  projectId: "sidurim-32a9b",
  storageBucket: "sidurim-32a9b.firebasestorage.app",
  messagingSenderId: "31285013229",
  appId: "1:31285013229:web:c80a384fedff2127d43ae4",
  measurementId: "G-R3PW32SCPL"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
