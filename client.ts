
import { config } from "dotenv";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectDirectory = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(projectDirectory, ".env") });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const client = new Client({
  name: "sanjivani-farmer-client",
  version: "1.0.0"
});

async function main() {
  try {
    // Start the MCP server as a child process.
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        "--import",
        "tsx",
        resolve(projectDirectory, "server.ts")
      ],
      cwd: projectDirectory
    });

    await client.connect(transport);

    // Discover the registered MCP tool.
    const { tools } = await client.listTools();
    console.log("Available tools:", tools.map(t => t.name));

    // Hard-coded question.
    const question =
      "How many farmers supply sugarcane to Sanjivani Sugar Factory? " +
      "Tell me the total sugarcane supplied in tons, total amount paid, " +
      "total payment pending, and each farmer's name and village.";

    // Call the MCP tool.
    const result = await client.callTool({
      name: "get_farmer_payment_summary",
      arguments: {}
    });

    if (result.isError) {
      throw new Error(JSON.stringify(result.content));
    }

    const databaseData = result.content
      .filter(item => item.type === "text")
      .map(item => item.text)
      .join("\n");

    // Ask OpenAI to answer using the database result.
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      instructions:
        "Answer using only the supplied database data. " +
        "Use Indian rupees and do not invent records.",
      input: `Question: ${question}\n\nMongoDB data:\n${databaseData}`
    });

    console.log("\nQuestion:", question);
    console.log("\nAI Answer:\n", response.output_text);
  } catch (error) {
    console.error("Application error:", error);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main();
