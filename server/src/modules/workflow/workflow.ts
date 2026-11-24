import { ReferralStatus } from "../../generated/prisma/enums";

const transitions: Record<ReferralStatus, ReferralStatus[]> = {
  DRAFT: ["SENT", "UNRESOLVED"],
  SENT: ["ACKNOWLEDGED", "REJECTED", "UNRESOLVED"],
  REJECTED: ["UNRESOLVED"],
  ACKNOWLEDGED: ["IN_TRANSIT", "UNRESOLVED"],
  IN_TRANSIT: ["ARRIVED", "UNRESOLVED"],
  ARRIVED: ["ACCEPTED", "TRANSFERRED", "UNRESOLVED"],
  ACCEPTED: ["COMPLETED", "UNRESOLVED"],
  TRANSFERRED: ["COMPLETED", "UNRESOLVED"],
  COMPLETED: [],
  UNRESOLVED: ["ACKNOWLEDGED", "IN_TRANSIT", "ARRIVED", "ACCEPTED", "TRANSFERRED", "COMPLETED"],
};

export function canTransitionReferral(from: ReferralStatus, to: ReferralStatus) {
  return transitions[from].includes(to);
}

export function assertReferralTransition(from: ReferralStatus, to: ReferralStatus) {
  if (!canTransitionReferral(from, to)) {
    throw new Error(`Invalid referral transition: ${from} -> ${to}`);
  }
}

export function referralTransitionOptions(from: ReferralStatus) {
  return [...transitions[from]];
}
