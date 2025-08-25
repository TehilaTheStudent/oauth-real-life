import express from "express";
import session from "express-session";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";

dotenv.config();
const app = express();

// Middleware
app.use(cors({
  origin: ["http://localhost:3000", "https://oauth-real-life-frontend.onrender.com"],
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use(session({
  secret: process.env.SESSION_SECRET || "your-secret-key",
  resave: false,
  saveUninitialized: false,
  name: 'sessionId', // Custom session cookie name
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: process.env.NODE_ENV === "production" ? 'none' : 'lax', // Allow cross-site cookies in production
    domain: process.env.NODE_ENV === "production" ? '.onrender.com' : undefined // Share cookies across subdomains
  }
}));

// INSECURE LOGGING MIDDLEWARE - FOR TESTING ONLY!
app.use((req, res, next) => {
  console.log("\n🔍 [DEBUG] ==================== REQUEST DEBUG ====================");
  console.log("📍 [DEBUG] Method:", req.method);
  console.log("📍 [DEBUG] URL:", req.url);
  console.log("📍 [DEBUG] Headers:", JSON.stringify(req.headers, null, 2));
  console.log("📍 [DEBUG] Query params:", JSON.stringify(req.query, null, 2));
  console.log("📍 [DEBUG] Body:", JSON.stringify(req.body, null, 2));
  console.log("📍 [DEBUG] Cookies:", JSON.stringify(req.cookies, null, 2));
  console.log("🔐 [DEBUG] Session ID:", req.sessionID);
  console.log("🔐 [DEBUG] Full Session Data:", JSON.stringify(req.session, null, 2));
  console.log("👤 [DEBUG] Session User:", JSON.stringify(req.session?.user, null, 2));
  console.log("🔍 [DEBUG] ========================================================\n");
  next();
});

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
    console.log("🔐 [GOOGLE] INSECURE LOG - Full Google User Profile:", JSON.stringify(userProfile, null, 2));
    console.log("🔐 [GOOGLE] INSECURE LOG - Access Token:", tokens.access_token);
    console.log("🔐 [GOOGLE] INSECURE LOG - All Tokens:", JSON.stringify(tokens, null, 2));
    console.log("🔐 [GOOGLE] INSECURE LOG - Session after login:", JSON.stringify(req.session, null, 2));
    
    // Force session save before redirect
    req.session.save((err) => {
      if (err) {
        console.error("❌ [GOOGLE] Session save error:", err);
      } else {
        console.log("✅ [GOOGLE] Session saved successfully");
      }
      res.redirect(process.env.FRONTEND_URL || "http://localhost:3000");
    });
    
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
    console.log("🔐 [GITHUB] INSECURE LOG - Full GitHub User Profile:", JSON.stringify(userProfile, null, 2));
    console.log("🔐 [GITHUB] INSECURE LOG - Access Token:", tokens.access_token);
    console.log("🔐 [GITHUB] INSECURE LOG - All Tokens:", JSON.stringify(tokens, null, 2));
    console.log("🔐 [GITHUB] INSECURE LOG - Session after login:", JSON.stringify(req.session, null, 2));
    
    // Force session save before redirect
    req.session.save((err) => {
      if (err) {
        console.error("❌ [GITHUB] Session save error:", err);
      } else {
        console.log("✅ [GITHUB] Session saved successfully");
      }
      res.redirect(process.env.FRONTEND_URL || "http://localhost:3000");
    });
    
  } catch (error) {
    console.error("💥 [GITHUB] Error during authentication:", error);
    res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}?error=auth_failed`);
  }
});

// Logout route
app.post("/auth/logout", (req, res) => {
  console.log("🚪 [AUTH] User logging out");
  console.log("🔐 [AUTH] INSECURE LOG - Session before logout:", JSON.stringify(req.session, null, 2));
  console.log("🔐 [AUTH] INSECURE LOG - User being logged out:", JSON.stringify(req.session?.user, null, 2));
  
  req.session.destroy((err) => {
    if (err) {
      console.error("❌ [AUTH] Error destroying session:", err);
      console.log("🔐 [AUTH] INSECURE LOG - Session destroy error details:", JSON.stringify(err, null, 2));
      return res.status(500).json({ error: "Failed to logout" });
    }
    
    res.clearCookie("sessionId");
    console.log("✅ [AUTH] User logged out successfully");
    console.log("🔐 [AUTH] INSECURE LOG - Session destroyed, cookie cleared");
    res.status(204).send();
  });
});

// Test route to debug session issues
app.get("/api/debug-session", (req, res) => {
  console.log("🔧 [DEBUG] Session debug endpoint called");
  console.log("🔧 [DEBUG] Session ID:", req.sessionID);
  console.log("🔧 [DEBUG] Session data:", JSON.stringify(req.session, null, 2));
  console.log("🔧 [DEBUG] Cookies received:", JSON.stringify(req.cookies, null, 2));
  console.log("🔧 [DEBUG] Raw cookie header:", req.headers.cookie);
  
  // Set a test value in session
  if (!req.session.testValue) {
    req.session.testValue = `Set at ${new Date().toISOString()}`;
    console.log("🔧 [DEBUG] Set test value in session");
  }
  
  res.json({
    sessionId: req.sessionID,
    sessionData: req.session,
    cookies: req.cookies,
    rawCookieHeader: req.headers.cookie,
    timestamp: new Date().toISOString()
  });
});

// Get current user profile
app.get("/api/user", (req, res) => {
  console.log("👤 [API] User profile requested");
  console.log("🔐 [API] INSECURE LOG - Full session data:", JSON.stringify(req.session, null, 2));
  console.log("🔐 [API] INSECURE LOG - Session ID:", req.sessionID);
  console.log("🔐 [API] INSECURE LOG - Session user exists:", !!req.session.user);
  
  if (!req.session.user) {
    console.log("❌ [API] No user in session");
    console.log("🔐 [API] INSECURE LOG - Session is:", JSON.stringify(req.session, null, 2));
    console.log("🔐 [API] INSECURE LOG - All cookies:", JSON.stringify(req.cookies, null, 2));
    console.log("🔐 [API] INSECURE LOG - Raw cookie header:", req.headers.cookie);
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  console.log("✅ [API] Returning user profile for:", req.session.user.email);
  console.log("🔐 [API] INSECURE LOG - Full user data being returned:", JSON.stringify(req.session.user, null, 2));
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
