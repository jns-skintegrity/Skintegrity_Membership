import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Verify logged-in state and user permissions
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Redirect unauthenticated users to login page
    window.location.href = "/index.html";
    return;
  }

  try {
    // Fetch user profile from Firestore
    const userDoc = await getDoc(doc(db, "users", user.uid));
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const role = userData.role ? userData.role.toLowerCase() : 'free';

      // 1. Populate user info elements in the UI
      const nameElem = document.getElementById("user-display-name");
      const roleElem = document.getElementById("user-display-role");
      
      if (nameElem) nameElem.textContent = userData.name || user.email;
      if (roleElem) roleElem.textContent = role.toUpperCase();

      // 2. Gate UI sections based on user role
      gateDashboardContent(role);
    } else {
      console.warn("No Firestore profile found for user:", user.uid);
    }
  } catch (error) {
    console.error("Error fetching user profile:", error);
  }
});

// Helper function to toggle content visibility by role
function gateDashboardContent(role) {
  const freeSection = document.getElementById("free-content");
  const memberSection = document.getElementById("member-content");
  const colleagueSection = document.getElementById("colleague-content");
  const upgradeBanner = document.getElementById("upgrade-banner");

  if (role === "free") {
    if (freeSection) freeSection.style.display = "block";
    if (memberSection) memberSection.style.display = "none";
    if (colleagueSection) colleagueSection.style.display = "none";
    if (upgradeBanner) upgradeBanner.style.display = "block";
  } else if (role === "member") {
    if (freeSection) freeSection.style.display = "block";
    if (memberSection) memberSection.style.display = "block";
    if (colleagueSection) colleagueSection.style.display = "none";
    if (upgradeBanner) upgradeBanner.style.display = "none";
  } else if (role === "colleague") {
    // Colleagues get full access to all sections
    if (freeSection) freeSection.style.display = "block";
    if (memberSection) memberSection.style.display = "block";
    if (colleagueSection) colleagueSection.style.display = "block";
    if (upgradeBanner) upgradeBanner.style.display = "none";
  }
}

// 3. Setup Logout Handler
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "/index.html";
    } catch (error) {
      console.error("Error logging out:", error);
    }
  });
}

// Safely handle lowercase and uppercase tier names
const rawTier = userDoc.data().membershipTier || userDoc.data().tier || "";
const tier = rawTier.trim().toLowerCase();

if (tier === "premium" || tier === "admin") {
  // Show premium/admin features
} else {
  // Show free tier UI
}