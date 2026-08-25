import dotenv from "dotenv";

import { createApp } from "./app.js";
import { runStartupMigrations } from "./lib/startup-migrations.js";

dotenv.config({
  path: new URL("../../../.env", import.meta.url)
});

async function main() {
  await runStartupMigrations();
  const app = createApp();
  const port = Number(process.env.PORT ?? 4000);

  app.listen(port, () => {
    console.log(`LexLearn API listening on http://localhost:${port}`);
  });
}

void main();
