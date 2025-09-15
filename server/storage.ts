import { type User, type InsertUser, type PdfJob, type InsertPdfJob } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createPdfJob(job: InsertPdfJob): Promise<PdfJob>;
  getPdfJob(id: string): Promise<PdfJob | undefined>;
  updatePdfJob(id: string, updates: Partial<PdfJob>): Promise<PdfJob | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private pdfJobs: Map<string, PdfJob>;

  constructor() {
    this.users = new Map();
    this.pdfJobs = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createPdfJob(job: InsertPdfJob): Promise<PdfJob> {
    const id = randomUUID();
    const pdfJob: PdfJob = {
      ...job,
      id,
      status: "processing",
      resultFiles: null,
      errorMessage: null,
      createdAt: new Date(),
    };
    this.pdfJobs.set(id, pdfJob);
    return pdfJob;
  }

  async getPdfJob(id: string): Promise<PdfJob | undefined> {
    return this.pdfJobs.get(id);
  }

  async updatePdfJob(id: string, updates: Partial<PdfJob>): Promise<PdfJob | undefined> {
    const existing = this.pdfJobs.get(id);
    if (!existing) return undefined;
    
    const updated = { ...existing, ...updates };
    this.pdfJobs.set(id, updated);
    return updated;
  }
}

export const storage = new MemStorage();
