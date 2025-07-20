declare module "y-websocket/bin/utils" {
  import * as http from "http";
  import WebSocket from "ws";
  import { Awareness } from "y-protocols/awareness";

  export function setupWSConnection(
    conn: WebSocket,
    req: http.IncomingMessage,
    options?: {
      docName?: string;
      gc?: boolean;
      awareness?: Awareness;
    }
  ): void;
}
