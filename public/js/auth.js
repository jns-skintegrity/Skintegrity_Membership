import { auth, db } from './firebase-config.js';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Handle Login Form (matches both 'auth-form' and 'login-form')
const loginForm = document.getElementById('auth-form') || document.getElementById('login-form');

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Support both ID naming conventions
    const emailElem = document.getElementById('email') || document.getElementById('login-email');
    const passwordElem = document.getElementById('password') || document.getElementById('login-password');

    if (!emailElem || !passwordElem) {
      console.error("Login input elements not found in the DOM.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, emailElem.value, passwordElem.value);
      window.location.href = "/dashboard.html";
    } catch (error) {
      console.error("Login error:", error);
      alert("Login failed: " + error.message);
    }
  });
}

// Auto-redirect if already logged in on login page or root URL
// Auto-redirect logged-in users away from the login page
onAuthStateChanged(auth, (user) => {
  if (user) {
    const path = window.location.pathname;
    
    // Check if user is on the homepage/login page or signup page
    const isLoginPage = path === "/" || path.endsWith("/index.html") || path.endsWith("/") || path.includes("index");
    
    if (isLoginPage) {
      console.log("Logged in user detected on login page. Redirecting to dashboard...");
      window.location.replace("/dashboard.html");
    }
  }
});