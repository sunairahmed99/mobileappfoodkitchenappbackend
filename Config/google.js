/**
 * Google OAuth Configuration & Dynamic Token Verification
 *
 * Provides server-side verification of Google OAuth tokens:
 * - Google ID Token: Verified using Google's public tokeninfo endpoint
 *   (https://oauth2.googleapis.com/tokeninfo?id_token=...)
 * - Google Access Token: Verified using Google's userinfo endpoint
 *   (https://www.googleapis.com/oauth2/v3/userinfo)
 *
 * Credentials can be plugged into backend/.env under:
 * - GOOGLE_CLIENT_ID
 * - GOOGLE_CLIENT_SECRET
 */

export const getGoogleClientId = () =>
  (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_WEB_CLIENT_ID || '').trim();

/**
 * Dynamically verify a Google ID Token or Access Token directly with Google APIs.
 *
 * @param {Object} tokens
 * @param {string} [tokens.idToken] - Google JWT ID Token from OAuth response
 * @param {string} [tokens.accessToken] - Google OAuth 2.0 Access Token
 * @returns {Promise<{
 *   verified: boolean,
 *   email?: string,
 *   name?: string,
 *   avatar?: string,
 *   googleId?: string,
 *   error?: string
 * }>}
 */
export const verifyGoogleToken = async ({ idToken, accessToken }) => {
  const configuredClientId = getGoogleClientId();

  // 1. Verify via Google ID Token if present
  if (idToken && typeof idToken === 'string' && idToken.trim()) {
    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken.trim())}`,
        { method: 'GET' }
      );

      if (response.ok) {
        const payload = await response.json();

        // If a client ID is configured on the backend, ensure audience matches
        if (configuredClientId && payload.aud && payload.aud !== configuredClientId) {
          return {
            verified: false,
            error: `Google ID token audience mismatch: expected ${configuredClientId}, got ${payload.aud}`,
          };
        }

        // Check email verification status
        const isEmailVerified =
          payload.email_verified === true ||
          payload.email_verified === 'true' ||
          payload.verified_email === true;

        if (!payload.email || !isEmailVerified) {
          return {
            verified: false,
            error: 'Google account email is not verified.',
          };
        }

        return {
          verified: true,
          email: payload.email.toLowerCase().trim(),
          name: payload.name || payload.given_name || payload.email.split('@')[0],
          avatar: payload.picture || null,
          googleId: payload.sub || null,
        };
      }
    } catch (err) {
      console.warn('[GoogleAuth] ID token verification network notice:', err.message);
    }
  }

  // 2. Verify via Google Access Token if present
  if (accessToken && typeof accessToken === 'string' && accessToken.trim()) {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken.trim()}`,
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const payload = await response.json();

        if (!payload.email) {
          return {
            verified: false,
            error: 'Google userinfo did not return a valid email address.',
          };
        }

        return {
          verified: true,
          email: payload.email.toLowerCase().trim(),
          name: payload.name || payload.given_name || payload.email.split('@')[0],
          avatar: payload.picture || null,
          googleId: payload.sub || null,
        };
      }
    } catch (err) {
      console.warn('[GoogleAuth] Access token verification network notice:', err.message);
    }
  }

  return { verified: false };
};
