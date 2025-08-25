import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();

const redirect_uri = process.env.GOOGLE_REDIRECT_URI;

app.get("/login", (req, res) => {
  console.log("🔐 [OAUTH] Starting OAuth login flow");
  console.log("📋 [OAUTH] Client ID:", process.env.GOOGLE_CLIENT_ID?.substring(0, 20) + "...");
  console.log("🔗 [OAUTH] Redirect URI:", redirect_uri);
  
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirect_uri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  
  console.log("🚀 [OAUTH] Generated authorization URL:", url.toString());
  console.log("👤 [OAUTH] Redirecting user to Google for authorization...");
  
  res.redirect(url.toString());
});

app.get("/auth/callback", async (req, res) => {
  console.log("🔄 [OAUTH] Callback received from Google");
  console.log("📝 [OAUTH] Query parameters:", req.query);
  
  const code = req.query.code;
  const error = req.query.error;
  
  if (error) {
    console.error("❌ [OAUTH] Authorization error:", error);
    console.error("📄 [OAUTH] Error description:", req.query.error_description);
    return res.status(400).json({ error, description: req.query.error_description });
  }
  
  if (!code) {
    console.error("❌ [OAUTH] No authorization code received");
    return res.status(400).json({ error: "No authorization code received" });
  }
  
  console.log("✅ [OAUTH] Authorization code received:", code.substring(0, 20) + "...");
  console.log("🔄 [OAUTH] Exchanging authorization code for tokens...");
  
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri,
        grant_type: "authorization_code"
      }),
    });

    console.log("📡 [OAUTH] Token exchange response status:", tokenRes.status);
    
    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error("❌ [OAUTH] Token exchange failed:", errorText);
      return res.status(tokenRes.status).json({ error: "Token exchange failed", details: errorText });
    }

    const tokens = await tokenRes.json();
    console.log("🎉 [OAUTH] Tokens received successfully!");
    console.log("🔑 [OAUTH] Token types:", Object.keys(tokens));
    console.log("⏰ [OAUTH] Access token expires in:", tokens.expires_in, "seconds");
    
    if (tokens.access_token) {
      console.log("✅ [OAUTH] Access token:", tokens.access_token.substring(0, 20) + "...");
    }
    if (tokens.id_token) {
      console.log("🆔 [OAUTH] ID token received (JWT)");
    }
    if (tokens.refresh_token) {
      console.log("🔄 [OAUTH] Refresh token received");
    }
    
    res.json(tokens); // contains access_token, id_token, etc.
  } catch (error) {
    console.error("💥 [OAUTH] Unexpected error during token exchange:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
