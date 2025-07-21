# Real-Time Collaborative Document Editor Using CRDT

## 📌 Introduction

In today's digital world, real-time collaboration is essential in online document editors (like Google Docs, Notion, etc.). One of the core technologies enabling this collaboration is **CRDT (Conflict-Free Replicated Data Type)**.

This project (or guide) explains:
- What CRDT is and how it works.
- How CRDT can be used to build collaborative document editors.
- How to implement real-time syncing using the **Yjs** library (a powerful CRDT implementation for JavaScript).
- Advanced concepts like awareness, offline editing, and syncing via WebRTC or WebSocket.

---

## 🧠 What is CRDT?

**CRDT (Conflict-Free Replicated Data Type)** is a data structure designed for **distributed systems** where **concurrent changes** are made independently and then merged automatically without conflicts.

### ✅ Key Properties
- **Conflict-free**: Concurrent edits never conflict.
- **Eventually Consistent**: All replicas converge to the same state.
- **No Central Server Needed**: CRDTs can sync peer-to-peer or server-client.

### 📘 Example Use Case
In collaborative text editing:
- User A types "Hello"
- User B types "World"
- Both changes are merged automatically as "HelloWorld" or "WorldHello" (depending on timestamp/ordering logic).

---

## 🛠️ Using CRDT for Online Document Collaboration

### Why CRDT in Documents?
In online document editors, multiple users might:
- Type, delete, or format text at the same time.
- Add/remove sections.
- Work offline and later sync changes.

CRDT ensures that:
- All updates are preserved.
- Document state remains consistent across users.
- No data is lost or overwritten.

---

## 📚 Yjs: A CRDT Framework for JavaScript

[Yjs](https://yjs.dev/) is a high-performance CRDT implementation that supports shared editing in real-time.

### 🔧 Features of Yjs
- Shared text editing (`Y.Text`)
- Real-time syncing with WebSocket, WebRTC, IndexedDB
- Offline support and sync when back online
- Awareness API (user presence, cursors)
- Rich integrations (TipTap, CodeMirror, ProseMirror, Slate, Quill)

---

## 🧪 Basic Example (Yjs + WebSocket)

```bash
npm install yjs y-websocket
