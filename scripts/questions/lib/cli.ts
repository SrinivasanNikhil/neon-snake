export function parseArguments(argv: string[]): Map<string, string | true> {
  const argumentsMap = new Map<string, string | true>();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${argument}`);
    }

    const name = argument.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      argumentsMap.set(name, true);
      continue;
    }

    argumentsMap.set(name, next);
    index += 1;
  }
  return argumentsMap;
}

export function requireStringArgument(
  argumentsMap: Map<string, string | true>,
  name: string,
): string {
  const value = argumentsMap.get(name);
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing required --${name} argument.`);
  }
  return value.trim();
}

export function optionalStringArgument(
  argumentsMap: Map<string, string | true>,
  name: string,
): string | undefined {
  const value = argumentsMap.get(name);
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function integerArgument(
  argumentsMap: Map<string, string | true>,
  name: string,
  fallback?: number,
): number {
  const value = optionalStringArgument(argumentsMap, name);
  if (value === undefined && fallback !== undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`--${name} must be an integer.`);
  }
  return parsed;
}

export function reportCliError(error: unknown): never {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
