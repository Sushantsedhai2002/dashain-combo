import type { OfferDiscovery } from "./discovery.ts";

// Each scenario is independent. Gifts and chance benefits never reduce cash cost.
export function calculateCost(input: {
  listedMinor: number;
  instantDiscountMinor: number;
  eligibilityConfirmed: boolean;
  discovery: OfferDiscovery;
}): {
  payableNowMinor: number;
  effectiveCashMinor: number | null;
  deliveryUnknown: boolean;
  cashbackMinor: number | null;
} {
  const { listedMinor, instantDiscountMinor, discovery: d } = input;
  if (
    ![listedMinor, instantDiscountMinor].every((v) => Number.isSafeInteger(v) && v >= 0) ||
    instantDiscountMinor > listedMinor
  )
    throw new TypeError("Invalid price");
  const payableNowMinor =
    listedMinor - instantDiscountMinor + (d.eligibility.mandatoryChargesMinor ?? 0);
  const cashbacks = d.benefits.filter(
    (benefit) => benefit.type === "CASHBACK" && benefit.status !== "CHANCE",
  );
  const benefit = cashbacks.length === 1 ? cashbacks[0] : undefined;
  const eligible =
    input.eligibilityConfirmed &&
    benefit !== undefined &&
    d.eligibility.minimumSpendMinor !== null &&
    listedMinor >= d.eligibility.minimumSpendMinor &&
    d.eligibility.paymentMethod !== null &&
    d.eligibility.cashbackBasis !== null &&
    d.eligibility.cashbackTiming !== null &&
    (instantDiscountMinor === 0 || d.eligibility.combinability === "ALLOWED");
  let cashbackMinor: number | null = null;
  if (eligible && benefit) {
    const basis = d.eligibility.cashbackBasis === "PAYABLE_NOW" ? payableNowMinor : listedMinor;
    if (benefit.amountMinor !== null) cashbackMinor = benefit.amountMinor;
    else if (benefit.percent !== null && benefit.capMinor !== null)
      cashbackMinor = Math.floor((basis * benefit.percent) / 100);
    if (cashbackMinor !== null)
      cashbackMinor = Math.min(cashbackMinor, benefit.capMinor ?? cashbackMinor, payableNowMinor);
  }
  return {
    payableNowMinor,
    effectiveCashMinor: cashbackMinor === null ? null : payableNowMinor - cashbackMinor,
    deliveryUnknown: d.eligibility.mandatoryChargesMinor === null,
    cashbackMinor,
  };
}
