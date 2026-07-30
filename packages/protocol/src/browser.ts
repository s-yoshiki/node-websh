// Browser-only entry point. Kept separate so the server can typecheck against
// Node's lib without pulling DOM globals into scope.
export * from './websocket-transport.ts';
