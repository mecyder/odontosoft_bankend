import { Module } from '@nestjs/common';
import { ClientsService } from './services/clients.service';
import { clientsProviders } from './clients.providers';
import { DatabaseModule } from '../database/database.module';
import { ClientsController } from './controllers/clients.controller';
import { CompanyModule } from '../company/company.module';
import { DoctorModule } from '../doctor/doctor.module';

@Module({
  imports: [DatabaseModule, CompanyModule, DoctorModule],
  exports: [ClientsService],
  providers: [...clientsProviders, ClientsService],
  controllers: [ClientsController],
})
export class ClientsModule { }
