export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { bootstrapApplication } = await import("@/lib/app/bootstrap");
      await bootstrapApplication();
    } catch (error) {
      console.error("daily-arxiv bootstrap failed", error);
    }
  }
}
