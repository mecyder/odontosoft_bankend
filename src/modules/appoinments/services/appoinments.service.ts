import { Injectable, Inject, HttpStatus } from '@nestjs/common';
import { Appointment } from 'src/modules/database/entities';
import { Repository } from 'typeorm';
import { IADD } from '../dtos';
import { IResponse } from 'src/shared/interfaces/response';
import * as moment from 'moment';
import { ClientsService } from 'src/modules/clients/services/clients.service';
import { appoimentsStatus } from 'src/shared/enums/appoiments-status.enum';
import { CompanyService } from 'src/modules/company/services/company.service';
import { DoctorService } from 'src/modules/doctor/service/service.service';
import { UPDATE_TYPE } from '../enums/update.enum';
import { EmailService } from 'src/modules/email/Service/email.service';
import { TemplateService } from 'src/modules/templates/services/service';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';

@Injectable()
export class AppoinmentsService {
  constructor(
    @Inject('APPOINMENT_REPOSITORY')
    private appoinmentRepository: Repository<Appointment>,
    private readonly clientService: ClientsService,
    private readonly companyService: CompanyService,
    private readonly doctorService: DoctorService,
    private readonly emailService: EmailService,
    private readonly templateService: TemplateService,
  ) { }
  async add(appoimentDto: IADD, companyId: number, createBy: number) {
    const response: IResponse<any> = { success: false };
    await this.appoinmentRepository.createQueryBuilder(
      `SET TimeZone = 'America/Santo_Domingo'`,
    );
    try {
      if (!appoimentDto) {
        return (response.errors = [
          {
            code: 400,
            message: 'debes complatar los campos',
            razon: 'modelo invalido',
          },
        ]);
      }
      if (!appoimentDto.clientId) {
        response.errors = [
          {
            code: 400,
            message: 'debes complatar los campos',
            razon: 'modelo invalido, falta el cliente para reservar cita',
          },
        ];
        return response;
      }
      const CLIENT = await this.clientService.findById(
        appoimentDto.clientId,
        companyId,
      );
      if (!CLIENT) {
        response.errors = [
          {
            code: HttpStatus.NOT_FOUND,
            message: 'Paciente no encontrado',
            razon: 'Este paciente no se encuentra registrado en base de datos',
          },
        ];
      }

      const DOCTOR = await this.doctorService.getById(
        appoimentDto.doctorId,
        companyId,
      );
      if (!DOCTOR) {
        response.errors = [
          {
            code: HttpStatus.NOT_FOUND,
            message: 'Doctor no encontrado',
            razon: 'Este doctor no se encuentra registrado en base de datos',
          },
        ];
      }

      const company = await this.companyService.findOneEntity(companyId);
      const duration = moment.duration(1, 'hour');

      const appoimentToCreate = {
        client: CLIENT.data,
        createBy: createBy,
        createAt: moment(Date.now()).toDate(),
        end: moment(appoimentDto.date).format('YYYY-MM-DDTHH:mm:ss'),
        endTime: moment(appoimentDto.hour, 'hh:mm A')
          .add(duration)
          .format('hh:mm A'),
        reason: appoimentDto.reason,
        status: true,
        start: moment(appoimentDto.date).format('YYYY-MM-DDTHH:mm:ss'),
        title: `${CLIENT.data.name}`,
        startTime: moment(appoimentDto.hour, 'hh:mm A').format('hh:mm A'),
        doctor: DOCTOR.data,
        company,
      };
      console.log(`payload enviado ${appoimentToCreate}`);

      const appoimentCreate = await this.appoinmentRepository.create(
        appoimentToCreate,
      );
      const CREATED = await this.appoinmentRepository.save(appoimentCreate);
      if (CREATED) {
        response.success = true;
        response.data = CREATED;
        response.total = 1;
        const template = await this.templateService.findByName(
          'appoinment_new',
          3,
        );

        if (template) {
          const templateModify = template.data.contenido
            .replace('{{@Nombre}}', CREATED.client.name)
            .replace('{{@Fecha}}', appoimentDto.date.toString())
            .replace('{{@Hora}}', CREATED.startTime)
            .replace('{{@doctorNombre}}', CREATED.doctor.name);

          const emailService = this.emailService.getInstance();
          await emailService.send(
            templateModify,
            CREATED.client.email,
            'Nueva cita creada',
          );
        } else console.warn('template no encontrado');
      }
    } catch (error) {
      throw new Error(error.message);
    }
    return response;
  }

  private getHourEnd(appoimentDto: IADD) {
    const reservatonTimePlusOneHour = new Date(
      appoimentDto.hour.getTime() + 60 * 60 * 1000,
    );
    const hours = (reservatonTimePlusOneHour.getHours() % 12 || 12)
      .toString()
      .padStart(2, '0');
    const minutes = reservatonTimePlusOneHour
      .getMinutes()
      .toString()
      .padStart(2, '0');
    const hourEnd = `${hours}:${minutes}`;
    return hourEnd;
  }

