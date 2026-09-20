import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

if (!process.env.CLERK_PUBLISHABLE_KEY && process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  process.env.CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
}

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import router from "./routes";
import { apiRateLimiter } from "./middleware/rateLimit";
import { errorHandler } from "./middleware/errorHandler";
import { startScheduler } from "./services/sessionScheduler";
import { clerkMiddleware } from "@clerk/express";

const app = express();

// Render (and most PaaS) put the app behind a reverse proxy. Without this,
// req.ip is the proxy's address for every request, so all clients share a
// single rate-limit bucket and legitimate users get 429s.
app.set("trust proxy", 1);

const origins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Non-browser clients (mobile app, curl, Postman) send no Origin header.
      if (!origin) return callback(null, true);
      // Chrome extension IDs vary between dev/unpacked and published builds.
      if (origin.startsWith("chrome-extension://")) return callback(null, true);
      if (origins.length === 0 || origins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(clerkMiddleware());
app.use(morgan("dev"));
app.use(apiRateLimiter);

app.use(router);

app.use(errorHandler);

const port = Number(process.env.PORT) || 8080;

app.listen(port, '0.0.0.0', () => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`Focussive API running on ${port}`);
  } else {
    console.log(`Focussive API started on port ${port}`);
  }
  
  // Start the background session scheduler
  startScheduler();
});
