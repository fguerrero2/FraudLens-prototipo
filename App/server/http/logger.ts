// Minimal replacement for the NestJS Logger: same calls, written to the platform log (Vercel or Docker).
export class Logger {
  constructor(private readonly context: string) {}
  log(message: string) { console.log(`[${this.context}] ${message}`); }
  warn(message: string) { console.warn(`[${this.context}] ${message}`); }
  error(message: string, detail?: string | Error) {
    const trace = detail instanceof Error ? detail.stack ?? detail.message : detail;
    console.error(`[${this.context}] ${message}${trace ? `\n${trace}` : ''}`);
  }
}
