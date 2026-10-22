import { IsIn, IsString, Length } from 'class-validator';

export class CreateCaseDto {
  @IsIn(['low', 'normal', 'high', 'critical'])
  priority: string;

  @IsString()
  @Length(3, 2000)
  reason: string;
}
