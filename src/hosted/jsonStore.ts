import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export class JsonStore<T> {
  constructor(private readonly filePath: string) {
    mkdirSync(path.dirname(filePath), { recursive: true });
  }

  private readAll(): Record<string, T> {
    if (!existsSync(this.filePath)) return {};
    return JSON.parse(readFileSync(this.filePath, "utf8")) as Record<string, T>;
  }

  private writeAll(data: Record<string, T>): void {
    writeFileSync(this.filePath, JSON.stringify(data, null, 2), { mode: 0o600 });
  }

  get(key: string): T | undefined {
    return this.readAll()[key];
  }

  set(key: string, value: T): void {
    const data = this.readAll();
    data[key] = value;
    this.writeAll(data);
  }

  delete(key: string): void {
    const data = this.readAll();
    delete data[key];
    this.writeAll(data);
  }

  findEntry(predicate: (value: T) => boolean): [string, T] | undefined {
    const data = this.readAll();
    const entry = Object.entries(data).find(([, value]) => predicate(value));
    return entry;
  }
}
