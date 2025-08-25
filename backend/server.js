import express from "express";
import session from "express-session";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();

// Middleware
app.use(cors({
  origin: ["http://localhost:3000", "https://oauth-real-life-frontend.onrender.com"],
  credentials: true
}));

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET || "your-secret-key",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Helper function to get user profile from Google
async function getGoogleUserProfile(accessToken) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });
  
  if (!response.ok) {
    throw new Error("Failed to fetch user profile from Google");
  }
  
  return await response.json();
}

// Helper function to get user profile from GitHub
async function getGitHubUserProfile(accessToken) {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "OAuth-App"
    }
  });
  
  if (!response.ok) {
    throw new Error("Failed to fetch user profile from GitHub");
  }
  
  return await response.json();
}

// Google OAuth routes
app.get("/auth/google", (req, res) => {
  console.log("🔐 [GOOGLE] Starting Google OAuth login flow");
  
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", process.env.GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", "google");
  
  console.log("🚀 [GOOGLE] Redirecting to Google OAuth");
  res.redirect(url.toString());
});

app.get("/auth/google/callback", async (req, res) => {
  console.log("🔄 [GOOGLE] Callback received from Google");
  
  const { code, error } = req.query;
  
  if (error) {
    console.error("❌ [GOOGLE] Authorization error:", error);
    return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}?error=${error}`);
  }
  
  if (!code) {
    console.error("❌ [GOOGLE] No authorization code received");
    return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}?error=no_code`);
  }
  
  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code"
      }),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error("❌ [GOOGLE] Token exchange failed:", errorText);
      return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}?error=token_exchange_failed`);
    }

    const tokens = await tokenRes.json();
    
    // Get user profile
    const userProfile = await getGoogleUserProfile(tokens.access_token);
    
    // Store user in session
    req.session.user = {
      id: userProfile.id,
      name: userProfile.name,
      email: userProfile.email,
      avatar_url: userProfile.picture,
      provider: "google"
    };
    
    console.log("✅ [GOOGLE] User logged in:", userProfile.email);
    res.redirect(process.env.FRONTEND_URL || "http://localhost:3000");
    
  } catch (error) {
    console.error("💥 [GOOGLE] Error during authentication:", error);
    res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}?error=auth_failed`);
  }
});

// GitHub OAuth routes
app.get("/auth/github", (req, res) => {
  console.log("🔐 [GITHUB] Starting GitHub OAuth login flow");
  
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", process.env.GITHUB_REDIRECT_URI);
  url.searchParams.set("scope", "user:email");
  url.searchParams.set("state", "github");
  
  console.log("🚀 [GITHUB] Redirecting to GitHub OAuth");
  res.redirect(url.toString());
});

app.get("/auth/github/callback", async (req, res) => {
  console.log("🔄 [GITHUB] Callback received from GitHub");
  
  const { code, error } = req.query;
  
  if (error) {
    console.error("❌ [GITHUB] Authorization error:", error);
    return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}?error=${error}`);
  }
  
  if (!code) {
    console.error("❌ [GITHUB] No authorization code received");
    return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}?error=no_code`);
  }
  
  try {
    // Exchange code for access token with timeout and retry
    console.log("🔄 [GITHUB] Attempting token exchange...");
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "OAuth-App"
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error("❌ [GITHUB] Token exchange failed:", tokenRes.status, errorText);
      return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}?error=token_exchange_failed`);
    }

    const tokens = await tokenRes.json();
    console.log("✅ [GITHUB] Token exchange successful");
    
    if (tokens.error) {
      console.error("❌ [GITHUB] Token error:", tokens.error);
      return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}?error=${tokens.error}`);
    }
    
    // Get user profile
    const userProfile = await getGitHubUserProfile(tokens.access_token);
    
    // Store user in session
    req.session.user = {
      id: userProfile.id.toString(),
      name: userProfile.name || userProfile.login,
      email: userProfile.email,
      avatar_url: userProfile.avatar_url,
      provider: "github"
    };
    
    console.log("✅ [GITHUB] User logged in:", userProfile.login);
    res.redirect(process.env.FRONTEND_URL || "http://localhost:3000");
    
  } catch (error) {
    console.error("💥 [GITHUB] Error during authentication:", error);
    res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}?error=auth_failed`);
  }
});

// Logout route
app.post("/auth/logout", (req, res) => {
  console.log("🚪 [AUTH] User logging out");
  
  req.session.destroy((err) => {
    if (err) {
      console.error("❌ [AUTH] Error destroying session:", err);
      return res.status(500).json({ error: "Failed to logout" });
    }
    
    res.clearCookie("connect.sid");
    console.log("✅ [AUTH] User logged out successfully");
    res.status(204).send();
  });
});

// Get current user profile
app.get("/api/user", (req, res) => {
  console.log("👤 [API] User profile requested");
  
  if (!req.session.user) {
    console.log("❌ [API] No user in session");
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  console.log("✅ [API] Returning user profile for:", req.session.user.email);
  res.json(req.session.user);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log("📋 Environment variables check:");
  console.log("  - GOOGLE_CLIENT_ID:", process.env.GOOGLE_CLIENT_ID ? "✅" : "❌");
  console.log("  - GOOGLE_CLIENT_SECRET:", process.env.GOOGLE_CLIENT_SECRET ? "✅" : "❌");
  console.log("  - GOOGLE_REDIRECT_URI:", process.env.GOOGLE_REDIRECT_URI || "❌");
  console.log("  - GITHUB_CLIENT_ID:", process.env.GITHUB_CLIENT_ID ? "✅" : "❌");
  console.log("  - GITHUB_CLIENT_SECRET:", process.env.GITHUB_CLIENT_SECRET ? "✅" : "❌");
  console.log("  - GITHUB_REDIRECT_URI:", process.env.GITHUB_REDIRECT_URI || "❌");
  console.log("  - SESSION_SECRET:", process.env.SESSION_SECRET ? "✅" : "❌ (using default)");
  console.log("  - FRONTEND_URL:", process.env.FRONTEND_URL || "❌ (using default)");
});
