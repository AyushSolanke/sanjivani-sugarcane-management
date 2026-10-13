import { config } from "dotenv";
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId, Db } from "mongodb";
import OpenAI from "openai";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = dirname(fileURLToPath(import.meta.url));
// .env is at the project root (two levels up from src/api)
config({ path: resolve(projectDirectory, "..", "..", ".env") });

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const port = Number(process.env.PORT ?? 3000);

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("MONGODB_URI is not set in .env");
  process.exit(1);
}

const mongo = new MongoClient(mongoUri);
const dbName = process.env.MONGODB_DB ?? "sanjivani_sugar_factory";

let cachedDb: Db | null = null;

async function connectDb(): Promise<Db> {
  if (!cachedDb) {
    await mongo.connect();
    console.log(`Connected to MongoDB [db: ${dbName}]`);
    cachedDb = mongo.db(dbName);
  }
  return cachedDb;
}

// Health check with DB status
app.get("/api/health", async (_req, res) => {
  try {
    const db = await connectDb();
    await db.command({ ping: 1 });
    const count = await db.collection("farmers").countDocuments();
    res.json({
      ok: true,
      database: dbName,
      status: "connected",
      farmersCount: count,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({
      ok: false,
      database: dbName,
      status: "disconnected",
      error: err.message
    });
  }
});

// Dashboard aggregates
app.get("/api/dashboard", async (_req, res) => {
  try {
    const db = await connectDb();
    const farmers = await db.collection("farmers").find({}).toArray();

    const totalFarmers = farmers.length;
    const totalSugarcaneTons = farmers.reduce((s, f) => s + Number(f.sugarcaneTons ?? 0), 0);
    const totalAmountPaid = farmers.reduce((s, f) => s + Number(f.amountPaid ?? 0), 0);
    const totalPaymentPending = farmers.reduce((s, f) => s + Number(f.paymentPending ?? 0), 0);

    // Grouping by village for breakdown
    const villageStatsMap: Record<string, { tons: number; farmers: number; paid: number; pending: number }> = {};
    for (const f of farmers) {
      const v = (f.village || "Unknown").trim();
      if (!villageStatsMap[v]) {
        villageStatsMap[v] = { tons: 0, farmers: 0, paid: 0, pending: 0 };
      }
      villageStatsMap[v].tons += Number(f.sugarcaneTons ?? 0);
      villageStatsMap[v].farmers += 1;
      villageStatsMap[v].paid += Number(f.amountPaid ?? 0);
      villageStatsMap[v].pending += Number(f.paymentPending ?? 0);
    }

    const villageBreakdown = Object.entries(villageStatsMap).map(([village, stats]) => ({
      village,
      ...stats
    })).sort((a, b) => b.tons - a.tons);

    res.json({
      totalFarmers,
      totalSugarcaneTons,
      totalAmountPaid,
      totalPaymentPending,
      villageBreakdown
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch dashboard" });
  }
});

// Get unique villages for filter
app.get("/api/villages", async (_req, res) => {
  try {
    const db = await connectDb();
    const villages = await db.collection("farmers").distinct("village");
    res.json(villages.filter(Boolean).sort());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch villages" });
  }
});

// Farmers list with search, filter, and pagination
app.get("/api/farmers", async (req, res) => {
  try {
    const db = await connectDb();
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 20)));
    const skip = (page - 1) * limit;

    const filter: any = {};
    if (req.query.search) {
      filter.name = { $regex: String(req.query.search), $options: "i" };
    }
    if (req.query.village) {
      filter.village = String(req.query.village);
    }

    const total = await db.collection("farmers").countDocuments(filter);
    const items = await db.collection("farmers").find(filter).skip(skip).limit(limit).toArray();

    res.json({ page, limit, total, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch farmers" });
  }
});

// Farmer by ID
app.get("/api/farmers/:id", async (req, res) => {
  try {
    const db = await connectDb();
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });
    const item = await db.collection("farmers").findOne({ _id: new ObjectId(id) });
    if (!item) return res.status(404).json({ error: "Not found" });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch farmer" });
  }
});

// Create new farmer
app.post("/api/farmers", async (req, res) => {
  try {
    const { name, village, sugarcaneTons, amountPaid, paymentPending } = req.body;
    if (!name || typeof name !== "string") return res.status(400).json({ error: "Name is required" });
    const doc = {
      name: name.trim(),
      village: (village || "").trim(),
      sugarcaneTons: Number(sugarcaneTons ?? 0),
      amountPaid: Number(amountPaid ?? 0),
      paymentPending: Number(paymentPending ?? 0),
      createdAt: new Date()
    };
    const db = await connectDb();
    const result = await db.collection("farmers").insertOne(doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create farmer" });
  }
});

// Update farmer (fixed for MongoDB driver v6+)
app.put("/api/farmers/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });
    const { name, village, sugarcaneTons, amountPaid, paymentPending } = req.body;
    const update: any = {};
    if (name !== undefined) update.name = String(name).trim();
    if (village !== undefined) update.village = String(village).trim();
    if (sugarcaneTons !== undefined) update.sugarcaneTons = Number(sugarcaneTons);
    if (amountPaid !== undefined) update.amountPaid = Number(amountPaid);
    if (paymentPending !== undefined) update.paymentPending = Number(paymentPending);
    update.updatedAt = new Date();

    const db = await connectDb();
    const result = await db.collection("farmers").findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: "after" }
    );
    // In mongodb v6+, result is the document itself; in earlier versions, it is result.value
    const doc = result && typeof result === "object" && "value" in result ? (result as any).value : result;
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update farmer" });
  }
});

