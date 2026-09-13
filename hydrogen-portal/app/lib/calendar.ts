// What the customer is allowed to change, and when.
//
// The portal must agree with the biller exactly. If the portal thinks a box is
// editable one minute longer than the engine does, a customer edits a box that
// has already been charged and packed — and the difference shows up as a
// complaint, not an error.
//
// So editability is derived from the same cut-off instant the engine stores on
// the delivery row. The portal never recomputes it from a date string, and never
// applies its own "minus 48 hours" rule.

export type DeliveryStatus =
  | "SCHEDULED" | "CHARGED" | "SKIPPED" | "FAILED" | "CANCELLED";

export interface Delivery {
  id: string;
  deliveryDate: string;    // ISO
  cutoffAt: string;        // ISO — authoritative, from the engine
  cancelClosesAt: string;  // ISO
  status: DeliveryStatus;
  lines: Array<{ variantId: string; title: string; quantity: number }>;
}

export interface DeliveryView extends Delivery {
  editable: boolean;
  cancellable: boolean;
  locked: boolean;
}

/**
 * Decorate a delivery with what the customer can do to it right now.
 * @param now injectable so the states are testable without faking system time
 */
export function toView(delivery: Delivery, now: Date = new Date()): DeliveryView {
  const cutoff = new Date(delivery.cutoffAt);
  const cancelCloses = new Date(delivery.cancelClosesAt);

  const editable = delivery.status === "SCHEDULED" && now < cutoff;
  const cancellable = delivery.status === "CHARGED" && now < cancelCloses;

  return {
    ...delivery,
    editable,
    cancellable,
    // Locked means "we are preparing this" — charged, or past cut-off and
    // awaiting billing. The UI should explain it, not just disable the button.
    locked: !editable && delivery.status !== "SKIPPED",
  };
}

/** Human explanation for why a box can't be changed. Empty when it can. */
export function lockReason(view: DeliveryView, now: Date = new Date()): string {
  if (view.editable) return "";
  if (view.status === "SKIPPED") return "You skipped this week.";
  if (view.status === "CHARGED" && view.cancellable) {
    return "This box is paid for and being prepared. You can still cancel it.";
  }
  if (view.status === "CHARGED") return "This box is packed and on its way.";
  if (now >= new Date(view.cutoffAt)) return "The cut-off for this week has passed.";
  return "This week can't be changed.";
}
