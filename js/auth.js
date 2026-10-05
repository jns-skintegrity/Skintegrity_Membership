import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const goToDashboard = () => {
  window.location.replace('./dashboard.html');
};

const loginForm = document.getElementById('auth-form') || document.getElementById('login-form');

const validMembershipTiers = new Set(['free', 'member', 'premium', 'colleague', 'admin']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getValidatedEmail = (value) => {
  const email = value.trim();
  if (!email || !emailPattern.test(email)) {
    throw new Error('Please enter a valid email address.');
  }
  return email.toLowerCase();
};

const getValidatedPassword = (value, label = 'Password') => {
  const password = String(value || '');
  if (!password || password.length < 6) {
    throw new Error(`${label} must be at least 6 characters long.`);
  }
  return password;
};

const getValidatedFullName = (value) => {
  const fullName = String(value || '').trim();
  if (!fullName || fullName.length < 2) {
    throw new Error('Please enter your full name.');
  }
  return fullName;
};

const getValidatedTier = (value) => {
  const membershipTier = String(value || 'free').trim().toLowerCase();
  if (!validMembershipTiers.has(membershipTier)) {
    throw new Error('Please select a valid membership tier.');
  }
  return membershipTier;
};

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const emailElem = document.getElementById('email') || document.getElementById('login-email');
    const passwordElem = document.getElementById('password') || document.getElementById('login-password');

    if (!emailElem || !passwordElem) {
      console.error('Login input elements not found in the DOM.');
      alert('Login form is missing required fields.');
      return;
    }

    try {
      const email = getValidatedEmail(emailElem.value);
      const password = getValidatedPassword(passwordElem.value, 'Password');

      await signInWithEmailAndPassword(auth, email, password);
      goToDashboard();
    } catch (error) {
      console.error('Login error:', error);
      alert(`Login failed: ${error.message}`);
    }
  });
}

const signupForm = document.getElementById('signup-form');

if (signupForm) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fullNameElem = document.getElementById('full-name') || document.getElementById('signup-name');
    const emailElem = document.getElementById('signup-email') || document.getElementById('email');
    const passwordElem = document.getElementById('signup-password') || document.getElementById('password');
    const tierElem = document.getElementById('user-tier') || document.getElementById('membership-tier');

    if (!fullNameElem || !emailElem || !passwordElem || !tierElem) {
      console.error('Signup input elements not found in the DOM.');
      alert('Signup form is missing required fields.');
      return;
    }

    try {
      const fullName = getValidatedFullName(fullNameElem.value);
      const email = getValidatedEmail(emailElem.value);
      const password = getValidatedPassword(passwordElem.value, 'Password');
      const membershipTier = getValidatedTier(tierElem.value);

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const userId = userCredential.user.uid;

      await setDoc(doc(db, 'users', userId), {
        fullName,
        email,
        membershipTier,
        role: membershipTier,
        createdAt: new Date().toISOString(),
      });

      goToDashboard();
    } catch (error) {
      console.error('Signup error:', error);
      alert(`Account creation failed: ${error.message}`);
    }
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    const path = window.location.pathname;
    const isLoginPage = path === '/' || path.endsWith('/index.html') || path.endsWith('/') || path.includes('index');

    if (isLoginPage) {
      console.log('Logged in user detected on login page. Redirecting to dashboard...');
      goToDashboard();
    }
  }
});