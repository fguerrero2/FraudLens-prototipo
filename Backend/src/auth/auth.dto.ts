import { IsEmail, IsString, MinLength, MaxLength, IsUUID } from 'class-validator';
export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) @MaxLength(256) password: string;
}
export class RefreshDto { @IsString() @MinLength(20) @MaxLength(256) refresh_token: string; }
export class SelectTenantDto { @IsUUID() tenant_id: string; }
export class AuthorizeQrDto { @IsString() @MinLength(10) @MaxLength(256) challenge_id: string; }
