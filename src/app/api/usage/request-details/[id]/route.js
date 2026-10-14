import { NextResponse } from "next/server";
import { getRequestDetailById } from "@/lib/usageDb";
import { verifyDashboardAuthToken } from "@/lib/auth/dashboardSession";
import { getSettings } from "@/lib/localDb";

export const dynamic = "force-dynamic";

function getAuthToken(request) {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/);
  if (m) {
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
  }
  const auth = request.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

export async function GET(request, { params }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const settings = await getSettings().catch(() => ({}));
  const requireLogin = settings?.requireLogin !== false;

  const token = getAuthToken(request);
  const ok = token ? await verifyDashboardAuthToken(token) : false;
  if (!ok && requireLogin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized — enableObservability payloads require dashboard login" }, { status: 401 });
  }

  const detail = await getRequestDetailById(decodeURIComponent(id));
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ detail });
}
