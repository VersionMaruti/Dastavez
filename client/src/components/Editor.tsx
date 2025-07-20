"use client";

import React, { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { EditorState, Plugin, PluginKey } from "prosemirror-state";
import { EditorView, Decoration, DecorationSet } from "prosemirror-view";
import { Schema } from "prosemirror-model";
import { baseKeymap } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { history, undo, redo } from "prosemirror-history";
import { ySyncPlugin, yCursorPlugin, yUndoPlugin } from "y-prosemirror";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Type,
  Heading1,
  Heading2,
  Heading3,
} from "lucide-react";
import "prosemirror-view/style/prosemirror.css";

// Enhanced schema with more formatting options
const schema = new Schema({
  nodes: {
    doc: {
      content: "block+",
    },
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: { align: { default: null } },
      parseDOM: [
        {
          tag: "p",
          getAttrs(dom: any) {
            return { align: dom.style.textAlign || null };
          },
        },
      ],
      toDOM(node) {
        const attrs: any = {};
        if (node.attrs.align) {
          attrs.style = `text-align: ${node.attrs.align}`;
        }
        return ["p", attrs, 0];
      },
    },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 1 }, align: { default: null } },
      defining: true,
      parseDOM: [
        { tag: "h1", attrs: { level: 1 } },
        { tag: "h2", attrs: { level: 2 } },
        { tag: "h3", attrs: { level: 3 } },
        { tag: "h4", attrs: { level: 4 } },
        { tag: "h5", attrs: { level: 5 } },
        { tag: "h6", attrs: { level: 6 } },
      ],
      toDOM(node) {
        const attrs: any = {};
        if (node.attrs.align) {
          attrs.style = `text-align: ${node.attrs.align}`;
        }
        return [`h${node.attrs.level}`, attrs, 0];
      },
    },
    text: {
      group: "inline",
    },
  },
  marks: {
    strong: {
      parseDOM: [
        { tag: "strong" },
        {
          tag: "b",
          getAttrs: (node: any) => node.style.fontWeight !== "normal" && null,
        },
      ],
      toDOM() {
        return ["strong", 0];
      },
    },
    em: {
      parseDOM: [{ tag: "i" }, { tag: "em" }],
      toDOM() {
        return ["em", 0];
      },
    },
    underline: {
      parseDOM: [{ tag: "u" }],
      toDOM() {
        return ["u", 0];
      },
    },
    code: {
      parseDOM: [{ tag: "code" }],
      toDOM() {
        return [
          "code",
          { class: "bg-gray-100 px-1 py-0.5 rounded text-sm font-mono" },
          0,
        ];
      },
    },
  },
});

interface ConnectedUser {
  name: string;
  color: string;
  cursor?: number;
}

interface EditorProps {
  docId: string;
  onUsersChange?: (users: ConnectedUser[]) => void;
  onConnectionChange?: (connected: boolean) => void;
}

// Plugin for tracking cursor positions
const cursorTrackingPlugin = new Plugin({
  key: new PluginKey("cursorTracking"),
  state: {
    init() {
      return DecorationSet.empty;
    },
    apply(tr, decorations) {
      return decorations.map(tr.mapping, tr.doc);
    },
  },
  props: {
    decorations(state) {
      return this.getState(state);
    },
  },
});

