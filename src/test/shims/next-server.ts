export class NextRequest extends Request {
  nextUrl: URL;

  constructor(input: string | URL | Request, init?: RequestInit) {
    super(input, init);
    this.nextUrl = new URL(this.url);
  }
}

export class NextResponse extends Response {
  static json(body: unknown, init?: ResponseInit): NextResponse {
    const headers = new Headers(init?.headers);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    return new NextResponse(JSON.stringify(body), {
      ...init,
      headers,
    });
  }
}
