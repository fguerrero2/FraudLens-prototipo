// HTTP errors with the same names and response bodies NestJS produced, so services and
// clients (web and mobile) keep working unchanged after leaving NestJS.
type Body = string | Record<string, unknown>;

export class HttpException extends Error {
  constructor(private readonly body: Body, private readonly status: number) {
    super(typeof body === 'string' ? body : String(body.message ?? 'Http Exception'));
  }
  getStatus() { return this.status; }
  getResponse() { return this.body; }
}

const build = (body: Body | undefined, status: number, error: string): Body =>
  typeof body === 'object' ? body : { message: body ?? error, error, statusCode: status };

export class BadRequestException extends HttpException { constructor(body?: Body) { super(build(body, 400, 'Bad Request'), 400); } }
export class UnauthorizedException extends HttpException { constructor(body?: Body) { super(build(body, 401, 'Unauthorized'), 401); } }
export class ForbiddenException extends HttpException { constructor(body?: Body) { super(build(body, 403, 'Forbidden'), 403); } }
export class NotFoundException extends HttpException { constructor(body?: Body) { super(build(body, 404, 'Not Found'), 404); } }
export class ConflictException extends HttpException { constructor(body?: Body) { super(build(body, 409, 'Conflict'), 409); } }
