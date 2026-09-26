import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/bot-zip")({
  server: {
    handlers: {
      GET: async () => {
        const buf = await readFile(join(process.cwd(), "public", "lagforge-bot.zip"));
        return new Response(buf, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": 'attachment; filename="lagforge-bot.zip"',
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
