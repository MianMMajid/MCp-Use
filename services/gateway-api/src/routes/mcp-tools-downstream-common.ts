// zod v3/v4 compatibility shim — mcp-use internally expects zod v4 types
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const zodCompat = <T>(schema: T): any => schema;
