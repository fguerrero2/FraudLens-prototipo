import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CreateCaseDto } from './dto/create-case.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { ReviewTransactionDto } from './dto/review-transaction.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // CU-01: recibido y analizado por el sistema cliente.
  @Post()
  @Permissions('transactions.create')
  create(@Body() dto: CreateTransactionDto, @Req() request: Request & { actor?: string }) {
    return this.transactionsService.create(dto, request.actor ?? 'client');
  }

  // CU-05: listado del dashboard con filtros, orden y paginacion.
  @Get()
  @Permissions('transactions.read')
  findAll(@Query() query: QueryTransactionsDto) {
    return this.transactionsService.findAll(query);
  }

  @Get('cases/list')
  @Permissions('transactions.read')
  getCases(@Query('status') status?: string) {
    return this.transactionsService.getCases(status);
  }

  // CU-06: detalle completo de una transaccion.
  @Get(':transactionId')
  @Permissions('transactions.read')
  findOne(@Param('transactionId') transactionId: string) {
    return this.transactionsService.findOne(transactionId);
  }
  @Put(':transactionId/review')
  @Permissions('transactions.review')
  review(@Param('transactionId') transactionId: string, @Body() dto: ReviewTransactionDto, @Req() request: Request & { actor?: string }) {
    return this.transactionsService.review(transactionId, dto, request.actor ?? 'analyst');
  }

  @Post(':transactionId/case')
  @Permissions('transactions.review')
  createCase(@Param('transactionId') transactionId: string, @Body() dto: CreateCaseDto, @Req() request: Request & { actor?: string }) {
    return this.transactionsService.createCase(transactionId, dto, request.actor ?? 'analyst');
  }

  @Put(':transactionId/case')
  @Permissions('transactions.review')
  updateCase(@Param('transactionId') transactionId: string, @Body() dto: UpdateCaseDto, @Req() request: Request & { actor?: string }) {
    return this.transactionsService.updateCase(transactionId, dto, request.actor ?? 'analyst');
  }

}
