import { Route } from '../http/router';
import { CreateCaseDto } from './dto/create-case.dto';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { QueryTransactionsDto } from './dto/query-transactions.dto';
import { ReviewTransactionDto } from './dto/review-transaction.dto';
import { UpdateCaseDto } from './dto/update-case.dto';
import { TransactionsService } from './transactions.service';

export const transactionsRoutes = (transactions: TransactionsService): Route[] => [
  // CU-01: recibido y analizado por el sistema cliente.
  { method: 'POST', path: '/transactions', summary: 'Registrar y analizar una transacción (CU-01); idempotente por transaction_id', permissions: ['transactions.create'], body: CreateTransactionDto, handler: ({ body, actor }) => transactions.create(body, actor ?? 'client') },
  // CU-05: listado del dashboard con filtros, orden y paginacion.
  { method: 'GET', path: '/transactions', summary: 'Listar transacciones con filtros, orden y paginación (CU-05)', permissions: ['transactions.read'], query: QueryTransactionsDto, handler: ({ query }) => transactions.findAll(query) },
  // Declared before :transactionId so "cases" is not read as an id.
  { method: 'GET', path: '/transactions/cases/list', summary: 'Bandeja de expedientes de fraude', permissions: ['transactions.read'], queryParams: [{ name: 'status', description: 'Filtra por estado del expediente', enum: ['open', 'investigating', 'resolved', 'closed'] }], handler: ({ query }) => transactions.getCases(query.status) },
  // CU-06: detalle completo de una transaccion.
  { method: 'GET', path: '/transactions/:transactionId', summary: 'Detalle completo de una transacción (CU-06)', permissions: ['transactions.read'], handler: ({ params }) => transactions.findOne(params.transactionId) },
  { method: 'PUT', path: '/transactions/:transactionId/review', summary: 'Registrar la revisión de un analista', permissions: ['transactions.review'], body: ReviewTransactionDto, handler: ({ params, body, actor }) => transactions.review(params.transactionId, body, actor ?? 'analyst') },
  { method: 'POST', path: '/transactions/:transactionId/case', summary: 'Abrir un expediente de fraude', permissions: ['transactions.review'], body: CreateCaseDto, handler: ({ params, body, actor }) => transactions.createCase(params.transactionId, body, actor ?? 'analyst') },
  { method: 'PUT', path: '/transactions/:transactionId/case', summary: 'Actualizar un expediente de fraude', permissions: ['transactions.review'], body: UpdateCaseDto, handler: ({ params, body, actor }) => transactions.updateCase(params.transactionId, body, actor ?? 'analyst') },
];
