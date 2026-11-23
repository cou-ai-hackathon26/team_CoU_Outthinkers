import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertReferralTransition, canTransitionReferral, referralTransitionOptions } from "./workflow";

describe("referral workflow foundation", () => {
  it("allows only ordered lifecycle transitions", () => {
    assert.equal(canTransitionReferral("DRAFT", "SENT"), true);
    assert.equal(canTransitionReferral("SENT", "COMPLETED"), false);
    assert.equal(canTransitionReferral("COMPLETED", "UNRESOLVED"), false);
  });

  it("allows unresolved referrals to re-enter a documented workflow", () => {
    assert.equal(canTransitionReferral("UNRESOLVED", "ACKNOWLEDGED"), true);
    assert.deepEqual(referralTransitionOptions("UNRESOLVED"), ["ACKNOWLEDGED", "IN_TRANSIT", "ARRIVED", "ACCEPTED", "TRANSFERRED", "COMPLETED"]);
  });

  it("throws for invalid transitions", () => {
    assert.throws(() => assertReferralTransition("DRAFT", "COMPLETED"), /Invalid referral transition/);
  });
});
