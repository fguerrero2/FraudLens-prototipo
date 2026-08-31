import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  // CU-01: recibido y analizado por el sistema cliente.
  @Post()
  @Roles('client')
  create(@Body() dto: CreateTransactionDto) {
    return this.transactionsService.create(dto);
  }

  // CU-05: listado del dashboard con filtros, orden y paginacion.
  @Get()
  @Roles('analyst')
  findAll(@Query() query: QueryTransactionsDto) {
    return this.transactionsService.findAll(query);
  }

  // CU-06: detalle completo de una transaccion.
  @Get(':transactionId')
  @Roles('analyst')
  findOne(@Param('transactionId') transactionId: string) {
    return this.transactionsService.findOne(transactionId);
  }
}