  async findAll(
    companyId: number,
    params: any,
  ): Promise<IResponse<Appointment[]>> {
    const response: IResponse<Appointment[]> = { success: false, data: null };
    console.log('iniciando consulta findAll en AppoinmentService', {
      companyId,
    });
    const DATE_EVENT_START = new Date();
    const DATE_FORMATTED = `${DATE_EVENT_START.getFullYear().toString()}-${(
      DATE_EVENT_START.getMonth() + 1
    )
      .toString()
      .padStart(2, '0')}-${DATE_EVENT_START.getDate()
        .toString()
        .padStart(2, '0')}`;

    const startFormatted = `${DATE_FORMATTED}T00:00:00`;
    try {
      await this.appoinmentRepository.createQueryBuilder(
        `SET TimeZone = 'America/Santo_Domingo'`,
      );
      let APPOINMENTS: Appointment[] = [];
      if (params.type === 'day') {
        const formattedDate = await this.appoinmentRepository.query(
          `select to_char(now(), 'YYYY-MM-DD"T00:00:00"')`,
        );

        APPOINMENTS = await this.appoinmentRepository
          .createQueryBuilder('appointment')
          .leftJoinAndSelect('appointment.client', 'client')
          .leftJoinAndSelect('appointment.doctor', 'doctor')
          .leftJoinAndSelect('client.personalBackground', 'personalBackground')
          .leftJoinAndSelect('client.ailments', 'ailments')
          .leftJoinAndSelect('ailments.ailmentsAlerts', 'ailmentsAlerts')
          .leftJoinAndSelect('client.vital_sings', 'vital_sings')
          .leftJoinAndSelect('client.physicalExam', 'physicalExam')
          .leftJoinAndSelect(
            'client.physicalConditionObservations',
            'physicalConditionObservations',
          )
          .where('appointment.company = :companyId', { companyId: companyId })
          .andWhere('appointment.appointmentStatus = :status', {
            status: appoimentsStatus.Reservada,
          })
          .andWhere('appointment.start = :date', {
            date: formattedDate[0].to_char,
          })
          .getMany();
      }
      if (params.type === 'week') {
        const fechaInicio = `${params.fechaInicio}T00:00:00`;
        const fechaFin = `${params.fechaFin}T00:00:00`;
        // Obtener el inicio y fin de la semana
        const startDate = startOfWeek(new Date(fechaInicio));
        const endDate = endOfWeek(new Date(fechaFin));
        APPOINMENTS = await this.appoinmentRepository
          .createQueryBuilder('appointment')
          .leftJoinAndSelect('appointment.client', 'client')
          .leftJoinAndSelect('appointment.doctor', 'doctor')
          .leftJoinAndSelect('client.personalBackground', 'personalBackground')
          .leftJoinAndSelect('client.ailments', 'ailments')
          .leftJoinAndSelect('ailments.ailmentsAlerts', 'ailmentsAlerts')
          .leftJoinAndSelect('client.vital_sings', 'vital_sings')
          .leftJoinAndSelect('client.physicalExam', 'physicalExam')
          .leftJoinAndSelect(
            'client.physicalConditionObservations',
            'physicalConditionObservations',
          )
          .where('appointment.company = :companyId', { companyId: companyId })
          .andWhere('appointment.appointmentStatus = :status', {
            status: appoimentsStatus.Reservada,
          })
          .andWhere('appointment.start BETWEEN :startDate AND :endDate', {
            startDate: startDate,
            endDate: endDate,
          })
          .getMany();
      }
      if (params.type === 'month') {
        // Obtener el inicio y fin del mes
        const fechaInicio = `${params.fechaInicio}T00:00:00`;
        const fechaFin = `${params.fechaFin}T00:00:00`;
        // Obtener el inicio y fin de la semana
        const startDate = startOfMonth(new Date(fechaInicio));
        const endDate = endOfMonth(new Date(fechaFin));
        APPOINMENTS = await this.appoinmentRepository
          .createQueryBuilder('appointment')
          .leftJoinAndSelect('appointment.client', 'client')
          .leftJoinAndSelect('appointment.doctor', 'doctor')
          .leftJoinAndSelect('client.personalBackground', 'personalBackground')
          .leftJoinAndSelect('client.ailments', 'ailments')
          .leftJoinAndSelect('ailments.ailmentsAlerts', 'ailmentsAlerts')
          .leftJoinAndSelect('client.vital_sings', 'vital_sings')
          .leftJoinAndSelect('client.physicalExam', 'physicalExam')
          .leftJoinAndSelect(
            'client.physicalConditionObservations',
            'physicalConditionObservations',
          )
          .where('appointment.company = :companyId', { companyId: companyId })
          .andWhere('appointment.appointmentStatus = :status', {
            status: appoimentsStatus.Reservada,
          })
          .andWhere('appointment.start BETWEEN :startDate AND :endDate', {
            startDate: startDate,
            endDate: endDate,
          })
          .getMany();
      }
      response.data = APPOINMENTS;
      response.success = true;
      response.total = APPOINMENTS.length;
    } catch (error) {
      throw new Error(error.message);
    }
    return response;
  }

