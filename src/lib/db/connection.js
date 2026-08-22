import mongoose from "mongoose";

// Use global to survive Next.js dev hot-reload (module state resets on reload)
if (!global._mongooseConnection) {
  global._mongooseConnection = {
    conn: null,
    promise: null,
  };
}

const cached = global._mongooseConnection;

/**
 * Resolves MongoDB connection parameters from environment or defaults.
 * @returns {{ uri: string, dbName?: string, maxPoolSize: number, serverSelectionTimeoutMS: number }}
 */
export function getMongoConfig() {
  const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:29017/9router";
  const dbName = process.env.MONGODB_DB_NAME || undefined;
  const maxPoolSize = parseInt(process.env.MONGODB_MAX_POOL_SIZE || "20", 10);
  const serverSelectionTimeoutMS = parseInt(process.env.MONGODB_TIMEOUT_MS || "5000", 10);

  return {
    uri,
    dbName,
    maxPoolSize: isNaN(maxPoolSize) ? 20 : maxPoolSize,
    serverSelectionTimeoutMS: isNaN(serverSelectionTimeoutMS) ? 5000 : serverSelectionTimeoutMS,
  };
}

/**
 * Returns an established Mongoose connection singleton.
 * Thread-safe across hot-reloads and concurrent calls.
 * @returns {Promise<typeof mongoose>}
 */
export async function getConnection() {
  if (cached.conn && cached.conn.connection?.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const config = getMongoConfig();
    const opts = {
      bufferCommands: false,
      maxPoolSize: config.maxPoolSize,
      serverSelectionTimeoutMS: config.serverSelectionTimeoutMS,
    };

    if (config.dbName) {
      opts.dbName = config.dbName;
    }

    cached.promise = mongoose
      .connect(config.uri, opts)
      .then((m) => {
        cached.conn = m;
        return m;
      })
      .catch((err) => {
        cached.promise = null;
        cached.conn = null;
        throw err;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    cached.conn = null;
    throw e;
  }

  return cached.conn;
}

/**
 * Gracefully disconnects the Mongoose client and clears cached promises.
 * @returns {Promise<void>}
 */
export async function disconnectDb() {
  if (cached.conn) {
    await mongoose.disconnect();
    cached.conn = null;
    cached.promise = null;
  }
}
