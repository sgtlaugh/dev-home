import { Router, Request, Response } from "express";
import os from "os";
import { execSync } from "child_process";

const router = Router();

function getDiskStats(): { free: number; total: number } {
  try {
    const output = execSync("df -B1 /", { encoding: "utf-8" });
    const lines = output.trim().split("\n");
    const parts = lines[1].split(/\s+/);
    return { total: parseInt(parts[1]), free: parseInt(parts[3]) };
  } catch {
    return { free: 0, total: 0 };
  }
}

function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const cpu of cpus) {
    for (const type of Object.values(cpu.times)) totalTick += type;
    totalIdle += cpu.times.idle;
  }
  return Math.round((1 - totalIdle / totalTick) * 100);
}

router.get("/stats", (_req: Request, res: Response) => {
  const mem = { free: os.freemem(), total: os.totalmem() };
  const disk = getDiskStats();
  const cpu = { usage: getCpuUsage() };
  res.json({ memory: mem, disk, cpu });
});

export default router;
