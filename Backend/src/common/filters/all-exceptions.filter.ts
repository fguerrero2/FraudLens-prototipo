import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : 500;
    const body = isHttp ? exception.getResponse() : { message: 'Error interno del servidor' };

    if (!isHttp) {
      this.logger.error(`Error no controlado en ${request.method} ${request.url}`, (exception as Error)?.stack);
    } else if (status >= 500) {
      this.logger.error(`${request.method} ${request.url} -> ${JSON.stringify(body)}`);
    }

    const payload = typeof body === 'string' ? { message: body } : body;

    response.status(status).json({
      statusCode: status,
      ...(typeof payload === 'object' ? payload : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
