const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function proxy(request, { params }) {
  try {
    const { path } = await params;
    const url = `${BACKEND_URL}/${path.join("/")}`;

    const contentType = request.headers.get("content-type") || "";

    let body;
    let forwardHeaders = {};

    for (const [key, value] of request.headers.entries()) {
      if (!["host", "content-length", "transfer-encoding", "connection"].includes(key)) {
        forwardHeaders[key] = value;
      }
    }

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      // Re-build as FormData so fetch sets correct boundary automatically
      const newForm = new FormData();
      for (const [key, value] of formData.entries()) {
        newForm.append(key, value);
      }
      body = newForm;
      delete forwardHeaders["content-type"];
    } else if (contentType.includes("application/json")) {
      body = await request.text();
      forwardHeaders["content-type"] = "application/json";
    } else if (request.method !== "GET" && request.method !== "HEAD") {
      body = await request.blob();
      if (contentType) forwardHeaders["content-type"] = contentType;
    }

    const backendRes = await fetch(url, {
      method: request.method,
      headers: forwardHeaders,
      body,
    });

    const responseHeaders = {};
    for (const [key, value] of backendRes.headers.entries()) {
      if (!["transfer-encoding", "connection"].includes(key)) {
        responseHeaders[key] = value;
      }
    }

    return new Response(backendRes.body, {
      status: backendRes.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("[proxy] error:", err);
    return new Response(
      JSON.stringify({ detail: `Proxy error: ${err.message}` }),
      { status: 502, headers: { "content-type": "application/json" } }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
