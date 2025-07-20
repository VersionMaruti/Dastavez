//@ts-ignore
import { setupWSConnection } from "y-websocket/bin/utils";
import * as Y from "yjs";
import * as http from "http";
import express from "express";
import WebSocket from "ws";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";

// Document storage - in production, use Redis or database
const documents = new Map<string, Y.Doc>();
const documentMetadata = new Map<
  string,
  {
    title: string;
    lastModified: Date;
    collaborators: Set<string>;
  }
>();

const app = express();

// Enable CORS for all routes
app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:3001"], // Add your frontend URLs
    credentials: true,
  })
);

app.use(express.json());

// REST API endpoints
app.get("/api/documents", (req, res) => {
  const docs = Array.from(documentMetadata.entries()).map(([id, metadata]) => ({
    id,
    title: metadata.title,
    lastModified: metadata.lastModified,
    collaboratorCount: metadata.collaborators.size,
  }));

  res.json(docs);
});

app.get("/api/documents/:docId", (req, res) => {
  const { docId } = req.params;
  const metadata = documentMetadata.get(docId);

  if (!metadata) {
    return res.status(404).json({ error: "Document not found" });
  }

  res.json({
    id: docId,
    title: metadata.title,
    lastModified: metadata.lastModified,
    collaboratorCount: metadata.collaborators.size,
  });
});

app.post("/api/documents", (req, res) => {
  const docId = uuidv4();
  const { title = "Untitled Document" } = req.body;

  // Create new Y.Doc
  const ydoc = new Y.Doc();
  documents.set(docId, ydoc);

  // Initialize metadata
  documentMetadata.set(docId, {
    title,
    lastModified: new Date(),
    collaborators: new Set(),
  });

  res.json({
    id: docId,
    title,
    url: `${req.protocol}://${req.get("host")}/doc/${docId}`,
  });
});

app.put("/api/documents/:docId/title", (req, res) => {
  const { docId } = req.params;
  const { title } = req.body;

  const metadata = documentMetadata.get(docId);
  if (!metadata) {
    return res.status(404).json({ error: "Document not found" });
  }

  metadata.title = title;
  metadata.lastModified = new Date();

  res.json({ success: true });
});

app.delete("/api/documents/:docId", (req, res) => {
  const { docId } = req.params;

  if (!documents.has(docId)) {
    return res.status(404).json({ error: "Document not found" });
  }

  // Cleanup document
  const ydoc = documents.get(docId);
  if (ydoc) {
    ydoc.destroy();
  }

  documents.delete(docId);
  documentMetadata.delete(docId);

  res.json({ success: true });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    documents: documents.size,
    uptime: process.uptime(),
  });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Enhanced WebSocket connection handler
wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
  const url = req.url || "";
  const docName = url.slice(1).split("?")[0] || "default-room";

  console.log(`📝 New connection to document: ${docName}`);

  // Ensure document exists
  if (!documents.has(docName)) {
    const ydoc = new Y.Doc();
    documents.set(docName, ydoc);

    // Initialize metadata if it doesn't exist
    if (!documentMetadata.has(docName)) {
      documentMetadata.set(docName, {
        title: "Untitled Document",
        lastModified: new Date(),
        collaborators: new Set(),
      });
    }
  }

  // Add to collaborators
  const metadata = documentMetadata.get(docName);
  if (metadata) {
    const collaboratorId = uuidv4();
    metadata.collaborators.add(collaboratorId);

    // Remove collaborator on disconnect
    ws.on("close", () => {
      metadata.collaborators.delete(collaboratorId);
      console.log(`👋 User left document: ${docName}`);
    });
  }

  // Set up Y.js WebSocket connection with persistence
  try {
    const ydoc = documents.get(docName);
    if (ydoc) {
      setupWSConnection(ws, req, {
        docName,
        doc: ydoc, // Pass existing document
      });

      // Update last modified timestamp when document changes
      ydoc.on("update", () => {
        const metadata = documentMetadata.get(docName);
        if (metadata) {
          metadata.lastModified = new Date();
        }
      });
    } else {
      setupWSConnection(ws, req, { docName });
    }
  } catch (error) {
    console.error("Error setting up WebSocket connection:", error);
    ws.close();
  }
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down server...");

  // Close all WebSocket connections
  wss.clients.forEach((ws) => {
    ws.close();
  });

  // Destroy all documents
  documents.forEach((doc) => {
    doc.destroy();
  });

  server.close(() => {
    console.log("✅ Server closed gracefully");
    process.exit(0);
  });
});

// Error handling
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

const PORT = process.env.PORT || 1234;

server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server running at ws://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

export default server;
