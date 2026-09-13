// HTTP surface. Two audiences, two auth models:
//   /api/*        the storefront/portal, acting for a signed-in customer
//   /admin/*      staff and cron, behind a shared key
//   /integrations/* partner systems (WMS, ERP) that pull, never push

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { PrismaClient } from "@prisma/client";
import { DateTime } from "luxon";

import { generateUpcomingDeliveries, availableSlots } from "./calendar.js";
import { runBilling, findRetries, billDelivery } from "./biller.js";
import { MAX_FUTURE_WEEKS, TIMEZONE } from "./config.js";

const db = new PrismaClient();
const app = new Hono();

const requireAdmin = async (c, next) => {
  if (c.req.header("X-Admin-Key") !== process.env.ADMIN_API_KEY) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
};

app.get("/health", (c) => c.json({ ok: true, now: DateTime.now().setZone(TIMEZONE).toISO() }));

// ── Customer-facing ─────────────────────────────────────────────────────────

app.get("/api/subscription/:id/calendar", async (c) => {
  const sub = await db.subscription.findUnique({
    where: { id: c.req.param("id") },
    include: {
      deliveries: { orderBy: { deliveryDate: "asc" }, take: MAX_FUTURE_WEEKS + 1 },
    },
  });
  if (!sub) return c.json({ error: "not found" }, 404);

  const now = DateTime.now();
  return c.json({
    deliveries: sub.deliveries.map((d) => ({
      ...d,
      editable: d.status === "SCHEDULED" && now < DateTime.fromJSDate(d.cutoffAt),
    })),
    slots: availableSlots({ from: now }),
  });
});

app.post("/api/delivery/:id/skip", async (c) => {
  const delivery = await db.delivery.findUnique({ where: { id: c.req.param("id") } });
  if (!delivery) return c.json({ error: "not found" }, 404);
  if (DateTime.now() >= DateTime.fromJSDate(delivery.cutoffAt)) {
    return c.json({ error: "cut-off has passed" }, 409);
  }

  await db.delivery.update({ where: { id: delivery.id }, data: { status: "SKIPPED" } });
  await db.event.create({
    data: {
      subscriptionId: delivery.subscriptionId,
      type: "skip",
      actor: "customer",
      message: `Skipped ${delivery.deliveryDate.toISOString().slice(0, 10)}`,
    },
  });
  return c.json({ ok: true });
});

// ── Admin ───────────────────────────────────────────────────────────────────

// Read-only. Always run this before a live billing run.
app.get("/admin/billing-report", requireAdmin, async (c) => {
  const report = await runBilling(db, { dryRun: true });
  return c.json(report);
});

// The live run. Requires an explicit confirmation string in the body so it
// cannot be triggered by a stray GET, a browser prefetch or a retried curl.
app.post("/admin/run-billing", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (body.confirm !== "CHARGE-LIVE") {
    return c.json({ error: 'send {"confirm":"CHARGE-LIVE"} to run live' }, 400);
  }
  return c.json(await runBilling(db, { dryRun: false }));
});

app.post("/admin/run-retries", requireAdmin, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (body.confirm !== "RETRY-LIVE") {
    return c.json({ error: 'send {"confirm":"RETRY-LIVE"} to run live' }, 400);
  }
  const due = await findRetries(db);
  const out = [];
  for (const delivery of due) {
    out.push({ id: delivery.id, status: await billDelivery(db, delivery) });
  }
  return c.json({ attempted: out.length, results: out });
});

// ── Partner integrations ────────────────────────────────────────────────────
// Pull-only, paged. Downstream systems poll this; the engine never pushes,
// which means a partner outage can never block billing.

app.get("/integrations/subscriptions", requireAdmin, async (c) => {
  const offset = Number(c.req.query("offset") ?? 0);
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 250);

  const subs = await db.subscription.findMany({
    where: { status: "ACTIVE" },
    include: {
      customer: true,
      deliveries: { where: { status: "SCHEDULED" }, orderBy: { deliveryDate: "asc" }, take: 1 },
    },
    skip: offset,
    take: limit,
    orderBy: { createdAt: "asc" },
  });

  return c.json({
    subscriptions: subs.map((s) => ({
      id: s.id,
      email: s.customer.email,
      itemCount: s.itemCount,
      usualDeliveryDay: s.usualDeliveryDay,
      upcomingLineItems: s.deliveries[0]?.lines ?? [],
      nextDeliveryDate: s.deliveries[0]?.deliveryDate ?? null,
    })),
    nextOffset: subs.length === limit ? offset + limit : null,
  });
});

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
console.log(`subscription engine listening on :${port}`);

export { app };
