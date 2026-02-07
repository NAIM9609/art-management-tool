import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://giorgiopriviteralab.com:8080';

/**
 * Proxy all /api/shop requests to backend, handling cookies properly
 * This is needed because Next.js rewrites don't forward Set-Cookie headers
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  return proxyRequest(request, resolvedParams.path, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  return proxyRequest(request, resolvedParams.path, 'POST');
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  return proxyRequest(request, resolvedParams.path, 'PATCH');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params;
  return proxyRequest(request, resolvedParams.path, 'DELETE');
}

async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
  method: string
) {
  try {
    const path = pathSegments.join('/');
    const url = `${BACKEND_URL}/api/shop/${path}`;
    
    // Get search params from original request
    const searchParams = request.nextUrl.searchParams.toString();
    const fullUrl = searchParams ? `${url}?${searchParams}` : url;
    
    console.log(`🔄 Proxying ${method} ${fullUrl}`);
    console.log(`🍪 Incoming cookies: ${request.headers.get('cookie') || 'none'}`);
    console.log(`🍪 Incoming session header: ${request.headers.get('x-cart-session') || 'none'}`);
    
    // Forward cart_session cookie to backend
    const cartSession = request.cookies.get('cart_session');
    const sessionHeader = request.headers.get('x-cart-session');
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    // Use cookie first, then header as fallback
    const sessionToken = cartSession?.value || sessionHeader;
    
    if (sessionToken) {
      headers['Cookie'] = `cart_session=${sessionToken}`;
      console.log(`🍪 Forwarding session token: ${sessionToken.substring(0, 20)}... (source: ${cartSession ? 'cookie' : 'header'})`);
    } else {
      console.log(`🍪 No session token found in request`);
    }
    
    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method,
      headers,
    };
    
    // Add body for POST/PATCH requests
    if (method === 'POST' || method === 'PATCH') {
      const body = await request.text();
      if (body) {
        fetchOptions.body = body;
      }
    }
    
    // Forward request to backend
    const response = await fetch(fullUrl, fetchOptions);
    
    // Get response body
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }
    
    // Create Next.js response
    const nextResponse = NextResponse.json(data, { status: response.status });
    
    // Forward Set-Cookie header from backend to browser
    const setCookieHeader = response.headers.get('set-cookie');
    if (setCookieHeader) {
      console.log(`🍪 Setting cookie from backend: ${setCookieHeader.substring(0, 50)}...`);
      
      // Parse cookie to set it properly
      const cookieParts = setCookieHeader.split(';');
      const [nameValue] = cookieParts;
      const [name, value] = nameValue.split('=');
      
      // Extract MaxAge if present
      let maxAge = 86400 * 7; // default 7 days
      const maxAgeMatch = setCookieHeader.match(/Max-Age=(\d+)/i);
      if (maxAgeMatch) {
        maxAge = parseInt(maxAgeMatch[1]);
      }
      
      // Set cookie in Next.js response with relaxed settings for development
      nextResponse.cookies.set({
        name: name.trim(),
        value: value.trim(),
        maxAge,
        path: '/',
        httpOnly: false, // Allow JavaScript access for development
        secure: false,   // Allow over HTTP for development  
        sameSite: 'lax',
      });
      
      console.log(`🍪 Cookie set: ${name.trim()}=${value.trim().substring(0, 20)}... (${maxAge}s)`);
    }
    
    console.log(`✅ Proxy completed: ${response.status}`);
    return nextResponse;
    
  } catch (error) {
    console.error('❌ Proxy error:', error);
    return NextResponse.json(
      { error: 'Internal proxy error', details: String(error) },
      { status: 500 }
    );
  }
}
