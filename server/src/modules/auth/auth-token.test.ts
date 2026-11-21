import assert from "node:assert/strict";
import crypto from "node:crypto";
import { afterEach, describe, it } from "node:test";
import { createAuthToken, verifyAuthToken } from "./auth-token";

const originalSecret = process.env.AUTH_TOKEN_SECRET;

afterEach(() => {
  if (originalSecret === undefined) delete process.env.AUTH_TOKEN_SECRET;
  else process.env.AUTH_TOKEN_SECRET = originalSecret;
});

describe("authentication tokens", () => {
  it("creates a token that can be verified", () => {
    process.env.AUTH_TOKEN_SECRET = "test-secret-with-at-least-32-characters";
    const token = createAuthToken("user-123", "NURSE");
    const claims = verifyAuthToken(token);

    assert.ok(claims);
    assert.equal(claims.userId, "user-123");
    assert.equal(claims.role, "NURSE");
    assert.ok(claims.expiresAt > claims.issuedAt);
  });

  it("rejects a tampered token", () => {
    process.env.AUTH_TOKEN_SECRET = "test-secret-with-at-least-32-characters";
    const token = createAuthToken("user-123", "PATIENT");
    const [payload, signature] = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ userId: "other-user", role: "ADMIN", issuedAt: 1, expiresAt: 9_999_999_999 })).toString("base64url");

    assert.equal(verifyAuthToken(`${tamperedPayload}.${signature}`), null);
    assert.equal(verifyAuthToken(`${payload}.${signature.slice(0, -1)}x`), null);
  });

  it("rejects an expired token", () => {
    process.env.AUTH_TOKEN_SECRET = "test-secret-with-at-least-32-characters";
    const payload = Buffer.from(JSON.stringify({ userId: "user-123", role: "ADMIN", issuedAt: 1, expiresAt: 1 })).toString("base64url");
    const signature = crypto.createHmac("sha256", process.env.AUTH_TOKEN_SECRET).update(payload).digest("base64url");

    assert.equal(verifyAuthToken(`${payload}.${signature}`), null);
  });

  it("rejects secrets shorter than 32 characters", () => {
    process.env.AUTH_TOKEN_SECRET = "short-secret";
    assert.throws(() => createAuthToken("user-123", "ADMIN"), /at least 32 characters/);
  });
});
