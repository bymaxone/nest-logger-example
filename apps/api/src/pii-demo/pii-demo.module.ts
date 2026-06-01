/**
 * PII-demo feature module.
 *
 * @module
 */
import { Module } from '@nestjs/common'

import { PiiDemoController } from './pii-demo.controller.js'
import { PiiDemoService } from './pii-demo.service.js'

/** Encapsulates the PII-demo endpoints for library redaction validation. */
@Module({ controllers: [PiiDemoController], providers: [PiiDemoService] })
export class PiiDemoModule {}
