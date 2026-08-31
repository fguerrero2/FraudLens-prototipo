import { IsBoolean, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateThresholdsDto {
  @IsOptional()
  @IsBoolean()
  min_amount_enabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  review_threshold?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  block_threshold?: number;
}
