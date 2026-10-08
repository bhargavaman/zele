/**
 * Test Google OAuth client IDs from open-source apps.
 * Probes scope/API enablement using token exchange with dummy codes.
 * Also tests device code flow and redirect URI support.
 *
 * Key insight: When sending a token exchange request with an invalid auth code,
 * Google checks client_id, redirect_uri, and scope BEFORE rejecting the code.
 * - "invalid_grant" = client + redirect + scope all valid, code is just wrong
 * - "redirect_uri_mismatch" = client valid, redirect URI not registered
 * - "invalid_scope" or API-specific errors = scope/API not enabled for this project
 * - "invalid_client" = client ID or secret is wrong
 *
 * Usage: npx tsx scripts/test-oauth-clients.ts
 */

interface OAuthClient {
  name: string;
  clientId: string;
  clientSecret: string;
  source: string;
}

const CLIENTS: OAuthClient[] = [
  {
    name: "Thunderbird Desktop",
    clientId:
      "406964657835-aq8lmia8j95dhl1a2bvharmfk3t1hgqj.apps.googleusercontent.com",
    clientSecret: "kSmqreRr0qwBWJgbf5Y-PjSU",
    source: "searchfox.org/comm-central OAuth2Providers.sys.mjs",
  },
  {
    name: "GNOME Online Accounts",
    clientId:
      "44438659992-7kgjeitenc16ssihbtdjbgguch7ju55s.apps.googleusercontent.com",
    clientSecret: "-gMLuQyDiI0XrQS_vx_mhuYF",
    source: "github.com/GNOME/gnome-online-accounts meson_options.txt",
  },
  {
    name: "KDE KAccounts",
    clientId:
      "317066460457-pkpkedrvt2ldq6g2hj1egfka2n7vpuoo.apps.googleusercontent.com",
    clientSecret: "Y8eFAaWfcanV3amZdDvtbYUq",
    source: "github.com/KDE/kaccounts-providers google.provider.in",
  },
];

// All interesting Google API scopes to test
const SCOPES_TO_TEST: Record<string, string> = {
  "Gmail (full)": "https://mail.google.com/",
  "Gmail (readonly)": "https://www.googleapis.com/auth/gmail.readonly",
  "Gmail (send)": "https://www.googleapis.com/auth/gmail.send",
  "Calendar": "https://www.googleapis.com/auth/calendar",
  "Calendar (readonly)": "https://www.googleapis.com/auth/calendar.readonly",
  "Calendar (events)": "https://www.googleapis.com/auth/calendar.events",
  "Contacts (CardDAV)": "https://www.googleapis.com/auth/carddav",
  "People API": "https://www.googleapis.com/auth/contacts.readonly",
  "Drive": "https://www.googleapis.com/auth/drive",
  "Drive (readonly)": "https://www.googleapis.com/auth/drive.readonly",
  "Drive (file)": "https://www.googleapis.com/auth/drive.file",
  "Tasks": "https://www.googleapis.com/auth/tasks",
  "Tasks (readonly)": "https://www.googleapis.com/auth/tasks.readonly",
  "UserInfo (email)": "https://www.googleapis.com/auth/userinfo.email",
  "UserInfo (profile)": "https://www.googleapis.com/auth/userinfo.profile",
  "Keep": "https://www.googleapis.com/auth/keep",
  "YouTube (readonly)": "https://www.googleapis.com/auth/youtube.readonly",
  "Photos (readonly)": "https://www.googleapis.com/auth/photoslibrary.readonly",
  openid: "openid",
};

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DEVICE_CODE_ENDPOINT = "https://oauth2.googleapis.com/device/code";

// Redirect URIs to test (determines what auth flows the client supports)
const REDIRECT_URIS = [
  "http://localhost",
  "http://localhost:8080",
  "http://127.0.0.1",
  "urn:ietf:wg:oauth:2.0:oob",
];

// ─── Test redirect URI support ───────────────────────────────────────────────
async function testRedirectUri(
  client: OAuthClient,
  redirectUri: string
): Promise<{ uri: string; supported: boolean; error?: string }> {
  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.clientId,
        client_secret: client.clientSecret,
        code: "4/dummy_probe_code_not_real",
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    const data = await res.json();
    const err = data.error || "";
    const desc = data.error_description || "";

    // "invalid_grant" = redirect URI is accepted, code is just wrong
    if (err === "invalid_grant") {
      return { uri: redirectUri, supported: true };
    }
    // "redirect_uri_mismatch" = this redirect URI is not registered
    if (err === "redirect_uri_mismatch") {
      return { uri: redirectUri, supported: false, error: "not registered" };
    }
    return { uri: redirectUri, supported: false, error: `${err}: ${desc}` };
  } catch (err: any) {
    return { uri: redirectUri, supported: false, error: err.message };
  }
}

