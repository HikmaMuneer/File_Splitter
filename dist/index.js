// server/index.ts
import express2 from "express";

// server/routes.ts
import { createServer } from "http";

// server/storage.ts
import { randomUUID } from "crypto";
var MemStorage = class {
  users;
  pdfJobs;
  constructor() {
    this.users = /* @__PURE__ */ new Map();
    this.pdfJobs = /* @__PURE__ */ new Map();
  }
  async getUser(id) {
    return this.users.get(id);
  }
  async getUserByUsername(username) {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }
  async createUser(insertUser) {
    const id = randomUUID();
    const user = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }
  async createPdfJob(job) {
    const id = randomUUID();
    const pdfJob = {
      ...job,
      id,
      status: "processing",
      resultFiles: null,
      errorMessage: null,
      createdAt: /* @__PURE__ */ new Date()
    };
    this.pdfJobs.set(id, pdfJob);
    return pdfJob;
  }
  async getPdfJob(id) {
    return this.pdfJobs.get(id);
  }
  async updatePdfJob(id, updates) {
    const existing = this.pdfJobs.get(id);
    if (!existing) return void 0;
    const updated = { ...existing, ...updates };
    this.pdfJobs.set(id, updated);
    return updated;
  }
};
var storage = new MemStorage();

// server/routes.ts
import multer from "multer";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";

// shared/schema.ts
import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
var users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull()
});
var pdfJobs = pgTable("pdf_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originalFilename: text("original_filename").notNull(),
  instructions: text("instructions").notNull(),
  status: text("status", { enum: ["processing", "completed", "failed"] }).notNull().default("processing"),
  resultFiles: text("result_files").array(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow()
});
var insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true
});
var insertPdfJobSchema = createInsertSchema(pdfJobs).pick({
  originalFilename: true,
  instructions: true
});
var splitInstructionsSchema = z.object({
  instructions: z.string().min(1, "Instructions are required")
});

// server/routes.ts
import path from "path";
var upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
  // 50MB limit
});
function parseInstructions(instructions) {
  const ranges = [];
  const parts = instructions.split(",").map((s) => s.trim());
  for (const part of parts) {
    if (part.includes("-")) {
      const [start, end] = part.split("-").map((s) => parseInt(s.trim()));
      if (isNaN(start) || isNaN(end) || start > end || start < 1) {
        throw new Error(`Invalid range: ${part}`);
      }
      const range = [];
      for (let i = start; i <= end; i++) {
        range.push(i);
      }
      ranges.push(range);
    } else {
      const page = parseInt(part);
      if (isNaN(page) || page < 1) {
        throw new Error(`Invalid page number: ${part}`);
      }
      ranges.push([page]);
    }
  }
  return ranges;
}
async function splitPdf(pdfBuffer, ranges, originalFilename) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const totalPages = pdfDoc.getPageCount();
  for (const range of ranges) {
    for (const pageNum of range) {
      if (pageNum > totalPages) {
        throw new Error(`Page ${pageNum} does not exist. PDF has ${totalPages} pages.`);
      }
    }
  }
  const results = [];
  const baseFilename = path.parse(originalFilename).name;
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    const newPdf = await PDFDocument.create();
    for (const pageNum of range) {
      const [copiedPage] = await newPdf.copyPages(pdfDoc, [pageNum - 1]);
      newPdf.addPage(copiedPage);
    }
    const pdfBytes = await newPdf.save();
    let filename;
    if (range.length === 1) {
      filename = `${baseFilename}-page-${range[0]}.pdf`;
    } else {
      filename = `${baseFilename}-pages-${range[0]}-${range[range.length - 1]}.pdf`;
    }
    results.push({
      filename,
      data: pdfBytes,
      pages: range,
      size: pdfBytes.length
    });
  }
  return results;
}
async function registerRoutes(app2) {
  app2.post("/api/split-pdf", upload.single("pdf"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No PDF file uploaded" });
      }
      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({ message: "File must be a PDF" });
      }
      const { instructions } = req.body;
      const validation = splitInstructionsSchema.safeParse({ instructions });
      if (!validation.success) {
        return res.status(400).json({
          message: "Invalid instructions",
          errors: validation.error.errors
        });
      }
      const job = await storage.createPdfJob({
        originalFilename: req.file.originalname,
        instructions
      });
      try {
        const ranges = parseInstructions(instructions);
        const splitResults = await splitPdf(req.file.buffer, ranges, req.file.originalname);
        const zip = new JSZip();
        for (const result of splitResults) {
          zip.file(result.filename, result.data);
        }
        const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
        await storage.updatePdfJob(job.id, {
          status: "completed",
          resultFiles: splitResults.map((r) => r.filename)
        });
        const zipFilename = `${path.parse(req.file.originalname).name}-split.zip`;
        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${zipFilename}"`);
        res.send(zipBuffer);
      } catch (error) {
        await storage.updatePdfJob(job.id, {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error"
        });
        throw error;
      }
    } catch (error) {
      console.error("PDF split error:", error);
      res.status(500).json({
        message: error instanceof Error ? error.message : "Failed to process PDF"
      });
    }
  });
  app2.get("/api/job/:id", async (req, res) => {
    try {
      const job = await storage.getPdfJob(req.params.id);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }
      res.json(job);
    } catch (error) {
      res.status(500).json({ message: "Failed to get job status" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/vite.ts
import express from "express";
import fs from "fs";
import path3 from "path";
import { createServer as createViteServer, createLogger } from "vite";

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path2 from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...process.env.NODE_ENV !== "production" && process.env.REPL_ID !== void 0 ? [
      await import("@replit/vite-plugin-cartographer").then(
        (m) => m.cartographer()
      ),
      await import("@replit/vite-plugin-dev-banner").then(
        (m) => m.devBanner()
      )
    ] : []
  ],
  resolve: {
    alias: {
      "@": path2.resolve(import.meta.dirname, "client", "src"),
      "@shared": path2.resolve(import.meta.dirname, "shared"),
      "@assets": path2.resolve(import.meta.dirname, "attached_assets")
    }
  },
  root: path2.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path2.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/vite.ts
import { nanoid } from "nanoid";
var viteLogger = createLogger();
function log(message, source = "express") {
  const formattedTime = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}
async function setupVite(app2, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      }
    },
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path3.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = path3.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (_req, res) => {
    res.sendFile(path3.resolve(distPath, "index.html"));
  });
}

// server/index.ts
var app = express2();
app.use(express2.json());
app.use(express2.urlencoded({ extended: false }));
app.use((req, res, next) => {
  const start = Date.now();
  const path4 = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };
  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path4.startsWith("/api")) {
      let logLine = `${req.method} ${path4} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }
      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "\u2026";
      }
      log(logLine);
    }
  });
  next();
});
(async () => {
  const server = await registerRoutes(app);
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    throw err;
  });
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const port = parseInt(process.env.PORT || "5000", 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true
  }, () => {
    log(`serving on port ${port}`);
  });
})();
