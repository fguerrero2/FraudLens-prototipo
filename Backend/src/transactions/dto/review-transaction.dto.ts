import { Transform } from 'class-transformer';
import { IsIn, IsString, Length } from 'class-validator';

export class ReviewTransactionDto {
  @IsIn(['fraud', 'legitimate', 'pending'])
  outcome: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(2, 100)
  analyst: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @Length(3, 2000)
  comment: string;
}
