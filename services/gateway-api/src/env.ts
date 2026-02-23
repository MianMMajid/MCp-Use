export type AppEnv = {
  Variables: {
    requestId: string;
    keyFingerprint: string;
    userId?: string;
    username?: string;
    sessionId?: string;
  };
};
