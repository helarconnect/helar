import dotenv from "dotenv";

import { createApp } from "./app.js";
import { runStartupMigrations } from "./lib/startup-migrations.js";
import { runSubscriptionLifecycleCycle } from "./lib/subscription-lifecycle.js";

dotenv.config({
  path: new URL("../../../.env", import.meta.url)
});

let lastSubscriptionLifecycleDateKey: string | null = null;

function getDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function safeRunSubscriptionLifecycleCycle() {
  const now = new Date();
  const dateKey = getDateKey(now);

  if (lastSubscriptionLifecycleDateKey === dateKey) {
    console.info(
      JSON.stringify({
        event: "subscription_lifecycle_skipped_same_day",
        timestamp: now.toISOString(),
        lastRunDateKey: lastSubscriptionLifecycleDateKey
      })
    );
    return;
  }

  try {
    await runSubscriptionLifecycleCycle({ now });
    lastSubscriptionLifecycleDateKey = dateKey;
  } catch (error) {
    console.error("Subscription lifecycle cycle failed:", error);
  }
}

function scheduleSubscriptionLifecycle() {
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
  const jitterMs = Math.floor((Math.random() * 120 - 60) * 1000);
  const startupDelayMs = Math.max(0, 60 * 1000 + jitterMs);

  setTimeout(() => {
    void safeRunSubscriptionLifecycleCycle();
  }, startupDelayMs);

  console.info(
    JSON.stringify({
      event: "subscription_lifecycle_scheduled",
      timestamp: new Date().toISOString(),
      startupDelayMs,
      intervalMs: TWENTY_FOUR_HOURS_MS
    })
  );

  setInterval(() => {
    void safeRunSubscriptionLifecycleCycle();
  }, TWENTY_FOUR_HOURS_MS);
}

async function main() {
  await runStartupMigrations();
  const app = createApp();
  const port = Number(process.env.PORT ?? 4000);

  app.listen(port, () => {
    console.log(`LexLearn API listening on http://localhost:${port}`);
    scheduleSubscriptionLifecycle();
  });
}

void main();
