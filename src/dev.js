// `pnpm dev` entry point: sets DATA_DIR before importing the server, so local
// development uses a gitignored ./data folder instead of the production
// default (/data, the Fly volume). Keeping this as a separate file rather
// than a shell `VAR=value` prefix in package.json's "dev" script, since that
// syntax is POSIX-only and silently fails under Windows' cmd.exe.
process.env.DATA_DIR ??= "./data";
await import("./server.js");
