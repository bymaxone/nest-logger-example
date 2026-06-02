/**
 * PII-demo controller — surfaces PII fields for library redaction validation.
 *
 * @module
 */
import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common'

import { signupSchema } from './dto/signup.dto.js'
import { PiiDemoService } from './pii-demo.service.js'

/** REST controller exposing PII-bearing demo endpoints. */
@Controller('pii-demo')
export class PiiDemoController {
  constructor(private readonly pii: PiiDemoService) {}

  /**
   * Log a signup payload containing default-redact PII fields.
   *
   * @param body - Raw request body validated against {@link signupSchema}.
   * @returns Constant ok response.
   */
  @Post('signup')
  signup(@Body() body: unknown) {
    return this.pii.signup(signupSchema.parse(body))
  }

  /**
   * Log a payload that mixes a custom redact path, a nested custom path, and a default
   * field — proving `redactPaths` MERGES with (never replaces) the 97 defaults.
   *
   * @returns Constant ok response.
   */
  @Post('webhook')
  @HttpCode(201)
  webhook() {
    return this.pii.webhook()
  }

  /**
   * Log a payload with `cardNumber` at depths 1–5 to expose the depth-4/5 boundary.
   *
   * @returns Constant ok response.
   */
  @Post('nested')
  nested() {
    return this.pii.nested()
  }

  /**
   * Echo request headers so the library redacts `authorization`, `x-api-key`, `set-cookie`.
   *
   * @param headers - All incoming request headers.
   * @returns Constant ok response.
   */
  @Get('echo-headers')
  echoHeaders(@Headers() headers: Record<string, string>) {
    return this.pii.echoHeaders(headers)
  }

  /**
   * Log a >64 KiB object to trigger `LOGGER_ENTRY_TRUNCATED`.
   *
   * @returns Constant ok response.
   */
  @Post('huge')
  huge() {
    return this.pii.huge()
  }
}
