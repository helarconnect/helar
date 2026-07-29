import dotenv from "dotenv";

import { createApp } from "./app.js";

dotenv.config({
  path: new URL("../../../.env", import.meta.url)
});

const app = createApp();
const port = Number(process.env.PORT ?? 4000);

app.listen(port, () => {
  console.log(`LexLearn API listening on http://localhost:${port}`);
});
