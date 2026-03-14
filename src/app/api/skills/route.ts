import { NextResponse } from "next/server";
import { getActiveSkills } from "@/lib/db";

export async function GET() {
  try {
    const skills = await getActiveSkills();
    return NextResponse.json(skills);
  } catch (error) {
    console.error("GET /api/skills error:", error);
    return NextResponse.json(
      { error: "Failed to fetch skills" },
      { status: 500 }
    );
  }
}
