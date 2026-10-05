import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Verify logged-in state and user permissions
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Redirect unauthenticated users to login page
    window.location.replace('./index.html');
    return;
  }

  try {
    // Fetch user profile from Firestore using Authentication UID
    const userDoc = await getDoc(doc(db, "users", user.uid));

    if (userDoc.exists()) {
      showDashboard(user, userDoc.data());
    } else {
      console.warn("No Firestore profile found for user UID:", user.uid);
      showDashboard(user);
    }
  } catch (error) {
    console.error("Error fetching user profile:", error);
    showDashboard(user);
  }
});

function showDashboard(user, userData = {}) {
  const isCompanyAdmin =
    user.emailVerified &&
    user.email?.trim().toLowerCase().endsWith("@skintegritypartners.com");
  const rawRole = userData.membershipTier || userData.role || "free";
  const role = isCompanyAdmin ? "admin" : rawRole.toString().trim().toLowerCase();
  const nameElem = document.getElementById("user-display-name");
  const roleElem = document.getElementById("user-display-role");

  if (nameElem) nameElem.textContent = userData.fullName || userData.name || user.email || "Member";
  if (roleElem) roleElem.textContent = role.toUpperCase() + " ACCESS";

  gateDashboardContent(role);
}

// Helper function to toggle content visibility by role
function gateDashboardContent(role) {
  const freeSection = document.getElementById("free-content");
  const memberSection = document.getElementById("member-content");
  const colleagueSection = document.getElementById("colleague-content");
  const upgradeBanner = document.getElementById("upgrade-banner");

  // "premium", "member", or "colleague" grant elevated access
  if (role === "premium" || role === "member") {
    if (freeSection) freeSection.style.display = "none";
    if (memberSection) memberSection.style.display = "grid";
    if (colleagueSection) colleagueSection.style.display = "none";
    if (upgradeBanner) upgradeBanner.style.display = "none";
  } else if (role === "colleague" || role === "admin") {
    // Colleagues/Admins get access to all sections
    if (freeSection) freeSection.style.display = "block";
    if (memberSection) memberSection.style.display = "grid";
    if (colleagueSection) colleagueSection.style.display = "block";
    if (upgradeBanner) upgradeBanner.style.display = "none";
  } else {
    // Default Free Tier
    if (freeSection) freeSection.style.display = "block";
    if (memberSection) memberSection.style.display = "none";
    if (colleagueSection) colleagueSection.style.display = "none";
    if (upgradeBanner) upgradeBanner.style.display = "block";
  }
}

// 3. Setup Logout Handler
const logoutBtn = document.getElementById("logout-btn");
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.replace('./index.html');
    } catch (error) {
      console.error("Error logging out:", error);
    }
  });
}