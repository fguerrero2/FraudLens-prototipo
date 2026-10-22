import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class UpdateCaseDto {
  @IsIn(['open', 'investigating', 'resolved', 'closed'])
  status: string;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  assigned_to?: string;

  @IsOptional()
  @IsString()
  @Length(3, 2000)
  resolution?: string;
}