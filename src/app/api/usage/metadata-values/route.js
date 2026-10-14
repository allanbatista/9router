import { NextResponse } from "next/server";
import { getDistinctMetadataValues } from "@/lib/usageDb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/usage/metadata-values?key=<key>
 * Returns distinct values for a given agentMetadata key.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key || typeof key !== "string" || !key.trim()) {
      return NextResponse.json(
        { error: "Missing required query parameter 'key'" },
        { status: 400 }
      );
    }

    const trimmedKey = key.trim();
    const validKeyRegex = /^[a-zA-Z0-9_-]+$/;
    if (!validKeyRegex.test(trimmedKey)) {
      return NextResponse.json(
        { error: `Invalid key name: "${trimmedKey}". Allowed: letters, numbers, hyphens, underscores.` },
        { status: 400 }
      );
    }

    const values = await getDistinctMetadataValues(trimmedKey);
    return NextResponse.json({ key: trimmedKey, values });
  } catch (error) {
    console.error("[API] Failed to get distinct metadata values:", error);
    return NextResponse.json(
      { error: "Failed to fetch metadata values" },
      { status: 500 }
    );
  }
}