// Delete farmer
app.delete("/api/farmers/:id", async (req, res) => {
  try {
    const id = req.params.id;
    if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });
    const db = await connectDb();
    const result = await db.collection("farmers").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete farmer" });
  }
});

// AI Assistant query endpoint
app.post("/api/ai/ask", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== "string") return res.status(400).json({ error: "Question is required" });

    const db = await connectDb();
    const farmers = await db.collection("farmers").find({}).toArray();
    const summary = {
      totalFarmers: farmers.length,
      totalSugarcaneTons: farmers.reduce((s, f) => s + Number(f.sugarcaneTons ?? 0), 0),
      totalAmountPaid: farmers.reduce((s, f) => s + Number(f.amountPaid ?? 0), 0),
      totalPaymentPending: farmers.reduce((s, f) => s + Number(f.paymentPending ?? 0), 0),
      farmers: farmers.map(f => ({
        name: f.name,
        village: f.village,
        sugarcaneTons: f.sugarcaneTons,
        amountPaid: f.amountPaid,
        paymentPending: f.paymentPending
      }))
    };

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(500).json({ error: "OpenAI API key not configured" });

    const client = new OpenAI({ apiKey: openaiKey });

    const prompt = `Question: ${question}\n\nDatabase summary:\n${JSON.stringify(summary, null, 2)}`;
    const instructions = "You are the Sanjivani Sugar Factory AI Assistant. Answer clearly and concisely using only the supplied database data. Do not invent records. Use Indian rupees (₹) with appropriate formatting for currency.";

    let answer = "";
    try {
      const response = await client.responses.create({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        instructions,
        input: prompt
      });
      answer = response.output_text;
    } catch (apiErr: any) {
      console.warn("OpenAI API call failed or timed out:", apiErr.message);
      // Fallback: Analytical data-driven response computed directly from MongoDB data
      const q = question.toLowerCase();
      if (q.includes("village") && (q.includes("highest") || q.includes("most"))) {
        const vMap: Record<string, number> = {};
        summary.farmers.forEach((f: any) => { vMap[f.village] = (vMap[f.village] || 0) + f.sugarcaneTons; });
        const top = Object.entries(vMap).sort((a, b) => b[1] - a[1])[0];
        answer = `The village with the highest total sugarcane supply is ${top[0]} with a total of ${top[1]} tons.`;
      } else if (q.includes("highest") && (q.includes("pending") || q.includes("due"))) {
        const top = [...summary.farmers].sort((a, b) => b.paymentPending - a.paymentPending)[0];
        answer = `${top.name} from ${top.village} has the highest pending payment of ₹${top.paymentPending.toLocaleString("en-IN")}.`;
      } else if (q.includes("highest") && (q.includes("sugarcane") || q.includes("tons"))) {
        const top = [...summary.farmers].sort((a, b) => b.sugarcaneTons - a.sugarcaneTons)[0];
        answer = `${top.name} from ${top.village} supplied the highest sugarcane with ${top.sugarcaneTons} tons (Payment paid: ₹${top.amountPaid.toLocaleString("en-IN")}, pending: ₹${top.paymentPending.toLocaleString("en-IN")}).`;
      } else if (q.includes("pending") || q.includes("due")) {
        answer = `Total payment pending across all ${summary.totalFarmers} farmers is ₹${summary.totalPaymentPending.toLocaleString("en-IN")}. Total amount paid so far is ₹${summary.totalAmountPaid.toLocaleString("en-IN")}.`;
      } else if (q.includes("total") || q.includes("summary") || q.includes("how many")) {
        answer = `Sanjivani Sugar Factory Summary:\n• Total Farmers: ${summary.totalFarmers}\n• Total Sugarcane Supplied: ${summary.totalSugarcaneTons} Tons\n• Total Amount Paid: ₹${summary.totalAmountPaid.toLocaleString("en-IN")}\n• Total Pending Payments: ₹${summary.totalPaymentPending.toLocaleString("en-IN")}`;
      } else {
        const matchingFarmer = summary.farmers.find((f: any) => q.includes(f.name.toLowerCase()));
        if (matchingFarmer) {
          answer = `${matchingFarmer.name} (${matchingFarmer.village}): Sugarcane: ${matchingFarmer.sugarcaneTons} tons, Amount Paid: ₹${matchingFarmer.amountPaid.toLocaleString("en-IN")}, Pending: ₹${matchingFarmer.paymentPending.toLocaleString("en-IN")}.`;
        } else {
          answer = `Sanjivani Sugar Factory Report:\n• Total Farmers: ${summary.totalFarmers}\n• Sugarcane Supplied: ${summary.totalSugarcaneTons} tons\n• Amount Paid: ₹${summary.totalAmountPaid.toLocaleString("en-IN")}\n• Payment Pending: ₹${summary.totalPaymentPending.toLocaleString("en-IN")}\n\nTop villages supplying sugarcane include ${[...new Set(summary.farmers.map((f: any) => f.village))].join(", ")}.`;
        }
      }
    }

    res.json({ answer });
  } catch (err: any) {
    console.error("AI Assistant error:", err);
    res.status(500).json({ error: err.message || "AI request failed" });
  }
});

app.listen(port, () => {
  console.log(`Backend API listening on http://localhost:${port}`);
});