const Editor: React.FC<EditorProps> = ({
  docId,
  onUsersChange,
  onConnectionChange,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const [showToolbar, setShowToolbar] = useState(false);

  const generateRandomName = () => {
    const adjectives = [
      "Smart",
      "Creative",
      "Brilliant",
      "Quick",
      "Clever",
      "Wise",
      "Sharp",
    ];
    const animals = ["Fox", "Eagle", "Wolf", "Lion", "Bear", "Owl", "Hawk"];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const animal = animals[Math.floor(Math.random() * animals.length)];
    return `${adj} ${animal}`;
  };

  const generateRandomColor = () => {
    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#96CEB4",
      "#FFEAA7",
      "#DDA0DD",
      "#98D8C8",
      "#F7DC6F",
      "#BB8FCE",
      "#85C1E9",
      "#F8B500",
      "#FF9999",
      "#87CEEB",
      "#DDA0DD",
      "#20B2AA",
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const toggleMark = (markType: any) => {
    if (!viewRef.current) return;

    const { state, dispatch } = viewRef.current;
    const { from, to } = state.selection;

    if (from === to) return;

    const hasMark = markType.isInSet(
      state.doc.rangeHasMark(from, to, markType)
    );

    if (hasMark) {
      dispatch(state.tr.removeMark(from, to, markType));
    } else {
      dispatch(state.tr.addMark(from, to, markType.create()));
    }
  };

  const setHeading = (level: number) => {
    if (!viewRef.current) return;

    const { state, dispatch } = viewRef.current;
    const { from, to } = state.selection;

    const headingType = schema.nodes.heading;
    dispatch(state.tr.setBlockType(from, to, headingType, { level }));
  };

  const setParagraph = () => {
    if (!viewRef.current) return;

    const { state, dispatch } = viewRef.current;
    const { from, to } = state.selection;

    dispatch(state.tr.setBlockType(from, to, schema.nodes.paragraph));
  };

  const setAlignment = (align: string) => {
    if (!viewRef.current) return;

    const { state, dispatch } = viewRef.current;
    const { from, to } = state.selection;

    dispatch(state.tr.setNodeMarkup(from, undefined, { align }));
  };

  useEffect(() => {
    if (!editorRef.current) return;

    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(`ws://localhost:1234`, docId, ydoc);
    const yXmlFragment = ydoc.getXmlFragment("prosemirror");

    providerRef.current = provider;

    // Set up user identity
    const userName = generateRandomName();
    const userColor = generateRandomColor();

    provider.awareness.setLocalStateField("user", {
      name: userName,
      color: userColor,
    });

    // Selection tracking plugin - tracks cursor position changes
    const selectionTrackingPlugin = new Plugin({
      key: new PluginKey("selectionTracking"),
      view(editorView) {
        return {
          update: (view, prevState) => {
            const { from } = view.state.selection;
            const prevFrom = prevState.selection.from;

            // Only update if selection actually changed
            if (from !== prevFrom) {
              provider.awareness.setLocalStateField("cursor", { anchor: from });
            }
          },
        };
      },
    });

    // Connection status tracking
    provider.on("status", ({ status }: { status: string }) => {
      const connected = status === "connected";
      onConnectionChange?.(connected);
    });

    // User tracking
    provider.awareness.on("change", () => {
      const states = provider.awareness.getStates();
      const users: ConnectedUser[] = [];

      states.forEach((state, clientId) => {
        if (state.user && clientId !== provider.awareness.clientID) {
          users.push({
            name: state.user.name,
            color: state.user.color,
            cursor: state.cursor?.anchor,
          });
        }
      });

      onUsersChange?.(users);
    });

    // Create editor view
    const view = new EditorView(editorRef.current, {
      state: EditorState.create({
        schema,
        plugins: [
          ySyncPlugin(yXmlFragment),
          yCursorPlugin(provider.awareness, {
            cursorBuilder: (user: any) => {
              const cursor = document.createElement("span");
              cursor.className = "prosemirror-cursor";
              cursor.style.cssText = `
                border-left: 2px solid ${user.color};
                position: relative;
                margin-left: -1px;
                height: 1.2em;
                display: inline-block;
                animation: cursorBlink 1s infinite;
              `;

              const label = document.createElement("div");
              label.textContent = user.name;
              label.style.cssText = `
                position: absolute;
                top: -28px;
                left: -4px;
                background-color: ${user.color};
                color: white;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: 500;
                white-space: nowrap;
                pointer-events: none;
                z-index: 1000;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              `;

              cursor.appendChild(label);
              return cursor;
            },
            selectionBuilder: (user: any) => {
              return {
                style: `background-color: ${user.color}30; border-radius: 2px;`,
              };
            },
          }),
          selectionTrackingPlugin, // Add the selection tracking plugin
          yUndoPlugin(),
          history(),
          cursorTrackingPlugin,
          keymap({
            "Mod-z": undo,
            "Mod-y": redo,
            "Mod-Shift-z": redo,
            "Mod-b": () => {
              toggleMark(schema.marks.strong);
              return true;
            },
            "Mod-i": () => {
              toggleMark(schema.marks.em);
              return true;
            },
            "Mod-u": () => {
              toggleMark(schema.marks.underline);
              return true;
            },
          }),
          keymap(baseKeymap),
        ],
      }),
      attributes: {
        class: "prosemirror-editor",
        spellcheck: "true",
      },
      handleKeyDown: (view, event) => {
        // Update cursor position for awareness on key events
        setTimeout(() => {
          const { from } = view.state.selection;
          provider.awareness.setLocalStateField("cursor", { anchor: from });
        }, 0);
        return false;
      },
      handleClick: (view) => {
        const { from } = view.state.selection;
        provider.awareness.setLocalStateField("cursor", { anchor: from });
        setShowToolbar(true);
        return false;
      },
      // Use handleDOMEvents for additional DOM event handling if needed
      handleDOMEvents: {
        mouseup: (view, event) => {
          const { from } = view.state.selection;
          provider.awareness.setLocalStateField("cursor", { anchor: from });
          return false;
        },
      },
    });

    viewRef.current = view;

    // Focus the editor
    setTimeout(() => view.focus(), 100);

    return () => {
      view.destroy();
      provider.destroy();
      ydoc.destroy();
    };
  }, [docId, onUsersChange, onConnectionChange]);

  return (
    <div className="relative">
      {/* Floating Toolbar */}
      {showToolbar && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex items-center space-x-1 z-50">
          {/* Text Formatting */}
          <button
            onClick={() => toggleMark(schema.marks.strong)}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            onClick={() => toggleMark(schema.marks.em)}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            title="Italic (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            onClick={() => toggleMark(schema.marks.underline)}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            title="Underline (Ctrl+U)"
          >
            <Underline className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-gray-300 mx-2" />

          {/* Headings */}
          <button
            onClick={setParagraph}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            title="Normal Text"
          >
            <Type className="w-4 h-4" />
          </button>
          <button
            onClick={() => setHeading(1)}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            title="Heading 1"
          >
            <Heading1 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setHeading(2)}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            title="Heading 2"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setHeading(3)}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            title="Heading 3"
          >
            <Heading3 className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-gray-300 mx-2" />

          {/* Alignment */}
          <button
            onClick={() => setAlignment("left")}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            title="Align Left"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setAlignment("center")}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            title="Align Center"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            onClick={() => setAlignment("right")}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
            title="Align Right"
          >
            <AlignRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Editor Container */}
      <div
        ref={editorRef}
        className="prosemirror-container"
        style={{
          minHeight: "800px",
          padding: "96px",
          lineHeight: "1.6",
          fontSize: "14px",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
          outline: "none",
          wordWrap: "break-word",
          backgroundColor: "white",
        }}
      />

      <style jsx global>{`
        .prosemirror-editor {
          outline: none !important;
          border: none !important;
          min-height: 800px;
          word-wrap: break-word;
          overflow-wrap: break-word;
          white-space: pre-wrap;
          line-height: 1.6;
        }

        .prosemirror-editor p {
          margin: 0 0 16px 0;
          line-height: 1.6;
        }

        .prosemirror-editor p:last-child {
          margin-bottom: 0;
        }

        .prosemirror-editor h1,
        .prosemirror-editor h2,
        .prosemirror-editor h3,
        .prosemirror-editor h4,
        .prosemirror-editor h5,
        .prosemirror-editor h6 {
          font-weight: 600;
          margin: 24px 0 16px 0;
          line-height: 1.3;
        }

        .prosemirror-editor h1 {
          font-size: 28px;
        }
        .prosemirror-editor h2 {
          font-size: 24px;
        }
        .prosemirror-editor h3 {
          font-size: 20px;
        }
        .prosemirror-editor h4 {
          font-size: 18px;
        }
        .prosemirror-editor h5 {
          font-size: 16px;
        }
        .prosemirror-editor h6 {
          font-size: 14px;
        }

        .prosemirror-editor strong {
          font-weight: 600;
        }

        .prosemirror-editor em {
          font-style: italic;
        }

        .prosemirror-editor u {
          text-decoration: underline;
        }

        .prosemirror-editor code {
          background-color: #f3f4f6;
          padding: 2px 4px;
          border-radius: 3px;
          font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono",
            Consolas, "Courier New", monospace;
          font-size: 13px;
        }

        /* Cursor animations */
        @keyframes cursorBlink {
          0%,
          50% {
            opacity: 1;
          }
          51%,
          100% {
            opacity: 0.3;
          }
        }

        .prosemirror-cursor {
          animation: cursorBlink 1s infinite;
        }

        /* Selection styles */
        .ProseMirror .collaboration-cursor__selection {
          pointer-events: none;
          user-select: none;
          border-radius: 2px;
        }

        /* Focus styles */
        .prosemirror-container:focus-within {
          outline: none;
        }

        /* Placeholder styles */
        .prosemirror-editor .ProseMirror-focused:empty:before {
          content: "Start typing...";
          color: #9ca3af;
          pointer-events: none;
          position: absolute;
        }
      `}</style>
    </div>
  );
};

export default Editor;
