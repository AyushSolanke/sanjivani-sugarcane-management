
import { config } from "dotenv";
import { MongoClient } from "mongodb";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(projectDirectory, ".env") });

const server = new McpServer({
  name: "sanjivani-farmer-server",
  version: "1.0.0"
});

server.registerTool(
  "get_farmer_payment_summary",
  {
    description:
      "Retrieve all farmer records and total sugarcane, paid amount, and pending payment from MongoDB.",
    inputSchema: z.object({})
  },
  async () => {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI is missing from the environment.");
    }

    const mongo = new MongoClient(mongoUri);
    try {
      await mongo.connect();

      const farmers = await mongo
        .db(process.env.MONGODB_DB ?? "sanjivani_sugar_factory")
        .collection("farmers")
        .find({})
        .toArray();

      const summary = {
        totalFarmers: farmers.length,
        totalSugarcaneTons: farmers.reduce(
          (sum, f) => sum + Number(f.sugarcaneTons ?? 0), 0
        ),
        totalAmountPaid: farmers.reduce(
          (sum, f) => sum + Number(f.amountPaid ?? 0), 0
        ),
        totalPaymentPending: farmers.reduce(
          (sum, f) => sum + Number(f.paymentPending ?? 0), 0
        ),
        farmers
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(summary, null, 2)
        }]
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: error instanceof Error ? error.message : String(error)
        }]
      };
    }
  }
);

void serveStdio(() => server);
