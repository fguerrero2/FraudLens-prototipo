import { IsBoolean, IsNumber, IsOptional, IsString, Matches, MaxLength, Max, Min } from 'class-validator';

export class UpdateThresholdsDto {
  @IsOptional() @IsString() @MaxLength(100) timezone?: string;
  @IsOptional() @Matches(/^[A-Z]{3}$/) default_currency?: string;

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
