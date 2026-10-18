import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Matches, Min, Max } from 'class-validator';

export const PAYSIM_OPERATION_TYPES = ['CASH_IN', 'CASH_OUT', 'DEBIT', 'PAYMENT', 'TRANSFER'] as const;

export class CreateTransactionDto {
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;

  @IsString()
  @IsNotEmpty()
  transaction_id: string;

  @IsString()
  @IsNotEmpty()
  user_id: string;

  @IsISO8601()
  timestamp: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1000000000000)
  amount: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @Matches(/^[A-Z]{3}$/, { message: 'currency debe ser un codigo ISO 4217 de 3 letras (ej: ARS, USD)' })
  currency: string;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsString()
  @IsNotEmpty()
  merchant: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  channel: string;

  @IsOptional()
  @IsString()
  device_id?: string;

  // Campos opcionales estilo PaySim: senales extra para cuentas/billeteras
  // con saldo (transferencias, cash-in/out). Se usan solo cuando estan presentes.
  @IsOptional()
  @IsIn(PAYSIM_OPERATION_TYPES)
  operation_type?: (typeof PAYSIM_OPERATION_TYPES)[number];

  @IsOptional()
  @IsString()
  name_orig?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  old_balance_orig?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  new_balance_orig?: number;

  @IsOptional()
  @IsString()
  name_dest?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  old_balance_dest?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  new_balance_dest?: number;
}
