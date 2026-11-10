/**
 * Single source of truth for the JWT signing secret.
 *
 * Deliberately has NO hard-coded fallback: falling back to a well-known default
 * would let anybody mint valid tokens when the environment variable is missing.
 * If the secret is not configured this throws a clear, actionable error.
 */
export const getJwtSecret = () => {
  const secret = process.env.jwttoken;

  if (!secret || !String(secret).trim()) {
    throw new Error(
      'JWT secret is not configured. Set the "jwttoken" environment variable before starting the server.'
    );
  }

  return secret;
};

export default getJwtSecret;