// ─── Test scope via token exchange ───────────────────────────────────────────
// Uses a known-good redirect URI, sends a dummy code with a specific scope.
// Google's error response tells us whether the scope is valid for this project.
async function testScope(
  client: OAuthClient,
  redirectUri: string,
  scopeName: string,
  scopeValue: string
): Promise<{ scopeName: string; enabled: boolean; error?: string; raw?: string }> {
  try {
    // Note: The token endpoint for authorization_code grant doesn't actually
    // validate scope - it's validated at the authorization endpoint.
    // So we need a different approach: try the authorization URL construction
    // and use the device code endpoint as a secondary check.
    //
    // Actually, the most reliable probe is:
    // 1. Use the token endpoint with a dummy refresh_token + scope
    //    Google checks if the scope's API is enabled before attempting refresh
    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.clientId,
        client_secret: client.clientSecret,
        refresh_token: "1//dummy_refresh_token_for_scope_probe",
        grant_type: "refresh_token",
        scope: scopeValue,
      }),
    });
    const data = await res.json();
    const err = data.error || "";
    const desc = data.error_description || "";

    // "invalid_grant" = token is bad but scope + client combo is valid
    if (err === "invalid_grant") {
      return { scopeName, enabled: true, raw: desc };
    }
    // "invalid_scope" = API not enabled or scope not allowed
    if (err === "invalid_scope") {
      return { scopeName, enabled: false, error: desc || "not enabled", raw: desc };
    }
    // "unauthorized_client" = client not authorized for this flow/scope
    if (err === "unauthorized_client") {
      return { scopeName, enabled: false, error: desc, raw: desc };
    }
    // "invalid_client" = something wrong with credentials
    if (err === "invalid_client") {
      return { scopeName, enabled: false, error: "invalid client credentials", raw: desc };
    }
    // Any other error - report it
    return { scopeName, enabled: false, error: `${err}: ${desc}`, raw: desc };
  } catch (err: any) {
    return { scopeName, enabled: false, error: err.message };
  }
}

// ─── Test device code flow ───────────────────────────────────────────────────
async function testDeviceCode(
  client: OAuthClient,
  scope: string
): Promise<{ supported: boolean; error?: string; data?: any }> {
  try {
    const res = await fetch(DEVICE_CODE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.clientId,
        scope,
      }),
    });
    const data = await res.json();
    if (res.ok && data.device_code) {
      return { supported: true, data };
    }
    return {
      supported: false,
      error: `${data.error}: ${data.error_description || ""}`,
    };
  } catch (err: any) {
    return { supported: false, error: err.message };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=".repeat(80));
  console.log("Google OAuth Client Capability Tester");
  console.log("=".repeat(80));

  for (const client of CLIENTS) {
    console.log(`\n${"━".repeat(80)}`);
    console.log(`CLIENT: ${client.name}`);
    console.log(`ID:     ${client.clientId}`);
    console.log(`Source: ${client.source}`);
    console.log(`${"━".repeat(80)}`);

    // 1. Test device code flow
    console.log("\n[1] Device Code Flow (headless/remote login)");
    const dc = await testDeviceCode(client, "openid email");
    if (dc.supported) {
      console.log(`    ✅ SUPPORTED`);
      console.log(`    verification_url: ${dc.data.verification_url}`);
    } else {
      console.log(`    ❌ NOT SUPPORTED: ${dc.error}`);
    }

    // 2. Test redirect URIs
    console.log("\n[2] Redirect URI Support");
    let validRedirectUri = "http://localhost"; // fallback
    for (const uri of REDIRECT_URIS) {
      const r = await testRedirectUri(client, uri);
      const icon = r.supported ? "✅" : "❌";
      console.log(`    ${icon} ${uri}${r.error ? ` (${r.error})` : ""}`);
      if (r.supported && validRedirectUri === "http://localhost") {
        validRedirectUri = uri;
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    // 3. Test all scopes
    console.log("\n[3] API Scope Enablement");
    console.log(
      `    ${"Scope".padEnd(25)} ${"Status".padEnd(12)} Details`
    );
    console.log(`    ${"─".repeat(70)}`);

    for (const [scopeName, scopeValue] of Object.entries(SCOPES_TO_TEST)) {
      const r = await testScope(client, validRedirectUri, scopeName, scopeValue);
      const icon = r.enabled ? "✅ ENABLED" : "❌ DISABLED";
      const detail = r.error || "";
      console.log(
        `    ${scopeName.padEnd(25)} ${icon.padEnd(12)} ${detail}`
      );
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log("Done!");
}

main().catch(console.error);
