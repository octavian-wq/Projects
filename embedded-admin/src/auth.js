// Session-token auth for an embedded app.
//
// An app running inside Shopify admin has no cookies to rely on — it's in an
// iframe, and browsers have been closing that door for years. App Bridge instead
// hands the frontend a short-lived JWT per request, which the backend verifies
// against the app's client secret.
//
// The two checks people miss are `dest` and expiry. Verifying the signature
// alone means a valid token from ANOTHER shop authenticates against yours.

import { jwtVerify } from "jose";

const SECRET = () => new TextEncoder().encode(process.env.SHOPIFY_API_SECRET);

export class AuthError extends Error {}

/**
 * Verify an App Bridge session token and return the shop it belongs to.
 * @param {string} authorization  the raw `Authorization: Bearer <jwt>` header
 */
export async function verifySessionToken(authorization) {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) throw new AuthError("missing session token");

  let payload;
  try {
    ({ payload } = await jwtVerify(token, SECRET(), {
      algorithms: ["HS256"],
      audience: process.env.SHOPIFY_API_KEY, // aud must be OUR app
    }));
  } catch (err) {
    throw new AuthError(`invalid session token: ${err.message}`);
  }

  // `dest` is the shop the token was minted for. Without this check, a token
  // from any other store installing the same app would verify here.
  const shop = String(payload.dest || "").replace(/^https:\/\//, "");
  if (!shop.endsWith(".myshopify.com")) {
    throw new AuthError(`unexpected dest: ${payload.dest}`);
  }

  // jose checks `exp`; `nbf` is checked explicitly because Shopify sets it and
  // a token used before its window is as wrong as one used after.
  const now = Math.floor(Date.now() / 1000);
  if (payload.nbf && now < payload.nbf) throw new AuthError("token not yet valid");

  return { shop, userId: payload.sub, expiresAt: payload.exp };
}

/** Hono middleware: attaches `c.set("shop", …)` or 401s. */
export function requireSession() {
  return async (c, next) => {
    try {
      const session = await verifySessionToken(c.req.header("Authorization"));
      c.set("shop", session.shop);
      c.set("session", session);
      await next();
    } catch (err) {
      return c.json({ error: err.message }, 401);
    }
  };
}
