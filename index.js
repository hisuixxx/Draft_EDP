/*
    MIT License
    
    Copyright (c) 2025 Christian I. Cabrera || XianFire Framework
    Mindoro State University - Philippines

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
    */
    
import "dotenv/config";
import express from "express";
import path from "path";
import session from "express-session";
import flash from "connect-flash";
import router from "./routes/index.js";
import fs from "fs";
import hbs from "hbs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
hbs.registerHelper("eq", (left, right) => left === right);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(process.cwd(), "public")));

app.use(session({
  secret: process.env.SESSION_SECRET || "development-only-change-me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 8
  }
}));
app.use(flash());

app.engine("xian", async (filePath, options, callback) => {
  try {
     const originalPartialsDir = hbs.partialsDir;
    hbs.partialsDir = path.join(__dirname, 'views');

    const result = await new Promise((resolve, reject) => {
      hbs.__express(filePath, options, (err, html) => {
        if (err) return reject(err);
        resolve(html);
      });
    });

    hbs.partialsDir = originalPartialsDir;
    callback(null, result);
  } catch (err) {
    callback(err);
  }
});
app.use((req, res, next) => {
  res.locals.success_msg = req.flash("success_msg");
  res.locals.error_msg = req.flash("error_msg");
  res.locals.isAdmin = req.session.userRole === "admin";
  res.locals.isStaff = ["admin", "staff"].includes(req.session.userRole);
  res.locals.isCustomer = req.session.userRole === "customer";
  res.locals.currentUser = req.session.userName;
  next();
});


app.set("views", path.join(__dirname, "views"));
app.set("view engine", "xian");
const partialsDir = path.join(__dirname, "views/partials");
try {
  for (const file of fs.readdirSync(partialsDir)) {
    if (!file.endsWith(".xian")) continue;
    const partialName = file.replace(".xian", "");
    hbs.registerPartial(partialName, fs.readFileSync(path.join(partialsDir, file), "utf8"));
  }
} catch (error) {
  console.error("Could not register RestoFlow view partials:", error);
}

app.use("/", router);

app.use((error, req, res, next) => {
  console.error("Request failed:", error);
  if (res.headersSent) return next(error);
  req.flash("error_msg", "Something went wrong. Please try again.");
  res.redirect(req.get("referer") || (req.session.userId ? "/dashboard" : "/"));
});

export default app;

// Start the HTTP server; resolves once the server is listening.
// Exported so the Electron main process can control startup itself.
let activeServer;
export const startServer = (port = PORT) => {
  if (activeServer) return Promise.resolve(activeServer);

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      activeServer = server;
      console.log(`🍽️ RestoFlow running at http://localhost:${port}`);
      resolve(server);
    });
    server.once("error", error => {
      if (error.code === "EADDRINUSE") {
        const message = `Port ${port} is already in use. The existing RestoFlow server may already be running.`;
        const occupiedPortError = new Error(message);
        occupiedPortError.code = error.code;
        reject(occupiedPortError);
        return;
      }
      reject(error);
    });
  });
};

// Auto-start only when executed directly (node index.js).
// When imported by electron/main.js, Electron manages the server lifecycle.
const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun && !process.env.XIAN_ELECTRON) {
  startServer().catch(error => {
    console.error(`❌ ${error.message}`);
    process.exitCode = error.code === "EADDRINUSE" ? 0 : 1;
  });
}
