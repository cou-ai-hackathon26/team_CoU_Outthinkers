import assert from "node:assert/strict";
import { describe, it } from "node:test";
import request from "supertest";
import { app } from "./app";

describe("HTTP API integration", () => {
  it("reports a healthy API", async () => {
    const response = await request(app).get("/api/health");
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: "healthy", service: "MaternaCare API" });
  });

  it("validates patient registration before database work", async () => {
    const response = await request(app).post("/api/auth/patients/register").send({});
    assert.equal(response.status, 400);
    assert.match(response.body.error, /প্রয়োজনীয়/);
  });

  it("validates patient OTP input", async () => {
    const response = await request(app).post("/api/auth/patient/verify-otp").send({});
    assert.equal(response.status, 400);
    assert.match(response.body.error, /OTP/);
  });

  it("protects admin, staff, and patient profile endpoints", async () => {
    const paths = ["/api/admin/overview", "/api/staff/me", "/api/patient/me"];
    for (const path of paths) {
      const response = await request(app).get(path);
      assert.equal(response.status, 401, path);
    }
  });
});
