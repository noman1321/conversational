const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

async function proxy(request, { params }) {
  const { path } = await params;
  const url = `${BACKEND_URL}/${path.join("/")}`;

  const contentType = request.headers.get("content-type") || "";

  let body;
  let forwardHeaders = {};

  for (const [key, value] of request.headers.entries()) {
    if (!["host", "content-length", "transfer-encoding", "content-type"].includes(key)) {
      forwardHeaders[key] = value;
    }
  }

  if (contentType.includes("multipart/form-data")) {
    body = await request.formData();
    // Do NOT set content-type — fetch sets it automatically with the correct boundary
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
    responseHeaders[key] = value;
  }

  return new Response(backendRes.body, {
    status: backendRes.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
