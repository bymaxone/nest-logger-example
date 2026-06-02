/**
 * Tasks module — registers the tasks controller and service.
 *
 * @module
 */
import { Module } from '@nestjs/common'

import { TasksController } from './tasks.controller.js'
import { TasksService } from './tasks.service.js'

@Module({ controllers: [TasksController], providers: [TasksService] })
export class TasksModule {}
