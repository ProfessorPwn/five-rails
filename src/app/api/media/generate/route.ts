import { NextRequest, NextResponse } from "next/server";
import { getConnections } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const prompt = body.prompt as string;

    if (!prompt?.trim()) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Find an OpenAI-compatible connection for image generation
    const connections = getConnections();
    const openaiConn = connections.find(
      (c) => (c.provider === "openai" || c.base_url?.includes("openai")) && c.api_key_encrypted
    );

    if (!openaiConn) {
      return NextResponse.json({
        error: "No OpenAI connection found. Add an OpenAI connection in Settings to enable image generation.",
        hint: "Image generation requires an OpenAI API key with DALL-E access.",
      }, { status: 503 });
    }

    const baseUrl = openaiConn.base_url || "https://api.openai.com";

    const res = await fetch(`${baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiConn.api_key_encrypted}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `Create a professional, eye-catching social media image for this topic: ${prompt.slice(0, 500)}. Style: clean, modern, high-contrast, suitable for Instagram. No text overlays.`,
        n: 1,
        size: "1024x1024",
        quality: "standard",
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      // If DALL-E not available, suggest alternatives
      if (res.status === 404 || err.includes("model")) {
        return NextResponse.json({
          error: "DALL-E not available on this API key. You can paste an image URL manually instead.",
          hint: "Use Canva, Unsplash, or any image hosting service to get an image URL.",
        }, { status: 503 });
      }
      return NextResponse.json({ error: `Image generation failed: ${err.slice(0, 200)}` }, { status: 500 });
    }

    const data = await res.json();
    const imageUrl = data.data?.[0]?.url;

    if (!imageUrl) {
      return NextResponse.json({ error: "No image returned from API" }, { status: 500 });
    }

    return NextResponse.json({ url: imageUrl, prompt: prompt.slice(0, 200) });
  } catch (error) {
    console.error("POST /api/media/generate error:", error);
    return NextResponse.json({ error: "Image generation failed" }, { status: 500 });
  }
}
