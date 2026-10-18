import { IsArray, IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
export class CreateTenantDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(80) slug: string;
}
export class UpdateTenantDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsIn(['active', 'suspended']) status?: string;
  @IsOptional() @IsString() @MaxLength(40) plan?: string;
}
export class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsString() @MinLength(12) @MaxLength(256) password: string;
  @IsUUID() role_id: string;
}
export class MembershipDto {
  @IsEmail() email: string;
  @IsUUID() role_id: string;
}
export class UpdateMembershipDto {
  @IsOptional() @IsUUID() role_id?: string;
  @IsOptional() @IsIn(['active', 'disabled']) status?: string;
}
export class CreateRoleDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsArray() @IsString({ each: true }) permissions: string[];
}
export class CreateApiClientDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsArray() @IsString({ each: true }) permissions: string[];
}

export class RenameTenantDto { @IsString() @MinLength(2) @MaxLength(120) name: string; }