  async findAllByDoctor(
    companyId: number,
    doctorId: number,
  ): Promise<IResponse<Appointment[]>> {
    const response: IResponse<Appointment[]> = { success: false, data: null };
    const formattedDate = await this.appoinmentRepository.query(
      `select to_char(now(), 'YYYY-MM-DD"T00:00:00"')`,
    );

    if (doctorId === 0) {
      response.data = [];
      response.errors = [
        {
          message: 'debes enviar el id del doctor',
          code: 400,
          razon: 'el campo id del doctor esta vacio',
        },
      ];
      return response;
    }
    try {
      const APPOINMENTS = await this.appoinmentRepository
        .createQueryBuilder('appointment')
        .leftJoinAndSelect('appointment.client', 'client')
        .leftJoinAndSelect('appointment.doctor', 'doctor')
        .leftJoinAndSelect('client.personalBackground', 'personalBackground')
        .leftJoinAndSelect('client.ailments', 'ailments')
        .leftJoinAndSelect('ailments.ailmentsAlerts', 'ailmentsAlerts')
        .leftJoinAndSelect('client.vital_sings', 'vital_sings')
        .leftJoinAndSelect('client.physicalExam', 'physicalExam')
        .leftJoinAndSelect(
          'client.physicalConditionObservations',
          'physicalConditionObservations',
        )
        .where('appointment.company = :companyId', { companyId: companyId })
        .andWhere('appointment.appointmentStatus = :status', {
          status: appoimentsStatus.Espera,
        })
        .andWhere('appointment.start = :date', {
          date: formattedDate[0].to_char,
        })
        .andWhere('doctor.id=:doctorId', { doctorId: doctorId })
        .getMany();
      response.data = APPOINMENTS;
      response.success = true;
      response.total = APPOINMENTS.length;
    } catch (error) {
      throw new Error(error.message);
    }
    return response;
  }

  async findById(id: number): Promise<IResponse<Appointment>> {
    const response: IResponse<Appointment> = { success: false, data: null };

    try {
      const APPOINMENT = await this.appoinmentRepository.findOne({
        where: { id: id },
        relations: [
          'client',
          'doctor',
          'client.personalBackground',
          'client.ailments',
          'client.ailments.ailmentsAlerts',
          'client.vital_sings',
          'client.physicalExam',
          'client.physicalConditionObservations',
        ],
      });
      response.data = APPOINMENT;
      response.success = true;
      response.total = APPOINMENT ? 1 : 0;
    } catch (error) {
      throw new Error(error.message);
    }
    return response;
  }

  async updateReservationStatus({
    id,
    companyId,
    statusCode,
  }): Promise<IResponse<boolean>> {
    const response: IResponse<boolean> = { success: false };
    try {
      const APPOINTMENT_DB = await this.appoinmentRepository.findOne({
        where: { id, company: { id: companyId } },
      });
      if (!APPOINTMENT_DB) {
        response.errors = [
          {
            code: 0,
            message: 'No Encontrado',
            razon: 'cita no encontrada',
          },
        ];
        return response;
      }
      APPOINTMENT_DB.appointmentStatus = statusCode;
      const UPDATED = await this.appoinmentRepository.update(
        id,
        APPOINTMENT_DB,
      );
      response.data = UPDATED.affected > 0;
      response.success = true;
    } catch (error) {
      response.errors = [
        {
          code: 0,
          message: `Ocurrrio un error`,
          razon: error.message,
        },
      ];
      return response;
    }
    return response;
  }
  async updateReservationDate({
    id,
    companyId,
    newDate,
    starHour,
    updateType,
  }): Promise<IResponse<any>> {
    const response: IResponse<any> = { success: false };
    const duration = moment.duration(1, 'hour');

    try {
      let APPOINTMENT_DB = await this.appoinmentRepository.findOne({
        where: { id, company: { id: companyId } },
        relations: ['client'],
      });
      if (!APPOINTMENT_DB) {
        response.errors = [
          {
            code: 0,
            message: 'No Encontrado',
            razon: 'cita no encontrada',
          },
        ];
        return response;
      }
      if (updateType === UPDATE_TYPE.date) {
        APPOINTMENT_DB = {
          ...APPOINTMENT_DB,
          start: newDate,
          end: newDate,
        };
      }
      if (updateType === UPDATE_TYPE.hour) {
        APPOINTMENT_DB = {
          ...APPOINTMENT_DB,
          startTime: moment.utc(starHour).format('hh:mm A'),
          endTime: moment.utc(starHour).add(duration).format('hh:mm A'),
        };
      }

      const UPDATED = await this.appoinmentRepository.update(
        id,
        APPOINTMENT_DB,
      );
      await this.emailService
        .getInstance()
        .send(
          'Actualizacion de su cita',
          APPOINTMENT_DB.client.email,
          'Cita Actualizada',
        );
      response.data = UPDATED.affected > 0;
      response.success = true;
    } catch (error) {
      response.errors = [
        {
          code: 0,
          message: `Ocurrrio un error`,
          razon: error.message,
        },
      ];
    }
    return response;
  }
}
