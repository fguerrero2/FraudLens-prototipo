import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { Public } from '../common/decorators/permissions.decorator';
import { AuthService } from './auth.service';
import { AuthorizeQrDto, LoginDto, RefreshDto, SelectTenantDto } from './auth.dto';
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public() @Post('login') login(@Body() dto: LoginDto) { return this.auth.login(dto.email, dto.password); }
  @Public() @Post('refresh') refresh(@Body() dto: RefreshDto) { return this.auth.refresh(dto.refresh_token); }
  @Public() @Post('qr/challenge') createQrChallenge() { return this.auth.createQrChallenge(); }
  @Post('qr/authorize') authorizeQrChallenge(@Req() req, @Body() dto: AuthorizeQrDto) { return this.auth.authorizeQrChallenge(req.identity, dto.challenge_id); }
  @Public() @Get('qr/status/:id') getQrChallengeStatus(@Param('id') id: string) { return this.auth.getQrChallengeStatus(id); }
  @Get('me') me(@Req() req) { return this.auth.profile(req.identity.userId, req.identity.tenantId ?? null); }
  @Post('tenant') tenant(@Req() req, @Body() dto: SelectTenantDto) { return this.auth.selectTenant(req.identity, dto.tenant_id); }
  @Post('logout') logout(@Req() req) { return this.auth.logout(req.identity); }
}
